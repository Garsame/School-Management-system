const mongoose = require('mongoose');

const parentStudentLinkSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    relationship: { type: String, trim: true, default: 'Guardian' },
    isPrimaryContact: { type: Boolean, default: false },
    isBillingContact: { type: Boolean, default: false },
    isEmergencyContact: { type: Boolean, default: false },
    pickupAuthorized: { type: Boolean, default: false },
    hasPortalAccess: { type: Boolean, default: true },
    custodyNotes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

parentStudentLinkSchema.index(
    { tenantId: 1, parentUserId: 1, studentId: 1 },
    { unique: true }
);
parentStudentLinkSchema.index({ tenantId: 1, studentId: 1, hasPortalAccess: 1 });

module.exports = mongoose.model('ParentStudentLink', parentStudentLinkSchema);
