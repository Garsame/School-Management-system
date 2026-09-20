const mongoose = require('mongoose');

const compensationSchema = new mongoose.Schema({
    employmentType: { type: String, enum: ['Permanent', 'Contract', 'Part-time', 'Temporary', 'Volunteer'] },
    hireDate: { type: Date },
    basicSalary: { type: Number, min: 0, default: 0 },
    allowance: { type: Number, min: 0, default: 0 },
    deductions: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: 'USD' },
    paymentMethod: { type: String, enum: ['Bank', 'Mobile Money', 'Cash', 'Other'] },
    bankName: { type: String, trim: true },
    accountName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    mobileMoneyNumber: { type: String, trim: true }
}, { _id: false });

const compensationChangeRequestSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    currentCompensation: { type: compensationSchema, required: true },
    proposedCompensation: { type: compensationSchema, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Approved', 'Rejected'],
        default: 'Pending',
        index: true
    },
    isOpen: { type: Boolean, default: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewRemarks: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true });

compensationChangeRequestSchema.index(
    { tenantId: 1, employeeId: 1, isOpen: 1 },
    { unique: true, partialFilterExpression: { isOpen: true } }
);
compensationChangeRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('CompensationChangeRequest', compensationChangeRequestSchema);
