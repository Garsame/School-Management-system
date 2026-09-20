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

const { protect, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

// Shared read-only branch lookups: classes, sections, subjects, academic years.
// Phase 3 removed the role list so a school can grant these to a role of its own,
// such as an Admission Manager. branch.classes.view is the real gate.
router.use(protect);
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

// Shared Resources
router.get('/classes', requirePermission('branch.classes.view'), getClasses);
router.get('/class-categories', requirePermission('branch.classes.view'), getClassCategories);
router.get('/sections', requirePermission('branch.classes.view'), getSections);
router.get('/subjects', requirePermission('branch.classes.view'), getSubjects);
router.get('/class-subjects', requirePermission('branch.classes.view'), getClassSubjects);
router.get('/academic-years/current', requirePermission('branch.classes.view'), getCurrentAcademicYear);
router.get('/students', requirePermission('students.view'), getStudents);

module.exports = router;
