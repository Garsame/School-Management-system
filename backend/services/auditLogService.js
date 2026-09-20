const AuditLog = require('../models/AuditLog');

const logAction = async ({ tenantId, branchId, actorUserId, actorRole, action, entityType, entityId, before, after, ip, userAgent }) => {
    try {
        await AuditLog.create({
            tenantId,
            branchId,
            actorUserId,
            actorRole,
            action,
            entityType,
            entityId,
            before,
            after,
            ip,
            userAgent
        });
    } catch (error) {
        console.error('Audit Log Error:', error);
        // Do not crash the app if audit logging fails
    }
};

module.exports = { logAction };
