const mongoose = require('mongoose');

const subscriptionInvoiceSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    planSlug: { type: String, required: true, trim: true, lowercase: true },
    invoiceNumber: { type: String, required: true, unique: true },
    billingEmail: { type: String, trim: true, lowercase: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    currency: { type: String, default: 'USD', trim: true, uppercase: true },
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    balance: { type: Number, required: true, min: 0 },
    status: {
        type: String,
        enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'],
        default: 'ISSUED'
    },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

subscriptionInvoiceSchema.index({ tenantId: 1, billingCycle: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
subscriptionInvoiceSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
