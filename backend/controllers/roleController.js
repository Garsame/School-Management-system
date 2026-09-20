const asyncHandler = require('express-async-handler');
const Role = require('../models/Role');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');
const {
    findEscalatedPermissions,
    getUserPermissionParts,
    sanitizePermissions
} = require('../utils/permissions');
const { normalizeRole } = require('../utils/rolePolicy');

const fail = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const serializeRole = (role) => ({
    _id: role._id,
    key: role.key,
    name: role.name,
    description: role.description,
    scope: role.scope,
    permissions: role.permissions,
    dataScope: role.dataScope,
    isSystem: role.isSystem,
    isActive: role.isActive,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
});

const ensureTenantRole = async (req, roleId) => {
    const role = await Role.findOne({ _id: roleId, tenantId: req.tenantId });
    if (!role) throw fail('Role not found in this school', 404);
    return role;
};

/**
 * What the actor may put in a role.
 *
 * A super admin delegates permissions they never hold themselves, so this is not a
 * "must hold it" check. The boundary today is the catalog's allowedRoles whitelist,
 * enforced via the role's own key, plus a hard block on platform permissions — a school
 * must never be able to mint itself platform-owner access.
 *
 * Phase 2 replaces this with a scope- and plan-tier ceiling once the catalog is unboxed.
 */
const assertAssignable = (permissions) => {
    const sanitized = sanitizePermissions(permissions);
    const unknown = permissions.filter((permission) => !sanitized.includes(permission));
    if (unknown.length) {
        throw fail(`Unknown permissions: ${unknown.join(', ')}`, 400);
    }
    const platform = sanitized.filter((permission) => permission.startsWith('platform.'));
    if (platform.length) {
        throw fail(`Platform permissions cannot be granted by a school: ${platform.join(', ')}`, 403);
    }
    return sanitized;
};

const getRoles = asyncHandler(async (req, res) => {
    const roles = await Role.find({ tenantId: req.tenantId }).sort({ isSystem: -1, name: 1 });
    const counts = await User.aggregate([
        { $match: { tenantId: req.tenantId } },
        { $group: { _id: '$roleId', count: { $sum: 1 } } }
    ]);
    const userCounts = new Map(counts.map((row) => [String(row._id), row.count]));

    res.json(roles.map((role) => ({
        ...serializeRole(role),
        userCount: userCounts.get(String(role._id)) || 0
    })));
});

const getRoleById = asyncHandler(async (req, res) => {
    const role = await ensureTenantRole(req, req.params.roleId);
    res.json(serializeRole(role));
});

const createRole = asyncHandler(async (req, res) => {
    const { name, description, scope } = req.body || {};
    if (!name || !String(name).trim()) throw fail('Role name is required', 400);
    if (!['tenant', 'branch'].includes(scope)) {
        throw fail("Role scope must be 'tenant' or 'branch'", 400);
    }

    // The key is derived once and then immutable, so renaming never breaks User.role.
    const key = normalizeRole(String(req.body.key || name).replace(/[^a-zA-Z0-9]+/g, '_'));
    if (!key) throw fail('Role key could not be derived from the name', 400);

    const existing = await Role.findOne({ tenantId: req.tenantId, key }).select('_id').lean();
    if (existing) throw fail(`A role with key ${key} already exists in this school`, 409);

    const permissions = assertAssignable(req.body.permissions || []);

    const role = await Role.create({
        tenantId: req.tenantId,
        key,
        name: String(name).trim(),
        description: String(description || '').trim(),
        scope,
        permissions,
        dataScope: req.body.dataScope || {},
        isSystem: false,
        isActive: true,
        createdBy: req.user._id,
        updatedBy: req.user._id
    });

    await logActivity({
        req,
        action: 'ROLE_CREATED',
        entityType: 'Role',
        entityId: role._id.toString(),
        after: serializeRole(role)
    });

    res.status(201).json(serializeRole(role));
});

const updateRole = asyncHandler(async (req, res) => {
    const role = await ensureTenantRole(req, req.params.roleId);
    const before = serializeRole(role);

    // Seeded roles stay recognisable: their key and scope are what User.role and the
    // route guards are built on. Name, description, and permissions remain editable.
    if (req.body.key !== undefined && normalizeRole(req.body.key) !== role.key) {
        throw fail('A role key cannot be changed once created', 400);
    }
    if (req.body.scope !== undefined && req.body.scope !== role.scope) {
        throw fail('A role scope cannot be changed once created', 400);
    }

    if (req.body.name !== undefined) {
        if (!String(req.body.name).trim()) throw fail('Role name cannot be empty', 400);
        role.name = String(req.body.name).trim();
    }
    if (req.body.description !== undefined) role.description = String(req.body.description).trim();
    if (req.body.dataScope !== undefined) role.dataScope = req.body.dataScope;

    if (req.body.permissions !== undefined) {
        if (!Array.isArray(req.body.permissions)) throw fail('permissions must be an array', 400);
        const next = assertAssignable(req.body.permissions);

        // Editing your own role is the self-escalation path: it would let an admin restore
        // a permission that was deliberately taken away from them.
        if (String(req.user.roleId?._id || req.user.roleId) === String(role._id)) {
            const actorPermissions = Array.isArray(req.permissions)
                ? req.permissions
                : getUserPermissionParts(req.user, req.user.roleId).effective;
            const escalated = findEscalatedPermissions(actorPermissions, next);
            if (escalated.length) {
                throw fail(
                    `You cannot add permissions to your own role that you do not already hold: ${escalated.join(', ')}`,
                    403
                );
            }
        }
        role.permissions = next;
    }

    if (req.body.isActive !== undefined) {
        if (typeof req.body.isActive !== 'boolean') throw fail('isActive must be a boolean', 400);
        if (!req.body.isActive) await assertRoleIsRemovable(req, role, 'deactivate');
        role.isActive = req.body.isActive;
    }

    role.updatedBy = req.user._id;
    await role.save();

    await logActivity({
        req,
        action: 'ROLE_UPDATED',
        entityType: 'Role',
        entityId: role._id.toString(),
        before,
        after: serializeRole(role)
    });

    res.json(serializeRole(role));
});

/**
 * A role still in use cannot be removed, and the school must never be left without a way
 * back in: deactivating the last role that can manage access would lock everyone out.
 */
const assertRoleIsRemovable = async (req, role, verb) => {
    const holders = await User.countDocuments({ tenantId: req.tenantId, roleId: role._id, isActive: true });
    if (holders > 0) {
        throw fail(
            `Cannot ${verb} this role while ${holders} active user${holders === 1 ? '' : 's'} still hold it. Reassign them first.`,
            409
        );
    }

    if (role.permissions.includes('tenant.users.permissions.update') || role.permissions.includes('tenant.roles.update')) {
        const otherAdminRoles = await Role.countDocuments({
            tenantId: req.tenantId,
            _id: { $ne: role._id },
            isActive: true,
            permissions: { $in: ['tenant.users.permissions.update', 'tenant.roles.update'] }
        });
        if (otherAdminRoles === 0) {
            throw fail(`Cannot ${verb} the last role that can manage access for this school`, 409);
        }
    }
};

const deleteRole = asyncHandler(async (req, res) => {
    const role = await ensureTenantRole(req, req.params.roleId);

    // Seeded roles are the fallback every user's role string maps to. Removing one would
    // strand anyone later assigned that role, so they can be deactivated but not deleted.
    if (role.isSystem) {
        throw fail('Built-in roles cannot be deleted. Deactivate it instead.', 400);
    }
    await assertRoleIsRemovable(req, role, 'delete');

    const before = serializeRole(role);
    await role.deleteOne();

    await logActivity({
        req,
        action: 'ROLE_DELETED',
        entityType: 'Role',
        entityId: role._id.toString(),
        before
    });

    res.json({ message: 'Role deleted', roleId: role._id });
});

/**
 * Assigning a role rewrites User.role to the role's key, keeping the denormalized string
 * and the record in lockstep. Every route guard and query still reads the string.
 */
const assignRole = asyncHandler(async (req, res) => {
    const role = await ensureTenantRole(req, req.params.roleId);
    if (!role.isActive) throw fail('Cannot assign an inactive role', 400);

    const { userId } = req.body || {};
    if (!userId) throw fail('userId is required', 400);

    const targetUser = await User.findOne({ _id: userId, tenantId: req.tenantId });
    if (!targetUser) throw fail('User not found in this school', 404);

    if (targetUser.scope !== role.scope) {
        throw fail(
            `Role ${role.name} is ${role.scope}-scoped but ${targetUser.name} is ${targetUser.scope}-scoped`,
            400
        );
    }

    const before = { role: targetUser.role, roleId: targetUser.roleId };
    targetUser.role = role.key;
    targetUser.roleId = role._id;
    targetUser.updatedBy = req.user._id;
    // Permissions change with the role, so existing sessions must re-resolve.
    targetUser.security = targetUser.security || {};
    targetUser.security.tokenVersion = (targetUser.security.tokenVersion || 0) + 1;
    await targetUser.save();

    await logActivity({
        req,
        action: 'ROLE_ASSIGNED',
        entityType: 'User',
        entityId: targetUser._id.toString(),
        before,
        after: { role: targetUser.role, roleId: targetUser.roleId }
    });

    res.json({ message: `${targetUser.name} is now ${role.name}`, userId: targetUser._id, roleId: role._id });
});

module.exports = {
    assignRole,
    createRole,
    deleteRole,
    getRoleById,
    getRoles,
    updateRole
};
