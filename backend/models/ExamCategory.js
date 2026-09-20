const mongoose = require('mongoose');

const examCategorySchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true }, // e.g. "Midterm", "Final", "Quiz 1"
    maxScore: { type: Number, required: true, default: 100, min: 1, max: 100 },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

examCategorySchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ExamCategory', examCategorySchema);
