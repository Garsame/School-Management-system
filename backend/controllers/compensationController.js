const CompensationChangeRequest = require('../models/CompensationChangeRequest');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');

const STAFF_ROLES = ['finance_director', 'hr_payroll_manager', 'branch_admin', 'teacher', 'cashier', 'registrar'];
const COMPENSATION_FIELDS = ['employmentType', 'hireDate', 'basicSalary', 'allowance', 'deductions', 'currency', 'paymentMethod', 'bankName', 'accountName', 'accountNumber', 'mobileMoneyNumber'];
const ENUM_VALUES = {
    employmentType: new Set(['Permanent', 'Contract', 'Part-time', 'Temporary', 'Volunteer']),
    paymentMethod: new Set(['Bank', 'Mobile Money', 'Cash', 'Other'])
};
const MONEY_FIELDS = new Set(['basicSalary', 'allowance', 'deductions']);

const sendResponse = (res, data = null, message = '') => res.json({ success: true, message, data });
const sendError = (res, status, message) => res.status(status).json({ success: false, message });
const validationError = (message, status = 400) => Object.assign(new Error(message), { status });
const cleanString = (value) => {
    if (value === undefined || value === null) return undefined;
    const cleaned = String(value).trim();
    return cleaned || undefined;
};

const snapshotCompensation = (source = {}) => ({
    employmentType: source.employmentType || undefined,
    hireDate: source.hireDate || undefined,
    basicSalary: Number(source.basicSalary || 0),
    allowance: Number(source.allowance || 0),
    deductions: Number(source.deductions || 0),
    currency: source.currency || 'USD',
    paymentMethod: source.paymentMethod || undefined,
    bankName: source.bankName || undefined,
    accountName: source.accountName || undefined,
    accountNumber: source.accountNumber || undefined,
    mobileMoneyNumber: source.mobileMoneyNumber || undefined
});

const normalizeProposal = (body, current) => {
    const proposed = { ...current };
    for (const field of COMPENSATION_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        const value = body[field];
        if (MONEY_FIELDS.has(field)) {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < 0) throw validationError(`${field} must be a non-negative number`);
            proposed[field] = amount;
            continue;
        }
        if (field === 'hireDate') {
            if (!value) {
                proposed.hireDate = undefined;
                continue;
            }
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) throw validationError('Hire date is invalid');
            proposed.hireDate = date;
            continue;
        }
        const cleaned = cleanString(value);
        if (ENUM_VALUES[field] && cleaned && !ENUM_VALUES[field].has(cleaned)) {
            throw validationError(`${field === 'employmentType' ? 'Employment type' : 'Payment method'} is invalid`);
        }
        proposed[field] = field === 'currency' ? cleaned?.toUpperCase() : cleaned;
    }
    if (!/^[A-Z]{3}$/.test(proposed.currency || '')) throw validationError('Currency must be a 3-letter code');
    if (proposed.deductions > proposed.basicSalary + proposed.allowance) {
        throw validationError('Deductions cannot exceed salary plus allowance');
    }
    if (proposed.paymentMethod !== 'Bank') {
        proposed.bankName = undefined;
        proposed.accountName = undefined;
        proposed.accountNumber = undefined;
    }
    if (proposed.paymentMethod !== 'Mobile Money') proposed.mobileMoneyNumber = undefined;
    return proposed;
};

const comparable = (value) => JSON.stringify({
    ...snapshotCompensation(value),
    hireDate: value?.hireDate ? new Date(value.hireDate).toISOString().slice(0, 10) : null
});
const auditCompensation = (value = {}) => ({
    employmentType: value.employmentType || null,
    hireDate: value.hireDate || null,
    basicSalary: Number(value.basicSalary || 0),
    allowance: Number(value.allowance || 0),
    deductions: Number(value.deductions || 0),
    currency: value.currency || 'USD',
    paymentMethod: value.paymentMethod || null
});

const submitCompensationChange = async (req, res) => {
    try {
        const reason = cleanString(req.body.reason);
        if (!reason) return sendError(res, 400, 'Reason for the salary change is required');
        if (reason.length > 500) return sendError(res, 400, 'Reason must be 500 characters or fewer');

        const employee = await User.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
            role: { $in: STAFF_ROLES }
        }).select('+employmentInfo.accountNumber +employmentInfo.mobileMoneyNumber');
        if (!employee) return sendError(res, 404, 'Employee not found');
        if (String(employee._id) === String(req.user._id)) {
            return sendError(res, 403, 'You cannot request a compensation change for your own account');
        }

        const currentCompensation = snapshotCompensation(employee.employmentInfo || {});
        const proposedCompensation = normalizeProposal(req.body, currentCompensation);
        if (comparable(currentCompensation) === comparable(proposedCompensation)) {
            return sendError(res, 400, 'No compensation changes were entered');
        }

        const request = await CompensationChangeRequest.create({
            tenantId: req.tenantId,
            branchId: employee.branchId || null,
            employeeId: employee._id,
            requestedBy: req.user._id,
            reason,
            currentCompensation,
            proposedCompensation
        });

        await logActivity({
            req,
            action: 'COMPENSATION_CHANGE_REQUESTED',
            entityType: 'CompensationChangeRequest',
            entityId: request._id.toString(),
            before: auditCompensation(currentCompensation),
            after: auditCompensation(proposedCompensation),
            reason
        });
        return sendResponse(res, request, 'Compensation change submitted for Finance Director approval');
    } catch (error) {
        if (error?.code === 11000) return sendError(res, 409, 'This employee already has a pending compensation change');
        return sendError(res, error.status || 400, error.message || 'Compensation change could not be submitted');
    }
};

const getCompensationRequests = async (req, res) => {
    try {
        const status = cleanString(req.query.status) || 'Pending';
        const allowedStatuses = new Set(['Pending', 'Approved', 'Rejected']);
        if (status !== 'All' && !allowedStatuses.has(status)) return sendError(res, 400, 'Request status is invalid');
        const query = { tenantId: req.tenantId };
        if (status !== 'All') query.status = status;
        const requests = await CompensationChangeRequest.find(query)
            .populate('employeeId', 'name email employeeId role branchId')
            .populate('branchId', 'name')
            .populate('requestedBy', 'name email')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 });
        return sendResponse(res, requests);
    } catch (error) {
        return sendError(res, 500, error.message || 'Compensation requests could not be loaded');
    }
};

const applyCompensation = async (employee, compensation, reviewerId) => {
    employee.employmentInfo = employee.employmentInfo || {};
    for (const field of COMPENSATION_FIELDS) employee.employmentInfo[field] = compensation[field] ?? undefined;
    employee.updatedBy = reviewerId;
    await employee.save();
};

const reviewCompensationRequest = async (req, res) => {
    let request;
    try {
        const action = cleanString(req.body.action);
        const reviewRemarks = cleanString(req.body.reviewRemarks);
        if (!['Approved', 'Rejected'].includes(action)) return sendError(res, 400, 'Action must be Approved or Rejected');
        if (action === 'Rejected' && !reviewRemarks) return sendError(res, 400, 'Rejection remarks are required');

        request = await CompensationChangeRequest.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId, status: 'Pending' },
            { $set: { status: 'Processing' } },
            { new: true }
        );
        if (!request) return sendError(res, 404, 'Pending compensation request not found');
        if (String(request.employeeId) === String(req.user._id)) throw validationError('You cannot approve your own compensation change', 403);

        let employee = null;
        if (action === 'Approved') {
            employee = await User.findOne({
                _id: request.employeeId,
                tenantId: req.tenantId,
                role: { $in: STAFF_ROLES }
            }).select('+employmentInfo.accountNumber +employmentInfo.mobileMoneyNumber');
            if (!employee) throw validationError('Employee not found', 404);
            const actualCompensation = snapshotCompensation(employee.employmentInfo || {});
            if (comparable(actualCompensation) !== comparable(request.currentCompensation)) {
                throw validationError('The employee compensation changed after this request was submitted. Ask HR to submit a new request.', 409);
            }
            await applyCompensation(employee, request.proposedCompensation, req.user._id);
        }

        request.status = action;
        request.isOpen = false;
        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        request.reviewRemarks = reviewRemarks;
        await request.save();

        await logActivity({
            req,
            action: action === 'Approved' ? 'COMPENSATION_CHANGE_APPROVED' : 'COMPENSATION_CHANGE_REJECTED',
            entityType: 'CompensationChangeRequest',
            entityId: request._id.toString(),
            before: auditCompensation(request.currentCompensation),
            after: action === 'Approved' ? auditCompensation(request.proposedCompensation) : null,
            reason: reviewRemarks || request.reason
        });
        return sendResponse(res, request, `Compensation change ${action.toLowerCase()}`);
    } catch (error) {
        if (request?._id && request.status === 'Processing') {
            await CompensationChangeRequest.updateOne({ _id: request._id, status: 'Processing' }, { $set: { status: 'Pending' } });
        }
        return sendError(res, error.status || 400, error.message || 'Compensation request could not be reviewed');
    }
};

module.exports = {
    getCompensationRequests,
    reviewCompensationRequest,
    submitCompensationChange
};
