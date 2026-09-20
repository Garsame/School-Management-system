const express = require('express');
const router = express.Router();
const {
    getClasses,
    getCurrentAcademicYear,
    getStudents,
    getClassCategories,
    getSections,
    getSubjects,
    getClassSubjects
} = require('../controllers/branchAdminController');

const { protect, authorize, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

// Middleware for Branch Access (Shared Resources)
// Allows 'branch_admin' OR 'registrar' OR 'teacher'
router.use(protect);
router.use(authorize('branch_admin', 'registrar', 'teacher'));
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

// Shared Resources
router.get('/classes', requirePermission('branch.classes.view'), getClasses);
router.get('/class-categories', requirePermission('branch.classes.view'), getClassCategories);
router.get('/sections', requirePermission('branch.classes.view'), getSections);
router.get('/subjects', requirePermission('branch.classes.view'), getSubjects);
router.get('/class-subjects', requirePermission('branch.classes.view'), getClassSubjects);
router.get('/academic-years/current', getCurrentAcademicYear);
router.get('/students', requirePermission('students.view'), getStudents);

module.exports = router;
