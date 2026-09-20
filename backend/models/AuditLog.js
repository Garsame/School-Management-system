const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    scope: { type: String, enum: ['platform', 'tenant'], default: 'tenant', index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // Optional
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String },
    actorEmail: { type: String },
    actorRole: { type: String, required: true },
    action: { type: String, required: true }, // e.g. "BRANCH_CREATED", "USER_UPDATED"
    entityType: { type: String, required: true }, // e.g. "User", "Branch", "AcademicYear"
    entityId: { type: String }, // Optional
    before: { type: mongoose.Schema.Types.Mixed }, // Snapshot before change
    after: { type: mongoose.Schema.Types.Mixed }, // Snapshot after change
    reason: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Indexing for performance and isolation
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, branchId: 1 });
auditLogSchema.index({ scope: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
