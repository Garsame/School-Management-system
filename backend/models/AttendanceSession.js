const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: function () {
            return this.sessionType !== 'DUGSI';
        }
    },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sessionType: {
        type: String,
        enum: ['SCHOOL', 'DUGSI'],
        default: 'SCHOOL'
    },
    date: { type: String, required: true }, // YYYY-MM-DD
    period: { type: String },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    createdAt: { type: Date, default: Date.now }
});

// Unique school session per class, date, period
attendanceSessionSchema.index(
    { tenantId: 1, branchId: 1, classId: 1, academicYearId: 1, date: 1, period: 1 },
    { unique: true, partialFilterExpression: { sessionType: 'SCHOOL' } }
);

// Unique Dugsi session per teacher, date, period
attendanceSessionSchema.index(
    { tenantId: 1, branchId: 1, teacherUserId: 1, academicYearId: 1, date: 1, period: 1 },
    { unique: true, partialFilterExpression: { sessionType: 'DUGSI' } }
);

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
