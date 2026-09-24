const express = require('express');
const router = express.Router();
const { createAcademicYear, createClass, getAcademicYears, getClasses } = require('../controllers/academicController');
const { promoteStudents, transferStudent, transferStudentClass, getTransferBranches, getTransferClasses, getTransferSections } = require('../controllers/promotionController');
const { protect, tenantGuard, branchGuard } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');

router.use(protect);
router.use(tenantGuard);

router.post('/years', requirePermission('tenant.academicYears.create'), createAcademicYear);
router.get('/years', requirePermission('tenant.academicYears.view'), getAcademicYears);
router.post('/classes', requirePermission('branch.classes.create'), branchGuard, createClass);
router.get('/classes', requirePermission('branch.classes.view'), branchGuard, getClasses);
router.post('/promote', requirePermission('branch.promotions.run'), branchGuard, promoteStudents);
router.get('/transfer/branches', requirePermission('branch.transfers.run'), branchGuard, getTransferBranches);
router.get('/transfer/branches/:targetBranchId/classes', requirePermission('branch.transfers.run'), branchGuard, getTransferClasses);
router.get('/transfer/branches/:targetBranchId/classes/:classId/sections', requirePermission('branch.transfers.run'), branchGuard, getTransferSections);
router.post('/transfer', requirePermission('branch.transfers.run'), branchGuard, transferStudent);
router.post('/transfer/class', requireAnyPermission(['branch.transfers.run', 'enrollments.create']), branchGuard, transferStudentClass);

module.exports = router;
