const express = require('express');
const router = express.Router();
const {
    getCurrentAcademicYear,
    createStudentAdmission,
    getStudents,
    getStudentById,
    updateStudent,
    resetStudentPassword,
    createEnrollment,
    getRegistrarStats,
    exportStudents,
    getAdmissionSummary,
    downloadStudentImportTemplate,
    previewStudentImport
} = require('../controllers/registrarController');

const { protect, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');
const { enforcePlanLimit } = require('../services/planLimitService');

// Global Middleware for Registrar Routes
// 1. Authenticate (JWT)
// 2. Role Check (Registrar)
// 3. Scope Check (Branch)
// 4. Tenant Isolation
// 5. Branch Isolation
router.use(protect);
// Phase 3: the blanket role gate is gone so a school can define its own admissions
// role. Every route below carries its own requirePermission.
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

// Routes
// Shared reference data, gated so it is not left open once the role gate is removed.
router.get('/academic-years/current', requireAnyPermission(['students.view', 'students.create']), getCurrentAcademicYear);
router.get('/stats', requirePermission('students.view'), getRegistrarStats);
router.post('/students', requirePermission('students.create'), enforcePlanLimit('students'), createStudentAdmission);
router.get('/students', requirePermission('students.view'), getStudents);
router.get('/students/export.csv', requirePermission('students.view'), exportStudents);
router.get('/students/import-template.csv', requirePermission('students.create'), downloadStudentImportTemplate);
router.post('/students/import-preview', requirePermission('students.create'), previewStudentImport);
router.get('/students/:id', requirePermission('students.detail'), getStudentById);
router.get('/students/:id/admission-summary', requirePermission('students.detail'), getAdmissionSummary);
router.put('/students/:id', requirePermission('students.update'), updateStudent);
router.put('/students/:id/reset-password', requirePermission('students.password.reset'), resetStudentPassword);
router.post('/enrollments', requirePermission('enrollments.create'), createEnrollment);

module.exports = router;
