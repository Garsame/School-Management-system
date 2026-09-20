const express = require('express');
const router = express.Router();
const { getOverviewStats } = require('../controllers/dashboardController');
const { protect, tenantGuard } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permissions');

router.get(
    '/stats',
    protect,
    tenantGuard,
    requireAnyPermission(['tenant.dashboard.view', 'branch.dashboard.view']),
    getOverviewStats
);

module.exports = router;
