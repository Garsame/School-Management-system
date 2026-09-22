const Invoice = require('../models/Invoice');
const mongoose = require('mongoose');

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
    getRevenueReport
};
