const mongoose = require('mongoose');

const examTemplateSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true },
    maxScore: { type: Number, default: 100, min: 100, max: 100 },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

examTemplateSchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ExamTemplate', examTemplateSchema);
