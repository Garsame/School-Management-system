/**
 * configureSchool.js — automated & step-by-step school configuration script.
 *
 * Runs through the live HTTP API as the school's Super Admin and assigned staff.
 * Safe for production: does not wipe or mutate other tenants.
 *
 * Usage:
 *   node backend/scripts/configureSchool.js --api https://kingsschools.onepercenttech.com/api --email admin@example.com --password YourPassword --all
 *
 * Or step by step:
 *   node backend/scripts/configureSchool.js --step roles
 *   node backend/scripts/configureSchool.js --step year
 *   node backend/scripts/configureSchool.js --step staff
 *   node backend/scripts/configureSchool.js --step academics
 *   node backend/scripts/configureSchool.js --step dugsi
 *   node backend/scripts/configureSchool.js --step fees
 */

const fs = require('fs');
const path = require('path');

// Parse CLI Arguments
const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};
const hasFlag = (flag) => args.includes(flag);

const API_BASE = getArg('--api', process.env.API_URL || 'https://kingsschools.onepercenttech.com/api');
const ADMIN_EMAIL = getArg('--email', process.env.ADMIN_EMAIL || '');
const ADMIN_PASSWORD = getArg('--password', process.env.ADMIN_PASSWORD || '');
const TARGET_STEP = getArg('--step', hasFlag('--all') ? 'all' : 'help');
const STAFF_PASSWORD = getArg('--staff-password', process.env.STAFF_PASSWORD || 'Kings#2026!Secure');

class ApiSession {
    constructor(label) {
        this.label = label;
        this.cookies = new Map();
        this.user = null;
    }

    get cookieHeader() {
        return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    absorb(response) {
        const raw = typeof response.headers.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : [response.headers.get('set-cookie')].filter(Boolean);
        for (const entry of raw) {
            const [pair] = entry.split(';');
            const idx = pair.indexOf('=');
            if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
        }
    }

    async request(method, endpoint, body) {
        const url = API_BASE.replace(/\/$/, '') + (endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
        const headers = {
            'Content-Type': 'application/json',
            ...(this.cookies.size ? { Cookie: this.cookieHeader } : {})
        };
        const res = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        this.absorb(res);
        const text = await res.text();
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        if (!res.ok) {
            const msg = json?.message || json?.error || (typeof json === 'string' ? json : JSON.stringify(json));
            throw new Error(`[${res.status}] ${method} ${endpoint} -> ${msg}`);
        }
        return json;
    }

    get(path) { return this.request('GET', path); }
    post(path, body) { return this.request('POST', path, body); }
    put(path, body) { return this.request('PUT', path, body); }
    patch(path, body) { return this.request('PATCH', path, body); }
    del(path) { return this.request('DELETE', path); }
}

const unwrap = (res) => (res && typeof res === 'object' && 'data' in res ? res.data : res);

async function loginUser(email, password, endpoint = '/tenant/auth/login') {
    const session = new ApiSession(email);
    const res = await session.post(endpoint, { email, password });
    session.user = unwrap(res)?.user || unwrap(res);
    return session;
}

// ─────────────────────────────────────────────────────────────
// Default Configuration Blueprint
// ─────────────────────────────────────────────────────────────

const CONFIG = {
    academicYear: {
        name: '2026/2027',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        terms: [
            { name: 'Term 1', sequence: 1, startDate: '2026-09-01', endDate: '2026-12-15' },
            { name: 'Term 2', sequence: 2, startDate: '2027-01-05', endDate: '2027-03-25' },
            { name: 'Term 3', sequence: 3, startDate: '2027-04-05', endDate: '2027-06-30' }
        ]
    },
    roles: {
        super_admin: {
            name: 'Super Admin',
            description: 'Head of School: Full access and whole-school configuration.',
            addPermissions: [
                'branch.promotions.run', 'branch.transfers.run',
                'attendance.oversight.view', 'attendance.oversight.manage',
                'dugsi.overview.view', 'dugsi.classes.assign',
                'payroll.approve', 'payroll.view'
            ]
        },
        finance_director: {
            name: 'Finance Officer',
            description: 'Finance & Cashier: Fee policies, billing, payments, receipts, and salary payouts.',
            addPermissions: [
                'cashier.dashboard.view', 'cashier.invoices.search', 'cashier.invoices.detail',
                'cashier.payments.view', 'cashier.payments.create', 'cashier.payments.reverse',
                'cashier.receipts.view', 'cashier.receipts.print',
                'payroll.pay', 'payroll.view',
                'students.view', 'students.detail'
            ]
        },
        registrar: {
            name: 'Admissions Officer',
            description: 'Admissions, student records, class structure, and attendance oversight.',
            addPermissions: [
                'branch.classes.create', 'branch.classes.update',
                'branch.sections.manage', 'branch.subjects.manage',
                'branch.results.view', 'branch.timetable.view',
                'branch.promotions.run', 'branch.transfers.run',
                'attendance.oversight.view', 'attendance.oversight.manage'
            ]
        },
        hr_payroll_manager: {
            name: 'HR Manager',
            description: 'Staff profiles, leaves management, and monthly payroll preparation.',
            addPermissions: ['payroll.view', 'payroll.generate', 'payroll.review', 'hr.leaves.review']
        },
        teacher: {
            name: 'Academic Teacher',
            description: 'Classes, attendance, teaching schedules, and exam results.',
            addPermissions: []
        },
        dugsi_teacher: {
            name: 'Macallin Dugsi',
            description: 'Quran Dugsi circle, daily register, and Quran reading/memorization progress.',
            addPermissions: [
                'dugsi.students.view', 'dugsi.students.manage',
                'dugsi.attendance.take', 'dugsi.progress.manage',
                'hr.leaves.create'
            ]
        },
        // Unused roles in 1-branch setup
        deactivate: ['branch_admin', 'cashier']
    },
    staff: [
        {
            role: 'finance_director',
            scope: 'tenant',
            name: 'Finance Officer',
            handle: 'finance',
            jobTitle: 'Finance Officer',
            department: 'Finance',
            basicSalary: 1000
        },
        {
            role: 'hr_payroll_manager',
            scope: 'tenant',
            name: 'HR Manager',
            handle: 'hr',
            jobTitle: 'HR Manager',
            department: 'Human Resources',
            basicSalary: 900
        },
        {
            role: 'registrar',
            scope: 'branch',
            name: 'Admissions Officer',
            handle: 'admissions',
            jobTitle: 'Admissions Officer',
            department: 'Admissions',
            basicSalary: 750
        },
        {
            role: 'dugsi_teacher',
            scope: 'branch',
            name: 'Macallin Dugsi',
            handle: 'dugsi',
            jobTitle: 'Quran Dugsi Teacher',
            department: 'Islamic Studies',
            basicSalary: 600
        },
        {
            role: 'teacher',
            scope: 'branch',
            name: 'Teacher Ahmed',
            handle: 'ahmed.teacher',
            jobTitle: 'Academic Teacher',
            department: 'Academic',
            basicSalary: 600
        }
    ],
    categories: [
        { name: 'Primary', description: 'Grades 1 to 6' },
        { name: 'Middle & Secondary', description: 'Grades 7 to 12' }
    ],
    classes: [
        { name: 'Grade 1', gradeLevel: 1, categoryName: 'Primary', sections: ['A', 'B'], monthlyFee: 45 },
        { name: 'Grade 2', gradeLevel: 2, categoryName: 'Primary', sections: ['A', 'B'], monthlyFee: 45 },
        { name: 'Grade 3', gradeLevel: 3, categoryName: 'Primary', sections: ['A', 'B'], monthlyFee: 50 },
        { name: 'Grade 4', gradeLevel: 4, categoryName: 'Primary', sections: ['A'], monthlyFee: 55 },
        { name: 'Grade 5', gradeLevel: 5, categoryName: 'Primary', sections: ['A'], monthlyFee: 60 },
        { name: 'Grade 6', gradeLevel: 6, categoryName: 'Primary', sections: ['A'], monthlyFee: 65 }
    ],
    subjects: [
        ['Mathematics', 'MATH'],
        ['English Language', 'ENG'],
        ['Science', 'SCI'],
        ['Social Studies', 'SOC'],
        ['Somali Language', 'SOM'],
        ['Islamic Studies', 'ISL'],
        ['Arabic Language', 'ARB']
    ]
};

// ─────────────────────────────────────────────────────────────
// Step Implementations
// ─────────────────────────────────────────────────────────────

async function stepRoles(adminSession) {
    console.log('\n🔵 STEP 1: Configuring Roles & Features...');
    const rolesRes = await adminSession.get('/tenant/roles');
    const roles = unwrap(rolesRes);
    const byKey = new Map(roles.map((r) => [r.key, r]));

    // 1. Update and enable active roles
    for (const [key, plan] of Object.entries(CONFIG.roles)) {
        if (key === 'deactivate') continue;
        const role = byKey.get(key);
        if (!role) {
            console.log(`  ⚠️  Role key ${key} not found on server.`);
            continue;
        }
        const combinedPerms = [...new Set([...(role.permissions || []), ...(plan.addPermissions || [])])];
        await adminSession.put(`/tenant/roles/${role._id}`, {
            name: plan.name,
            description: plan.description,
            isActive: true,
            permissions: combinedPerms
        });
        console.log(`  ✅ Role [${key}] updated to "${plan.name}" (${combinedPerms.length} permissions)`);
    }

    // 2. Deactivate unused roles
    for (const key of CONFIG.roles.deactivate) {
        const role = byKey.get(key);
        if (role && role.isActive) {
            try {
                await adminSession.put(`/tenant/roles/${role._id}`, {
                    name: role.name,
                    description: role.description,
                    isActive: false,
                    permissions: role.permissions
                });
                console.log(`  ⏸️  Unused role [${key}] deactivated.`);
            } catch (err) {
                console.log(`  ℹ️  Could not deactivate [${key}]: ${err.message}`);
            }
        }
    }
}

async function stepAcademicYear(adminSession) {
    console.log('\n🔵 STEP 2: Creating Academic Year...');
    const yearsRes = await adminSession.get('/tenant/academic-years');
    const existingYears = unwrap(yearsRes) || [];
    let year = existingYears.find((y) => y.name === CONFIG.academicYear.name);

    if (!year) {
        const created = await adminSession.post('/tenant/academic-years', {
            name: CONFIG.academicYear.name,
            startDate: CONFIG.academicYear.startDate,
            endDate: CONFIG.academicYear.endDate
        });
        year = unwrap(created);
        console.log(`  ✅ Academic Year "${year.name}" created.`);
    } else {
        console.log(`  ℹ️ Academic Year "${year.name}" already exists.`);
    }

    // Set as current
    if (!year.isCurrent) {
        await adminSession.patch(`/tenant/academic-years/${year._id}/set-current`);
        console.log(`  ✅ Academic Year "${year.name}" marked as CURRENT.`);
    }

    // Add Terms
    for (const term of CONFIG.academicYear.terms) {
        try {
            await adminSession.post(`/tenant/academic-years/${year._id}/terms`, term);
            console.log(`  ✅ Term added: ${term.name}`);
        } catch (err) {
            console.log(`  ℹ️ Term ${term.name}: ${err.message}`);
        }
    }

    return year;
}

async function stepStaff(adminSession) {
    console.log('\n🔵 STEP 3: Creating Staff Accounts...');
    const branchesRes = await adminSession.get('/tenant/branches');
    const branches = unwrap(branchesRes);
    const branch = branches[0];
    if (!branch) throw new Error('No active branch found in school!');

    const domain = ADMIN_EMAIL.includes('@') ? ADMIN_EMAIL.split('@')[1] : 'kingsschools.com';
    const existingUsersRes = await adminSession.get('/tenant/users?category=all_staff');
    const existingUsers = unwrap(existingUsersRes) || [];

    for (const member of CONFIG.staff) {
        const email = `${member.handle}@${domain}`;
        const exists = existingUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (exists) {
            console.log(`  ℹ️ Staff member ${member.name} (${email}) already exists.`);
            continue;
        }

        const payload = {
            name: member.name,
            email,
            password: STAFF_PASSWORD,
            role: member.role,
            scope: member.scope,
            ...(member.scope === 'branch' ? { branchId: branch._id } : {}),
            employmentInfo: {
                jobTitle: member.jobTitle,
                department: member.department,
                employmentType: 'Permanent',
                hireDate: '2026-09-01',
                basicSalary: member.basicSalary || 600,
                currency: 'USD',
                paymentMethod: 'Cash'
            }
        };

        try {
            await adminSession.post('/tenant/users', payload);
            console.log(`  ✅ Created ${member.jobTitle.padEnd(20)} -> ${email}`);
        } catch (err) {
            console.log(`  ❌ Failed to create ${email}: ${err.message}`);
        }
    }
}

async function stepAcademics(adminSession) {
    console.log('\n🔵 STEP 4: Creating Categories, Classes, Sections & Subjects...');
    const domain = ADMIN_EMAIL.includes('@') ? ADMIN_EMAIL.split('@')[1] : 'kingsschools.com';
    const admissionsEmail = `admissions@${domain}`;

    // Log in as Admissions Officer
    let admissionsSession;
    try {
        admissionsSession = await loginUser(admissionsEmail, STAFF_PASSWORD);
        console.log(`  🔑 Authenticated as Admissions Officer (${admissionsEmail}) for academic setup.`);
    } catch (err) {
        console.log('  ⚠️ Admissions login failed, falling back to Super Admin credentials.');
        admissionsSession = adminSession;
    }

    // 1. Create Class Categories
    const categoriesMap = new Map();
    for (const cat of CONFIG.categories) {
        try {
            const created = await admissionsSession.post('/branch/class-categories', cat);
            const data = unwrap(created);
            categoriesMap.set(cat.name, data._id);
            console.log(`  ✅ Category created: ${cat.name}`);
        } catch (err) {
            // Check existing
            try {
                const list = unwrap(await admissionsSession.get('/branch/class-categories'));
                const found = (list || []).find((c) => c.name === cat.name);
                if (found) categoriesMap.set(cat.name, found._id);
            } catch {}
            console.log(`  ℹ️ Category ${cat.name}: ${err.message}`);
        }
    }

    // 2. Create Classes & Sections
    const existingClasses = unwrap(await admissionsSession.get('/branch/classes')) || [];
    for (const item of CONFIG.classes) {
        let cls = existingClasses.find((c) => c.name === item.name);
        const categoryId = categoriesMap.get(item.categoryName) || Array.from(categoriesMap.values())[0];

        if (!cls) {
            try {
                const created = await admissionsSession.post('/branch/classes', {
                    name: item.name,
                    gradeLevel: item.gradeLevel,
                    categoryId
                });
                cls = unwrap(created);
                console.log(`  ✅ Class created: ${item.name}`);
            } catch (err) {
                console.log(`  ❌ Class ${item.name}: ${err.message}`);
                continue;
            }
        } else {
            console.log(`  ℹ️ Class ${item.name} already exists.`);
        }

        // Add Sections
        for (const secName of item.sections) {
            try {
                await admissionsSession.post(`/branch/classes/${cls._id}/sections`, { name: secName });
                console.log(`     ↳ Section ${secName} added to ${item.name}`);
            } catch (err) {
                // Ignore duplicate section error
            }
        }
    }

    // 3. Create Subjects
    for (const [subjName, code] of CONFIG.subjects) {
        try {
            await admissionsSession.post('/branch/subjects', { name: subjName, code });
            console.log(`  ✅ Subject created: ${subjName} (${code})`);
        } catch (err) {
            console.log(`  ℹ️ Subject ${subjName}: ${err.message}`);
        }
    }
}

async function stepDugsi(adminSession) {
    console.log('\n🔵 STEP 5: Allocating Classes to Macallin Dugsi...');
    const allocRes = await adminSession.get('/dugsi/admin/allocations');
    const allocData = unwrap(allocRes) || {};
    const teachers = allocData.teachers || [];
    const availableClasses = allocData.availableClasses || [];

    let dugsiTeacher = teachers.find((u) => u.role === 'dugsi_teacher');
    if (!dugsiTeacher) {
        const usersRes = await adminSession.get('/tenant/users?category=all_staff');
        const users = unwrap(usersRes) || [];
        dugsiTeacher = users.find((u) => u.role === 'dugsi_teacher');
    }

    if (!dugsiTeacher) {
        console.log('  ⚠️ No Macallin Dugsi account found. Run the "staff" step first.');
        return;
    }

    if (!availableClasses.length) {
        console.log('  ⚠️ No classes found. Run the "academics" step first.');
        return;
    }

    try {
        await adminSession.post('/dugsi/admin/allocate-classes', {
            teacherUserId: dugsiTeacher._id,
            classIds: availableClasses.map((c) => c._id)
        });
        console.log(`  ✅ Allocated ${availableClasses.length} classes to Macallin Dugsi (${dugsiTeacher.name}).`);
    } catch (err) {
        console.log(`  ℹ️ Dugsi Allocation: ${err.message}`);
    }
}

async function stepFees(adminSession) {
    console.log('\n🔵 STEP 6: Configuring Finance Policies & Monthly Fee Structures...');
    const domain = ADMIN_EMAIL.includes('@') ? ADMIN_EMAIL.split('@')[1] : 'kingsschools.com';
    const financeEmail = `finance@${domain}`;

    let financeSession;
    try {
        financeSession = await loginUser(financeEmail, STAFF_PASSWORD);
        console.log(`  🔑 Authenticated as Finance Officer (${financeEmail}).`);
    } catch (err) {
        console.log('  ⚠️ Finance login failed, falling back to Super Admin.');
        financeSession = adminSession;
    }

    const branchesRes = await adminSession.get('/tenant/branches');
    const branch = unwrap(branchesRes)[0];
    const yearsRes = await adminSession.get('/tenant/academic-years');
    const currentYear = (unwrap(yearsRes) || []).find((y) => y.isCurrent);
    
    // Available classes from tenant-scoped endpoint
    const allocRes = await adminSession.get('/dugsi/admin/allocations');
    const allocData = unwrap(allocRes) || {};
    const classes = allocData.availableClasses || [];

    if (!currentYear) throw new Error('No current academic year found!');

    // 1. Set Policy Due Day
    try {
        await financeSession.put('/tenant/finance/policies', {
            dueDay: 10
        });
        console.log('  ✅ Finance Policy updated: Due Day set to 10th of every month.');
    } catch (err) {
        console.log(`  ℹ️ Policy setup: ${err.message}`);
    }

    // 2. Create Monthly Fee Structures per Class
    for (const cls of classes) {
        const item = CONFIG.classes.find((c) => c.name === cls.name);
        const monthlyTotal = item ? item.monthlyFee : 50;

        try {
            await financeSession.post('/tenant/finance/fee-structures', {
                name: `${cls.name} Monthly Fee`,
                branchId: branch._id,
                classId: cls._id,
                targetType: 'CLASS',
                academicYearId: currentYear._id,
                feeItems: [
                    { name: 'Tuition Fee', amount: monthlyTotal - 10 },
                    { name: 'Learning Materials', amount: 6 },
                    { name: 'Activities & Facilities', amount: 4 }
                ]
            });
            console.log(`  ✅ Fee Structure created for ${cls.name}: $${monthlyTotal}/month`);
        } catch (err) {
            console.log(`  ℹ️ Fee Structure for ${cls.name}: ${err.message}`);
        }
    }
}

function printHelp() {
    console.log(`
=============================================================================
  MadrasaHub School Auto-Configuration CLI
=============================================================================

Usage:
  node backend/scripts/configureSchool.js [options]

Options:
  --api <url>              API Base URL (Default: https://kingsschools.onepercenttech.com/api)
  --email <email>          Super Admin email address (Required)
  --password <pass>        Super Admin password (Required)
  --staff-password <pass>  Initial password for new staff accounts (Default: Kings#2026!Secure)
  --all                    Run all configuration steps sequentially
  --step <step_name>       Run one single step:
                             • roles     -> Rename and assign features to roles
                             • year      -> Create Academic Year and Terms
                             • staff     -> Create Finance, HR, Admission & Teacher accounts
                             • academics -> Create Categories, Classes, Sections & Subjects
                             • dugsi     -> Allocate classes to Macallin Dugsi
                             • fees      -> Set Due Day and monthly fee structures

Examples:
  node backend/scripts/configureSchool.js --email admin@kingsschools.com --password Secret --all
  node backend/scripts/configureSchool.js --email admin@kingsschools.com --password Secret --step roles
=============================================================================
`);
}

// ─────────────────────────────────────────────────────────────
// Main Execution Flow
// ─────────────────────────────────────────────────────────────

async function main() {
    if (TARGET_STEP === 'help' || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        printHelp();
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
            console.log('❌ Error: Please specify --email and --password.');
        }
        process.exit(0);
    }

    console.log(`\n🚀 Connecting to: ${API_BASE}`);
    console.log(`👤 Super Admin: ${ADMIN_EMAIL}`);

    const adminSession = await loginUser(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log(`✅ Super Admin logged in successfully: ${adminSession.user.name || adminSession.user.email}`);

    if (TARGET_STEP === 'all' || TARGET_STEP === 'roles') await stepRoles(adminSession);
    if (TARGET_STEP === 'all' || TARGET_STEP === 'year') await stepAcademicYear(adminSession);
    if (TARGET_STEP === 'all' || TARGET_STEP === 'staff') await stepStaff(adminSession);
    if (TARGET_STEP === 'all' || TARGET_STEP === 'academics') await stepAcademics(adminSession);
    if (TARGET_STEP === 'all' || TARGET_STEP === 'dugsi') await stepDugsi(adminSession);
    if (TARGET_STEP === 'all' || TARGET_STEP === 'fees') await stepFees(adminSession);

    console.log('\n🎉 =========================================================');
    console.log('   Configuration Completed Successfully!');
    console.log('   All roles, staff, academic structures & fees are ready.');
    console.log('=========================================================\n');
}

main().catch((err) => {
    console.error('\n❌ Execution Failed:', err.message);
    process.exit(1);
});
