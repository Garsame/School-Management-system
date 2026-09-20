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
const { protect, authorize, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');

// Protect all routes
router.use(protect);
router.use(tenantGuard);

// Leaves management
router.post('/leaves', authorize('teacher', 'cashier', 'registrar', 'branch_admin'), requireAnyPermission(['hr.leaves.create', 'teacher.leaves.create']), createLeaveRequest);
router.get('/leaves', authorize('teacher', 'cashier', 'registrar', 'branch_admin', 'super_admin', 'hr_payroll_manager'), requireAnyPermission(['hr.leaves.view', 'hr.leaves.review']), getLeaveRequests);
router.put('/leaves/:id/review', authorize('branch_admin', 'super_admin', 'hr_payroll_manager'), requirePermission('hr.leaves.review'), reviewLeaveRequest);

// Payroll management
router.get('/employees', authorize('hr_payroll_manager'), requirePermission('hr.employees.view'), getEmployees);
router.put('/employees/:id/compensation', authorize('hr_payroll_manager'), requirePermission('hr.employees.update'), submitCompensationChange);
router.post('/payroll/generate', authorize('hr_payroll_manager'), requirePermission('payroll.generate'), generatePayroll);
router.get('/payroll', authorize('teacher', 'cashier', 'registrar', 'branch_admin', 'super_admin', 'finance_director', 'hr_payroll_manager'), requireAnyPermission(['payroll.self.view', 'payroll.view']), getPayrollHistory);
router.put('/payroll/:id/review', authorize('hr_payroll_manager'), requirePermission('payroll.review'), reviewPayroll);
router.put('/payroll/:id/approve', authorize('finance_director'), requirePermission('payroll.approve'), approvePayroll);
router.put('/payroll/:id/pay', authorize('cashier', 'super_admin'), requirePermission('payroll.pay'), payPayroll);

module.exports = router;
