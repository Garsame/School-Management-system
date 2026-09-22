const asyncHandler = require('express-async-handler');
const Role = require('../models/Role');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { logActivity } = require('../utils/logger');
const {
    findUnassignablePermissions,
    getAssignablePermissions,
    sanitizeAssignablePermissionsForScope
} = require('../utils/permissions');
const { findNewDutyConflicts } = require('../utils/segregationOfDuties');
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
 * The administrative ceiling for a role's permissions.
 *
 * A super admin delegates permissions they never hold themselves, so this is deliberately
 * not a "must hold it" check — that would break delegation, which is the role's whole
 * purpose. The boundary is scope, plan tier, and the platform wall, all enforced by
 * getAssignablePermissions. Rejections name the exact permission and reason rather than
 * failing opaquely, so the user can fix the request.
 */
const assertAssignable = async (req, scope, permissions) => {
    if (!Array.isArray(permissions)) throw fail('permissions must be an array', 400);

    const planTier = await resolveTenantPlanTier(req.tenantId);
    const rejected = findUnassignablePermissions({ scope, planTier, values: permissions });
    if (rejected.length) {
        const detail = rejected.map((item) => `${item.key} (${item.reason})`).join('; ');
        const isPlanLimit = rejected.every((item) => /plan/.test(item.reason));
        throw fail(`These permissions cannot be granted: ${detail}`, isPlanLimit ? 402 : 403);
    }
    return sanitizeAssignablePermissionsForScope(scope, permissions, planTier);
};

const resolveTenantPlanTier = async (tenantId) => {
    const tenant = await Tenant.findById(tenantId).select('plan').lean();
    return tenant?.plan || 'basic';
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

    const permissions = await assertAssignable(req, scope, req.body.permissions || []);
    const dutyConflicts = findNewDutyConflicts([], permissions);

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
        after: { ...serializeRole(role), dutyConflicts }
    });

    // Warnings travel with the response so the UI can show them at the moment of the
    // change. They never block: a small school may genuinely have nobody to delegate to.
    res.status(201).json({ ...serializeRole(role), dutyConflicts });
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

    let dutyConflicts = [];
    if (req.body.permissions !== undefined) {
        const next = await assertAssignable(req, role.scope, req.body.permissions);
        await assertRoleManagementSurvives(req, role, next);
        dutyConflicts = findNewDutyConflicts(role.permissions, next);

        // No self-escalation check here, deliberately.
        //
        // It looked necessary but was both harmful and useless. Harmful: the head of school
        // could never grant their own role a permission the platform had not given them by
        // default, and since only they manage roles, that permission was unreachable by
        // anyone — the school was locked out of its own configuration.
        //
        // Useless: a deliberate restriction lives in the user's own deny list, and
        // effective = (role ∪ allow) − deny, so a deny still wins no matter what the role
        // grants. Editing your own role cannot undo a restriction placed on you.
        //
        // The real self-grant path is the user-level allow list, and updateUserPermissions
        // still guards that.
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
        after: { ...serializeRole(role), dutyConflicts }
    });

    res.json({ ...serializeRole(role), dutyConflicts });
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

/**
 * Unticking "change roles" on the only role that has it would leave nobody able to give it
 * back. Deactivation is guarded the same way in assertRoleIsRemovable.
 */
const assertRoleManagementSurvives = async (req, role, nextPermissions) => {
    const MANAGE = 'tenant.roles.update';
    if (!role.permissions.includes(MANAGE) || nextPermissions.includes(MANAGE)) return;
    const others = await Role.countDocuments({
        tenantId: req.tenantId,
        _id: { $ne: role._id },
        isActive: true,
        permissions: MANAGE
    });
    if (others === 0) {
        throw fail(`${role.name} is the only role that can change roles, so it must keep that permission`, 409);
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

/**
 * Everything this school may put in a role at the given scope, grouped for the picker.
 * The UI must build from this rather than the raw catalog, so it never offers a permission
 * the ceiling would reject.
 */
const getAssignableCatalog = asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'branch' ? 'branch' : 'tenant';
    const planTier = await resolveTenantPlanTier(req.tenantId);
    const assignable = getAssignablePermissions({ scope, planTier });

    const groups = assignable.reduce((acc, permission) => {
        (acc[permission.group] = acc[permission.group] || []).push({
            key: permission.key,
            label: permission.label,
            description: permission.description,
            requiredScope: permission.requiredScope,
            suggestedRoles: permission.suggestedRoles
        });
        return acc;
    }, {});

    res.json({
        scope,
        planTier,
        total: assignable.length,
        groups: Object.entries(groups).map(([name, permissions]) => ({ name, permissions }))
    });
});

module.exports = {
    assignRole,
    createRole,
    deleteRole,
    getAssignableCatalog,
    getRoleById,
    getRoles,
    updateRole
};
