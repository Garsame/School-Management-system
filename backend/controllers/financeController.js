const asyncHandler = require('express-async-handler');
const FeeStructure = require('../models/FeeStructure');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const FinancePolicy = require('../models/FinancePolicy');
const Branch = require('../models/Branch');
const Class = require('../models/Class');
const Section = require('../models/Section');
const AcademicYear = require('../models/AcademicYear');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const { logActivity } = require('../utils/logger');
const { getRevenueReport } = require('../services/financeService');
const { generateMonthlyInvoices } = require('../services/monthlyBillingService');
const { listAcademicYearMonths } = require('../utils/billingMonths');
const { getMonthlyCollection, getStudentPaymentRecord } = require('../services/studentAccountService');
const { XLSX_CONTENT_TYPE, buildWorkbook } = require('../utils/xlsxWriter');
const Tenant = require('../models/Tenant');
const exportService = require('../services/exportService');
const mongoose = require('mongoose');
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validateFinanceContext = async ({ tenantId, branchId, classId, academicYearId, studentId }) => {
    if (branchId) {
        const b = await Branch.findOne({ _id: branchId, tenantId });
        if (!b) {
            const error = new Error('Access denied for this finance resource.');
            error.status = 403;
            throw error;
        }
    }
    if (classId) {
        const c = await Class.findOne({ _id: classId, tenantId });
        if (!c) {
            const error = new Error('Access denied for this finance resource.');
            error.status = 403;
            throw error;
        }
    }
    if (academicYearId) {
        const y = await AcademicYear.findOne({ _id: academicYearId, tenantId });
        if (!y) {
            const error = new Error('Access denied for this finance resource.');
            error.status = 403;
            throw error;
        }
    }
    if (studentId) {
        const s = await Student.findOne({ _id: studentId, tenantId });
        if (!s) {
            const error = new Error('Access denied for this finance resource.');
            error.status = 403;
            throw error;
        }
    }

    const checks = [];
    if (branchId) checks.push(Branch.exists({ _id: branchId, tenantId, isActive: true }));
    if (classId) checks.push(Class.exists({ _id: classId, tenantId, ...(branchId ? { branchId } : {}) }));
    if (academicYearId) checks.push(AcademicYear.exists({ _id: academicYearId, tenantId }));
    if (studentId) checks.push(Student.exists({ _id: studentId, tenantId, ...(branchId ? { branchId } : {}) }));
    const results = await Promise.all(checks);
    if (results.some((result) => !result)) {
        const error = new Error('One or more finance context values are invalid for this institution');
        error.status = 400;
        throw error;
    }
};

// ==========================================
// A) Fee Structure Management
// ==========================================

const invalidFeeItems = (feeItems) => !Array.isArray(feeItems)
    || feeItems.length === 0
    || feeItems.some((item) => !item?.name || !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0);

const toMonthlyItems = (feeItems) => feeItems.map((item) => ({
    name: String(item.name).trim(),
    amount: Math.round(Number(item.amount) * 100) / 100
}));

const sumItems = (items) => items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;

// Every fee structure is a monthly fee: its items are what a student pays each month.
const MONTHLY_SCHEDULE = Object.freeze({ billingFrequency: 'MONTHLY', billingPeriods: [], amountsArePerMonth: true });

const createFeeStructure = asyncHandler(async (req, res) => {
    const { name, branchId, classId, categoryId, gradeLevel, targetType = 'CLASS', academicYearId, feeItems } = req.body;
    const normalizedTarget = String(targetType).toUpperCase();

    const missingTarget = normalizedTarget === 'SCHOOL_GRADE' ? !gradeLevel : (normalizedTarget === 'CLASS' ? !classId : !categoryId);
    if (!academicYearId || !feeItems || missingTarget || (normalizedTarget !== 'SCHOOL_GRADE' && !branchId)) {
        res.status(400);
        throw new Error('Please provide a branch, academic year, fee items, and fee target');
    }
    if (invalidFeeItems(feeItems)) {
        res.status(400);
        throw new Error('feeItems must contain valid names and non-negative amounts');
    }
    await validateFinanceContext({ tenantId: req.tenantId, branchId: normalizedTarget === 'SCHOOL_GRADE' ? undefined : branchId, classId, academicYearId });
    if (normalizedTarget === 'CATEGORY') {
        const ClassCategory = require('../models/ClassCategory');
        if (!await ClassCategory.exists({ _id: categoryId, tenantId: req.tenantId, branchId })) {
            res.status(400);
            throw new Error('Invalid class category for this branch');
        }
    }

    const monthlyItems = toMonthlyItems(feeItems);
    const totalAmount = sumItems(monthlyItems);
    const isOpen = req.body.isOpen !== false;

    try {
        if (normalizedTarget === 'SCHOOL_GRADE' && String(gradeLevel).toUpperCase() === 'ALL') {
            const created = await FeeStructure.insertMany(Array.from({ length: 12 }, (_, index) => ({
                tenantId: req.tenantId,
                targetType: 'SCHOOL_GRADE',
                gradeLevel: String(index + 1),
                academicYearId,
                name: `${String(name || '').trim() || 'Standard School Fees'} - Grade ${index + 1}`,
                ...MONTHLY_SCHEDULE,
                isOpen,
                feeItems: monthlyItems,
                totalAmount
            })));
            await logActivity({
                req,
                action: 'SCHOOL_FEE_PLAN_CREATED',
                entityType: 'FeeStructure',
                details: { academicYearId, grades: created.map((item) => item.gradeLevel) }
            });
            return res.status(201).json({ success: true, data: created });
        }
        const feeStructure = await FeeStructure.create({
            tenantId: req.tenantId,
            branchId: normalizedTarget === 'SCHOOL_GRADE' ? undefined : branchId,
            targetType: normalizedTarget,
            gradeLevel: normalizedTarget === 'SCHOOL_GRADE' ? String(gradeLevel).trim() : undefined,
            classId: normalizedTarget === 'CLASS' ? classId : undefined,
            categoryId: normalizedTarget === 'CATEGORY' ? categoryId : undefined,
            academicYearId,
            name: String(name || '').trim() || 'Standard Fee Structure',
            ...MONTHLY_SCHEDULE,
            isOpen,
            feeItems: monthlyItems,
            totalAmount
        });

        await logActivity({
            req,
            action: 'FEE_STRUCTURE_CREATED',
            entityType: 'FeeStructure',
            entityId: feeStructure._id.toString(),
            after: feeStructure
        });

        res.status(201).json({ success: true, data: feeStructure });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400);
            throw new Error('A fee structure already exists for this target and academic year');
        }
        res.status(400);
        throw new Error(error.message);
    }
});

const getFeeStructures = asyncHandler(async (req, res) => {
    const { branchId, classId, categoryId, gradeLevel, academicYearId } = req.query;
    const query = { tenantId: req.tenantId };
    if (branchId) query.branchId = branchId;
    if (classId) query.classId = classId;
    if (categoryId) query.categoryId = categoryId;
    if (gradeLevel) query.gradeLevel = gradeLevel;
    if (academicYearId) query.academicYearId = academicYearId;

    const structures = await FeeStructure.find(query)
        .populate('branchId', 'name')
        .populate('classId', 'name')
        .populate('categoryId', 'name')
        .populate('academicYearId', 'name');
    
    res.json({ success: true, data: structures });
});

const getFeeStructureById = asyncHandler(async (req, res) => {
    const structure = await FeeStructure.findOne({ _id: req.params.id, tenantId: req.tenantId })
        .populate('branchId', 'name')
        .populate('classId', 'name')
        .populate('categoryId', 'name')
        .populate('academicYearId', 'name');

    if (!structure) {
        res.status(403);
        throw new Error('Access denied for this finance resource.');
    }
    res.json({ success: true, data: structure });
});

const updateFeeStructure = asyncHandler(async (req, res) => {
    const structure = await FeeStructure.findOne({ _id: req.params.id, tenantId: req.tenantId });

    if (!structure) {
        res.status(403);
        throw new Error('Access denied for this finance resource.');
    }

    const { name, feeItems } = req.body;
    const before = JSON.parse(JSON.stringify(structure));

    if (name !== undefined) {
        structure.name = String(name).trim() || 'Standard Fee Structure';
    }
    if (feeItems !== undefined) {
        if (invalidFeeItems(feeItems)) {
            res.status(400);
            throw new Error('feeItems must contain valid names and non-negative amounts');
        }
        // Saving items makes them the monthly fee, which is also how a structure from before
        // monthly billing becomes billable again.
        structure.feeItems = toMonthlyItems(feeItems);
        structure.totalAmount = sumItems(structure.feeItems);
        Object.assign(structure, MONTHLY_SCHEDULE);
    }

    await structure.save();

    await logActivity({
        req,
        action: 'FEE_STRUCTURE_UPDATED',
        entityType: 'FeeStructure',
        entityId: structure._id.toString(),
        before,
        after: structure
    });

    res.json({ success: true, data: structure });
});

const deleteFeeStructure = asyncHandler(async (req, res) => {
    const structure = await FeeStructure.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!structure) {
        res.status(403);
        throw new Error('Access denied for this finance resource.');
    }

    await structure.deleteOne();

    await logActivity({
        req,
        action: 'FEE_STRUCTURE_DELETED',
        entityType: 'FeeStructure',
        entityId: req.params.id
    });

    res.json({ success: true, message: 'Fee structure removed' });
});

/**
 * Open or close a fee structure. A closed structure is skipped by invoice generation;
 * invoices it already produced stay as they are. This is part of the finance policy, so it
 * is gated by the policy permission rather than by fee structure editing.
 */
const setFeeStructureOpen = asyncHandler(async (req, res) => {
    if (typeof req.body?.isOpen !== 'boolean') {
        res.status(400);
        throw new Error('isOpen must be true or false');
    }
    const structure = await FeeStructure.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!structure) {
        res.status(404);
        throw new Error('Fee structure not found in this school');
    }

    const before = { isOpen: structure.isOpen };
    structure.isOpen = req.body.isOpen;
    await structure.save();

    await logActivity({
        req,
        action: structure.isOpen ? 'FEE_STRUCTURE_OPENED' : 'FEE_STRUCTURE_CLOSED',
        entityType: 'FeeStructure',
        entityId: structure._id.toString(),
        before,
        after: { isOpen: structure.isOpen }
    });

    res.json({ success: true, data: structure });
});

// ==========================================
// B) Invoice Governance & Policies
// ==========================================

const getFinancePolicies = asyncHandler(async (req, res) => {
    let policy = await FinancePolicy.findOne({ tenantId: req.tenantId });
    if (!policy) {
        policy = await FinancePolicy.create({ tenantId: req.tenantId });
    }
    res.json({ success: true, data: policy });
});

const updateFinancePolicies = asyncHandler(async (req, res) => {
    const { dueDay } = req.body;
    if (dueDay !== undefined) {
        const day = Number(dueDay);
        if (!Number.isInteger(day) || day < 1 || day > 28) {
            res.status(400);
            throw new Error('The due day must be a whole number from 1 to 28');
        }
    }
    let policy = await FinancePolicy.findOne({ tenantId: req.tenantId });

    if (!policy) {
        policy = new FinancePolicy({ tenantId: req.tenantId });
    }

    const before = JSON.parse(JSON.stringify(policy));
    if (dueDay !== undefined) policy.dueDay = Number(dueDay);

    await policy.save();

    await logActivity({
        req,
        action: 'FINANCE_POLICY_UPDATED',
        entityType: 'FinancePolicy',
        entityId: policy._id.toString(),
        before,
        after: policy
    });

    res.json({ success: true, data: policy });
});

/**
 * The months an academic year can be billed for, e.g. September 2026 to June 2027.
 */
const getBillingMonths = asyncHandler(async (req, res) => {
    const { academicYearId } = req.query;
    const academicYear = academicYearId
        ? await AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId }).lean()
        : await AcademicYear.findOne({ tenantId: req.tenantId, isCurrent: true }).lean();
    if (!academicYear) {
        res.status(404);
        throw new Error('Academic year not found in this school');
    }
    res.json({
        success: true,
        data: {
            academicYear: { _id: academicYear._id, name: academicYear.name },
            months: listAcademicYearMonths(academicYear)
        }
    });
});

/**
 * Bill one month: the whole school, one campus, or one student.
 *
 * With dryRun the same summary comes back and nothing is written, which is what the page
 * shows before the finance officer confirms.
 */
const generateInvoices = asyncHandler(async (req, res) => {
    const { academicYearId, month, branchId, studentId, dueDate, dryRun } = req.body || {};
    const { summary, notify } = await generateMonthlyInvoices({
        tenantId: req.tenantId,
        academicYearId,
        month,
        branchId: branchId || null,
        studentId: studentId || null,
        dueDate: dueDate || null,
        dryRun: dryRun === true
    });

    if (!summary.dryRun) {
        await logActivity({
            req,
            action: 'INVOICES_GENERATED_MONTHLY',
            entityType: 'Invoice',
            details: {
                academicYearId,
                month: summary.month.key,
                branchId: branchId || null,
                studentId: studentId || null,
                created: summary.created,
                alreadyBilled: summary.alreadyBilled,
                totalAmount: summary.totalAmount
            }
        });
    }

    res.json({ success: true, data: summary });

    if (!summary.dryRun) {
        notify().catch((error) => console.error('[FINANCE] Invoice notifications failed:', error.message));
    }
});

// ==========================================
// C) Invoice Review
// ==========================================

const getInvoices = asyncHandler(async (req, res) => {
    const { branchId, academicYearId, status, studentId, q } = req.query;
    const query = { tenantId: req.tenantId };
    if (branchId) query.branchId = branchId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (status) query.status = status;
    if (studentId) query.studentId = studentId;
    if (q) {
        const search = escapeRegex(String(q).trim()).slice(0, 80);
        const students = await Student.find({
            tenantId: req.tenantId,
            $or: [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { admissionNumber: { $regex: search, $options: 'i' } }
            ]
        }).distinct('_id');
        query.studentId = { $in: students };
    }

    const invoices = await Invoice.find(query)
        .populate('studentId', 'firstName lastName admissionNumber')
        .populate('branchId', 'name')
        .populate('academicYearId', 'name')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: invoices });
});

const exportInvoices = asyncHandler(async (req, res) => {
    const { branchId, academicYearId, status, studentId, q } = req.query;
    const query = { tenantId: req.tenantId };
    if (branchId) query.branchId = branchId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (status) query.status = status;
    if (studentId) query.studentId = studentId;
    if (q) {
        const search = escapeRegex(String(q).trim()).slice(0, 80);
        const students = await Student.find({ tenantId: req.tenantId, $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { admissionNumber: { $regex: search, $options: 'i' } }
        ] }).distinct('_id');
        query.studentId = { $in: students };
    }

    const invoices = await Invoice.find(query)
        .populate('studentId', 'firstName lastName admissionNumber')
        .populate('branchId', 'name')
        .populate('academicYearId', 'name')
        .sort({ createdAt: -1 })
        .limit(5000);

    const csv = exportService.generateInvoicesCSV(invoices);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=invoices_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
});

const getInvoiceById = asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
        .populate('studentId', 'firstName lastName admissionNumber guardianInfo')
        .populate('branchId', 'name address phone email logoUrl receiptFooter')
        .populate('academicYearId', 'name');

    if (!invoice) {
        res.status(403);
        throw new Error('Access denied for this finance resource.');
    }

    // Fetch payments for this invoice under the same tenant
    const payments = await Payment.find({ invoiceId: invoice._id, tenantId: req.tenantId })
        .populate('recordedBy', 'name')
        .sort({ createdAt: -1 });

    const formattedPayments = payments.map(p => ({
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        status: p.status,
        recordedBy: p.recordedBy ? p.recordedBy.name : 'System',
        date: p.createdAt
    }));

    const invoiceObj = invoice.toObject();
    invoiceObj.payments = formattedPayments;

    res.json({ success: true, data: invoiceObj });
});

// ==========================================
// D) Payment Oversight
// ==========================================

const buildPaymentQuery = async (req) => {
    const { branchId, academicYearId, from, to, method, status, q } = req.query;
    const query = { tenantId: req.tenantId };
    if (branchId) query.branchId = branchId;
    if (method) query.method = method;
    if (status) query.status = status;
    let invoiceIds = null;
    if (academicYearId) invoiceIds = await Invoice.find({ tenantId: req.tenantId, academicYearId }).distinct('_id');
    if (invoiceIds) query.invoiceId = { $in: invoiceIds };
    if (q) {
        const search = escapeRegex(String(q).trim()).slice(0, 80);
        const studentIds = await Student.find({ tenantId: req.tenantId, $or: [
            { firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { admissionNumber: { $regex: search, $options: 'i' } }
        ] }).distinct('_id');
        const matchingInvoices = await Invoice.find({ tenantId: req.tenantId, studentId: { $in: studentIds }, ...(academicYearId ? { academicYearId } : {}) }).distinct('_id');
        query.$or = [{ reference: { $regex: search, $options: 'i' } }, { receiptNumber: { $regex: search, $options: 'i' } }, { invoiceId: { $in: matchingInvoices } }];
    }
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from);
        if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); query.createdAt.$lte = end; }
    }
    return query;
};

const getPayments = asyncHandler(async (req, res) => {
    const query = await buildPaymentQuery(req);

    const payments = await Payment.find(query)
        .populate({
            path: 'invoiceId',
            populate: { path: 'studentId', select: 'firstName lastName admissionNumber' }
        })
        .populate('recordedBy', 'name')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
});

const exportPayments = asyncHandler(async (req, res) => {
    const query = await buildPaymentQuery(req);

    const payments = await Payment.find(query)
        .populate({
            path: 'invoiceId',
            populate: { path: 'studentId', select: 'firstName lastName admissionNumber' }
        })
        .populate('recordedBy', 'name firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(5000);

    const csv = exportService.generatePaymentsCSV(payments);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=payments_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
});

const getPaymentsSummary = asyncHandler(async (req, res) => {
    const { branchId, academicYearId, from, to } = req.query;
    const match = {
        tenantId: new mongoose.Types.ObjectId(req.tenantId),
        status: { $in: ['ACTIVE', 'REVERSAL'] }
    };
    if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);
    if (from || to) {
        match.createdAt = {};
        if (from) match.createdAt.$gte = new Date(from);
        if (to) match.createdAt.$lte = new Date(to);
    }

    const scopedPaymentPipeline = [{ $match: match }];
    if (academicYearId) {
        scopedPaymentPipeline.push(
            {
                $lookup: {
                    from: 'invoices',
                    localField: 'invoiceId',
                    foreignField: '_id',
                    as: 'invoice'
                }
            },
            { $unwind: '$invoice' },
            {
                $match: {
                    'invoice.tenantId': new mongoose.Types.ObjectId(req.tenantId),
                    'invoice.academicYearId': new mongoose.Types.ObjectId(academicYearId)
                }
            }
        );
    }

    const summary = await Payment.aggregate([
        ...scopedPaymentPipeline,
        { 
            $group: { 
                _id: '$method', 
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            } 
        }
    ]);

    const branchTotals = await Payment.aggregate([
        ...scopedPaymentPipeline,
        {
            $group: {
                _id: '$branchId',
                total: { $sum: '$amount' }
            }
        }
    ]);

    res.json({ success: true, data: { byMethod: summary, byBranch: branchTotals } });
});

const buildOutstandingReport = async ({ req, limit = 10 }) => {
    const { branchId, academicYearId, classId, sectionId } = req.query;
    const match = { tenantId: new mongoose.Types.ObjectId(req.tenantId), status: { $ne: 'PAID' } };
    if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);
    if (academicYearId) match.academicYearId = new mongoose.Types.ObjectId(academicYearId);
    let scopedStudentIds = null;
    if (classId || sectionId) {
        const enrollmentQuery = { tenantId: req.tenantId };
        if (branchId) enrollmentQuery.branchId = branchId;
        if (academicYearId) enrollmentQuery.academicYearId = academicYearId;
        if (classId) enrollmentQuery.classId = classId;
        if (sectionId) enrollmentQuery.sectionId = sectionId;
        scopedStudentIds = await Enrollment.find(enrollmentQuery).distinct('studentId');
        match.studentId = { $in: scopedStudentIds.map(id => new mongoose.Types.ObjectId(id)) };
    }

    const outstanding = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalOutstanding: { $sum: '$balance' },
                count: { $sum: 1 }
            }
        }
    ]);

    const findQuery = { tenantId: req.tenantId, status: { $ne: 'PAID' } };
    if (branchId) findQuery.branchId = branchId;
    if (academicYearId) findQuery.academicYearId = academicYearId;
    if (scopedStudentIds) findQuery.studentId = { $in: scopedStudentIds };

    const debtors = await Invoice.find(findQuery)
        .sort({ balance: -1 })
        .limit(limit)
        .populate('studentId', 'firstName lastName admissionNumber')
        .populate('branchId', 'name')
        .populate('academicYearId', 'name');

    const enrollmentPairs = debtors.filter(d => d.studentId && d.academicYearId).map(d => ({ studentId: d.studentId._id, academicYearId: d.academicYearId?._id || d.academicYearId }));
    let debtorEnrollments = [];
    if (enrollmentPairs.length && mongoose.connection.readyState !== 0) {
        debtorEnrollments = await Enrollment.find({ tenantId: req.tenantId, $or: enrollmentPairs }).populate('classId', 'name').populate('sectionId', 'name');
    } else if (enrollmentPairs.length) {
        debtorEnrollments = (await Promise.all(enrollmentPairs.map(pair => Enrollment.findOne({ tenantId: req.tenantId, ...pair }).populate('classId', 'name').populate('sectionId', 'name')))).filter(Boolean);
    }
    const enrollmentMap = new Map();
    if (mongoose.connection.readyState === 0) {
        debtorEnrollments.forEach((item, index) => enrollmentMap.set(`${enrollmentPairs[index]?.studentId}:${enrollmentPairs[index]?.academicYearId}`, item));
    } else {
        debtorEnrollments.forEach(item => enrollmentMap.set(`${item.studentId}:${item.academicYearId?._id || item.academicYearId}`, item));
    }
    const formattedDebtors = debtors.map((d) => {
        const enrollment = enrollmentMap.get(`${d.studentId?._id}:${d.academicYearId?._id || d.academicYearId}`);
        return {
            studentId: d.studentId?._id || null,
            studentName: d.studentId ? `${d.studentId.firstName} ${d.studentId.lastName}` : 'Unknown Student',
            admissionNumber: d.studentId ? d.studentId.admissionNumber : '-',
            branchName: d.branchId ? d.branchId.name : '-',
            className: enrollment?.classId?.name || '-',
            sectionName: enrollment?.sectionId?.name || '-',
            balance: d.balance,
            oldestDueDate: d.dueDate || d.createdAt,
            count: 1
        };
    });

    return {
        totalOutstanding: outstanding[0]?.totalOutstanding || 0,
        count: outstanding[0]?.count || 0,
        debtors: formattedDebtors
    };
};

const getOutstandingBalances = asyncHandler(async (req, res) => {
    const report = await buildOutstandingReport({ req, limit: 10 });
    res.json({ success: true, data: report });
});

const exportOutstandingBalances = asyncHandler(async (req, res) => {
    const report = await buildOutstandingReport({ req, limit: 5000 });
    const csv = exportService.generateDebtorsCSV(report.debtors);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=debtors_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
});

// Retained as a controller-level compatibility boundary for security tests and
// internal consumers. The preview-only Finance Director route/UI is removed.
const getReceiptBranding = asyncHandler(async (req, res) => {
    const branch = await Branch.findOne({ _id: req.params.branchId, tenantId: req.tenantId });
    if (!branch) {
        res.status(403);
        throw new Error('Access denied for this finance resource.');
    }
    res.json({ success: true, data: { branchId: branch._id, name: branch.name, branchName: branch.name, address: branch.address || '', phone: branch.phone || '', logoUrl: branch.logoUrl || '', receiptFooter: branch.receiptFooter || '' } });
});

const getFinanceClasses = asyncHandler(async (req, res) => {
    const query = { tenantId: req.tenantId };
    if (req.query.branchId) query.branchId = req.query.branchId;
    res.json({ success: true, data: await Class.find(query).select('name branchId').sort({ name: 1 }) });
});

const getFinanceSections = asyncHandler(async (req, res) => {
    const query = { tenantId: req.tenantId };
    if (req.query.branchId) query.branchId = req.query.branchId;
    if (req.query.classId) query.classId = req.query.classId;
    res.json({ success: true, data: await Section.find(query).select('name classId branchId').sort({ name: 1 }) });
});

/**
 * Find a student to bill on their own: by name or admission number, with their class in
 * the chosen year so the finance officer can tell two students of the same name apart.
 */
const searchBillingStudents = asyncHandler(async (req, res) => {
    const tokens = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
    if (!tokens.length || tokens.join('').length < 2) return res.json({ success: true, data: [] });

    const students = await Student.find({
        tenantId: req.tenantId,
        $and: tokens.map((token) => {
            const pattern = { $regex: escapeRegex(token).slice(0, 40), $options: 'i' };
            return { $or: [{ firstName: pattern }, { lastName: pattern }, { admissionNumber: pattern }] };
        })
    }).select('firstName lastName admissionNumber status').limit(20).lean();

    const academicYearId = mongoose.isValidObjectId(req.query.academicYearId) ? req.query.academicYearId : null;
    const enrollments = academicYearId
        ? await Enrollment.find({ tenantId: req.tenantId, academicYearId, isCurrent: true, studentId: { $in: students.map((student) => student._id) } })
            .populate('classId', 'name')
            .select('studentId classId')
            .lean()
        : [];
    const classByStudent = new Map(enrollments.map((enrollment) => [String(enrollment.studentId), enrollment.classId?.name || null]));

    res.json({
        success: true,
        data: students.map((student) => ({
            _id: student._id,
            name: `${student.firstName} ${student.lastName}`.trim(),
            admissionNumber: student.admissionNumber,
            status: student.status,
            className: classByStudent.get(String(student._id)) || null
        }))
    });
});

// ==========================================
// E2) Monthly collection and student payment records
// ==========================================

const monthlyCollectionQuery = (req) => ({
    tenantId: req.tenantId,
    academicYearId: req.query.academicYearId,
    month: req.query.month,
    branchId: req.query.branchId || null,
    classId: req.query.classId || null,
    status: req.query.status || null,
    q: req.query.q || ''
});

/**
 * One month for the whole school: who paid, who paid part, who has not paid, and what each
 * student still owes from earlier months.
 */
const getMonthlyCollectionReport = asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getMonthlyCollection(monthlyCollectionQuery(req)) });
});

const STATUS_WORDS = { PAID: 'Paid', PARTIALLY_PAID: 'Part paid', UNPAID: 'Not paid' };

/**
 * The same month as an Excel file: a summary sheet and one row per student, with the same
 * filters the page has applied.
 */
const exportMonthlyCollection = asyncHandler(async (req, res) => {
    const report = await getMonthlyCollection(monthlyCollectionQuery(req));
    const tenant = await Tenant.findById(req.tenantId).select('name').lean();
    const { totals, rows, month } = report;

    const header = ['Student', 'Admission no.', 'Class', 'Billed', 'Paid', 'Still owed (month)', 'Status', 'Due date', 'Late', 'Earlier months owed', 'Total owed']
        .map((label) => ({ v: label, style: 'header' }));
    const studentRows = rows.map((row) => [
        row.studentName,
        row.admissionNumber,
        row.className,
        { v: row.billed, style: 'money' },
        { v: row.paid, style: 'money' },
        { v: row.balance, style: 'money' },
        STATUS_WORDS[row.status] || row.status,
        row.dueDate ? new Date(row.dueDate) : null,
        row.late ? 'Yes' : '',
        { v: row.earlierDebt, style: 'money' },
        { v: row.totalOwed, style: 'money' }
    ]);
    const shown = (pick) => rows.reduce((total, row) => total + Math.round(pick(row) * 100), 0) / 100;
    const totalRow = [
        { v: `Total (${rows.length} students)`, style: 'bold' }, '', '',
        { v: shown((row) => row.billed), style: 'moneyBold' },
        { v: shown((row) => row.paid), style: 'moneyBold' },
        { v: shown((row) => row.balance), style: 'moneyBold' },
        '', '', '',
        { v: shown((row) => row.earlierDebt), style: 'moneyBold' },
        { v: shown((row) => row.totalOwed), style: 'moneyBold' }
    ];

    const summary = [
        [{ v: tenant?.name || 'School', style: 'title' }],
        [`School fees for ${month.label}`],
        [`Downloaded ${new Date().toISOString().slice(0, 10)}`],
        [],
        [{ v: 'Students billed', style: 'bold' }, { v: totals.students, style: 'integer' }],
        [{ v: 'Billed this month', style: 'bold' }, { v: totals.billed, style: 'money' }],
        [{ v: 'Collected', style: 'bold' }, { v: totals.collected, style: 'money' }],
        [{ v: 'Collected (percent)', style: 'bold' }, { v: totals.collectionRate, style: 'percent' }],
        [{ v: 'Still owed this month', style: 'bold' }, { v: totals.outstanding, style: 'money' }],
        [{ v: 'Owed from earlier months', style: 'bold' }, { v: totals.earlierDebt, style: 'money' }],
        [{ v: 'Total owed', style: 'bold' }, { v: totals.totalOwed, style: 'moneyBold' }],
        [],
        [{ v: 'Paid in full', style: 'bold' }, { v: totals.counts.paid, style: 'integer' }],
        [{ v: 'Paid part', style: 'bold' }, { v: totals.counts.partial, style: 'integer' }],
        [{ v: 'Not paid', style: 'bold' }, { v: totals.counts.unpaid, style: 'integer' }],
        [{ v: 'Late (past due date)', style: 'bold' }, { v: totals.counts.late, style: 'integer' }]
    ];

    const file = buildWorkbook([
        { name: 'Summary', columns: [{ width: 30 }, { width: 18 }], rows: summary },
        {
            name: 'Students',
            freezeRows: 1,
            columns: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 11 }, { width: 13 }, { width: 7 }, { width: 20 }, { width: 13 }],
            rows: [header, ...studentRows, [], totalRow]
        }
    ]);

    await logActivity({
        req,
        action: 'MONTHLY_COLLECTION_EXPORTED',
        entityType: 'Invoice',
        details: { month: month.key, rows: rows.length }
    });

    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="fees-${month.key}.xlsx"`);
    res.send(file);
});

const getStudentPaymentRecordController = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: await getStudentPaymentRecord({ tenantId: req.tenantId, studentId: req.params.studentId })
    });
});

// ==========================================
// F) Reports
// ==========================================

const getRevenueReportController = asyncHandler(async (req, res) => {
    const { branchId, academicYearId, groupBy } = req.query;
    const report = await getRevenueReport({
        tenantId: req.tenantId,
        branchId,
        academicYearId,
        groupBy
    });

    res.json({ success: true, data: report });
});

module.exports = {
    createFeeStructure, getFeeStructures, getFeeStructureById, updateFeeStructure, deleteFeeStructure,
    getFinancePolicies, updateFinancePolicies, setFeeStructureOpen, getBillingMonths, generateInvoices,
    getInvoices, getInvoiceById, exportInvoices,
    getPayments, exportPayments, getPaymentsSummary, getOutstandingBalances, exportOutstandingBalances, getFinanceClasses, getFinanceSections, searchBillingStudents,
    getMonthlyCollectionReport, exportMonthlyCollection, getStudentPaymentRecordController,
    getReceiptBranding,
    getRevenueReport: getRevenueReportController
};
