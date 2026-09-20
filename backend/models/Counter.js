const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    key: { type: String, required: true }, // e.g., "studentCode"
    seq: { type: Number, default: 0 }
});

counterSchema.index({ tenantId: 1, branchId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
