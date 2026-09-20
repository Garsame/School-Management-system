const fs = require('fs');
const path = require('path');
const { CdpPage, wait } = require('./browserE2EAudit');

const FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN || 'http://127.0.0.1:5180';
const CDP_ORIGIN = process.env.E2E_CDP_ORIGIN || 'http://127.0.0.1:9224';
const PASSWORD = process.env.E2E_PASSWORD;
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.join(require('os').tmpdir(), 'cashier-reversal-e2e');

if (!PASSWORD) throw new Error('Set E2E_PASSWORD before running the cashier reversal check.');

const main = async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const targets = await fetch(`${CDP_ORIGIN}/json`).then((response) => response.json());
    const target = targets.find((item) => item.type === 'page' && item.url.startsWith(FRONTEND_ORIGIN));
    if (!target) throw new Error(`No Chrome page found for ${FRONTEND_ORIGIN}.`);

    const page = new CdpPage(target.webSocketDebuggerUrl);
    await page.connect();
    const report = { startedAt: new Date().toISOString(), scenario: 'cashier-payment-reversal' };

    try {
        await page.send('Network.clearBrowserCookies');
        await page.navigate('/login');
        await page.evaluate('localStorage.clear(); sessionStorage.clear(); true');
        await page.navigate('/login');
        await page.waitFor(() => Boolean(document.querySelector('form input[type="password"]')), 5000);
        await page.setValue('input[type="text"], input[type="email"]', 'central.cashier@horizonacademy.edu.so', 0);
        await page.setValue('input[type="text"]', 'horizon-academy.school', 1);
        await page.setValue('input[type="password"]', PASSWORD, 0);
        const submittedLogin = await page.evaluate(`(() => {
            const form = document.querySelector('form');
            if (!form) return false;
            form.requestSubmit();
            return true;
        })()`);
        const loggedIn = submittedLogin && await page.waitFor(() => location.pathname.startsWith('/cashier'), 12000);
        if (!loggedIn) throw new Error('Cashier login did not reach the cashier portal.');

        await page.navigate('/cashier/invoices');
        const searchFormReady = await page.waitFor(
            () => Boolean(document.querySelector('input[placeholder="e.g. A-2024-001"]')),
            6000
        );
        const searchEntered = searchFormReady
            && await page.setValue('input[placeholder="e.g. A-2024-001"]', 'HIA-2026-CEN-024');
        const searched = searchEntered && await page.clickText('Search', 'button');
        await page.waitFor(() => document.querySelectorAll('tbody tr').length > 0, 8000);
        const viewed = await page.clickText('View', 'button');
        const invoiceOpened = viewed && await page.waitFor(() => location.pathname.startsWith('/cashier/invoices/'), 6000);
        await page.waitFor(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Record Payment')), 6000);
        const recordOpened = await page.clickText('Record Payment', 'button');
        const paymentPageOpened = recordOpened && await page.waitFor(() => location.pathname === '/cashier/payments/new', 6000);
        const paymentFormReady = paymentPageOpened && await page.waitFor(() => Boolean(document.querySelector('input[type="number"]')), 6000);
        const amountEntered = paymentFormReady && await page.setValue('input[type="number"]', '1');
        const amountConfirmed = amountEntered && await page.waitFor(() => document.querySelector('input[type="number"]')?.value === '1', 2000);
        const paid = amountConfirmed && await page.clickText('Confirm Payment', 'button');
        const receiptOpened = paid && await page.waitFor(() => location.pathname.startsWith('/cashier/receipts/'), 12000);
        const paymentId = receiptOpened ? await page.evaluate(`location.pathname.split('/').filter(Boolean).pop()`) : '';

        const reversalButtonReady = receiptOpened && await page.waitFor(
            () => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Reverse Payment')),
            6000
        );
        const reversalOpened = reversalButtonReady && await page.clickText('Reverse Payment', 'button');
        const reversalFormReady = reversalOpened && await page.waitFor(
            () => Boolean(document.querySelector('textarea[placeholder*="Reason for reversal"]')),
            4000
        );
        if (reversalFormReady) {
            await page.setValue('textarea[placeholder*="Reason for reversal"]', 'Targeted browser regression verification');
        }
        const reversed = reversalFormReady && await page.clickText('Confirm Reversal', 'button');
        const refreshedReceipt = reversed && await page.waitFor(
            () => document.body.innerText.includes('Amount reversed') && document.body.innerText.includes('(Reversed)'),
            12000
        );
        await wait(500);
        const snapshot = await page.snapshot();
        const passed = Boolean(
            searchFormReady && searched && invoiceOpened && paymentFormReady && amountConfirmed && paymentId
            && reversalButtonReady && reversalOpened && refreshedReceipt && !snapshot.unauthorized && !page.stepErrors.length
        );

        report.completedAt = new Date().toISOString();
        report.passed = passed;
        report.paymentId = paymentId;
        report.snapshot = snapshot;
        report.errors = [...page.stepErrors];
        report.screenshot = await page.screenshot('cashier-reversed-receipt');
        if (!passed) throw new Error('Cashier reversal browser assertions did not all pass.');
    } finally {
        const reportPath = path.join(OUTPUT_DIR, 'cashier-reversal-results.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ reportPath, passed: report.passed, paymentId: report.paymentId }, null, 2));
        page.close();
    }
};

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
