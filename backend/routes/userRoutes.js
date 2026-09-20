const express = require('express');
const router = express.Router();
const { addStaff, getStaff } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { enforcePlanLimit } = require('../services/planLimitService');

router.use(protect);

router.post('/staff', authorize('super_admin', 'branch_admin'), requirePermission('branch.staff.create'), enforcePlanLimit('users'), addStaff);
router.get('/staff', authorize('super_admin', 'branch_admin'), requirePermission('branch.staff.view'), getStaff);

module.exports = router;
