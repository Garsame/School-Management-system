const mongoose = require('mongoose');

const classSubjectSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    passMarks: { type: Number, default: 40 },
    totalMarks: { type: Number, default: 100 },
    passMarkPercent: { type: Number, default: 40 }, // Added as per req (e.g. 50 meaning 50%)
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

classSubjectSchema.pre('validate', function syncPassMarkPercent() {
    const totalMarks = Number(this.totalMarks);
    const passMarks = Number(this.passMarks);
    if (Number.isFinite(totalMarks) && totalMarks > 0 && Number.isFinite(passMarks) && passMarks >= 0) {
        this.passMarkPercent = Math.max(0, Math.min(100, (passMarks / totalMarks) * 100));
    }
});

classSubjectSchema.index({ tenantId: 1, branchId: 1, classId: 1, academicYearId: 1, sectionId: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('ClassSubject', classSubjectSchema);
