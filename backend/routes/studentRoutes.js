const express = require('express');
const router = express.Router();
const { admitStudent, getStudents, getStudentDetails } = require('../controllers/studentController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { enforcePlanLimit } = require('../services/planLimitService');

router.use(protect);

router.post('/', requirePermission('students.create'), enforcePlanLimit('students'), admitStudent);
router.get('/', requirePermission('students.view'), getStudents);
router.get('/class/:classId', requirePermission('students.view'), require('../controllers/studentController').getStudentsByClass);
router.get('/:id', requirePermission('students.detail'), getStudentDetails);

module.exports = router;
