const mongoose = require('mongoose');

const teacherAssignmentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    // Legacy compatibility (old unique index used "subject")
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

teacherAssignmentSchema.index({ tenantId: 1, branchId: 1, teacherUserId: 1, academicYearId: 1 });
teacherAssignmentSchema.index({ teacherUserId: 1, classId: 1, sectionId: 1, subjectId: 1, academicYearId: 1 }, { unique: true });

module.exports = mongoose.model('TeacherAssignment', teacherAssignmentSchema);
