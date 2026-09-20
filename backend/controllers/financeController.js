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
const { generateBulkInvoices, getRevenueReport } = require('../services/financeService');
const { normalizeBillingSchedule, resolveBillingPeriod } = require('../utils/billingPeriods');
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

const createFeeStructure = asyncHandler(async (req, res) => {
    const { name, branchId, classId, categoryId, gradeLevel, targetType = 'CLASS', academicYearId, feeItems, billingFrequency, billingPeriods } = req.body;
    const normalizedTarget = String(targetType).toUpperCase();

    const missingTarget = normalizedTarget === 'SCHOOL_GRADE' ? !gradeLevel : (normalizedTarget === 'CLASS' ? !classId : !categoryId);
    if (!academicYearId || !feeItems || missingTarget || (normalizedTarget !== 'SCHOOL_GRADE' && !branchId)) {
        res.status(400);
        throw new Error('Please provide a branch, academic year, fee items, and fee target');
    }
    if (!Array.isArray(feeItems) || feeItems.length === 0 || feeItems.some((item) => !item.name || Number(item.amount) < 0)) {
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

    const totalAmount = feeItems.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
    let schedule;
    try {
        schedule = normalizeBillingSchedule({ billingFrequency, billingPeriods, totalAmount });
    } catch (error) {
        res.status(400);
        throw error;
    }

    try {
        if (normalizedTarget === 'SCHOOL_GRADE' && String(gradeLevel).toUpperCase() === 'ALL') {
            const created = await FeeStructure.insertMany(Array.from({ length: 12 }, (_, index) => ({
                tenantId: req.tenantId,
                targetType: 'SCHOOL_GRADE',
                gradeLevel: String(index + 1),
                academicYearId,
                name: `${String(name || '').trim() || 'Standard School Fees'} - Grade ${index + 1}`,
                ...schedule,
                feeItems,
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
            ...schedule,
            feeItems,
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

    const { name, feeItems, billingFrequency, billingPeriods } = req.body;
    const before = JSON.parse(JSON.stringify(structure));

    if (name !== undefined) {
        structure.name = String(name).trim() || 'Standard Fee Structure';
    }
    if (feeItems) {
        if (!Array.isArray(feeItems) || feeItems.length === 0 || feeItems.some((item) => !item.name || Number(item.amount) < 0)) {
            res.status(400);
            throw new Error('feeItems must contain valid names and non-negative amounts');
        }
        structure.feeItems = feeItems;
        structure.totalAmount = feeItems.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
    }
    if (billingFrequency !== undefined || billingPeriods !== undefined || feeItems) {
        let schedule;
        try {
            schedule = normalizeBillingSchedule({
                billingFrequency: billingFrequency ?? structure.billingFrequency,
                billingPeriods: billingPeriods ?? structure.billingPeriods,
                totalAmount: structure.totalAmount
            });
        } catch (error) {
            res.status(400);
            throw error;
        }
        structure.billingFrequency = schedule.billingFrequency;
        structure.billingPeriods = schedule.billingPeriods;
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
    const { autoInvoiceMode, isEnabled } = req.body;
    let policy = await FinancePolicy.findOne({ tenantId: req.tenantId });

    if (!policy) {
        policy = new FinancePolicy({ tenantId: req.tenantId });
    }

    const before = JSON.parse(JSON.stringify(policy));
    if (autoInvoiceMode) policy.autoInvoiceMode = autoInvoiceMode;
    if (isEnabled !== undefined) policy.isEnabled = isEnabled;

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

const triggerBulkInvoices = asyncHandler(async (req, res) => {
    const { branchId, academicYearId, classId, studentId, feeStructureId, billingPeriodKey, dueDate } = req.body;

    if (!academicYearId) {
        res.status(400);
        throw new Error('academicYearId is required for invoice generation');
    }

    // Check target: must have classId or studentId. If both are missing, fail.
    if (!classId && !studentId) {
        res.status(400);
        throw new Error('Invalid invoice generation target.');
    }

    // Validate dueDate if provided
    if (dueDate && isNaN(Date.parse(dueDate))) {
        res.status(400);
        throw new Error('Invalid due date format.');
    }

    try {
        await validateFinanceContext({ tenantId: req.tenantId, branchId, classId, academicYearId, studentId });
    } catch (error) {
        if (error.status === 403) {
            throw error; // keep 403 Access denied
        }
        res.status(400);
        throw new Error('Invalid invoice generation target.');
    }

    let selectedFeeStructure = null;
    if (feeStructureId) {
        const structureQuery = {
            _id: feeStructureId,
            tenantId: req.tenantId,
            academicYearId
        };
        if (branchId) structureQuery.$or = [{ branchId }, { targetType: 'SCHOOL_GRADE' }];
        selectedFeeStructure = await FeeStructure.findOne(structureQuery);
        if (!selectedFeeStructure) {
            res.status(403);
            throw new Error('Access denied for this finance resource.');
        }

        if (studentId) {
            const targetClassIds = selectedFeeStructure.targetType === 'SCHOOL_GRADE'
                ? await require('../models/Class').find({ tenantId: req.tenantId, gradeLevel: selectedFeeStructure.gradeLevel }).distinct('_id')
                : selectedFeeStructure.targetType === 'CATEGORY'
                ? await require('../models/Class').find({ tenantId: req.tenantId, branchId: selectedFeeStructure.branchId, categoryId: selectedFeeStructure.categoryId }).distinct('_id')
                : [selectedFeeStructure.classId];
            const matchingEnrollment = await Enrollment.exists({
                tenantId: req.tenantId,
                studentId,
                academicYearId,
                branchId: selectedFeeStructure.branchId,
                classId: { $in: targetClassIds }
            });
            if (!matchingEnrollment) {
                res.status(400);
                throw new Error('Selected fee structure does not match the student enrollment.');
            }
        }

        try {
            resolveBillingPeriod(selectedFeeStructure, billingPeriodKey);
        } catch (error) {
            res.status(400);
            throw error;
        }
    }

    const result = await generateBulkInvoices({
        tenantId: req.tenantId,
        branchId: branchId || selectedFeeStructure?.branchId,
        academicYearId,
        classId,
        studentId,
        feeStructureId,
        billingPeriodKey,
        dueDate
    });

    await logActivity({
        req,
        action: 'INVOICES_GENERATED_BULK',
        entityType: 'Invoice',
        details: { ...req.body, ...result }
    });

    res.json({ success: true, ...result });
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
    getFinancePolicies, updateFinancePolicies, triggerBulkInvoices,
    getInvoices, getInvoiceById, exportInvoices,
    getPayments, exportPayments, getPaymentsSummary, getOutstandingBalances, exportOutstandingBalances, getFinanceClasses, getFinanceSections,
    getReceiptBranding,
    getRevenueReport: getRevenueReportController
};
