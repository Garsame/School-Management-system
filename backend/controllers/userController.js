const User = require('../models/User');
const Branch = require('../models/Branch');
const { BRANCH_ADMIN_CREATABLE_ROLES, TENANT_ADMIN_CREATABLE_ROLES, assertValidRoleScope } = require('../utils/rolePolicy');
const { buildProfileFields, withoutCompensationFields } = require('../utils/userProfile');

const addStaff = async (req, res) => {
    const { name, email, password, role, scope, branchId } = req.body;

    try {
        const normalized = assertValidRoleScope(role, scope);
        const allowedRoles = req.role === 'branch_admin'
            ? BRANCH_ADMIN_CREATABLE_ROLES
            : TENANT_ADMIN_CREATABLE_ROLES;
        if (!allowedRoles.has(normalized.role)) {
            return res.status(403).json({ message: 'You cannot create this role' });
        }
        if (!name || !email || !password || String(password).length < 8) {
            return res.status(400).json({ message: 'name, email, and a password of at least 8 characters are required' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const userExists = await User.findOne({ tenantId: req.tenantId, email: normalizedEmail });
        if (userExists) return res.status(409).json({ message: 'Email already exists for this school.' });

        // Enforce branch context for branch-scoped callers
        let targetBranchId = branchId;
        if (req.scope === 'branch') {
            targetBranchId = req.branchId;
        }
        if (normalized.scope === 'branch') {
            const branch = await Branch.findOne({ _id: targetBranchId, tenantId: req.tenantId });
            if (!branch) return res.status(400).json({ message: 'Branch not found in this institution' });
        }

        const user = await User.create({
            tenantId: req.tenantId,
            branchId: normalized.scope === 'branch' ? targetBranchId : undefined,
            name,
            email: normalizedEmail,
            passwordHash: password,
            role: normalized.role,
            scope: normalized.scope,
            mustChangePassword: true,
            isActive: true,
            createdBy: req.user._id,
            updatedBy: req.user._id,
            ...buildProfileFields(withoutCompensationFields(req.body), normalized.role)
        });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'Employee ID or email already exists for this school.' });
        res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Could not create staff account' });
    }
};

// @desc    Get all staff members for a tenant
// @route   GET /api/users/staff
const getStaff = async (req, res) => {
    try {
        const query = { tenantId: req.tenantId };
        if (req.scope === 'branch') {
            query.branchId = req.branchId;
        }
        const staff = await User.find(query).select('-passwordHash');
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { addStaff, getStaff };
