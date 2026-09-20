require('dotenv').config();

const baseUrl = String(process.env.SHOWCASE_API_URL || 'http://127.0.0.1:5112').replace(/\/$/, '');
const password = process.env.SHOWCASE_PASSWORD;

if (!password) {
    console.error('Set SHOWCASE_PASSWORD before running this verifier.');
    process.exit(1);
}

const checks = [];

const request = async (label, path, { token, method = 'GET', body } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    checks.push({ label, path, status: response.status, ok: response.ok });
    if (!response.ok) {
        const message = typeof payload === 'object' ? payload.message || JSON.stringify(payload) : payload;
        throw new Error(`${label} failed with ${response.status}: ${message}`);
    }
    return payload;
};

const login = async (label, credentials) => {
    const session = await request(`${label} login`, '/api/auth/login', { method: 'POST', body: { ...credentials, password } });
    if (!session.token) throw new Error(`${label} login returned no token`);
    await request(`${label} session`, '/api/auth/me', { token: session.token });
    return session;
};

const collectionSize = (payload) => {
    if (Array.isArray(payload)) return payload.length;
    if (!payload || typeof payload !== 'object') return null;
    for (const key of ['data', 'plans', 'schools', 'branches', 'years', 'users', 'students', 'items', 'invoices', 'payments', 'results', 'exams']) {
        if (Array.isArray(payload[key])) return payload[key].length;
    }
    return null;
};

const responseCollection = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const run = async () => {
    const publicPlans = await request('Public plans', '/api/public/plans');
    const publicSchools = await request('Public schools', '/api/public/schools');

    const horizonAdmin = await login('Horizon Super Admin', { email: 'superadmin@horizonacademy.edu.so' });
    await request('Horizon branches', '/api/tenant/branches', { token: horizonAdmin.token });
    await request('Horizon academic years', '/api/tenant/academic-years', { token: horizonAdmin.token });
    await request('Horizon overview', '/api/tenant/reports/overview', { token: horizonAdmin.token });
    await request('Horizon grading policy', '/api/tenant/academic-policy', { token: horizonAdmin.token });

    const barwaaqoAdmin = await login('Barwaaqo Super Admin', { email: 'superadmin@barwaaqoscholars.edu.so' });
    await request('Barwaaqo branches', '/api/tenant/branches', { token: barwaaqoAdmin.token });
    await request('Barwaaqo overview', '/api/tenant/reports/overview', { token: barwaaqoAdmin.token });

    const finance = await login('Horizon Finance Director', { email: 'finance@horizonacademy.edu.so' });
    await request('Finance fee structures', '/api/tenant/finance/fee-structures', { token: finance.token });
    await request('Finance invoices', '/api/tenant/finance/invoices', { token: finance.token });
    await request('Finance payments', '/api/tenant/finance/payments', { token: finance.token });
    await request('Finance outstanding balances', '/api/tenant/finance/outstanding', { token: finance.token });
    await request('Finance revenue report', '/api/tenant/finance/reports/revenue', { token: finance.token });

    const hr = await login('Horizon HR & Payroll Manager', { email: 'hr@horizonacademy.edu.so' });
    const hrEmployees = await request('HR employees', '/api/hr/employees', { token: hr.token });
    const hrLeaves = await request('HR leave requests', '/api/hr/leaves', { token: hr.token });
    const hrPayroll = await request('HR June 2026 payroll', '/api/hr/payroll?month=6&year=2026', { token: hr.token });
    if (collectionSize(hrEmployees) === 0) throw new Error('HR employees returned no employee records');
    if (collectionSize(hrLeaves) === 0) throw new Error('HR leave requests returned no records');
    if (collectionSize(hrPayroll) === 0) throw new Error('HR June 2026 payroll returned no records');
    const seededHrEmployee = responseCollection(hrEmployees).find((employee) => employee.email === 'hr@horizonacademy.edu.so');
    if (!seededHrEmployee) throw new Error('HR employees did not include the seeded HR manager');
    if (Number(seededHrEmployee.employmentInfo?.basicSalary) <= 0) {
        throw new Error('Seeded HR manager has no positive basic salary');
    }

    const branch = await login('Horizon Branch Admin', { email: 'central.admin@horizonacademy.edu.so' });
    await request('Branch classes', '/api/branch/classes', { token: branch.token });
    await request('Branch subjects', '/api/branch/subjects', { token: branch.token });
    await request('Branch students', '/api/branch/students', { token: branch.token });
    const branchExams = await request('Branch exams', '/api/branch/exams', { token: branch.token });
    const examList = Array.isArray(branchExams) ? branchExams : branchExams.exams || branchExams.data || [];
    const examId = examList[0]?._id;
    if (!examId) throw new Error('Branch exams returned no exam to verify results');
    await request('Branch results summary', `/api/branch/results/summary?examId=${examId}`, { token: branch.token });
    await request('Branch timetable', '/api/branch/timetable/slots', { token: branch.token });

    const teacher = await login('Horizon Teacher', { email: 'central.teacher01@horizonacademy.edu.so' });
    await request('Teacher assignments', '/api/teacher/assignments', { token: teacher.token });
    await request('Teacher exams', '/api/teacher/exams', { token: teacher.token });
    await request('Teacher attendance sessions', '/api/teacher/attendance/sessions', { token: teacher.token });
    await request('Teacher timetable', '/api/teacher/timetable/week', { token: teacher.token });
    await request('Teacher grading policy', '/api/teacher/grading-policy', { token: teacher.token });

    const student = await login('Horizon Student', { username: 'HIA-CEN-001' });
    await request('Student profile', '/api/student/profile', { token: student.token });
    await request('Student academic years', '/api/student/academic-years', { token: student.token });
    await request('Student results', '/api/student/results', { token: student.token });
    await request('Student attendance', '/api/student/attendance', { token: student.token });
    await request('Student rank', '/api/student/rank', { token: student.token });
    await request('Student timetable', '/api/student/timetable/week', { token: student.token });

    const parent = await login('Horizon Parent', { email: 'guardian.central.01@horizonacademy.edu.so' });
    const parentDashboard = await request('Parent dashboard', '/api/parent/dashboard', { token: parent.token });
    await request('Parent notifications', '/api/parent/notifications', { token: parent.token });
    const childCollection = parentDashboard.students || parentDashboard.children || parentDashboard.linkedStudents || (Array.isArray(parentDashboard.data) ? parentDashboard.data : parentDashboard.data?.students) || [];
    const firstChild = childCollection[0]?.student || childCollection[0];
    const childId = firstChild?._id || firstChild?.studentId;
    if (childId) {
        await request('Parent child academic years', `/api/parent/students/${childId}/academic-years`, { token: parent.token });
        await request('Parent child grades', `/api/parent/students/${childId}/grades`, { token: parent.token });
        await request('Parent child attendance', `/api/parent/students/${childId}/attendance`, { token: parent.token });
        await request('Parent child invoices', `/api/parent/students/${childId}/invoices`, { token: parent.token });
        await request('Parent child rank', `/api/parent/students/${childId}/rank`, { token: parent.token });
    }

    console.log(JSON.stringify({
        status: 'PASS',
        baseUrl,
        checks: checks.length,
        failed: checks.filter((check) => !check.ok),
        publicPlanCount: collectionSize(publicPlans),
        publicSchoolCount: collectionSize(publicSchools),
        hrEmployeeCount: collectionSize(hrEmployees),
        hrLeaveCount: collectionSize(hrLeaves),
        hrPayrollCount: collectionSize(hrPayroll),
        hrBasicSalary: seededHrEmployee.employmentInfo.basicSalary,
        parentChildDetailChecks: Boolean(childId)
    }, null, 2));
};

run().catch((error) => {
    console.error(JSON.stringify({ status: 'FAIL', message: error.message, checks }, null, 2));
    process.exit(1);
});
