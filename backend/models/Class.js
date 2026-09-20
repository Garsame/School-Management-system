const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassCategory', required: true },
    name: { type: String, required: true }, // e.g. "Primary 1", "Grade 1"
    gradeLevel: { type: String, required: true }, // e.g. "1"
    createdAt: { type: Date, default: Date.now }
});

// Performance and uniqueness
classSchema.index({ tenantId: 1, branchId: 1, name: 1 });

module.exports = mongoose.model('Class', classSchema);
