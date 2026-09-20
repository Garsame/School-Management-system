const express = require('express');
const router = express.Router();
const studentPortalController = require('../controllers/studentPortalController');
const timetableController = require('../controllers/timetableController');
const { protect, authorize, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

// Apply middleware
router.use(protect);
router.use(authorize('student'));
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

router.get('/profile', requirePermission('student.profile.view'), studentPortalController.getProfile);
router.get('/academic-years', requirePermission('student.dashboard.view'), studentPortalController.getAcademicYears);
router.get('/subjects', requirePermission('student.results.view'), studentPortalController.getSubjects);
router.get('/results', requirePermission('student.results.view'), studentPortalController.getResults);
router.get('/rank', requirePermission('student.rank.view'), studentPortalController.getRank);
router.get('/exams', requirePermission('student.results.view'), studentPortalController.getExams);
router.get('/attendance', requirePermission('student.attendance.view'), studentPortalController.getAttendance);
router.get('/timetable/today', requirePermission('student.schedule.view'), timetableController.getStudentTimetableToday);
router.get('/timetable/week', requirePermission('student.schedule.view'), timetableController.getStudentTimetableWeek);
router.post('/auth/change-password', requirePermission('student.password.change'), studentPortalController.changePassword);

module.exports = router;
