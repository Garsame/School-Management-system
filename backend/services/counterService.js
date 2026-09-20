const Counter = require('../models/Counter');

/**
 * Generates an incremental student code like STD-001, STD-002...
 */
exports.getNextStudentCode = async (tenantId, branchId) => {
    const counter = await Counter.findOneAndUpdate(
        { tenantId, branchId, key: 'studentCode' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const paddedSeq = counter.seq.toString().padStart(3, '0');
    return `STD-${paddedSeq}`;
};

/**
 * Generates an incremental receipt number like REC-000001, REC-000002...
 */
exports.getNextReceiptNumber = async (tenantId, branchId) => {
    const counter = await Counter.findOneAndUpdate(
        { tenantId, branchId, key: 'receiptNumber' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const paddedSeq = counter.seq.toString().padStart(6, '0');
    return `REC-${paddedSeq}`;
};
