const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Role = require('../models/Role');
const AcademicYear = require('../models/AcademicYear');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Class = require('../models/Class');
const AuditLog = require('../models/AuditLog');
const AttendanceSession = require('../models/AttendanceSession');
const FeeStructure = require('../models/FeeStructure');
const TeacherAssignment = require('../models/TeacherAssignment');
const TimetableSlot = require('../models/TimetableSlot');
const Term = require('../models/Term');
const ClassSubject = require('../models/ClassSubject');
const GradingPolicy = require('../models/GradingPolicy');
const ParentStudentLink = require('../models/ParentStudentLink');
const { logActivity } = require('../utils/logger');
const { login } = require('./authController');
const { TENANT_ADMIN_CREATABLE_ROLES, assertValidRoleScope } = require('../utils/rolePolicy');
const {
    PERMISSION_CATALOG,
    findEscalatedPermissions,
    getPermissionCatalogForRole,
    getUserPermissionParts,
    sanitizeAssignablePermissionsForRole
} = require('../utils/permissions');
const { generateTemporaryPassword } = require('../utils/passwords');
const { buildProfileFields } = require('../utils/userProfile');
const { evaluatePromotionEligibility, buildPromotionDecisionSnapshot, isNextGradeLevel } = require('../services/promotionEligibilityService');
const {
    assertMatchingTransferGrade,
    filterMatchingGradeClasses,
    getCurrentClassForStudent,
    resolveClassFromEnrollments
} = require('../services/transferGradeService');

const ACTIVE_ENROLLMENT_STATUSES = ['Current', 'Active', 'active'];
const TENANT_MANAGED_ACCOUNT_ROLES = ['super_admin', 'finance_director', 'hr_payroll_manager', 'branch_admin', 'registrar', 'cashier', 'teacher'];
const PERMISSION_MANAGED_STAFF_ROLES = ['finance_director', 'hr_payroll_manager', 'branch_admin', 'teacher', 'registrar', 'cashier'];

/**
 * Which roles a school administrator may fill.
 *
 * This used to be a hardcoded set of three: finance director, HR manager, branch admin.
 * A single-campus school has no branch admin to delegate to, so teachers and admissions
 * staff could never be created by anyone — the school could define the role but not fill it.
 *
 * Roles are data now, so the school's own active roles are the answer. Student and parent
 * accounts are still excluded: those are created by admission and guardian workflows, which
 * link them to a student record rather than standing alone.
 */
const PORTAL_ROLES = new Set(['student', 'parent']);

const resolveAssignableRole = async (req, roleKey) => {
    if (PORTAL_ROLES.has(roleKey)) {
        const error = new Error('Student and parent accounts are created through admission, not here');
        error.statusCode = 403;
        throw error;
    }
    const role = await Role.findOne({ tenantId: req.tenantId, key: roleKey }).select('_id key scope isActive');
    if (!role) {
        const error = new Error(`This school has no role named ${roleKey}`);
        error.statusCode = 400;
        throw error;
    }
    if (!role.isActive) {
        const error = new Error(`The ${roleKey} role is deactivated in this school`);
        error.statusCode = 400;
        throw error;
    }
    return role;
};

// ---- Helper utilities ----
const serializeUser = (user) => {
    const raw = typeof user.toObject === 'function' ? user.toObject() : user;
    delete raw.passwordHash;
    return raw;
};

const validateAuthorizedTeacherBranches = async ({ tenantId, role, branchId, authorizedBranchIds = [] }) => {
    if (role !== 'teacher') return [];
    const uniqueBranchIds = [...new Set([branchId, ...(authorizedBranchIds || [])].filter(Boolean).map(String))];
    const validCount = await Branch.countDocuments({
        _id: { $in: uniqueBranchIds },
        tenantId,
        isActive: { $ne: false }
    });
    if (validCount !== uniqueBranchIds.length) {
        const error = new Error('One or more authorized teacher branches are invalid or inactive');
        error.statusCode = 400;
        throw error;
    }
    return uniqueBranchIds;
};

const ensureTenantUser = async (req, userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }
    const user = await User.findOne({
        _id: userId,
        tenantId: req.tenantId,
        role: { $ne: 'platform_owner' }
    });
    if (!user) {
        const error = new Error('User not found in this institution');
        error.statusCode = 404;
        throw error;
    }
    return user;
};

const ensureTenantManagedUser = async (req, userId) => {
    const user = await ensureTenantUser(req, userId);
    if (PORTAL_ROLES.has(user.role)) {
        const error = new Error('This account is managed through its student or guardian workflow');
        error.statusCode = 403;
        throw error;
    }
    return user;
};

const assertNotLastActiveSuperAdmin = async (req, targetUser, nextIsActive = targetUser.isActive) => {
    if (targetUser.role !== 'super_admin' || nextIsActive) return;
    if (targetUser._id.toString() === req.user._id.toString()) {
        const error = new Error('You cannot deactivate your own super admin account');
        error.statusCode = 400;
        throw error;
    }
    const activeSuperAdmins = await User.countDocuments({
        tenantId: req.tenantId,
        role: 'super_admin',
        isActive: true
    });
    if (activeSuperAdmins <= 1) {
        const error = new Error('Cannot deactivate the last active school super admin');
        error.statusCode = 400;
        throw error;
    }
};

// ==========================================
// A) Branding & Identity
// ==========================================

/**
 * @desc    Get tenant branding
 * @route   GET /api/tenant/settings/branding
 * @access  Private (Super Admin)
 */
const getBranding = asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.tenantId).select('name logoUrl primaryColor secondaryColor updatedAt');
    if (!tenant) {
        res.status(404);
        throw new Error('Tenant not found');
    }
    res.json(tenant);
});

/**
 * @desc    Update tenant branding
 * @route   PUT /api/tenant/settings/branding
 * @access  Private (Super Admin)
 */
const updateBranding = asyncHandler(async (req, res) => {
    const { primaryColor, secondaryColor } = req.body;
    let logoUrl = req.body.logoUrl;
    if (req.file) {
        logoUrl = `/uploads/logos/${req.file.filename}`;
    }
    
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) {
        res.status(404);
        throw new Error('Tenant not found');
    }

    const before = { logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor, secondaryColor: tenant.secondaryColor };
    
    tenant.logoUrl = logoUrl || tenant.logoUrl;
    tenant.primaryColor = primaryColor || tenant.primaryColor;
    tenant.secondaryColor = secondaryColor || tenant.secondaryColor;
    
    await tenant.save();

    await logActivity({
        req,
        action: 'TENANT_BRANDING_UPDATED',
        entityType: 'Tenant',
        entityId: tenant._id.toString(),
        before,
        after: { logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor, secondaryColor: tenant.secondaryColor }
    });

    res.json({ message: 'Branding updated successfully', tenant });
});

// ==========================================
// B) Branch Management
// ==========================================

/**
 * @desc    Get all branches for the tenant
 * @route   GET /api/tenant/branches
 */
const getBranches = asyncHandler(async (req, res) => {
    console.log(`[DEBUG] Fetching branches for tenantId: ${req.tenantId}`);
    try {
        const branches = await Branch.find({ tenantId: req.tenantId });
        console.log(`[DEBUG] Found ${branches.length} branches`);
        res.json(branches);
    } catch (error) {
        console.error('[DEBUG] getBranches Error:', error);
        res.status(500);
        throw new Error(`Database error while fetching branches: ${error.message}`);
    }
});

/**
 * @desc    Create a new branch
 * @route   POST /api/tenant/branches
 */
const createBranch = asyncHandler(async (req, res) => {
    const { name, code, address, phone, email, logoUrl, receiptFooter } = req.body;
    console.log(`[DEBUG] Creating branch: ${name} (${code}) for tenant: ${req.tenantId}`);

    if (!name || !code) {
        res.status(400);
        throw new Error('Branch name and code are required');
    }

    const branchExists = await Branch.findOne({ tenantId: req.tenantId, code: code.toUpperCase() });
    if (branchExists) {
        console.log(`[DEBUG] Branch code conflict: ${code}`);
        res.status(400);
        throw new Error(`Branch with code "${code}" already exists in your institution`);
    }

    try {
        const branch = await Branch.create({
            tenantId: req.tenantId,
            name,
            code: code.toUpperCase(),
            address,
            phone,
            email,
            logoUrl,
            receiptFooter
        });

        console.log(`[DEBUG] Branch created successfully: ${branch._id}`);

        await logActivity({
            req,
            action: 'BRANCH_CREATED',
            entityType: 'Branch',
            entityId: branch._id.toString(),
            after: branch
        });

        res.status(201).json(branch);
    } catch (error) {
        console.error('[DEBUG] createBranch Error:', error);
        res.status(400);
        throw new Error(`Validation or Database error: ${error.message}`);
    }
});

/**
 * @desc    Update branch info
 * @route   PUT /api/tenant/branches/:branchId
 */
const updateBranch = asyncHandler(async (req, res) => {
    const branch = await Branch.findOne({ _id: req.params.branchId, tenantId: req.tenantId });
    
    if (!branch) {
        res.status(404);
        throw new Error('Branch not found');
    }

    const before = branch.toObject();
    const allowedFields = ['name', 'code', 'address', 'phone', 'email', 'logoUrl', 'receiptFooter'];
    for (const field of allowedFields) {
        if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
        if (field === 'code') {
            branch.code = String(req.body.code || '').trim().toUpperCase();
            continue;
        }
        branch[field] = req.body[field];
    }
    await branch.save();

    await logActivity({
        req,
        action: 'BRANCH_UPDATED',
        entityType: 'Branch',
        entityId: branch._id.toString(),
        before,
        after: branch
    });

    res.json(branch);
});

/**
 * @desc    Activate/Deactivate branch
 * @route   PATCH /api/tenant/branches/:branchId/status
 */
const toggleBranchStatus = asyncHandler(async (req, res) => {
    const branch = await Branch.findOne({ _id: req.params.branchId, tenantId: req.tenantId });
    
    if (!branch) {
        res.status(404);
        throw new Error('Branch not found');
    }

    branch.isActive = req.body.isActive;
    await branch.save();

    await logActivity({
        req,
        action: branch.isActive ? 'BRANCH_ACTIVATED' : 'BRANCH_DEACTIVATED',
        entityType: 'Branch',
        entityId: branch._id.toString()
    });

    res.json({ message: `Branch ${branch.isActive ? 'activated' : 'deactivated'}`, branch });
});

/**
 * @desc    Assign Branch Admin to branch
 * @route   POST /api/tenant/branches/:branchId/assign-branch-admin
 */
const assignBranchAdmin = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const branchId = req.params.branchId;

    // 1. Verify target branch exists and belongs to the same tenant
    const branch = await Branch.findOne({ _id: branchId, tenantId: req.tenantId });
    if (!branch) {
        res.status(404);
        throw new Error('Target branch not found in this institution');
    }

    // 2. Verify target branch is active
    if (branch.isActive === false) {
        res.status(400);
        throw new Error('Target branch is inactive');
    }

    // 3. Verify user exists and belongs to the same tenant
    const user = await User.findOne({ _id: userId, tenantId: req.tenantId });
    if (!user) {
        res.status(404);
        throw new Error('User not found in this institution');
    }

    // 4. Verify user has branch_admin role and branch scope
    if (user.role !== 'branch_admin' || user.scope !== 'branch') {
        res.status(400);
        throw new Error('User must have role branch_admin and scope branch');
    }

    user.branchId = branchId;
    await user.save();

    await logActivity({
        req,
        action: 'BRANCH_ADMIN_ASSIGNED',
        entityType: 'User',
        entityId: userId,
        after: { branchId }
    });

    res.json({ message: 'Branch admin assigned successfully' });
});

// ==========================================
// C) Tenant User Management
// ==========================================

/**
 * @desc    Create a new user (Tenant or Branch scope)
 * @route   POST /api/tenant/users
 */
const createUser = asyncHandler(async (req, res) => {
    const { name, email, password, role, scope, branchId } = req.body;
    const normalized = assertValidRoleScope(role, scope);

    const assignableRole = await resolveAssignableRole(req, normalized.role);
    if (assignableRole.scope !== normalized.scope) {
        res.status(400);
        throw new Error(`The ${normalized.role} role is ${assignableRole.scope}-scoped in this school`);
    }
    if (!name || !email || !password) {
        res.status(400);
        throw new Error('name, email, and password are required');
    }
    if (String(password).length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }

    // Check if email unique in tenant
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        res.status(400);
        throw new Error('A valid email address is required');
    }
    const userExists = await User.findOne({ tenantId: req.tenantId, email: normalizedEmail });
    if (userExists) {
        res.status(409);
        throw new Error('Email already exists for this school.');
    }

    // Validation for scope/branchId
    if (normalized.scope === 'branch' && !branchId) {
        res.status(400);
        throw new Error('branchId is required for branch-scoped users');
    }
    if (normalized.scope === 'branch') {
        const branch = await Branch.findOne({ _id: branchId, tenantId: req.tenantId });
        if (!branch) {
            res.status(400);
            throw new Error('Branch not found in this institution');
        }
    }
    const createProfilePayload = { ...req.body };
    const profileFields = buildProfileFields(createProfilePayload, normalized.role);
    try {
        const user = await User.create({
            tenantId: req.tenantId,
            branchId: normalized.scope === 'tenant' ? null : branchId,
            name: String(name).trim(),
            email: normalizedEmail,
            passwordHash: password,
            role: normalized.role,
            scope: normalized.scope,
            mustChangePassword: true,
            isActive: true,
            roleId: assignableRole._id,
            createdBy: req.user._id,
            updatedBy: req.user._id,
            ...profileFields
        });

        await logActivity({
            req,
            action: 'USER_CREATED',
            entityType: 'User',
            entityId: user._id.toString(),
            after: { name, email: normalizedEmail, role: normalized.role, scope: normalized.scope, branchId, employeeId: user.employeeId }
        });

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            scope: user.scope,
            branchId: user.branchId,
            employeeId: user.employeeId,
            mustChangePassword: user.mustChangePassword
        });
    } catch (error) {
        if (error.code === 11000) {
            res.status(409);
            throw new Error('Employee ID or email already exists for this school.');
        }
        throw error;
    }
});

/**
 * @desc    Get users with filters
 * @route   GET /api/tenant/users
 */
const getUsers = asyncHandler(async (req, res) => {
    const { branchId, role, category = 'administrators' } = req.query;
    const categoryRoles = category === 'all_staff'
        ? PERMISSION_MANAGED_STAFF_ROLES
        : category === 'branch_staff'
            ? ['teacher', 'registrar', 'cashier']
            : TENANT_MANAGED_ACCOUNT_ROLES;
    const query = { tenantId: req.tenantId, role: { $in: categoryRoles } };

    if (branchId) {
        query.$or = [{ branchId }, { role: 'teacher', authorizedBranchIds: branchId }];
    }
    if (role) {
        if (!categoryRoles.includes(String(role).toLowerCase())) {
            res.status(403);
            throw new Error('Requested role is outside this account-management area');
        }
        query.role = String(role).toLowerCase();
    }

    const users = await User.find(query).select('-passwordHash');
    res.json(users);
});

const getUserById = asyncHandler(async (req, res) => {
    const user = await ensureTenantManagedUser(req, req.params.userId);
    res.json(serializeUser(user));
});

const updateUser = asyncHandler(async (req, res) => {
    const targetUser = await ensureTenantManagedUser(req, req.params.userId);
    const before = serializeUser(targetUser);

    const nextRole = req.body.role ? String(req.body.role).trim().toLowerCase() : targetUser.role;
    const nextScope = req.body.scope ? String(req.body.scope).trim().toLowerCase() : targetUser.scope;
    const normalized = assertValidRoleScope(nextRole, nextScope);

    await resolveAssignableRole(req, normalized.role);
    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
        const name = String(req.body.name || '').trim();
        if (!name) { res.status(400); throw new Error('Name is required'); }
        targetUser.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) { res.status(400); throw new Error('Email is required'); }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400); throw new Error('A valid email address is required'); }
        const emailExists = await User.findOne({ tenantId: req.tenantId, email, _id: { $ne: targetUser._id } });
        if (emailExists) { res.status(400); throw new Error('Email already registered in this institution'); }
        targetUser.email = email;
    }

    if (normalized.role !== targetUser.role || normalized.scope !== targetUser.scope) {
        targetUser.role = normalized.role;
        targetUser.scope = normalized.scope;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'branchId')) {
        if (normalized.scope === 'branch') {
            const branch = await Branch.findOne({ _id: req.body.branchId, tenantId: req.tenantId });
            if (!branch) { res.status(400); throw new Error('Branch not found in this institution'); }
            targetUser.branchId = req.body.branchId;
        } else {
            targetUser.branchId = null;
        }
    }

    targetUser.authorizedBranchIds = await validateAuthorizedTeacherBranches({
        tenantId: req.tenantId,
        role: normalized.role,
        branchId: targetUser.branchId,
        authorizedBranchIds: Object.prototype.hasOwnProperty.call(req.body, 'authorizedBranchIds')
            ? req.body.authorizedBranchIds
            : targetUser.authorizedBranchIds
    });

    const profilePayload = { ...req.body };
    Object.assign(targetUser, buildProfileFields(profilePayload, normalized.role, { existing: targetUser }));
    targetUser.updatedBy = req.user._id;

    await targetUser.save();

    await logActivity({
        req,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: targetUser._id.toString(),
        before,
        after: serializeUser(targetUser)
    });

    res.json(serializeUser(targetUser));
});

const updateUserStatus = asyncHandler(async (req, res) => {
    const targetUser = await ensureTenantManagedUser(req, req.params.userId);

    if (typeof req.body.isActive !== 'boolean') {
        res.status(400);
        throw new Error('isActive boolean is required');
    }

    await assertNotLastActiveSuperAdmin(req, targetUser, req.body.isActive);

    const before = { isActive: targetUser.isActive };
    targetUser.isActive = req.body.isActive;
    targetUser.updatedBy = req.user._id;
    if (targetUser.isActive) {
        targetUser.deactivatedAt = undefined;
        targetUser.deactivationReason = undefined;
    } else {
        targetUser.deactivatedAt = new Date();
        targetUser.deactivationReason = String(req.body.reason || 'Deactivated by school administrator').trim();
        targetUser.security = targetUser.security || {};
        targetUser.security.tokenVersion = (targetUser.security?.tokenVersion || 0) + 1;
    }
    await targetUser.save();

    await logActivity({
        req,
        action: targetUser.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'User',
        entityId: targetUser._id.toString(),
        before,
        after: { isActive: targetUser.isActive }
    });

    res.json({
        message: `User ${targetUser.isActive ? 'activated' : 'deactivated'} successfully`,
        user: serializeUser(targetUser)
    });
});

const resetUserPassword = asyncHandler(async (req, res) => {
    const targetUser = await ensureTenantManagedUser(req, req.params.userId);
    const generated = !req.body.password;
    const nextPassword = generated ? generateTemporaryPassword() : String(req.body.password);

    if (nextPassword.length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }

    targetUser.passwordHash = nextPassword;
    targetUser.mustChangePassword = true;
    targetUser.updatedBy = req.user._id;
    targetUser.security = targetUser.security || {};
    targetUser.security.tokenVersion = (targetUser.security?.tokenVersion || 0) + 1;
    await targetUser.save();

    await logActivity({
        req,
        action: 'USER_PASSWORD_RESET',
        entityType: 'User',
        entityId: targetUser._id.toString(),
        after: { mustChangePassword: true }
    });

    res.json({
        message: 'Password reset successfully',
        temporaryPassword: generated ? nextPassword : undefined
    });
});

const getParentStudentLinks = asyncHandler(async (req, res) => {
    const parent = await ensureTenantUser(req, req.params.userId);
    if (parent.role !== 'parent') {
        res.status(400);
        throw new Error('Target user is not a parent account');
    }
    const links = await ParentStudentLink.find({
        tenantId: req.tenantId,
        parentUserId: parent._id
    }).populate('studentId', 'firstName middleName lastName admissionNumber studentCode status');
    res.json(links);
});

const updateParentStudentLinks = asyncHandler(async (req, res) => {
    const parent = await ensureTenantUser(req, req.params.userId);
    if (parent.role !== 'parent') {
        res.status(400);
        throw new Error('Target user is not a parent account');
    }
    const relationships = Array.isArray(req.body.relationships) ? req.body.relationships : [];
    if (relationships.length === 0) {
        res.status(400);
        throw new Error('At least one student relationship is required');
    }
    const studentIds = [...new Set(relationships.map((item) => String(item.studentId || '')).filter(Boolean))];
    if (studentIds.length !== relationships.length) {
        res.status(400);
        throw new Error('Each relationship must contain a unique studentId');
    }
    const validStudentCount = await Student.countDocuments({ tenantId: req.tenantId, _id: { $in: studentIds } });
    if (validStudentCount !== studentIds.length) {
        res.status(400);
        throw new Error('One or more selected students do not belong to this institution');
    }

    const previousLinks = await ParentStudentLink.find({ tenantId: req.tenantId, parentUserId: parent._id }).lean();
    const previousStudents = [...(parent.students || [])];
    try {
        await ParentStudentLink.deleteMany({ tenantId: req.tenantId, parentUserId: parent._id });
        const links = await ParentStudentLink.insertMany(relationships.map((relationship, index) => ({
            tenantId: req.tenantId,
            parentUserId: parent._id,
            studentId: relationship.studentId,
            relationship: relationship.relationship || 'Guardian',
            isPrimaryContact: relationship.isPrimaryContact ?? index === 0,
            isBillingContact: relationship.isBillingContact ?? index === 0,
            isEmergencyContact: relationship.isEmergencyContact ?? index === 0,
            pickupAuthorized: relationship.pickupAuthorized ?? false,
            hasPortalAccess: relationship.hasPortalAccess ?? true,
            custodyNotes: relationship.custodyNotes,
            createdBy: req.user._id,
            updatedBy: req.user._id
        })));
        parent.students = studentIds;
        parent.updatedBy = req.user._id;
        await parent.save();

        await logActivity({
            req,
            action: 'PARENT_STUDENT_LINKS_UPDATED',
            entityType: 'User',
            entityId: parent._id.toString(),
            before: { students: previousStudents },
            after: { students: studentIds }
        });
        res.json(links);
    } catch (error) {
        await ParentStudentLink.deleteMany({ tenantId: req.tenantId, parentUserId: parent._id }).catch(() => {});
        if (previousLinks.length > 0) await ParentStudentLink.insertMany(previousLinks).catch(() => {});
        parent.students = previousStudents;
        await parent.save().catch(() => {});
        throw error;
    }
});

const getPermissionCatalog = asyncHandler(async (req, res) => {
    res.json(PERMISSION_CATALOG.filter((permission) => !permission.key.startsWith('platform.')));
});

const getUserPermissions = asyncHandler(async (req, res) => {
    const targetUser = await ensureTenantUser(req, req.params.userId);
    const permissionParts = getUserPermissionParts(targetUser);
    res.json({
        user: serializeUser(targetUser),
        catalog: getPermissionCatalogForRole(targetUser.role),
        ...permissionParts
    });
});

const updateUserPermissions = asyncHandler(async (req, res) => {
    const targetUser = await ensureTenantUser(req, req.params.userId);

    // 1. Require allow and deny to be arrays; malformed payloads must return clean 400 responses.
    if (!req.body || !Array.isArray(req.body.allow) || !Array.isArray(req.body.deny)) {
        const error = new Error('allow and deny must be arrays');
        error.statusCode = 400;
        throw error;
    }

    // 2. Validate every requested permission against getPermissionCatalogForRole(targetUser.role) before sanitizing.
    // Reject unknown and cross-role permissions with 400. Do not silently remove them.
    const assignableCatalog = getPermissionCatalogForRole(targetUser.role);
    const assignableKeys = new Set(assignableCatalog.map((permission) => permission.key));

    for (const key of [...req.body.allow, ...req.body.deny]) {
        if (typeof key !== 'string') {
            const error = new Error('Permissions must be strings');
            error.statusCode = 400;
            throw error;
        }
        if (!assignableKeys.has(key)) {
            const error = new Error(`Permission ${key} is not assignable to role ${targetUser.role}`);
            error.statusCode = 400;
            throw error;
        }
    }

    // 3. Reject permissions appearing in both allow and deny.
    const allowSet = new Set(req.body.allow);
    for (const key of req.body.deny) {
        if (allowSet.has(key)) {
            const error = new Error(`Permission ${key} cannot appear in both allow and deny`);
            error.statusCode = 400;
            throw error;
        }
    }

    // 4. No self-escalation: a user cannot add a permission to their own account.
    //
    // The rule is deliberately about SELF-grants, not all grants. A school administrator
    // routinely delegates permissions they will never hold themselves — a super admin
    // grants cashier and teacher permissions without being either. Blocking that would
    // break delegation, which is the whole point of the role.
    //
    // The real escalation vector is an admin whose own access was narrowed granting the
    // removed permission back to themselves. Granting to a second account they control is
    // not caught here; that is bounded today by the catalog's allowedRoles whitelist, and
    // Phase 2 replaces this with a proper administrative ceiling once that boxing is gone.
    //
    // Denying is always allowed: taking access away is never escalation.
    if (targetUser._id.toString() === req.user._id.toString()) {
        // protect() sets req.permissions; derive it if something bypassed that middleware,
        // so an absent list can never be read as "grant freely".
        const actorPermissions = Array.isArray(req.permissions)
            ? req.permissions
            : getUserPermissionParts(req.user || {}, req.user?.roleId || null).effective;
        const escalated = findEscalatedPermissions(actorPermissions, req.body.allow);
        if (escalated.length) {
            const error = new Error(
                `You cannot grant yourself permissions you do not already hold: ${escalated.join(', ')}`
            );
            error.statusCode = 403;
            throw error;
        }
    }

    const before = getUserPermissionParts(targetUser);
    const allow = sanitizeAssignablePermissionsForRole(targetUser.role, req.body.allow);
    const deny = sanitizeAssignablePermissionsForRole(targetUser.role, req.body.deny);

    if (
        targetUser._id.toString() === req.user._id.toString() &&
        deny.includes('tenant.users.permissions.update')
    ) {
        const error = new Error('You cannot remove your own permission-management access');
        error.statusCode = 400;
        throw error;
    }

    targetUser.permissions = { allow, deny };
    targetUser.permissionProfile = req.body.permissionProfile || targetUser.permissionProfile || `default_${targetUser.role}`;
    targetUser.lastPermissionUpdateAt = new Date();
    targetUser.lastPermissionUpdateBy = req.user._id;

    const simulated = getUserPermissionParts(targetUser);
    if (
        targetUser.role === 'super_admin' &&
        targetUser.isActive &&
        !simulated.effective.includes('tenant.users.permissions.update')
    ) {
        const activeSuperAdmins = await User.countDocuments({
            tenantId: req.tenantId,
            role: 'super_admin',
            isActive: true
        });
        if (activeSuperAdmins <= 1) {
            const error = new Error('Cannot remove permission-management access from the last active super admin');
            error.statusCode = 400;
            throw error;
        }
    }

    await targetUser.save();

    const after = getUserPermissionParts(targetUser);
    await logActivity({
        req,
        action: 'USER_PERMISSION_UPDATED',
        entityType: 'User',
        entityId: targetUser._id.toString(),
        before,
        after
    });

    res.json({ user: serializeUser(targetUser), ...after });
});

// ==========================================
// D) Academic Year
// ==========================================

const validateAcademicYearDates = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw Object.assign(new Error('Start date and end date must be valid dates'), { statusCode: 400 });
    }
    if (end <= start) {
        throw Object.assign(new Error('End date must be after the start date'), { statusCode: 400 });
    }

    const minimumEnd = new Date(start);
    minimumEnd.setUTCMonth(minimumEnd.getUTCMonth() + 9);
    const maximumEnd = new Date(start);
    maximumEnd.setUTCMonth(maximumEnd.getUTCMonth() + 12);
    if (end < minimumEnd || end > maximumEnd) {
        throw Object.assign(new Error('An academic year must be between 9 and 12 months long'), { statusCode: 400 });
    }
};

const createAcademicYear = asyncHandler(async (req, res) => {
    const { name, startDate, endDate, isCurrent } = req.body;

    if (!name || !startDate || !endDate) {
        res.status(400);
        throw new Error('Name, Start Date, and End Date are required');
    }
    validateAcademicYearDates(startDate, endDate);

    if (isCurrent) {
        // Reset others
        await AcademicYear.updateMany({ tenantId: req.tenantId }, { isCurrent: false });
    }

    const year = await AcademicYear.create({
        tenantId: req.tenantId,
        name,
        startDate,
        endDate,
        isCurrent: isCurrent || false
    });

    await logActivity({
        req,
        action: 'ACADEMIC_YEAR_CREATED',
        entityType: 'AcademicYear',
        entityId: year._id.toString(),
        after: year
    });

    res.status(201).json(year);
});

const setCurrentYear = asyncHandler(async (req, res) => {
    const yearId = req.params.yearId;

    const targetYear = await AcademicYear.findOne({ _id: yearId, tenantId: req.tenantId });
    if (!targetYear) {
        res.status(404);
        throw new Error('Academic year not found');
    }

    await AcademicYear.updateMany({ tenantId: req.tenantId }, { isCurrent: false });
    const year = await AcademicYear.findOneAndUpdate(
        { _id: yearId, tenantId: req.tenantId },
        { isCurrent: true },
        { returnDocument: 'after' }
    );

    if (!year) {
        res.status(404);
        throw new Error('Academic year not found');
    }

    await logActivity({
        req,
        action: 'ACADEMIC_YEAR_SET_CURRENT',
        entityType: 'AcademicYear',
        entityId: yearId
    });

    res.json(year);
});

const clearCurrentYear = asyncHandler(async (req, res) => {
    const year = await AcademicYear.findOne({ _id: req.params.yearId, tenantId: req.tenantId });
    if (!year) {
        res.status(404);
        throw new Error('Academic year not found');
    }
    if (!year.isCurrent) {
        res.status(400);
        throw new Error('This academic year is not currently active');
    }

    year.isCurrent = false;
    await year.save();
    await logActivity({
        req,
        action: 'ACADEMIC_YEAR_CURRENT_CLEARED',
        entityType: 'AcademicYear',
        entityId: year._id.toString(),
        before: { isCurrent: true },
        after: { isCurrent: false }
    });

    res.json({ message: 'Current status removed successfully', year });
});

const updateAcademicYear = asyncHandler(async (req, res) => {
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
        res.status(400);
        throw new Error('Name, Start Date, and End Date are required');
    }
    validateAcademicYearDates(startDate, endDate);
    const year = await AcademicYear.findOne({ _id: req.params.yearId, tenantId: req.tenantId });
    if (!year) {
        res.status(404);
        throw new Error('Academic year not found');
    }

    const before = { name: year.name, startDate: year.startDate, endDate: year.endDate };
    year.name = name;
    year.startDate = startDate;
    year.endDate = endDate;
    await year.save();

    await logActivity({
        req,
        action: 'ACADEMIC_YEAR_UPDATED',
        entityType: 'AcademicYear',
        entityId: year._id.toString(),
        before,
        after: { name: year.name, startDate: year.startDate, endDate: year.endDate }
    });

    res.json(year);
});

const deleteAcademicYear = asyncHandler(async (req, res) => {
    const yearId = req.params.yearId;
    const year = await AcademicYear.findOne({ _id: yearId, tenantId: req.tenantId });
    if (!year) {
        res.status(404);
        throw new Error('Academic year not found');
    }

    if (year.isCurrent) {
        res.status(400);
        throw new Error('Cannot delete the current active academic year');
    }

    const [
        hasEnrollments,
        hasExams,
        hasInvoices,
        hasFeeStructures,
        hasAttendance,
        hasAssignments,
        hasTimetable
    ] = await Promise.all([
        Enrollment.exists({ tenantId: req.tenantId, academicYearId: yearId }),
        Exam.exists({ tenantId: req.tenantId, academicYearId: yearId }),
        Invoice.exists({ tenantId: req.tenantId, academicYearId: yearId }),
        FeeStructure.exists({ tenantId: req.tenantId, academicYearId: yearId }),
        AttendanceSession.exists({ academicYearId: yearId }),
        TeacherAssignment.exists({ tenantId: req.tenantId, academicYearId: yearId }),
        TimetableSlot.exists({ tenantId: req.tenantId, academicYearId: yearId })
    ]);

    if (
        hasEnrollments ||
        hasExams ||
        hasInvoices ||
        hasFeeStructures ||
        hasAttendance ||
        hasAssignments ||
        hasTimetable
    ) {
        res.status(400);
        throw new Error('This academic year has records and cannot be deleted.');
    }

    const [hasTerms, hasClassSubjects] = await Promise.all([
        Term.exists({ tenantId: req.tenantId, academicYearId: yearId }),
        ClassSubject.exists({ tenantId: req.tenantId, academicYearId: yearId })
    ]);
    if (hasTerms || hasClassSubjects) {
        res.status(400);
        throw new Error('This academic year has records and cannot be deleted.');
    }

    await year.deleteOne();

    await logActivity({
        req,
        action: 'ACADEMIC_YEAR_DELETED',
        entityType: 'AcademicYear',
        entityId: yearId,
        before: { name: year.name, startDate: year.startDate, endDate: year.endDate }
    });

    res.json({ message: 'Academic year deleted successfully' });
});

// ==========================================
// E) Global Reporting
// ==========================================

const getOverviewReport = asyncHandler(async (req, res) => {
    const { branchId, academicYearId } = req.query;
    const tenantId = req.tenantId;

    const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (branchId) query.branchId = new mongoose.Types.ObjectId(branchId);
    if (academicYearId) query.academicYearId = new mongoose.Types.ObjectId(academicYearId);

    // 1. Student Count
    const studentScope = branchId ? { tenantId, branchId } : { tenantId };
    const userScope = branchId ? { tenantId, branchId } : { tenantId };
    const [studentCount, teacherCount, graduateCount, staffCount, studentStatusDistribution] = await Promise.all([
        Student.countDocuments({ ...studentScope, status: 'Active' }),
        User.countDocuments({ ...userScope, role: 'teacher', isActive: { $ne: false } }),
        Student.countDocuments({ ...studentScope, status: 'Graduated' }),
        User.countDocuments({ ...userScope, role: { $in: ['finance_director', 'hr_payroll_manager', 'branch_admin', 'teacher', 'cashier', 'registrar'] }, isActive: { $ne: false } }),
        Student.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), ...(branchId ? { branchId: new mongoose.Types.ObjectId(branchId) } : {}) } },
            { $group: { _id: '$status', value: { $sum: 1 } } },
            { $project: { _id: 0, name: '$_id', value: 1 } }
        ])
    ]);

    // 2. Enrollments
    const activeEnrollments = await Enrollment.countDocuments({
        ...query,
        ...(academicYearId ? { status: { $ne: 'Withdrawn' } } : { status: 'Current' })
    });

    // 3. Revenue Totals (Paid Amount from Invoices)
    const revenueStats = await Invoice.aggregate([
        { $match: query },
        { $group: { _id: null, totalRevenue: { $sum: '$paidAmount' }, projectedRevenue: { $sum: '$totalAmount' } } }
    ]);

    // 4. Performance Summary (Average marks)
    const resultQuery = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (branchId) resultQuery.branchId = new mongoose.Types.ObjectId(branchId);
    if (academicYearId) {
        const exams = await Exam.find(query).select('_id').lean();
        resultQuery.examId = { $in: exams.map((exam) => exam._id) };
    }
    const performanceStats = await Result.aggregate([
        { $match: resultQuery },
        { $group: { _id: null, avgMarks: { $avg: '$marksObtained' }, totalResults: { $count: {} } } }
    ]);

    // 5. Real student counts per branch
    const branchStats = await Student.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
    ]);

    const branchDistribution = branchStats.map(bs => ({
        branchId: bs._id ? bs._id.toString() : 'unassigned',
        count: bs.count
    }));

    // 6. Monthly trend for the last 6 months (Tenant-wide)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setHours(0, 0, 0, 0);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const invoiceMonthly = await Invoice.aggregate([
        { 
            $match: { 
                tenantId: new mongoose.Types.ObjectId(tenantId),
                ...(branchId ? { branchId: new mongoose.Types.ObjectId(branchId) } : {}),
                status: { $ne: 'Void' },
                createdAt: { $gte: sixMonthsAgo }
            } 
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                invoiced: { $sum: '$totalAmount' }
            }
        }
    ]);

    const paymentMonthly = await Payment.aggregate([
        { 
            $match: { 
                tenantId: new mongoose.Types.ObjectId(tenantId),
                ...(branchId ? { branchId: new mongoose.Types.ObjectId(branchId) } : {}),
                status: 'ACTIVE',
                createdAt: { $gte: sixMonthsAgo }
            } 
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                collected: { $sum: '$amount' }
            }
        }
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trendData = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const mVal = d.getMonth() + 1;
        const yVal = d.getFullYear();

        const inv = invoiceMonthly.find(item => item._id && item._id.year === yVal && item._id.month === mVal);
        const pay = paymentMonthly.find(item => item._id && item._id.year === yVal && item._id.month === mVal);

        trendData.push({
            month: monthNames[d.getMonth()],
            Projected: inv ? inv.invoiced : 0,
            Collected: pay ? pay.collected : 0
        });
    }

    res.json({
        studentCount,
        teacherCount,
        staffCount,
        graduateCount,
        studentStatusDistribution,
        activeEnrollments,
        revenue: revenueStats[0] || { totalRevenue: 0, projectedRevenue: 0 },
        performance: performanceStats[0] || { avgMarks: 0, totalResults: 0 },
        branchDistribution,
        trendData
    });
});

// ==========================================
// F) Promotion & Transfer
// ==========================================

const promoteStudents = asyncHandler(async (req, res) => {
    const { fromAcademicYearId, toAcademicYearId, rules = {} } = req.body;
    const classMap = Array.isArray(rules.classMap)
        ? rules.classMap.filter((mapping) => mapping?.fromClassId && (mapping?.toClassId || mapping?.graduate === true))
        : [];
    if (!fromAcademicYearId || !toAcademicYearId || classMap.length === 0) {
        res.status(400);
        throw new Error('Source year, target year, and at least one valid promotion or graduation mapping are required');
    }
    if (String(fromAcademicYearId) === String(toAcademicYearId)) {
        res.status(400);
        throw new Error('Target academic year must be different from source year');
    }

    const [fromYear, toYear, academicPolicy] = await Promise.all([
        AcademicYear.findOne({ _id: fromAcademicYearId, tenantId: req.tenantId }),
        AcademicYear.findOne({ _id: toAcademicYearId, tenantId: req.tenantId }),
        GradingPolicy.findOne({ tenantId: req.tenantId }).lean()
    ]);
    if (!fromYear || !toYear) {
        res.status(400);
        throw new Error('Source or target academic year is invalid for this institution');
    }
    const immediateNextYear = await AcademicYear.findOne({
        tenantId: req.tenantId,
        startDate: { $gt: fromYear.startDate }
    }).sort({ startDate: 1 }).select('_id').lean();
    if (!immediateNextYear || String(immediateNextYear._id) !== String(toYear._id)) {
        res.status(400);
        throw new Error('Target academic year must be the immediate next academic year');
    }
    const finalGradeLevel = String(academicPolicy?.finalGradeLevel || '12').trim().toLowerCase();

    const results = {
        promoted: 0,
        graduated: 0,
        retained: 0,
        incomplete: 0,
        failed: 0,
        skippedExisting: 0,
        totalConsidered: 0,
        retainedStudents: [],
        incompleteStudents: [],
        errors: []
    };

    for (const mapping of classMap) {
        const { fromClassId, toClassId } = mapping;
        const graduate = mapping.graduate === true;
        const [fromClass, toClass] = await Promise.all([
            Class.findOne({ _id: fromClassId, tenantId: req.tenantId }),
            graduate ? Promise.resolve(null) : Class.findOne({ _id: toClassId, tenantId: req.tenantId })
        ]);
        if (!fromClass || (!graduate && !toClass)) {
            results.errors.push(`Invalid class mapping ${fromClassId} -> ${toClassId || 'Graduated'}`);
            continue;
        }
        const isFinalGrade = String(fromClass.gradeLevel || '').trim().toLowerCase() === finalGradeLevel;
        if (graduate && !isFinalGrade) {
            results.errors.push(`${fromClass.name} is not the configured final grade`);
            continue;
        }
        if (!graduate && isFinalGrade) {
            results.errors.push(`${fromClass.name} is the final grade and must use graduation`);
            continue;
        }
        if (!graduate && String(fromClass.branchId) !== String(toClass.branchId)) {
            results.errors.push(`Class mapping ${fromClass.name} -> ${toClass.name} crosses branches`);
            continue;
        }
        if (!graduate && !isNextGradeLevel(fromClass.gradeLevel, toClass.gradeLevel)) {
            results.errors.push(`${fromClass.name} can only be promoted to the class one grade above it`);
            continue;
        }

        const enrollments = await Enrollment.find({
            tenantId: req.tenantId,
            branchId: fromClass.branchId,
            academicYearId: fromAcademicYearId,
            classId: fromClassId,
            status: { $in: ACTIVE_ENROLLMENT_STATUSES }
        }).populate('studentId', 'firstName lastName admissionNumber');

        const promotionDecisions = await evaluatePromotionEligibility({
            tenantId: req.tenantId,
            branchId: fromClass.branchId,
            classId: fromClassId,
            academicYearId: fromAcademicYearId,
            enrollments
        });

        for (const enroll of enrollments) {
            results.totalConsidered++;

            const studentId = enroll.studentId?._id || enroll.studentId;
            const studentLabel = {
                studentId,
                admissionNumber: enroll.studentId?.admissionNumber || '',
                name: [enroll.studentId?.firstName, enroll.studentId?.lastName].filter(Boolean).join(' ')
            };
            const decision = promotionDecisions.get(String(studentId));

            if (!decision || decision.outcome === 'Incomplete') {
                const incompleteDecision = decision || {
                    outcome: 'Incomplete', totalSubjects: 0, gradedSubjects: 0,
                    failedSubjects: 0, retentionThreshold: 0,
                    reason: 'Promotion eligibility could not be calculated.'
                };
                await Enrollment.updateOne(
                    { _id: enroll._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                    { $set: { promotionDecision: buildPromotionDecisionSnapshot(incompleteDecision, {
                        targetAcademicYearId: toAcademicYearId,
                        targetClassId: graduate ? fromClassId : toClassId
                    }) } }
                );
                results.incomplete++;
                results.incompleteStudents.push({ ...studentLabel, ...incompleteDecision });
                continue;
            }

            if (decision.outcome === 'Retained') {
                const existingRetained = await Enrollment.findOne({
                    tenantId: req.tenantId,
                    branchId: enroll.branchId,
                    academicYearId: toAcademicYearId,
                    studentId
                });
                if (existingRetained && String(existingRetained.classId) !== String(fromClassId)) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is in a different class.`);
                    continue;
                }
                if (existingRetained && !ACTIVE_ENROLLMENT_STATUSES.includes(existingRetained.status)) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is not current.`);
                    continue;
                }

                const snapshot = buildPromotionDecisionSnapshot(decision, {
                    targetAcademicYearId: toAcademicYearId,
                    targetClassId: fromClassId
                });
                let retainedEnrollment = existingRetained;
                try {
                    if (!retainedEnrollment) {
                        retainedEnrollment = await Enrollment.create({
                            tenantId: req.tenantId,
                            branchId: enroll.branchId,
                            studentId,
                            classId: fromClassId,
                            sectionId: enroll.sectionId || null,
                            academicYearId: toAcademicYearId,
                            status: 'Current'
                        });
                    }
                    const updateResult = await Enrollment.updateOne(
                        { _id: enroll._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                        { $set: { status: 'Retained', promotionDecision: snapshot } }
                    );
                    if (updateResult.matchedCount === 0) {
                        if (!existingRetained) await Enrollment.deleteOne({ _id: retainedEnrollment._id, tenantId: req.tenantId });
                        results.failed++;
                        continue;
                    }
                    if (existingRetained) results.skippedExisting++;
                    else results.retained++;
                    results.retainedStudents.push({ ...studentLabel, ...decision });
                } catch (error) {
                    if (!existingRetained && retainedEnrollment?._id) {
                        await Enrollment.deleteOne({ _id: retainedEnrollment._id, tenantId: req.tenantId }).catch(() => {});
                    }
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: ${error.message}`);
                }
                continue;
            }

            if (graduate) {
                const student = await Student.findOne({
                    _id: studentId,
                    tenantId: req.tenantId,
                    branchId: enroll.branchId
                });
                if (!student) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: student was not found for graduation.`);
                    continue;
                }
                const originalStudentStatus = student.status;
                const enrollmentUpdate = await Enrollment.updateOne(
                    { _id: enroll._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                    { $set: {
                        status: 'Graduated',
                        promotionDecision: buildPromotionDecisionSnapshot(decision, {
                            targetAcademicYearId: toAcademicYearId,
                            targetClassId: fromClassId,
                            outcome: 'Graduated'
                        })
                    } }
                );
                if (enrollmentUpdate.matchedCount === 0) {
                    results.failed++;
                    continue;
                }
                try {
                    student.status = 'Graduated';
                    student.graduationDate = new Date();
                    await student.save();
                    results.graduated++;
                } catch (error) {
                    await Enrollment.updateOne({ _id: enroll._id, tenantId: req.tenantId }, { $set: { status: enroll.status } }).catch(() => {});
                    student.status = originalStudentStatus;
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: ${error.message}`);
                }
                continue;
            }

            const existingNext = await Enrollment.findOne({
                tenantId: req.tenantId,
                branchId: enroll.branchId,
                academicYearId: toAcademicYearId,
                studentId
            });

            if (existingNext) {
                if (String(existingNext.classId) !== String(toClassId)) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is in a different class.`);
                    continue;
                }
                if (!ACTIVE_ENROLLMENT_STATUSES.includes(existingNext.status)) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: destination-year enrollment is not current.`);
                    continue;
                }
                const updateResult = await Enrollment.updateOne(
                    { _id: enroll._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                    { $set: { status: 'Promoted', promotionDecision: buildPromotionDecisionSnapshot(decision, {
                        targetAcademicYearId: toAcademicYearId,
                        targetClassId: toClassId
                    }) } }
                );
                if (updateResult.matchedCount === 0) {
                    results.failed++;
                    results.errors.push(`${studentLabel.admissionNumber || studentId}: enrollment changed during promotion.`);
                    continue;
                }
                results.skippedExisting++;
                continue;
            }

            let newEnroll;
            try {
                newEnroll = await Enrollment.create({
                    tenantId: req.tenantId,
                    branchId: enroll.branchId,
                    studentId,
                    classId: toClassId,
                    sectionId: null,
                    academicYearId: toAcademicYearId,
                    status: 'Current'
                });

                const updateResult = await Enrollment.updateOne(
                    { _id: enroll._id, tenantId: req.tenantId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } },
                    { $set: { status: 'Promoted', promotionDecision: buildPromotionDecisionSnapshot(decision, {
                        targetAcademicYearId: toAcademicYearId,
                        targetClassId: toClassId
                    }) } }
                );
                if (updateResult.matchedCount === 0) {
                    await Enrollment.deleteOne({ _id: newEnroll._id, tenantId: req.tenantId });
                    results.failed++;
                    results.errors.push(`Enrollment changed while promoting student ${studentLabel.admissionNumber || studentId}`);
                    continue;
                }

                results.promoted++;
            } catch (error) {
                if (newEnroll?._id) {
                    await Enrollment.deleteOne({ _id: newEnroll._id, tenantId: req.tenantId }).catch(() => {});
                }
                results.failed++;
                results.errors.push(`${studentLabel.admissionNumber || studentId}: ${error.message}`);
            }
        }
    }

    await logActivity({
        req,
        action: 'STUDENTS_PROMOTED',
        entityType: 'Enrollment',
        details: { fromAcademicYearId, toAcademicYearId, ...results }
    });

    res.json({ message: `Successfully promoted ${results.promoted} students`, ...results });
});

const transferStudentBranch = asyncHandler(async (req, res) => {
    const { studentId, fromBranchId, toBranchId, classId, academicYearId } = req.body;
    if (!studentId || !fromBranchId || !toBranchId || !classId || !academicYearId) {
        res.status(400);
        throw new Error('Student, source branch, target branch, class, and academic year are required');
    }
    if (String(fromBranchId) === String(toBranchId)) {
        res.status(400);
        throw new Error('Source and target branches must be different');
    }

    const [student, sourceBranch, targetBranch, targetClass, academicYear] = await Promise.all([
        Student.findOne({ _id: studentId, tenantId: req.tenantId, branchId: fromBranchId }),
        Branch.findOne({ _id: fromBranchId, tenantId: req.tenantId, isActive: true }),
        Branch.findOne({ _id: toBranchId, tenantId: req.tenantId, isActive: true }),
        Class.findOne({ _id: classId, tenantId: req.tenantId, branchId: toBranchId }),
        AcademicYear.findOne({ _id: academicYearId, tenantId: req.tenantId })
    ]);
    if (!student) {
        res.status(404);
        throw new Error('Student was not found in the selected source branch');
    }
    if (!sourceBranch || !targetBranch || !targetClass || !academicYear) {
        res.status(400);
        throw new Error('The selected transfer context is invalid for this institution');
    }

    const currentEnrollments = await Enrollment.find({
        tenantId: req.tenantId,
        studentId,
        branchId: fromBranchId,
        status: { $in: ['Current', 'Active', 'active'] }
    });
    if (currentEnrollments.length === 0) {
        res.status(400);
        throw new Error('Student has no current enrollment in the source branch');
    }
    const sourceClass = await resolveClassFromEnrollments({
        tenantId: req.tenantId,
        branchId: fromBranchId,
        enrollments: currentEnrollments
    });
    assertMatchingTransferGrade(sourceClass, targetClass);

    const linkedUser = await User.findOne({ tenantId: req.tenantId, studentId, role: 'student' });
    const originalUserBranchId = linkedUser ? linkedUser.branchId : null;

    let newEnroll;
    let studentUpdated = false;
    let enrollmentsUpdated = false;
    let userUpdated = false;

    try {
        await Enrollment.updateMany(
            { _id: { $in: currentEnrollments.map((enrollment) => enrollment._id) }, tenantId: req.tenantId },
            { $set: { status: 'Transferred' } }
        );
        enrollmentsUpdated = true;

        student.branchId = toBranchId;
        await student.save();
        studentUpdated = true;

        newEnroll = await Enrollment.create({
            tenantId: req.tenantId,
            branchId: toBranchId,
            studentId,
            classId,
            academicYearId,
            status: 'Current'
        });

        if (linkedUser) {
            await User.updateOne(
                { _id: linkedUser._id, tenantId: req.tenantId, role: 'student', studentId },
                { branchId: toBranchId }
            );
            userUpdated = true;
        }
    } catch (error) {
        if (userUpdated && linkedUser) {
            await User.updateOne(
                { _id: linkedUser._id, tenantId: req.tenantId, role: 'student', studentId },
                { branchId: originalUserBranchId }
            ).catch(() => {});
        }
        if (newEnroll) {
            await Enrollment.deleteOne({ _id: newEnroll._id }).catch(() => {});
        }
        if (studentUpdated) {
            student.branchId = fromBranchId;
            await student.save().catch(() => {});
        }
        if (enrollmentsUpdated) {
            for (const originalEnrollment of currentEnrollments) {
                await Enrollment.updateOne(
                    { _id: originalEnrollment._id, tenantId: req.tenantId },
                    { status: originalEnrollment.status }
                ).catch(() => {});
            }
        }
        throw error;
    }

    await logActivity({
        req,
        action: 'BRANCH_TRANSFER',
        entityType: 'Student',
        entityId: studentId.toString(),
        details: { fromBranchId, toBranchId }
    });

    res.json({ message: 'Student transferred successfully', enrollment: newEnroll });
});

const getBranchClasses = asyncHandler(async (req, res) => {
    const branch = await Branch.findOne({ _id: req.params.branchId, tenantId: req.tenantId, isActive: true });
    if (!branch) {
        res.status(404);
        throw new Error('Branch not found');
    }
    const classes = await Class.find({ tenantId: req.tenantId, branchId: branch._id }).sort({ name: 1 });
    if (!req.query.studentId) return res.json(classes);
    const student = await Student.findOne({ _id: req.query.studentId, tenantId: req.tenantId });
    if (!student) {
        res.status(404);
        throw new Error('Student not found');
    }
    const sourceClass = await getCurrentClassForStudent({
        tenantId: req.tenantId,
        studentId: student._id,
        branchId: student.branchId
    });
    return res.json(filterMatchingGradeClasses(classes, sourceClass));
});

// ==========================================
// G) Audit Logs
// ==========================================

const getTenantAuditLogs = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const query = { tenantId: req.tenantId };

    if (req.query.action) query.action = req.query.action;
    if (req.query.actor) {
        query.$or = [
            { actorName: { $regex: req.query.actor, $options: 'i' } },
            { actorEmail: { $regex: req.query.actor, $options: 'i' } }
        ];
    }
    if (req.query.entityType) query.entityType = req.query.entityType;
    if (req.query.entityId) query.entityId = String(req.query.entityId);
    if (req.query.from || req.query.to) {
        query.createdAt = {};
        if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
        if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('actorUserId', 'name email role'),
        AuditLog.countDocuments(query)
    ]);

    const inferActivityType = (action = '') => {
        const upper = String(action).toUpperCase();
        if (upper.includes('ERROR') || upper.includes('FAILED') || upper.includes('SUSPEND') || upper.includes('DEACTIVATED')) return 'danger';
        if (upper.includes('UPDATE') || upper.includes('CHANGED') || upper.includes('SET') || upper.includes('RESET') || upper.includes('ASSIGN')) return 'update';
        if (upper.includes('WARN')) return 'warning';
        return 'info';
    };

    const transformedLogs = logs.map((log) => ({
        id: log._id,
        action: log.action,
        user: log.actorUserId?.name || log.actorName || log.actorRole || 'System',
        actor: log.actorUserId?.name || log.actorName || log.actorRole || 'System',
        actorEmail: log.actorUserId?.email || log.actorEmail || '',
        target: log.entityId ? `${log.entityType} (${log.entityId})` : (log.entityType || 'Unknown'),
        date: new Date(log.createdAt).toLocaleString(),
        timestamp: log.createdAt,
        type: inferActivityType(log.action),
        actorRole: log.actorRole,
        entityType: log.entityType,
        entityId: log.entityId,
        reason: log.reason,
        before: log.before,
        after: log.after
    }));

    res.json({ logs: transformedLogs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

module.exports = {
    login,
    getBranding, updateBranding,
    getBranches, createBranch, updateBranch, toggleBranchStatus, assignBranchAdmin,
    createUser, getUsers, getUserById, updateUser, updateUserStatus, resetUserPassword,
    getPermissionCatalog, getUserPermissions, updateUserPermissions,
    getParentStudentLinks, updateParentStudentLinks,
    createAcademicYear, setCurrentYear, clearCurrentYear, updateAcademicYear, deleteAcademicYear,
    getOverviewReport,
    promoteStudents, transferStudentBranch, getBranchClasses,
    getTenantAuditLogs
};
