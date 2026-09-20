const express = require('express');
const router = express.Router();
const { 
    registerTenant, 
    getTenants,
    getTenantDetails,
    platformLogin,
    platformLogout,
    getPlatformDashboard,
    getPlatformPlans,
    getPlatformHealth,
    getPlatformAuditLogs,
    getPlatformSettings,
    updatePlatformSettings,
    updateTenantStatus,
    approveTenant,
    rejectTenant,
    suspendTenant,
    reactivateTenant,
    updateTenantPlan,
    createPlatformPlan,
    updatePlatformPlan,
    deletePlatformPlan,
    testPlatformSmtp
} = require('../controllers/platformController');
const { protect, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const upload = require('../middleware/uploadMiddleware');
const { authRateLimiter, registrationRateLimiter } = require('../middleware/rateLimiter');
const {
    createInvoice,
    getBillingSummary,
    getSubscriptionInvoices,
    reconcileBilling,
    recordPayment,
    reversePayment
} = require('../controllers/platformBillingController');

const requireTenantStatusPermission = (req, res, next) => {
    const requestedStatus = String(req.body.status || '').toLowerCase();
    const permission = requestedStatus === 'rejected'
        ? 'platform.tenants.reject'
        : requestedStatus === 'suspended'
            ? 'platform.tenants.deactivate'
            : resolveActivePermission(req);
    return requirePermission(permission)(req, res, next);
};

const resolveActivePermission = (req) => String(req.body.action || '').toLowerCase() === 'approve'
    ? 'platform.tenants.approve'
    : 'platform.tenants.activate';

// Public platform auth routes
router.post('/auth/login', authRateLimiter, platformLogin);
router.post('/auth/logout', platformLogout);

// Restricted to Platform Owner
router.use(protect);
// KEPT deliberately. Platform scope is a genuine hard boundary, not a school-configurable
// one: no tenant role may ever reach these routes. See RBAC_ROADMAP.md Phase 3.5.
router.use(authorize('platform_owner'));

router.get('/dashboard', requirePermission('platform.dashboard.view'), getPlatformDashboard);
router.post('/tenants', requirePermission('platform.tenants.create'), registrationRateLimiter, upload.single('logo'), upload.validateUploadedImageSignature, registerTenant);
router.get('/tenants', requirePermission('platform.tenants.view'), getTenants);
router.get('/tenants/:id', requirePermission('platform.tenants.view'), getTenantDetails);
router.patch('/tenants/:id/status', requireTenantStatusPermission, updateTenantStatus);
router.post('/tenants/:id/approve', requirePermission('platform.tenants.approve'), approveTenant);
router.post('/tenants/:id/reject', requirePermission('platform.tenants.reject'), rejectTenant);
router.post('/tenants/:id/suspend', requirePermission('platform.tenants.deactivate'), suspendTenant);
router.post('/tenants/:id/reactivate', requirePermission('platform.tenants.activate'), reactivateTenant);
router.put('/tenants/:id/plan', requirePermission('platform.tenants.plan.update'), updateTenantPlan);
router.get('/plans', requirePermission('platform.plans.view'), getPlatformPlans);
router.post('/plans', requirePermission('platform.plans.create'), createPlatformPlan);
router.put('/plans/:id', requirePermission('platform.plans.update'), updatePlatformPlan);
router.delete('/plans/:id', requirePermission('platform.plans.delete'), deletePlatformPlan);
router.get('/billing/summary', requirePermission('platform.billing.view'), getBillingSummary);
router.get('/billing/invoices', requirePermission('platform.billing.view'), getSubscriptionInvoices);
router.post('/billing/invoices', requirePermission('platform.billing.manage'), createInvoice);
router.post('/billing/reconcile', requirePermission('platform.billing.manage'), reconcileBilling);
router.post('/billing/invoices/:invoiceId/payments', requirePermission('platform.billing.payments.record'), recordPayment);
router.post('/billing/payments/:paymentId/reverse', requirePermission('platform.billing.payments.reverse'), reversePayment);
router.get('/health', requirePermission('platform.monitoring.view'), getPlatformHealth);
router.get('/audit-logs', requirePermission('platform.audit.view'), getPlatformAuditLogs);
router.get('/settings', requirePermission('platform.settings.view'), getPlatformSettings);
router.put('/settings', requirePermission('platform.settings.update'), upload.single('logo'), upload.validateUploadedImageSignature, updatePlatformSettings);
router.post('/settings/test-email', requirePermission('platform.smtp.test'), testPlatformSmtp);

module.exports = router;
