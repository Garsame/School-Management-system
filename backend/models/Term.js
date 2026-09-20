const mongoose = require('mongoose');

const termSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true, trim: true },
    sequence: { type: Number, required: true, min: 1 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

termSchema.index({ tenantId: 1, academicYearId: 1, name: 1 }, { unique: true });
termSchema.index({ tenantId: 1, academicYearId: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model('Term', termSchema);
