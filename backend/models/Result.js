const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    marksObtained: { type: Number, default: 0 },
    maxScore: { type: Number, default: 100, min: 1, max: 100 },
    percentage: { type: Number, default: 0 },
    passMarkPercent: { type: Number, default: 40 }, 
    status: { type: String, enum: ['PASS', 'FAIL'], uppercase: true },
    grade: { type: String, trim: true },
    isAbsent: { type: Boolean, default: false },
    remarks: { type: String },
    createdByTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gradedByTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// One result per (examId + studentId)
resultSchema.index({ tenantId: 1, branchId: 1, examId: 1, studentId: 1 }, { unique: true });

resultSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('Result', resultSchema);
