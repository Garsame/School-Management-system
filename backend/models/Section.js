const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    name: { type: String, required: true }, // e.g. "A", "B", "Blue", "Red"
    roomNumber: String,
    capacity: Number,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

sectionSchema.index({ tenantId: 1, branchId: 1, classId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Section', sectionSchema);
