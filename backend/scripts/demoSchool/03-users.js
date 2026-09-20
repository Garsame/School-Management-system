/**
 * Step 3 — staff the school, then prove each role sees only what it should.
 *
 * Creating a teacher and an admissions officer is the real test here: until the creatable
 * role list stopped being hardcoded, a single-campus school could define those roles but
 * never fill them, because only a branch admin was allowed to create them.
 */
const { expectDenied, loginTenant, step, PASSWORD } = require('./lib');
const { SCHOOL } = require('./02-school-and-roles');

const STAFF = [
    { role: 'hr_payroll_manager', scope: 'tenant', name: 'Khadra Omar Jama', email: 'hr@nuur-al-ilm.school', jobTitle: 'HR Manager', department: 'Administration' },
    { role: 'finance_director', scope: 'tenant', name: 'Yusuf Ahmed Guled', email: 'finance@nuur-al-ilm.school', jobTitle: 'Finance Officer', department: 'Finance' },
    { role: 'registrar', scope: 'branch', name: 'Sahra Mohamed Elmi', email: 'admissions@nuur-al-ilm.school', jobTitle: 'Admissions Officer', department: 'Administration' }
];

const TEACHERS = [
    ['Abdirahman Ali Nur', 'abdirahman.nur', 'Mathematics'],
    ['Hodan Ibrahim Farah', 'hodan.farah', 'English'],
    ['Mustafe Hassan Aden', 'mustafe.aden', 'Science'],
    ['Ubah Abdi Warsame', 'ubah.warsame', 'Social Studies'],
    ['Ismail Yusuf Hersi', 'ismail.hersi', 'Somali'],
    ['Fartun Ahmed Osman', 'fartun.osman', 'Islamic Studies'],
    ['Liban Mohamud Dahir', 'liban.dahir', 'Mathematics'],
    ['Naima Abdullahi Said', 'naima.said', 'English'],
    ['Bashir Omar Kahin', 'bashir.kahin', 'Science'],
    ['Amina Hussein Jibril', 'amina.jibril', 'Physical Education'],
    ['Cabdi Salaan Maxamed', 'cabdi.maxamed', 'Islamic Studies'],
    ['Zamzam Ali Dirie', 'zamzam.dirie', 'Social Studies']
];

const SALARIES = {
    hr_payroll_manager: { basicSalary: 900, allowance: 150, deductions: 40 },
    finance_director: { basicSalary: 1100, allowance: 200, deductions: 55 },
    registrar: { basicSalary: 700, allowance: 100, deductions: 30 },
    teacher: { basicSalary: 550, allowance: 80, deductions: 25 }
};

const run = async () => {
    const admin = await loginTenant('super admin', SCHOOL.adminEmail);

    step(1, 'Find the campus');
    const branches = await admin.get('/tenant/branches');
    const branch = (branches.data || branches)[0];
    console.log(`   ${branch.name} (${branch.code || 'main'})`);

    step(2, 'Create the administrative staff');
    const created = [];
    for (const person of STAFF) {
        const payload = {
            name: person.name,
            email: person.email,
            password: PASSWORD,
            role: person.role,
            scope: person.scope,
            ...(person.scope === 'branch' ? { branchId: branch._id } : {}),
            // Compensation is read from employmentInfo; sent at the top level it is
            // silently ignored and payroll later generates nothing.
            employmentInfo: {
                jobTitle: person.jobTitle,
                department: person.department,
                employmentType: 'Permanent',
                hireDate: '2024-08-01',
                currency: 'USD',
                paymentMethod: 'Bank',
                ...SALARIES[person.role]
            }
        };
        const user = await admin.post('/tenant/users', payload);
        created.push(user);
        console.log(`   ${person.jobTitle.padEnd(20)} ${person.email}`);
    }

    step(3, 'Create the teachers');
    for (const [name, handle, subject] of TEACHERS) {
        await admin.post('/tenant/users', {
            name,
            email: `${handle}@nuur-al-ilm.school`,
            password: PASSWORD,
            role: 'teacher',
            scope: 'branch',
            branchId: branch._id,
            employmentInfo: {
                jobTitle: 'Teacher',
                department: 'Academic',
                specialization: subject,
                employmentType: 'Permanent',
                hireDate: '2024-08-01',
                currency: 'USD',
                paymentMethod: 'Bank',
                ...SALARIES.teacher
            }
        });
    }
    console.log(`   ${TEACHERS.length} teachers created`);

    step(4, 'Deactivated roles cannot be filled');
    await expectDenied('cannot create a branch admin — the role is off', () =>
        admin.post('/tenant/users', {
            name: 'Should Not Exist', email: 'nope@nuur-al-ilm.school', password: PASSWORD,
            role: 'branch_admin', scope: 'branch', branchId: branch._id
        }));

    step(5, 'Each role sees only its own work');
    const sessions = {
        'HR Manager': await loginTenant('hr', 'hr@nuur-al-ilm.school'),
        'Finance Officer': await loginTenant('finance', 'finance@nuur-al-ilm.school'),
        'Admissions Officer': await loginTenant('admissions', 'admissions@nuur-al-ilm.school'),
        Teacher: await loginTenant('teacher', 'abdirahman.nur@nuur-al-ilm.school')
    };
    for (const [label, session] of Object.entries(sessions)) {
        console.log(`   ${label.padEnd(20)} ${String(session.user.permissions?.length ?? 0).padStart(3)} permissions`);
    }

    step(6, 'The boundaries between them hold');
    await expectDenied('HR cannot read student records', () => sessions['HR Manager'].get('/tenant/students'));
    await expectDenied('HR cannot pay payroll', () => sessions['HR Manager'].put('/hr/payroll/000000000000000000000000/pay'));
    await expectDenied('Admissions cannot read employee salaries', () => sessions['Admissions Officer'].get('/hr/employees'));
    await expectDenied('Teacher cannot create users', () => sessions.Teacher.post('/tenant/users', { name: 'x', email: 'x@x.com', password: PASSWORD, role: 'teacher', scope: 'branch' }));
    await expectDenied('Finance cannot change roles', () => sessions['Finance Officer'].get('/tenant/roles'));

    step(7, 'And each role can reach its own work');
    const checks = [
        ['HR Manager', '/hr/employees', 'employee records'],
        ['Finance Officer', '/tenant/finance/invoices', 'invoices'],
        ['Finance Officer', '/cashier/dashboard/stats', 'cashier desk'],
        ['Admissions Officer', '/registrar/students', 'student directory'],
        ['Admissions Officer', '/attendance/summary', 'attendance']
    ];
    for (const [label, path, what] of checks) {
        try {
            await sessions[label].get(path);
            console.log(`   ok    ${label} reaches ${what}`);
        } catch (error) {
            console.log(`   FAIL  ${label} cannot reach ${what} — ${error.status}: ${error.body?.message}`);
        }
    }

    const staff = await admin.get('/tenant/users?category=all_staff');
    console.log(`\n   ${(staff.data || staff).length} staff accounts in total`);
    return { branch, admin, sessions };
};

if (require.main === module) {
    run().then(() => console.log('\nStep 3 complete.')).catch((error) => {
        console.error('\nFAILED:', error.message);
        process.exit(1);
    });
}

module.exports = { run, STAFF, TEACHERS };
