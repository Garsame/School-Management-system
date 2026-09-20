const mongoose = require('mongoose');

const classCategorySchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

classCategorySchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ClassCategory', classCategorySchema);
