const AcademicYear = require('../models/AcademicYear');
const Branch = require('../models/Branch');
const Class = require('../models/Class');
const Enrollment = require('../models/Enrollment');
const FeeStructure = require('../models/FeeStructure');
const FinancePolicy = require('../models/FinancePolicy');
const Invoice = require('../models/Invoice');
const Student = require('../models/Student');
const User = require('../models/User');
const mongoose = require('mongoose');
const { createNotification } = require('./notificationService');
const { DEFAULT_DUE_DAY, dueDateForMonth, resolveBillingMonth } = require('../utils/billingMonths');

const billingError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const idOf = (value) => String(value?._id || value || '');
const toCents = (amount) => Math.round(Number(amount || 0) * 100);

// Records read with lean() skip schema defaults, so an absent field means the default:
// open, a class-level target, and not yet a monthly amount.
const isOpen = (structure) => structure.isOpen !== false;
const targetOf = (structure) => structure.targetType || 'CLASS';

const matchesClass = (structure, schoolClass) => {
    const target = targetOf(structure);
    if (target === 'CLASS') return idOf(structure.classId) === idOf(schoolClass._id);
    if (target === 'CATEGORY') {
        return idOf(structure.categoryId) === idOf(schoolClass.categoryId)
            && idOf(structure.branchId) === idOf(schoolClass.branchId);
    }
    return String(structure.gradeLevel) === String(schoolClass.gradeLevel);
};

const TARGET_PRECEDENCE = ['CLASS', 'CATEGORY', 'SCHOOL_GRADE'];

/**
 * The fee a class is billed: the most specific structure that is open and holds a monthly
 * amount. A closed structure is treated as absent, so closing a class override falls back
 * to the grade fee rather than leaving the class unbilled; the preview names which one
 * each class landed on, so that is never a surprise.
 */
const pickFeeStructure = (structures, schoolClass) => {
    for (const target of TARGET_PRECEDENCE) {
        const found = structures.find((structure) => targetOf(structure) === target
            && isOpen(structure)
            && structure.amountsArePerMonth === true
            && matchesClass(structure, schoolClass));
        if (found) return found;
    }
    return null;
};

const explainMissingFee = (structures, schoolClass) => {
    const matches = structures.filter((structure) => matchesClass(structure, schoolClass));
    if (!matches.length) return 'No fee structure for this class';
    if (matches.some((structure) => isOpen(structure))) return 'Fee structure has no monthly amount yet';
    return 'Fee structure is closed';
};

const monthlyCharge = (structure) => {
    const items = (structure.feeItems || []).map((item) => ({
        name: item.name,
        amount: toCents(item.amount) / 100
    }));
    const amount = items.reduce((sum, item) => sum + toCents(item.amount), 0) / 100;
    return { items, amount };
};

const studentName = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Your child';

/**
 * In-app notices (and email, where configured) for the invoices just created. Runs after
 * the response is sent: a whole school is hundreds of notices, and the invoices are
 * already correct whether or not a notice lands.
 */
const notifyInvoicesCreated = async ({ tenantId, invoices, studentsById, month }) => {
    if (!invoices.length) return;
    const studentIds = invoices.map((invoice) => invoice.studentId);
    const [studentUsers, parentUsers] = await Promise.all([
        User.find({ tenantId, studentId: { $in: studentIds } }).select('_id studentId').lean(),
        User.find({ tenantId, role: 'parent', students: { $in: studentIds } }).select('_id students').lean()
    ]);
    const studentUserByStudent = new Map(studentUsers.map((user) => [idOf(user.studentId), user]));
    const parentsByStudent = new Map();
    parentUsers.forEach((parent) => (parent.students || []).forEach((studentId) => {
        const key = idOf(studentId);
        parentsByStudent.set(key, [...(parentsByStudent.get(key) || []), parent]);
    }));

    for (const invoice of invoices) {
        const key = idOf(invoice.studentId);
        const amount = `$${Number(invoice.totalAmount).toLocaleString('en-US')}`;
        const studentUser = studentUserByStudent.get(key);
        if (studentUser) {
            await createNotification({
                tenantId,
                recipientId: studentUser._id,
                title: `${month.label} school fees`,
                message: `Your ${month.label} invoice of ${amount} is ready.`,
                type: 'Invoice'
            });
        }
        const name = studentName(studentsById.get(key));
        for (const parent of parentsByStudent.get(key) || []) {
            await createNotification({
                tenantId,
                recipientId: parent._id,
                title: `${month.label} fees: ${name}`,
                message: `The ${month.label} invoice of ${amount} for ${name} is ready.`,
                type: 'Invoice'
            });
        }
    }
};

const calculateStudentInvoice = (student, baseCharge) => {
    const discount = student?.discount;
    if (!discount || !discount.enabled || !discount.value || discount.value <= 0) {
        return {
            items: baseCharge.items,
            totalAmount: baseCharge.amount,
            paidAmount: 0,
            balance: baseCharge.amount,
            status: baseCharge.amount === 0 ? 'PAID' : 'UNPAID'
        };
    }

    const baseAmount = baseCharge.amount;
    let discountAmount = 0;
    let discountLabel = '';

    if (discount.type === 'PERCENTAGE') {
        const pct = Math.min(100, Math.max(0, Number(discount.value) || 0));
        discountAmount = Math.round(baseAmount * (pct / 100) * 100) / 100;
        if (pct >= 100) {
            discountLabel = `Full Scholarship (100%)${discount.reason ? ` — ${discount.reason}` : ''}`;
        } else {
            discountLabel = `Discount (${pct}%)${discount.reason ? ` — ${discount.reason}` : ''}`;
        }
    } else {
        discountAmount = Math.min(baseAmount, Math.round((Number(discount.value) || 0) * 100) / 100);
        discountLabel = `Discount${discount.reason ? ` — ${discount.reason}` : ''}`;
    }

    const finalAmount = Math.max(0, Math.round((baseAmount - discountAmount) * 100) / 100);
    const invoiceItems = [...baseCharge.items];
    if (discountAmount > 0) {
        invoiceItems.push({
            name: discountLabel,
            amount: -discountAmount
        });
    }

    return {
        items: invoiceItems,
        totalAmount: finalAmount,
        paidAmount: 0,
        balance: finalAmount,
        status: finalAmount === 0 ? 'PAID' : 'UNPAID'
    };
};

const insertInvoices = async (docs) => {
    if (!docs.length) return { inserted: [], raced: 0 };
    try {
        const inserted = await Invoice.insertMany(docs, { ordered: false });
        return { inserted, raced: 0 };
    } catch (error) {
        // Two people generating the same month at once: the unique index lets exactly one
        // invoice per student and month through, and the losers are already billed.
        const writeErrors = error.writeErrors || error.result?.getWriteErrors?.() || [];
        const onlyDuplicates = writeErrors.length > 0
            && writeErrors.every((item) => (item.code ?? item.err?.code) === 11000);
        if (!onlyDuplicates) throw error;
        const inserted = error.insertedDocs || [];
        return { inserted, raced: docs.length - inserted.length };
    }
};

/**
 * Bill one month, for the whole school or one student.
 *
 * Every student with a current enrollment in the year and an Active record is billed from
 * their class's fee structure. Nobody is billed twice for the same month, whatever branch
 * they are in now. With dryRun nothing is written and the same summary comes back, which is
 * what the finance officer reviews before pressing the button.
 */
const generateMonthlyInvoices = async ({
    tenantId,
    academicYearId,
    month: monthKeyValue,
    branchId = null,
    studentId = null,
    dueDate = null,
    dryRun = false
}) => {
    if (!academicYearId) throw billingError('Choose the academic year to bill');
    for (const [label, value] of [['academic year', academicYearId], ['campus', branchId], ['student', studentId]]) {
        if (value && !mongoose.isValidObjectId(value)) throw billingError(`Invalid ${label}`);
    }
    const academicYear = await AcademicYear.findOne({ _id: academicYearId, tenantId }).lean();
    if (!academicYear) throw billingError('Academic year not found in this school');

    let month;
    try {
        month = resolveBillingMonth(academicYear, monthKeyValue);
    } catch (error) {
        throw billingError(error.message);
    }

    // Due on the school's due day of the billed month unless the finance officer names a date.
    const policy = await FinancePolicy.findOne({ tenantId }).select('dueDay').lean();
    let resolvedDueDate = dueDateForMonth(month.key, policy?.dueDay ?? DEFAULT_DUE_DAY);
    if (dueDate) {
        resolvedDueDate = new Date(dueDate);
        if (Number.isNaN(resolvedDueDate.getTime())) throw billingError('Invalid due date');
    }

    if (branchId && !await Branch.exists({ _id: branchId, tenantId })) {
        throw billingError('Campus not found in this school');
    }
    if (studentId && !await Student.exists({ _id: studentId, tenantId })) {
        throw billingError('Student not found in this school');
    }

    const enrollmentQuery = { tenantId, academicYearId, isCurrent: true };
    if (branchId) enrollmentQuery.branchId = branchId;
    if (studentId) enrollmentQuery.studentId = studentId;
    const enrollments = await Enrollment.find(enrollmentQuery)
        .select('studentId classId branchId')
        .lean();

    // One line per student, even if a data fault left two current enrollments.
    const enrollmentByStudent = new Map();
    enrollments.forEach((enrollment) => {
        if (!enrollmentByStudent.has(idOf(enrollment.studentId))) {
            enrollmentByStudent.set(idOf(enrollment.studentId), enrollment);
        }
    });
    const studentIds = [...enrollmentByStudent.keys()];
    const classIds = [...new Set([...enrollmentByStudent.values()].map((enrollment) => idOf(enrollment.classId)))];

    const [students, classes, structures, existing, branches] = await Promise.all([
        Student.find({ _id: { $in: studentIds }, tenantId }).select('firstName lastName admissionNumber status discount').lean(),
        Class.find({ _id: { $in: classIds }, tenantId }).select('name gradeLevel categoryId branchId').lean(),
        FeeStructure.find({ tenantId, academicYearId }).lean(),
        Invoice.find({ tenantId, academicYearId, billingPeriodKey: month.key, studentId: { $in: studentIds } }).select('studentId').lean(),
        Branch.find({ tenantId }).select('name').lean()
    ]);

    const studentsById = new Map(students.map((student) => [idOf(student._id), student]));
    const classesById = new Map(classes.map((schoolClass) => [idOf(schoolClass._id), schoolClass]));
    const branchNames = new Map(branches.map((branch) => [idOf(branch._id), branch.name]));
    const billed = new Set(existing.map((invoice) => idOf(invoice.studentId)));

    const classRows = new Map();
    const rowFor = (enrollment) => {
        const key = idOf(enrollment.classId);
        if (!classRows.has(key)) {
            const schoolClass = classesById.get(key);
            const structure = schoolClass ? pickFeeStructure(structures, schoolClass) : null;
            classRows.set(key, {
                classId: key,
                className: schoolClass?.name || 'Unknown class',
                gradeLevel: schoolClass?.gradeLevel || '',
                branchName: branchNames.get(idOf(enrollment.branchId)) || '',
                feeStructureId: structure ? idOf(structure._id) : null,
                feeStructureName: structure?.name || null,
                monthlyAmount: structure ? monthlyCharge(structure).amount : 0,
                reason: structure ? null : (schoolClass ? explainMissingFee(structures, schoolClass) : 'Class not found'),
                structure,
                students: 0,
                toBill: 0,
                alreadyBilled: 0
            });
        }
        return classRows.get(key);
    };

    let notActive = 0;
    const docs = [];
    for (const [key, enrollment] of enrollmentByStudent) {
        const student = studentsById.get(key);
        if (!student || student.status !== 'Active') {
            notActive += 1;
            continue;
        }
        const row = rowFor(enrollment);
        row.students += 1;
        if (billed.has(key)) {
            row.alreadyBilled += 1;
            continue;
        }
        if (!row.structure) continue;

        const charge = monthlyCharge(row.structure);
        const bill = calculateStudentInvoice(student, charge);
        row.toBill += 1;
        docs.push({
            tenantId,
            branchId: enrollment.branchId,
            studentId: enrollment.studentId,
            academicYearId,
            feeStructureId: row.structure._id,
            billingPeriodKey: month.key,
            billingPeriodLabel: month.label,
            items: bill.items,
            totalAmount: bill.totalAmount,
            paidAmount: bill.paidAmount,
            balance: bill.balance,
            status: bill.status,
            dueDate: resolvedDueDate
        });
    }

    let created = 0;
    let raced = 0;
    let inserted = [];
    if (!dryRun) {
        ({ inserted, raced } = await insertInvoices(docs));
        created = inserted.length;
    }

    const rows = [...classRows.values()]
        .map(({ structure, ...row }) => row)
        .sort((a, b) => a.branchName.localeCompare(b.branchName)
            || String(a.gradeLevel).localeCompare(String(b.gradeLevel), undefined, { numeric: true })
            || a.className.localeCompare(b.className));

    const summary = {
        dryRun: Boolean(dryRun),
        month,
        academicYear: { _id: academicYear._id, name: academicYear.name },
        dueDate: resolvedDueDate,
        // Billing a month late gives parents a bill that is already overdue; the page warns.
        dueDateHasPassed: resolvedDueDate < new Date(),
        toBill: docs.length,
        created,
        alreadyBilled: rows.reduce((sum, row) => sum + row.alreadyBilled, 0) + raced,
        notActive,
        noFee: rows.filter((row) => !row.feeStructureId).reduce((sum, row) => sum + row.students - row.alreadyBilled, 0),
        totalAmount: docs.reduce((sum, doc) => sum + toCents(doc.totalAmount), 0) / 100,
        classes: rows.filter((row) => row.feeStructureId),
        skippedClasses: rows.filter((row) => !row.feeStructureId)
    };

    if (studentId) summary.outcome = describeStudentOutcome({ summary, enrollments, dryRun, created });

    return {
        summary,
        notify: () => notifyInvoicesCreated({ tenantId, invoices: inserted, studentsById, month })
    };
};

const describeStudentOutcome = ({ summary, enrollments, dryRun, created }) => {
    if (!enrollments.length) return { code: 'NOT_ENROLLED', message: `Not enrolled in ${summary.academicYear.name}` };
    if (summary.notActive) return { code: 'NOT_ACTIVE', message: 'Student is not active' };
    if (summary.alreadyBilled) return { code: 'ALREADY_BILLED', message: `Already billed for ${summary.month.label}` };
    if (summary.skippedClasses.length) {
        const row = summary.skippedClasses[0];
        return { code: 'NO_FEE', message: `${row.className}: ${row.reason}` };
    }
    if (dryRun) return { code: 'READY', message: `Ready to bill ${summary.month.label}` };
    return created
        ? { code: 'BILLED', message: `Billed for ${summary.month.label}` }
        : { code: 'ALREADY_BILLED', message: `Already billed for ${summary.month.label}` };
};

module.exports = {
    calculateStudentInvoice,
    explainMissingFee,
    generateMonthlyInvoices,
    monthlyCharge,
    pickFeeStructure
};
