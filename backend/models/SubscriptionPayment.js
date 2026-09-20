const mongoose = require('mongoose');

const subscriptionPaymentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionInvoice', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
        type: String,
        enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER'],
        required: true
    },
    reference: { type: String, trim: true },
    receiptNumber: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'REVERSED'], default: 'ACTIVE' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reversedAt: { type: Date },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reversalReason: { type: String, trim: true }
}, { timestamps: true });

subscriptionPaymentSchema.index(
    { receiptNumber: 1 },
    { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' }, status: 'ACTIVE' } }
);
subscriptionPaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
