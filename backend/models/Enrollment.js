const mongoose = require('mongoose');

const CURRENT_ENROLLMENT_STATUSES = new Set(['Current', 'Active', 'active']);

const isCurrentStatus = (status) => CURRENT_ENROLLMENT_STATUSES.has(status);

const syncIsCurrentForStatusUpdate = function() {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;

    const hasDirectStatus = Object.prototype.hasOwnProperty.call(update, 'status');
    const hasSetStatus = Object.prototype.hasOwnProperty.call(update.$set || {}, 'status');
    if (!hasDirectStatus && !hasSetStatus) return;

    const status = hasSetStatus ? update.$set.status : update.status;
    update.$set = {
        ...(update.$set || {}),
        status,
        isCurrent: isCurrentStatus(status)
    };

    if (hasDirectStatus) {
        delete update.status;
    }

    this.setUpdate(update);
};

const enrollmentSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    status: { type: String, enum: ['Current', 'Active', 'active', 'Promoted', 'Retained', 'Transferred', 'Withdrawn', 'Graduated', 'Superseded'], default: 'Current' },
    isCurrent: { type: Boolean, default: true },
    promotionDecision: {
        outcome: { type: String, enum: ['Promoted', 'Retained', 'Graduated', 'Incomplete'] },
        totalSubjects: { type: Number, min: 0 },
        gradedSubjects: { type: Number, min: 0 },
        failedSubjects: { type: Number, min: 0 },
        retentionThreshold: { type: Number, min: 0 },
        reason: { type: String, trim: true },
        targetAcademicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
        targetClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
        evaluatedAt: { type: Date }
    },
    createdAt: { type: Date, default: Date.now }
});

// A student should typically have only one active/current enrollment per academic year
// This index helps enforce isolation and lookups
enrollmentSchema.index({ tenantId: 1, branchId: 1, studentId: 1, academicYearId: 1 });
enrollmentSchema.index(
    { tenantId: 1, studentId: 1, academicYearId: 1, isCurrent: 1 },
    { unique: true, partialFilterExpression: { isCurrent: true } }
);

enrollmentSchema.pre('validate', function() {
    this.isCurrent = isCurrentStatus(this.status);
});

enrollmentSchema.pre('updateOne', syncIsCurrentForStatusUpdate);
enrollmentSchema.pre('updateMany', syncIsCurrentForStatusUpdate);
enrollmentSchema.pre('findOneAndUpdate', syncIsCurrentForStatusUpdate);

module.exports = mongoose.model('Enrollment', enrollmentSchema);
