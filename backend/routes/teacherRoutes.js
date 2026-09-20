const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const timetableController = require('../controllers/timetableController');
const { protect, authorize, requireScope, tenantGuard, branchGuard, teacherAssignmentGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

// Apply common middleware to all teacher routes
router.use(protect);
router.use(authorize('teacher'));
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

// --- Exams ---
router.get('/exam-categories', requirePermission('teacher.examCategories.view'), teacherController.getExamCategories);
router.get('/exam-templates', requirePermission('teacher.examTemplates.view'), teacherController.getExamTemplates);
router.get('/exams', requirePermission('teacher.exams.view'), teacherController.getExams);
router.get('/exams/:examId/students', requirePermission('teacher.exams.view'), teacherAssignmentGuard, teacherController.getExamStudents);
router.get('/exams/:examId', requirePermission('teacher.exams.view'), teacherAssignmentGuard, teacherController.getExam);

// --- Results ---
router.post('/exam-results', requirePermission('teacher.results.enter'), teacherAssignmentGuard, teacherController.enterResult);
router.post('/exam-results/bulk', requirePermission('teacher.results.enter'), teacherAssignmentGuard, teacherController.batchEnterResults);
router.post('/exam-results/batch', requirePermission('teacher.results.enter'), teacherAssignmentGuard, teacherController.batchEnterResults);
router.put('/exam-results/:resultId', requirePermission('teacher.results.update'), teacherController.updateResult);
router.get('/exam-results', requirePermission('teacher.results.view'), teacherController.getResults);
router.get('/exam-results/summary', requirePermission('teacher.results.view'), teacherAssignmentGuard, teacherController.getResultsSummary);
router.get('/results/class', requirePermission('teacher.results.view'), teacherAssignmentGuard, teacherController.getClassResults);

// --- Attendance ---
router.post('/attendance/open', requirePermission('teacher.attendance.open'), timetableController.openAttendanceForScheduledClass);
router.post('/attendance/sessions', requirePermission('teacher.attendance.open'), teacherAssignmentGuard, teacherController.createAttendanceSession);
router.get('/attendance/sessions', requirePermission('teacher.attendance.view'), teacherController.getAttendanceSessions);
router.post('/attendance/sessions/:sessionId/records', requirePermission('teacher.attendance.submit'), teacherController.submitAttendanceRecords);
router.post('/attendance/sessions/:sessionId/close', requirePermission('teacher.attendance.submit'), timetableController.closeAttendanceSession);

// --- Timetable ---
router.get('/timetable/today', requirePermission('teacher.schedule.view'), timetableController.getTeacherTimetableToday);
router.get('/timetable/week', requirePermission('teacher.schedule.view'), timetableController.getTeacherTimetableWeek);

// --- Assignments ---
router.get('/branches', requirePermission('teacher.dashboard.view'), teacherController.getAuthorizedBranches);
router.get('/assignments', requirePermission('teacher.dashboard.view'), teacherController.getTeacherAssignments);

// --- Exports ---
router.get('/exports/results', requirePermission('teacher.results.export'), teacherAssignmentGuard, teacherController.exportResults);

// --- Policy ---
router.get('/grading-policy', requirePermission('teacher.gradingPolicy.view'), teacherController.getGradingPolicy);

// --- Self Profile & Password Settings ---
router.get('/profile', teacherController.getProfile);
router.put('/profile', teacherController.updateProfile);
router.put('/change-password', teacherController.changePassword);

// --- Students ---
router.get('/students', requirePermission('students.view'), teacherController.getStudents);

module.exports = router;
