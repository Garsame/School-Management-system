const { getEffectivePermissions } = require('../utils/permissions');

const resolvePermissions = (req) => {
    if (Array.isArray(req.permissions)) return req.permissions;
    const permissions = getEffectivePermissions(req.user || {});
    req.permissions = permissions;
    return permissions;
};

const sendForbidden = (res, message) => res.status(403).json({ message });

const requirePermission = (permission) => (req, res, next) => {
    const permissions = resolvePermissions(req);
    if (!permissions.includes(permission)) {
        return sendForbidden(res, `Permission ${permission} is required`);
    }
    return next();
};

const requireAnyPermission = (requiredPermissions = []) => (req, res, next) => {
    const permissions = resolvePermissions(req);
    if (!requiredPermissions.some((permission) => permissions.includes(permission))) {
        return sendForbidden(res, `One of these permissions is required: ${requiredPermissions.join(', ')}`);
    }
    return next();
};

const requireAllPermissions = (requiredPermissions = []) => (req, res, next) => {
    const permissions = resolvePermissions(req);
    if (!requiredPermissions.every((permission) => permissions.includes(permission))) {
        return sendForbidden(res, `All of these permissions are required: ${requiredPermissions.join(', ')}`);
    }
    return next();
};

module.exports = {
    requireAllPermissions,
    requireAnyPermission,
    requirePermission
};
