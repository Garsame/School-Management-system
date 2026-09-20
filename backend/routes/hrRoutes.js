const express = require('express');
const router = express.Router();
const {
    createLeaveRequest,
    getLeaveRequests,
    reviewLeaveRequest,
    generatePayroll,
    getPayrollHistory,
    payPayroll
} = require('../controllers/hrController');
const { getEmployees, reviewPayroll, approvePayroll } = require('../controllers/hrController');
const { submitCompensationChange } = require('../controllers/compensationController');
const { protect, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');

// Protect all routes
router.use(protect);
router.use(tenantGuard);

// Leaves management
router.post('/leaves', requireAnyPermission(['hr.leaves.create', 'teacher.leaves.create']), createLeaveRequest);
router.get('/leaves', requireAnyPermission(['hr.leaves.view', 'hr.leaves.review']), getLeaveRequests);
router.put('/leaves/:id/review', requirePermission('hr.leaves.review'), reviewLeaveRequest);

// Payroll management
router.get('/employees', requirePermission('hr.employees.view'), getEmployees);
router.put('/employees/:id/compensation', requirePermission('hr.employees.update'), submitCompensationChange);
router.post('/payroll/generate', requirePermission('payroll.generate'), generatePayroll);
router.get('/payroll', requireAnyPermission(['payroll.self.view', 'payroll.view']), getPayrollHistory);
router.put('/payroll/:id/review', requirePermission('payroll.review'), reviewPayroll);
router.put('/payroll/:id/approve', requirePermission('payroll.approve'), approvePayroll);
router.put('/payroll/:id/pay', requirePermission('payroll.pay'), payPayroll);

module.exports = router;
