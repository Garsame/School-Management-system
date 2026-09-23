const mongoose = require('mongoose');

const quranProgressSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (UTC)
    learningStage: {
        type: String,
        enum: ['READING', 'MEMORIZING'],
        default: 'READING'
    },
    juz: { type: Number, min: 1, max: 30 },
    surahNumber: { type: Number, min: 1, max: 114 },
    surahName: { type: String, trim: true },
    startAyah: { type: Number, min: 1 },
    endAyah: { type: Number, min: 1 },
    notes: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
});

quranProgressSchema.index({ tenantId: 1, branchId: 1, studentId: 1, date: -1 });
quranProgressSchema.index({ tenantId: 1, branchId: 1, teacherUserId: 1, date: -1 });

module.exports = mongoose.model('QuranProgress', quranProgressSchema);
