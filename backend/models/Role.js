const mongoose = require('mongoose');
const { sanitizePermissions } = require('../utils/permissions');
const { normalizeRole, normalizeScope } = require('../utils/rolePolicy');

/**
 * A role is a named set of permissions a school hands out to its staff.
 *
 * The ten roles the platform shipped with are seeded per tenant as `isSystem` roles, so
 * existing users keep working unchanged. Schools can then rename them, adjust what they
 * grant, and (from Phase 2) build roles of their own.
 *
 * `key` stays in sync with `User.role`, which remains a string. That keeps every existing
 * query, route guard, and index working while the role itself becomes editable data.
 */
const roleSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: function () { return this.scope !== 'platform'; }
    },
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    scope: { type: String, enum: ['tenant', 'branch', 'platform'], required: true },
    permissions: [{ type: String, trim: true }],
    dataScope: {
        // Which branches a holder may act in. `assigned` reads User.authorizedBranchIds.
        branches: { type: String, enum: ['all', 'assigned', 'own'], default: 'own' },
        // Which records within those branches. `own` means records they created or are linked to.
        records: { type: String, enum: ['all', 'assigned', 'own'], default: 'all' },
        // Named field groups the holder may not read, e.g. 'compensation'.
        fieldMasks: [{ type: String, trim: true }]
    },
    // Seeded roles. Their key and scope are immutable; name and description are editable.
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

roleSchema.pre('validate', function () {
    this.key = normalizeRole(this.key);
    this.scope = normalizeScope(this.scope);
    // Drop anything not in the catalog rather than storing a key that silently does nothing.
    this.permissions = sanitizePermissions(this.permissions || []);
    if (!this.dataScope) this.dataScope = {};
    this.dataScope.fieldMasks = [...new Set((this.dataScope.fieldMasks || [])
        .map((mask) => String(mask || '').trim())
        .filter(Boolean))];
});

// A role key is unique within a school. Platform roles have no tenant, so they are
// scoped by key alone via a partial index.
roleSchema.index(
    { tenantId: 1, key: 1 },
    { unique: true, partialFilterExpression: { tenantId: { $exists: true } } }
);
roleSchema.index(
    { key: 1 },
    { unique: true, partialFilterExpression: { scope: 'platform' } }
);
roleSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('Role', roleSchema);
