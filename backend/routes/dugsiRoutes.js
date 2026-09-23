const express = require('express');
const router = express.Router();
const dugsiController = require('../controllers/dugsiController');
const { protect, tenantGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.use(protect);
router.use(tenantGuard);

// Reference data
router.get('/quran-reference', dugsiController.getQuranReference);

// Teacher operations
router.get('/my-classes', requirePermission('dugsi.students.view'), dugsiController.getMyAllocatedClasses);
router.get('/candidates', requirePermission('dugsi.students.manage'), dugsiController.getCandidateStudents);
router.post('/students/enroll', requirePermission('dugsi.students.manage'), dugsiController.enrollStudents);
router.delete('/students/:studentId', requirePermission('dugsi.students.manage'), dugsiController.withdrawStudent);
router.get('/students', requirePermission('dugsi.students.view'), dugsiController.getMyDugsiStudents);
router.patch('/students/:studentId/stage', requirePermission('dugsi.students.manage'), dugsiController.updateLearningStage);

// Attendance
router.get('/attendance/today', requirePermission('dugsi.attendance.take'), dugsiController.getTodayRegister);
router.post('/attendance', requirePermission('dugsi.attendance.take'), dugsiController.submitAttendance);

// Quran Progress Logs
router.get('/progress/:studentId', requirePermission('dugsi.students.view'), dugsiController.getStudentProgress);
router.post('/progress/:studentId', requirePermission('dugsi.progress.manage'), dugsiController.recordProgress);

// Admin oversight & allocations
router.get('/admin/allocations', requirePermission('dugsi.classes.assign'), dugsiController.getAdminAllocations);
router.post('/admin/allocate-classes', requirePermission('dugsi.classes.assign'), dugsiController.allocateClasses);
router.delete('/admin/allocations/:allocationId', requirePermission('dugsi.classes.assign'), dugsiController.removeAllocation);
router.get('/admin/overview', requirePermission('dugsi.overview.view'), dugsiController.getAdminOverview);

module.exports = router;
