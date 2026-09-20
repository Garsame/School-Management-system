const mongoose = require('mongoose');

const feeStructureSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    targetType: { type: String, enum: ['SCHOOL_GRADE', 'CATEGORY', 'CLASS'], default: 'CLASS', required: true },
    gradeLevel: { type: String, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassCategory' },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    name: { type: String, trim: true, default: 'Standard Fee Structure' },
    billingFrequency: {
        type: String,
        enum: ['YEARLY', 'MONTHLY', 'EVERY_TWO_MONTHS', 'QUARTERLY', 'TERM', 'CUSTOM'],
        default: 'YEARLY'
    },
    billingPeriods: [{
        key: { type: String, required: true },
        label: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 }
    }],
    feeItems: [{
        name: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 }
    }],
    totalAmount: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now }
});

feeStructureSchema.pre('validate', function() {
    if (this.targetType === 'SCHOOL_GRADE' && !this.gradeLevel) this.invalidate('gradeLevel', 'Grade level is required');
    if (this.targetType !== 'SCHOOL_GRADE' && !this.branchId) this.invalidate('branchId', 'Branch is required');
    if (this.targetType === 'CATEGORY' && !this.categoryId) this.invalidate('categoryId', 'Category is required');
    if (this.targetType === 'CLASS' && !this.classId) this.invalidate('classId', 'Class is required');
});

feeStructureSchema.index(
    { tenantId: 1, gradeLevel: 1, academicYearId: 1 },
    { unique: true, partialFilterExpression: { targetType: 'SCHOOL_GRADE', gradeLevel: { $type: 'string' } } }
);

feeStructureSchema.index(
    { tenantId: 1, branchId: 1, classId: 1, academicYearId: 1 },
    { unique: true, partialFilterExpression: { targetType: 'CLASS', classId: { $type: 'objectId' } } }
);
feeStructureSchema.index(
    { tenantId: 1, branchId: 1, categoryId: 1, academicYearId: 1 },
    { unique: true, partialFilterExpression: { targetType: 'CATEGORY', categoryId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('FeeStructure', feeStructureSchema);
