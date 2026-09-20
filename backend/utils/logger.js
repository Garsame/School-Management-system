const AuditLog = require('../models/AuditLog');

/**
 * Logs a sensitive action to the AuditLog collection.
 */
const logActivity = async (args) => {
    try {
        const {
            req,
            action,
            entityType,
            entityId = null,
            before = null,
            after = null,
            tenantId = null,
            branchId = null,
            reason = null,
            scope = null
        } = args || {};

        if (!action || !entityType) {
            console.warn('[AUDIT] logActivity skipped: missing action/entityType');
            return;
        }

        // Extremely safe extraction of IDs
        const finalTenantId = tenantId || (req && req.tenantId) || (req && req.user && req.user.tenantId) || null;
        const finalBranchId = branchId || (req && req.branchId) || (req && req.user && req.user.branchId) || null;

        const actorUserId = (req && req.user && req.user._id) || (args.userId) || null;
        const actorRole = (req && req.user && req.user.role) || (args.role) || 'system';
        const actorName = (req && req.user && req.user.name) || args.user || args.actorName || 'System';
        const actorEmail = (req && req.user && req.user.email) || args.actorEmail || null;
        const finalScope = scope || (finalTenantId ? 'tenant' : 'platform');
        
        await AuditLog.create({
            scope: finalScope,
            tenantId: finalTenantId,
            branchId: finalBranchId,
            actorUserId: actorUserId,
            actorName,
            actorEmail,
            actorRole: actorRole,
            action: action,
            entityType: entityType,
            entityId: entityId,
            before: before,
            after: after,
            reason: reason,
            ip: req ? (req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress) : '127.0.0.1',
            userAgent: req ? req.headers?.['user-agent'] : 'system'
        });
    } catch (error) {
        console.error('[AUDIT] Logging Error:', error.message);
    }
};

module.exports = { logActivity };
