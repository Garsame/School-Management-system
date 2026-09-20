const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    period: { type: String },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    createdAt: { type: Date, default: Date.now }
});

// Unique session per tenant, branch, class, date, period, academicYear
attendanceSessionSchema.index({ tenantId: 1, branchId: 1, classId: 1, academicYearId: 1, date: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
