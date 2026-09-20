const mongoose = require('mongoose');

const academicYearSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true }, // e.g. "2023-2024"
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Only one isCurrent per tenant
academicYearSchema.index({ tenantId: 1, isCurrent: 1 });

module.exports = mongoose.model('AcademicYear', academicYearSchema);
