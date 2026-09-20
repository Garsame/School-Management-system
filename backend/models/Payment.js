const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true }, // e.g., Cash, Bank, Online
    reference: { type: String },
    receiptNumber: { type: String },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'ACTIVE', 'REVERSED', 'REVERSAL'], default: 'ACTIVE' },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    reversalReason: { type: String },
    reversedAt: { type: Date },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

paymentSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 });
paymentSchema.index({ tenantId: 1, invoiceId: 1 });
paymentSchema.index(
    { reversalOf: 1 },
    { unique: true, partialFilterExpression: { reversalOf: { $type: 'objectId' } } }
);
paymentSchema.index(
    { tenantId: 1, branchId: 1, receiptNumber: 1 },
    { 
        unique: true, 
        partialFilterExpression: { 
            receiptNumber: { $type: 'string' },
            status: 'ACTIVE'
        } 
    }
);

module.exports = mongoose.model('Payment', paymentSchema);
