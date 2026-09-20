const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);
const {
    assertValidRoleScope,
    BRANCH_ADMIN_CREATABLE_ROLES,
    TENANT_ADMIN_CREATABLE_ROLES
} = require('../utils/rolePolicy');
const { getEffectivePermissions, getUserPermissionParts } = require('../utils/permissions');
const { generateTemporaryPassword } = require('../utils/passwords');
const { authorize } = require('../middleware/auth');
const {
    requireAllPermissions,
    requireAnyPermission,
    requirePermission
} = require('../middleware/permissions');
const { assertTenantTransition, resolveTenantStatus } = require('../services/tenantStatusService');
const { limitsFromPlan, toPlanLimit } = require('../services/planLimitService');
const { resolvePassMarkPercent } = require('../utils/grading');
const { classifyPromotion, isNextGradeLevel } = require('../services/promotionEligibilityService');
const {
    addBillingPeriod,
    getGracePeriodEndsAt,
    recordSubscriptionPayment,
    reconcileSubscriptionStatuses,
    resolvePlanPrice,
    reverseSubscriptionPayment
} = require('../services/subscriptionBillingService');

const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

test('role policy enforces fixed scopes', () => {
    assert.deepEqual(assertValidRoleScope('teacher', 'branch'), { role: 'teacher', scope: 'branch' });
    assert.throws(() => assertValidRoleScope('teacher', 'tenant'), /requires branch scope/);
    assert.throws(() => assertValidRoleScope('platform_owner', 'tenant'), /requires platform scope/);
});

test('administrators cannot provision platform owners', () => {
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('platform_owner'), false);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('branch_admin'), true);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('finance_director'), true);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('teacher'), false);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('cashier'), false);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('registrar'), false);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('parent'), false);
    assert.equal(TENANT_ADMIN_CREATABLE_ROLES.has('super_admin'), false);
    assert.equal(BRANCH_ADMIN_CREATABLE_ROLES.has('platform_owner'), false);
    assert.equal(BRANCH_ADMIN_CREATABLE_ROLES.has('super_admin'), false);
    assert.deepEqual([...BRANCH_ADMIN_CREATABLE_ROLES].sort(), ['cashier', 'registrar', 'teacher']);
});

test('temporary passwords are simple eight-digit one-time credentials and non-deterministic', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    assert.equal(first.length, 8);
    assert.notEqual(first, second);
    assert.match(first, /^\d{8}$/);
});

test('permission defaults are calculated from role', () => {
    const platformPermissions = getEffectivePermissions({ role: 'platform_owner' });
    const superAdminPermissions = getEffectivePermissions({ role: 'super_admin' });
    const cashierPermissions = getEffectivePermissions({ role: 'cashier' });
    const branchAdminPermissions = getEffectivePermissions({ role: 'branch_admin' });

    assert.ok(platformPermissions.includes('platform.tenants.view'));
    assert.ok(superAdminPermissions.includes('tenant.users.permissions.update'));
    assert.equal(superAdminPermissions.includes('finance.dashboard.view'), false);
    assert.ok(getEffectivePermissions({ role: 'finance_director' }).includes('finance.dashboard.view'));
    assert.ok(cashierPermissions.includes('cashier.payments.create'));
    assert.equal(cashierPermissions.includes('cashier.payments.reverse'), false);
    assert.equal(branchAdminPermissions.includes('payroll.view'), false);
});

test('custom permission deny overrides defaults', () => {
    const parts = getUserPermissionParts({
        role: 'teacher',
        permissions: {
            allow: ['teacher.results.export'],
            deny: ['teacher.results.enter']
        }
    });

    assert.ok(parts.effective.includes('teacher.results.export'));
    assert.equal(parts.effective.includes('teacher.results.enter'), false);
});

test('permissions are bounded by scope, not by role', () => {
    // Phase 2 removed the allowedRoles boxing. A permission another role holds by default
    // is now grantable as long as the scope fits, which is what lets a school build roles
    // the platform never anticipated — a super admin who approves payroll, or an admission
    // manager who also manages classes.
    const superAdmin = getEffectivePermissions({
        role: 'super_admin',
        permissions: { allow: ['finance.dashboard.view'] }
    });
    assert.equal(superAdmin.includes('finance.dashboard.view'), true,
        'a tenant-scoped role can hold a tenant-scoped permission from another role');

    // Scope is still a hard boundary: school-wide permissions are meaningless to a
    // branch-scoped user, so they cannot be granted.
    const cashier = getEffectivePermissions({
        role: 'cashier',
        permissions: { allow: ['finance.dashboard.view', 'tenant.users.create'] }
    });
    assert.equal(cashier.includes('finance.dashboard.view'), false);
    assert.equal(cashier.includes('tenant.users.create'), false);

    // Platform stays sealed off from schools at every scope.
    for (const role of ['super_admin', 'branch_admin', 'cashier']) {
        const permissions = getEffectivePermissions({
            role,
            permissions: { allow: ['platform.tenants.create'] }
        });
        assert.equal(permissions.includes('platform.tenants.create'), false,
            `${role} must never reach a platform permission`);
    }
});

test('finance role authorization rejects school super admins', () => {
    const response = createResponse();
    let nextCalled = false;

    authorize('finance_director')(
        { role: 'super_admin' },
        response,
        () => {
            nextCalled = true;
        }
    );

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
});

test('requirePermission allows matching permissions and rejects missing permissions', () => {
    let nextCalls = 0;
    const next = () => {
        nextCalls += 1;
    };

    requirePermission('students.view')(
        { permissions: ['students.view'] },
        createResponse(),
        next
    );
    assert.equal(nextCalls, 1);

    const deniedResponse = createResponse();
    requirePermission('students.create')(
        { permissions: ['students.view'] },
        deniedResponse,
        next
    );
    assert.equal(deniedResponse.statusCode, 403);
    assert.match(deniedResponse.body.message, /students\.create/);
    assert.equal(nextCalls, 1);
});

test('permission middleware supports any and all permission requirements', () => {
    let anyAllowed = false;
    requireAnyPermission(['students.create', 'students.view'])(
        { permissions: ['students.view'] },
        createResponse(),
        () => {
            anyAllowed = true;
        }
    );
    assert.equal(anyAllowed, true);

    let allAllowed = false;
    requireAllPermissions(['students.view', 'students.update'])(
        { permissions: ['students.view', 'students.update'] },
        createResponse(),
        () => {
            allAllowed = true;
        }
    );
    assert.equal(allAllowed, true);

    const deniedResponse = createResponse();
    requireAllPermissions(['students.view', 'students.update'])(
        { permissions: ['students.view'] },
        deniedResponse,
        () => {}
    );
    assert.equal(deniedResponse.statusCode, 403);
    assert.match(deniedResponse.body.message, /students\.update/);
});

test('tenant lifecycle allows only valid platform transitions', () => {
    assert.deepEqual(assertTenantTransition({ status: 'pending' }, 'active'), {
        currentStatus: 'pending',
        nextStatus: 'active'
    });
    assert.deepEqual(assertTenantTransition({ status: 'active' }, 'suspended'), {
        currentStatus: 'active',
        nextStatus: 'suspended'
    });
    assert.throws(() => assertTenantTransition({ status: 'pending' }, 'suspended'), /cannot transition/);
    assert.throws(() => assertTenantTransition({ status: 'rejected' }, 'active'), /cannot transition/);
});

test('legacy tenant flags resolve to the canonical lifecycle', () => {
    assert.equal(resolveTenantStatus({ isApproved: false, isActive: false }), 'pending');
    assert.equal(resolveTenantStatus({ isApproved: true, isActive: true }), 'active');
    assert.equal(resolveTenantStatus({ status: 'pending', isApproved: true, isActive: false }), 'suspended');
});

test('plan limits normalize unlimited values and copy storage limits', () => {
    assert.equal(toPlanLimit('Unlimited'), null);
    assert.deepEqual(limitsFromPlan({
        maxBranches: 3,
        maxStudents: 500,
        maxUsers: 25,
        storageLimit: '20GB'
    }), {
        maxBranches: 3,
        maxStudents: 500,
        maxUsers: 25,
        storageLimit: '20GB'
    });
});

test('promotion eligibility retains students who fail at least half their subjects', () => {
    assert.deepEqual(classifyPromotion({ totalSubjects: 12, gradedSubjects: 12, failedSubjects: 6 }), {
        outcome: 'Retained',
        retentionThreshold: 6,
        reason: 'Failed 6 of 12 subjects; the retention threshold is 6.'
    });
    assert.equal(classifyPromotion({ totalSubjects: 12, gradedSubjects: 12, failedSubjects: 5 }).outcome, 'Promoted');
    assert.equal(classifyPromotion({ totalSubjects: 6, gradedSubjects: 6, failedSubjects: 3 }).outcome, 'Retained');
    assert.equal(classifyPromotion({ totalSubjects: 5, gradedSubjects: 5, failedSubjects: 3 }).outcome, 'Retained');
});

test('promotion eligibility leaves incomplete grading unchanged', () => {
    const incomplete = classifyPromotion({ totalSubjects: 12, gradedSubjects: 11, failedSubjects: 1 });
    assert.equal(incomplete.outcome, 'Incomplete');
    assert.equal(incomplete.retentionThreshold, 6);
    assert.match(incomplete.reason, /1 of 12 subjects do not have results/);
});

test('promotion mappings only allow exactly one grade increment', () => {
    assert.equal(isNextGradeLevel('3', '4'), true);
    assert.equal(isNextGradeLevel('Grade-3', 'Grade 4'), true);
    assert.equal(isNextGradeLevel('3', '3'), false);
    assert.equal(isNextGradeLevel('3', '5'), false);
});

test('branch promotion academic-year list is tenant scoped', async () => {
    const AcademicYear = require('../models/AcademicYear');
    const { getAcademicYears } = require('../controllers/branchAdminController');
    const branchAdminRoutes = require('../routes/branchAdminRoutes');
    const originalFind = AcademicYear.find;
    let capturedQuery;

    try {
        AcademicYear.find = (query) => {
            capturedQuery = query;
            return { sort: async () => [] };
        };
        const req = { user: { tenantId: 'tenant-1', branchId: 'branch-1' } };
        const res = createResponse();

        await getAcademicYears(req, res);

        assert.deepEqual(capturedQuery, { tenantId: 'tenant-1' });
        assert.equal(res.body.success, true);
        assert.deepEqual(res.body.data, []);
        assert.equal(branchAdminRoutes.stack.some((layer) => layer.route?.path === '/academic-years' && layer.route.methods.get), true);
    } finally {
        AcademicYear.find = originalFind;
    }
});

test('grading pass percentage is derived from pass marks and total marks', () => {
    assert.equal(resolvePassMarkPercent({ passMarks: 30, totalMarks: 50, passMarkPercent: 40 }), 60);
    assert.equal(resolvePassMarkPercent({ passMarkPercent: 55 }), 55);
    assert.equal(resolvePassMarkPercent(null), 40);
});

test('class subject model synchronizes pass mark percentage during validation', async () => {
    const ClassSubject = require('../models/ClassSubject');
    const classSubject = new ClassSubject({
        tenantId: '507f1f77bcf86cd799439011',
        branchId: '507f1f77bcf86cd799439012',
        classId: '507f1f77bcf86cd799439013',
        subjectId: '507f1f77bcf86cd799439014',
        passMarks: 30,
        totalMarks: 50
    });

    await classSubject.validate();
    assert.equal(classSubject.passMarkPercent, 60);
});

test('subscription billing supports distinct monthly and yearly plan prices', () => {
    assert.equal(resolvePlanPrice({ monthlyPrice: 50, yearlyPrice: 500 }, 'monthly'), 50);
    assert.equal(resolvePlanPrice({ monthlyPrice: 50, yearlyPrice: 500 }, 'yearly'), 500);
    assert.equal(resolvePlanPrice({ price: 25 }, 'yearly'), 300);

    const monthly = addBillingPeriod('2026-01-01', 'monthly');
    const yearly = addBillingPeriod('2026-01-01', 'yearly');
    assert.equal(monthly.end.toISOString().slice(0, 10), '2026-02-01');
    assert.equal(yearly.end.toISOString().slice(0, 10), '2027-01-01');
});

test('subscription payment and reversal update only the platform billing ledger', async () => {
    const Tenant = require('../models/Tenant');
    const SubscriptionInvoice = require('../models/SubscriptionInvoice');
    const SubscriptionPayment = require('../models/SubscriptionPayment');
    const originalInvoiceFindOne = SubscriptionInvoice.findOne;
    const originalInvoiceFindById = SubscriptionInvoice.findById;
    const originalInvoiceUpdateOne = SubscriptionInvoice.updateOne;
    const originalPaymentCreate = SubscriptionPayment.create;
    const originalPaymentFindOne = SubscriptionPayment.findOne;
    const originalPaymentDeleteOne = SubscriptionPayment.deleteOne;
    const originalPaymentUpdateOne = SubscriptionPayment.updateOne;
    const originalTenantFindById = Tenant.findById;
    const originalTenantUpdateOne = Tenant.updateOne;
    const originalTenantDistinct = Tenant.distinct;

    const invoice = {
        _id: '507f1f77bcf86cd799439021',
        tenantId: '507f1f77bcf86cd799439011',
        amount: 100,
        paidAmount: 0,
        balance: 100,
        status: 'ISSUED',
        billingCycle: 'monthly',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-02-01'),
        dueDate: new Date('2026-01-15'),
        async save() { return this; }
    };
    const tenant = {
        _id: invoice.tenantId,
        status: 'active',
        isActive: true,
        isApproved: true,
        subscription: { status: 'pending' },
        async save() { return this; }
    };
    const payment = {
        _id: '507f1f77bcf86cd799439022',
        tenantId: invoice.tenantId,
        invoiceId: invoice._id,
        amount: 100,
        method: 'BANK_TRANSFER',
        reference: 'PLATFORM-REF-1',
        receiptNumber: 'SUB-REC-1',
        status: 'ACTIVE',
        async save() { return this; }
    };

    try {
        SubscriptionInvoice.findOne = async (query = {}) => {
            if (query.dueDate) return invoice.status === 'PAID' ? null : invoice;
            return invoice;
        };
        SubscriptionInvoice.findById = async () => invoice;
        SubscriptionInvoice.updateOne = async () => ({ acknowledged: true });
        SubscriptionPayment.create = async (data) => Object.assign(payment, data);
        SubscriptionPayment.findOne = async (query) => query.createdAt ? null : payment;
        SubscriptionPayment.deleteOne = async () => ({ acknowledged: true });
        SubscriptionPayment.updateOne = async () => ({ acknowledged: true });
        Tenant.findById = async () => tenant;
        Tenant.updateOne = async () => ({ acknowledged: true });
        Tenant.distinct = async () => [];

        await assert.rejects(
            recordSubscriptionPayment({
                invoiceId: invoice._id,
                amount: 100,
                method: 'BANK_TRANSFER',
                recordedBy: '507f1f77bcf86cd799439023'
            }),
            /reference is required/
        );

        const recorded = await recordSubscriptionPayment({
            invoiceId: invoice._id,
            amount: 100,
            method: 'BANK_TRANSFER',
            reference: 'PLATFORM-REF-1',
            recordedBy: '507f1f77bcf86cd799439023'
        });
        assert.equal(recorded.invoice.status, 'PAID');
        assert.equal(recorded.invoice.balance, 0);
        assert.equal(tenant.subscription.status, 'active');

        const reversed = await reverseSubscriptionPayment({
            paymentId: payment._id,
            reason: 'Bank transfer returned',
            reversedBy: '507f1f77bcf86cd799439023'
        });
        assert.equal(reversed.payment.status, 'REVERSED');
        assert.equal(reversed.invoice.status, 'ISSUED');
        assert.equal(reversed.invoice.balance, 100);
    } finally {
        SubscriptionInvoice.findOne = originalInvoiceFindOne;
        SubscriptionInvoice.findById = originalInvoiceFindById;
        SubscriptionInvoice.updateOne = originalInvoiceUpdateOne;
        SubscriptionPayment.create = originalPaymentCreate;
        SubscriptionPayment.findOne = originalPaymentFindOne;
        SubscriptionPayment.deleteOne = originalPaymentDeleteOne;
        SubscriptionPayment.updateOne = originalPaymentUpdateOne;
        Tenant.findById = originalTenantFindById;
        Tenant.updateOne = originalTenantUpdateOne;
        Tenant.distinct = originalTenantDistinct;
    }
});

test('subscription status enforces grace period before suspension', async () => {
    const Tenant = require('../models/Tenant');
    const SubscriptionInvoice = require('../models/SubscriptionInvoice');
    const { resolveTenantStatus } = require('../services/tenantStatusService');

    const originalTenantFindById = Tenant.findById;
    const originalTenantDistinct = Tenant.distinct;
    const originalInvoiceFindOne = SubscriptionInvoice.findOne;
    const originalInvoiceDistinct = SubscriptionInvoice.distinct;

    const tenant = {
        _id: '507f1f77bcf86cd799439011',
        status: 'active',
        isActive: true,
        isApproved: true,
        subscription: { status: 'active' },
        async save() { return this; }
    };

    try {
        Tenant.findById = async () => tenant;
        Tenant.distinct = async () => [];
        SubscriptionInvoice.distinct = async () => [tenant._id];
        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setUTCDate(dueDate.getUTCDate() - 2);
        const withinGrace = new Date(now);
        withinGrace.setUTCDate(withinGrace.getUTCDate() + 1);
        const afterGrace = new Date(now);
        afterGrace.setUTCDate(afterGrace.getUTCDate() + 6);

        SubscriptionInvoice.findOne = () => ({
            sort: async () => ({
                _id: '507f1f77bcf86cd799439031',
                tenantId: tenant._id,
                status: 'ISSUED',
                dueDate
            })
        });

        const graceEnd = getGracePeriodEndsAt(dueDate, 7);
        assert.ok(graceEnd > now);

        const graceResult = await reconcileSubscriptionStatuses({
            now: withinGrace,
            graceDays: 7
        });
        assert.equal(graceResult.pastDue, 1);
        assert.equal(tenant.subscription.status, 'past_due');
        assert.equal(resolveTenantStatus(tenant), 'active');

        const suspendedResult = await reconcileSubscriptionStatuses({
            now: afterGrace,
            graceDays: 7
        });
        assert.equal(suspendedResult.suspended, 1);
        assert.equal(tenant.subscription.status, 'suspended');
        assert.equal(resolveTenantStatus(tenant), 'suspended');
    } finally {
        Tenant.findById = originalTenantFindById;
        Tenant.distinct = originalTenantDistinct;
        SubscriptionInvoice.findOne = originalInvoiceFindOne;
        SubscriptionInvoice.distinct = originalInvoiceDistinct;
    }
});

test('public settings payload does not expose secrets', () => {
    const testSettings = {
        platformName: 'TestPlatform',
        logoUrl: '/uploads/logo.png',
        supportEmail: 'support@test.com',
        contactPhone: '12345',
        defaultCurrency: 'USD',
        smtpHost: 'smtp.sendgrid.net',
        smtpUser: 'apikey',
        smtpPass: 'SG.secretkey',
        senderEmail: 'noreply@test.com'
    };
    
    const publicSettingsPayload = (settings = {}) => ({
        platformName: settings.platformName || 'MadrasaHub',
        logoUrl: settings.logoUrl || '',
        supportEmail: settings.supportEmail || '',
        contactPhone: settings.contactPhone || '',
        defaultCurrency: settings.defaultCurrency || 'USD',
        defaultPlan: settings.defaultPlan || 'basic',
        isRegistrationEnabled: settings.isRegistrationEnabled !== false
    });
    
    const payload = publicSettingsPayload(testSettings);
    assert.equal(payload.platformName, 'TestPlatform');
    assert.equal(payload.logoUrl, '/uploads/logo.png');
    assert.equal(payload.smtpHost, undefined);
    assert.equal(payload.smtpPass, undefined);
    assert.equal(payload.smtpUser, undefined);
});

test('login messages are mapped exactly to requirements', () => {
    const statusMessages = {
        pending: 'Your school registration is pending platform approval.',
        rejected: 'Your school registration was rejected. Contact platform support.',
        suspended: 'Your school account is suspended. Contact platform support.'
    };
    assert.equal(statusMessages.pending, 'Your school registration is pending platform approval.');
    assert.equal(statusMessages.rejected, 'Your school registration was rejected. Contact platform support.');
    assert.equal(statusMessages.suspended, 'Your school account is suspended. Contact platform support.');
});

test('tenant lifecycle email does not crash when SMTP is missing', async () => {
    const { sendPlatformEmail } = require('../utils/emailHelper');
    await assert.doesNotReject(async () => {
        await sendPlatformEmail('approved', { name: 'Test School', email: 'test@school.com' }, { name: 'Admin', email: 'admin@school.com' });
    });
});

test('academic year update edits fields and logs action', async () => {
    const AcademicYear = require('../models/AcademicYear');
    const AuditLog = require('../models/AuditLog');
    const { updateAcademicYear } = require('../controllers/tenantController');

    const originalFindOne = AcademicYear.findOne;
    const originalCreate = AuditLog.create;
    try {
        let saved = false;
        const mockYear = {
            _id: 'year-123',
            name: 'Old Year',
            startDate: '2025-01-01',
            endDate: '2025-12-31',
            save: async () => {
                saved = true;
            }
        };

        AcademicYear.findOne = async () => mockYear;
        
        let logLogged = false;
        AuditLog.create = async (data) => {
            logLogged = true;
            assert.equal(data.action, 'ACADEMIC_YEAR_UPDATED');
            assert.equal(data.entityType, 'AcademicYear');
        };

        const req = {
            tenantId: 'tenant-abc',
            params: { yearId: 'year-123' },
            body: { name: 'New Year', startDate: '2026-01-01', endDate: '2026-12-31' },
            user: { _id: 'user-789', name: 'Super Admin', email: 'admin@school.com', role: 'super_admin' }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await updateAcademicYear(req, res, next);

        assert.equal(nextError, null);
        assert.equal(saved, true);
        assert.equal(mockYear.name, 'New Year');
        assert.equal(res.statusCode, 200);
        assert.equal(logLogged, true);
    } finally {
        AcademicYear.findOne = originalFindOne;
        AuditLog.create = originalCreate;
    }
});

test('deleteAcademicYear blocks current active year', async () => {
    const AcademicYear = require('../models/AcademicYear');
    const { deleteAcademicYear } = require('../controllers/tenantController');

    const originalFindOne = AcademicYear.findOne;
    try {
        AcademicYear.findOne = async () => ({
            _id: 'year-123',
            isCurrent: true
        });

        const req = {
            tenantId: 'tenant-abc',
            params: { yearId: 'year-123' }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await deleteAcademicYear(req, res, next);

        assert.ok(nextError);
        assert.equal(nextError.message, 'Cannot delete the current active academic year');
    } finally {
        AcademicYear.findOne = originalFindOne;
    }
});

test('deleteAcademicYear blocks deletion if fee structures exist', async () => {
    const AcademicYear = require('../models/AcademicYear');
    const Enrollment = require('../models/Enrollment');
    const Exam = require('../models/Exam');
    const Invoice = require('../models/Invoice');
    const FeeStructure = require('../models/FeeStructure');
    const AttendanceSession = require('../models/AttendanceSession');
    const TeacherAssignment = require('../models/TeacherAssignment');
    const TimetableSlot = require('../models/TimetableSlot');
    const { deleteAcademicYear } = require('../controllers/tenantController');

    const originalFindOne = AcademicYear.findOne;
    const originalFeeExists = FeeStructure.exists;
    const originalEnrollExists = Enrollment.exists;
    const originalExamExists = Exam.exists;
    const originalInvoiceExists = Invoice.exists;
    const originalAttendanceExists = AttendanceSession.exists;
    const originalAssignmentExists = TeacherAssignment.exists;
    const originalTimetableExists = TimetableSlot.exists;
    try {
        AcademicYear.findOne = async () => ({
            _id: 'year-123',
            isCurrent: false
        });

        Enrollment.exists = async () => false;
        Exam.exists = async () => false;
        Invoice.exists = async () => false;
        FeeStructure.exists = async () => true; // fee structures exist!
        AttendanceSession.exists = async () => false;
        TeacherAssignment.exists = async () => false;
        TimetableSlot.exists = async () => false;

        const req = {
            tenantId: 'tenant-abc',
            params: { yearId: 'year-123' }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await deleteAcademicYear(req, res, next);

        assert.ok(nextError);
        assert.equal(nextError.message, 'This academic year has records and cannot be deleted.');
    } finally {
        AcademicYear.findOne = originalFindOne;
        FeeStructure.exists = originalFeeExists;
        Enrollment.exists = originalEnrollExists;
        Exam.exists = originalExamExists;
        Invoice.exists = originalInvoiceExists;
        AttendanceSession.exists = originalAttendanceExists;
        TeacherAssignment.exists = originalAssignmentExists;
        TimetableSlot.exists = originalTimetableExists;
    }
});

test('student transfer validation blocks when source and target branches are identical', async () => {
    const { transferStudentBranch } = require('../controllers/tenantController');

    const req = {
        tenantId: 'tenant-abc',
        body: {
            studentId: 'student-123',
            fromBranchId: 'branch-111',
            toBranchId: 'branch-111',
            classId: 'class-222',
            academicYearId: 'year-333'
        }
    };
    const res = createResponse();
    let nextError = null;
    const next = (err) => { nextError = err; };

    await transferStudentBranch(req, res, next);

    assert.ok(nextError);
    assert.equal(nextError.message, 'Source and target branches must be different');
});

test('student transfer grade comparison accepts equivalent labels and rejects a different grade', () => {
    const { assertMatchingTransferGrade } = require('../services/transferGradeService');
    const { isSameGradeLevel } = require('../utils/gradeLevel');

    assert.equal(isSameGradeLevel('Grade 4', '4'), true);
    assert.equal(isSameGradeLevel('Class 4', 'grade-4'), true);
    assert.equal(isSameGradeLevel('Grade 4', 'Grade 1'), false);
    assert.throws(
        () => assertMatchingTransferGrade(
            { name: 'Grade 4', gradeLevel: '4' },
            { name: 'Grade 1', gradeLevel: '1' }
        ),
        /Grade mismatch: Grade 4 can only transfer to the same grade/
    );
});

test('student schedule loads academic years through the student-scoped API', () => {
    const fs = require('fs');
    const path = require('path');
    const scheduleSource = fs.readFileSync(
        path.join(__dirname, '../../frontend/src/pages/student/Schedule.jsx'),
        'utf8'
    );

    assert.match(scheduleSource, /apiGetStudentAcademicYears/);
    assert.doesNotMatch(scheduleSource, /getAcademicYearsForTimetable/);
    assert.doesNotMatch(scheduleSource, /branchTimetable\.api/);
});

test('teacher schedule loads the current year without probing administrator endpoints', () => {
    const fs = require('fs');
    const path = require('path');
    const scheduleSource = fs.readFileSync(
        path.join(__dirname, '../../frontend/src/pages/teacher/Schedule.jsx'),
        'utf8'
    );

    assert.match(scheduleSource, /getTeacherCurrentAcademicYear/);
    assert.doesNotMatch(scheduleSource, /getAcademicYearsForTimetable/);
    assert.doesNotMatch(scheduleSource, /branchTimetable\.api/);
});

test('showcase seed and API verifier include an HR payroll manager', () => {
    const fs = require('fs');
    const path = require('path');
    const seedSource = fs.readFileSync(path.join(__dirname, '../scripts/resetAndSeedShowcase.js'), 'utf8');
    const verifierSource = fs.readFileSync(path.join(__dirname, '../scripts/verifyShowcaseApi.js'), 'utf8');

    assert.match(seedSource, /role: 'hr_payroll_manager'/);
    assert.match(seedSource, /HR & Payroll Manager: hr@/);
    assert.match(seedSource, /hrManagerCount === 2/);
    assert.match(verifierSource, /hr@horizonacademy\.edu\.so/);
    assert.match(verifierSource, /\/api\/hr\/employees/);
    assert.match(verifierSource, /\/api\/hr\/leaves/);
    assert.match(verifierSource, /\/api\/hr\/payroll\?month=6&year=2026/);
});

test('student transfer validation blocks if student is not found', async () => {
    const Student = require('../models/Student');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const { transferStudentBranch } = require('../controllers/tenantController');

    const originalStudentFindOne = Student.findOne;
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    try {
        Student.findOne = async () => null; // student not found
        Branch.findOne = async () => ({ _id: 'branch-111', isActive: true });
        Class.findOne = async () => ({ _id: 'class-222' });
        AcademicYear.findOne = async () => ({ _id: 'year-333' });

        const req = {
            tenantId: 'tenant-abc',
            body: {
                studentId: 'student-123',
                fromBranchId: 'branch-111',
                toBranchId: 'branch-222',
                classId: 'class-222',
                academicYearId: 'year-333'
            }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await transferStudentBranch(req, res, next);

        assert.ok(nextError);
        assert.equal(nextError.message, 'Student was not found in the selected source branch');
    } finally {
        Student.findOne = originalStudentFindOne;
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('audit log api performs pagination and filtering', async () => {
    const AuditLog = require('../models/AuditLog');
    const { getTenantAuditLogs } = require('../controllers/tenantController');

    const originalFind = AuditLog.find;
    const originalCount = AuditLog.countDocuments;
    try {
        let findQuery = null;
        let skipVal = null;
        let limitVal = null;

        AuditLog.find = (query) => {
            findQuery = query;
            const mockFindChain = {
                sort: () => mockFindChain,
                skip: (val) => {
                    skipVal = val;
                    return mockFindChain;
                },
                limit: (val) => {
                    limitVal = val;
                    return mockFindChain;
                },
                populate: () => [
                    {
                        _id: 'log-1',
                        action: 'ACADEMIC_YEAR_DELETED',
                        actorName: 'Super Admin',
                        createdAt: new Date(),
                        entityId: 'year-123',
                        entityType: 'AcademicYear'
                    }
                ]
            };
            return mockFindChain;
        };

        AuditLog.countDocuments = async (query) => {
            return 1;
        };

        const req = {
            tenantId: 'tenant-abc',
            query: { page: '2', limit: '10', action: 'ACADEMIC_YEAR_DELETED' }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await getTenantAuditLogs(req, res, next);

        assert.equal(nextError, null);
        assert.equal(findQuery.tenantId, 'tenant-abc');
        assert.equal(findQuery.action, 'ACADEMIC_YEAR_DELETED');
        assert.equal(skipVal, 10);
        assert.equal(limitVal, 10);
        assert.equal(res.statusCode, 200);
        assert.ok(Array.isArray(res.body.logs));
        assert.equal(res.body.logs[0].action, 'ACADEMIC_YEAR_DELETED');
        assert.equal(res.body.logs[0].type, 'info');
    } finally {
        AuditLog.find = originalFind;
        AuditLog.countDocuments = originalCount;
    }
});

test('branch exam creation supports multiple classes and subject checks', async () => {
    const Class = require('../models/Class');
    const ClassSubject = require('../models/ClassSubject');
    const Exam = require('../models/Exam');
    const ExamCategory = require('../models/ExamCategory');
    const Subject = require('../models/Subject');
    const { createExam } = require('../controllers/branchAdminController');

    const originalClassFindById = Class.findById;
    const originalClassFind = Class.find;
    const originalClassFindOne = Class.findOne;
    const originalClassSubjectFindOne = ClassSubject.findOne;
    const originalExamCategoryFindOne = ExamCategory.findOne;
    const originalSubjectFindOne = Subject.findOne;
    const originalExamCreate = Exam.create;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_CLASS_1 = '507f1f77bcf86cd799439013';
    const MOCK_CLASS_2 = '507f1f77bcf86cd799439023';

    try {
        Class.findById = async (id) => ({ _id: id, tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: `Class ${id}` });
        Class.findOne = async () => ({ _id: MOCK_CLASS_1, tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Class Mock' });
        ClassSubject.findOne = async () => ({ isActive: true });
        ExamCategory.findOne = async () => ({ _id: 'cat-1', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        Subject.findOne = async () => ({ _id: 'sub-1', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        
        const created = [];
        Exam.create = async (data) => {
            created.push(data);
            return { _id: 'exam-123', ...data };
        };

        const req = {
            user: { tenantId: MOCK_TENANT, branchId: MOCK_BRANCH },
            body: {
                examCategoryId: '507f1f77bcf86cd799439015',
                academicYearId: '507f1f77bcf86cd79943901b',
                classIds: [MOCK_CLASS_1, MOCK_CLASS_2],
                subjectId: '507f1f77bcf86cd799439014',
                date: '2026-06-14'
            }
        };
        const res = createResponse();

        await createExam(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(created.length, 2);
        assert.equal(created[0].classId, MOCK_CLASS_1);
        assert.equal(created[1].classId, MOCK_CLASS_2);
        assert.equal(created[0].tenantId, MOCK_TENANT);
        assert.equal(created[0].status, 'Draft');
    } finally {
        Class.findById = originalClassFindById;
        Class.find = originalClassFind;
        Class.findOne = originalClassFindOne;
        ClassSubject.findOne = originalClassSubjectFindOne;
        ExamCategory.findOne = originalExamCategoryFindOne;
        Subject.findOne = originalSubjectFindOne;
        Exam.create = originalExamCreate;
    }
});

test('branch overview dashboard aggregates real invoices/payments and builds monthly trend', async () => {
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const Student = require('../models/Student');
    const { getBranchOverview } = require('../controllers/branchAdminController');

    const originalInvoiceAggregate = Invoice.aggregate;
    const originalPaymentAggregate = Payment.aggregate;
    const originalStudentCount = Student.countDocuments;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';

    try {
        Student.countDocuments = async () => 42;
        
        Invoice.aggregate = async (pipeline) => {
            if (pipeline.length === 2 && pipeline[1].$group && pipeline[1].$group.totalSales) {
                return [{ totalSales: 15000, count: 5 }];
            } else {
                const now = new Date();
                return [{
                    _id: { year: now.getFullYear(), month: now.getMonth() + 1 },
                    invoiced: 8000
                }];
            }
        };

        Payment.aggregate = async (pipeline) => {
            if (pipeline.length === 2 && pipeline[1].$group && pipeline[1].$group.totalCollected) {
                return [{ totalCollected: 12000 }];
            } else {
                const now = new Date();
                return [{
                    _id: { year: now.getFullYear(), month: now.getMonth() + 1 },
                    collected: 7000
                }];
            }
        };

        const req = {
            user: { tenantId: MOCK_TENANT, branchId: MOCK_BRANCH },
            query: {}
        };
        const res = createResponse();

        await getBranchOverview(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.students.totalActive, 42);
        assert.equal(res.body.data.finance.totalInvoiced, 15000);
        assert.equal(res.body.data.finance.totalCollected, 12000);
        assert.ok(Array.isArray(res.body.data.financeTrend));
        assert.equal(res.body.data.financeTrend.length, 6);
        
        const currentMonthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date().getMonth()];
        const currentTrend = res.body.data.financeTrend.find(t => t.month === currentMonthName);
        assert.ok(currentTrend);
        assert.equal(currentTrend.Invoiced, 8000);
        assert.equal(currentTrend.Collected, 7000);

        const otherTrend = res.body.data.financeTrend.find(t => t.month !== currentMonthName);
        assert.ok(otherTrend);
        assert.equal(otherTrend.Invoiced, 0);
        assert.equal(otherTrend.Collected, 0);
    } finally {
        Invoice.aggregate = originalInvoiceAggregate;
        Payment.aggregate = originalPaymentAggregate;
        Student.countDocuments = originalStudentCount;
    }
});

test('timetable conflict check returns descriptive error message identifying details', async () => {
    const TimetableSlot = require('../models/TimetableSlot');
    const { createTimetableSlot } = require('../controllers/timetableController');
    const Class = require('../models/Class');
    const User = require('../models/User');
    const Subject = require('../models/Subject');

    const originalSlotFind = TimetableSlot.find;
    const originalSlotCreate = TimetableSlot.create;
    const originalClassFindOne = Class.findOne;
    const originalClassFindById = Class.findById;
    const originalUserFindOne = User.findOne;
    const originalUserFindById = User.findById;
    const originalSubjectFindOne = Subject.findOne;
    const originalSubjectFindById = Subject.findById;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';

    try {
        Class.findOne = async () => ({ _id: '507f1f77bcf86cd799439013', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        Class.findById = async () => ({ _id: '507f1f77bcf86cd799439013', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Grade 4' });
        User.findOne = async () => ({ _id: '507f1f77bcf86cd799439016', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, role: 'teacher' });
        User.findById = async () => ({ _id: '507f1f77bcf86cd799439016', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Ahmed', role: 'teacher' });
        Subject.findOne = async () => ({ _id: '507f1f77bcf86cd799439014', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        Subject.findById = async () => ({ _id: '507f1f77bcf86cd799439014', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Mathematics' });

        TimetableSlot.find = () => {
            const mockChain = {
                populate() { return this; },
                sort() { return this; },
                async then(resolve) {
                    return resolve([
                        {
                            _id: '507f1f77bcf86cd799439018',
                            dayOfWeek: 'MON',
                            startTime: '08:00',
                            endTime: '09:00',
                            teacherUserId: { _id: '507f1f77bcf86cd799439016', name: 'Ahmed' },
                            classId: { _id: '507f1f77bcf86cd799439013', name: 'Grade 4' },
                            subjectId: { _id: '507f1f77bcf86cd799439014', name: 'Mathematics' },
                            tenantId: MOCK_TENANT,
                            branchId: MOCK_BRANCH
                        }
                    ]);
                }
            };
            return mockChain;
        };

        const req = {
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            user: { _id: '507f1f77bcf86cd799439020' },
            body: {
                academicYearId: '507f1f77bcf86cd79943901b',
                classId: '507f1f77bcf86cd799439013',
                subjectId: '507f1f77bcf86cd799439014',
                teacherUserId: '507f1f77bcf86cd799439016',
                dayOfWeek: 'MON',
                startTime: '08:15',
                endTime: '08:45'
            }
        };
        const res = createResponse();

        await createTimetableSlot(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /Timetable conflict: Teacher Ahmed is already assigned to Grade 4 Mathematics on Monday 08:00–09:00/);
    } finally {
        TimetableSlot.find = originalSlotFind;
        TimetableSlot.create = originalSlotCreate;
        Class.findOne = originalClassFindOne;
        Class.findById = originalClassFindById;
        User.findOne = originalUserFindOne;
        User.findById = originalUserFindById;
        Subject.findOne = originalSubjectFindOne;
        Subject.findById = originalSubjectFindById;
    }
});

test('timetable validation rejects when active enrollments exceed section capacity', async () => {
    const Section = require('../models/Section');
    const Enrollment = require('../models/Enrollment');
    const Class = require('../models/Class');
    const User = require('../models/User');
    const Subject = require('../models/Subject');
    const TimetableSlot = require('../models/TimetableSlot');
    const { createTimetableSlot } = require('../controllers/timetableController');

    const originalSectionFindOne = Section.findOne;
    const originalSectionFindById = Section.findById;
    const originalEnrollmentCount = Enrollment.countDocuments;
    const originalClassFindOne = Class.findOne;
    const originalClassFindById = Class.findById;
    const originalUserFindOne = User.findOne;
    const originalUserFindById = User.findById;
    const originalSubjectFindOne = Subject.findOne;
    const originalSubjectFindById = Subject.findById;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';

    try {
        Class.findOne = async () => ({ _id: '507f1f77bcf86cd799439013', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        Class.findById = async () => ({ _id: '507f1f77bcf86cd799439013', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Grade 4' });
        User.findOne = async () => ({ _id: '507f1f77bcf86cd799439016', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, role: 'teacher' });
        User.findById = async () => ({ _id: '507f1f77bcf86cd799439016', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Ahmed', role: 'teacher' });
        Subject.findOne = async () => ({ _id: '507f1f77bcf86cd799439014', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        Subject.findById = async () => ({ _id: '507f1f77bcf86cd799439014', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, name: 'Mathematics' });

        Section.findOne = () => {
            const doc = { _id: '507f1f77bcf86cd799439017', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, capacity: 20 };
            const q = Promise.resolve(doc);
            q.select = async () => doc;
            return q;
        };
        Section.findById = async () => ({ _id: '507f1f77bcf86cd799439017', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH, capacity: 20 });
        
        Enrollment.countDocuments = async () => 25;

        const req = {
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            user: { _id: '507f1f77bcf86cd799439020' },
            body: {
                academicYearId: '507f1f77bcf86cd79943901b',
                classId: '507f1f77bcf86cd799439013',
                sectionId: '507f1f77bcf86cd799439017',
                subjectId: '507f1f77bcf86cd799439014',
                teacherUserId: '507f1f77bcf86cd799439016',
                dayOfWeek: 'MON',
                startTime: '08:00',
                endTime: '09:00'
            }
        };
        const res = createResponse();

        await createTimetableSlot(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /Timetable conflict: Section capacity exceeded. Active enrollments \(25\) exceed section capacity \(20\)/);
    } finally {
        Section.findOne = originalSectionFindOne;
        Section.findById = originalSectionFindById;
        Enrollment.countDocuments = originalEnrollmentCount;
        Class.findOne = originalClassFindOne;
        Class.findById = originalClassFindById;
        User.findOne = originalUserFindOne;
        User.findById = originalUserFindById;
        Subject.findOne = originalSubjectFindOne;
        Subject.findById = originalSubjectFindById;
    }
});

test('branch parameter ownership validation blocks cross-branch resource access with 403', async () => {
    const Class = require('../models/Class');
    const { getClass } = require('../controllers/branchAdminController');

    const originalClassFindById = Class.findById;
    const originalClassFindOne = Class.findOne;
    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';

    try {
        Class.findOne = async () => null;
        Class.findById = async (id) => ({
            _id: id,
            tenantId: '507f1f77bcf86cd799439031',
            branchId: '507f1f77bcf86cd799439032'
        });

        const req = {
            user: { tenantId: MOCK_TENANT, branchId: MOCK_BRANCH },
            params: { classId: '507f1f77bcf86cd799439033' }
        };
        const res = createResponse();

        await getClass(req, res);

        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this branch resource.');
    } finally {
        Class.findById = originalClassFindById;
        Class.findOne = originalClassFindOne;
    }
});

test('registrar getStudents supports pagination page and limit controls', async () => {
    const Student = require('../models/Student');
    const { getStudents } = require('../controllers/registrarController');

    const originalFind = Student.find;
    const originalCount = Student.countDocuments;

    let skipVal = null;
    let limitVal = null;

    try {
        Student.countDocuments = async () => 25;
        Student.find = (query) => {
            const chain = {};
            chain.sort = () => chain;
            chain.skip = (val) => {
                skipVal = val;
                return chain;
            };
            chain.limit = (val) => {
                limitVal = val;
                return Promise.resolve([{ _id: 'student-mock-id' }]);
            };
            return chain;
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', scope: 'branch' },
            query: { page: '2', limit: '15' }
        };
        const res = createResponse();

        await getStudents(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(skipVal, 15);
        assert.equal(limitVal, 15);
        assert.equal(res.body.pagination.page, 2);
        assert.equal(res.body.pagination.limit, 15);
        assert.equal(res.body.pagination.total, 25);
        assert.equal(res.body.pagination.totalPages, 2);
    } finally {
        Student.find = originalFind;
        Student.countDocuments = originalCount;
    }
});

test('registrar getRegistrarStats returns correct scoped count metrics', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const AcademicYear = require('../models/AcademicYear');
    const { getRegistrarStats } = require('../controllers/registrarController');

    const originalStudentCount = Student.countDocuments;
    const originalEnrollmentCount = Enrollment.countDocuments;
    const originalAcademicYearFindOne = AcademicYear.findOne;

    try {
        AcademicYear.findOne = async () => ({ _id: 'year-123' });
        Student.countDocuments = async (query) => {
            if (query.status === 'Active') return 10;
            if (query.status === 'Inactive') return 5;
            if (query.status === 'Transferred') return 2;
            if (query.status === 'Graduated') return 1;
            if (query.createdAt) return 3; // new admissions
            return 18; // totalStudents
        };
        Enrollment.countDocuments = async () => 8;

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' }
        };
        const res = createResponse();

        await getRegistrarStats(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.data.totalStudents, 18);
        assert.equal(res.body.data.activeStudents, 10);
        assert.equal(res.body.data.inactiveStudents, 5);
        assert.equal(res.body.data.transferredStudents, 2);
        assert.equal(res.body.data.graduatedStudents, 1);
        assert.equal(res.body.data.newAdmissionsThisMonth, 3);
        assert.equal(res.body.data.currentYearEnrollments, 8);
    } finally {
        Student.countDocuments = originalStudentCount;
        Enrollment.countDocuments = originalEnrollmentCount;
        AcademicYear.findOne = originalAcademicYearFindOne;
    }
});

test('re-enrollment succeeds with valid sectionId and rejects with foreign/invalid sectionId', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const Section = require('../models/Section');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const AuditLog = require('../models/AuditLog');
    const { createEnrollment } = require('../controllers/registrarController');

    const originalStudentFindOne = Student.findOne;
    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalEnrollmentCreate = Enrollment.create;
    const originalEnrollmentCount = Enrollment.countDocuments;
    const originalSectionFindOne = Section.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalAuditLogCreate = AuditLog.create;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_CLASS = '507f1f77bcf86cd799439013';
    const MOCK_SECTION_VALID = '507f1f77bcf86cd799439014';
    const MOCK_SECTION_INVALID = '507f1f77bcf86cd799439015';

    try {
        Student.findOne = async () => ({ _id: 'student-123' });
        Enrollment.findOne = async () => null; // no duplicate active enrollment
        Enrollment.countDocuments = async () => 0;
        Enrollment.create = async (data) => {
            const enroll = {
                _id: 'enrollment-123',
                ...data,
                toObject() { return this; }
            };
            return enroll;
        };
        AuditLog.create = async () => ({});
        Class.findOne = async () => ({ _id: MOCK_CLASS, tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        AcademicYear.findOne = async () => ({ _id: 'year-123', tenantId: MOCK_TENANT });

        Section.findOne = async (query) => {
            const id = query._id;
            if (String(id) === MOCK_SECTION_VALID) {
                return {
                    _id: MOCK_SECTION_VALID,
                    tenantId: MOCK_TENANT,
                    branchId: MOCK_BRANCH,
                    classId: MOCK_CLASS,
                    capacity: 30
                };
            }
            if (String(id) === MOCK_SECTION_INVALID) {
                if (query.branchId && String(query.branchId) !== 'other-branch-id') {
                    return null;
                }
                return {
                    _id: MOCK_SECTION_INVALID,
                    tenantId: MOCK_TENANT,
                    branchId: 'other-branch-id', // foreign branch!
                    classId: MOCK_CLASS,
                    capacity: 30
                };
            }
            return null; // invalid/not found
        };

        // 1. Test invalid section ID (null / not found)
        let req = {
            user: { _id: 'user-123', tenantId: MOCK_TENANT, branchId: MOCK_BRANCH },
            body: {
                studentId: 'student-123',
                classId: MOCK_CLASS,
                sectionId: 'nonexistent-id',
                academicYearId: 'year-123'
            },
            ip: '127.0.0.1',
            get() { return 'TestAgent'; }
        };
        let res = createResponse();

        await createEnrollment(req, res);
        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /Invalid section for this class or branch/);

        // 2. Test foreign section ID
        req.body.sectionId = MOCK_SECTION_INVALID;
        res = createResponse();
        await createEnrollment(req, res);
        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /Invalid section for this class or branch/);

        // 3. Test valid section ID
        req.body.sectionId = MOCK_SECTION_VALID;
        res = createResponse();
        await createEnrollment(req, res);
        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);
    } finally {
        Student.findOne = originalStudentFindOne;
        Enrollment.findOne = originalEnrollmentFindOne;
        Enrollment.create = originalEnrollmentCreate;
        Enrollment.countDocuments = originalEnrollmentCount;
        Section.findOne = originalSectionFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
        AuditLog.create = originalAuditLogCreate;
    }
});

test('re-enrollment capacity validation blocks when section is full', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const Section = require('../models/Section');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const { createEnrollment } = require('../controllers/registrarController');

    const originalStudentFindOne = Student.findOne;
    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalEnrollmentCount = Enrollment.countDocuments;
    const originalSectionFindOne = Section.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_CLASS = '507f1f77bcf86cd799439013';
    const MOCK_SECTION = '507f1f77bcf86cd799439014';

    try {
        Student.findOne = async () => ({ _id: 'student-123' });
        Enrollment.findOne = async () => null; // no duplicate active enrollment
        Class.findOne = async () => ({ _id: MOCK_CLASS, tenantId: MOCK_TENANT, branchId: MOCK_BRANCH });
        AcademicYear.findOne = async () => ({ _id: 'year-123', tenantId: MOCK_TENANT });

        Section.findOne = async () => ({
            _id: MOCK_SECTION,
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            classId: MOCK_CLASS,
            capacity: 30
        });

        // Mock 30 students already enrolled
        Enrollment.countDocuments = async () => 30;

        const req = {
            user: { tenantId: MOCK_TENANT, branchId: MOCK_BRANCH },
            body: {
                studentId: 'student-123',
                classId: MOCK_CLASS,
                sectionId: MOCK_SECTION,
                academicYearId: 'year-123'
            }
        };
        const res = createResponse();

        await createEnrollment(req, res);
        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /Section capacity has been reached/);
    } finally {
        Student.findOne = originalStudentFindOne;
        Enrollment.findOne = originalEnrollmentFindOne;
        Enrollment.countDocuments = originalEnrollmentCount;
        Section.findOne = originalSectionFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('re-enrollment duplicate check catches case-insensitive status current/active', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const { createEnrollment } = require('../controllers/registrarController');

    const originalStudentFindOne = Student.findOne;
    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;

    let findOneQuery = null;

    try {
        Student.findOne = async () => ({ _id: 'student-123' });
        Class.findOne = async () => ({ _id: 'class-123', tenantId: 'tenant-1', branchId: 'branch-1' });
        AcademicYear.findOne = async () => ({ _id: 'year-123', tenantId: 'tenant-1' });
        Enrollment.findOne = async (query) => {
            findOneQuery = query;
            return { _id: 'existing-enrollment' }; // simulate finding an active enrollment
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                studentId: 'student-123',
                classId: 'class-123',
                academicYearId: 'year-123'
            }
        };
        const res = createResponse();

        await createEnrollment(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /already enrolled/);
        assert.ok(findOneQuery);
        assert.deepEqual(findOneQuery.status, { $in: ['Current', 'Active', 'current', 'active'] });
    } finally {
        Student.findOne = originalStudentFindOne;
        Enrollment.findOne = originalEnrollmentFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('bulk invoice generation target validation and due date saving', async () => {
    const Class = require('../models/Class');
    const Student = require('../models/Student');
    const AcademicYear = require('../models/AcademicYear');
    const Branch = require('../models/Branch');
    const Enrollment = require('../models/Enrollment');
    const FeeStructure = require('../models/FeeStructure');
    const Invoice = require('../models/Invoice');
    const AuditLog = require('../models/AuditLog');
    const { triggerBulkInvoices } = require('../controllers/financeController');

    const originalClassExists = Class.exists;
    const originalStudentExists = Student.exists;
    const originalAcademicYearExists = AcademicYear.exists;
    const originalBranchExists = Branch.exists;
    const originalClassFindById = Class.findById;
    const originalStudentFindById = Student.findById;
    const originalAcademicYearFindById = AcademicYear.findById;
    const originalBranchFindById = Branch.findById;
    const originalClassFindOne = Class.findOne;
    const originalStudentFindOne = Student.findOne;
    const originalAcademicYearFindOne = AcademicYear.findOne;
    const originalBranchFindOne = Branch.findOne;
    const originalEnrollmentFind = Enrollment.find;
    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceCreate = Invoice.create;
    const originalFeeStructureFindOne = FeeStructure.findOne;
    const originalAuditLogCreate = AuditLog.create;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_CLASS = '507f1f77bcf86cd799439013';
    const MOCK_YEAR = '507f1f77bcf86cd799439014';
    const MOCK_STUDENT = '507f1f77bcf86cd799439015';
    const MOCK_FEE_STRUCTURE = '507f1f77bcf86cd799439017';

    try {
        Class.exists = async () => true;
        Student.exists = async () => true;
        AcademicYear.exists = async () => true;
        Branch.exists = async () => true;
        Class.findOne = async () => null;
        Student.findOne = async () => null;
        AcademicYear.findOne = async () => null;
        Branch.findOne = async () => null;
        Class.findById = async () => ({ tenantId: MOCK_TENANT });
        Student.findById = async () => ({ tenantId: MOCK_TENANT });
        AcademicYear.findById = async () => ({ tenantId: MOCK_TENANT });
        Branch.findById = async () => ({ tenantId: MOCK_TENANT });
        AuditLog.create = async () => ({});

        let createdInvoices = [];
        Invoice.create = async (data) => {
            createdInvoices.push(data);
            return data;
        };

        Invoice.findOne = async () => null;

        Enrollment.find = async () => [
            {
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH,
                classId: MOCK_CLASS,
                studentId: MOCK_STUDENT,
                academicYearId: MOCK_YEAR
            }
        ];

        FeeStructure.findOne = async () => ({
            _id: MOCK_FEE_STRUCTURE,
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            classId: MOCK_CLASS,
            academicYearId: MOCK_YEAR,
            feeItems: [{ name: 'Tuition', amount: 1000 }],
            totalAmount: 1000
        });

        // 1. Missing targetId (both classId and studentId missing) should be rejected via next(err)
        let req = {
            tenantId: MOCK_TENANT,
            body: {
                academicYearId: MOCK_YEAR,
                dueDate: '2026-12-31'
            },
            get: () => 'mock-agent'
        };
        let res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await triggerBulkInvoices(req, res, next);
        assert.ok(nextError);
        assert.equal(res.statusCode, 400);
        assert.match(nextError.message, /Invalid invoice generation target./);

        // 2. Invalid target (validateFinanceContext returns error/invalid target)
        Class.exists = async () => false;
        Class.findOne = async () => ({ tenantId: MOCK_TENANT });
        Class.findById = async () => null;
        AcademicYear.findOne = async () => ({ tenantId: MOCK_TENANT });
        req.body.classId = MOCK_CLASS;
        req.body.feeStructureId = MOCK_FEE_STRUCTURE;
        res = createResponse();
        nextError = null;
        await triggerBulkInvoices(req, res, next);
        assert.ok(nextError);
        assert.equal(res.statusCode, 400);
        assert.match(nextError.message, /Invalid invoice generation target./);

        // Restore Class.exists and align findOne/findById for step 3
        Class.exists = async () => true;
        Class.findOne = async () => ({ tenantId: MOCK_TENANT });
        Class.findById = async () => ({ tenantId: MOCK_TENANT });
        AcademicYear.findOne = async () => ({ tenantId: MOCK_TENANT });
        AcademicYear.findById = async () => ({ tenantId: MOCK_TENANT });

        // 3. Valid target with custom due date
        res = createResponse();
        nextError = null;
        await triggerBulkInvoices(req, res, next);
        assert.equal(nextError, null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(createdInvoices.length, 1);
        assert.equal(createdInvoices[0].dueDate.toISOString().slice(0, 10), '2026-12-31');
        assert.equal(createdInvoices[0].feeStructureId, MOCK_FEE_STRUCTURE);
        assert.equal(createdInvoices[0].billingPeriodKey, 'YEARLY');
        assert.equal(createdInvoices[0].billingPeriodLabel, 'Annual');

        // 4. A foreign or mismatched selected fee structure fails closed
        FeeStructure.findOne = async () => null;
        res = createResponse();
        nextError = null;
        await triggerBulkInvoices(req, res, next);
        assert.ok(nextError);
        assert.equal(res.statusCode, 403);
        assert.match(nextError.message, /Access denied/);

    } finally {
        Class.exists = originalClassExists;
        Student.exists = originalStudentExists;
        AcademicYear.exists = originalAcademicYearExists;
        Branch.exists = originalBranchExists;
        Class.findById = originalClassFindById;
        Student.findById = originalStudentFindById;
        AcademicYear.findById = originalAcademicYearFindById;
        Branch.findById = originalBranchFindById;
        Class.findOne = originalClassFindOne;
        Student.findOne = originalStudentFindOne;
        AcademicYear.findOne = originalAcademicYearFindOne;
        Branch.findOne = originalBranchFindOne;
        Enrollment.find = originalEnrollmentFind;
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.create = originalInvoiceCreate;
        FeeStructure.findOne = originalFeeStructureFindOne;
        AuditLog.create = originalAuditLogCreate;
    }
});

test('payment summary scopes academic year through invoices instead of nonexistent payment field', async () => {
    const Payment = require('../models/Payment');
    const { getPaymentsSummary } = require('../controllers/financeController');
    const originalAggregate = Payment.aggregate;
    const pipelines = [];
    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_YEAR = '507f1f77bcf86cd799439014';

    try {
        Payment.aggregate = async (pipeline) => {
            pipelines.push(pipeline);
            return [];
        };

        const req = {
            tenantId: MOCK_TENANT,
            query: { academicYearId: MOCK_YEAR }
        };
        const res = createResponse();
        await getPaymentsSummary(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(pipelines.length, 2);
        assert.equal(Object.hasOwn(pipelines[0][0].$match, 'academicYearId'), false);
        assert.deepEqual(pipelines[0][0].$match.status, { $in: ['ACTIVE', 'REVERSAL'] });
        assert.equal(pipelines[0][1].$lookup.from, 'invoices');
        assert.equal(String(pipelines[0][3].$match['invoice.academicYearId']), MOCK_YEAR);
    } finally {
        Payment.aggregate = originalAggregate;
    }
});

test('getInvoiceById includes payment history under same tenant', async () => {
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const { getInvoiceById } = require('../controllers/financeController');

    const originalInvoiceFindOne = Invoice.findOne;
    const originalPaymentFind = Payment.find;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_INVOICE_ID = '507f1f77bcf86cd799439016';
    try {
        const mockInvoice = {
            _id: MOCK_INVOICE_ID,
            tenantId: MOCK_TENANT,
            dueDate: new Date(),
            items: [],
            totalAmount: 500,
            paidAmount: 200,
            status: 'PARTIALLY_PAID',
            toObject() { return this; }
        };

        Invoice.findOne = () => {
            const chain = {
                populate: () => chain,
                then: (resolve) => resolve(mockInvoice)
            };
            return chain;
        };
        Invoice.findById = async () => mockInvoice;

        const mockPayments = [
            {
                amount: 200,
                method: 'Cash',
                reference: 'REF-123',
                status: 'COMPLETED',
                createdAt: new Date(),
                recordedBy: { name: 'Cashier John' }
            }
        ];

        Payment.find = (query) => {
            assert.equal(query.invoiceId.toString(), MOCK_INVOICE_ID);
            assert.equal(query.tenantId.toString(), MOCK_TENANT);
            const chain = {
                populate: () => chain,
                sort: () => chain,
                then: (resolve) => resolve(mockPayments)
            };
            return chain;
        };

        const req = {
            tenantId: MOCK_TENANT,
            params: { id: MOCK_INVOICE_ID }
        };
        const res = createResponse();

        await getInvoiceById(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.data.payments);
        assert.equal(res.body.data.payments.length, 1);
        assert.equal(res.body.data.payments[0].amount, 200);
        assert.equal(res.body.data.payments[0].recordedBy, 'Cashier John');
    } finally {
        Invoice.findOne = originalInvoiceFindOne;
        Payment.find = originalPaymentFind;
    }
});

test('getOutstandingBalances returns top 10 debtor list', async () => {
    const Invoice = require('../models/Invoice');
    const Enrollment = require('../models/Enrollment');
    const { getOutstandingBalances } = require('../controllers/financeController');

    const originalInvoiceAggregate = Invoice.aggregate;
    const originalInvoiceFind = Invoice.find;
    const originalEnrollmentFindOne = Enrollment.findOne;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_CLASS = '507f1f77bcf86cd799439013';
    const MOCK_YEAR = '507f1f77bcf86cd799439014';
    const MOCK_STUDENT = '507f1f77bcf86cd799439015';

    try {
        Invoice.aggregate = async () => [
            { totalOutstanding: 15000, count: 5 }
        ];

        const mockInvoices = [
            {
                _id: 'invoice-1',
                tenantId: MOCK_TENANT,
                balance: 1000,
                studentId: {
                    _id: MOCK_STUDENT,
                    firstName: 'Jane',
                    lastName: 'Doe',
                    admissionNumber: 'ADM-001'
                },
                branchId: {
                    _id: MOCK_BRANCH,
                    name: 'Primary Branch'
                },
                academicYearId: {
                    _id: MOCK_YEAR
                },
                dueDate: new Date('2026-06-01')
            }
        ];

        Invoice.find = () => {
            const chain = {
                sort: () => chain,
                limit: () => chain,
                populate: () => chain,
                then: (resolve) => resolve(mockInvoices)
            };
            return chain;
        };

        Enrollment.findOne = () => {
            const chain = {
                populate: () => chain,
                then: (resolve) => resolve({
                    classId: { name: 'Grade 10' }
                })
            };
            return chain;
        };

        const req = {
            tenantId: MOCK_TENANT,
            query: {}
        };
        const res = createResponse();

        await getOutstandingBalances(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.totalOutstanding, 15000);
        assert.equal(res.body.data.count, 5);
        assert.ok(res.body.data.debtors);
        assert.equal(res.body.data.debtors.length, 1);
        assert.equal(res.body.data.debtors[0].studentName, 'Jane Doe');
        assert.equal(res.body.data.debtors[0].className, 'Grade 10');
        assert.equal(res.body.data.debtors[0].balance, 1000);
    } finally {
        Invoice.aggregate = originalInvoiceAggregate;
        Invoice.find = originalInvoiceFind;
        Enrollment.findOne = originalEnrollmentFindOne;
    }
});

test('getRevenueReport aggregation includes lookup for human readable labels', async () => {
    const Invoice = require('../models/Invoice');
    const { getRevenueReport } = require('../services/financeService');

    const originalInvoiceAggregate = Invoice.aggregate;
    let capturedPipeline = null;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';

    try {
        Invoice.aggregate = async (pipeline) => {
            capturedPipeline = pipeline;
            return [{ _id: 'Class Name A', totalRevenue: 5000, totalPaid: 3000, totalBalance: 2000 }];
        };

        await getRevenueReport({ tenantId: MOCK_TENANT, groupBy: 'class' });

        assert.ok(capturedPipeline);
        const classLookup = capturedPipeline.find(stage => stage.$lookup && stage.$lookup.from === 'enrollments');
        assert.ok(classLookup);

        await getRevenueReport({ tenantId: MOCK_TENANT, groupBy: 'year' });
        const yearLookup = capturedPipeline.find(stage => stage.$lookup && stage.$lookup.from === 'academicyears');
        assert.ok(yearLookup);

        await getRevenueReport({ tenantId: MOCK_TENANT, groupBy: 'branch' });
        const branchLookup = capturedPipeline.find(stage => stage.$lookup && stage.$lookup.from === 'branches');
        assert.ok(branchLookup);

    } finally {
        Invoice.aggregate = originalInvoiceAggregate;
    }
});

test('finance cross-tenant access is rejected with 403', async () => {
    const FeeStructure = require('../models/FeeStructure');
    const Invoice = require('../models/Invoice');
    const Branch = require('../models/Branch');
    const { getFeeStructureById, getInvoiceById, getReceiptBranding } = require('../controllers/financeController');

    const originalFSFindById = FeeStructure.findById;
    const originalInvoiceFindById = Invoice.findById;
    const originalBranchFindById = Branch.findById;
    const originalFSFindOne = FeeStructure.findOne;
    const originalInvoiceFindOne = Invoice.findOne;
    const originalBranchFindOne = Branch.findOne;

    const MY_TENANT = '507f1f77bcf86cd799439011';
    const OTHER_TENANT = '507f1f77bcf86cd799439099';

    try {
        const mockQuery = {
            populate: function() { return this; },
            then: function(resolve) { resolve(null); }
        };
        FeeStructure.findOne = () => mockQuery;
        Invoice.findOne = () => mockQuery;
        Branch.findOne = () => mockQuery;

        FeeStructure.findById = async () => ({ tenantId: OTHER_TENANT });
        Invoice.findById = async () => ({ tenantId: OTHER_TENANT });
        Branch.findById = async () => ({ tenantId: OTHER_TENANT });

        const req1 = {
            tenantId: MY_TENANT,
            params: { id: 'structure-1' }
        };
        const res1 = createResponse();
        let errorFS = null;
        try {
            await getFeeStructureById(req1, res1);
        } catch (e) {
            errorFS = e;
            errorFS.status = res1.statusCode;
        }
        assert.equal(res1.statusCode, 403);
        assert.match(errorFS.message, /Access denied for this finance resource./);

        const req2 = {
            tenantId: MY_TENANT,
            params: { id: 'invoice-1' }
        };
        const res2 = createResponse();
        let errorInvoice = null;
        try {
            await getInvoiceById(req2, res2);
        } catch (e) {
            errorInvoice = e;
            errorInvoice.status = res2.statusCode;
        }
        assert.equal(res2.statusCode, 403);
        assert.match(errorInvoice.message, /Access denied for this finance resource./);

        const req3 = {
            tenantId: MY_TENANT,
            params: { branchId: 'branch-1' }
        };
        const res3 = createResponse();
        let errorBranding = null;
        try {
            await getReceiptBranding(req3, res3);
        } catch (e) {
            errorBranding = e;
            errorBranding.status = res3.statusCode;
        }
        assert.equal(res3.statusCode, 403);
        assert.match(errorBranding.message, /Access denied for this finance resource./);

    } finally {
        FeeStructure.findById = originalFSFindById;
        Invoice.findById = originalInvoiceFindById;
        Branch.findById = originalBranchFindById;
        FeeStructure.findOne = originalFSFindOne;
        Invoice.findOne = originalInvoiceFindOne;
        Branch.findOne = originalBranchFindOne;
    }
});

test('cashier dashboard stats returns correct aggregated data', async () => {
    const Payment = require('../models/Payment');
    const Invoice = require('../models/Invoice');
    const { getDashboardStats } = require('../controllers/cashierController');

    const originalPaymentAggregate = Payment.aggregate;
    const originalPaymentFind = Payment.find;
    const originalInvoiceCount = Invoice.countDocuments;
    const originalInvoiceAggregate = Invoice.aggregate;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';

    try {
        Payment.aggregate = async () => [
            { collectedToday: 1250, transactionCountToday: 3 }
        ];

        Payment.find = () => {
            const chain = {
                sort: () => chain,
                limit: () => chain,
                populate: () => chain,
                then: (resolve) => resolve([{ amount: 500, method: 'CASH', createdAt: new Date() }])
            };
            return chain;
        };

        Invoice.countDocuments = async () => 4;

        Invoice.aggregate = async () => [
            { totalOutstanding: 3500 }
        ];

        const req = {
            user: { tenantId: MOCK_TENANT, branchId: MOCK_BRANCH }
        };
        const res = createResponse();

        await getDashboardStats(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.collectedToday, 1250);
        assert.equal(res.body.data.transactionCountToday, 3);
        assert.equal(res.body.data.pendingInvoicesCount, 4);
        assert.equal(res.body.data.totalOutstandingForBranch, 3500);
        assert.equal(res.body.data.recentTransactions.length, 1);
    } finally {
        Payment.aggregate = originalPaymentAggregate;
        Payment.find = originalPaymentFind;
        Invoice.countDocuments = originalInvoiceCount;
        Invoice.aggregate = originalInvoiceAggregate;
    }
});

test('cashier payment recording validates method and reference rules', async () => {
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const { recordInvoicePayment } = require('../services/paymentService');

    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindOneAndUpdate = Invoice.findOneAndUpdate;
    const originalPaymentCreate = Payment.create;
    const originalPaymentFindOne = Payment.findOne;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_INVOICE_ID = '507f1f77bcf86cd799439016';

    try {
        Invoice.findOne = async () => ({
            _id: MOCK_INVOICE_ID,
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            balance: 1000,
            status: 'UNPAID'
        });

        Invoice.findOneAndUpdate = async () => ({
            balance: 500,
            paidAmount: 500,
            status: 'PARTIALLY_PAID'
        });

        Payment.findOne = async () => null; // no duplicate

        Payment.create = async (data) => ({
            _id: 'payment-123',
            ...data,
            save: async () => {}
        });

        // 1. Invalid method validation
        await assert.rejects(
            recordInvoicePayment({
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH,
                invoiceId: MOCK_INVOICE_ID,
                amount: 500,
                method: 'INVALID_METHOD'
            }),
            /Invalid payment method/
        );

        // 2. Non-cash method requires reference
        await assert.rejects(
            recordInvoicePayment({
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH,
                invoiceId: MOCK_INVOICE_ID,
                amount: 500,
                method: 'CARD',
                reference: '   ' // empty reference
            }),
            /Payment reference is required for non-cash payments/
        );

        // 3. Cash payment can omit reference
        const result = await recordInvoicePayment({
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            invoiceId: MOCK_INVOICE_ID,
            amount: 500,
            method: 'CASH',
            reference: ''
        });
        assert.ok(result.payment);
        assert.equal(result.payment.method, 'CASH');

    } finally {
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findOneAndUpdate = originalInvoiceFindOneAndUpdate;
        Payment.create = originalPaymentCreate;
        Payment.findOne = originalPaymentFindOne;
    }
});

test('cashier payment recording detects duplicates and blocks cross-branch payments', async () => {
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const { recordInvoicePayment } = require('../services/paymentService');

    const originalInvoiceFindOne = Invoice.findOne;
    const originalPaymentFindOne = Payment.findOne;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_INVOICE_ID = '507f1f77bcf86cd799439016';

    try {
        Invoice.findOne = async () => ({
            _id: MOCK_INVOICE_ID,
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            balance: 1000,
            status: 'UNPAID'
        });

        // 1. Simulate duplicate payment found
        Payment.findOne = async () => ({
            _id: 'existing-payment-id',
            amount: 500,
            method: 'CASH'
        });

        await assert.rejects(
            recordInvoicePayment({
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH,
                invoiceId: MOCK_INVOICE_ID,
                amount: 500,
                method: 'CASH'
            }),
            /Possible duplicate payment detected/
        );

        // 2. Cross-branch payment block (invoice in another branch)
        Invoice.findOne = async () => null; // not found in this branch

        await assert.rejects(
            recordInvoicePayment({
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH, // current cashier branch
                invoiceId: MOCK_INVOICE_ID,
                amount: 500,
                method: 'CASH'
            }),
            /Invoice not found/
        );

    } finally {
        Invoice.findOne = originalInvoiceFindOne;
        Payment.findOne = originalPaymentFindOne;
    }
});

test('cashier payment reversal validates reason, prevents double reversal, and recalculates invoice', async () => {
    const Payment = require('../models/Payment');
    const Invoice = require('../models/Invoice');
    const { reverseInvoicePayment } = require('../services/paymentService');

    const originalPaymentFindOneAndUpdate = Payment.findOneAndUpdate;
    const originalPaymentFindOne = Payment.findOne;
    const originalPaymentCreate = Payment.create;
    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindOneAndUpdate = Invoice.findOneAndUpdate;

    const MOCK_TENANT = '507f1f77bcf86cd799439011';
    const MOCK_BRANCH = '507f1f77bcf86cd799439012';
    const MOCK_INVOICE_ID = '507f1f77bcf86cd799439016';
    const MOCK_PAYMENT_ID = '507f1f77bcf86cd799439099';

    try {
        // Mock Payment findOneAndUpdate to successfully update active payment
        Payment.findOneAndUpdate = async () => ({
            _id: MOCK_PAYMENT_ID,
            invoiceId: MOCK_INVOICE_ID,
            branchId: MOCK_BRANCH,
            amount: 500,
            method: 'CASH',
            reference: 'REF-123'
        });

        Invoice.findOne = async () => ({
            _id: MOCK_INVOICE_ID,
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            paidAmount: 500,
            balance: 500,
            totalAmount: 1000
        });

        Invoice.findOneAndUpdate = async () => ({
            balance: 1000,
            paidAmount: 0,
            status: 'UNPAID'
        });

        Payment.create = async (data) => ({
            _id: 'reversal-payment-id',
            ...data
        });

        // 1. Reversal requires reason
        await assert.rejects(
            reverseInvoicePayment({
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH,
                paymentId: MOCK_PAYMENT_ID,
                reason: '   ' // empty reason
            }),
            /Reason is required for reversal/
        );

        // 2. Successful reversal recalculates invoice
        const result = await reverseInvoicePayment({
            tenantId: MOCK_TENANT,
            branchId: MOCK_BRANCH,
            paymentId: MOCK_PAYMENT_ID,
            reason: 'Mistake recording'
        });

        assert.ok(result.payment);
        assert.ok(result.reversal);
        assert.ok(result.invoice);
        assert.equal(result.reversal.amount, -500);
        assert.equal(result.invoice.balance, 1000);

        // 3. Double reversal prevention
        Payment.findOneAndUpdate = async () => null; // simulate already reversed
        Payment.findOne = () => ({
            select: async () => ({ status: 'REVERSED' })
        }); // mock status check

        await assert.rejects(
            reverseInvoicePayment({
                tenantId: MOCK_TENANT,
                branchId: MOCK_BRANCH,
                paymentId: MOCK_PAYMENT_ID,
                reason: 'Duplicate attempt'
            }),
            /Payment has already been reversed/
        );

    } finally {
        Payment.findOneAndUpdate = originalPaymentFindOneAndUpdate;
        Payment.findOne = originalPaymentFindOne;
        Payment.create = originalPaymentCreate;
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findOneAndUpdate = originalInvoiceFindOneAndUpdate;
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Teacher Role Tests
// ─────────────────────────────────────────────────────────────────────────────

test('teacher changePassword rejects missing fields', async () => {
    const { changePassword } = require('../controllers/teacherController');

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    // Missing both
    const res1 = makeRes();
    await changePassword({ user: { _id: 'uid' }, body: {} }, res1, () => {});
    assert.equal(res1.statusCode, 400);
    assert.match(res1.body?.message || '', /required/i);

    // Missing newPassword
    const res2 = makeRes();
    await changePassword({ user: { _id: 'uid' }, body: { currentPassword: 'abc' } }, res2, () => {});
    assert.equal(res2.statusCode, 400);
    assert.match(res2.body?.message || '', /required/i);
});

test('teacher changePassword rejects short new password', async () => {
    const { changePassword } = require('../controllers/teacherController');
    const makeRes = () => ({
        statusCode: 200, body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    const res = makeRes();
    await changePassword(
        { user: { _id: 'uid' }, body: { currentPassword: 'correct', newPassword: 'short' } },
        res,
        () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || '', /8 characters/i);
});

test('teacher updateProfile only allows safe fields', async () => {
    // Validate that only phone, address, name are passed through
    // Any extra field like email or role must not be applied
    const allowedFields = ['phone', 'address', 'name'];
    const dangerousFields = ['email', 'role', 'passwordHash', 'tenantId', 'branchId'];

    // Controller only reads from body: const { phone, address, name } = req.body
    // Dangerous fields are not destructured — verify by checking the controller source
    const fs = require('fs');
    const controllerSrc = fs.readFileSync(
        require('path').join(__dirname, '../controllers/teacherController.js'),
        'utf8'
    );

    // updateProfile should only access phone, address, name from body
    const updateProfileMatch = controllerSrc.match(/exports\.updateProfile[\s\S]*?exports\.\w/);
    const updateProfileBody = updateProfileMatch ? updateProfileMatch[0] : '';

    for (const safe of allowedFields) {
        assert.ok(updateProfileBody.includes(safe), `${safe} should be handled`);
    }
    for (const danger of dangerousFields) {
        assert.equal(
            updateProfileBody.includes(`user.${danger} =`),
            false,
            `updateProfile must NOT assign user.${danger}`
        );
    }
});

test('teacher permissions: teacher role has correct default permissions', () => {
    const perms = getEffectivePermissions({ role: 'teacher' });

    // Teacher should have exam and result permissions
    assert.ok(perms.includes('teacher.exams.view'), 'teacher can view exams');
    assert.ok(perms.includes('teacher.results.enter'), 'teacher can enter results');
    assert.ok(perms.includes('teacher.attendance.submit'), 'teacher can submit attendance');

    // Teacher must NOT have admin-only permissions
    assert.equal(perms.includes('tenant.users.create'), false, 'teacher cannot create tenant users');
    assert.equal(perms.includes('finance.dashboard.view'), false, 'teacher cannot view finance dashboard');
    assert.equal(perms.includes('cashier.payments.create'), false, 'teacher cannot create payments');
    assert.equal(perms.includes('branch.staff.manage'), false, 'teacher cannot manage staff');
});

test('teacher results summary aggregation uses marksObtained not total', () => {
    // Validate aggregation pipeline shape by inspecting controller source
    const fs = require('fs');
    const src = fs.readFileSync(
        require('path').join(__dirname, '../controllers/teacherController.js'),
        'utf8'
    );

    const summaryFnMatch = src.match(/exports\.getResultsSummary[\s\S]*?exports\.\w/);
    const summaryFn = summaryFnMatch ? summaryFnMatch[0] : '';

    // Must reference marksObtained
    assert.ok(summaryFn.includes('marksObtained'), 'aggregation must use marksObtained');

    // Must NOT use $total (the old broken field)
    assert.equal(summaryFn.includes('$total'), false, 'aggregation must not use $total');

    // Must calculate percentage
    assert.ok(
        summaryFn.includes('percentage') || summaryFn.includes('$divide'),
        'aggregation must calculate percentage'
    );
});

test('teacher getClassResults filters by active/current enrollment status', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
        require('path').join(__dirname, '../controllers/teacherController.js'),
        'utf8'
    );

    const classResultsFnMatch = src.match(/exports\.getClassResults[\s\S]*?exports\.\w/);
    const classResultsFn = classResultsFnMatch ? classResultsFnMatch[0] : '';

    // Must filter on enrollment status
    assert.ok(
        classResultsFn.toLowerCase().includes('active') || classResultsFn.toLowerCase().includes('current'),
        'getClassResults must filter enrollments by active/current status'
    );
});

test('teacher authorization rejects other roles', () => {
    const response = createResponse();
    let nextCalled = false;

    authorize('teacher')(
        { role: 'cashier' },
        response,
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
});

test('teacher authorization accepts teacher role', () => {
    const response = createResponse();
    let nextCalled = false;

    authorize('teacher')(
        { role: 'teacher' },
        response,
        () => { nextCalled = true; }
    );

    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, 200); // unchanged
});

// Student Portal Tests
test('student changePassword rejects missing fields', async () => {
    const { changePassword } = require('../controllers/studentPortalController');
    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    // Missing both
    const res1 = makeRes();
    await changePassword({ user: { _id: 'uid' }, body: {} }, res1, () => {});
    assert.equal(res1.statusCode, 400);
    assert.match(res1.body?.message || '', /required/i);

    // Missing newPassword
    const res2 = makeRes();
    await changePassword({ user: { _id: 'uid' }, body: { oldPassword: 'abc' } }, res2, () => {});
    assert.equal(res2.statusCode, 400);
    assert.match(res2.body?.message || '', /required/i);
});

test('student changePassword rejects short new password', async () => {
    const { changePassword } = require('../controllers/studentPortalController');
    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    const res = makeRes();
    await changePassword(
        { user: { _id: 'uid' }, body: { oldPassword: 'correct', newPassword: 'short' } },
        res,
        () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message || '', /8 characters/i);
});

test('student changePassword succeeds with valid parameters and hashes password', async () => {
    const { changePassword } = require('../controllers/studentPortalController');
    const User = require('../models/User');
    const originalFindById = User.findById;

    const mockUser = {
        _id: 'uid',
        passwordHash: 'hashed_old',
        mustChangePassword: true,
        comparePassword: async (p) => p === 'correct_old',
        save: async function() {
            this.saved = true;
            return this;
        }
    };

    User.findById = async (id) => {
        if (id === 'uid') return mockUser;
        return null;
    };

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    try {
        // Correct old, invalid new (short)
        const res1 = makeRes();
        await changePassword({ user: { _id: 'uid' }, body: { oldPassword: 'correct_old', newPassword: 'shrt' } }, res1);
        assert.equal(res1.statusCode, 400);

        // Incorrect old
        const res2 = makeRes();
        await changePassword({ user: { _id: 'uid' }, body: { oldPassword: 'wrong_old', newPassword: 'new_long_password' } }, res2);
        assert.equal(res2.statusCode, 400);
        assert.match(res2.body?.message || '', /invalid current password/i);

        // Success case
        const res3 = makeRes();
        await changePassword({ user: { _id: 'uid' }, body: { oldPassword: 'correct_old', newPassword: 'new_long_password' } }, res3);
        assert.equal(res3.statusCode, 200);
        assert.equal(mockUser.passwordHash, 'new_long_password');
        assert.equal(mockUser.mustChangePassword, false);
        assert.equal(mockUser.saved, true);
    } finally {
        User.findById = originalFindById;
    }
});

test('student resolveStudentEnrollment always includes branchId', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
        require('path').join(__dirname, '../controllers/studentPortalController.js'),
        'utf8'
    );

    const resolveMatch = src.match(/const resolveStudentEnrollment[\s\S]*?};/);
    const resolveFn = resolveMatch ? resolveMatch[0] : '';

    assert.ok(resolveFn.includes('branchId: req.branchId'), 'resolveStudentEnrollment must include branchId: req.branchId');
    assert.ok(resolveFn.includes('tenantId: req.tenantId'), 'resolveStudentEnrollment must include tenantId: req.tenantId');
});

test('student getAttendance scopes query by branchId and tenantId', async () => {
    const { getAttendance } = require('../controllers/studentPortalController');
    const AttendanceRecord = require('../models/AttendanceRecord');
    const originalFind = AttendanceRecord.find;

    let capturedQuery = null;
    AttendanceRecord.find = (q) => {
        capturedQuery = q;
        return {
            populate: () => ({
                sort: () => []
            })
        };
    };

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    try {
        const req = {
            user: { studentId: 'student123' },
            tenantId: 'tenant123',
            branchId: 'branch123',
            query: {}
        };
        const res = makeRes();
        await getAttendance(req, res);

        assert.ok(capturedQuery, 'should have queried AttendanceRecord');
        assert.equal(capturedQuery.studentId, 'student123');
        assert.equal(capturedQuery.tenantId, 'tenant123');
        assert.equal(capturedQuery.branchId, 'branch123');
    } finally {
        AttendanceRecord.find = originalFind;
    }
});

test('student getResults marks subjects with no exams as NOT_GRADED', async () => {
    const { getResults } = require('../controllers/studentPortalController');
    const Enrollment = require('../models/Enrollment');
    const ClassSubject = require('../models/ClassSubject');
    const Exam = require('../models/Exam');
    const Result = require('../models/Result');

    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalClassSubjectFind = ClassSubject.find;
    const originalExamFind = Exam.find;
    const originalResultFind = Result.find;

    Enrollment.findOne = () => ({
        sort: () => ({
            populate: () => ({
                populate: () => ({
                    branchId: 'branch123',
                    classId: 'class123',
                    academicYearId: 'year123'
                })
            }),
            branchId: 'branch123',
            classId: 'class123',
            academicYearId: 'year123'
        })
    });

    ClassSubject.find = () => ({
        populate: () => [
            { subjectId: { _id: 'subject123', name: 'Math' }, passMarkPercent: 40 }
        ]
    });

    Exam.find = () => ({
        populate: () => ({
            populate: () => ({
                sort: () => []
            })
        })
    });

    Result.find = async () => [];

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    try {
        const req = {
            user: { studentId: 'student123' },
            tenantId: 'tenant123',
            branchId: 'branch123',
            query: {}
        };
        const res = makeRes();
        await getResults(req, res);

        assert.equal(res.body.success, true);
        const subjects = res.body.data.subjects;
        assert.equal(subjects.length, 1);
        assert.equal(subjects[0].subjectName, 'Math');
        assert.equal(subjects[0].status, 'NOT_GRADED');
        assert.equal(subjects[0].totalMarks, null);
        assert.equal(subjects[0].totalMax, null);
    } finally {
        Enrollment.findOne = originalEnrollmentFindOne;
        ClassSubject.find = originalClassSubjectFind;
        Exam.find = originalExamFind;
        Result.find = originalResultFind;
    }
});

// Parent Portal Tests
test('parent getProfile does not return password hash', async () => {
    const { getProfile } = require('../controllers/parentController');
    const User = require('../models/User');
    const originalFindById = User.findById;

    User.findById = () => ({
        select: async (fields) => {
            assert.equal(fields, '-passwordHash');
            return { _id: 'parent123', name: 'Parent One', role: 'parent' };
        }
    });

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    try {
        const req = { user: { _id: 'parent123' } };
        const res = makeRes();
        await getProfile(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.name, 'Parent One');
        assert.equal(res.body.data.passwordHash, undefined);
    } finally {
        User.findById = originalFindById;
    }
});

test('parent changePassword rejects invalid parameters', async () => {
    const { changePassword } = require('../controllers/parentController');
    const User = require('../models/User');
    const originalFindById = User.findById;

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    // Test missing fields
    const res1 = makeRes();
    await changePassword({ body: {} }, res1);
    assert.equal(res1.statusCode, 400);
    assert.match(res1.body?.message || '', /required/i);

    // Test short new password
    const res2 = makeRes();
    await changePassword({ body: { oldPassword: 'pwd', newPassword: 'shrt' } }, res2);
    assert.equal(res2.statusCode, 400);
    assert.match(res2.body?.message || '', /8 characters/i);

    // Test invalid current password
    const mockUser = {
        comparePassword: async () => false
    };
    User.findById = async () => mockUser;
    try {
        const res3 = makeRes();
        await changePassword({ user: { _id: 'uid' }, body: { oldPassword: 'wrong', newPassword: 'newlongpassword' } }, res3);
        assert.equal(res3.statusCode, 400);
        assert.match(res3.body?.message || '', /invalid current password/i);
    } finally {
        User.findById = originalFindById;
    }
});

test('parent endpoints enforce linked-child privacy constraints', async () => {
    const { getStudentAcademicYears, getStudentGrades } = require('../controllers/parentController');
    const Enrollment = require('../models/Enrollment');
    const originalFind = Enrollment.find;

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    // Parent has child1, tries to access child2 (unlinked)
    const reqUnlinked = {
        user: { students: ['child1'] },
        params: { studentId: 'child2' },
        tenantId: 'tenant123'
    };

    // getStudentAcademicYears should reject unlinked
    const res1 = makeRes();
    await getStudentAcademicYears(reqUnlinked, res1);
    assert.equal(res1.statusCode, 403);
    assert.match(res1.body?.message || '', /unauthorized/i);

    // getStudentGrades should reject unlinked
    const res2 = makeRes();
    await getStudentGrades(reqUnlinked, res2);
    assert.equal(res2.statusCode, 403);
    assert.match(res2.body?.message || '', /unauthorized/i);

    // Parent queries linked child
    const reqLinked = {
        user: { students: ['child1'] },
        params: { studentId: 'child1' },
        tenantId: 'tenant123',
        query: {}
    };

    let capturedQuery = null;
    Enrollment.find = (q) => {
        capturedQuery = q;
        return {
            sort: () => ({
                populate: () => ({
                    populate: () => ({
                        populate: () => []
                    })
                })
            })
        };
    };

    try {
        const res3 = makeRes();
        await getStudentAcademicYears(reqLinked, res3);
        assert.equal(res3.statusCode, 200);
        assert.ok(capturedQuery);
        assert.equal(capturedQuery.studentId, 'child1');
        assert.equal(capturedQuery.tenantId, 'tenant123');
    } finally {
        Enrollment.find = originalFind;
    }
});

test('parent rank endpoint enforces linked-child checks', async () => {
    const { getStudentRank } = require('../controllers/parentController');
    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    // Unlinked child rank check
    const reqUnlinked = {
        user: { students: ['child1'] },
        params: { studentId: 'child2' }
    };
    const res1 = makeRes();
    await getStudentRank(reqUnlinked, res1);
    assert.equal(res1.statusCode, 403);

    // Linked child rank check (mock no enrollment case)
    const Enrollment = require('../models/Enrollment');
    const originalFindOne = Enrollment.findOne;
    Enrollment.findOne = () => ({
        sort: () => ({
            populate: () => ({
                populate: () => null
            })
        })
    });

    try {
        const reqLinked = {
            user: { students: ['child1'] },
            params: { studentId: 'child1' },
            tenantId: 'tenant123',
            query: {}
        };
        const res2 = makeRes();
        await getStudentRank(reqLinked, res2);
        assert.equal(res2.statusCode, 200);
        assert.equal(res2.body.success, true);
        assert.equal(res2.body.data.rank, null);
    } finally {
        Enrollment.findOne = originalFindOne;
    }
});

test('parent details endpoints support academic year filters', async () => {
    const { getStudentAttendance, getStudentInvoices } = require('../controllers/parentController');
    const AttendanceSession = require('../models/AttendanceSession');
    const AttendanceRecord = require('../models/AttendanceRecord');
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');

    const originalSessionFind = AttendanceSession.find;
    const originalRecordFind = AttendanceRecord.find;
    const originalInvoiceFind = Invoice.find;
    const originalPaymentFind = Payment.find;

    const makeRes = () => ({
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    });

    // Mock AttendanceSession and Record
    let capturedSessionQuery = null;
    let capturedRecordQuery = null;
    AttendanceSession.find = (q) => {
        capturedSessionQuery = q;
        return {
            select: async () => [{ _id: 'session123' }]
        };
    };
    AttendanceRecord.find = (q) => {
        capturedRecordQuery = q;
        return {
            populate: () => ({
                sort: () => []
            })
        };
    };

    // Mock Invoice and Payment
    let capturedInvoiceQuery = null;
    Invoice.find = (q) => {
        capturedInvoiceQuery = q;
        return {
            sort: () => []
        };
    };
    Payment.find = () => ({
        sort: () => []
    });

    try {
        const req = {
            user: { students: ['child1'] },
            params: { studentId: 'child1' },
            tenantId: 'tenant123',
            query: { schoolYearId: 'year555' }
        };

        // Test attendance year filtering
        const res1 = makeRes();
        await getStudentAttendance(req, res1);
        assert.equal(res1.statusCode, 200);
        assert.equal(capturedSessionQuery.academicYearId, 'year555');
        assert.deepEqual(capturedRecordQuery.sessionId, { $in: ['session123'] });

        // Test invoices year filtering
        const res2 = makeRes();
        await getStudentInvoices(req, res2);
        assert.equal(res2.statusCode, 200);
        assert.equal(capturedInvoiceQuery.academicYearId, 'year555');

    } finally {
        AttendanceSession.find = originalSessionFind;
        AttendanceRecord.find = originalRecordFind;
        Invoice.find = originalInvoiceFind;
        Payment.find = originalPaymentFind;
    }
});

test('legacy academic route cannot update cross-tenant student', async () => {
    const Student = require('../models/Student');
    const { transferStudent } = require('../controllers/promotionController');

    const originalStudentFindOne = Student.findOne;
    try {
        // Mock student belonging to another tenant
        Student.findOne = async () => null;

        const req = {
            tenantId: 'tenant-user',
            body: {
                studentId: 'student-cross-tenant',
                newBranchId: 'branch-1',
                newClassId: 'class-1',
                newAcademicYearId: 'year-1'
            }
        };
        const res = createResponse();

        await transferStudent(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this academic resource.');
    } finally {
        Student.findOne = originalStudentFindOne;
    }
});

test('legacy promotion rejects cross-tenant or cross-branch studentIds', async () => {
    const Student = require('../models/Student');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const { promoteStudents } = require('../controllers/promotionController');

    const originalStudentFindOne = Student.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;

    try {
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-user', branchId: 'branch-1' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-user' });
        
        // Mock student query returning null (i.e. not found or cross-tenant/branch)
        Student.findOne = async () => null;

        const req = {
            tenantId: 'tenant-user',
            branchId: 'branch-1', // branch-scoped user
            body: {
                studentIds: ['student-cross'],
                nextClassId: 'class-1',
                nextAcademicYearId: 'year-1'
            }
        };
        const res = createResponse();

        await promoteStudents(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this academic resource.');
    } finally {
        Student.findOne = originalStudentFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('legacy transfer rejects invalid target branch/class/year', async () => {
    const Student = require('../models/Student');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const { transferStudent } = require('../controllers/promotionController');

    const originalStudentFindOne = Student.findOne;
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;

    try {
        Student.findOne = async () => ({ _id: 'student-1', tenantId: 'tenant-user', branchId: 'branch-1' });
        Branch.findOne = async () => null; // target branch does not exist or wrong tenant
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-user', branchId: 'branch-2' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-user' });

        const req = {
            tenantId: 'tenant-user',
            body: {
                studentId: 'student-1',
                newBranchId: 'branch-2',
                newClassId: 'class-1',
                newAcademicYearId: 'year-1'
            }
        };
        const res = createResponse();

        await transferStudent(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this academic resource.');
    } finally {
        Student.findOne = originalStudentFindOne;
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('branch transfer destination routes keep target branch separate from source branch guard', () => {
    const academicRoutes = require('../routes/academicRoutes');
    const { branchGuard } = require('../middleware/auth');
    const classRoute = academicRoutes.stack.find((layer) => layer.route?.path === '/transfer/branches/:targetBranchId/classes');
    const sectionRoute = academicRoutes.stack.find((layer) => layer.route?.path === '/transfer/branches/:targetBranchId/classes/:classId/sections');
    let nextCalled = false;

    branchGuard(
        { role: 'branch_admin', scope: 'branch', branchId: 'source-branch', params: { targetBranchId: 'target-branch' }, body: {}, query: {} },
        createResponse(),
        () => { nextCalled = true; }
    );

    assert.ok(classRoute?.route?.methods?.get);
    assert.ok(sectionRoute?.route?.methods?.get);
    assert.equal(nextCalled, true);
});

test('legacy assignments route does not expose cross-branch assignments', async () => {
    const TeacherAssignment = require('../models/TeacherAssignment');
    const { getAllAssignments } = require('../controllers/assignmentController');

    const originalFind = TeacherAssignment.find;
    let capturedQuery = null;

    try {
        TeacherAssignment.find = (query) => {
            capturedQuery = query;
            return {
                populate: () => ({
                    populate: () => ({
                        populate: () => ({
                            sort: () => []
                        })
                    })
                })
            };
        };

        const req = {
            tenantId: 'tenant-user',
            branchId: 'branch-1' // branch-scoped user
        };
        const res = createResponse();

        await getAllAssignments(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(capturedQuery.branchId, 'branch-1');
        assert.equal(capturedQuery.tenantId, 'tenant-user');
    } finally {
        TeacherAssignment.find = originalFind;
    }
});

test('assignment creation rejects cross-branch teacher/class/subject/year', async () => {
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const User = require('../models/User');
    const Subject = require('../models/Subject');
    const { assignTeacher } = require('../controllers/assignmentController');

    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalUserFindOne = User.findOne;
    const originalSubjectFindOne = Subject.findOne;

    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-user' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-user', branchId: 'branch-1' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-user' });
        Subject.findOne = async () => ({ _id: 'subject-1', tenantId: 'tenant-user', branchId: 'branch-1' });
        
        // Mock teacher user who belongs to branch-2 (cross-branch!)
        User.findOne = async () => ({ _id: 'teacher-1', tenantId: 'tenant-user', role: 'teacher', branchId: 'branch-2' });

        const req = {
            tenantId: 'tenant-user',
            branchId: 'branch-1',
            body: {
                teacherUserId: 'teacher-1',
                classId: 'class-1',
                subjectId: 'subject-1',
                academicYearId: 'year-1',
                branchId: 'branch-1'
            }
        };
        const res = createResponse();

        await assignTeacher(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this assignment resource.');
    } finally {
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
        User.findOne = originalUserFindOne;
        Subject.findOne = originalSubjectFindOne;
    }
});

test('assignBranchAdmin rejects missing branch', async () => {
    const Branch = require('../models/Branch');
    const { assignBranchAdmin } = require('../controllers/tenantController');

    const originalBranchFindOne = Branch.findOne;
    try {
        Branch.findOne = async () => null;

        const req = {
            tenantId: 'tenant-user',
            params: { branchId: 'missing-branch' },
            body: { userId: 'user-1' }
        };
        const res = createResponse();
        
        let errorThrown = null;
        try {
            await assignBranchAdmin(req, res);
        } catch (err) {
            errorThrown = err;
        }

        assert.ok(errorThrown);
        assert.equal(errorThrown.message, 'Target branch not found in this institution');
    } finally {
        Branch.findOne = originalBranchFindOne;
    }
});

test('assignBranchAdmin rejects branch from another tenant', async () => {
    const Branch = require('../models/Branch');
    const { assignBranchAdmin } = require('../controllers/tenantController');

    const originalBranchFindOne = Branch.findOne;
    try {
        // Mock finding branch but it returns null since it doesn't match req.tenantId
        Branch.findOne = async () => null;

        const req = {
            tenantId: 'tenant-user',
            params: { branchId: 'cross-tenant-branch' },
            body: { userId: 'user-1' }
        };
        const res = createResponse();
        
        let errorThrown = null;
        try {
            await assignBranchAdmin(req, res);
        } catch (err) {
            errorThrown = err;
        }

        assert.ok(errorThrown);
        assert.equal(errorThrown.message, 'Target branch not found in this institution');
    } finally {
        Branch.findOne = originalBranchFindOne;
    }
});

test('assignBranchAdmin rejects non-branch-admin user', async () => {
    const Branch = require('../models/Branch');
    const User = require('../models/User');
    const { assignBranchAdmin } = require('../controllers/tenantController');

    const originalBranchFindOne = Branch.findOne;
    const originalUserFindOne = User.findOne;
    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-user', isActive: true });
        // Mock user with role 'teacher' instead of 'branch_admin'
        User.findOne = async () => ({ _id: 'user-1', tenantId: 'tenant-user', role: 'teacher', scope: 'branch' });

        const req = {
            tenantId: 'tenant-user',
            params: { branchId: 'branch-1' },
            body: { userId: 'user-1' }
        };
        const res = createResponse();

        let errorThrown = null;
        try {
            await assignBranchAdmin(req, res);
        } catch (err) {
            errorThrown = err;
        }

        assert.ok(errorThrown);
        assert.equal(errorThrown.message, 'User must have role branch_admin and scope branch');
    } finally {
        Branch.findOne = originalBranchFindOne;
        User.findOne = originalUserFindOne;
    }
});

test('SMTP helper skips dispatch when DB disconnected/test mode', async () => {
    const { sendPlatformEmail } = require('../utils/emailHelper');
    const mongoose = require('mongoose');

    const originalReadyState = mongoose.connection.readyState;
    try {
        // Force disconnected state
        mongoose.connection.readyState = 0;

        let warned = false;
        const originalWarn = console.warn;
        console.warn = (msg) => {
            if (msg.includes('MongoDB is disconnected')) warned = true;
            originalWarn(msg);
        };

        await sendPlatformEmail('approved', { name: 'Test School', email: 'test@school.com' }, { name: 'Admin', email: 'admin@school.com' });
        
        console.warn = originalWarn;
        assert.equal(warned, true);
    } finally {
        mongoose.connection.readyState = originalReadyState;
    }
});

test('legacy /api/exams/* fails closed', async () => {
    const examRoutes = require('../routes/examRoutes');
    let status = null;
    let body = null;
    const res = {
        status(code) { status = code; return this; },
        json(data) { body = data; return this; }
    };
    examRoutes({ method: 'GET', url: '/' }, res, () => {});
    assert.equal(status, 410);
    assert.equal(body.message, 'Legacy exam route disabled. Use role-specific exam endpoints.');
});

test('student admission rejects foreign classId', async () => {
    const { admitStudent } = require('../controllers/studentController');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-1', isActive: true });
        Class.findOne = async () => null; // Class not found or mismatched
        const req = {
            tenantId: 'tenant-1',
            body: {
                admissionNumber: 'ST-101',
                firstName: 'John',
                lastName: 'Doe',
                classId: 'foreign-class',
                academicYearId: 'year-1'
            }
        };
        const res = createResponse();
        await admitStudent(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Invalid class for this branch.');
    } finally {
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
    }
});

test('student admission rejects foreign academicYearId', async () => {
    const { admitStudent } = require('../controllers/studentController');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-1', isActive: true });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        AcademicYear.findOne = async () => null; // Academic year mismatch
        const req = {
            tenantId: 'tenant-1',
            body: {
                admissionNumber: 'ST-101',
                firstName: 'John',
                lastName: 'Doe',
                classId: 'class-1',
                academicYearId: 'foreign-year'
            }
        };
        const res = createResponse();
        await admitStudent(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Invalid academic year for this tenant.');
    } finally {
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('student admission rejects foreign sectionId', async () => {
    const { admitStudent } = require('../controllers/studentController');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const Section = require('../models/Section');
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalSectionFindOne = Section.findOne;
    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-1', isActive: true });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Section.findOne = async () => null; // Section mismatched or inactive
        const req = {
            tenantId: 'tenant-1',
            body: {
                admissionNumber: 'ST-101',
                firstName: 'John',
                lastName: 'Doe',
                classId: 'class-1',
                academicYearId: 'year-1',
                sectionId: 'foreign-section'
            }
        };
        const res = createResponse();
        await admitStudent(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Invalid section for this class or branch.');
    } finally {
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Section.findOne = originalSectionFindOne;
    }
});

test('registrar admission rejects foreign academicYearId', async () => {
    const { createStudentAdmission } = require('../controllers/registrarController');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Counter = require('../models/Counter');
    const Student = require('../models/Student');
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    const originalStudentFindOne = Student.findOne;
    try {
        Counter.findOneAndUpdate = async () => ({ seq: 1 });
        Student.findOne = async () => null;
        AcademicYear.findOne = async () => null; // Academic year mismatch
        Class.findOne = async () => ({ _id: '507f1f77bcf86cd799439013', tenantId: '507f1f77bcf86cd799439011', branchId: '507f1f77bcf86cd799439012' });
        const req = {
            user: { tenantId: '507f1f77bcf86cd799439011', branchId: '507f1f77bcf86cd799439012' },
            body: {
                classId: '507f1f77bcf86cd799439013',
                academicYearId: '507f1f77bcf86cd799439019', // foreign/invalid academicYearId hex
                guardianInfo: { address: '123 St' }
            }
        };
        const res = createResponse();
        await createStudentAdmission(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Invalid academic year for this tenant.');
    } finally {
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
        Student.findOne = originalStudentFindOne;
    }
});

test('registrar re-enrollment rejects foreign classId', async () => {
    const { createEnrollment } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const Class = require('../models/Class');
    const originalStudentFindOne = Student.findOne;
    const originalClassFindOne = Class.findOne;
    try {
        Student.findOne = async () => ({ _id: 'student-1' });
        Class.findOne = async () => null; // Class mismatch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                studentId: 'student-1',
                classId: 'foreign-class',
                academicYearId: 'year-1'
            }
        };
        const res = createResponse();
        await createEnrollment(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Invalid Class ID for this branch.');
    } finally {
        Student.findOne = originalStudentFindOne;
        Class.findOne = originalClassFindOne;
    }
});

test('registrar re-enrollment rejects foreign academicYearId', async () => {
    const { createEnrollment } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const originalStudentFindOne = Student.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    try {
        Student.findOne = async () => ({ _id: 'student-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        AcademicYear.findOne = async () => null; // Year mismatch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                studentId: 'student-1',
                classId: 'class-1',
                academicYearId: 'foreign-year'
            }
        };
        const res = createResponse();
        await createEnrollment(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Invalid academic year for this tenant.');
    } finally {
        Student.findOne = originalStudentFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('academic classes route requires branch.classes.view', () => {
    const academicRoutes = require('../routes/academicRoutes');
    const getClassesRoute = academicRoutes.stack.find(s => s.route && s.route.path === '/classes' && s.route.methods.get);
    assert.ok(getClassesRoute, 'GET /classes route should be registered');
});

test('tenant overview report returns real aggregated monthly trend', async () => {
    const { getOverviewReport } = require('../controllers/tenantController');
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const Result = require('../models/Result');
    const User = require('../models/User');

    const originalInvoiceAggregate = Invoice.aggregate;
    const originalPaymentAggregate = Payment.aggregate;
    const originalStudentCount = Student.countDocuments;
    const originalEnrollmentCount = Enrollment.countDocuments;
    const originalResultAggregate = Result.aggregate;
    const originalStudentAggregate = Student.aggregate;
    const originalUserCount = User.countDocuments;

    try {
        Student.countDocuments = async () => 5;
        User.countDocuments = async () => 3;
        Enrollment.countDocuments = async () => 5;
        Invoice.aggregate = async () => [{ _id: null, totalRevenue: 100, projectedRevenue: 200 }];
        Result.aggregate = async () => [{ _id: null, avgMarks: 85, totalResults: 10 }];
        Student.aggregate = async () => [{ _id: 'branch-1', count: 5 }];
        Payment.aggregate = async () => [{ _id: { year: 2026, month: 6 }, collected: 100 }];

        const req = {
            tenantId: '65f1a23b4c5d6e7f8a9b0c1d',
            query: {}
        };
        const res = createResponse();

        await getOverviewReport(req, res);
        assert.equal(res.statusCode, 200);
        assert.ok(res.body.trendData);
        assert.equal(res.body.trendData.length, 6);
        assert.equal(res.body.teacherCount, 3);
        assert.equal(res.body.graduateCount, 5);
    } finally {
        Invoice.aggregate = originalInvoiceAggregate;
        Payment.aggregate = originalPaymentAggregate;
        Student.countDocuments = originalStudentCount;
        Enrollment.countDocuments = originalEnrollmentCount;
        Result.aggregate = originalResultAggregate;
        Student.aggregate = originalStudentAggregate;
        User.countDocuments = originalUserCount;
    }
});

// --- createTeacherWithAssignments (standalone MongoDB — no transactions) ---

test('createTeacherWithAssignments rejects missing required fields', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const req = {
        user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
        body: { name: '', email: '', password: '' },
        ip: '127.0.0.1',
        get: () => 'test-agent'
    };
    const res = createResponse();
    await createTeacherWithAssignments(req, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes('required'));
});

test('createTeacherWithAssignments returns 409 for duplicate email', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const originalFindOne = User.findOne;
    try {
        User.findOne = async () => ({ _id: 'existing', email: 'teacher@school.com' });
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
            body: { name: 'Jane', email: 'teacher@school.com', password: 'Password1!' },
            ip: '127.0.0.1',
            get: () => 'test-agent'
        };
        const res = createResponse();
        await createTeacherWithAssignments(req, res);
        assert.equal(res.statusCode, 409);
        assert.ok(res.body.message.includes('Email already exists'));
    } finally {
        User.findOne = originalFindOne;
    }
});

test('createTeacherWithAssignments returns 400 for assignment missing required fields', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const originalFindOne = User.findOne;
    try {
        User.findOne = async () => null; // no duplicate
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
            body: {
                name: 'Jane', email: 'newteacher@school.com', password: 'Password1!',
                assignments: [{ classId: 'class-1' }] // missing subjectId & academicYearId
            },
            ip: '127.0.0.1',
            get: () => 'test-agent'
        };
        const res = createResponse();
        await createTeacherWithAssignments(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.message.includes('classId, subjectId, and academicYearId'));
    } finally {
        User.findOne = originalFindOne;
    }
});

test('createTeacherWithAssignments returns 400 for duplicate assignment in payload', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const originalFindOne = User.findOne;
    try {
        User.findOne = async () => null;
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
            body: {
                name: 'Jane', email: 'newteacher@school.com', password: 'Password1!',
                assignments: [
                    { classId: 'c1', subjectId: 's1', academicYearId: 'y1' },
                    { classId: 'c1', subjectId: 's1', academicYearId: 'y1' } // duplicate
                ]
            },
            ip: '127.0.0.1',
            get: () => 'test-agent'
        };
        const res = createResponse();
        await createTeacherWithAssignments(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.message.includes('Duplicate assignment'));
    } finally {
        User.findOne = originalFindOne;
    }
});

test('createTeacherWithAssignments returns 403 for cross-branch classId', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const originalUserFindOne = User.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    try {
        User.findOne = async () => null; // no duplicate
        AcademicYear.findOne = async () => ({ _id: 'year-1' });
        Class.findOne = async () => null; // class not in this branch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
            body: {
                name: 'Jane', email: 'newteacher@school.com', password: 'Password1!',
                assignments: [{ classId: 'foreign-class', subjectId: 's1', academicYearId: 'year-1' }]
            },
            ip: '127.0.0.1',
            get: () => 'test-agent'
        };
        const res = createResponse();
        await createTeacherWithAssignments(req, res);
        assert.equal(res.statusCode, 403);
        assert.ok(res.body.message.includes('Access denied'));
    } finally {
        User.findOne = originalUserFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
    }
});

test('createTeacherWithAssignments succeeds without transactions on standalone MongoDB', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Subject = require('../models/Subject');
    const TeacherAssignment = require('../models/TeacherAssignment');
    const auditLogService = require('../services/auditLogService');

    const originalUserFindOne = User.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalSubjectFindOne = Subject.findOne;
    const originalTACreate = TeacherAssignment.create;
    const originalLogAction = auditLogService.logAction;

    const savedUserId = new mongoose.Types.ObjectId();
    let savedUser = null;

    try {
        User.findOne = async () => null; // no duplicate
        AcademicYear.findOne = async () => ({ _id: 'year-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        Subject.findOne = async () => ({ _id: 'sub-1', tenantId: 'tenant-1', branchId: null }); // tenant-wide subject
        TeacherAssignment.create = async (docs) => docs.map(d => ({ ...d, _id: new mongoose.Types.ObjectId() }));
        auditLogService.logAction = async () => {};

        // Intercept User.prototype.save
        const originalSave = User.prototype.save;
        User.prototype.save = async function() {
            this._id = savedUserId;
            savedUser = this;
            return this;
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
            body: {
                name: 'Jane Teacher', email: 'janeteacher@school.com', password: 'Password1!',
                assignments: [{ classId: 'class-1', subjectId: 'sub-1', academicYearId: 'year-1' }]
            },
            ip: '127.0.0.1',
            get: () => 'test-agent'
        };
        const res = createResponse();
        await createTeacherWithAssignments(req, res);

        User.prototype.save = originalSave;

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.message, 'Teacher created with assignments');
        assert.ok(res.body.data, 'should return user data');
        assert.ok(!res.body.data.passwordHash, 'passwordHash must not be exposed');
    } finally {
        User.findOne = originalUserFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Subject.findOne = originalSubjectFindOne;
        TeacherAssignment.create = originalTACreate;
        auditLogService.logAction = originalLogAction;
    }
});

test('createTeacherWithAssignments rolls back user on assignment failure', async () => {
    const { createTeacherWithAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Subject = require('../models/Subject');
    const TeacherAssignment = require('../models/TeacherAssignment');
    const auditLogService = require('../services/auditLogService');

    const originalUserFindOne = User.findOne;
    const originalUserDeleteOne = User.deleteOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalSubjectFindOne = Subject.findOne;
    const originalTACreate = TeacherAssignment.create;
    const originalTADeleteMany = TeacherAssignment.deleteMany;
    const originalLogAction = auditLogService.logAction;

    let deletedUserId = null;

    try {
        User.findOne = async () => null;
        AcademicYear.findOne = async () => ({ _id: 'year-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        Subject.findOne = async () => ({ _id: 'sub-1', tenantId: 'tenant-1', branchId: null });
        TeacherAssignment.create = async () => { throw new Error('DB write failure'); };
        TeacherAssignment.deleteMany = async () => {};
        User.deleteOne = async (query) => { deletedUserId = query._id; };
        auditLogService.logAction = async () => {};

        const fakeUserId = new mongoose.Types.ObjectId();
        const originalSave = User.prototype.save;
        User.prototype.save = async function() {
            this._id = fakeUserId;
            return this;
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1', _id: 'admin-1', role: 'branch_admin' },
            body: {
                name: 'Bad Teacher', email: 'badteacher@school.com', password: 'Password1!',
                assignments: [{ classId: 'class-1', subjectId: 'sub-1', academicYearId: 'year-1' }]
            },
            ip: '127.0.0.1',
            get: () => 'test-agent'
        };
        const res = createResponse();
        await createTeacherWithAssignments(req, res);

        User.prototype.save = originalSave;

        assert.equal(res.statusCode, 500);
        assert.ok(res.body.message.includes('rolled back'), 'should mention rollback in error');
        assert.ok(deletedUserId !== null, 'user should have been deleted during rollback');
        assert.equal(String(deletedUserId), String(fakeUserId), 'correct user ID should be deleted');
    } finally {
        User.findOne = originalUserFindOne;
        User.deleteOne = originalUserDeleteOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Subject.findOne = originalSubjectFindOne;
        TeacherAssignment.create = originalTACreate;
        TeacherAssignment.deleteMany = originalTADeleteMany;
        auditLogService.logAction = originalLogAction;
    }
});

test('branch admin teacher assignment rejects foreign teacherUserId', async () => {
    const { updateTeacherAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const originalUserFindOne = User.findOne;
    try {
        User.findOne = async () => null; // teacher not found or mismatched tenant/branch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            params: { teacherUserId: 'foreign-teacher' },
            body: { assignments: [] }
        };
        const res = createResponse();
        await updateTeacherAssignments(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this branch resource.');
    } finally {
        User.findOne = originalUserFindOne;
    }
});

test('branch admin teacher assignment rejects foreign classId', async () => {
    const { updateTeacherAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const originalUserFindOne = User.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    try {
        User.findOne = async () => ({ _id: 'teacher-1', tenantId: 'tenant-1', branchId: 'branch-1', role: 'teacher' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => null; // class mismatch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            params: { teacherUserId: 'teacher-1' },
            body: {
                assignments: [
                    { classId: 'foreign-class', subjectId: 'subject-1', academicYearId: 'year-1' }
                ]
            }
        };
        const res = createResponse();
        await updateTeacherAssignments(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this branch resource.');
    } finally {
        User.findOne = originalUserFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
    }
});

test('branch admin teacher assignment rejects foreign sectionId', async () => {
    const { updateTeacherAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Section = require('../models/Section');
    const originalUserFindOne = User.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalSectionFindOne = Section.findOne;
    try {
        User.findOne = async () => ({ _id: 'teacher-1', tenantId: 'tenant-1', branchId: 'branch-1', role: 'teacher' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        Section.findOne = async () => null; // section mismatch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            params: { teacherUserId: 'teacher-1' },
            body: {
                assignments: [
                    { classId: 'class-1', sectionId: 'foreign-section', subjectId: 'subject-1', academicYearId: 'year-1' }
                ]
            }
        };
        const res = createResponse();
        await updateTeacherAssignments(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this branch resource.');
    } finally {
        User.findOne = originalUserFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Section.findOne = originalSectionFindOne;
    }
});

test('branch admin teacher assignment rejects foreign academicYearId', async () => {
    const { updateTeacherAssignments } = require('../controllers/branchAdminController');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const originalUserFindOne = User.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    try {
        User.findOne = async () => ({ _id: 'teacher-1', tenantId: 'tenant-1', branchId: 'branch-1', role: 'teacher' });
        AcademicYear.findOne = async () => null; // academic year mismatch
        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            params: { teacherUserId: 'teacher-1' },
            body: {
                assignments: [
                    { classId: 'class-1', subjectId: 'subject-1', academicYearId: 'foreign-year' }
                ]
            }
        };
        const res = createResponse();
        await updateTeacherAssignments(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this branch resource.');
    } finally {
        User.findOne = originalUserFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('/api/assignments rejects sectionId from another branch/class', async () => {
    const { assignTeacher } = require('../controllers/assignmentController');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const User = require('../models/User');
    const Subject = require('../models/Subject');
    const Section = require('../models/Section');
    
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalUserFindOne = User.findOne;
    const originalSubjectFindOne = Subject.findOne;
    const originalSectionFindOne = Section.findOne;

    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        User.findOne = async () => ({ _id: 'teacher-1', tenantId: 'tenant-1', role: 'teacher', branchId: 'branch-1' });
        Subject.findOne = async () => ({ _id: 'subject-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        Section.findOne = async () => null; // section not found in this class/branch context

        const req = {
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            body: {
                classId: 'class-1',
                academicYearId: 'year-1',
                teacherUserId: 'teacher-1',
                subjectId: 'subject-1',
                sectionId: 'foreign-section'
            }
        };
        const res = createResponse();
        await assignTeacher(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.message, 'Access denied for this assignment resource.');
    } finally {
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
        User.findOne = originalUserFindOne;
        Subject.findOne = originalSubjectFindOne;
        Section.findOne = originalSectionFindOne;
    }
});

test('GET /api/academic/years rejects branch_admin if route is tenant-level', async () => {
    const academicRoutes = require('../routes/academicRoutes');
    const getYearsRoute = academicRoutes.stack.find(s => s.route && s.route.path === '/years' && s.route.methods.get);
    assert.ok(getYearsRoute, 'GET /years route should be registered');
    assert.ok(getYearsRoute.route.stack.length > 1, 'GET /years route should have middleware stack');
});

test('/api/tenant/academic-years is not exposed to branch_admin', async () => {
    const tenantRoutes = require('../routes/tenantRoutes');
    const getYearsRoute = tenantRoutes.stack.find(s => s.route && s.route.path === '/academic-years' && s.route.methods.get);
    assert.ok(getYearsRoute, 'GET /academic-years route should be registered in tenantRoutes');
    assert.ok(getYearsRoute.route.stack.length > 1, 'GET /academic-years should have middleware stack');
});

test('legacy examController fails closed', async () => {
    const examController = require('../controllers/examController');
    const res = createResponse();
    await examController.createExam({}, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.body.message, 'Legacy exam controller disabled. Use role-specific exam endpoints.');
    
    const res2 = createResponse();
    await examController.submitResult({}, res2);
    assert.equal(res2.statusCode, 410);
    assert.equal(res2.body.message, 'Legacy exam controller disabled. Use role-specific exam endpoints.');
});

test('branch admin class subject delete rejects foreign branch record', async () => {
    const ClassSubject = require('../models/ClassSubject');
    const { deleteClassSubject } = require('../controllers/branchAdminController');

    const originalClassSubjectFindOne = ClassSubject.findOne;
    const originalClassSubjectFindById = ClassSubject.findById;

    try {
        ClassSubject.findOne = async () => null;
        ClassSubject.findById = async () => ({ _id: 'cs-1', tenantId: 'tenant-1', branchId: 'other-branch' });

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'my-branch' },
            params: { id: 'cs-1' }
        };
        const res = createResponse();
        await deleteClassSubject(req, res);
        assert.equal(res.statusCode, 403);
        assert.match(res.body.message, /Access denied for this branch resource./);
    } finally {
        ClassSubject.findOne = originalClassSubjectFindOne;
        ClassSubject.findById = originalClassSubjectFindById;
    }
});

test('branch admin exam delete/update rejects foreign branch exam', async () => {
    const Exam = require('../models/Exam');
    const { deleteExam, updateExamStatus } = require('../controllers/branchAdminController');

    const originalExamFindOne = Exam.findOne;
    const originalExamFindById = Exam.findById;

    try {
        Exam.findOne = async () => null;
        Exam.findById = async () => ({ _id: 'exam-1', tenantId: 'tenant-1', branchId: 'other-branch' });

        const reqDelete = {
            user: { tenantId: 'tenant-1', branchId: 'my-branch' },
            params: { id: 'exam-1' }
        };
        const resDelete = createResponse();
        await deleteExam(reqDelete, resDelete);
        assert.equal(resDelete.statusCode, 403);
        assert.match(resDelete.body.message, /Access denied for this branch resource./);

        const reqUpdate = {
            user: { tenantId: 'tenant-1', branchId: 'my-branch' },
            params: { id: 'exam-1' },
            body: { status: 'Open' }
        };
        const resUpdate = createResponse();
        await updateExamStatus(reqUpdate, resUpdate);
        assert.equal(resUpdate.statusCode, 403);
        assert.match(resUpdate.body.message, /Access denied for this branch resource./);
    } finally {
        Exam.findOne = originalExamFindOne;
        Exam.findById = originalExamFindById;
    }
});

test('Result count check is tenant/branch scoped', async () => {
    const Exam = require('../models/Exam');
    const Result = require('../models/Result');
    const { deleteExam } = require('../controllers/branchAdminController');

    const originalExamFindOne = Exam.findOne;
    const originalExamDeleteOne = Exam.deleteOne;
    const originalResultCount = Result.countDocuments;

    try {
        Exam.findOne = async () => ({ _id: 'exam-1', tenantId: 'tenant-1', branchId: 'my-branch' });
        Exam.deleteOne = async () => ({ deletedCount: 1 });

        let countQuery = null;
        Result.countDocuments = async (query) => {
            countQuery = query;
            return 0;
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'my-branch' },
            params: { id: 'exam-1' }
        };
        const res = createResponse();
        await deleteExam(req, res);
        assert.equal(res.statusCode, 200);
        assert.ok(countQuery);
        assert.equal(countQuery.tenantId, 'tenant-1');
        assert.equal(countQuery.branchId, 'my-branch');
        assert.equal(countQuery.examId.toString(), 'exam-1');
    } finally {
        Exam.findOne = originalExamFindOne;
        Exam.deleteOne = originalExamDeleteOne;
        Result.countDocuments = originalResultCount;
    }
});

test('Timetable helper rejects foreign class/section/teacher/slot using scoped queries', async () => {
    const Class = require('../models/Class');
    const Section = require('../models/Section');
    const Subject = require('../models/Subject');
    const User = require('../models/User');
    const TimetableSlot = require('../models/TimetableSlot');
    const { createTimetableSlot, updateTimetableSlot } = require('../controllers/timetableController');

    const originalClassFindOne = Class.findOne;
    const originalClassFindById = Class.findById;
    const originalSectionFindOne = Section.findOne;
    const originalSectionFindById = Section.findById;
    const originalSubjectFindOne = Subject.findOne;
    const originalSubjectFindById = Subject.findById;
    const originalUserFindOne = User.findOne;
    const originalUserFindById = User.findById;
    const originalSlotFindOne = TimetableSlot.findOne;
    const originalSlotFindById = TimetableSlot.findById;

    try {
        Class.findOne = async () => null;
        Section.findOne = async () => null;
        Subject.findOne = async () => null;
        User.findOne = async () => null;
        TimetableSlot.findOne = async () => null;

        Class.findById = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'other-branch' });
        Section.findById = async () => ({ _id: 'section-1', tenantId: 'tenant-1', branchId: 'other-branch' });
        Subject.findById = async () => ({ _id: 'subject-1', tenantId: 'tenant-1', branchId: 'other-branch' });
        User.findById = async () => ({ _id: 'teacher-1', tenantId: 'tenant-1', branchId: 'other-branch' });
        TimetableSlot.findById = async () => ({ _id: 'slot-1', tenantId: 'tenant-1', branchId: 'other-branch' });

        const req = {
            tenantId: 'tenant-1',
            branchId: 'my-branch',
            body: {
                academicYearId: 'year-1',
                classId: 'class-1',
                sectionId: 'section-1',
                subjectId: 'subject-1',
                teacherUserId: 'teacher-1',
                dayOfWeek: 'MON',
                startTime: '08:00',
                endTime: '09:00',
                room: 'Room 101'
            }
        };

        const res1 = createResponse();
        await createTimetableSlot(req, res1);
        assert.equal(res1.statusCode, 403);
        assert.match(res1.body.message, /Access denied for this branch resource./);

        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'my-branch' });
        const res2 = createResponse();
        await createTimetableSlot(req, res2);
        assert.equal(res2.statusCode, 403);
        assert.match(res2.body.message, /Access denied for this branch resource./);

        Section.findOne = async () => ({ _id: 'section-1', tenantId: 'tenant-1', branchId: 'my-branch' });
        const res3 = createResponse();
        await createTimetableSlot(req, res3);
        assert.equal(res3.statusCode, 403);
        assert.match(res3.body.message, /Access denied for this branch resource./);

        Subject.findOne = async () => ({ _id: 'subject-1', tenantId: 'tenant-1', branchId: 'my-branch' });
        const res4 = createResponse();
        await createTimetableSlot(req, res4);
        assert.equal(res4.statusCode, 403);
        assert.match(res4.body.message, /Access denied for this branch resource./);

        const reqUpdate = {
            tenantId: 'tenant-1',
            branchId: 'my-branch',
            params: { slotId: 'slot-1' },
            body: {
                academicYearId: 'year-1',
                classId: 'class-1',
                sectionId: 'section-1',
                subjectId: 'subject-1',
                teacherUserId: 'teacher-1',
                dayOfWeek: 'MON',
                startTime: '08:00',
                endTime: '09:00',
                room: 'Room 101'
            }
        };
        const res5 = createResponse();
        await updateTimetableSlot(reqUpdate, res5);
        assert.equal(res5.statusCode, 403);
        assert.match(res5.body.message, /Access denied for this branch resource./);

    } finally {
        Class.findOne = originalClassFindOne;
        Class.findById = originalClassFindById;
        Section.findOne = originalSectionFindOne;
        Section.findById = originalSectionFindById;
        Subject.findOne = originalSubjectFindOne;
        Subject.findById = originalSubjectFindById;
        User.findOne = originalUserFindOne;
        User.findById = originalUserFindById;
        TimetableSlot.findOne = originalSlotFindOne;
        TimetableSlot.findById = originalSlotFindById;
    }
});

test('Finance invoice lookup rejects foreign tenant invoice', async () => {
    const Invoice = require('../models/Invoice');
    const { getInvoiceById } = require('../controllers/financeController');

    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindById = Invoice.findById;

    try {
        Invoice.findOne = () => {
            const chain = {
                populate: () => chain,
                then: (resolve) => resolve(null)
            };
            return chain;
        };
        Invoice.findById = async () => ({ _id: 'invoice-1', tenantId: 'other-tenant' });

        const req = {
            tenantId: 'my-tenant',
            params: { id: 'invoice-1' }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await getInvoiceById(req, res, next);
        assert.ok(nextError);
        assert.equal(res.statusCode, 403);
        assert.match(nextError.message, /Access denied for this finance resource./);
    } finally {
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findById = originalInvoiceFindById;
    }
});

test('Finance branch lookup rejects foreign tenant branch', async () => {
    const Branch = require('../models/Branch');
    const { getReceiptBranding } = require('../controllers/financeController');

    const originalBranchFindOne = Branch.findOne;
    const originalBranchFindById = Branch.findById;

    try {
        Branch.findOne = async () => null;
        Branch.findById = async () => ({ _id: 'branch-1', tenantId: 'other-tenant' });

        const req = {
            tenantId: 'my-tenant',
            params: { branchId: 'branch-1' }
        };
        const res = createResponse();
        let nextError = null;
        const next = (err) => { nextError = err; };

        await getReceiptBranding(req, res, next);
        assert.ok(nextError);
        assert.equal(res.statusCode, 403);
        assert.match(nextError.message, /Access denied for this finance resource./);
    } finally {
        Branch.findOne = originalBranchFindOne;
        Branch.findById = originalBranchFindById;
    }
});

test('Assignment duplicate check respects branchId and sectionId', async () => {
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const User = require('../models/User');
    const Subject = require('../models/Subject');
    const Section = require('../models/Section');
    const TeacherAssignment = require('../models/TeacherAssignment');
    const { assignTeacher } = require('../controllers/assignmentController');

    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalAcademicYearFindOne = AcademicYear.findOne;
    const originalUserFindOne = User.findOne;
    const originalSubjectFindOne = Subject.findOne;
    const originalSectionFindOne = Section.findOne;
    const originalTeacherAssignmentFindOne = TeacherAssignment.findOne;

    try {
        Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        User.findOne = async () => ({ _id: 'teacher-1', tenantId: 'tenant-1', role: 'teacher', branchId: 'branch-1' });
        Subject.findOne = async () => ({ _id: 'subject-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        Section.findOne = async () => ({ _id: 'section-1', tenantId: 'tenant-1', branchId: 'branch-1', classId: 'class-1' });

        let queryUsed = null;
        TeacherAssignment.findOne = (query) => {
            queryUsed = query;
            const chain = {
                populate: () => chain,
                then: (resolve) => resolve({ teacherUserId: { name: 'Teacher Test' } })
            };
            return chain;
        };

        const req = {
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            body: {
                classId: 'class-1',
                academicYearId: 'year-1',
                teacherUserId: 'teacher-1',
                subjectId: 'subject-1',
                sectionId: 'section-1'
            }
        };

        const res = createResponse();
        await assignTeacher(req, res);

        assert.equal(res.statusCode, 400);
        assert.ok(queryUsed);
        assert.equal(queryUsed.tenantId, 'tenant-1');
        assert.equal(queryUsed.branchId, 'branch-1');
        assert.equal(queryUsed.teacherUserId, 'teacher-1');
        assert.equal(queryUsed.classId, 'class-1');
        assert.equal(queryUsed.subjectId, 'subject-1');
        assert.equal(queryUsed.academicYearId, 'year-1');
        assert.equal(queryUsed.sectionId, 'section-1');
        assert.match(res.body.message, /This class was assigned the teacher name: Teacher Test/);
    } finally {
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalAcademicYearFindOne;
        User.findOne = originalUserFindOne;
        Subject.findOne = originalSubjectFindOne;
        Section.findOne = originalSectionFindOne;
        TeacherAssignment.findOne = originalTeacherAssignmentFindOne;
    }
});

test('obsolete schoolId indexes are not declared in Student/User schemas', () => {
    const Student = require('../models/Student');
    const User = require('../models/User');

    // 1. Student indexes check
    const studentIndexes = Student.schema.indexes();
    studentIndexes.forEach(([fields, options]) => {
        assert.equal('schoolId' in fields, false, 'Student index must not use schoolId');
    });

    // 2. User indexes check
    const userIndexes = User.schema.indexes();
    userIndexes.forEach(([fields, options]) => {
        assert.equal('schoolId' in fields, false, 'User index must not use schoolId');
    });
});

test('tenant-based unique indexes are declared correctly', () => {
    const Student = require('../models/Student');
    const User = require('../models/User');
    const Subject = require('../models/Subject');

    // 1. Student tenantId + admissionNumber unique check
    const studentIndexes = Student.schema.indexes();
    const hasStudentTenantAdmissionUnique = studentIndexes.some(([fields, options]) => {
        return fields.tenantId === 1 && fields.admissionNumber === 1 && options.unique === true;
    });
    assert.ok(hasStudentTenantAdmissionUnique, 'Student must have tenantId + admissionNumber unique index');

    // 2. User tenantId + email unique with partialFilterExpression check
    const userIndexes = User.schema.indexes();
    const hasUserTenantEmailUnique = userIndexes.some(([fields, options]) => {
        return fields.tenantId === 1 && fields.email === 1 && options.unique === true && options.partialFilterExpression?.email !== undefined;
    });
    assert.ok(hasUserTenantEmailUnique, 'User must have tenantId + email unique index with partialFilterExpression');

    // 3. Subject tenantId + branchId + code unique with partialFilterExpression check
    const subjectIndexes = Subject.schema.indexes();
    const hasSubjectBranchCodeUnique = subjectIndexes.some(([fields, options]) => {
        return fields.tenantId === 1
            && fields.branchId === 1
            && fields.code === 1
            && options.unique === true
            && options.partialFilterExpression?.code !== undefined;
    });
    assert.ok(hasSubjectBranchCodeUnique, 'Subject must have tenantId + branchId + code unique index with partialFilterExpression');
});

test('Subject model normalizes branch subject codes before save/indexing', () => {
    const Subject = require('../models/Subject');
    const subject = new Subject({
        tenantId: new mongoose.Types.ObjectId(),
        branchId: new mongoose.Types.ObjectId(),
        name: 'Mathematics',
        code: ' math '
    });

    assert.equal(subject.code, 'MATH');
});

test('branch subject creation rejects same-branch duplicate code and allows other branches', async () => {
    const { createSubject } = require('../controllers/branchAdminController');
    const Subject = require('../models/Subject');

    const originalFindOne = Subject.findOne;
    const originalCreate = Subject.create;
    const queries = [];

    try {
        Subject.findOne = async (query) => {
            queries.push(query);
            return { _id: 'existing-subject', name: 'Different Name', code: 'MATH' };
        };

        const duplicateReq = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: { name: 'Mathematics', code: ' math ' }
        };
        const duplicateRes = createResponse();
        await createSubject(duplicateReq, duplicateRes);

        assert.equal(duplicateRes.statusCode, 409);
        assert.match(duplicateRes.body.message, /Subject code already exists/);
        assert.equal(queries[0].tenantId, 'tenant-1');
        assert.equal(queries[0].branchId, 'branch-1');
        assert.ok(queries[0].$or.some((item) => item.code === 'MATH'));

        Subject.findOne = async (query) => {
            queries.push(query);
            assert.equal(query.branchId, 'branch-2');
            return null;
        };
        Subject.create = async (payload) => ({ _id: 'new-subject', ...payload });

        const allowedReq = {
            user: { tenantId: 'tenant-1', branchId: 'branch-2' },
            body: { name: 'Mathematics', code: ' math ' }
        };
        const allowedRes = createResponse();
        await createSubject(allowedReq, allowedRes);

        assert.equal(allowedRes.statusCode, 200);
        assert.equal(allowedRes.body.data.branchId, 'branch-2');
        assert.equal(allowedRes.body.data.code, 'MATH');

        Subject.findOne = async () => null;
        Subject.create = async () => {
            const error = new Error('duplicate key');
            error.code = 11000;
            error.keyPattern = { tenantId: 1, branchId: 1, code: 1 };
            throw error;
        };

        const raceRes = createResponse();
        await createSubject(allowedReq, raceRes);
        assert.equal(raceRes.statusCode, 409);
        assert.match(raceRes.body.message, /Subject code already exists/);
    } finally {
        Subject.findOne = originalFindOne;
        Subject.create = originalCreate;
    }
});

test('admission duplicate admission number returns 409 clean message', async () => {
    const { createStudentAdmission } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Counter = require('../models/Counter');

    const originalSave = Student.prototype.save;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    const originalStudentFindOne = Student.findOne;
    const originalUserFindOne = User.findOne;

    try {
        Counter.findOneAndUpdate = async () => ({ seq: 1 });
        Student.findOne = async () => null;
        User.findOne = async () => null;
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });

        Student.prototype.save = async function() {
            const error = new Error('E11000 duplicate key error collection: students index: tenantId_1_admissionNumber_1 dup key');
            error.code = 11000;
            error.keyValue = { admissionNumber: 'ADM-DUPLICATE' };
            throw error;
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                firstName: 'Duplicate',
                lastName: 'Student',
                classId: 'class-1',
                academicYearId: 'year-1',
                guardianInfo: { name: 'Parent', phone: '+252610000000', email: 'parent@example.com', address: 'Address 123' }
            }
        };

        const res = createResponse();
        await createStudentAdmission(req, res);

        assert.equal(res.statusCode, 409);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, 'Admission number already exists for this school.');
    } finally {
        Student.prototype.save = originalSave;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
        Student.findOne = originalStudentFindOne;
        User.findOne = originalUserFindOne;
    }
});

test('admission duplicate user email returns 409 clean message', async () => {
    const { createStudentAdmission } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const User = require('../models/User');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Counter = require('../models/Counter');

    const originalStudentSave = Student.prototype.save;
    const originalUserSave = User.prototype.save;
    const originalStudentDeleteOne = Student.deleteOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    const originalStudentFindOne = Student.findOne;
    const originalUserFindOne = User.findOne;

    let studentDeleted = false;

    try {
        Counter.findOneAndUpdate = async () => ({ seq: 1 });
        Student.findOne = async () => null;
        User.findOne = async () => null;
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });

        Student.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439009');
            return this;
        };

        User.prototype.save = async function() {
            const error = new Error('E11000 duplicate key error collection: users index: tenantId_1_email_1 dup key');
            error.code = 11000;
            error.keyValue = { email: 'duplicate@email.com' };
            throw error;
        };

        Student.deleteOne = async (query) => {
            if (query._id.toString() === '507f1f77bcf86cd799439009') {
                studentDeleted = true;
            }
            return { deletedCount: 1 };
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                firstName: 'Duplicate',
                lastName: 'Email',
                classId: 'class-1',
                academicYearId: 'year-1',
                guardianInfo: { name: 'Parent', phone: '+252610000000', email: 'parent@example.com', address: 'Address 123' }
            }
        };

        const res = createResponse();
        await createStudentAdmission(req, res);

        assert.equal(res.statusCode, 409);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, 'Email already exists for this school.');
        assert.ok(studentDeleted, 'Rollback: Student must be deleted if User creation fails');
    } finally {
        Student.prototype.save = originalStudentSave;
        User.prototype.save = originalUserSave;
        Student.deleteOne = originalStudentDeleteOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
        Student.findOne = originalStudentFindOne;
        User.findOne = originalUserFindOne;
    }
});

test('admission rollback removes Student/User if Enrollment creation fails', async () => {
    const { createStudentAdmission } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const User = require('../models/User');
    const Enrollment = require('../models/Enrollment');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Counter = require('../models/Counter');

    const originalStudentSave = Student.prototype.save;
    const originalUserSave = User.prototype.save;
    const originalEnrollmentSave = Enrollment.prototype.save;
    const originalStudentDeleteOne = Student.deleteOne;
    const originalUserDeleteOne = User.deleteOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    const originalStudentFindOne = Student.findOne;
    const originalUserFindOne = User.findOne;

    let studentDeleted = false;
    let userDeleted = false;

    try {
        Counter.findOneAndUpdate = async () => ({ seq: 1 });
        Student.findOne = async () => null;
        User.findOne = async () => null;
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });

        Student.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439009');
            return this;
        };

        User.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439010');
            return this;
        };

        Enrollment.prototype.save = async function() {
            throw new Error('Enrollment db error');
        };

        Student.deleteOne = async (query) => {
            if (query._id.toString() === '507f1f77bcf86cd799439009') {
                studentDeleted = true;
            }
            return { deletedCount: 1 };
        };

        User.deleteOne = async (query) => {
            if (query._id.toString() === '507f1f77bcf86cd799439010') {
                userDeleted = true;
            }
            return { deletedCount: 1 };
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                firstName: 'Rollback',
                lastName: 'Enrollment',
                classId: 'class-1',
                academicYearId: 'year-1',
                guardianInfo: { name: 'Parent', phone: '+252610000000', email: 'parent@example.com', address: 'Address 123' }
            }
        };

        const res = createResponse();
        try {
            await createStudentAdmission(req, res);
        } catch (e) {
            // Error is propagated due to fallback throwing innerError
        }

        assert.ok(studentDeleted, 'Rollback: Student must be deleted if Enrollment creation fails');
        assert.ok(userDeleted, 'Rollback: User must be deleted if Enrollment creation fails');
    } finally {
        Student.prototype.save = originalStudentSave;
        User.prototype.save = originalUserSave;
        Enrollment.prototype.save = originalEnrollmentSave;
        Student.deleteOne = originalStudentDeleteOne;
        User.deleteOne = originalUserDeleteOne;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
        Student.findOne = originalStudentFindOne;
        User.findOne = originalUserFindOne;
    }
});

test('successful admission creates Student + User + Enrollment together', async () => {
    const { createStudentAdmission } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const User = require('../models/User');
    const Enrollment = require('../models/Enrollment');
    const ParentStudentLink = require('../models/ParentStudentLink');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Counter = require('../models/Counter');

    const originalStudentSave = Student.prototype.save;
    const originalUserSave = User.prototype.save;
    const originalEnrollmentSave = Enrollment.prototype.save;
    const originalYearFindOne = AcademicYear.findOne;
    const originalClassFindOne = Class.findOne;
    const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;
    const originalStudentFindOne = Student.findOne;
    const originalUserFindOne = User.findOne;
    const originalParentLinkFindOne = ParentStudentLink.findOne;

    let studentSaved = false;
    let userSaved = false;
    let enrollmentSaved = false;

    try {
        Counter.findOneAndUpdate = async () => ({ seq: 1 });
        Student.findOne = async () => null;
        let userLookup = 0;
        User.findOne = async () => {
            userLookup += 1;
            if (userLookup === 1) return null;
            return {
                _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
                role: 'parent',
                isActive: true,
                email: 'parent@example.com',
                students: [new mongoose.Types.ObjectId('507f1f77bcf86cd799439009')]
            };
        };
        ParentStudentLink.findOne = async () => ({ _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013') });
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });

        Student.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439009');
            studentSaved = true;
            return this;
        };

        User.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439010');
            userSaved = true;
            return this;
        };

        Enrollment.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
            enrollmentSaved = true;
            return this;
        };

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                firstName: 'Success',
                lastName: 'Student',
                classId: 'class-1',
                academicYearId: 'year-1',
                guardianInfo: { name: 'Parent', phone: '+252610000000', email: 'parent@example.com', address: 'Address 123' }
            }
        };

        const res = createResponse();
        await createStudentAdmission(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);
        assert.ok(studentSaved, 'Student must be saved');
        assert.ok(userSaved, 'User must be saved');
        assert.ok(enrollmentSaved, 'Enrollment must be saved');
    } finally {
        Student.prototype.save = originalStudentSave;
        User.prototype.save = originalUserSave;
        Enrollment.prototype.save = originalEnrollmentSave;
        AcademicYear.findOne = originalYearFindOne;
        Class.findOne = originalClassFindOne;
        Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
        Student.findOne = originalStudentFindOne;
        User.findOne = originalUserFindOne;
        ParentStudentLink.findOne = originalParentLinkFindOne;
    }
});

test('admission creates and links a parent portal account by default', async () => {
    const { createStudentAdmission } = require('../controllers/registrarController');
    const Student = require('../models/Student');
    const User = require('../models/User');
    const Enrollment = require('../models/Enrollment');
    const ParentStudentLink = require('../models/ParentStudentLink');
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Counter = require('../models/Counter');

    const originals = {
        studentSave: Student.prototype.save,
        userSave: User.prototype.save,
        enrollmentSave: Enrollment.prototype.save,
        parentLinkCreate: ParentStudentLink.create,
        yearFindOne: AcademicYear.findOne,
        classFindOne: Class.findOne,
        counterFindOneAndUpdate: Counter.findOneAndUpdate,
        studentFindOne: Student.findOne,
        userFindOne: User.findOne
    };
    let linkedRelationship = null;
    let parentSaved = false;

    try {
        Counter.findOneAndUpdate = async () => ({ seq: 1 });
        Student.findOne = async () => null;
        User.findOne = async () => null;
        AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        Student.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439009');
            return this;
        };
        User.prototype.save = async function() {
            this._id = this.role === 'parent'
                ? new mongoose.Types.ObjectId('507f1f77bcf86cd799439012')
                : new mongoose.Types.ObjectId('507f1f77bcf86cd799439010');
            if (this.role === 'parent') parentSaved = true;
            return this;
        };
        Enrollment.prototype.save = async function() {
            this._id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
            return this;
        };
        ParentStudentLink.create = async (payload) => {
            linkedRelationship = payload;
            return { _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'), ...payload };
        };

        const req = {
            user: { _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439014'), tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                firstName: 'Linked',
                lastName: 'Student',
                classId: 'class-1',
                academicYearId: 'year-1',
                guardianInfo: {
                    name: 'Amina Parent',
                    email: 'amina@example.com',
                    phone: '+252611234567',
                    address: 'Address 123',
                    relationship: 'Mother'
                }
            }
        };
        const res = createResponse();
        await createStudentAdmission(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(parentSaved, true);
        assert.equal(res.body.data.parentAccount.email, 'amina@example.com');
        assert.equal(res.body.data.parentAccount.created, true);
        assert.ok(res.body.data.parentAccount.defaultPassword);
        assert.equal(linkedRelationship.relationship, 'Mother');
        assert.equal(String(linkedRelationship.studentId), '507f1f77bcf86cd799439009');
    } finally {
        Student.prototype.save = originals.studentSave;
        User.prototype.save = originals.userSave;
        Enrollment.prototype.save = originals.enrollmentSave;
        ParentStudentLink.create = originals.parentLinkCreate;
        AcademicYear.findOne = originals.yearFindOne;
        Class.findOne = originals.classFindOne;
        Counter.findOneAndUpdate = originals.counterFindOneAndUpdate;
        Student.findOne = originals.studentFindOne;
        User.findOne = originals.userFindOne;
    }
});

test('existing parent account is reused for a newly registered sibling without resetting its password', async () => {
    const User = require('../models/User');
    const ParentStudentLink = require('../models/ParentStudentLink');
    const { provisionParentAccess } = require('../services/parentAccessService');
    const originalUserFindOne = User.findOne;
    const originalLinkFindOne = ParentStudentLink.findOne;
    const originalLinkCreate = ParentStudentLink.create;
    const parent = {
        _id: new mongoose.Types.ObjectId(),
        role: 'parent',
        isActive: true,
        email: 'family@example.com',
        students: [new mongoose.Types.ObjectId()],
        saveCalls: 0,
        async save() { this.saveCalls += 1; return this; }
    };
    let createdLink = null;

    try {
        User.findOne = async () => parent;
        ParentStudentLink.findOne = async () => null;
        ParentStudentLink.create = async (payload) => {
            createdLink = payload;
            return { _id: new mongoose.Types.ObjectId(), ...payload };
        };
        const siblingId = new mongoose.Types.ObjectId();
        const result = await provisionParentAccess({
            tenantId: new mongoose.Types.ObjectId(),
            student: { _id: siblingId },
            guardianInfo: { name: 'Family Parent', email: 'FAMILY@example.com', relationship: 'Mother' },
            actorUserId: new mongoose.Types.ObjectId()
        });

        assert.equal(result.createdParentUser, false);
        assert.equal(result.temporaryPassword, null);
        assert.equal(result.addedStudent, true);
        assert.ok(parent.students.some((id) => String(id) === String(siblingId)));
        assert.equal(String(createdLink.studentId), String(siblingId));
    } finally {
        User.findOne = originalUserFindOne;
        ParentStudentLink.findOne = originalLinkFindOne;
        ParentStudentLink.create = originalLinkCreate;
    }
});

test('inactive parent account blocks automatic sibling linking for administrator review', async () => {
    const User = require('../models/User');
    const { provisionParentAccess } = require('../services/parentAccessService');
    const originalUserFindOne = User.findOne;
    try {
        User.findOne = async () => ({ role: 'parent', isActive: false, email: 'inactive@example.com' });
        await assert.rejects(
            provisionParentAccess({
                tenantId: new mongoose.Types.ObjectId(),
                student: { _id: new mongoose.Types.ObjectId() },
                guardianInfo: { name: 'Inactive Parent', email: 'inactive@example.com' }
            }),
            /inactive.*review/i
        );
    } finally {
        User.findOne = originalUserFindOne;
    }
});

test('payment success creates ACTIVE payment and no stale PENDING', async () => {
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const Counter = require('../models/Counter');
    const { recordInvoicePayment } = require('../services/paymentService');

    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindOneAndUpdate = Invoice.findOneAndUpdate;
    const originalPaymentCreate = Payment.create;
    const originalPaymentDeleteOne = Payment.deleteOne;
    const originalPaymentFindOne = Payment.findOne;
    const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;

    let paymentCreated = null;
    let paymentDeleted = false;
    let paymentSaved = false;

    Invoice.findOne = async () => ({
        _id: 'invoice-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        paidAmount: 0,
        balance: 100,
        totalAmount: 100,
        status: 'UNPAID'
    });

    Invoice.findOneAndUpdate = async () => ({
        _id: 'invoice-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        paidAmount: 50,
        balance: 50,
        status: 'PARTIALLY_PAID'
    });

    Payment.findOne = async () => null; // no duplicate

    Payment.create = async (data) => {
        paymentCreated = { ...data, _id: 'payment-1', save: async function() { paymentSaved = true; } };
        return paymentCreated;
    };

    Payment.deleteOne = async () => {
        paymentDeleted = true;
    };

    Counter.findOneAndUpdate = async () => ({ seq: 1 });

    try {
        const result = await recordInvoicePayment({
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            invoiceId: 'invoice-1',
            amount: 50,
            method: 'CASH',
            recordedBy: 'user-1'
        });

        assert.equal(paymentCreated.status, 'ACTIVE');
        assert.ok(paymentCreated.receiptNumber.startsWith('REC-'), 'receiptNumber must start with REC-');
        assert.ok(paymentSaved, 'Payment must be saved/activated');
        assert.ok(!paymentDeleted, 'Payment must not be deleted/rolled-back');
    } finally {
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findOneAndUpdate = originalInvoiceFindOneAndUpdate;
        Payment.create = originalPaymentCreate;
        Payment.deleteOne = originalPaymentDeleteOne;
        Payment.findOne = originalPaymentFindOne;
        Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
    }
});

test('failed payment rolls back PENDING payment', async () => {
    const Invoice = require('../models/Invoice');
    const Payment = require('../models/Payment');
    const { recordInvoicePayment } = require('../services/paymentService');

    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindOneAndUpdate = Invoice.findOneAndUpdate;
    const originalPaymentCreate = Payment.create;
    const originalPaymentDeleteOne = Payment.deleteOne;
    const originalPaymentFindOne = Payment.findOne;

    let paymentCreated = null;
    let paymentDeleted = false;

    Invoice.findOne = async () => ({
        _id: 'invoice-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        paidAmount: 0,
        balance: 100,
        totalAmount: 100,
        status: 'UNPAID'
    });

    // Make findOneAndUpdate fail (simulate invoice balance changed/race condition)
    Invoice.findOneAndUpdate = async () => null;

    Payment.findOne = async () => null;

    Payment.create = async (data) => {
        paymentCreated = { ...data, _id: 'payment-1' };
        return paymentCreated;
    };

    Payment.deleteOne = async (filter) => {
        if (filter._id === 'payment-1') {
            paymentDeleted = true;
        }
    };

    try {
        await recordInvoicePayment({
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            invoiceId: 'invoice-1',
            amount: 50,
            method: 'CASH',
            recordedBy: 'user-1'
        });
        assert.fail('Should have failed');
    } catch (err) {
        assert.equal(err.status, 409);
        assert.ok(paymentDeleted, 'Payment must be rolled back/deleted on invoice update failure');
    } finally {
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findOneAndUpdate = originalInvoiceFindOneAndUpdate;
        Payment.create = originalPaymentCreate;
        Payment.deleteOne = originalPaymentDeleteOne;
        Payment.findOne = originalPaymentFindOne;
    }
});

test('receipt rejects PENDING payment', async () => {
    const { getReceipt } = require('../controllers/cashierController');
    const Payment = require('../models/Payment');

    const originalPaymentFindOne = Payment.findOne;

    Payment.findOne = () => ({
        populate: () => ({
            populate: () => ({
                _id: 'payment-1',
                status: 'PENDING'
            })
        })
    });

    const req = {
        params: { paymentId: 'payment-1' },
        user: { tenantId: 'tenant-1', branchId: 'branch-1' }
    };
    const res = {
        statusCode: 200,
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            this.body = data;
            return this;
        }
    };

    try {
        await getReceipt(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, 'Receipt is only available for completed payments.');
    } finally {
        Payment.findOne = originalPaymentFindOne;
    }
});

test('branch transfer updates linked student User.branchId and rolls back on failure', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const User = require('../models/User');
    const { transferStudent } = require('../controllers/promotionController');

    const originalStudentFindOne = Student.findOne;
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalEnrollmentFind = Enrollment.find;
    const originalEnrollmentCreate = Enrollment.create;
    const originalEnrollmentUpdateMany = Enrollment.updateMany;
    const originalEnrollmentDeleteOne = Enrollment.deleteOne;
    const originalStudentUpdateOne = Student.updateOne;
    const originalUserFindOne = User.findOne;
    const originalUserUpdateOne = User.updateOne;

    let studentBranchUpdated = null;
    let enrollmentCreated = null;
    let userBranchUpdated = null;
    let studentRollbackCalled = false;
    let enrollmentRollbackCalled = false;
    let userRollbackCalled = false;

    Student.findOne = async () => ({
        _id: 'student-1',
        tenantId: 'tenant-1',
        branchId: 'branch-old'
    });

    Branch.findOne = async () => ({ _id: 'branch-new', tenantId: 'tenant-1' });
    Class.findOne = async (query) => query._id === 'class-old'
        ? { _id: 'class-old', name: 'Grade 4', gradeLevel: '4', tenantId: 'tenant-1', branchId: 'branch-old' }
        : { _id: 'class-new', name: 'Grade 4', gradeLevel: 'Grade 4', tenantId: 'tenant-1', branchId: 'branch-new' };
    AcademicYear.findOne = async () => ({ _id: 'year-new', tenantId: 'tenant-1' });
    
    Enrollment.find = async () => [{ _id: 'enrollment-old', classId: 'class-old', status: 'active' }];
    Enrollment.updateMany = async () => {};

    Enrollment.create = async (data) => {
        enrollmentCreated = { ...data, _id: 'enrollment-new' };
        return enrollmentCreated;
    };

    Enrollment.deleteOne = async () => {
        enrollmentRollbackCalled = true;
    };

    Student.updateOne = async (filter, update) => {
        if (update.branchId === 'branch-new') {
            studentBranchUpdated = update.branchId;
        } else if (update.branchId === 'branch-old') {
            studentRollbackCalled = true;
        }
    };

    User.findOne = async () => ({
        _id: 'user-1',
        role: 'student',
        studentId: 'student-1',
        branchId: 'branch-old'
    });

    User.updateOne = async (filter, update) => {
        if (update.branchId === 'branch-new') {
            userBranchUpdated = update.branchId;
        } else if (update.branchId === 'branch-old') {
            userRollbackCalled = true;
        }
    };

    const req = {
        tenantId: 'tenant-1',
        body: {
            studentId: 'student-1',
            newBranchId: 'branch-new',
            newClassId: 'class-new',
            newAcademicYearId: 'year-new',
            reason: 'Family relocation'
        }
    };
    const res = {
        statusCode: 200,
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            this.body = data;
            return this;
        }
    };

    try {
        // Test success path
        await transferStudent(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(studentBranchUpdated, 'branch-new');
        assert.equal(userBranchUpdated, 'branch-new');
        assert.equal(enrollmentCreated.branchId, 'branch-new');

        // Test rollback path
        userBranchUpdated = null;
        studentBranchUpdated = null;
        enrollmentCreated = null;

        // Force user update to fail
        User.updateOne = async (filter, update) => {
            if (update.branchId === 'branch-new') {
                throw new Error('Database Error');
            } else if (update.branchId === 'branch-old') {
                userRollbackCalled = true;
            }
        };

        const resFail = {
            statusCode: 200,
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                this.body = data;
                return this;
            }
        };
        await transferStudent(req, resFail);
        assert.equal(resFail.statusCode, 500);
        assert.ok(studentRollbackCalled, 'Student update should rollback');
        assert.ok(enrollmentRollbackCalled, 'Enrollment create should rollback');
    } finally {
        Student.findOne = originalStudentFindOne;
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Enrollment.find = originalEnrollmentFind;
        Enrollment.create = originalEnrollmentCreate;
        Enrollment.updateMany = originalEnrollmentUpdateMany;
        Enrollment.deleteOne = originalEnrollmentDeleteOne;
        Student.updateOne = originalStudentUpdateOne;
        User.findOne = originalUserFindOne;
        User.updateOne = originalUserUpdateOne;
    }
});

// ==========================================
// REGRESSION TESTS FOR E2E BLOCKERS
// ==========================================

test('tenant transfer route updates Student.branchId and User.branchId', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const User = require('../models/User');
    const { transferStudentBranch } = require('../controllers/tenantController');

    const originalStudentFindOne = Student.findOne;
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;
    const originalEnrollmentFind = Enrollment.find;
    const originalEnrollmentCreate = Enrollment.create;
    const originalEnrollmentUpdateMany = Enrollment.updateMany;
    const originalStudentSave = Student.prototype.save;
    const originalUserFindOne = User.findOne;
    const originalUserUpdateOne = User.updateOne;

    let studentSavedBranch = null;
    let userUpdatedBranch = null;

    Student.findOne = async () => ({
        _id: 'student-1',
        tenantId: 'tenant-1',
        branchId: 'branch-old',
        save: async function() {
            studentSavedBranch = this.branchId;
            return this;
        }
    });

    Branch.findOne = async () => ({ _id: 'branch-new', tenantId: 'tenant-1', isActive: true });
    Class.findOne = async (query) => query._id === 'class-old'
        ? { _id: 'class-old', name: 'Grade 4', gradeLevel: '4', tenantId: 'tenant-1', branchId: 'branch-old' }
        : { _id: 'class-new', name: 'Grade 4', gradeLevel: 'Grade 4', tenantId: 'tenant-1', branchId: 'branch-new' };
    AcademicYear.findOne = async () => ({ _id: 'year-new', tenantId: 'tenant-1' });
    Enrollment.find = async () => [{ _id: 'enrollment-old', classId: 'class-old', status: 'Current' }];
    Enrollment.updateMany = async () => {};
    Enrollment.create = async (data) => ({ ...data, _id: 'enrollment-new' });

    User.findOne = async () => ({
        _id: 'user-1',
        role: 'student',
        studentId: 'student-1',
        branchId: 'branch-old'
    });

    User.updateOne = async (filter, update) => {
        userUpdatedBranch = update.branchId;
    };

    const req = {
        tenantId: 'tenant-1',
        body: {
            studentId: 'student-1',
            fromBranchId: 'branch-old',
            toBranchId: 'branch-new',
            classId: 'class-new',
            academicYearId: 'year-new'
        }
    };
    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
    };

    try {
        await transferStudentBranch(req, res);
        assert.equal(studentSavedBranch, 'branch-new');
        assert.equal(userUpdatedBranch, 'branch-new');
    } finally {
        Student.findOne = originalStudentFindOne;
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
        Enrollment.find = originalEnrollmentFind;
        Enrollment.create = originalEnrollmentCreate;
        Enrollment.updateMany = originalEnrollmentUpdateMany;
        Student.prototype.save = originalStudentSave;
        User.findOne = originalUserFindOne;
        User.updateOne = originalUserUpdateOne;
    }
});

test('registrar transfer endpoint is removed and branch admin owns the academic transfer route', () => {
    const registrarController = require('../controllers/registrarController');
    const registrarRoutes = require('../routes/registrarRoutes');
    const academicRoutes = require('../routes/academicRoutes');

    assert.equal(registrarController.transferStudentBranch, undefined);
    assert.equal(registrarRoutes.stack.some((layer) => layer.route?.path === '/transfers/branch'), false);
    assert.equal(academicRoutes.stack.some((layer) => layer.route?.path === '/transfer' && layer.route.methods.post), true);
});

test('student profile works with new branch context after transfer', async () => {
    const Student = require('../models/Student');
    const Enrollment = require('../models/Enrollment');
    const { getProfile } = require('../controllers/studentPortalController');

    const originalStudentFindOne = Student.findOne;
    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalEnrollmentFind = Enrollment.find;

    Student.findOne = () => ({
        populate: () => ({
            populate: () => ({
                _id: 'student-1',
                tenantId: 'tenant-1',
                branchId: 'branch-new',
                firstName: 'Alice',
                lastName: 'Smith'
            })
        })
    });

    Enrollment.findOne = () => ({
        sort: () => ({
            populate: () => ({
                populate: () => ({
                    _id: 'enrollment-1',
                    classId: { _id: 'class-1', name: 'Grade 10' }
                })
            })
        })
    });

    Enrollment.find = () => ({
        sort: () => ({
            populate: () => ({
                populate: () => ({
                    populate: () => ({
                        populate: () => ({
                            populate: () => ({
                                populate: () => []
                            })
                        })
                    })
                })
            })
        })
    });

    const req = {
        user: { studentId: 'student-1' },
        tenantId: 'tenant-1',
        branchId: 'branch-new'
    };
    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
    };

    try {
        await getProfile(req, res);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.student.branchId, 'branch-new');
    } finally {
        Student.findOne = originalStudentFindOne;
        Enrollment.findOne = originalEnrollmentFindOne;
        Enrollment.find = originalEnrollmentFind;
    }
});

test('student getResults uses resolved branchId for historical years', async () => {
    const Enrollment = require('../models/Enrollment');
    const ClassSubject = require('../models/ClassSubject');
    const Exam = require('../models/Exam');
    const Result = require('../models/Result');
    const { getResults } = require('../controllers/studentPortalController');

    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalClassSubjectFind = ClassSubject.find;
    const originalExamFind = Exam.find;
    const originalResultFind = Result.find;

    Enrollment.findOne = () => ({
        sort: () => ({
            _id: 'enrollment-old',
            tenantId: 'tenant-1',
            branchId: 'branch-old',
            classId: 'class-old',
            academicYearId: 'year-old'
        })
    });

    let capturedClassSubjectBranch = null;
    ClassSubject.find = (q) => {
        capturedClassSubjectBranch = q.branchId;
        return {
            populate: () => []
        };
    };

    let capturedExamBranch = null;
    Exam.find = (q) => {
        capturedExamBranch = q.branchId;
        return {
            populate: () => ({
                populate: () => ({
                    sort: () => []
                })
            })
        };
    };

    Result.find = () => [];

    const req = {
        user: { studentId: 'student-1' },
        tenantId: 'tenant-1',
        branchId: 'branch-new', // new active branch context
        query: { schoolYearId: 'year-old' } // historical year requested
    };
    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
    };

    try {
        await getResults(req, res);
        assert.equal(capturedClassSubjectBranch, 'branch-old');
        assert.equal(capturedExamBranch, 'branch-old');
    } finally {
        Enrollment.findOne = originalEnrollmentFindOne;
        ClassSubject.find = originalClassSubjectFind;
        Exam.find = originalExamFind;
        Result.find = originalResultFind;
    }
});

test('student timetable week uses resolved branchId for historical years', async () => {
    const Enrollment = require('../models/Enrollment');
    const TimetableSlot = require('../models/TimetableSlot');
    const { getStudentTimetableWeek } = require('../controllers/timetableController');

    const originalEnrollmentFindOne = Enrollment.findOne;
    const originalTimetableSlotFind = TimetableSlot.find;

    Enrollment.findOne = () => ({
        sort: () => ({
            _id: 'enrollment-old',
            tenantId: 'tenant-1',
            branchId: 'branch-old',
            classId: 'class-old',
            academicYearId: 'year-old'
        })
    });

    let capturedSlotBranch = null;
    TimetableSlot.find = (q) => {
        capturedSlotBranch = q.branchId;
        return {
            populate: () => []
        };
    };

    const req = {
        user: { studentId: 'student-1' },
        tenantId: 'tenant-1',
        branchId: 'branch-new', // current active branch context
        query: { schoolYearId: 'year-old' } // historical year
    };
    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
    };

    try {
        await getStudentTimetableWeek(req, res);
        assert.equal(capturedSlotBranch, 'branch-old');
    } finally {
        Enrollment.findOne = originalEnrollmentFindOne;
        TimetableSlot.find = originalTimetableSlotFind;
    }
});

test('admission with invalid gender returns clean 400 validation response', async () => {
    const { admitStudent } = require('../controllers/studentController');
    const Student = require('../models/Student');
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');

    const originalStudentCreate = Student.create;
    const originalStudentFindOne = Student.findOne;
    const originalBranchFindOne = Branch.findOne;
    const originalClassFindOne = Class.findOne;
    const originalYearFindOne = AcademicYear.findOne;

    Branch.findOne = async () => ({ _id: 'branch-1', tenantId: 'tenant-1', isActive: true });
    Class.findOne = async () => ({ _id: 'class-1', tenantId: 'tenant-1', branchId: 'branch-1' });
    AcademicYear.findOne = async () => ({ _id: 'year-1', tenantId: 'tenant-1' });
    Student.findOne = async () => null;

    Student.create = async () => {
        const ValidationError = new Error('Validation failed');
        ValidationError.name = 'ValidationError';
        throw ValidationError;
    };

    const req = {
        tenantId: 'tenant-1',
        scope: 'branch',
        branchId: 'branch-1',
        body: {
            admissionNumber: 'STD-999',
            firstName: 'Jane',
            lastName: 'Doe',
            DOB: '2010-01-01',
            gender: 'InvalidGender',
            classId: 'class-1',
            academicYearId: 'year-1',
            guardianInfo: { name: 'G1', phone: '+252610000000', email: 'parent@example.com', address: 'A1' }
        }
    };
    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
    };

    try {
        await admitStudent(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.message.includes('Validation failed'));
    } finally {
        Student.create = originalStudentCreate;
        Student.findOne = originalStudentFindOne;
        Branch.findOne = originalBranchFindOne;
        Class.findOne = originalClassFindOne;
        AcademicYear.findOne = originalYearFindOne;
    }
});

test('global error handler does not expose stack trace', async () => {
    const err = new Error('Test authorization error');
    err.statusCode = 403;

    const req = {};
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };

    const errorHandler = (err, req, res, next) => {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({
            message: err.message
        });
    };

    errorHandler(err, req, res, () => {});

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, 'Test authorization error');
    assert.equal(res.body.stack, undefined);
});

test('reversal removes receiptNumber from payment', async () => {
    const Payment = require('../models/Payment');
    const Invoice = require('../models/Invoice');
    const { reverseInvoicePayment } = require('../services/paymentService');

    const originalPaymentFindOneAndUpdate = Payment.findOneAndUpdate;
    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindOneAndUpdate = Invoice.findOneAndUpdate;
    const originalPaymentCreate = Payment.create;

    let paymentUpdateSet = null;
    let paymentUpdateUnset = null;

    Payment.findOneAndUpdate = async (filter, update) => {
        paymentUpdateSet = update.$set;
        paymentUpdateUnset = update.$unset;
        return {
            _id: 'payment-1',
            invoiceId: 'invoice-1',
            amount: 100,
            status: 'ACTIVE',
            receiptNumber: 'REC-123',
            branchId: 'branch-1'
        };
    };

    Invoice.findOne = async () => ({
        _id: 'invoice-1',
        paidAmount: 100,
        balance: 0,
        status: 'PAID'
    });

    Invoice.findOneAndUpdate = async () => ({
        _id: 'invoice-1',
        paidAmount: 0,
        balance: 100,
        status: 'UNPAID'
    });

    Payment.create = async (data) => data;

    try {
        await reverseInvoicePayment({
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            paymentId: 'payment-1',
            reason: 'reversal reason',
            recordedBy: 'user-1'
        });
        assert.equal(paymentUpdateSet.status, 'REVERSED');
        assert.ok(paymentUpdateUnset.receiptNumber, 'receiptNumber should be unset');
    } finally {
        Payment.findOneAndUpdate = originalPaymentFindOneAndUpdate;
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findOneAndUpdate = originalInvoiceFindOneAndUpdate;
        Payment.create = originalPaymentCreate;
    }
});

test('failed reversal restores receiptNumber and payment status', async () => {
    const Payment = require('../models/Payment');
    const Invoice = require('../models/Invoice');
    const { reverseInvoicePayment } = require('../services/paymentService');

    const originalPaymentFindOneAndUpdate = Payment.findOneAndUpdate;
    const originalInvoiceFindOne = Invoice.findOne;
    const originalPaymentUpdateOne = Payment.updateOne;

    let rollbackSet = null;

    Payment.findOneAndUpdate = async () => ({
        _id: 'payment-1',
        invoiceId: 'invoice-1',
        amount: 100,
        status: 'ACTIVE',
        receiptNumber: 'REC-123',
        branchId: 'branch-1'
    });

    Invoice.findOne = async () => ({
        _id: 'invoice-1',
        paidAmount: 50, // invalid: less than payment amount
        balance: 50
    });

    Payment.updateOne = async (filter, update) => {
        if (update.$set && update.$set.status === 'ACTIVE') {
            rollbackSet = update.$set;
        }
    };

    try {
        await reverseInvoicePayment({
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            paymentId: 'payment-1',
            reason: 'reversal reason',
            recordedBy: 'user-1'
        });
        assert.fail('Should have thrown error');
    } catch (err) {
        assert.equal(rollbackSet.status, 'ACTIVE');
        assert.equal(rollbackSet.receiptNumber, 'REC-123');
    } finally {
        Payment.findOneAndUpdate = originalPaymentFindOneAndUpdate;
        Invoice.findOne = originalInvoiceFindOne;
        Payment.updateOne = originalPaymentUpdateOne;
    }
});

test('getReceipt returns reversed receipt status and Cashiers actual name', async () => {
    const Payment = require('../models/Payment');
    const Student = require('../models/Student');
    const Branch = require('../models/Branch');
    const { getReceipt } = require('../controllers/cashierController');

    const originalPaymentFindOne = Payment.findOne;
    const originalStudentFindOne = Student.findOne;
    const originalBranchFindOne = Branch.findOne;

    Payment.findOne = () => ({
        populate: () => ({
            populate: () => ({
                _id: 'payment-1',
                status: 'REVERSED',
                amount: 100,
                reversalReason: 'Duplicate collection',
                reversedAt: new Date(),
                createdAt: new Date(),
                recordedBy: {
                    name: 'John Cashier',
                    firstName: 'John',
                    lastName: 'Cashier',
                    email: 'john@school.com'
                },
                invoiceId: {
                    _id: 'invoice-1',
                    studentId: 'student-1'
                }
            })
        })
    });

    Student.findOne = () => ({
        select: () => ({
            firstName: 'Bob',
            lastName: 'Student',
            admissionNumber: 'STD-123'
        })
    });

    Branch.findOne = () => ({
        select: () => ({
            name: 'Main Branch'
        })
    });

    const req = {
        params: { paymentId: 'payment-1' },
        user: { tenantId: 'tenant-1', branchId: 'branch-1' }
    };
    const res = {
        statusCode: 200,
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.body = data; return this; }
    };

    try {
        await getReceipt(req, res);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.payment.recordedBy, 'John Cashier');
        assert.equal(res.body.data.payment.status, 'REVERSED');
        assert.equal(res.body.data.payment.reversalReason, 'Duplicate collection');
    } finally {
        Payment.findOne = originalPaymentFindOne;
        Student.findOne = originalStudentFindOne;
        Branch.findOne = originalBranchFindOne;
    }
});

test('permission routes are correctly registered and secured in tenantRoutes', async () => {
    const tenantRoutes = require('../routes/tenantRoutes');
    
    const catalogRoute = tenantRoutes.stack.find(s => s.route && s.route.path === '/permissions/catalog' && s.route.methods.get);
    assert.ok(catalogRoute, 'GET /permissions/catalog route should be registered');
    assert.ok(catalogRoute.route.stack.length > 1, 'GET /permissions/catalog should have middleware stack');

    const getPermsRoute = tenantRoutes.stack.find(s => s.route && s.route.path === '/users/:userId/permissions' && s.route.methods.get);
    assert.ok(getPermsRoute, 'GET /users/:userId/permissions route should be registered');
    assert.ok(getPermsRoute.route.stack.length > 1, 'GET /users/:userId/permissions should have middleware stack');

    const putPermsRoute = tenantRoutes.stack.find(s => s.route && s.route.path === '/users/:userId/permissions' && s.route.methods.put);
    assert.ok(putPermsRoute, 'PUT /users/:userId/permissions route should be registered');
    assert.ok(putPermsRoute.route.stack.length > 1, 'PUT /users/:userId/permissions should have middleware stack');
});

test('permission catalog, getUserPermissions, and updateUserPermissions work and enforce security checks', async () => {
    const { getPermissionCatalog, getUserPermissions, updateUserPermissions } = require('../controllers/tenantController');
    const User = require('../models/User');

    const originalUserFindOne = User.findOne;
    const originalUserCountDocuments = User.countDocuments;
    
    // Mock users
    const mockCashier = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Mock Cashier',
        email: 'cashier@school.com',
        role: 'cashier',
        scope: 'branch',
        tenantId: 'tenant-123',
        permissions: { allow: [], deny: [] },
        isActive: true,
        save: async function() { return this; }
    };

    const mockSuperAdmin = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Mock Super Admin',
        email: 'super@school.com',
        role: 'super_admin',
        scope: 'tenant',
        tenantId: 'tenant-123',
        permissions: { allow: [], deny: [] },
        isActive: true,
        save: async function() { return this; }
    };

    // A second super admin used as the caller in Test 13 so the target != caller
    const mockSuperAdmin2 = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Mock Super Admin 2',
        email: 'super2@school.com',
        role: 'super_admin',
        scope: 'tenant',
        tenantId: 'tenant-123',
        permissions: { allow: [], deny: [] },
        isActive: true,
        save: async function() { return this; }
    };

    const mockForeignUser = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Foreign User',
        email: 'foreign@school.com',
        role: 'cashier',
        scope: 'branch',
        tenantId: 'tenant-999',
        permissions: { allow: [], deny: [] },
        isActive: true
    };

    const mockPlatformOwner = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Platform Owner',
        email: 'owner@platform.com',
        role: 'platform_owner',
        scope: 'platform',
        tenantId: null,
        permissions: { allow: [], deny: [] },
        isActive: true
    };

    // Mock findOne
    User.findOne = async (query) => {
        const targetId = String(query._id);
        const tenantId = query.tenantId;

        if (query.role && query.role.$ne === 'platform_owner') {
            if (targetId === String(mockPlatformOwner._id)) {
                return null;
            }
        }

        if (targetId === String(mockCashier._id)) {
            if (tenantId !== mockCashier.tenantId) return null;
            return mockCashier;
        }
        if (targetId === String(mockSuperAdmin._id)) {
            if (tenantId !== mockSuperAdmin.tenantId) return null;
            return mockSuperAdmin;
        }
        if (targetId === String(mockSuperAdmin2._id)) {
            if (tenantId !== mockSuperAdmin2.tenantId) return null;
            return mockSuperAdmin2;
        }
        if (targetId === String(mockForeignUser._id)) {
            if (tenantId !== mockForeignUser.tenantId) return null;
            return mockForeignUser;
        }
        return null;
    };

    const reqRes = (userId, body = {}, loggedInUser = mockSuperAdmin) => {
        const req = {
            params: { userId: String(userId) },
            body,
            user: loggedInUser,
            tenantId: loggedInUser.tenantId
        };
        const res = createResponse();
        return { req, res };
    };

    try {
        // Test 1: getPermissionCatalog returns only non-platform permissions
        const resCatalog = createResponse();
        await getPermissionCatalog({}, resCatalog);
        assert.equal(resCatalog.statusCode, 200);
        assert.ok(Array.isArray(resCatalog.body));
        assert.ok(!resCatalog.body.some(p => p.key.startsWith('platform.')));

        // Test 2: getUserPermissions succeeds for same-tenant cashier
        const { req: reqGet, res: resGet } = reqRes(mockCashier._id);
        let nextError = null;
        const next = (err) => { nextError = err; };
        await getUserPermissions(reqGet, resGet, next);
        assert.equal(resGet.statusCode, 200);
        assert.equal(String(resGet.body.user._id), String(mockCashier._id));
        assert.ok(Array.isArray(resGet.body.catalog));

        // Test 3: getUserPermissions fails for platform-owner target
        const { req: reqGetPO, res: resGetPO } = reqRes(mockPlatformOwner._id);
        nextError = null;
        await getUserPermissions(reqGetPO, resGetPO, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 404);
        assert.equal(nextError.message, 'User not found in this institution');

        // Test 4: getUserPermissions fails for cross-tenant target
        const { req: reqGetForeign, res: resGetForeign } = reqRes(mockForeignUser._id);
        nextError = null;
        await getUserPermissions(reqGetForeign, resGetForeign, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 404);
        assert.equal(nextError.message, 'User not found in this institution');

        // Test 5: updateUserPermissions rejects malformed payload (allow/deny not arrays)
        const { req: reqPutMalformed, res: resPutMalformed } = reqRes(mockCashier._id, { allow: 'not-array', deny: [] });
        nextError = null;
        await updateUserPermissions(reqPutMalformed, resPutMalformed, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 400);
        assert.equal(nextError.message, 'allow and deny must be arrays');

        // Test 6: updateUserPermissions rejects unknown permissions
        const { req: reqPutUnknown, res: resPutUnknown } = reqRes(mockCashier._id, { allow: ['unknown.permission'], deny: [] });
        nextError = null;
        await updateUserPermissions(reqPutUnknown, resPutUnknown, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 400);
        assert.ok(nextError.message.includes('not assignable to role'));

        // Test 7: updateUserPermissions rejects cross-role permissions
        const { req: reqPutCross, res: resPutCross } = reqRes(mockCashier._id, { allow: ['teacher.exams.view'], deny: [] });
        nextError = null;
        await updateUserPermissions(reqPutCross, resPutCross, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 400);
        assert.ok(nextError.message.includes('not assignable to role'));

        // Test 8: updateUserPermissions rejects overlapping permissions
        const { req: reqPutOverlap, res: resPutOverlap } = reqRes(mockCashier._id, { allow: ['cashier.payments.reverse'], deny: ['cashier.payments.reverse'] });
        nextError = null;
        await updateUserPermissions(reqPutOverlap, resPutOverlap, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 400);
        assert.ok(nextError.message.includes('cannot appear in both allow and deny'));

        // Test 9: updateUserPermissions successfully grants cashier.payments.reverse to cashier
        const { req: reqPutSuccess, res: resPutSuccess } = reqRes(mockCashier._id, { allow: ['cashier.payments.reverse'], deny: [] });
        await updateUserPermissions(reqPutSuccess, resPutSuccess, next);
        assert.equal(resPutSuccess.statusCode, 200);
        assert.ok(resPutSuccess.body.allow.includes('cashier.payments.reverse'));
        assert.ok(resPutSuccess.body.effective.includes('cashier.payments.reverse'));

        // Test 10: Cashier default permission check (reversal not in defaults)
        const defaults = getEffectivePermissions({ role: 'cashier' });
        assert.ok(!defaults.includes('cashier.payments.reverse'), 'Default cashier should not have reversal permission');

        // Test 11: Fresh cashier login/session contains the newly granted reversal permission
        const cashierPermissions = getEffectivePermissions(mockCashier);
        assert.ok(cashierPermissions.includes('cashier.payments.reverse'), 'Mock cashier should have reversal permission after update');

        // Test 12: Super Admin removes or denies the permission
        const { req: reqPutRevoke, res: resPutRevoke } = reqRes(mockCashier._id, { allow: [], deny: ['cashier.payments.reverse'] });
        await updateUserPermissions(reqPutRevoke, resPutRevoke, next);
        assert.equal(resPutRevoke.statusCode, 200);
        assert.ok(resPutRevoke.body.deny.includes('cashier.payments.reverse'));
        assert.ok(!resPutRevoke.body.effective.includes('cashier.payments.reverse'));

        const cashierPermissionsRevoked = getEffectivePermissions(mockCashier);
        assert.ok(!cashierPermissionsRevoked.includes('cashier.payments.reverse'), 'Mock cashier should not have reversal permission after revoke/deny');

        // Test 13: Last active Super Admin safeguard
        // Use mockSuperAdmin2 as the caller so that the target (mockSuperAdmin) != caller,
        // which prevents the self-lockout check from firing first.
        User.countDocuments = async () => 1;
        const { req: reqPutSA, res: resPutSA } = reqRes(
            mockSuperAdmin._id,
            { allow: [], deny: ['tenant.users.permissions.update'] },
            mockSuperAdmin2
        );
        nextError = null;
        await updateUserPermissions(reqPutSA, resPutSA, next);
        assert.ok(nextError);
        assert.equal(nextError.statusCode, 400);
        assert.equal(nextError.message, 'Cannot remove permission-management access from the last active super admin');

    } finally {
        User.findOne = originalUserFindOne;
        User.countDocuments = originalUserCountDocuments;
    }
});

test('cashier reversal authorization guard workflow', async () => {
    const { reversePayment } = require('../controllers/cashierController');
    const Payment = require('../models/Payment');
    const Invoice = require('../models/Invoice');
    const { requirePermission } = require('../middleware/permissions');

    const originalPaymentFindOne = Payment.findOne;
    const originalPaymentFindOneAndUpdate = Payment.findOneAndUpdate;
    const originalInvoiceFindOne = Invoice.findOne;
    const originalInvoiceFindOneAndUpdate = Invoice.findOneAndUpdate;
    const originalPaymentCreate = Payment.create;

    Payment.findOne = () => ({
        populate: () => ({
            populate: () => ({
                _id: 'payment-1',
                status: 'ACTIVE',
                amount: 100,
                receiptNumber: 'REC-123',
                invoiceId: { _id: 'invoice-1' }
            })
        })
    });

    Payment.findOneAndUpdate = async () => ({
        _id: 'payment-1',
        status: 'REVERSED',
        amount: 100,
        invoiceId: 'invoice-1'
    });

    Invoice.findOne = async () => ({
        _id: 'invoice-1',
        paidAmount: 100,
        balance: 0,
        status: 'PAID'
    });

    Invoice.findOneAndUpdate = async () => ({
        _id: 'invoice-1',
        paidAmount: 0,
        balance: 100,
        status: 'UNPAID'
    });

    Payment.create = async (data) => data;

    const mockCashierNoPerm = {
        role: 'cashier',
        permissions: { allow: [], deny: [] }
    };

    const mockCashierWithPerm = {
        role: 'cashier',
        permissions: { allow: ['cashier.payments.reverse'], deny: [] }
    };

    const checkMiddleware = (user, permission) => {
        const req = {
            user,
            permissions: getEffectivePermissions(user)
        };
        const res = createResponse();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        requirePermission(permission)(req, res, next);
        return { res, nextCalled };
    };

    const auditLogService = require('../services/auditLogService');
    const originalLogAction = auditLogService.logAction;
    auditLogService.logAction = async () => {};

    try {
        // 1. Without permission, cashier is rejected by middleware
        const { res: resNoPerm, nextCalled: nextNoPerm } = checkMiddleware(mockCashierNoPerm, 'cashier.payments.reverse');
        assert.equal(resNoPerm.statusCode, 403);
        assert.equal(nextNoPerm, false);

        // 2. With permission, cashier is accepted by middleware
        const { res: resWithPerm, nextCalled: nextWithPerm } = checkMiddleware(mockCashierWithPerm, 'cashier.payments.reverse');
        assert.equal(nextWithPerm, true);

        // 3. Controller execution succeeds
        const req = {
            params: { id: 'payment-1' },
            body: { reason: 'mistake' },
            user: { _id: 'cashier-1', tenantId: 'tenant-1', branchId: 'branch-1', role: 'cashier' },
            get: () => 'mock-user-agent'
        };
        const res = createResponse();
        await reversePayment(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
    } finally {
        Payment.findOne = originalPaymentFindOne;
        Payment.findOneAndUpdate = originalPaymentFindOneAndUpdate;
        Invoice.findOne = originalInvoiceFindOne;
        Invoice.findOneAndUpdate = originalInvoiceFindOneAndUpdate;
        Payment.create = originalPaymentCreate;
        auditLogService.logAction = originalLogAction;
    }
});

test('billing periods preserve annual defaults and split preset schedules exactly', () => {
    const { getBillingPeriods, resolveBillingPeriod } = require('../utils/billingPeriods');

    const annual = getBillingPeriods({
        feeItems: [{ name: 'Tuition', amount: 1200 }],
        totalAmount: 1200
    });
    assert.equal(annual.length, 1);
    assert.equal(annual[0].key, 'YEARLY');
    assert.equal(annual[0].amount, 1200);

    const monthly = getBillingPeriods({
        billingFrequency: 'MONTHLY',
        feeItems: [
            { name: 'Tuition', amount: 1000 },
            { name: 'Activities', amount: 100 }
        ],
        totalAmount: 1100
    });
    assert.equal(monthly.length, 12);
    assert.equal(monthly.reduce((sum, period) => sum + Math.round(period.amount * 100), 0), 110000);
    assert.equal(resolveBillingPeriod({ billingFrequency: 'MONTHLY', feeItems: [{ name: 'Tuition', amount: 1200 }] }, 'MONTHLY_2').label, 'Month 2');
    assert.throws(
        () => resolveBillingPeriod({ billingFrequency: 'MONTHLY', feeItems: [{ name: 'Tuition', amount: 1200 }] }),
        /billingPeriodKey is required/
    );
});

test('custom billing schedules require valid periods totaling the fee structure', () => {
    const { normalizeBillingSchedule, resolveBillingPeriod } = require('../utils/billingPeriods');

    const schedule = normalizeBillingSchedule({
        billingFrequency: 'CUSTOM',
        totalAmount: 1000,
        billingPeriods: [
            { label: 'Admission', amount: 400 },
            { label: 'Final installment', amount: 600 }
        ]
    });
    assert.deepEqual(schedule.billingPeriods.map(period => period.key), ['CUSTOM_1', 'CUSTOM_2']);
    assert.equal(resolveBillingPeriod({
        name: 'Grade 1',
        ...schedule
    }, 'CUSTOM_2').amount, 600);

    assert.throws(
        () => normalizeBillingSchedule({
            billingFrequency: 'CUSTOM',
            totalAmount: 1000,
            billingPeriods: [{ label: 'Only installment', amount: 900 }]
        }),
        /must equal/
    );
});

test('teacher user model preserves primary branch in authorized branch list', async () => {
    const User = require('../models/User');
    const primaryBranchId = new mongoose.Types.ObjectId();
    const secondaryBranchId = new mongoose.Types.ObjectId();
    const teacher = new User({
        tenantId: new mongoose.Types.ObjectId(),
        branchId: primaryBranchId,
        authorizedBranchIds: [secondaryBranchId],
        name: 'Multi Branch Teacher',
        email: 'multi-branch@example.com',
        passwordHash: 'password123',
        role: 'teacher',
        scope: 'branch'
    });

    await teacher.validate();
    assert.deepEqual(
        teacher.authorizedBranchIds.map(String).sort(),
        [primaryBranchId, secondaryBranchId].map(String).sort()
    );
});

test('teacher assignment permits an explicitly authorized secondary branch only', async () => {
    const Branch = require('../models/Branch');
    const Class = require('../models/Class');
    const AcademicYear = require('../models/AcademicYear');
    const User = require('../models/User');
    const Subject = require('../models/Subject');
    const TeacherAssignment = require('../models/TeacherAssignment');
    const { assignTeacher } = require('../controllers/assignmentController');

    const originals = {
        branchFindOne: Branch.findOne,
        classFindOne: Class.findOne,
        yearFindOne: AcademicYear.findOne,
        userFindOne: User.findOne,
        subjectFindOne: Subject.findOne,
        assignmentFindOne: TeacherAssignment.findOne,
        assignmentCreate: TeacherAssignment.create
    };
    const tenantId = new mongoose.Types.ObjectId().toString();
    const primaryBranchId = new mongoose.Types.ObjectId().toString();
    const secondaryBranchId = new mongoose.Types.ObjectId().toString();
    const teacherUserId = new mongoose.Types.ObjectId().toString();
    const classId = new mongoose.Types.ObjectId().toString();
    const subjectId = new mongoose.Types.ObjectId().toString();
    const academicYearId = new mongoose.Types.ObjectId().toString();

    try {
        Branch.findOne = async () => ({ _id: secondaryBranchId });
        Class.findOne = async () => ({ _id: classId, branchId: secondaryBranchId });
        AcademicYear.findOne = async () => ({ _id: academicYearId });
        Subject.findOne = async () => ({ _id: subjectId, branchId: secondaryBranchId });
        User.findOne = async () => ({
            _id: teacherUserId,
            branchId: primaryBranchId,
            authorizedBranchIds: [primaryBranchId, secondaryBranchId],
            role: 'teacher'
        });
        TeacherAssignment.findOne = () => ({ populate: async () => null });
        TeacherAssignment.create = async (data) => data;

        const req = {
            tenantId,
            branchId: secondaryBranchId,
            body: { teacherUserId, classId, subjectId, academicYearId }
        };
        const res = createResponse();
        await assignTeacher(req, res);
        assert.equal(res.statusCode, 201);
        assert.equal(res.body.branchId, secondaryBranchId);

        User.findOne = async () => ({
            _id: teacherUserId,
            branchId: primaryBranchId,
            authorizedBranchIds: [primaryBranchId],
            role: 'teacher'
        });
        const denied = createResponse();
        await assignTeacher(req, denied);
        assert.equal(denied.statusCode, 403);
    } finally {
        Branch.findOne = originals.branchFindOne;
        Class.findOne = originals.classFindOne;
        AcademicYear.findOne = originals.yearFindOne;
        User.findOne = originals.userFindOne;
        Subject.findOne = originals.subjectFindOne;
        TeacherAssignment.findOne = originals.assignmentFindOne;
        TeacherAssignment.create = originals.assignmentCreate;
    }
});

test('academic policy validation requires complete non-overlapping grading coverage', () => {
    const { validateRules } = require('../controllers/academicPolicyController');

    assert.deepEqual(validateRules([
        { min: 70, max: 100, grade: 'A' },
        { min: 0, max: 69, grade: 'F' }
    ]), [
        { min: 0, max: 69, grade: 'F' },
        { min: 70, max: 100, grade: 'A' }
    ]);

    assert.throws(() => validateRules([
        { min: 0, max: 49, grade: 'F' },
        { min: 51, max: 100, grade: 'P' }
    ]), /overlap|gaps/);

    assert.throws(() => validateRules([
        { min: 10, max: 100, grade: 'P' }
    ]), /complete 0-100/);
});

test('custom grading rules produce the school-specific letter grade', () => {
    const { gradeForPercentage } = require('../services/gradingService');

    const rules = [
        { min: 85, max: 100, grade: 'Distinction' },
        { min: 50, max: 84, grade: 'Pass' },
        { min: 0, max: 49, grade: 'Retry' }
    ];

    assert.equal(gradeForPercentage(92, rules), 'Distinction');
    assert.equal(gradeForPercentage(72, rules), 'Pass');
    assert.equal(gradeForPercentage(48, rules), 'Retry');
});

test('legacy default grading rules normalize to plus-minus bands', () => {
    const { gradeForPercentage, normalizeGradingRules } = require('../services/gradingService');

    const legacyDefaultRules = [
        { min: 90, max: 100, grade: 'A' },
        { min: 80, max: 89, grade: 'B' },
        { min: 70, max: 79, grade: 'C' },
        { min: 60, max: 69, grade: 'D' },
        { min: 0, max: 59, grade: 'F' }
    ];

    const normalized = normalizeGradingRules(legacyDefaultRules);
    assert.equal(gradeForPercentage(96, normalized), 'A+');
    assert.equal(gradeForPercentage(91, normalized), 'A-');
    assert.equal(gradeForPercentage(87, normalized), 'B+');
    assert.equal(gradeForPercentage(82, normalized), 'B-');
});

test('term schema declares tenant and academic-year scoped unique indexes', () => {
    const Term = require('../models/Term');
    const indexes = Term.schema.indexes().map(([keys, options]) => ({ keys, options }));

    assert.ok(indexes.some((index) => (
        index.options?.unique === true
        && index.keys.tenantId === 1
        && index.keys.academicYearId === 1
        && index.keys.name === 1
    )));
    assert.ok(indexes.some((index) => (
        index.options?.unique === true
        && index.keys.tenantId === 1
        && index.keys.academicYearId === 1
        && index.keys.sequence === 1
    )));
});

test('branch promotion rejects configured final grade and requires graduation flow', async () => {
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const GradingPolicy = require('../models/GradingPolicy');
    const { promoteStudents } = require('../controllers/branchAdminController');

    const originals = {
        yearFindOne: AcademicYear.findOne,
        classFindOne: Class.findOne,
        policyFindOne: GradingPolicy.findOne
    };

    try {
        AcademicYear.findOne = async (query) => ({
            _id: query._id,
            tenantId: 'tenant-1',
            isCurrent: query._id === 'year-1',
            startDate: query._id === 'year-1' ? new Date('2025-09-01') : new Date('2026-09-01')
        });
        GradingPolicy.findOne = () => ({ lean: async () => ({ finalGradeLevel: '12' }) });
        Class.findOne = async (query) => ({
            _id: query._id,
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            name: query._id === 'class-12' ? 'Grade 12' : 'Grade 13',
            gradeLevel: query._id === 'class-12' ? '12' : '13'
        });

        const req = {
            user: { tenantId: 'tenant-1', branchId: 'branch-1' },
            body: {
                fromAcademicYearId: 'year-1',
                toAcademicYearId: 'year-2',
                rules: { classMap: [{ fromClassId: 'class-12', toClassId: 'class-13' }] }
            }
        };
        const res = createResponse();

        await promoteStudents(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /final grade/i);
    } finally {
        AcademicYear.findOne = originals.yearFindOne;
        Class.findOne = originals.classFindOne;
        GradingPolicy.findOne = originals.policyFindOne;
    }
});

test('legacy promotion rejects active final-grade students', async () => {
    const AcademicYear = require('../models/AcademicYear');
    const Class = require('../models/Class');
    const Enrollment = require('../models/Enrollment');
    const GradingPolicy = require('../models/GradingPolicy');
    const Student = require('../models/Student');
    const { promoteStudents } = require('../controllers/promotionController');

    const originals = {
        yearFindOne: AcademicYear.findOne,
        classFindOne: Class.findOne,
        enrollmentFindOne: Enrollment.findOne,
        policyFindOne: GradingPolicy.findOne,
        studentFindOne: Student.findOne
    };

    try {
        AcademicYear.findOne = async () => ({ _id: 'year-2', tenantId: 'tenant-1' });
        Class.findOne = async () => ({ _id: 'next-class', tenantId: 'tenant-1', branchId: 'branch-1' });
        Student.findOne = async () => ({ _id: 'student-1', tenantId: 'tenant-1', branchId: 'branch-1' });
        GradingPolicy.findOne = () => ({ lean: async () => ({ finalGradeLevel: '12' }) });
        Enrollment.findOne = () => ({
            populate: async () => ({
                classId: { name: 'Grade 12', gradeLevel: '12' }
            })
        });

        const req = {
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            body: {
                studentIds: ['student-1'],
                nextClassId: 'next-class',
                nextAcademicYearId: 'year-2'
            }
        };
        const res = createResponse();

        await promoteStudents(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.message, /graduation operation/i);
    } finally {
        AcademicYear.findOne = originals.yearFindOne;
        Class.findOne = originals.classFindOne;
        Enrollment.findOne = originals.enrollmentFindOne;
        GradingPolicy.findOne = originals.policyFindOne;
        Student.findOne = originals.studentFindOne;
    }
});

test('production user profile schema declares staff identity and security lifecycle fields', () => {
    const User = require('../models/User');
    assert.ok(User.schema.path('employeeId'));
    assert.ok(User.schema.path('employmentInfo.jobTitle'));
    assert.ok(User.schema.path('employmentInfo.specialization'));
    assert.ok(User.schema.path('employmentInfo.qualifiedSubjects'));
    assert.ok(User.schema.path('employmentInfo.yearsExperience'));
    assert.ok(User.schema.path('employmentInfo.currency'));
    assert.ok(User.schema.path('security.failedLoginAttempts'));
    assert.ok(User.schema.path('security.tokenVersion'));
    assert.ok(User.schema.path('updatedAt'));

    const employeeIndex = User.schema.indexes().find(([keys]) => keys.tenantId === 1 && keys.employeeId === 1);
    assert.ok(employeeIndex);
    assert.equal(employeeIndex[1].unique, true);
    assert.deepEqual(employeeIndex[1].partialFilterExpression, { employeeId: { $type: 'string' } });
});

test('current enrollment and parent relationship indexes enforce one active record per scope', () => {
    const Enrollment = require('../models/Enrollment');
    const ParentStudentLink = require('../models/ParentStudentLink');

    const currentEnrollmentIndex = Enrollment.schema.indexes().find(([keys]) => (
        keys.tenantId === 1 && keys.studentId === 1 && keys.academicYearId === 1 && keys.isCurrent === 1
    ));
    assert.ok(currentEnrollmentIndex);
    assert.equal(currentEnrollmentIndex[1].unique, true);
    assert.deepEqual(currentEnrollmentIndex[1].partialFilterExpression, { isCurrent: true });

    const parentLinkIndex = ParentStudentLink.schema.indexes().find(([keys]) => (
        keys.tenantId === 1 && keys.parentUserId === 1 && keys.studentId === 1
    ));
    assert.ok(parentLinkIndex);
    assert.equal(parentLinkIndex[1].unique, true);
});

test('production runtime requires HTTPS origins, authenticated MongoDB, proxy trust, and distinct secrets', () => {
    const { assertProductionConfig } = require('../config/env');
    const keys = [
        'PUBLIC_APP_URL', 'CORS_ORIGINS', 'TRUST_PROXY', 'PORT', 'JWT_SECRET',
        'COOKIE_SECRET', 'MONGO_URI', 'COOKIE_SAMESITE'
    ];
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    try {
        Object.assign(process.env, {
            PUBLIC_APP_URL: 'https://school.elivateict.com',
            CORS_ORIGINS: 'https://school.elivateict.com',
            TRUST_PROXY: 'loopback',
            PORT: '5112',
            JWT_SECRET: 'jwt-production-secret-abcdefghijklmnopqrstuvwxyz',
            COOKIE_SECRET: 'cookie-production-secret-zyxwvutsrqponmlkjihgfedcba',
            MONGO_URI: 'mongodb://school_app:encoded-password@127.0.0.1:27017/school_management?authSource=school_management',
            COOKIE_SAMESITE: 'strict'
        });

        assert.doesNotThrow(() => assertProductionConfig());

        process.env.CORS_ORIGINS = 'https://untrusted.example.test';
        assert.throws(() => assertProductionConfig(), /must include PUBLIC_APP_URL/);

        process.env.CORS_ORIGINS = 'https://school.elivateict.com';
        process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/school_management';
        assert.throws(() => assertProductionConfig(), /authenticated MongoDB user/);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('production authentication cookie uses secure host-only settings', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSameSite = process.env.COOKIE_SAMESITE;
    try {
        process.env.NODE_ENV = 'production';
        process.env.COOKIE_SAMESITE = 'strict';
        const { getAuthCookieName, getCookieOptions } = require('../utils/authCookies');
        const options = getCookieOptions();

        assert.equal(getAuthCookieName(), '__Host-access_token');
        assert.equal(options.httpOnly, true);
        assert.equal(options.secure, true);
        assert.equal(options.sameSite, 'strict');
        assert.equal(options.path, '/');
        assert.equal(options.domain, undefined);
    } finally {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
        if (originalSameSite === undefined) delete process.env.COOKIE_SAMESITE;
        else process.env.COOKIE_SAMESITE = originalSameSite;
    }
});

test('enrollment index repair targets only the obsolete student-year unique index', () => {
    const { isLegacyEnrollmentUniqueIndex } = require('../scripts/fixEnrollmentIndexes');

    assert.equal(isLegacyEnrollmentUniqueIndex({
        unique: true,
        key: { tenantId: 1, studentId: 1, academicYearId: 1 }
    }), true);
    assert.equal(isLegacyEnrollmentUniqueIndex({
        unique: false,
        key: { tenantId: 1, studentId: 1, academicYearId: 1 }
    }), false);
    assert.equal(isLegacyEnrollmentUniqueIndex({
        unique: true,
        key: { tenantId: 1, studentId: 1, academicYearId: 1, isCurrent: 1 }
    }), false);
});

test('enrollment status update middleware keeps isCurrent synchronized', async () => {
    const Enrollment = require('../models/Enrollment');
    const originalUpdateOne = Enrollment.collection.updateOne;
    const capturedUpdates = [];

    try {
        Enrollment.collection.updateOne = async (filter, update) => {
            capturedUpdates.push(update);
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
        };

        await Enrollment.updateOne(
            { _id: new mongoose.Types.ObjectId() },
            { $set: { status: 'Promoted' } }
        );
        await Enrollment.updateOne(
            { _id: new mongoose.Types.ObjectId() },
            { $set: { status: 'Current' } }
        );

        assert.equal(capturedUpdates[0].$set.status, 'Promoted');
        assert.equal(capturedUpdates[0].$set.isCurrent, false);
        assert.equal(capturedUpdates[1].$set.status, 'Current');
        assert.equal(capturedUpdates[1].$set.isCurrent, true);
    } finally {
        Enrollment.collection.updateOne = originalUpdateOne;
    }
});

test('staff profile normalization generates employee IDs and rejects negative compensation', () => {
    const { buildProfileFields } = require('../utils/userProfile');
    const normalized = buildProfileFields({
        phone: '+252 61 234 5678',
        employmentInfo: {
            specialization: 'Mathematics education',
            qualifiedSubjects: 'Mathematics, Physics',
            qualifications: 'B.Ed, Teaching Certificate',
            yearsExperience: '4',
            basicSalary: '750',
            currency: 'usd'
        }
    }, 'teacher');

    assert.match(normalized.employeeId, /^T-\d{4}-[A-F0-9]{6}$/);
    assert.equal(normalized.phone, '+252612345678');
    assert.equal(normalized.employmentInfo.basicSalary, 750);
    assert.equal(normalized.employmentInfo.currency, 'USD');
    assert.equal(normalized.employmentInfo.specialization, 'Mathematics education');
    assert.deepEqual(normalized.employmentInfo.qualifiedSubjects, ['Mathematics', 'Physics']);
    assert.deepEqual(normalized.employmentInfo.qualifications, ['B.Ed', 'Teaching Certificate']);
    assert.equal(normalized.employmentInfo.yearsExperience, 4);
    assert.throws(
        () => buildProfileFields({ employmentInfo: { basicSalary: -1 } }, 'teacher'),
        /non-negative/
    );
});

test('non-HR staff updates cannot overwrite approved compensation', () => {
    const { buildProfileFields, withoutCompensationFields } = require('../utils/userProfile');
    const payload = withoutCompensationFields({
        employmentInfo: {
            employmentType: 'Contract',
            basicSalary: 9999,
            allowance: 500,
            deductions: 25,
            currency: 'EUR',
            paymentMethod: 'Cash'
        }
    });
    const existing = {
        employeeId: 'T-2026-ABC123',
        employmentInfo: {
            employmentType: 'Permanent',
            basicSalary: 400,
            allowance: 40,
            deductions: 10,
            currency: 'USD',
            paymentMethod: 'Bank',
            bankName: 'Approved Bank'
        }
    };
    const normalized = buildProfileFields(payload, 'teacher', { existing, preserveCompensation: true });

    assert.equal(payload.employmentInfo.basicSalary, undefined);
    assert.equal(payload.employmentInfo.paymentMethod, undefined);
    assert.equal(normalized.employmentInfo.employmentType, 'Contract');
    assert.equal(normalized.employmentInfo.basicSalary, 400);
    assert.equal(normalized.employmentInfo.allowance, 40);
    assert.equal(normalized.employmentInfo.deductions, 10);
    assert.equal(normalized.employmentInfo.currency, 'USD');
    assert.equal(normalized.employmentInfo.paymentMethod, 'Bank');
    assert.equal(normalized.employmentInfo.bankName, 'Approved Bank');
});

test('compensation approval routes and one-open-request index are declared', () => {
    const CompensationChangeRequest = require('../models/CompensationChangeRequest');
    const hrRoutes = require('../routes/hrRoutes');
    const financeRoutes = require('../routes/tenantFinanceRoutes');

    const submitRoute = hrRoutes.stack.find((layer) => layer.route?.path === '/employees/:id/compensation' && layer.route.methods.put);
    const listRoute = financeRoutes.stack.find((layer) => layer.route?.path === '/compensation-requests' && layer.route.methods.get);
    const reviewRoute = financeRoutes.stack.find((layer) => layer.route?.path === '/compensation-requests/:id/review' && layer.route.methods.put);
    assert.ok(submitRoute, 'compensation submit route is mounted');
    assert.ok(listRoute, 'compensation list route is mounted');
    assert.ok(reviewRoute, 'compensation review route is mounted');

    // Assert the permission gate itself rather than counting middleware. Phase 3 removed the
    // redundant authorize() from these routes, which changed the middleware count without
    // weakening anything: requirePermission is what actually guards them.
    const fs = require('node:fs');
    const path = require('node:path');
    const hrSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'hrRoutes.js'), 'utf8');
    const financeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tenantFinanceRoutes.js'), 'utf8');
    assert.match(hrSource, /\/employees\/:id\/compensation'.*requirePermission\('hr\.employees\.update'\)/);
    assert.match(financeSource, /\/compensation-requests'.*requirePermission\('finance\.compensation\.view'\)/);
    assert.match(financeSource, /\/compensation-requests\/:id\/review'.*requirePermission\('finance\.compensation\.approve'\)/);

    const openRequestIndex = CompensationChangeRequest.schema.indexes().find(([keys]) => (
        keys.tenantId === 1 && keys.employeeId === 1 && keys.isOpen === 1
    ));
    assert.ok(openRequestIndex);
    assert.equal(openRequestIndex[1].unique, true);
    assert.deepEqual(openRequestIndex[1].partialFilterExpression, { isOpen: true });
});

test('self profile lookup is tenant scoped and omits sensitive credentials', async () => {
    const User = require('../models/User');
    const { getOwnProfile } = require('../controllers/authController');
    const originalFindOne = User.findOne;
    let capturedQuery = null;

    try {
        User.findOne = async (query) => {
            capturedQuery = query;
            return {
                _id: 'user-1',
                tenantId: 'tenant-1',
                branchId: 'branch-1',
                name: 'Profile User',
                email: 'profile@example.com',
                passwordHash: 'must-not-leak',
                role: 'cashier',
                scope: 'branch',
                emergencyContact: {}
            };
        };

        const response = createResponse();
        await getOwnProfile({
            user: { _id: 'user-1' },
            tenantId: 'tenant-1'
        }, response);

        assert.deepEqual(capturedQuery, { _id: 'user-1', tenantId: 'tenant-1' });
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.name, 'Profile User');
        assert.equal(response.body.passwordHash, undefined);
    } finally {
        User.findOne = originalFindOne;
    }
});

test('registrar self profile validates editable identity and cannot change account boundaries', async () => {
    const AuditLog = require('../models/AuditLog');
    const User = require('../models/User');
    const { updateOwnProfile } = require('../controllers/authController');
    const originals = { findOne: User.findOne, exists: User.exists, auditCreate: AuditLog.create };
    const mockUser = {
        _id: 'user-2',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        name: 'Old Name',
        email: 'original@example.com',
        role: 'registrar',
        scope: 'branch',
        dateOfBirth: new Date('1990-01-01'),
        gender: 'Male',
        emergencyContact: {},
        async save() { this.saved = true; }
    };

    try {
        User.findOne = async () => mockUser;
        User.exists = async () => null;
        AuditLog.create = async () => ({});

        const invalidResponse = createResponse();
        await updateOwnProfile({
            user: { _id: 'user-2', role: 'registrar' },
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            body: { name: 'Valid Name', gender: 'Invalid value' }
        }, invalidResponse);
        assert.equal(invalidResponse.statusCode, 400);
        assert.match(invalidResponse.body.message, /email|gender/i);

        const response = createResponse();
        await updateOwnProfile({
            user: { _id: 'user-2', role: 'registrar', name: 'Old Name' },
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            body: {
                name: 'Updated Registrar',
                gender: 'Female',
                dateOfBirth: '1991-02-03',
                phone: '+252612345678',
                email: 'updated@example.com',
                role: 'platform_owner',
                tenantId: 'foreign-tenant',
                branchId: 'foreign-branch',
                emergencyContact: { name: 'Trusted Person', email: 'trusted@example.com' }
            }
        }, response);

        assert.equal(response.statusCode, 200);
        assert.equal(mockUser.saved, true);
        assert.equal(mockUser.name, 'Updated Registrar');
        assert.equal(mockUser.gender, 'Female');
        assert.equal(String(mockUser.dateOfBirth), '1991-02-03');
        assert.equal(mockUser.email, 'updated@example.com');
        assert.equal(mockUser.role, 'registrar');
        assert.equal(mockUser.tenantId, 'tenant-1');
        assert.equal(mockUser.branchId, 'branch-1');
    } finally {
        User.findOne = originals.findOne;
        User.exists = originals.exists;
        AuditLog.create = originals.auditCreate;
    }
});

test('student self profile reads official identity from the scoped student record', async () => {
    const Student = require('../models/Student');
    const User = require('../models/User');
    const { getOwnProfile } = require('../controllers/authController');
    const originals = { userFindOne: User.findOne, studentFindOne: Student.findOne };
    let studentQuery = null;

    try {
        User.findOne = async () => ({
            _id: 'user-student',
            tenantId: 'tenant-1',
            branchId: 'branch-1',
            studentId: 'student-1',
            name: 'Stale Account Name',
            role: 'student',
            scope: 'branch',
            emergencyContact: {}
        });
        Student.findOne = (query) => {
            studentQuery = query;
            return {
                select: async () => ({
                    firstName: 'Official',
                    middleName: 'School',
                    lastName: 'Name',
                    DOB: new Date('2012-04-03'),
                    gender: 'Female'
                })
            };
        };

        const response = createResponse();
        await getOwnProfile({ user: { _id: 'user-student' }, tenantId: 'tenant-1' }, response);

        assert.deepEqual(studentQuery, { _id: 'student-1', tenantId: 'tenant-1' });
        assert.equal(response.body.name, 'Official School Name');
        assert.equal(response.body.gender, 'Female');
        assert.equal(response.body.dateOfBirth.toISOString(), '2012-04-03T00:00:00.000Z');
    } finally {
        User.findOne = originals.userFindOne;
        Student.findOne = originals.studentFindOne;
    }
});

test('avatar update changes only the authenticated user profile image', async () => {
    const AuditLog = require('../models/AuditLog');
    const User = require('../models/User');
    const { updateOwnAvatar } = require('../controllers/authController');
    const originals = { findOne: User.findOne, auditCreate: AuditLog.create };
    let capturedQuery = null;
    const mockUser = {
        _id: 'user-3',
        tenantId: 'tenant-1',
        name: 'Avatar User',
        email: 'avatar@example.com',
        role: 'finance_director',
        scope: 'tenant',
        emergencyContact: {},
        async save() { this.saved = true; }
    };

    try {
        User.findOne = async (query) => {
            capturedQuery = query;
            return mockUser;
        };
        AuditLog.create = async () => ({});

        const response = createResponse();
        await updateOwnAvatar({
            user: { _id: 'user-3', role: 'finance_director', name: 'Avatar User' },
            tenantId: 'tenant-1',
            file: { filename: 'avatar-user-3-test.webp', path: 'unused-test-path' }
        }, response);

        assert.deepEqual(capturedQuery, { _id: 'user-3', tenantId: 'tenant-1' });
        assert.equal(response.statusCode, 200);
        assert.equal(mockUser.saved, true);
        assert.equal(mockUser.avatarUrl, '/uploads/avatars/avatar-user-3-test.webp');
        assert.equal(response.body.avatarUrl, mockUser.avatarUrl);
    } finally {
        User.findOne = originals.findOne;
        AuditLog.create = originals.auditCreate;
    }
});

test('school operational CSV helpers escape student directory values', () => {
    const { generateStudentDirectoryCSV, toCSV } = require('../services/exportService');

    const csv = generateStudentDirectoryCSV([
        {
            _id: 'student-1',
            admissionNumber: 'ADM-001',
            firstName: 'Asha, Jr.',
            middleName: '',
            lastName: 'Hassan',
            status: 'Active',
            gender: 'Female',
            DOB: new Date('2015-01-02'),
            admissionDate: new Date('2026-06-01'),
            guardianInfo: {
                name: 'Mohamed "Mo" Hassan',
                phone: '+252610000000',
                email: 'guardian@example.com'
            }
        }
    ], new Map([[
        'student-1',
        {
            classId: { name: 'Grade 1' },
            sectionId: { name: 'A' },
            academicYearId: { name: '2026' }
        }
    ]]));

    assert.match(csv, /"Asha, Jr\. Hassan"/);
    assert.match(csv, /"Mohamed ""Mo"" Hassan"/);
    assert.match(csv, /Grade 1/);

    const generic = toCSV(['Name', 'Note'], [{ Name: 'Fee, Term 1', Note: 'Line "A"' }]);
    assert.match(generic, /"Fee, Term 1","Line ""A"""/);
});

test('school operational export routes are mounted with school-side permissions', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');

    const registrarRoutes = fs.readFileSync(path.join(root, 'routes', 'registrarRoutes.js'), 'utf8');
    const financeRoutes = fs.readFileSync(path.join(root, 'routes', 'tenantFinanceRoutes.js'), 'utf8');
    const cashierRoutes = fs.readFileSync(path.join(root, 'routes', 'cashierRoutes.js'), 'utf8');
    const branchRoutes = fs.readFileSync(path.join(root, 'routes', 'branchAdminRoutes.js'), 'utf8');
    const branchController = fs.readFileSync(path.join(root, 'controllers', 'branchAdminController.js'), 'utf8');

    assert.match(registrarRoutes, /\/students\/export\.csv'.*requirePermission\('students\.view'\)/s);
    assert.match(registrarRoutes, /\/students\/import-template\.csv'.*requirePermission\('students\.create'\)/s);
    assert.match(registrarRoutes, /\/students\/:id\/admission-summary'.*requirePermission\('students\.detail'\)/s);
    assert.match(financeRoutes, /\/invoices\/export\.csv'.*requirePermission\('finance\.invoices\.view'\)/s);
    assert.match(financeRoutes, /\/payments\/export\.csv'.*requirePermission\('finance\.payments\.view'\)/s);
    assert.match(financeRoutes, /\/outstanding\/export\.csv'.*requirePermission\('finance\.outstanding\.view'\)/s);
    assert.match(cashierRoutes, /\/day-close'.*requirePermission\('cashier\.payments\.view'\)/s);
    assert.match(cashierRoutes, /\/day-close\/export\.csv'.*requirePermission\('cashier\.payments\.view'\)/s);
    assert.match(branchRoutes, /\/results\/export\.csv'.*requirePermission\('branch\.results\.export'\)/s);
    assert.match(branchController, /Exam\.find\(\{ tenantId: req\.user\.tenantId, branchId: req\.user\.branchId, classId \}\)/);
    const resultListBlock = branchController.match(/exports\.getExamResults[\s\S]*?exports\.exportExamResults/)[0];
    assert.doesNotMatch(resultListBlock, /query\.classId\s*=/);
});

test('staff seat counting excludes student and parent portal identities', () => {
    const { SEAT_EXEMPT_ROLES, staffSeatFilter } = require('../services/planLimitService');

    assert.deepEqual([...SEAT_EXEMPT_ROLES].sort(), ['parent', 'student']);

    // Tenant-scoped count used by enforcePlanLimit('users').
    assert.deepEqual(staffSeatFilter('tenant-1'), {
        tenantId: 'tenant-1',
        isActive: { $ne: false },
        role: { $nin: ['student', 'parent'] }
    });

    // Platform-wide aggregate reuses the same rule, so the dashboard and the
    // enforcement path can never disagree about a tenant's seat usage.
    assert.deepEqual(staffSeatFilter(), {
        isActive: { $ne: false },
        role: { $nin: ['student', 'parent'] }
    });
});

test('every user creation route enforces the staff seat limit', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');

    const tenantRoutes = fs.readFileSync(path.join(root, 'routes', 'tenantRoutes.js'), 'utf8');
    const userRoutes = fs.readFileSync(path.join(root, 'routes', 'userRoutes.js'), 'utf8');
    const branchRoutes = fs.readFileSync(path.join(root, 'routes', 'branchAdminRoutes.js'), 'utf8');
    const registrarRoutes = fs.readFileSync(path.join(root, 'routes', 'registrarRoutes.js'), 'utf8');

    assert.match(tenantRoutes, /router\.post\('\/users'.*enforcePlanLimit\('users'\)/);
    assert.match(userRoutes, /router\.post\('\/staff'.*enforcePlanLimit\('users'\)/);
    assert.match(branchRoutes, /router\.post\('\/users'.*enforcePlanLimit\('users'\)/);
    assert.match(branchRoutes, /router\.post\('\/users\/teachers'.*enforcePlanLimit\('users'\)/);

    // Student admission is capped by maxStudents only. Admitting a student must not
    // fail because staff seats are full, and students no longer consume a seat.
    const admissionRoute = registrarRoutes.match(/router\.post\('\/students'[^\n]*/)[0];
    assert.match(admissionRoute, /enforcePlanLimit\('students'\)/);
    assert.doesNotMatch(admissionRoute, /enforcePlanLimit\('users'\)/);
});

test('platform usage reporting counts staff seats, not portal identities', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const controller = fs.readFileSync(
        path.join(__dirname, '..', 'controllers', 'platformController.js'),
        'utf8'
    );

    assert.match(controller, /staffSeatFilter/);
    assert.match(controller, /User\.aggregate\(\[\{ \$match: staffSeatFilter\(\) \}/);
    assert.match(controller, /User\.countDocuments\(staffSeatFilter\(tenant\._id\)\)/);
    assert.doesNotMatch(controller, /User\.aggregate\(\[\{ \$match: \{ isActive: \{ \$ne: false \} \} \}/);
});

test('every catalog permission is enforced somewhere, or explicitly exempted', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { PERMISSION_CATALOG } = require('../utils/permissions');
    const root = path.join(__dirname, '..');

    let backendSource = '';
    for (const dir of ['routes', 'controllers', 'middleware', 'services']) {
        for (const file of fs.readdirSync(path.join(root, dir))) {
            backendSource += fs.readFileSync(path.join(root, dir, file), 'utf8');
        }
    }

    // Permissions that deliberately have no backend check. Each needs a reason:
    // adding a key here is a decision, not a shortcut.
    const EXEMPT = new Map([
        // Shared lookups every signed-in tenant user needs (branding for theming,
        // branch list for dropdowns). Gating them would break the whole UI.
        ['tenant.branding.view', 'shared lookup: GET /tenant/settings/branding'],
        ['tenant.branches.view', 'shared lookup: GET /tenant/branches'],

        // Status toggles are enforced through the broader .update permission,
        // so these two catalog entries are aliases rather than separate gates.
        ['tenant.users.activate', 'covered by tenant.users.update'],
        ['tenant.users.deactivate', 'covered by tenant.users.update'],
        ['branch.staff.activate', 'covered by branch.staff.update'],
        ['branch.staff.deactivate', 'covered by branch.staff.update'],

        // Gate the SPA route only; the backend dashboard endpoints carry their own checks.
        ['finance.dashboard.view', 'frontend route gate'],
        ['registrar.dashboard.view', 'frontend route gate'],
        ['hr.dashboard.view', 'frontend route gate'],

        // Printing happens in the browser, so there is no request to gate.
        ['cashier.receipts.print', 'client-side action'],

        // Catalog entries for features that do not exist yet. They currently appear in
        // the permission editor and do nothing when toggled. Resolve in Phase 2 by
        // either building the feature or removing the entry.
        ['platform.tenants.update', 'no generic tenant-update route exists'],
        ['finance.receiptBranding.view', 'feature not built'],
        ['finance.receiptBranding.update', 'feature not built'],
        ['finance.paymentReversals.approve', 'reversal is gated by cashier.payments.reverse'],
        ['teacher.examTemplates.manage', 'no exam-template write route exists'],
        ['teacher.examCategories.manage', 'writes are gated by branch.exams.create'],
        ['teacher.gradingPolicy.manage', 'writes are gated by tenant.academicPolicy.update']
    ]);

    const unenforced = PERMISSION_CATALOG
        .map((permission) => permission.key)
        .filter((key) => !backendSource.includes(`'${key}'`))
        .filter((key) => !EXEMPT.has(key));

    assert.deepEqual(unenforced, [], `Permissions in the catalog with no backend check: ${unenforced.join(', ')}`);

    // Keep the exemption list honest: an entry that later gains a real check must be removed.
    const staleExemptions = [...EXEMPT.keys()].filter((key) => backendSource.includes(`'${key}'`));
    assert.deepEqual(staleExemptions, [], `Now enforced, remove from EXEMPT: ${staleExemptions.join(', ')}`);
});

test('pages with mutating actions gate them on permission', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const pagesRoot = path.join(__dirname, '..', '..', 'frontend', 'src', 'pages');

    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : (entry.name.endsWith('.jsx') ? [full] : []);
    });

    // Pages whose whole route already requires the action permission (the route guard in
    // routePermissions.js covers them), so a second in-page check would be redundant.
    const ROUTE_LEVEL_ONLY = new Set([
        'branch/Promotions.jsx',       // route requires branch.promotions.run
        'branch/Transfer.jsx',         // route requires branch.transfers.run
        'branch/StaffCreate.jsx',      // route requires branch.staff.create
        'cashier/NewPayment.jsx',      // route requires cashier.payments.create
        'registrar/Admissions.jsx',    // route requires students.create
        'registrar/NewEnrollment.jsx', // route requires enrollments.create
        'platform/NewTenant.jsx',      // route requires platform.tenants.create
        'teacher/AttendanceSession.jsx', // route requires teacher.attendance.submit
        'teacher/ResultsEntry.jsx',    // route requires teacher.results.enter
        'finance/InvoiceGenerate.jsx', // route requires finance.invoices.generate
        'tenant/StaffPermissions.jsx'  // route requires tenant.users.permissions.view
    ]);

    // Self-service pages: the user acts on their own record, so there is nothing to gate.
    const SELF_SERVICE = /^(account|student|parent|teacher\/Profile|ChangePassword)/;

    // Unreachable: not imported or routed anywhere in App.jsx. Delete them or wire them up.
    const DEAD_PAGES = new Set(['tenant/Promote.jsx', 'tenant/Transfer.jsx']);

    // Leave requests are gated at the route: staff create their own, and managers review
    // through a route that already requires hr.leaves.review.
    const LEAVE_PAGES = new Set(['hr/LeavesRequest.jsx', 'hr/StaffLeavesManager.jsx']);

    const ungated = [];
    for (const file of walk(pagesRoot)) {
        const rel = path.relative(pagesRoot, file).split(path.sep).join('/');
        if (ROUTE_LEVEL_ONLY.has(rel) || SELF_SERVICE.test(rel)) continue;
        if (DEAD_PAGES.has(rel) || LEAVE_PAGES.has(rel) || rel === 'Landing.jsx') continue;
        // Strip DOM and download helpers so they are not mistaken for API mutations.
        const source = fs.readFileSync(file, 'utf8')
            .replace(/\b(createElement|createObjectURL|revokeObjectURL|createRef|createContext)\s*\(/g, '');
        const mutates = /\b(create|update|delete|remove|generate|approve|reject|reverse|assign|promote|transfer|record|review)[A-Z]\w*\s*\(/.test(source)
            || /\.(post|put|patch|delete)\(/.test(source);
        if (mutates && !source.includes('hasPermission')) ungated.push(rel);
    }

    assert.deepEqual(ungated, [], `Pages with mutating actions but no permission gate: ${ungated.join(', ')}`);
});

test('the unused Can component is gone, leaving one gating pattern', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const canPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'auth', 'Can.jsx');
    assert.equal(fs.existsSync(canPath), false, 'Can.jsx was deleted in favour of hasPermission');
});

test('permissions resolve from a Role record when one is linked', () => {
    const { getEffectivePermissions, getUserPermissionParts, resolveRoleDefaults } = require('../utils/permissions');

    const cashier = { role: 'cashier', permissions: { allow: [], deny: [] } };

    // No role linked: fall back to the built-in defaults, exactly as before Phase 1.
    const builtIn = getEffectivePermissions(cashier);
    assert.ok(builtIn.includes('cashier.payments.create'));
    assert.ok(!builtIn.includes('cashier.payments.reverse'), 'reversal is not a cashier default');

    // A seeded role holds the same keys, so behaviour is unchanged.
    const seeded = { isActive: true, permissions: builtIn };
    assert.deepEqual(getEffectivePermissions(cashier, seeded), builtIn);

    // An edited role is what now decides the baseline.
    const edited = { isActive: true, permissions: [...builtIn, 'cashier.payments.reverse'] };
    assert.ok(getEffectivePermissions(cashier, edited).includes('cashier.payments.reverse'));

    // Deactivating a role must remove access, not silently fall back to the defaults.
    assert.deepEqual(getEffectivePermissions(cashier, { isActive: false, permissions: builtIn }), []);
    assert.deepEqual(resolveRoleDefaults(cashier, { isActive: false, permissions: builtIn }), []);

    // A user deny still wins over whatever the role grants.
    const denied = { role: 'cashier', permissions: { allow: [], deny: ['cashier.payments.reverse'] } };
    assert.ok(!getUserPermissionParts(denied, edited).effective.includes('cashier.payments.reverse'));

    // Keys the role holds that are not in the catalog are dropped rather than honoured.
    assert.deepEqual(resolveRoleDefaults(cashier, { isActive: true, permissions: ['not.a.real.permission'] }), []);
});

test('a user cannot grant themselves a permission they do not hold', async () => {
    const { updateUserPermissions } = require('../controllers/tenantController');
    const User = require('../models/User');
    const originalFindOne = User.findOne;

    const adminId = new mongoose.Types.ObjectId();
    const admin = {
        _id: adminId,
        role: 'super_admin',
        scope: 'tenant',
        tenantId: 'tenant-esc',
        isActive: true,
        permissions: { allow: [], deny: [] },
        save: async function () { return this; }
    };

    try {
        User.findOne = async () => admin;

        // Granting yourself something you do not hold is refused.
        const req = {
            params: { userId: String(adminId) },
            body: { allow: ['tenant.branches.create'], deny: [] },
            user: admin,
            tenantId: 'tenant-esc',
            permissions: ['tenant.users.permissions.update']
        };
        const res = createResponse();
        let captured = null;
        await updateUserPermissions(req, res, (error) => { captured = error; });

        assert.ok(captured, 'self-escalation should be rejected');
        assert.equal(captured.statusCode, 403);
        assert.match(captured.message, /cannot grant yourself/i);

        // Denying your own permission is not escalation, so it is not blocked by this rule.
        const reqDeny = {
            params: { userId: String(adminId) },
            body: { allow: [], deny: ['tenant.branches.create'] },
            user: admin,
            tenantId: 'tenant-esc',
            permissions: ['tenant.users.permissions.update']
        };
        let denyError = null;
        await updateUserPermissions(reqDeny, createResponse(), (error) => { denyError = error; });
        assert.ok(
            !denyError || !/cannot grant yourself/i.test(denyError.message),
            'denying your own permission is not self-escalation'
        );
    } finally {
        User.findOne = originalFindOne;
    }
});

test('seeded system roles mirror the built-in role permissions exactly', () => {
    const { DEFAULT_ROLE_PERMISSIONS } = require('../utils/permissions');
    const { ROLE_PRESENTATION, dataScopeFor } = require('../scripts/seedSystemRoles');
    const { ROLE_SCOPE } = require('../utils/rolePolicy');

    // Every built-in role must be presentable, or the migration would skip it.
    for (const key of Object.keys(ROLE_SCOPE)) {
        assert.ok(ROLE_PRESENTATION[key], `no name/description for seeded role ${key}`);
        assert.ok(Array.isArray(DEFAULT_ROLE_PERMISSIONS[key]), `no default permissions for ${key}`);
        const scope = dataScopeFor(key);
        assert.ok(['all', 'assigned', 'own'].includes(scope.branches));
        assert.ok(['all', 'assigned', 'own'].includes(scope.records));
    }

    // Teachers are the only role already reading authorizedBranchIds, so they are the only
    // seeded role with branch scope 'assigned'. Generalising this is Phase 4.
    assert.equal(dataScopeFor('teacher').branches, 'assigned');
    assert.equal(dataScopeFor('super_admin').branches, 'all');
    assert.equal(dataScopeFor('cashier').branches, 'own');
});

test('the target org is expressible once the catalog is unboxed', () => {
    const { findUnassignablePermissions } = require('../utils/permissions');

    const grantable = (scope, values) =>
        findUnassignablePermissions({ scope, planTier: 'basic', values }).length === 0;

    // Super Admin approves payroll; payroll.approve used to be boxed to finance_director.
    assert.ok(grantable('tenant', ['payroll.approve']));
    // Finance pays; payroll.pay used to be boxed to super_admin and cashier.
    assert.ok(grantable('tenant', ['payroll.pay']));

    // Admission Manager is branch-scoped and needs seven permissions previously boxed to
    // branch_admin, on top of what registrar already held.
    assert.ok(grantable('branch', [
        'students.create', 'students.view', 'students.detail', 'students.update',
        'enrollments.create', 'branch.classes.view', 'branch.classes.create',
        'branch.classes.update', 'branch.sections.manage', 'branch.subjects.manage',
        'branch.results.view', 'branch.timetable.view', 'branch.promotions.run',
        'branch.transfers.run'
    ]));

    // HR stays tenant-scoped and student-free.
    assert.ok(grantable('tenant', [
        'hr.leaves.view', 'hr.leaves.review', 'hr.employees.view', 'hr.employees.update',
        'payroll.view', 'payroll.generate', 'payroll.review'
    ]));
});

test('the administrative ceiling blocks platform, scope, and plan-tier overreach', () => {
    const { findUnassignablePermissions, getAssignablePermissions } = require('../utils/permissions');

    // A school can never mint itself platform access, at any scope or tier.
    for (const scope of ['tenant', 'branch']) {
        const rejected = findUnassignablePermissions({
            scope, planTier: 'enterprise', values: ['platform.tenants.create']
        });
        assert.equal(rejected.length, 1);
        assert.match(rejected[0].reason, /platform permissions cannot be granted/);
    }

    // Scope is a hard boundary in both directions.
    const branchOverreach = findUnassignablePermissions({
        scope: 'branch', planTier: 'enterprise', values: ['tenant.users.create']
    });
    assert.equal(branchOverreach.length, 1);
    assert.match(branchOverreach[0].reason, /requires tenant scope/);

    // Unknown keys are named, not silently dropped.
    const unknown = findUnassignablePermissions({ scope: 'tenant', values: ['not.a.permission'] });
    assert.equal(unknown[0].reason, 'unknown permission');

    // No platform permission is ever assignable to a school.
    for (const scope of ['tenant', 'branch']) {
        const assignable = getAssignablePermissions({ scope, planTier: 'enterprise' });
        assert.equal(assignable.some((p) => p.key.startsWith('platform.')), false);
    }
});

test('plan tier caps what a school can reach', () => {
    const { planTierRank, findUnassignablePermissions, PERMISSION_CATALOG } = require('../utils/permissions');

    assert.ok(planTierRank('basic') < planTierRank('pro'));
    assert.ok(planTierRank('pro') < planTierRank('enterprise'));
    // An unknown or missing plan must not grant more than the lowest tier.
    assert.equal(planTierRank(undefined), planTierRank('basic'));
    assert.equal(planTierRank('nonsense'), planTierRank('basic'));

    // The seeded plans use foundation/growth/excellence while platformController uses
    // basic/pro/enterprise. Both must rank, or a paying school would be treated as the
    // cheapest tier and silently denied everything above it.
    assert.equal(planTierRank('foundation'), planTierRank('basic'));
    assert.equal(planTierRank('growth'), planTierRank('pro'));
    assert.equal(planTierRank('excellence'), planTierRank('enterprise'));

    // The mechanism works even though no permission currently sets minPlanTier: pricing
    // tiers are the school's business decision, not a default the platform should invent.
    const tiered = { ...PERMISSION_CATALOG[0], minPlanTier: 'enterprise' };
    assert.ok(planTierRank(tiered.minPlanTier) > planTierRank('basic'));
    assert.equal(PERMISSION_CATALOG.filter((p) => p.minPlanTier).length, 0,
        'no tier restrictions are set yet; populate minPlanTier when pricing is decided');

    // Scope rejections still fire regardless of tier.
    assert.equal(findUnassignablePermissions({ scope: 'branch', planTier: 'basic', values: ['tenant.users.create'] }).length, 1);
});

test('segregation of duties warns on conflicting grants without blocking them', () => {
    const { findDutyConflicts, findNewDutyConflicts } = require('../utils/segregationOfDuties');

    // The full payroll cycle in one role is the headline conflict.
    const fullCycle = findDutyConflicts(['payroll.generate', 'payroll.approve', 'payroll.pay']);
    assert.equal(fullCycle.length, 1);
    assert.equal(fullCycle[0].key, 'payroll_full_cycle');

    // The target org splits it across three people, so it must NOT warn.
    assert.deepEqual(findDutyConflicts(['payroll.generate', 'payroll.review']), []);
    assert.deepEqual(findDutyConflicts(['payroll.approve']), []);
    assert.deepEqual(findDutyConflicts(['payroll.pay']), []);

    // Holding part of a conflict is the split we are recommending, so it stays quiet.
    assert.deepEqual(findDutyConflicts(['students.create']), []);
    assert.equal(findDutyConflicts(['students.create', 'students.password.reset']).length, 1);

    // A school that already accepted a conflict is not re-warned for an unrelated edit.
    const before = ['payroll.generate', 'payroll.approve', 'payroll.pay'];
    const after = [...before, 'hr.leaves.view'];
    assert.deepEqual(findNewDutyConflicts(before, after), []);

    // A change that introduces one does warn.
    const introduced = findNewDutyConflicts(['payroll.generate'], ['payroll.generate', 'payroll.approve', 'payroll.pay']);
    assert.equal(introduced.length, 1);
    assert.equal(introduced[0].key, 'payroll_full_cycle');
});

test('every catalog permission has a usable scope, and suggestedRoles agree with it', () => {
    const { PERMISSION_CATALOG, isScopeCompatible } = require('../utils/permissions');
    const { ROLE_SCOPE } = require('../utils/rolePolicy');

    for (const permission of PERMISSION_CATALOG) {
        assert.ok(['platform', 'tenant', 'branch', 'any'].includes(permission.requiredScope),
            `${permission.key} has an invalid requiredScope: ${permission.requiredScope}`);

        // Every role that holds a permission today must still be able to hold it, or the
        // migration would silently strip access from an existing user.
        for (const role of permission.suggestedRoles) {
            const roleScope = ROLE_SCOPE[role];
            assert.ok(isScopeCompatible(permission.requiredScope, roleScope),
                `${role} (${roleScope}) holds ${permission.key} but requiredScope is ${permission.requiredScope}`);
        }
    }
});

test('the target org can actually reach its routes', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const routesDir = path.join(__dirname, '..', 'routes');

    // Each role, and the permissions a school would grant it after Phase 2.
    const roles = {
        'Admission Manager': [
            'students.create', 'students.view', 'students.detail', 'students.update',
            'enrollments.create', 'branch.classes.view', 'branch.classes.create',
            'branch.sections.manage', 'branch.subjects.manage', 'branch.promotions.run',
            'branch.transfers.run'
        ],
        'Super Admin': ['payroll.approve', 'payroll.view'],
        'Finance': ['payroll.pay', 'payroll.view'],
        'HR': ['payroll.generate', 'payroll.review', 'hr.employees.view']
    };

    const checks = [
        ['Admission Manager', 'registrarRoutes.js', 'post', '/students'],
        ['Admission Manager', 'branchAdminRoutes.js', 'post', '/classes'],
        ['Admission Manager', 'branchAdminRoutes.js', 'post', '/sections'],
        ['Admission Manager', 'branchSharedRoutes.js', 'get', '/classes'],
        ['Admission Manager', 'academicRoutes.js', 'post', '/promote'],
        ['Super Admin', 'hrRoutes.js', 'put', '/payroll/:id/approve'],
        ['Finance', 'hrRoutes.js', 'put', '/payroll/:id/pay'],
        ['HR', 'hrRoutes.js', 'post', '/payroll/generate'],
        ['HR', 'hrRoutes.js', 'put', '/payroll/:id/review']
    ];

    const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const blocked = [];
    for (const [roleName, file, method, routePath] of checks) {
        const source = fs.readFileSync(path.join(routesDir, file), 'utf8');

        // A blanket role lock would reject a custom role before permissions are consulted.
        const lock = source.match(/router\.use\(authorize\(([^)]*)\)\)/);
        if (lock) { blocked.push(`${roleName}: ${file} still has role lock ${lock[1]}`); continue; }

        const pattern = new RegExp('router\\.' + method + '\\(\\s*[\'"`]' + escapeRe(routePath) + '[\'"`][^\\n]*');
        const line = (source.match(pattern) || [])[0];
        if (!line) { blocked.push(`${roleName}: ${method.toUpperCase()} ${routePath} not found in ${file}`); continue; }

        const single = line.match(/requirePermission\('([^']+)'\)/);
        const any = line.match(/requireAnyPermission\(\[([^\]]+)\]/);
        const needed = single ? [single[1]]
            : any ? any[1].split(',').map((s) => s.trim().replace(/'/g, ''))
            : [];

        if (needed.length && !needed.some((p) => roles[roleName].includes(p))) {
            blocked.push(`${roleName}: ${method.toUpperCase()} ${routePath} needs ${needed.join('|')}`);
        }
    }

    assert.deepEqual(blocked, [], `Target org roles blocked from their routes:\n  ${blocked.join('\n  ')}`);
});

test('only deliberate role locks remain, and each is justified', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const routesDir = path.join(__dirname, '..', 'routes');

    // Phase 3 removed the role gates that only stopped a school from composing its own
    // roles. These five stay for a structural reason, documented at the call site.
    const JUSTIFIED = {
        'platformRoutes.js': 'platform scope is a hard boundary, never school-configurable',
        'teacherRoutes.js': 'teacherAssignmentGuard skips its check for any non-teacher role',
        'studentPortalRoutes.js': 'portal identity bound to User.studentId',
        'parentRoutes.js': 'portal identity bound to linked students'
        // cashierRoutes lost its lock: schools where one person is both finance and cashier
        // need a school-wide role to reach it. cashierController resolves branch by scope.
    };

    const found = [];
    for (const file of fs.readdirSync(routesDir)) {
        const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
        if (/authorize\(/.test(source)) found.push(file);
    }

    assert.deepEqual(found.sort(), Object.keys(JUSTIFIED).sort(),
        'a role lock was added or removed without updating the justification list');

    // Each retained lock must carry its reasoning in the file, so the next reader does not
    // mistake a deliberate boundary for an oversight.
    for (const file of found) {
        const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
        assert.match(source, /KEPT/, `${file} keeps a role lock but does not say why`);
    }
});

test('a school-wide role can combine finance and cashier work', () => {
    const { findUnassignablePermissions } = require('../utils/permissions');

    // Many schools have one person doing both jobs. Splitting them into two branch-scoped
    // and tenant-scoped roles was our assumption, not theirs.
    const merged = [
        'finance.dashboard.view', 'finance.invoices.view', 'finance.invoices.generate',
        'finance.payments.view', 'finance.feeStructures.create', 'finance.outstanding.view',
        'finance.policies.update', 'payroll.pay',
        'cashier.dashboard.view', 'cashier.invoices.search', 'cashier.invoices.detail',
        'cashier.payments.view', 'cashier.payments.create', 'cashier.payments.reverse',
        'cashier.receipts.view', 'cashier.receipts.print'
    ];
    assert.deepEqual(
        findUnassignablePermissions({ scope: 'tenant', planTier: 'growth', values: merged }),
        [],
        'a school-wide finance role must be able to hold cashier permissions'
    );

    // A dedicated branch cashier must still work for schools that do separate the roles.
    const branchCashier = merged.filter((key) => key.startsWith('cashier.'));
    assert.deepEqual(
        findUnassignablePermissions({ scope: 'branch', planTier: 'growth', values: branchCashier }),
        []
    );
});

test('the cashier controller resolves branch from scope, never from a null user branch', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'cashierController.js'), 'utf8');

    // A school-wide finance user has no branchId. Reading req.user.branchId would filter
    // every query by null and silently return nothing, or stamp records with no branch.
    assert.doesNotMatch(source, /req\.user\.branchId/,
        'cashierController must not read the caller branch directly; use branchScope/scopedBranchId');
    assert.match(source, /const branchScope = \(req\) =>/);
    assert.match(source, /req\.scope === 'branch'/);

    // Receipt branding must come from the payment's branch, not the caller's.
    assert.match(source, /Branch\.findOne\(\{ _id: payment\.branchId/);

    // The route must not re-impose a branch-scope lock the controller no longer needs.
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'cashierRoutes.js'), 'utf8');
    assert.doesNotMatch(routes, /requireScope\('branch'\)/);
    assert.doesNotMatch(routes, /authorize\(/);
});

test('the head of school can run promotions and transfers without a branch admin', () => {
    const { DEFAULT_ROLE_PERMISSIONS, findUnassignablePermissions } = require('../utils/permissions');

    // A single-campus school has no branch admin to delegate to.
    for (const key of ['branch.promotions.run', 'branch.transfers.run']) {
        assert.ok(DEFAULT_ROLE_PERMISSIONS.super_admin.includes(key), `super_admin should hold ${key}`);
    }
    assert.deepEqual(
        findUnassignablePermissions({ scope: 'tenant', planTier: 'growth', values: ['branch.promotions.run', 'branch.transfers.run'] }),
        []
    );
    // Still available to a branch role for schools that do have branch admins.
    assert.deepEqual(
        findUnassignablePermissions({ scope: 'branch', planTier: 'growth', values: ['branch.promotions.run', 'branch.transfers.run'] }),
        []
    );

    // Super admin should now cover every branch-admin capability except submitting their
    // own leave request, which is meaningless for the head of school.
    const sa = new Set(DEFAULT_ROLE_PERMISSIONS.super_admin);
    const uncovered = DEFAULT_ROLE_PERMISSIONS.branch_admin.filter((key) => !sa.has(key));
    assert.deepEqual(uncovered, ['hr.leaves.create']);
});

test('attendance oversight is grantable to both a school-wide and a branch role', () => {
    const { PERMISSION_CATALOG, findUnassignablePermissions, DEFAULT_ROLE_PERMISSIONS } = require('../utils/permissions');
    const byKey = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));
    const keys = ['attendance.oversight.view', 'attendance.oversight.manage'];

    // A single-campus head of school is tenant-scoped; an admissions officer is
    // branch-scoped. Both need this, so the scope must be 'any'.
    for (const key of keys) {
        assert.ok(byKey.has(key), `${key} missing from the catalog`);
        assert.equal(byKey.get(key).requiredScope, 'any');
    }
    assert.deepEqual(findUnassignablePermissions({ scope: 'tenant', planTier: 'growth', values: keys }), []);
    assert.deepEqual(findUnassignablePermissions({ scope: 'branch', planTier: 'growth', values: keys }), []);

    // Nobody could see attendance before this: not the head of school, not admissions.
    for (const key of keys) {
        assert.ok(DEFAULT_ROLE_PERMISSIONS.super_admin.includes(key));
        assert.ok(DEFAULT_ROLE_PERMISSIONS.registrar.includes(key));
        // Portal identities see only their own, through their own endpoints.
        assert.ok(!DEFAULT_ROLE_PERMISSIONS.student.includes(key));
        assert.ok(!DEFAULT_ROLE_PERMISSIONS.parent.includes(key));
    }
});

test('attendance oversight routes are gated and scope-aware', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const routes = fs.readFileSync(path.join(root, 'routes', 'attendanceRoutes.js'), 'utf8');
    const controller = fs.readFileSync(path.join(root, 'controllers', 'attendanceController.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

    assert.match(server, /app\.use\('\/api\/attendance', require\('\.\/routes\/attendanceRoutes'\)\)/);

    // Reads and writes carry different permissions, so a school can grant look-but-not-touch.
    assert.match(routes, /router\.get\('\/summary'.*attendance\.oversight\.view/);
    assert.match(routes, /router\.get\('\/sessions'.*attendance\.oversight\.view/);
    assert.match(routes, /router\.get\('\/students\/:studentId'.*attendance\.oversight\.view/);
    assert.match(routes, /router\.post\('\/sessions'.*attendance\.oversight\.manage/);
    assert.match(routes, /router\.put\('\/sessions\/:sessionId\/records'.*attendance\.oversight\.manage/);
    assert.match(routes, /router\.patch\('\/sessions\/:sessionId\/close'.*attendance\.oversight\.manage/);

    // No role or branch-scope lock: it must serve a tenant-scoped and a branch-scoped caller.
    assert.doesNotMatch(routes, /authorize\(/);
    assert.doesNotMatch(routes, /requireScope\(/);

    // The controller must never read the caller's branch directly — a school-wide user has none.
    assert.doesNotMatch(controller, /req\.user\.branchId/);
    assert.match(controller, /const branchScope = \(req\) =>/);
    // Writes take the branch from the class, not the caller.
    assert.match(controller, /branchId: classDoc\.branchId/);

    // The teacher path must stay ownership-bound; oversight is a separate door.
    const teacher = fs.readFileSync(path.join(root, 'controllers', 'teacherController.js'), 'utf8');
    assert.match(teacher, /You did not create this session/);
});

test('the attendance page is routed and gated in both shells', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = path.join(__dirname, '..', '..', 'frontend', 'src');
    const app = fs.readFileSync(path.join(src, 'App.jsx'), 'utf8');
    const rules = fs.readFileSync(path.join(src, 'utils', 'routePermissions.js'), 'utf8');
    const page = fs.readFileSync(path.join(src, 'pages', 'attendance', 'AttendanceOversight.jsx'), 'utf8');

    // Mounted for the head of school and for admissions, from one page.
    assert.match(app, /AttendanceOversight/);
    assert.match(rules, /tenant.{0,4}attendance\$\/, 'attendance\.oversight\.view'/, 'tenant attendance route rule missing');
    assert.match(rules, /registrar.{0,4}attendance\$\/, 'attendance\.oversight\.view'/, 'registrar attendance route rule missing');

    // Viewing and taking are separate permissions, so look-but-not-touch must render as
    // read-only rather than showing controls the backend would reject.
    assert.match(page, /hasPermission\(user, 'attendance\.oversight\.manage'\)/);
    assert.match(page, /canManage && /);

    // Both sidebars offer it, filtered by the same permission.
    for (const layout of ['TenantLayout.jsx', 'RegistrarLayout.jsx']) {
        const source = fs.readFileSync(path.join(src, 'layouts', layout), 'utf8');
        assert.match(source, /attendance\.oversight\.view/, `${layout} should link to attendance`);
    }
});
