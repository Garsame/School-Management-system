const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    status: { 
        type: String, 
        enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'], 
        default: 'PRESENT' 
    },
    createdAt: { type: Date, default: Date.now }
});

attendanceRecordSchema.index({ tenantId: 1, branchId: 1, sessionId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
