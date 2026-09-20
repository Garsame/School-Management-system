const express = require('express');
const router = express.Router();
const { admitStudent, getStudents, getStudentDetails } = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { enforcePlanLimit } = require('../services/planLimitService');

router.use(protect);

router.post('/', authorize('super_admin', 'branch_admin', 'registrar'), requirePermission('students.create'), enforcePlanLimit('students'), admitStudent);
router.get('/', authorize('super_admin', 'branch_admin', 'registrar', 'teacher'), requirePermission('students.view'), getStudents);
router.get('/class/:classId', authorize('super_admin', 'branch_admin', 'registrar', 'teacher'), requirePermission('students.view'), require('../controllers/studentController').getStudentsByClass);
router.get('/:id', authorize('super_admin', 'branch_admin', 'registrar', 'teacher', 'student', 'parent'), requirePermission('students.detail'), getStudentDetails);

module.exports = router;
