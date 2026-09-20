const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term' }, // Optional but supported
    examCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamCategory', required: true },
    examTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamTemplate' },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    
    name: { type: String }, // Friendly name
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['Draft', 'Open', 'Closed'], default: 'Draft' },
    
    createdByTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Strict unique constraint: prevent duplicate exam instances for the same context
examSchema.index({ 
    tenantId: 1,
    branchId: 1, 
    academicYearId: 1, 
    termId: 1,
    examCategoryId: 1,
    classId: 1, 
    subjectId: 1
}, { unique: true });

examSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('Exam', examSchema);
