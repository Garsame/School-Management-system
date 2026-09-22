const mongoose = require('mongoose');
const AcademicYear = require('../models/AcademicYear');
const Branch = require('../models/Branch');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const {
    byPeriodOldestFirst,
    invoicePeriodStart,
    isLate,
    monthStart,
    resolveBillingMonth
} = require('../utils/billingMonths');

/**
 * What a student owes, month by month.
 *
 * One source for every place money is shown per student: the finance payment record, the
 * payments desk, the parent's page and the monthly collection view. They must never
 * disagree about what "this month" and "earlier debt" mean, so they all come from here.
 */

const accountError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const idOf = (value) => String(value?._id || value || '');
const cents = (amount) => Math.round(Number(amount || 0) * 100);
const fromCents = (value) => value / 100;
const sum = (rows, pick) => fromCents(rows.reduce((total, row) => total + cents(pick(row)), 0));
const nameOf = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(' ');
const currentMonthKey = (now = new Date()) => now.toISOString().slice(0, 7);

const monthLine = (invoice, now) => ({
    invoiceId: invoice._id,
    key: invoice.billingPeriodKey,
    label: invoice.billingPeriodLabel || 'School fees',
    periodStart: invoicePeriodStart(invoice),
    academicYearId: idOf(invoice.academicYearId),
    billed: Number(invoice.totalAmount || 0),
    paid: Number(invoice.paidAmount || 0),
    balance: Number(invoice.balance ?? invoice.totalAmount ?? 0),
    status: invoice.status,
    dueDate: invoice.dueDate || null,
    late: isLate(invoice, now),
    items: invoice.items || []
});

/**
 * Split a student's bills into "this month" and everything before it. "This month" is the
 * bill for the current calendar month if there is one, else the most recent bill.
 */
const splitCurrentAndEarlier = (lines, now = new Date()) => {
    if (!lines.length) return { current: null, earlier: [] };
    const current = lines.find((line) => line.key === currentMonthKey(now)) || lines[lines.length - 1];
    const earlier = lines.filter((line) => line !== current && line.periodStart <= current.periodStart);
    return { current, earlier };
};

/**
 * The full record for one student: every bill oldest first, every payment, and the totals a
 * person asks about first: this month, earlier debt, total owed, and how much is late.
 *
 * branchId confines a branch-scoped caller to their own branch.
 */
const getStudentPaymentRecord = async ({ tenantId, studentId, branchId = null, now = new Date() }) => {
    if (!mongoose.isValidObjectId(studentId)) throw accountError('Invalid student');
    const studentFilter = { _id: studentId, tenantId };
    if (branchId) studentFilter.branchId = branchId;
    const student = await Student.findOne(studentFilter)
        .select('firstName lastName admissionNumber status branchId withdrawalDate withdrawalReason')
        .lean();
    if (!student) throw accountError('Student not found', 404);

    const [invoices, enrollment, branch] = await Promise.all([
        Invoice.find({ tenantId, studentId, status: { $ne: 'VOID' } }).lean(),
        Enrollment.findOne({ tenantId, studentId })
            .sort({ isCurrent: -1, createdAt: -1 })
            .populate('classId', 'name')
            .populate('academicYearId', 'name')
            .lean(),
        Branch.findOne({ _id: student.branchId, tenantId }).select('name').lean()
    ]);

    const ordered = [...invoices].sort(byPeriodOldestFirst);
    const lines = ordered.map((invoice) => monthLine(invoice, now));
    const payments = await Payment.find({
        tenantId,
        invoiceId: { $in: ordered.map((invoice) => invoice._id) },
        status: { $in: ['ACTIVE', 'REVERSED'] }
    }).sort({ createdAt: -1 }).lean();
    const labelByInvoice = new Map(lines.map((line) => [idOf(line.invoiceId), line.label]));

    const { current, earlier } = splitCurrentAndEarlier(lines, now);
    const lateLines = lines.filter((line) => line.late);

    return {
        student: {
            _id: student._id,
            name: nameOf(student),
            admissionNumber: student.admissionNumber,
            status: student.status,
            leftOn: student.status === 'Left' ? student.withdrawalDate || null : null,
            className: enrollment?.classId?.name || null,
            academicYear: enrollment?.academicYearId?.name || null,
            branchName: branch?.name || null
        },
        thisMonth: current,
        earlierDebt: sum(earlier, (line) => line.balance),
        totals: {
            billed: sum(lines, (line) => line.billed),
            paid: sum(lines, (line) => line.paid),
            owed: sum(lines, (line) => line.balance),
            late: sum(lateLines, (line) => line.balance),
            lateMonths: lateLines.map((line) => line.label)
        },
        months: lines,
        // What is still owed, oldest first: the order a payment fills them.
        unpaid: lines.filter((line) => line.balance > 0),
        payments: payments.map((payment) => ({
            _id: payment._id,
            date: payment.createdAt,
            amount: payment.amount,
            method: payment.method,
            reference: payment.reference || '',
            receiptNumber: payment.receiptNumber || null,
            status: payment.status,
            monthLabel: labelByInvoice.get(idOf(payment.invoiceId)) || '',
            batchId: payment.batchId || null
        }))
    };
};

const STATUS_FILTERS = {
    PAID: (row) => row.status === 'PAID',
    PARTIAL: (row) => row.status === 'PARTIALLY_PAID',
    UNPAID: (row) => row.status === 'UNPAID',
    LATE: (row) => row.late
};

/**
 * One month across the school: every student billed for it, what they paid of it, what
 * they still owe from earlier months, and the totals finance reports on.
 *
 * Totals always cover the whole month (for the chosen campus or class); the status and
 * search filters only narrow the rows, so the headline numbers do not jump around.
 */
const getMonthlyCollection = async ({
    tenantId,
    academicYearId,
    month: monthKey,
    branchId = null,
    classId = null,
    status = null,
    q = '',
    now = new Date()
}) => {
    for (const [label, value] of [['academic year', academicYearId], ['campus', branchId], ['class', classId]]) {
        if (value && !mongoose.isValidObjectId(value)) throw accountError(`Invalid ${label}`);
    }
    if (!academicYearId) throw accountError('Choose the academic year');
    const academicYear = await AcademicYear.findOne({ _id: academicYearId, tenantId }).lean();
    if (!academicYear) throw accountError('Academic year not found in this school');
    let month;
    try {
        month = resolveBillingMonth(academicYear, monthKey);
    } catch (error) {
        throw accountError(error.message);
    }

    const invoiceFilter = { tenantId, academicYearId, billingPeriodKey: month.key, status: { $ne: 'VOID' } };
    if (branchId) invoiceFilter.branchId = branchId;
    const invoices = await Invoice.find(invoiceFilter).lean();
    const studentIds = invoices.map((invoice) => invoice.studentId);

    const [students, enrollments, others, branches] = await Promise.all([
        Student.find({ _id: { $in: studentIds }, tenantId }).select('firstName lastName admissionNumber status').lean(),
        Enrollment.find({ tenantId, academicYearId, studentId: { $in: studentIds } })
            .sort({ isCurrent: 1, createdAt: 1 })
            .populate('classId', 'name gradeLevel')
            .lean(),
        Invoice.find({
            tenantId,
            studentId: { $in: studentIds },
            status: { $ne: 'VOID' },
            balance: { $gt: 0 },
            _id: { $nin: invoices.map((invoice) => invoice._id) }
        }).select('studentId billingPeriodKey dueDate createdAt balance').lean(),
        Branch.find({ tenantId }).select('name').lean()
    ]);

    const studentsById = new Map(students.map((student) => [idOf(student._id), student]));
    // Later entries win, so a current enrollment overrides an older one for the same year.
    const classByStudent = new Map(enrollments.map((enrollment) => [idOf(enrollment.studentId), enrollment.classId]));
    const branchNames = new Map(branches.map((branch) => [idOf(branch._id), branch.name]));
    const start = monthStart(month.key);
    const earlierDebt = new Map();
    others.forEach((invoice) => {
        if (invoicePeriodStart(invoice) >= start) return;
        const key = idOf(invoice.studentId);
        earlierDebt.set(key, (earlierDebt.get(key) || 0) + cents(invoice.balance));
    });

    let rows = invoices.map((invoice) => {
        const key = idOf(invoice.studentId);
        const student = studentsById.get(key);
        const schoolClass = classByStudent.get(key);
        const balance = Number(invoice.balance ?? invoice.totalAmount ?? 0);
        const previous = fromCents(earlierDebt.get(key) || 0);
        return {
            studentId: invoice.studentId,
            studentName: nameOf(student) || 'Unknown student',
            admissionNumber: student?.admissionNumber || '',
            studentStatus: student?.status || '',
            classId: idOf(schoolClass),
            className: schoolClass?.name || '',
            gradeLevel: schoolClass?.gradeLevel || '',
            branchName: branchNames.get(idOf(invoice.branchId)) || '',
            invoiceId: invoice._id,
            billed: Number(invoice.totalAmount || 0),
            paid: Number(invoice.paidAmount || 0),
            balance,
            status: invoice.status,
            dueDate: invoice.dueDate || null,
            late: isLate(invoice, now),
            earlierDebt: previous,
            totalOwed: fromCents(cents(balance) + cents(previous))
        };
    });
    if (classId) rows = rows.filter((row) => row.classId === String(classId));
    rows.sort((a, b) => String(a.gradeLevel).localeCompare(String(b.gradeLevel), undefined, { numeric: true })
        || a.className.localeCompare(b.className)
        || a.studentName.localeCompare(b.studentName));

    const billed = sum(rows, (row) => row.billed);
    const collected = sum(rows, (row) => row.paid);
    const totals = {
        students: rows.length,
        billed,
        collected,
        outstanding: sum(rows, (row) => row.balance),
        earlierDebt: sum(rows, (row) => row.earlierDebt),
        totalOwed: sum(rows, (row) => row.totalOwed),
        collectionRate: billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0,
        counts: {
            paid: rows.filter(STATUS_FILTERS.PAID).length,
            partial: rows.filter(STATUS_FILTERS.PARTIAL).length,
            unpaid: rows.filter(STATUS_FILTERS.UNPAID).length,
            late: rows.filter(STATUS_FILTERS.LATE).length
        }
    };

    const filter = STATUS_FILTERS[String(status || '').toUpperCase()];
    if (filter) rows = rows.filter(filter);
    const search = String(q || '').trim().toLowerCase();
    if (search) {
        rows = rows.filter((row) => `${row.studentName} ${row.admissionNumber}`.toLowerCase().includes(search));
    }

    return {
        academicYear: { _id: academicYear._id, name: academicYear.name },
        month,
        totals,
        rows
    };
};

module.exports = {
    getMonthlyCollection,
    getStudentPaymentRecord,
    splitCurrentAndEarlier
};
