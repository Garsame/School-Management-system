const express = require('express');
const router = express.Router();
const { getOverviewStats } = require('../controllers/dashboardController');
const { protect, authorize, tenantGuard } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permissions');

router.get(
    '/stats',
    protect,
    authorize('super_admin', 'branch_admin'),
    tenantGuard,
    requireAnyPermission(['tenant.dashboard.view', 'branch.dashboard.view']),
    getOverviewStats
);

module.exports = router;
