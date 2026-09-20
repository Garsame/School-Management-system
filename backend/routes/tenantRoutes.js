const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const {
    login,
    getBranding, updateBranding,
    getBranches, createBranch, updateBranch, toggleBranchStatus, assignBranchAdmin, getBranchClasses,
    createUser, getUsers, getUserById, updateUser, updateUserStatus, resetUserPassword,
    createAcademicYear, setCurrentYear, clearCurrentYear, updateAcademicYear, deleteAcademicYear,
    getOverviewReport,
    getTenantAuditLogs,
    getPermissionCatalog, getUserPermissions, updateUserPermissions
} = require('../controllers/tenantController');
const { protect, requireScope, tenantGuard } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { enforcePlanLimit } = require('../services/planLimitService');
const academicPolicyController = require('../controllers/academicPolicyController');
const roleController = require('../controllers/roleController');

// Public tenant auth
router.post('/auth/login', authRateLimiter, login);

// All routes here require auth
router.use(protect);

// Public tenant auth (Login is public and does not need protect)
// router.post('/auth/login', login); // Already defined above

// Public lookup for any logged in tenant user (for branding)
router.get('/settings/branding', getBranding);
router.get('/branches', getBranches);
router.get('/branches/:branchId/classes', getBranchClasses);
router.get('/branches/:branchId/class-categories', tenantGuard, asyncHandler(async (req, res) => {
    const ClassCategory = require('../models/ClassCategory');
    const categories = await ClassCategory.find({ tenantId: req.tenantId, branchId: req.params.branchId }).sort({ name: 1 });
    res.json({ success: true, data: categories });
}));

// Public lookup for any logged in tenant user (within scope) - restricted to Super Admin / Finance Director
router.get('/academic-years', requireAnyPermission([
    'tenant.academicYears.view',
    'finance.feeStructures.view',
    'payroll.view'
]), asyncHandler(async (req, res) => {
    if (!req.tenantId) return res.status(403).json({ message: 'Tenant context missing' });
    const AcademicYear = require('../models/AcademicYear');
    const years = await AcademicYear.find({ tenantId: req.tenantId });
    res.json(years);
}));

// School administration. Phase 3 removed the super_admin role lock: all 36 routes below
// carry their own tenant.* permission, so a school can define its own administrative role
// rather than being limited to the one the platform shipped. Tenant scope and isolation
// still apply, and the escalation guard still stops anyone widening their own access.
router.use(requireScope('tenant'));
router.use(tenantGuard);

const upload = require('../middleware/uploadMiddleware');

// A) Branding
router.put('/settings/branding', requirePermission('tenant.branding.update'), upload.single('logo'), upload.validateUploadedImageSignature, updateBranding);

// B) Branch Management
router.post('/branches', requirePermission('tenant.branches.create'), enforcePlanLimit('branches'), createBranch);
router.put('/branches/:branchId', requirePermission('tenant.branches.update'), updateBranch);
router.patch('/branches/:branchId/status', requireAnyPermission(['tenant.branches.activate', 'tenant.branches.deactivate']), toggleBranchStatus);
router.post('/branches/:branchId/assign-branch-admin', requirePermission('tenant.branches.update'), assignBranchAdmin);

// C) User Management
router.get('/users', requirePermission('tenant.users.view'), getUsers);
router.post('/users', requirePermission('tenant.users.create'), enforcePlanLimit('users'), createUser);
router.get('/users/:userId', requirePermission('tenant.users.view'), getUserById);
router.put('/users/:userId', requirePermission('tenant.users.update'), updateUser);
router.patch('/users/:userId/status', requirePermission('tenant.users.update'), updateUserStatus);
router.patch('/users/:userId/password', requirePermission('tenant.users.password.reset'), resetUserPassword);
router.get('/permissions/catalog', requirePermission('tenant.users.permissions.view'), getPermissionCatalog);
router.get('/users/:userId/permissions', requirePermission('tenant.users.permissions.view'), getUserPermissions);
router.put('/users/:userId/permissions', requirePermission('tenant.users.permissions.update'), updateUserPermissions);

// C2) Role Management
router.get('/roles', requirePermission('tenant.roles.view'), roleController.getRoles);
router.get('/roles/assignable-catalog', requirePermission('tenant.roles.view'), roleController.getAssignableCatalog);
router.post('/roles', requirePermission('tenant.roles.create'), roleController.createRole);
router.get('/roles/:roleId', requirePermission('tenant.roles.view'), roleController.getRoleById);
router.put('/roles/:roleId', requirePermission('tenant.roles.update'), roleController.updateRole);
router.delete('/roles/:roleId', requirePermission('tenant.roles.delete'), roleController.deleteRole);
router.post('/roles/:roleId/assign', requirePermission('tenant.roles.assign'), roleController.assignRole);

// D) Academic Year
router.post('/academic-years', requirePermission('tenant.academicYears.create'), createAcademicYear);
router.patch('/academic-years/:yearId/set-current', requirePermission('tenant.academicYears.setCurrent'), setCurrentYear);
router.patch('/academic-years/:yearId/clear-current', requirePermission('tenant.academicYears.setCurrent'), clearCurrentYear);
router.put('/academic-years/:yearId', requirePermission('tenant.academicYears.update'), updateAcademicYear);
router.delete('/academic-years/:yearId', requirePermission('tenant.academicYears.delete'), deleteAcademicYear);
router.get('/academic-policy', requirePermission('tenant.academicPolicy.view'), academicPolicyController.getAcademicPolicy);
router.put('/academic-policy', requirePermission('tenant.academicPolicy.update'), academicPolicyController.updateAcademicPolicy);
router.get('/terms', requirePermission('tenant.academicPolicy.view'), academicPolicyController.getTerms);
router.get('/academic-years/:yearId/terms', requirePermission('tenant.academicPolicy.view'), academicPolicyController.getTerms);
router.post('/academic-years/:yearId/terms', requirePermission('tenant.academicPolicy.update'), academicPolicyController.createTerm);
router.put('/terms/:termId', requirePermission('tenant.academicPolicy.update'), academicPolicyController.updateTerm);
router.delete('/terms/:termId', requirePermission('tenant.academicPolicy.update'), academicPolicyController.deleteTerm);

// E) Reporting
router.get('/reports/overview', requirePermission('tenant.reports.view'), getOverviewReport);

// G) Audit Logs
router.get('/audit', requirePermission('tenant.audit.view'), getTenantAuditLogs);
router.get('/audit-logs', requirePermission('tenant.audit.view'), getTenantAuditLogs);

module.exports = router;
