const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const FeeStructure = require('../models/FeeStructure');
const Enrollment = require('../models/Enrollment');
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { createNotification } = require('./notificationService');
const { resolveBillingPeriod } = require('../utils/billingPeriods');

/**
 * Service to handle bulk invoice generation logic
 */
const generateBulkInvoices = async ({ tenantId, branchId, academicYearId, classId, studentId, feeStructureId, billingPeriodKey, dueDate }) => {
    const query = { tenantId, academicYearId };
    if (branchId) query.branchId = branchId;
    if (classId) query.classId = classId;
    if (studentId) query.studentId = studentId;

    // 1. Get enrollments
    const enrollments = await Enrollment.find(query);
    if (enrollments.length === 0) return { created: 0, skipped: 0, message: 'No enrollments found' };

    let createdCount = 0;
    let skippedCount = 0;

    for (const enrollment of enrollments) {
        try {
            const enrolledClass = await Class.findOne({ _id: enrollment.classId, tenantId });
            const base = { tenantId, branchId: enrollment.branchId, academicYearId };
            let feeStructure;
            if (feeStructureId) {
                feeStructure = await FeeStructure.findOne({ _id: feeStructureId, tenantId, academicYearId });
                const matches = feeStructure && (
                    (feeStructure.targetType === 'SCHOOL_GRADE' && String(feeStructure.gradeLevel) === String(enrolledClass?.gradeLevel)) ||
                    ((!feeStructure.targetType || feeStructure.targetType === 'CLASS') && String(feeStructure.classId) === String(enrollment.classId)) ||
                    (feeStructure.targetType === 'CATEGORY' && String(feeStructure.categoryId) === String(enrolledClass?.categoryId))
                );
                if (!matches) feeStructure = null;
            } else {
                feeStructure = await FeeStructure.findOne({ ...base, targetType: 'CLASS', classId: enrollment.classId });
                if (!feeStructure && enrolledClass?.categoryId) {
                    feeStructure = await FeeStructure.findOne({ ...base, targetType: 'CATEGORY', categoryId: enrolledClass.categoryId });
                }
                if (!feeStructure && enrolledClass?.gradeLevel) {
                    feeStructure = await FeeStructure.findOne({ tenantId, academicYearId, targetType: 'SCHOOL_GRADE', gradeLevel: String(enrolledClass.gradeLevel) });
                }
            }

            if (!feeStructure) {
                skippedCount++;
                continue; // No fee structure defined for this class
            }

            const billingPeriod = resolveBillingPeriod(feeStructure, billingPeriodKey);
            const existing = await Invoice.findOne({
                tenantId,
                branchId: enrollment.branchId,
                studentId: enrollment.studentId,
                academicYearId,
                billingPeriodKey: billingPeriod.key
            });

            if (existing) {
                skippedCount++;
                continue;
            }

            // Create Invoice
            await Invoice.create({
                tenantId,
                branchId: enrollment.branchId,
                studentId: enrollment.studentId,
                academicYearId,
                feeStructureId: feeStructure._id,
                billingPeriodKey: billingPeriod.key,
                billingPeriodLabel: billingPeriod.label,
                items: billingPeriod.items,
                totalAmount: billingPeriod.amount,
                balance: billingPeriod.amount,
                dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                status: 'UNPAID'
            });

            // Dispatch Notifications
            try {
                const studentUser = await User.findOne({ studentId: enrollment.studentId, tenantId });
                if (studentUser) {
                    await createNotification({
                        tenantId,
                        recipientId: studentUser._id,
                        title: `School Fee Invoice Generated`,
                        message: `A ${billingPeriod.label} invoice of $${billingPeriod.amount} has been generated for your school fees.`,
                        type: 'Invoice'
                    });
                }

                const parentUser = await User.findOne({ students: enrollment.studentId, tenantId });
                if (parentUser) {
                    const student = await Student.findOne({ _id: enrollment.studentId, tenantId, branchId: enrollment.branchId });
                    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Your child';
                    await createNotification({
                        tenantId,
                        recipientId: parentUser._id,
                        title: `Fee Invoice Alert: ${studentName}`,
                        message: `A ${billingPeriod.label} invoice of $${billingPeriod.amount} has been generated for ${studentName}'s school fees.`,
                        type: 'Invoice'
                    });
                }
            } catch (notifyErr) {
                console.error('[FINANCE SERVICE] Failed to dispatch invoice notification:', notifyErr);
            }

            createdCount++;
        } catch (error) {
            console.error(`[FINANCE SERVICE] Bulk Invoice Item Error: ${error.message}`);
            skippedCount++;
        }
    }

    return { created: createdCount, skipped: skippedCount };
};

/**
 * Service for revenue reports
 */
const getRevenueReport = async ({ tenantId, branchId, academicYearId, groupBy }) => {
    const match = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);
    if (academicYearId) match.academicYearId = new mongoose.Types.ObjectId(academicYearId);

    const pipeline = [
        { $match: match }
    ];

    if (groupBy === 'class') {
        pipeline.push(
            {
                $lookup: {
                    from: 'enrollments',
                    let: { studentId: '$studentId', academicYearId: '$academicYearId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$studentId', '$$studentId'] },
                                        { $eq: ['$academicYearId', '$$academicYearId'] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'enrollment'
                }
            },
            { $unwind: { path: '$enrollment', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$enrollment.classId',
                    totalRevenue: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$paidAmount' },
                    totalBalance: { $sum: '$balance' },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'classes',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'classDoc'
                }
            },
            { $unwind: { path: '$classDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    totalRevenue: 1,
                    totalPaid: 1,
                    totalBalance: 1,
                    count: 1,
                    _id: { $ifNull: ['$classDoc.name', 'Unknown Class'] }
                }
            }
        );
    } else if (groupBy === 'year') {
        pipeline.push(
            {
                $group: {
                    _id: '$academicYearId',
                    totalRevenue: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$paidAmount' },
                    totalBalance: { $sum: '$balance' },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'academicyears',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'yearDoc'
                }
            },
            { $unwind: { path: '$yearDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    totalRevenue: 1,
                    totalPaid: 1,
                    totalBalance: 1,
                    count: 1,
                    _id: { $ifNull: ['$yearDoc.name', 'Unknown Year'] }
                }
            }
        );
    } else {
        pipeline.push(
            {
                $group: {
                    _id: '$branchId',
                    totalRevenue: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$paidAmount' },
                    totalBalance: { $sum: '$balance' },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'branches',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'branchDoc'
                }
            },
            { $unwind: { path: '$branchDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    totalRevenue: 1,
                    totalPaid: 1,
                    totalBalance: 1,
                    count: 1,
                    _id: { $ifNull: ['$branchDoc.name', 'Unknown Branch'] }
                }
            }
        );
    }

    return await Invoice.aggregate(pipeline);
};

module.exports = {
    generateBulkInvoices,
    getRevenueReport
};
