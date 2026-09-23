const mongoose = require('mongoose');

const dugsiEnrollmentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    learningStage: {
        type: String,
        enum: ['READING', 'MEMORIZING'],
        default: 'READING'
    },
    currentJuz: { type: Number, min: 1, max: 30, default: 1 },
    currentSurah: { type: Number, min: 1, max: 114, default: 1 },
    status: {
        type: String,
        enum: ['ACTIVE', 'WITHDRAWN'],
        default: 'ACTIVE'
    },
    joinedDate: { type: Date, default: Date.now },
    withdrawnDate: { type: Date },
    withdrawnReason: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
});

// A student can only have ONE active Dugsi enrollment per academic year
dugsiEnrollmentSchema.index(
    { tenantId: 1, branchId: 1, academicYearId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

// Fast query by teacher and academic year
dugsiEnrollmentSchema.index({ tenantId: 1, branchId: 1, academicYearId: 1, teacherUserId: 1, status: 1 });

module.exports = mongoose.model('DugsiEnrollment', dugsiEnrollmentSchema);
