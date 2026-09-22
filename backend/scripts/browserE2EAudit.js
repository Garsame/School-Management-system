const fs = require('fs');
const path = require('path');

const FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN || 'http://127.0.0.1:5180';
const CDP_ORIGIN = process.env.E2E_CDP_ORIGIN || 'http://127.0.0.1:9224';
const PASSWORD = process.env.E2E_PASSWORD;
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.join(require('os').tmpdir(), 'school-management-e2e');
const VIEWPORT_WIDTH = Number(process.env.E2E_VIEWPORT_WIDTH || 1440);
const VIEWPORT_HEIGHT = Number(process.env.E2E_VIEWPORT_HEIGHT || 1000);
const SKIP_ACTIONS = process.env.E2E_SKIP_ACTIONS === 'true';
const FULL_LIFECYCLE = process.env.E2E_FULL_LIFECYCLE === 'true';
const requestedRoles = new Set(
    String(process.env.E2E_JOURNEY_ROLES || '').split(',').map((value) => value.trim()).filter(Boolean)
);

if (!PASSWORD) throw new Error('Set E2E_PASSWORD before running the browser audit.');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const safeName = (value) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

class CdpPage {
    constructor(webSocketUrl) {
        this.webSocketUrl = webSocketUrl;
        this.socket = null;
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.stepErrors = [];
    }

    async connect() {
        this.socket = new WebSocket(this.webSocketUrl);
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result);
                return;
            }
            this.events.push(message);
            if (message.method === 'Runtime.exceptionThrown') {
                this.stepErrors.push({
                    type: 'javascript-exception',
                    message: message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Unknown exception'
                });
            }
            if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
                this.stepErrors.push({ type: 'console-error', message: message.params.entry.text });
            }
            if (message.method === 'Network.responseReceived') {
                const response = message.params.response;
                if (response.status >= 400) {
                    this.stepErrors.push({ type: 'http-error', status: response.status, url: response.url });
                }
            }
        });
        await Promise.all([
            this.send('Page.enable'),
            this.send('Runtime.enable'),
            this.send('Network.enable'),
            this.send('Log.enable'),
            this.send('Emulation.setDeviceMetricsOverride', {
                width: VIEWPORT_WIDTH,
                height: VIEWPORT_HEIGHT,
                deviceScaleFactor: 1,
                mobile: VIEWPORT_WIDTH < 768
            })
        ]);
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const response = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result?.value;
    }

    async navigate(route, settleMilliseconds = 800) {
        this.stepErrors = [];
        await this.send('Page.navigate', { url: `${FRONTEND_ORIGIN}${route}` });
        await this.waitFor(() => document.readyState === 'complete', 10000);
        await wait(settleMilliseconds);
    }

    async waitFor(browserPredicate, timeoutMilliseconds = 10000) {
        const source = browserPredicate.toString();
        const deadline = Date.now() + timeoutMilliseconds;
        while (Date.now() < deadline) {
            const matched = await this.evaluate(`Boolean((${source})())`).catch(() => false);
            if (matched) return true;
            await wait(150);
        }
        return false;
    }

    async setValue(selector, value, index = 0) {
        return this.evaluate(`(() => {
            const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
            if (!element) return false;
            const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
                : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
            setter.call(element, ${JSON.stringify(value)});
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
    }

    async clickText(text, selector = 'button, a') {
        return this.evaluate(`(() => {
            const match = [...document.querySelectorAll(${JSON.stringify(selector)})]
                .find((element) => element.textContent.trim().includes(${JSON.stringify(text)}));
            if (!match) return false;
            match.click();
            return true;
        })()`);
    }

    async snapshot() {
        return this.evaluate(`(() => {
            const text = document.body?.innerText || '';
            const alerts = [...document.querySelectorAll('[role="alert"], .toast, [class*="Toast"], [class*="notification"]')]
                .map((element) => element.textContent.trim()).filter(Boolean);
            const globalOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
            const invalidControls = [...document.querySelectorAll('input, select, textarea')]
                .filter((element) => !element.checkValidity()).map((element) => element.name || element.placeholder || element.type);
            return {
                url: location.href,
                title: document.title,
                heading: document.querySelector('h1')?.textContent.trim() || '',
                alerts,
                globalOverflow,
                invalidControls,
                bodyExcerpt: text.slice(0, 1200),
                unauthorized: /Unauthorized Access|Access Denied|This area is restricted|403 ACCESS DENIED/i.test(text),
                blank: text.trim().length < 20
            };
        })()`);
    }

    async screenshot(label) {
        const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const filename = path.join(OUTPUT_DIR, `${safeName(label)}.png`);
        fs.writeFileSync(filename, Buffer.from(result.data, 'base64'));
        return filename;
    }

    close() {
        this.socket?.close();
    }
}

const accountJourneys = [
    {
        role: 'platform-owner', identifier: 'owner@example.com', loginRoute: '/platform/login', expectedPath: '/platform',
        pages: [
            ['/platform', 'Platform'], ['/platform/tenants', 'School'], ['/platform/plans', 'Plan'],
            ['/platform/billing', 'Billing'], ['/platform/audit', 'Audit'], ['/platform/monitoring', 'Monitoring'],
            ['/platform/settings', 'Settings'], ['/platform/profile', 'Profile']
        ]
    },
    {
        role: 'hr', identifier: 'hr@horizonacademy.edu.so', expectedPath: '/hr',
        pages: [
            ['/hr', 'HR overview'], ['/hr/employees', 'Employees'], ['/hr/leaves', 'Leave'],
            ['/hr/payroll', 'Payroll'], ['/hr/reports', 'Payroll reports'], ['/hr/profile', 'Profile']
        ]
    },
    {
        role: 'finance', identifier: 'finance@horizonacademy.edu.so', expectedPath: '/finance',
        pages: [
            ['/finance', 'Finance'], ['/finance/policies', 'Policies'], ['/finance/fee-structures', 'Fee'],
            ['/finance/invoices', 'Invoices'], ['/finance/monthly', 'Monthly Collection'], ['/finance/payments', 'Payments'],
            ['/finance/salary-approvals', 'Salary approvals'], ['/finance/payroll-approvals', 'Payroll'],
            ['/finance/reports', 'Reports'], ['/finance/outstanding', 'Outstanding'],
            ['/finance/profile', 'Profile']
        ]
    },
    {
        role: 'cashier', identifier: 'central.cashier@horizonacademy.edu.so', expectedPath: '/cashier',
        pages: [
            ['/cashier', 'Cashier'], ['/cashier/invoices', 'Invoice Lookup'],
            ['/cashier/payments/new', 'Record Payment'], ['/cashier/payments', 'Payment'],
            ['/cashier/salary-payments', 'Payroll'], ['/cashier/profile', 'Profile']
        ]
    },
    {
        role: 'branch-admin', identifier: 'central.admin@horizonacademy.edu.so', expectedPath: '/branch',
        pages: [
            ['/branch', 'Branch'], ['/branch/classes', 'Class'], ['/branch/students', 'Students'],
            ['/branch/transfers', 'Branch Transfer'], ['/branch/promotions', 'Promotion'],
            ['/branch/staff', 'Staff'], ['/branch/exams', 'Exam'], ['/branch/results', 'Result']
        ]
    },
    {
        role: 'registrar', identifier: 'central.registrar@horizonacademy.edu.so', expectedPath: '/registrar',
        pages: [
            ['/registrar', 'Registrar'], ['/registrar/admissions', 'Admission'],
            ['/registrar/students', 'Students'], ['/registrar/attendance', 'Attendance'],
            ['/registrar/enrollments/new', 'Enrollment']
        ]
    },
    {
        role: 'teacher', identifier: 'central.teacher01@horizonacademy.edu.so', expectedPath: '/teacher',
        pages: [
            ['/teacher', 'Teacher'], ['/teacher/exams', 'Exam'], ['/teacher/results-entry', 'Result'],
            ['/teacher/schedule', 'Schedule'], ['/teacher/attendance', 'Attendance'], ['/teacher/leaves', 'Leave']
        ]
    },
    {
        role: 'parent', identifier: 'guardian.central.01@horizonacademy.edu.so', expectedPath: '/parent',
        pages: [
            ['/parent', 'Parent'], ['/parent/grades', 'Grade'], ['/parent/attendance', 'Attendance'],
            ['/parent/invoices', 'Fees & Payments'], ['/parent/profile', 'Profile']
        ]
    },
    {
        role: 'student', identifier: 'HIA-CEN-001', domain: 'horizon-academy.school', expectedPath: '/student',
        pages: [
            ['/student', 'Student'], ['/student/results', 'Result'], ['/student/rank', 'Rank'],
            ['/student/attendance', 'Attendance'], ['/student/schedule', 'Schedule'], ['/student/profile', 'Profile']
        ]
    },
    {
        role: 'super-admin', identifier: 'superadmin@horizonacademy.edu.so', expectedPath: '/tenant',
        pages: [
            ['/tenant', 'School'], ['/tenant/branding', 'Branding'], ['/tenant/branches', 'Branch'],
            ['/tenant/users', 'User'], ['/tenant/roles', 'Roles & Features'],
            ['/tenant/staff-permissions', 'Staff Permissions'], ['/tenant/academic-years', 'Academic'],
            ['/tenant/academic-policy', 'Academic Policy'], ['/tenant/attendance', 'Attendance'],
            ['/tenant/reports', 'Report'], ['/tenant/audit-logs', 'Audit']
        ]
    }
];

const main = async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const targets = await fetch(`${CDP_ORIGIN}/json`).then((response) => response.json());
    const target = targets.find((item) => item.type === 'page' && item.url.startsWith(FRONTEND_ORIGIN));
    if (!target) throw new Error(`No Chrome page found for ${FRONTEND_ORIGIN}`);

    const page = new CdpPage(target.webSocketDebuggerUrl);
    await page.connect();
    const report = { startedAt: new Date().toISOString(), frontendOrigin: FRONTEND_ORIGIN, journeys: [], actions: [] };

    const login = async (journey, accountPassword = PASSWORD) => {
        const loginRoute = journey.loginRoute || '/login';
        let lastResult = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            await page.send('Network.clearBrowserCookies');
            await page.navigate(loginRoute, 700);
            await page.evaluate(`localStorage.clear(); sessionStorage.clear(); true`);
            await page.navigate(loginRoute, 700);
            await page.waitFor(() => Boolean(document.querySelector('form input[type="password"]')), 5000);
            await page.setValue('input[type="text"], input[type="email"]', journey.identifier, 0);
            if (!journey.loginRoute) await page.setValue('input[type="text"]', journey.domain || '', 1);
            await page.setValue('input[type="password"]', accountPassword, 0);
            const formReady = await page.evaluate(`(() => {
                const identifier = document.querySelector('input[type="text"], input[type="email"]');
                const password = document.querySelector('input[type="password"]');
                return Boolean(identifier?.value === ${JSON.stringify(journey.identifier)} && password?.value === ${JSON.stringify(accountPassword)});
            })()`);
            const submitted = formReady && await page.evaluate(`(() => {
                const form = document.querySelector('form');
                if (!form) return false;
                form.requestSubmit();
                return true;
            })()`);
            const redirected = submitted && await page.waitFor(
                () => location.pathname !== '/login' && !location.pathname.endsWith('/login'),
                12000
            );
            await wait(800);
            const snapshot = await page.snapshot();
            const changePasswordRequired = redirected && new URL(snapshot.url).pathname === '/change-password';
            lastResult = {
                passed: Boolean(redirected && snapshot.url.includes(journey.expectedPath) && !snapshot.unauthorized),
                changePasswordRequired,
                expectedPath: journey.expectedPath,
                attempt,
                formReady,
                snapshot,
                errors: [...page.stepErrors]
            };
            if (lastResult.passed || changePasswordRequired) return lastResult;
        }
        return lastResult;
    };

    const loginRequired = async (journey, accountPassword = PASSWORD, { allowPasswordChange = false } = {}) => {
        const result = await login(journey, accountPassword);
        if (!result?.passed && !(allowPasswordChange && result?.changePasswordRequired)) {
            const actualPath = result?.snapshot?.url ? new URL(result.snapshot.url).pathname : 'unknown';
            throw new Error(`Verified ${journey.role} login failed; browser remained at ${actualPath}.`);
        }
        return result;
    };

    const selectOption = async (selector, { text, index = 1, elementIndex = 0 } = {}) => page.evaluate(`(() => {
        const select = document.querySelectorAll(${JSON.stringify(selector)})[${elementIndex}];
        if (!select) return false;
        const options = [...select.options];
        const option = ${text ? `options.find((item) => item.textContent.trim() === ${JSON.stringify(text)})` : `options[${index}]`};
        if (!option || !option.value) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, option.value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);

    const clickDialogButton = async (text) => page.evaluate(`(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const button = dialog && [...dialog.querySelectorAll('button')]
            .find((item) => item.textContent.trim() === ${JSON.stringify(text)} && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
    })()`);

    const completeTemporaryPasswordChange = async (temporaryPassword, expectedPath) => {
        const onChangePage = await page.waitFor(() => location.pathname === '/change-password', 3000);
        if (!onChangePage) return page.evaluate(`location.pathname.startsWith(${JSON.stringify(expectedPath)})`);
        await page.setValue('input[type="password"]', temporaryPassword, 0);
        await page.setValue('input[type="password"]', PASSWORD, 1);
        await page.setValue('input[type="password"]', PASSWORD, 2);
        const submitted = await page.evaluate(`(() => {
            const form = document.querySelector('form');
            if (!form) return false;
            form.requestSubmit();
            return true;
        })()`);
        const redirected = submitted && await page.waitFor(() => location.pathname !== '/change-password', 15000);
        if (redirected) await wait(1000);
        const reachedExpectedPath = redirected
            && await page.evaluate(`location.pathname.startsWith(${JSON.stringify(expectedPath)})`);
        return Boolean(reachedExpectedPath);
    };

    const journeysToRun = requestedRoles.size
        ? accountJourneys.filter((journey) => requestedRoles.has(journey.role))
        : accountJourneys;

    for (const journey of journeysToRun) {
        const roleResult = { role: journey.role, login: null, pages: [] };
        try {
            roleResult.login = await login(journey);
            if (roleResult.login.passed) {
                for (const [route, expectedText] of journey.pages) {
                    await page.navigate(route);
                    const snapshot = await page.snapshot();
                    const passed = !snapshot.blank && !snapshot.unauthorized && snapshot.bodyExcerpt.toLowerCase().includes(expectedText.toLowerCase());
                    roleResult.pages.push({ route, expectedText, passed, snapshot, errors: [...page.stepErrors] });
                }
                await page.navigate(journey.pages[0][0]);
                roleResult.screenshot = await page.screenshot(`${journey.role}-dashboard`);
            }
        } catch (error) {
            roleResult.fatalError = error.stack || error.message;
        }
        report.journeys.push(roleResult);
    }

    if (!SKIP_ACTIONS) {
    // HR creates a compensation request through the visible modal.
    try {
        const hr = accountJourneys.find((item) => item.role === 'hr');
        await loginRequired(hr);
        await page.navigate('/hr/employees');
        const opened = await page.clickText('Request change', 'button');
        await page.waitFor(() => Boolean(document.querySelector('[role="dialog"]')), 5000);
        const modalSnapshot = await page.snapshot();
        await page.evaluate(`(() => {
            const input = document.querySelector('[role="dialog"] input[type="number"]');
            if (!input) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(input, String(Number(input.value || 0) + 1));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
        await page.setValue('#compensation-reason', 'Browser E2E compensation approval test');
        const submitted = await page.clickText('Submit for approval', 'button');
        await wait(1200);
        const snapshot = await page.snapshot();
        report.actions.push({ name: 'HR submits compensation request', passed: Boolean(opened && submitted && !snapshot.unauthorized && !page.stepErrors.length), modalSnapshot, snapshot, errors: [...page.stepErrors] });
    } catch (error) {
        report.actions.push({ name: 'HR submits compensation request', passed: false, fatalError: error.message });
    }

    // Finance approves the request through the visible approval modal.
    try {
        const finance = accountJourneys.find((item) => item.role === 'finance');
        await loginRequired(finance);
        await page.navigate('/finance/salary-approvals');
        const opened = await page.clickText('View', 'button');
        await page.waitFor(() => Boolean(document.querySelector('[role="dialog"]')), 5000);
        const approved = await page.clickText('Approve', 'button');
        await wait(1200);
        const snapshot = await page.snapshot();
        report.actions.push({ name: 'Finance approves compensation request', passed: Boolean(opened && approved && !snapshot.unauthorized && !page.stepErrors.length), snapshot, errors: [...page.stepErrors] });
    } catch (error) {
        report.actions.push({ name: 'Finance approves compensation request', passed: false, fatalError: error.message });
    }

    // Exercise one available payroll transition for each responsible role.
    for (const [role, route, buttonText] of [
        ['hr', '/hr/payroll', 'Review'],
        ['finance', '/finance/payroll-approvals', 'Approve'],
        ['cashier', '/cashier/salary-payments', 'Mark paid']
    ]) {
        try {
            const journey = accountJourneys.find((item) => item.role === role);
            await loginRequired(journey);
            await page.navigate(route);
            let available = await page.evaluate(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim().includes(${JSON.stringify(buttonText)}))`);
            if (role === 'hr' && !available) {
                const generated = await page.clickText('Generate payroll', 'button');
                if (generated) {
                    await wait(1400);
                    available = await page.evaluate(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim().includes(${JSON.stringify(buttonText)}))`);
                }
            }
            const clicked = available ? await page.evaluate(`(() => {
                const centralRow = [...document.querySelectorAll('tbody tr')].find((row) => row.textContent.includes('Central Campus'));
                const scopedButton = centralRow && [...centralRow.querySelectorAll('button')]
                    .find((button) => button.textContent.trim().includes(${JSON.stringify(buttonText)}));
                const fallbackButton = [...document.querySelectorAll('button')]
                    .find((button) => button.textContent.trim().includes(${JSON.stringify(buttonText)}));
                const button = scopedButton || fallbackButton;
                if (!button) return false;
                button.click();
                return true;
            })()`) : false;
            await wait(clicked ? 1200 : 200);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: `${role} payroll ${buttonText}`,
                passed: Boolean(!snapshot.unauthorized && !page.stepErrors.length && (clicked || !available)),
                skipped: !available,
                reason: !available ? `No payroll row currently offered the ${buttonText} action.` : undefined,
                snapshot,
                errors: [...page.stepErrors]
            });
        } catch (error) {
            report.actions.push({ name: `${role} payroll ${buttonText}`, passed: false, fatalError: error.message });
        }
    }

    // Cashier searches an invoice and records a small payment in the isolated database.
    try {
        const cashier = accountJourneys.find((item) => item.role === 'cashier');
        await loginRequired(cashier);
        await page.navigate('/cashier/invoices');
        await page.setValue('input[placeholder="e.g. A-2024-001"]', 'HIA-2026-CEN-024');
        const searched = await page.clickText('Search', 'button');
        await wait(1000);
        const viewed = await page.clickText('View', 'button');
        await page.waitFor(() => location.pathname.startsWith('/cashier/invoices/'), 6000);
        await wait(700);
        const recordOpened = await page.clickText('Record Payment', 'button');
        await page.waitFor(() => location.pathname === '/cashier/payments/new', 6000);
        await wait(700);
        await page.setValue('input[type="number"]', '1');
        await wait(300);
        const paid = await page.evaluate(`(() => {
            const form = document.querySelector('form');
            const submitBtn = form && form.querySelector('button[type="submit"]');
            if (submitBtn && !submitBtn.disabled) { submitBtn.click(); return true; }
            return false;
        })()`);
        await wait(1500);
        const snapshot = await page.snapshot();
        report.actions.push({ name: 'Cashier searches invoice and records payment', passed: Boolean(searched && viewed && recordOpened && paid && !page.stepErrors.length), snapshot, errors: [...page.stepErrors] });
    } catch (error) {
        report.actions.push({ name: 'Cashier searches invoice and records payment', passed: false, fatalError: error.message });
    }

    // Confirm the branch transfer selector exposes only the destination class returned for the student grade.
    try {
        const branch = accountJourneys.find((item) => item.role === 'branch-admin');
        await loginRequired(branch);
        await page.navigate('/branch/transfers');
        await page.setValue('input[placeholder="Name or admission number"]', 'HIA-2026-CEN-001');
        const searched = await page.clickText('Search', 'button');
        await wait(900);
        const selected = await page.clickText('HIA-2026-CEN-001', 'button');
        await wait(300);
        const destinationSelected = await page.evaluate(`(() => {
            const select = [...document.querySelectorAll('select')].find((item) => item.previousElementSibling?.textContent.includes('Destination branch') || item.closest('label')?.textContent.includes('Destination branch'));
            if (!select || select.options.length < 2) return false;
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
            setter.call(select, select.options[1].value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
        await wait(1000);
        const classOptions = await page.evaluate(`(() => {
            const select = [...document.querySelectorAll('select')].find((item) => item.closest('label')?.textContent.includes('Destination class'));
            return select ? [...select.options].map((option) => option.textContent.trim()).filter((text) => text && !text.startsWith('Select')) : [];
        })()`);
        const snapshot = await page.snapshot();
        report.actions.push({
            name: 'Branch transfer filters destination classes by student grade',
            passed: Boolean(searched && selected && destinationSelected && classOptions.length === 1 && !page.stepErrors.length),
            classOptions,
            snapshot,
            errors: [...page.stepErrors]
        });
    } catch (error) {
        report.actions.push({ name: 'Branch transfer filters destination classes by student grade', passed: false, fatalError: error.message });
    }

    if (FULL_LIFECYCLE) {
        const lifecycle = {};
        const addLifecycleFailure = (name, error) => report.actions.push({
            name,
            scope: 'full-lifecycle',
            passed: false,
            fatalError: error.stack || error.message
        });

        // Admit a Grade 1 student and create the linked parent account through the registrar form.
        try {
            const registrar = accountJourneys.find((item) => item.role === 'registrar');
            await loginRequired(registrar);
            await page.navigate('/registrar/admissions');
            const classSelected = await selectOption('select[name="classId"]', { text: 'Grade 1' });
            await page.waitFor(() => document.querySelector('select[name="sectionId"]')?.options.length > 1, 6000);
            const sectionSelected = await selectOption('select[name="sectionId"]');
            const admissionFields = {
                firstName: 'Browser', middleName: 'E2E', lastName: 'Student', DOB: '2018-02-14',
                admissionDate: '2026-08-08', nationality: 'Somali', previousSchool: 'E2E Preparatory School',
                guardianName: 'Browser E2E Parent', guardianPhone: '+252615559999',
                guardianEmail: 'browser.e2e.parent@horizonacademy.edu.so', guardianRelationship: 'Mother',
                guardianAddress: 'Hodan, Mogadishu', emergencyName: 'E2E Emergency Contact',
                emergencyPhone: '+252615558888', medicalNotes: 'No known medical alerts'
            };
            for (const [name, value] of Object.entries(admissionFields)) {
                await page.setValue(`[name="${name}"]`, value);
            }
            const submitted = await page.evaluate(`(() => {
                const form = document.querySelector('form');
                if (!form) return false;
                form.requestSubmit();
                return true;
            })()`);
            const completed = submitted && await page.waitFor(() => document.body.innerText.includes('Admission credentials'), 15000);
            const credentials = await page.evaluate(`(() => Object.fromEntries([...document.querySelectorAll('dl > div')].map((row) => [
                row.querySelector('dt')?.textContent.trim(), row.querySelector('dd')?.textContent.trim()
            ]).filter(([key, value]) => key && value)))()`);
            const viewed = await page.clickText('View student', 'button');
            const studentRouteOpened = viewed && await page.waitFor(() => location.pathname.startsWith('/registrar/students/'), 6000);
            lifecycle.studentObjectId = studentRouteOpened
                ? await page.evaluate(`location.pathname.split('/').filter(Boolean).pop()`)
                : '';
            lifecycle.admissionNumber = credentials['Student ID'];
            lifecycle.studentLogin = credentials['Student login'];
            lifecycle.studentTemporaryPassword = credentials['Student temporary password'];
            lifecycle.parentEmail = credentials['Parent login'];
            lifecycle.parentTemporaryPassword = credentials['Parent temporary password'];
            const snapshot = await page.snapshot();
            const passed = Boolean(
                classSelected && sectionSelected && completed && studentRouteOpened && lifecycle.studentObjectId
                && lifecycle.admissionNumber && lifecycle.studentTemporaryPassword
                && lifecycle.parentEmail && lifecycle.parentTemporaryPassword
                && !snapshot.unauthorized && !page.stepErrors.length
            );
            report.actions.push({
                name: 'Registrar admits student and creates linked portal accounts',
                scope: 'full-lifecycle', passed,
                admissionNumber: lifecycle.admissionNumber,
                parentAccountCreated: Boolean(lifecycle.parentEmail),
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-admission')
            });
        } catch (error) {
            addLifecycleFailure('Registrar admits student and creates linked portal accounts', error);
        }

        // Submit live attendance from the prepared current-time timetable slot.
        try {
            const teacher = accountJourneys.find((item) => item.role === 'teacher');
            await loginRequired(teacher);
            await page.navigate('/teacher/attendance', 1200);
            const opened = await page.evaluate(`(() => {
                const button = [...document.querySelectorAll('button')]
                    .find((item) => item.textContent.includes('Take Attendance') && !item.disabled);
                if (!button) return false;
                button.click();
                return true;
            })()`);
            const sessionOpened = opened && await page.waitFor(() => /^\/teacher\/attendance\/.+/.test(location.pathname), 10000);
            await page.waitFor(() => document.querySelectorAll('tbody select').length > 0, 8000);
            const marked = await selectOption('tbody select', { text: 'Late' });
            const submitted = await page.clickText('Submit Attendance', 'button');
            const completed = submitted && await page.waitFor(() => document.body.innerText.includes('Submitted successfully'), 10000);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Teacher opens, records, and submits attendance',
                scope: 'full-lifecycle',
                passed: Boolean(sessionOpened && marked && completed && !snapshot.unauthorized && !page.stepErrors.length),
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-attendance')
            });
        } catch (error) {
            addLifecycleFailure('Teacher opens, records, and submits attendance', error);
        }

        // Each Central Campus teacher records the assigned Grade 1 subject so promotion is complete.
        try {
            const teacherRuns = [];
            for (let teacherIndex = 1; teacherIndex <= 8; teacherIndex += 1) {
                const email = `central.teacher${String(teacherIndex).padStart(2, '0')}@horizonacademy.edu.so`;
                const journey = { role: `teacher-${teacherIndex}`, identifier: email, expectedPath: '/teacher' };
                const session = await login(journey);
                await page.navigate('/teacher/results-entry', 1000);
                const classSelected = await selectOption('select', { text: 'Grade 1', elementIndex: 0 });
                await page.waitFor(() => document.querySelectorAll('select')[1]?.options.length > 1, 6000);
                const subjectSelected = await selectOption('select', { elementIndex: 1 });
                await page.waitFor(() => document.querySelectorAll('select')[2]?.options.length > 1, 6000);
                const examSelected = await selectOption('select', { elementIndex: 2 });
                const scoresLoaded = await page.waitFor(() => document.querySelectorAll('tbody input[type="number"]').length > 0, 10000);
                const scoreCount = await page.evaluate(`(() => {
                    const inputs = [...document.querySelectorAll('tbody input[type="number"]')];
                    for (const input of inputs) {
                        const max = Number(input.max || 100);
                        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                        setter.call(input, String(Math.min(75, max)));
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    return inputs.length;
                })()`);
                const saved = await page.clickText('Save Results', 'button');
                const completed = saved && await page.waitFor(() => document.body.innerText.includes('Results saved successfully'), 10000);
                teacherRuns.push({
                    email,
                    passed: Boolean(session.passed && classSelected && subjectSelected && examSelected && scoresLoaded && scoreCount > 0 && completed && !page.stepErrors.length),
                    scoreCount,
                    errors: [...page.stepErrors]
                });
            }
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Teachers record complete Grade 1 results across eight subjects',
                scope: 'full-lifecycle',
                passed: teacherRuns.length === 8 && teacherRuns.every((item) => item.passed),
                teacherRuns,
                snapshot,
                screenshot: await page.screenshot('full-lifecycle-results')
            });
        } catch (error) {
            addLifecycleFailure('Teachers record complete Grade 1 results across eight subjects', error);
        }

        // Generate the admitted student's first invoice through Finance.
        try {
            if (!lifecycle.studentObjectId) throw new Error('Admission did not return the student database identifier.');
            const finance = accountJourneys.find((item) => item.role === 'finance');
            await loginRequired(finance);
            await page.navigate('/finance/invoices/generate', 1000);
            const singleMode = await page.clickText('Single Student', 'button');
            const branchSelected = await selectOption('select', { text: 'Central Campus', elementIndex: 0 });
            const yearSelected = await selectOption('select', { text: '2025-2026', elementIndex: 1 });
            await page.setValue('input[placeholder="Enter system Student ID..."]', lifecycle.studentObjectId);
            await page.waitFor(() => document.querySelectorAll('select')[2]?.options.length > 1, 6000);
            const structureSelected = await selectOption('select', { elementIndex: 2 });
            await page.waitFor(() => document.querySelectorAll('select')[3]?.options.length > 1, 3000);
            const periodSelected = await selectOption('select', { elementIndex: 3 });
            await page.setValue('input[type="date"]', '2026-08-31');
            const generated = await page.clickText('Generate Invoices', 'button');
            const completed = generated && await page.waitFor(() => document.body.innerText.includes('Invoices Generated!'), 12000);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Finance generates the admitted student invoice',
                scope: 'full-lifecycle',
                passed: Boolean(singleMode && branchSelected && yearSelected && structureSelected && periodSelected && completed && !snapshot.unauthorized && !page.stepErrors.length),
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-invoice-generated')
            });
        } catch (error) {
            addLifecycleFailure('Finance generates the admitted student invoice', error);
        }

        // Cashier collects a payment, renders the receipt, then reverses it with a reason.
        try {
            if (!lifecycle.admissionNumber) throw new Error('Admission number is unavailable for cashier lookup.');
            const cashier = accountJourneys.find((item) => item.role === 'cashier');
            await loginRequired(cashier);
            await page.navigate('/cashier/invoices');
            await page.setValue('input[placeholder="e.g. A-2024-001"]', lifecycle.admissionNumber);
            const searched = await page.clickText('Search', 'button');
            await page.waitFor(() => document.querySelectorAll('tbody tr').length > 0, 8000);
            const viewed = await page.clickText('View', 'button');
            await page.waitFor(() => location.pathname.startsWith('/cashier/invoices/'), 6000);
            await page.waitFor(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Record Payment')), 6000);
            const recordOpened = await page.clickText('Record Payment', 'button');
            await page.waitFor(() => location.pathname === '/cashier/payments/new', 6000);
            const paymentFormReady = await page.waitFor(() => Boolean(document.querySelector('input[type="number"]')), 6000);
            const amountEntered = paymentFormReady && await page.setValue('input[type="number"]', '10');
            const amountConfirmed = amountEntered && await page.waitFor(() => document.querySelector('input[type="number"]')?.value === '10', 2000);
            const paid = await page.clickText('Confirm Payment', 'button');
            const receiptOpened = paid && await page.waitFor(() => location.pathname.startsWith('/cashier/receipts/'), 10000);
            lifecycle.paymentId = receiptOpened
                ? await page.evaluate(`location.pathname.split('/').filter(Boolean).pop()`)
                : '';
            const receiptScreenshot = await page.screenshot('full-lifecycle-payment-receipt');
            const reversalOpened = await page.clickText('Reverse Payment', 'button');
            await page.waitFor(() => Boolean(document.querySelector('textarea[placeholder*="Reason for reversal"]')), 4000);
            await page.setValue('textarea[placeholder*="Reason for reversal"]', 'Full browser E2E reversal verification');
            const reversed = await page.clickText('Confirm Reversal', 'button');
            const completed = reversed && await page.waitFor(() => document.body.innerText.includes('Amount reversed'), 10000);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Cashier records payment, opens receipt, and reverses payment',
                scope: 'full-lifecycle',
                passed: Boolean(searched && viewed && recordOpened && paymentFormReady && amountConfirmed && receiptOpened && lifecycle.paymentId && reversalOpened && completed && !snapshot.unauthorized && !page.stepErrors.length),
                paymentId: lifecycle.paymentId,
                receiptScreenshot,
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-payment-reversed')
            });
        } catch (error) {
            addLifecycleFailure('Cashier records payment, opens receipt, and reverses payment', error);
        }

        // Verify the newly created parent account and forced password-change workflow.
        try {
            if (!lifecycle.parentEmail || !lifecycle.parentTemporaryPassword) throw new Error('Parent temporary credentials are unavailable.');
            const parentJourney = { role: 'new-parent', identifier: lifecycle.parentEmail, expectedPath: '/parent' };
            await loginRequired(parentJourney, lifecycle.parentTemporaryPassword, { allowPasswordChange: true });
            const passwordChanged = await completeTemporaryPasswordChange(lifecycle.parentTemporaryPassword, '/parent');
            await page.navigate('/parent/invoices', 1000);
            const childVisible = await page.waitFor(() => document.body.innerText.includes('Browser'), 8000);
            const invoiceVisible = await page.waitFor(() => document.body.innerText.includes('Invoice #'), 4000);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'New parent changes password and views child fees',
                scope: 'full-lifecycle',
                passed: Boolean(passwordChanged && childVisible && invoiceVisible && !snapshot.unauthorized && !page.stepErrors.length),
                parentEmail: lifecycle.parentEmail,
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-parent-fees')
            });
        } catch (error) {
            addLifecycleFailure('New parent changes password and views child fees', error);
        }

        // Verify the newly created student account and forced password-change workflow.
        try {
            if (!lifecycle.studentLogin || !lifecycle.studentTemporaryPassword) throw new Error('Student temporary credentials are unavailable.');
            const studentJourney = {
                role: 'new-student', identifier: lifecycle.studentLogin,
                domain: 'horizon-academy.school', expectedPath: '/student'
            };
            await loginRequired(studentJourney, lifecycle.studentTemporaryPassword, { allowPasswordChange: true });
            const passwordChanged = await completeTemporaryPasswordChange(lifecycle.studentTemporaryPassword, '/student');
            await page.navigate('/student/results', 1000);
            const resultState = await page.evaluate(`(() => ({
                heading: document.querySelector('h1')?.textContent.trim() || '',
                studentVisible: document.body.innerText.includes('Browser Student'),
                subjectRows: document.querySelectorAll('tbody tr').length
            }))()`);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'New student changes password and views results',
                scope: 'full-lifecycle',
                passed: Boolean(passwordChanged && resultState.heading === 'Results' && resultState.studentVisible && resultState.subjectRows >= 8 && !snapshot.unauthorized && !page.stepErrors.length),
                admissionNumber: lifecycle.admissionNumber,
                resultState,
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-student-results')
            });
        } catch (error) {
            addLifecycleFailure('New student changes password and views results', error);
        }

        // Submit the actual same-grade cross-branch transfer through its confirmation dialog.
        try {
            if (!lifecycle.admissionNumber) throw new Error('Admission number is unavailable for transfer.');
            const branch = accountJourneys.find((item) => item.role === 'branch-admin');
            await loginRequired(branch);
            await page.navigate('/branch/transfers');
            await page.setValue('input[placeholder="Name or admission number"]', lifecycle.admissionNumber);
            const searched = await page.clickText('Search', 'button');
            await page.waitFor(() => document.body.innerText.includes(lifecycle.admissionNumber), 6000);
            const selected = await page.clickText(lifecycle.admissionNumber, 'button');
            const destinationSelected = await selectOption('select', { elementIndex: 0 });
            lifecycle.destinationBranchId = await page.evaluate(`document.querySelectorAll('select')[0]?.value || ''`);
            await page.waitFor(() => document.querySelectorAll('select')[1]?.options.length > 1, 6000);
            const classSelected = await selectOption('select', { elementIndex: 1 });
            await page.waitFor(() => document.querySelectorAll('select')[2]?.options.length > 1, 6000);
            const sectionSelected = await selectOption('select', { elementIndex: 2 });
            await page.setValue('input[placeholder="Reason for transfer"]', 'Family relocation verified by full browser E2E');
            const submitted = await page.clickText('Transfer student', 'button');
            await page.waitFor(() => Boolean(document.querySelector('[role="dialog"]')), 4000);
            const confirmed = await clickDialogButton('Transfer student');
            const completed = confirmed && await page.waitFor(() => document.body.innerText.includes('Transfer complete'), 12000);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Branch Admin submits same-grade branch transfer',
                scope: 'full-lifecycle',
                passed: Boolean(searched && selected && destinationSelected && classSelected && sectionSelected && submitted && completed && !snapshot.unauthorized && !page.stepErrors.length),
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-transfer-complete')
            });
        } catch (error) {
            addLifecycleFailure('Branch Admin submits same-grade branch transfer', error);
        }

        // Confirm that the transferred student's portal resolves the destination branch.
        try {
            const studentJourney = {
                role: 'new-student', identifier: lifecycle.studentLogin,
                domain: 'horizon-academy.school', expectedPath: '/student'
            };
            const session = await login(studentJourney);
            await page.navigate('/student/profile', 1000);
            const sessionBranchId = await page.evaluate(`(() => {
                try { return JSON.parse(localStorage.getItem('user') || '{}').branchId || ''; }
                catch { return ''; }
            })()`);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Transferred student portal resolves destination branch',
                scope: 'full-lifecycle',
                passed: Boolean(session.passed && lifecycle.destinationBranchId && sessionBranchId === lifecycle.destinationBranchId && !snapshot.unauthorized && !page.stepErrors.length),
                destinationBranchUpdated: Boolean(lifecycle.destinationBranchId && sessionBranchId === lifecycle.destinationBranchId),
                snapshot, errors: [...page.stepErrors]
            });
        } catch (error) {
            addLifecycleFailure('Transferred student portal resolves destination branch', error);
        }

        // Create the immediate next academic year through the Super Admin modal.
        try {
            const superAdmin = accountJourneys.find((item) => item.role === 'super-admin');
            await loginRequired(superAdmin);
            await page.navigate('/tenant/academic-years');
            const opened = await page.clickText('INITIALIZE SESSION', 'button');
            await page.waitFor(() => Boolean(document.querySelector('input[placeholder="2023-2024 Academic Year"]')), 4000);
            await page.setValue('input[placeholder="2023-2024 Academic Year"]', '2026-2027');
            await page.setValue('input[type="date"]', '2026-09-01', 0);
            await page.setValue('input[type="date"]', '2027-06-30', 1);
            const created = await page.clickText('CONFIRM TIMELINE', 'button');
            const completed = created && await page.waitFor(() => document.body.innerText.includes('2026-2027'), 10000);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Super Admin creates the next academic year',
                scope: 'full-lifecycle',
                passed: Boolean(opened && completed && !snapshot.unauthorized && !page.stepErrors.length),
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-next-academic-year')
            });
        } catch (error) {
            addLifecycleFailure('Super Admin creates the next academic year', error);
        }

        // Promote the now fully graded Grade 1 cohort into the next academic year.
        try {
            const branch = accountJourneys.find((item) => item.role === 'branch-admin');
            await loginRequired(branch);
            await page.navigate('/branch/promotions', 1000);
            const started = await page.clickText('Run Promotion Cycle', 'button');
            await page.waitFor(() => Boolean(document.querySelector('[role="dialog"]')), 4000);
            const confirmed = await clickDialogButton('Promote');
            const completed = confirmed && await page.waitFor(() => document.body.innerText.includes('Promotion outcome'), 20000);
            const outcome = await page.evaluate(`(() => Object.fromEntries(['Promoted', 'Retained', 'Incomplete', 'Already enrolled'].map((label) => {
                const labelNode = [...document.querySelectorAll('p')].find((node) => node.textContent.trim() === label);
                const valueNode = labelNode?.parentElement?.querySelector('p:first-child');
                return [label, Number(valueNode?.textContent.trim() || 0)];
            })))()`);
            const snapshot = await page.snapshot();
            report.actions.push({
                name: 'Branch Admin promotes the fully graded Grade 1 cohort',
                scope: 'full-lifecycle',
                passed: Boolean(started && completed && outcome.Promoted >= 2 && !snapshot.unauthorized && !page.stepErrors.length),
                outcome,
                snapshot, errors: [...page.stepErrors],
                screenshot: await page.screenshot('full-lifecycle-promotion-outcome')
            });
        } catch (error) {
            addLifecycleFailure('Branch Admin promotes the fully graded Grade 1 cohort', error);
        }
    }
    }

    report.completedAt = new Date().toISOString();
    report.summary = {
        loginPassed: report.journeys.filter((item) => item.login?.passed).length,
        loginTotal: report.journeys.length,
        pagePassed: report.journeys.flatMap((item) => item.pages).filter((item) => item.passed).length,
        pageTotal: report.journeys.flatMap((item) => item.pages).length,
        actionPassed: report.actions.filter((item) => item.passed).length,
        actionTotal: report.actions.length,
        actionSkipped: report.actions.filter((item) => item.skipped).length
    };

    const reportPath = path.join(OUTPUT_DIR, 'browser-e2e-results.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ reportPath, summary: report.summary }, null, 2));
    page.close();
};

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { CdpPage, wait };
