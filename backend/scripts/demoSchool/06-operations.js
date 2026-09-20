/**
 * Step 6 — put the school into motion.
 *
 * Teaching assignments, attendance, fees, payments and payroll, each done by the role that
 * owns it. The payroll chain is the one to watch: HR prepares it, the head of school
 * approves it, and Finance pays it — three people, and two of those steps were impossible
 * before the permission catalog was unboxed.
 */
const { loginTenant, step, unwrap } = require('./lib');

const FEES_BY_GRADE = { 1: 260, 2: 260, 3: 280, 4: 300, 5: 320, 6: 340 };

const run = async () => {
    const admin = await loginTenant('super admin', 'admin@nuur-al-ilm.school');
    const admissions = await loginTenant('admissions', 'admissions@nuur-al-ilm.school');
    const finance = await loginTenant('finance', 'finance@nuur-al-ilm.school');
    const hr = await loginTenant('hr', 'hr@nuur-al-ilm.school');

    const classes = unwrap(await admissions.get('/branch/classes'));
    const subjects = unwrap(await admissions.get('/branch/subjects'));
    const year = unwrap(await admissions.get('/registrar/academic-years/current'));
    const branch = unwrap(await admin.get('/tenant/branches'))[0];
    const staff = unwrap(await admin.get('/tenant/users?category=all_staff'));
    const teachers = staff.filter((person) => person.role === 'teacher');
    console.log(`   context: ${classes.length} classes, ${subjects.length} subjects, ${teachers.length} teachers, year ${year?.name}`);

    step(1, 'Head of school assigns teachers to classes');
    let assignments = 0;
    let firstAssignmentError = null;
    for (const [classIndex, klass] of classes.entries()) {
        for (const [subjectIndex, subject] of subjects.entries()) {
            const teacher = teachers[(classIndex * subjects.length + subjectIndex) % teachers.length];
            try {
                await admin.post('/assignments', {
                    teacherUserId: teacher._id,
                    classId: klass._id,
                    subjectId: subject._id,
                    academicYearId: year._id,
                    branchId: branch._id
                });
                assignments += 1;
            } catch (error) {
                if (!firstAssignmentError) firstAssignmentError = `${error.status}: ${error.body?.message || error.message}`;
            }
        }
    }
    console.log(`   ${assignments} class-subject assignments across ${teachers.length} teachers`);
    if (firstAssignmentError) console.log(`   first failure: ${firstAssignmentError}`);

    step(2, 'Admissions Officer takes attendance');
    // A fortnight of registers, so the rate is built from real records.
    const dates = [];
    for (let day = 1; day <= 10; day += 1) {
        dates.push(`2026-09-${String(day + 6).padStart(2, '0')}`);
    }
    let registers = 0;
    let marked = 0;
    for (const date of dates) {
        for (const klass of classes) {
            try {
                const session = await admissions.post('/attendance/sessions', {
                    classId: klass._id,
                    academicYearId: year._id,
                    date,
                    period: 'Morning'
                });
                const sessionId = unwrap(session)._id;
                const register = unwrap(await admissions.get(`/attendance/sessions/${sessionId}`)).register;
                // A realistic day: most present, a few absent or late.
                const records = register.map((row, index) => ({
                    studentId: row.studentId,
                    status: index % 17 === 0 ? 'ABSENT' : index % 11 === 0 ? 'LATE' : 'PRESENT'
                }));
                if (records.length) {
                    await admissions.put(`/attendance/sessions/${sessionId}/records`, { records });
                    marked += records.length;
                }
                await admissions.patch(`/attendance/sessions/${sessionId}/close`);
                registers += 1;
            } catch (error) {
                if (registers === 0) console.log(`   failed: ${error.status} ${error.body?.message}`);
            }
        }
    }
    const summary = unwrap(await admissions.get('/attendance/summary'));
    console.log(`   ${registers} registers, ${marked} student marks`);
    console.log(`   school attendance rate: ${summary.totals.attendanceRate}%`);

    step(3, 'Finance Officer sets the fees and invoices the school');
    const structures = [];
    for (const klass of classes) {
        const amount = FEES_BY_GRADE[klass.gradeLevel] || 280;
        const created = await finance.post('/tenant/finance/fee-structures', {
            name: `${klass.name} tuition 2026/2027`,
            branchId: branch._id,
            classId: klass._id,
            targetType: 'CLASS',
            academicYearId: year._id,
            billingFrequency: 'TERM',
            feeItems: [
                { name: 'Tuition', amount: amount - 40 },
                { name: 'Materials', amount: 25 },
                { name: 'Activities', amount: 15 }
            ]
        });
        structures.push(created);
    }
    console.log(`   ${structures.length} fee structures`);

    let invoiced = 0;
    for (const klass of classes) {
        try {
            const result = await finance.post('/tenant/finance/invoices/generate', {
                branchId: branch._id,
                academicYearId: year._id,
                classId: klass._id,
                // TERM splits the year into three, so the run has to say which one it is
                // billing. Without a key the generator refuses rather than guessing.
                billingPeriodKey: 'TERM_1',
                dueDate: '2026-10-15'
            });
            invoiced += result.created ?? result.generated ?? result.data?.created ?? 0;
        } catch (error) {
            console.log(`   invoice run failed for ${klass.name}: ${error.status} ${error.body?.message}`);
        }
    }
    const invoices = unwrap(await finance.get('/tenant/finance/invoices?limit=500'));
    console.log(`   ${invoices.length} invoices raised (generator reported ${invoiced})`);

    step(4, 'Finance Officer takes payments at the desk');
    // The same person is finance and cashier here, which needed the cashier permissions to
    // become grantable to a school-wide role.
    let firstPaymentError = null;
    let paidFull = 0;
    let paidPart = 0;
    for (const [index, invoice] of invoices.entries()) {
        if (index % 5 === 4) continue; // leave a fifth unpaid so the arrears report is real
        const balance = invoice.balance ?? invoice.totalAmount;
        if (!balance) continue;
        const part = index % 3 === 1;
        try {
            await finance.post('/cashier/payments', {
                invoiceId: invoice._id,
                amount: part ? Math.round(balance / 2) : balance,
                method: index % 2 === 0 ? 'CASH' : 'ZAAD',
                reference: index % 2 === 0 ? '' : `ZD${100000 + index}`
            });
            part ? (paidPart += 1) : (paidFull += 1);
        } catch (error) {
            if (!firstPaymentError) firstPaymentError = `${error.status}: ${error.body?.message}`;
        }
    }
    console.log(`   ${paidFull} paid in full, ${paidPart} part paid, ${invoices.length - paidFull - paidPart} outstanding`);
    if (firstPaymentError) console.log(`   first failure: ${firstPaymentError}`);

    step(5, 'Payroll: HR prepares, head of school approves, Finance pays');
    await hr.post('/hr/payroll/generate', { month: 9, year: 2026 });
    const draft = unwrap(await hr.get('/hr/payroll?month=9&year=2026'));
    console.log(`   HR generated ${draft.length} payroll records`);
    let reviewed = 0;
    let firstPayrollError = null;
    for (const record of draft) {
        try { await hr.put(`/hr/payroll/${record._id}/review`); reviewed += 1; } catch (error) { if (!firstPayrollError) firstPayrollError = `review ${error.status}: ${error.body?.message}`; }
    }
    console.log(`   HR reviewed ${reviewed}`);

    let approved = 0;
    for (const record of draft) {
        try { await admin.put(`/hr/payroll/${record._id}/approve`); approved += 1; } catch (error) { if (!firstPayrollError) firstPayrollError = `approve ${error.status}: ${error.body?.message}`; }
    }
    console.log(`   head of school approved ${approved}   <- used to require the finance role`);

    let paid = 0;
    for (const record of draft.slice(0, Math.ceil(draft.length / 2))) {
        try { await finance.put(`/hr/payroll/${record._id}/pay`); paid += 1; } catch (error) { if (!firstPayrollError) firstPayrollError = `pay ${error.status}: ${error.body?.message}`; }
    }
    console.log(`   Finance paid ${paid}, leaving ${approved - paid} approved and awaiting payment`);
    console.log(`   <- paying used to require the cashier or super admin role`);
    if (firstPayrollError) console.log(`   first failure: ${firstPayrollError}`);

    return { assignments, registers, invoices: invoices.length };
};

if (require.main === module) {
    run().then(() => console.log('\nStep 6 complete.')).catch((error) => {
        console.error('\nFAILED:', error.message);
        process.exit(1);
    });
}

module.exports = { run };
