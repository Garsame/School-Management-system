/**
 * Step 2 — create the school, then configure its roles.
 *
 * This is the part that matters. The school does not accept the ten roles the platform
 * shipped with: it deletes what it does not use, renames what it keeps, and redistributes
 * permissions to match how it actually runs. Every call goes through the API as the super
 * admin, so if the configuration is not genuinely possible this step fails.
 */
const { expectDenied, loginPlatform, loginTenant, step, PASSWORD } = require('./lib');

const SCHOOL = {
    name: 'Nuur Al-Ilm Academy',
    domain: 'nuur-al-ilm.school',
    plan: 'foundation',
    adminName: 'Fadumo Hassan Warsame',
    adminEmail: 'admin@nuur-al-ilm.school'
};

/**
 * How this school is run.
 *
 * Deliberately different from the platform defaults: one campus so no branch admin, and
 * one person doing finance and cashier together. Both were impossible before the catalog
 * was unboxed.
 */
const ROLE_PLAN = {
    // The head of school: everything, including what a branch admin would have done.
    super_admin: {
        name: 'Super Admin',
        description: 'Head of school. Full access, configures roles and users.',
        add: [
            'branch.promotions.run', 'branch.transfers.run',
            'attendance.oversight.view', 'attendance.oversight.manage',
            'payroll.approve', 'payroll.view'
        ]
    },
    // HR owns employees and what wraps around them. Nothing student-facing.
    hr_payroll_manager: {
        name: 'HR Manager',
        description: 'Employees, leave, compensation and payroll preparation.',
        add: ['payroll.view', 'payroll.generate', 'payroll.review']
    },
    // Finance and cashier as one person: school-wide money, from fee structure to receipt.
    finance_director: {
        name: 'Finance Officer',
        description: 'All money: fees, invoices, payments, receipts and payroll payout.',
        add: [
            'cashier.dashboard.view', 'cashier.invoices.search', 'cashier.invoices.detail',
            'cashier.payments.view', 'cashier.payments.create', 'cashier.payments.reverse',
            'cashier.receipts.view', 'cashier.receipts.print',
            'payroll.pay', 'payroll.view',
            'students.view', 'students.detail'
        ]
    },
    // Admissions: the registrar renamed, plus class setup and attendance.
    registrar: {
        name: 'Admissions Officer',
        description: 'Admissions, enrolment, classes and student attendance.',
        add: [
            'branch.classes.create', 'branch.classes.update',
            'branch.sections.manage', 'branch.subjects.manage',
            'branch.results.view', 'branch.timetable.view',
            'branch.promotions.run', 'branch.transfers.run',
            'attendance.oversight.view', 'attendance.oversight.manage'
        ]
    },
    teacher: { name: 'Teacher', description: 'Classes, attendance, schedule and marking.', add: [] },
    parent: { name: 'Parent', description: 'Portal access for linked children.', add: [] },
    student: { name: 'Student', description: 'Portal access to own records.', add: [] }
};

// Roles this school does not use. One campus means no branch admin, and finance covers
// cashier work, so a separate cashier role would sit empty.
const UNUSED_ROLES = ['branch_admin', 'cashier'];

const run = async () => {
    step(1, 'Platform owner creates the school');
    const owner = await loginPlatform('owner@madrasahub.com');
    const created = await owner.post('/platform/tenants', { ...SCHOOL, password: PASSWORD });
    const tenantId = created.tenant?._id || created._id || created.data?._id;
    console.log(`   ${SCHOOL.name} created on the ${SCHOOL.plan} plan`);
    console.log(`   super admin: ${SCHOOL.adminEmail}`);

    step(2, 'Super admin signs in');
    const admin = await loginTenant('super admin', SCHOOL.adminEmail);
    console.log(`   signed in as ${admin.user.name}, ${admin.user.permissions?.length ?? '?'} permissions by default`);

    step(3, 'Read the roles the platform seeded');
    const roles = await admin.get('/tenant/roles');
    console.log(`   ${roles.length} roles seeded:`);
    roles.forEach((role) => console.log(`      ${role.key.padEnd(20)} ${String(role.permissions.length).padStart(3)} permissions  ${role.userCount} users`));

    step(4, 'Redistribute permissions to match how this school runs');
    const byKey = new Map(roles.map((role) => [role.key, role]));
    for (const [key, plan] of Object.entries(ROLE_PLAN)) {
        const role = byKey.get(key);
        if (!role) { console.log(`   skip  ${key} — not seeded`); continue; }
        const next = [...new Set([...role.permissions, ...plan.add])];
        const updated = await admin.put(`/tenant/roles/${role._id}`, {
            name: plan.name,
            description: plan.description,
            permissions: next
        });
        const gained = next.length - role.permissions.length;
        console.log(`   ${plan.name.padEnd(20)} ${String(updated.permissions.length).padStart(3)} permissions${gained ? `  (+${gained})` : ''}`);
        if (updated.dutyConflicts?.length) {
            updated.dutyConflicts.forEach((conflict) => console.log(`      warning: ${conflict.label}`));
        }
    }

    step(5, 'Remove the roles this school does not use');
    for (const key of UNUSED_ROLES) {
        const role = byKey.get(key);
        if (!role) continue;
        // Seeded roles cannot be deleted, because a user's role string may still point at
        // one. Deactivating takes the access away and keeps the record intact.
        await admin.put(`/tenant/roles/${role._id}`, { isActive: false });
        console.log(`   ${role.key} deactivated — this school has one campus and merges finance with cashier`);
    }

    step(6, 'Check the boundaries actually hold');
    const financeRole = byKey.get('finance_director');
    await expectDenied('school cannot grant itself platform access', () =>
        admin.put(`/tenant/roles/${financeRole._id}`, {
            permissions: [...financeRole.permissions, 'platform.tenants.create']
        }));
    const teacherRole = byKey.get('teacher');
    await expectDenied('a branch role cannot hold a school-wide permission', () =>
        admin.put(`/tenant/roles/${teacherRole._id}`, {
            permissions: [...teacherRole.permissions, 'tenant.users.create']
        }));

    console.log(`\nTENANT_ID=${tenantId}`);
    return { tenantId, admin };
};

if (require.main === module) {
    run().then(() => console.log('\nStep 2 complete.')).catch((error) => {
        console.error('\nFAILED:', error.message);
        process.exit(1);
    });
}

module.exports = { run, SCHOOL, ROLE_PLAN };
