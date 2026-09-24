const express = require('express');
const router = express.Router();
const {
    getClasses, createClass, getClass, updateClass,
    getCurrentAcademicYear, getAcademicYears,
    createBranchUser, getBranchUsers, updateBranchUser,
    getStudents, getStudent, promoteStudents,
    createExam, getExams, getExamResults, getResultsSummary,
    getBranchOverview,
    createTeacherWithAssignments, updateTeacherAssignments, getTeacherAssignments,
    getClassCategories, createClassCategory,
    getSections, createSection,
    getSubjects, createSubject,
    getExamCategories, createExamCategory, exportExamResults,
    updateExamStatus, deleteExam, getStudentResults
} = require('../controllers/branchAdminController');
const timetableController = require('../controllers/timetableController');

const { protect, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');
const { enforcePlanLimit } = require('../services/planLimitService');
const { getTerms } = require('../controllers/academicPolicyController');

// Apply Global Middleware for Branch Admin
// Must be: Authenticated -> Branch Admin Role -> Branch Scope -> Tenant Valid -> Branch Valid
router.use(protect);
// Phase 3: the blanket role gate is gone. Every route below carries its own
// requirePermission, which is the real check — the role gate only stopped a school
// from giving these capabilities to a role it defined itself, such as an Admission
// Manager who manages classes. Scope and tenant isolation still apply.
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

// --- B) Class Management ---
router.get('/classes', requirePermission('branch.classes.view'), getClasses);
router.post('/classes', requirePermission('branch.classes.create'), createClass);
router.get('/classes/:classId', requirePermission('branch.classes.view'), getClass);
router.put('/classes/:classId', requirePermission('branch.classes.update'), updateClass);

router.get('/class-categories', requirePermission('branch.classes.view'), getClassCategories);
router.post('/class-categories', requirePermission('branch.classes.create'), createClassCategory);

router.get('/sections', requirePermission('branch.classes.view'), getSections);
router.post('/sections', requirePermission('branch.sections.manage'), createSection);

router.get('/subjects', requirePermission('branch.classes.view'), getSubjects);
router.post('/subjects', requirePermission('branch.subjects.manage'), createSubject);

router.get('/class-subjects', requirePermission('branch.classes.view'), require('../controllers/branchAdminController').getClassSubjects);
router.post('/class-subjects', requirePermission('branch.subjects.manage'), require('../controllers/branchAdminController').createClassSubject);
router.delete('/class-subjects/:id', requirePermission('branch.subjects.manage'), require('../controllers/branchAdminController').deleteClassSubject);

router.get('/student-id-config', requirePermission('branch.classes.view'), require('../controllers/branchAdminController').getStudentIdConfig);
router.put('/student-id-config', requirePermission('branch.classes.update'), require('../controllers/branchAdminController').updateStudentIdConfig);

// Academic years are shared reference data, but they still need a gate: without the
// blanket role check below, any branch-scoped account could read them. Anyone doing
// academic work in the branch holds at least one of these.
const requireAcademicContext = requireAnyPermission([
    'branch.classes.view',
    'students.view',
    'branch.exams.view'
]);
router.get('/academic-years/current', requireAcademicContext, getCurrentAcademicYear);
router.get('/academic-years', requireAcademicContext, getAcademicYears);
router.get('/academic-years/:yearId/terms', requirePermission('branch.exams.view'), getTerms);

// --- B.1) Timetable Management ---
router.post('/timetable/slots', requirePermission('branch.timetable.manage'), timetableController.createTimetableSlot);
router.get('/timetable/slots', requirePermission('branch.timetable.view'), timetableController.getBranchTimetableSlots);
router.put('/timetable/slots/:slotId', requirePermission('branch.timetable.manage'), timetableController.updateTimetableSlot);
router.patch('/timetable/slots/:slotId/status', requirePermission('branch.timetable.manage'), timetableController.updateTimetableSlotStatus);

// --- C) Branch Staff Management ---
router.get('/users', requirePermission('branch.staff.view'), getBranchUsers);
router.post('/users', requirePermission('branch.staff.create'), enforcePlanLimit('users'), createBranchUser);
router.put('/users/:userId', requirePermission('branch.staff.update'), updateBranchUser);
// router.patch('/users/:userId/status') // Implemented via PUT for simplicity or separate if needed

// Teacher Specifics
router.post('/users/teachers', requirePermission('branch.staff.create'), enforcePlanLimit('users'), createTeacherWithAssignments);
router.put('/users/teachers/:teacherUserId/assignments', requirePermission('branch.assignments.manage'), updateTeacherAssignments);
router.get('/users/teachers/:teacherUserId/assignments', requirePermission('branch.assignments.view'), getTeacherAssignments);
router.get('/assignments/all', requirePermission('branch.assignments.view'), require('../controllers/branchAdminController').getAllBranchAssignments);

// --- D) Student Lifecycle ---
router.get('/students', requirePermission('branch.students.view'), getStudents);
router.get('/students/:studentId', requirePermission('branch.students.detail'), getStudent);
router.post('/enrollments/promote', requirePermission('branch.promotions.run'), promoteStudents);

// --- E) Exams Oversight ---
router.get('/exam-categories', requirePermission('branch.exams.view'), getExamCategories);
router.post('/exam-categories', requirePermission('branch.exams.create'), createExamCategory);

router.get('/exams', requirePermission('branch.exams.view'), getExams);
router.post('/exams', requirePermission('branch.exams.create'), createExam);
router.patch('/exams/:id/status', requirePermission('branch.exams.update'), updateExamStatus);
router.delete('/exams/:id', requirePermission('branch.exams.delete'), deleteExam);
router.get('/results', requirePermission('branch.results.view'), getExamResults);
router.get('/results/export.csv', requirePermission('branch.results.export'), exportExamResults);
router.get('/results/summary', requirePermission('branch.results.view'), getResultsSummary);
router.get('/results/class', requirePermission('branch.results.view'), require('../controllers/branchAdminController').getClassResults);
router.get('/results/student', requirePermission('branch.results.view'), getStudentResults);

// --- F) Reporting ---
router.get('/reports/overview', requirePermission('branch.reports.view'), getBranchOverview);

module.exports = router;
