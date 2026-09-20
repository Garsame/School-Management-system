const express = require('express');
const router = express.Router();
const { assignTeacher, getMyAssignments, getAllAssignments } = require('../controllers/assignmentController');
const { protect, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.use(protect);
router.use(tenantGuard);

router.post('/', requirePermission('branch.assignments.manage'), branchGuard, assignTeacher);
router.get('/', requirePermission('branch.assignments.view'), branchGuard, getAllAssignments);
router.get('/my', getMyAssignments);

module.exports = router;
