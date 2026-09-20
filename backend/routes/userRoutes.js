const express = require('express');
const router = express.Router();
const { addStaff, getStaff } = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { enforcePlanLimit } = require('../services/planLimitService');

router.use(protect);

router.post('/staff', requirePermission('branch.staff.create'), enforcePlanLimit('users'), addStaff);
router.get('/staff', requirePermission('branch.staff.view'), getStaff);

module.exports = router;
