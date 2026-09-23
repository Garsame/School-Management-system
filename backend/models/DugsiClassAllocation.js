const mongoose = require('mongoose');

const dugsiClassAllocationSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

dugsiClassAllocationSchema.index(
    { tenantId: 1, branchId: 1, academicYearId: 1, teacherUserId: 1, classId: 1 },
    { unique: true }
);

module.exports = mongoose.model('DugsiClassAllocation', dugsiClassAllocationSchema);
