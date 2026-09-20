const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    logoUrl: { type: String },
    receiptFooter: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Index for multi-tenant and multi-branch queries
branchSchema.index({ tenantId: 1, code: 1 }, { unique: true });
branchSchema.index({ tenantId: 1 });

module.exports = mongoose.model('Branch', branchSchema);
