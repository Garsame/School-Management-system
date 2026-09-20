const LeaveRequest = require('../models/LeaveRequest');
const Payroll = require('../models/Payroll');
const User = require('../models/User');
const CompensationChangeRequest = require('../models/CompensationChangeRequest');
const { logActivity } = require('../utils/logger'); // Fallback or logger
const mongoose = require('mongoose');

const STAFF_ROLES = ['finance_director', 'hr_payroll_manager', 'branch_admin', 'teacher', 'cashier', 'registrar'];
const EMPLOYEE_DIRECTORY_FIELDS = [
    'name', 'email', 'role', 'branchId', 'employeeId', 'isActive',
    'employmentInfo.employmentType', 'employmentInfo.hireDate',
    'employmentInfo.basicSalary', 'employmentInfo.allowance', 'employmentInfo.deductions',
    'employmentInfo.currency', 'employmentInfo.paymentMethod',
    'employmentInfo.bankName', 'employmentInfo.accountName',
    '+employmentInfo.accountNumber', '+employmentInfo.mobileMoneyNumber'
].join(' ');

// Helper for responses
const sendResponse = (res, success, data = null, message = '') => {
    return res.json({ success, message, data });
};

const sendError = (res, code, message) => {
    return res.status(code).json({ success: false, message });
};

// --- LEAVE MANAGEMENT ---

// @desc    Create a Leave Request
// @route   POST /api/hr/leaves
// @access  Private (Staff/Teachers)
const createLeaveRequest = async (req, res) => {
    try {
        const { type, startDate, endDate, reason } = req.body;

        if (!type || !startDate || !endDate || !reason) {
            return sendError(res, 400, 'type, startDate, endDate, and reason are required');
        }

        const leave = await LeaveRequest.create({
            tenantId: req.tenantId,
            branchId: req.branchId || req.body.branchId, // Ensure branch context
            userId: req.user._id,
            type,
            startDate,
            endDate,
            reason,
            status: 'Pending'
        });

        sendResponse(res, true, leave, 'Leave request submitted successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Leave Requests
// @route   GET /api/hr/leaves
// @access  Private (Staff/Branch Admin)
const getLeaveRequests = async (req, res) => {
    try {
        const query = { tenantId: req.tenantId };

        // Staff can only see their own requests
        if (req.user.role === 'teacher' || req.user.role === 'cashier' || req.user.role === 'registrar') {
            query.userId = req.user._id;
        } else if (req.user.role === 'branch_admin') {
            // Branch Admins see leaves for their branch
            query.branchId = req.user.branchId;
        } else if (!['super_admin', 'hr_payroll_manager'].includes(req.user.role)) {
            return sendError(res, 403, 'Unauthorized access');
        }

        const leaves = await LeaveRequest.find(query)
            .populate('userId', 'name email role')
            .populate('reviewedBy', 'name')
            .sort({ createdAt: -1 });

        sendResponse(res, true, leaves);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Review Leave Request (Approve/Reject)
// @route   PUT /api/hr/leaves/:id/review
// @access  Private (Branch Admin/Super Admin)
const reviewLeaveRequest = async (req, res) => {
    try {
        const { status, reviewRemarks } = req.body;
        const leaveId = req.params.id;

        if (!['Approved', 'Rejected'].includes(status)) {
            return sendError(res, 400, 'Invalid status. Must be Approved or Rejected');
        }

        const leave = await LeaveRequest.findOne({ _id: leaveId, tenantId: req.tenantId });
        if (!leave) return sendError(res, 404, 'Leave request not found');

        // Branch Admins can only approve leaves in their branch
        if (req.user.role === 'branch_admin' && leave.branchId.toString() !== req.user.branchId.toString()) {
            return sendError(res, 403, 'Unauthorized to review requests for this branch');
        }

        leave.status = status;
        leave.reviewRemarks = reviewRemarks;
        leave.reviewedBy = req.user._id;
        await leave.save();

        sendResponse(res, true, leave, `Leave request has been ${status.toLowerCase()}`);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// --- PAYROLL MANAGEMENT ---

// @desc    Generate Payroll for a specific month/year
// @route   POST /api/hr/payroll/generate
// @access  Private (Branch Admin/Super Admin)
const generatePayroll = async (req, res) => {
    try {
        const { month, year } = req.body;
        if (!month || !year) return sendError(res, 400, 'month and year are required');

        const branchId = req.user.branchId || req.body.branchId || null;
        if (req.user.role === 'branch_admin' && !branchId) return sendError(res, 400, 'branchId is required');

        // 1. Get all active staff users in the branch
        const staffQuery = {
            tenantId: req.tenantId,
            role: { $in: STAFF_ROLES },
            isActive: true
        };
        if (branchId) staffQuery.branchId = branchId;
        const staff = await User.find(staffQuery);

        let createdCount = 0;
        let skippedCount = 0;
        const missingCompensationProfiles = [];

        for (const member of staff) {
            try {
                // Check if payroll already generated for this month
                const existing = await Payroll.findOne({
                    tenantId: req.tenantId,
                    branchId: member.branchId || null,
                    userId: member._id,
                    month,
                    year
                });

                if (existing) {
                    skippedCount++;
                    continue;
                }

                const basicSalary = member.employmentInfo?.basicSalary || 0;
                const allowances = member.employmentInfo?.allowance || 0;
                const deductions = member.employmentInfo?.deductions || 0;
                const currency = member.employmentInfo?.currency || 'USD';
                if (basicSalary <= 0) {
                    missingCompensationProfiles.push({ userId: member._id, name: member.name });
                    skippedCount++;
                    continue;
                }
                const netSalary = basicSalary + allowances - deductions;

                await Payroll.create({
                    tenantId: req.tenantId,
                    branchId: member.branchId || null,
                    userId: member._id,
                    month,
                    year,
                    basicSalary,
                    allowances,
                    deductions,
                    netSalary,
                    currency,
                    status: 'Draft'
                });

                createdCount++;
            } catch (err) {
                console.error(`[PAYROLL GENERATE] Error for user ${member._id}:`, err.message);
                skippedCount++;
            }
        }

        sendResponse(res, true, { createdCount, skippedCount, missingCompensationProfiles },
            missingCompensationProfiles.length > 0
                ? 'Payroll generated; staff without configured salaries were skipped.'
                : 'Payroll generated successfully');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Get Payroll History
// @route   GET /api/hr/payroll
// @access  Private (Staff/Branch Admin)
const getPayrollHistory = async (req, res) => {
    try {
        const { month, year } = req.query;
        const query = { tenantId: req.tenantId };

        if (month) query.month = Number(month);
        if (year) query.year = Number(year);

        // What you see follows the permission you hold, not the role you happen to have.
        // payroll.self.view is your own payslips; payroll.view is other people's, bounded
        // by your scope. The previous role list denied anyone outside it, so a school that
        // granted payroll.view to a role of its own got a 403 despite holding it.
        if (!req.permissions.includes('payroll.view')) {
            query.userId = req.user._id;
        } else if (req.scope === 'branch') {
            // Own branch, plus head-office staff (branchId null) such as the HR Manager
            // and Finance Director, whose payroll belongs to no branch.
            query.$or = [{ branchId: req.branchId }, { branchId: null }];
        }

        const payrolls = await Payroll.find(query)
            .populate('userId', 'name email role')
            .populate('branchId', 'name')
            .sort({ year: -1, month: -1 });

        const staffPayrolls = payrolls.filter((payroll) => (
            payroll.userId && STAFF_ROLES.includes(payroll.userId.role)
        ));

        sendResponse(res, true, staffPayrolls);
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

// @desc    Pay Salary (Mark payroll as paid)
// @route   PUT /api/hr/payroll/:id/pay
// @access  Private (Branch Admin/Super Admin)
const payPayroll = async (req, res) => {
    try {
        const payrollId = req.params.id;
        const payroll = await Payroll.findOne({ _id: payrollId, tenantId: req.tenantId });

        if (!payroll) return sendError(res, 404, 'Payroll record not found');
        if (payroll.status === 'Paid') return sendError(res, 400, 'Payroll already processed and paid');
        if (payroll.status !== 'Approved') {
            return sendError(res, 400, 'Payroll must be approved before it can be paid');
        }

        // Branch-scoped payers are limited to their own branch, plus head-office payroll
        // (branchId null) for tenant-scoped staff such as the HR Manager and Finance
        // Director. Tenant-scoped payers cover the whole school.
        //
        // This is keyed on scope, not role. It used to check `role === 'cashier'`, which
        // meant any other role skipped the branch check entirely — harmless while only
        // cashiers could reach here, but wide open once a school can grant payroll.pay to
        // a role of its own.
        if (req.scope === 'branch' && payroll.branchId && String(payroll.branchId) !== String(req.branchId)) {
            return sendError(res, 403, 'Unauthorized to process payroll for this branch');
        }

        payroll.status = 'Paid';
        payroll.paidAt = new Date();
        payroll.paidBy = req.user._id;
        await payroll.save();

        sendResponse(res, true, payroll, 'Payroll salary marked as Paid');
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

const transitionPayroll = (from, to, timeField, userField) => async (req, res) => {
    try {
        const payroll = await Payroll.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (!payroll) return sendError(res, 404, 'Payroll record not found');
        if (payroll.status !== from) return sendError(res, 400, `Only ${from} payroll can be marked ${to}`);
        payroll.status = to;
        payroll[timeField] = new Date();
        payroll[userField] = req.user._id;
        await payroll.save();
        return sendResponse(res, true, payroll, `Payroll marked ${to}`);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

const reviewPayroll = transitionPayroll('Draft', 'Reviewed', 'reviewedAt', 'reviewedBy');
const approvePayroll = transitionPayroll('Reviewed', 'Approved', 'approvedAt', 'approvedBy');

const getEmployees = async (req, res) => {
    try {
        const query = { tenantId: req.tenantId, role: { $in: STAFF_ROLES } };
        if (req.query.branchId) query.branchId = req.query.branchId;
        const employees = await User.find(query)
            .select(EMPLOYEE_DIRECTORY_FIELDS)
            .populate('branchId', 'name')
            .sort({ name: 1 })
            .lean();
        const pendingRequests = await CompensationChangeRequest.find({
            tenantId: req.tenantId,
            employeeId: { $in: employees.map((employee) => employee._id) },
            status: 'Pending'
        })
            .select('employeeId status reason proposedCompensation requestedBy createdAt')
            .populate('requestedBy', 'name')
            .lean();
        const pendingByEmployee = new Map(pendingRequests.map((request) => [String(request.employeeId), request]));
        return sendResponse(res, true, employees.map((employee) => ({
            ...employee,
            pendingCompensationRequest: pendingByEmployee.get(String(employee._id)) || null
        })));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

module.exports = {
    createLeaveRequest,
    getLeaveRequests,
    reviewLeaveRequest,
    generatePayroll,
    getPayrollHistory,
    payPayroll,
    reviewPayroll,
    approvePayroll,
    getEmployees
};
