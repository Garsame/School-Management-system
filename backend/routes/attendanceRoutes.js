const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { protect, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

// School-side attendance. No role or scope lock: a single-campus head of school is
// tenant-scoped and a per-branch admissions officer is branch-scoped, and both need this.
// attendanceController confines a branch-scoped caller to their own branch and takes the
// branch from the class for a school-wide one.
//
// The teacher path in teacherRoutes is separate and unchanged: a teacher still owns their
// own sessions and is still bound by their class assignments.
router.use(protect);
router.use(tenantGuard);
router.use(branchGuard);

router.get('/summary', requirePermission('attendance.oversight.view'), attendanceController.getSummary);
router.get('/sessions', requirePermission('attendance.oversight.view'), attendanceController.getSessions);
router.post('/sessions', requirePermission('attendance.oversight.manage'), attendanceController.openSession);
router.get('/sessions/:sessionId', requirePermission('attendance.oversight.view'), attendanceController.getSessionRegister);
router.put('/sessions/:sessionId/records', requirePermission('attendance.oversight.manage'), attendanceController.submitRecords);
router.patch('/sessions/:sessionId/close', requirePermission('attendance.oversight.manage'), attendanceController.closeSession);
router.get('/students/:studentId', requirePermission('attendance.oversight.view'), attendanceController.getStudentAttendance);

module.exports = router;
