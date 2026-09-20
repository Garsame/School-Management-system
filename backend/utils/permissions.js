const { ROLE_SCOPE } = require('./rolePolicy');

const normalizePermissionList = (values = []) => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
};

/**
 * Plan tiers by rank, weakest first. A permission carrying `minPlanTier` can only be granted
 * by a school on that tier or higher, so a custom role can never reach past what the school
 * pays for.
 *
 * Two naming schemes exist in this codebase: platformController seeds basic/pro/enterprise,
 * while the showcase seeds foundation/growth/excellence. Both are mapped, because ranking an
 * unknown slug as the lowest tier would silently deny a paying school everything above it.
 */
const PLAN_TIERS = Object.freeze({
    basic: 0,
    foundation: 0,
    pro: 1,
    growth: 1,
    enterprise: 2,
    excellence: 2
});

const PLAN_TIER_ORDER = Object.freeze(['basic', 'pro', 'enterprise']);

const planTierRank = (slug) => {
    const key = String(slug || '').trim().toLowerCase();
    // Unknown slugs fall to the lowest tier: a plan we cannot place must not unlock more
    // than the cheapest one does.
    return Object.prototype.hasOwnProperty.call(PLAN_TIERS, key) ? PLAN_TIERS[key] : 0;
};

/**
 * Phase 2 — a permission's hard constraint is SCOPE, not role.
 *
 * `allowedRoles` used to decide who could ever hold a permission, which made it impossible
 * to build a role the platform had not anticipated — a Branch Admin who approves invoices,
 * or an Admission Manager who also manages classes. But the real constraint was never the
 * role. `branch.students.view` is meaningless to a tenant-scoped user with no branch; it is
 * perfectly sensible for any branch-scoped role.
 *
 * So the role list becomes `suggestedRoles`, a UI grouping hint with no enforcement power,
 * and `requiredScope` carries the constraint:
 *
 *   'platform'  only platform-scoped users
 *   'tenant'    needs school-wide context
 *   'branch'    needs a branch context
 *   'any'       works at either tenant or branch scope
 *
 * The scope is derived from the roles that hold the permission today, so the migration is
 * exact by construction rather than 157 hand edits. Where a permission is already held by
 * both tenant- and branch-scoped roles it becomes 'any' — that is 35 of them, including
 * every branch.* permission a super admin can already use.
 */
const deriveRequiredScope = (roles = []) => {
    const scopes = [...new Set(roles.map((role) => ROLE_SCOPE[role]).filter(Boolean))];
    if (!scopes.length) return 'any';
    if (scopes.includes('platform')) return 'platform';
    return scopes.length > 1 ? 'any' : scopes[0];
};

const createPermission = (key, label, group, description, suggestedRoles = [], options = {}) => ({
    key,
    label,
    group,
    description,
    // Which roles hold this by default. A hint for grouping the picker — it no longer
    // decides who may be granted the permission.
    suggestedRoles,
    requiredScope: options.requiredScope || deriveRequiredScope(suggestedRoles),
    minPlanTier: options.minPlanTier || null,
    // Retained so anything still reading allowedRoles keeps working. Deprecated: read
    // suggestedRoles for display and requiredScope for enforcement.
    allowedRoles: suggestedRoles
});

/**
 * Can a role of `scope` hold a permission requiring `requiredScope`?
 *
 * Platform is a hard boundary in both directions: a school must never grant itself platform
 * access, and a platform owner does not operate inside one school's branch.
 */
const isScopeCompatible = (requiredScope, scope) => {
    if (requiredScope === 'platform') return scope === 'platform';
    if (scope === 'platform') return false;
    if (requiredScope === 'any') return scope === 'tenant' || scope === 'branch';
    return requiredScope === scope;
};

const PERMISSION_CATALOG = Object.freeze([
    createPermission('platform.dashboard.view', 'View platform dashboard', 'Platform', 'View global platform health and summary metrics.', ['platform_owner']),
    createPermission('platform.tenants.view', 'View tenants', 'Platform', 'View schools registered on the platform.', ['platform_owner']),
    createPermission('platform.tenants.create', 'Create tenants', 'Platform', 'Create schools from the platform console.', ['platform_owner']),
    createPermission('platform.tenants.approve', 'Approve tenants', 'Platform', 'Approve pending school registrations.', ['platform_owner']),
    createPermission('platform.tenants.reject', 'Reject tenants', 'Platform', 'Reject pending school registrations.', ['platform_owner']),
    createPermission('platform.tenants.activate', 'Activate tenants', 'Platform', 'Activate approved schools.', ['platform_owner']),
    createPermission('platform.tenants.deactivate', 'Deactivate tenants', 'Platform', 'Suspend schools from platform access.', ['platform_owner']),
    createPermission('platform.tenants.update', 'Update tenants', 'Platform', 'Update school platform records.', ['platform_owner']),
    createPermission('platform.tenants.plan.update', 'Update tenant plans', 'Platform', 'Change a school subscription plan.', ['platform_owner']),
    createPermission('platform.plans.view', 'View platform plans', 'Platform', 'View platform subscription plans.', ['platform_owner']),
    createPermission('platform.plans.create', 'Create platform plans', 'Platform', 'Create subscription plans.', ['platform_owner']),
    createPermission('platform.plans.update', 'Update platform plans', 'Platform', 'Edit subscription plans.', ['platform_owner']),
    createPermission('platform.plans.delete', 'Delete platform plans', 'Platform', 'Remove unused subscription plans.', ['platform_owner']),
    createPermission('platform.billing.view', 'View platform billing', 'Platform', 'View school subscription invoices, payments, and revenue.', ['platform_owner']),
    createPermission('platform.billing.manage', 'Manage platform billing', 'Platform', 'Create school subscription invoices.', ['platform_owner']),
    createPermission('platform.billing.payments.record', 'Record subscription payments', 'Platform', 'Record school subscription payments.', ['platform_owner']),
    createPermission('platform.billing.payments.reverse', 'Reverse subscription payments', 'Platform', 'Reverse school subscription payments.', ['platform_owner']),
    createPermission('platform.audit.view', 'View platform audit logs', 'Platform', 'Review platform-level audit events.', ['platform_owner']),
    createPermission('platform.monitoring.view', 'View monitoring', 'Platform', 'View system health and monitoring information.', ['platform_owner']),
    createPermission('platform.settings.view', 'View platform settings', 'Platform', 'View platform branding and SMTP settings.', ['platform_owner']),
    createPermission('platform.settings.update', 'Update platform settings', 'Platform', 'Update platform branding and SMTP settings.', ['platform_owner']),
    createPermission('platform.smtp.test', 'Test platform SMTP', 'Platform', 'Send platform SMTP test messages.', ['platform_owner']),

    createPermission('tenant.dashboard.view', 'View school dashboard', 'School Admin', 'View institution dashboard and summary metrics.', ['super_admin']),
    createPermission('tenant.branding.view', 'View school branding', 'School Admin', 'View institution branding settings.', ['super_admin']),
    createPermission('tenant.branding.update', 'Update school branding', 'School Admin', 'Update school logo, colors, and branding.', ['super_admin']),
    createPermission('tenant.branches.view', 'View branches', 'School Admin', 'View school branches.', ['super_admin']),
    createPermission('tenant.branches.create', 'Create branches', 'School Admin', 'Create school branches.', ['super_admin']),
    createPermission('tenant.branches.update', 'Update branches', 'School Admin', 'Edit branch information.', ['super_admin']),
    createPermission('tenant.branches.activate', 'Activate branches', 'School Admin', 'Reactivate branches.', ['super_admin']),
    createPermission('tenant.branches.deactivate', 'Deactivate branches', 'School Admin', 'Suspend branches.', ['super_admin']),
    createPermission('tenant.users.view', 'View users', 'School Admin', 'View school users.', ['super_admin']),
    createPermission('tenant.users.create', 'Create users', 'School Admin', 'Create school and branch users.', ['super_admin']),
    createPermission('tenant.users.update', 'Update users', 'School Admin', 'Edit user profile and assignments.', ['super_admin']),
    createPermission('tenant.users.activate', 'Activate users', 'School Admin', 'Reactivate suspended users.', ['super_admin']),
    createPermission('tenant.users.deactivate', 'Deactivate users', 'School Admin', 'Suspend user accounts.', ['super_admin']),
    createPermission('tenant.users.password.reset', 'Reset user passwords', 'School Admin', 'Set a new temporary password for a user.', ['super_admin']),
    createPermission('tenant.users.permissions.view', 'View user permissions', 'School Admin', 'View effective permissions for users.', ['super_admin']),
    createPermission('tenant.users.permissions.update', 'Update user permissions', 'School Admin', 'Change user-specific allowed and denied permissions.', ['super_admin']),
    createPermission('tenant.roles.view', 'View roles', 'School Admin', 'View the roles this school hands out.', ['super_admin']),
    createPermission('tenant.roles.create', 'Create roles', 'School Admin', 'Create new roles for this school.', ['super_admin']),
    createPermission('tenant.roles.update', 'Update roles', 'School Admin', 'Rename roles and change what they grant.', ['super_admin']),
    createPermission('tenant.roles.delete', 'Delete roles', 'School Admin', 'Archive roles that are no longer used.', ['super_admin']),
    createPermission('tenant.roles.assign', 'Assign roles', 'School Admin', 'Move users between roles.', ['super_admin']),

    createPermission('tenant.academicYears.view', 'View academic years', 'School Admin', 'View school academic years.', ['super_admin']),
    createPermission('tenant.academicYears.create', 'Create academic years', 'School Admin', 'Create new academic years.', ['super_admin']),
    createPermission('tenant.academicYears.update', 'Update academic years', 'School Admin', 'Edit academic years.', ['super_admin']),
    createPermission('tenant.academicYears.delete', 'Delete academic years', 'School Admin', 'Delete empty academic years.', ['super_admin']),
    createPermission('tenant.academicYears.setCurrent', 'Set current academic year', 'School Admin', 'Mark an academic year as current.', ['super_admin']),
    createPermission('tenant.academicPolicy.view', 'View academic policy', 'School Admin', 'View grading, term, and graduation policy.', ['super_admin']),
    createPermission('tenant.academicPolicy.update', 'Update academic policy', 'School Admin', 'Manage grading, term, and graduation policy.', ['super_admin']),
    createPermission('tenant.reports.view', 'View school reports', 'School Admin', 'View tenant-level reports.', ['super_admin']),
    createPermission('tenant.audit.view', 'View school audit logs', 'School Admin', 'View tenant-level audit events.', ['super_admin']),

    createPermission('branch.dashboard.view', 'View branch dashboard', 'Branch', 'View branch dashboard metrics.', ['super_admin', 'branch_admin']),
    createPermission('branch.classes.view', 'View classes', 'Branch', 'View branch classes and academic setup.', ['super_admin', 'branch_admin', 'registrar', 'teacher']),
    createPermission('branch.classes.create', 'Create classes', 'Branch', 'Create branch classes.', ['super_admin', 'branch_admin']),
    createPermission('branch.classes.update', 'Update classes', 'Branch', 'Edit branch classes.', ['super_admin', 'branch_admin']),
    createPermission('branch.subjects.manage', 'Manage subjects', 'Branch', 'Manage subjects and class-subject mappings.', ['super_admin', 'branch_admin']),
    createPermission('branch.sections.manage', 'Manage sections', 'Branch', 'Manage branch sections.', ['super_admin', 'branch_admin']),
    createPermission('branch.timetable.view', 'View timetable', 'Branch', 'View branch timetable.', ['super_admin', 'branch_admin', 'teacher', 'student']),
    createPermission('branch.timetable.manage', 'Manage timetable', 'Branch', 'Create and update timetable slots.', ['super_admin', 'branch_admin']),
    createPermission('branch.staff.view', 'View branch staff', 'Branch', 'View branch staff accounts.', ['super_admin', 'branch_admin']),
    createPermission('branch.staff.create', 'Create branch staff', 'Branch', 'Create teacher, cashier, and registrar accounts.', ['super_admin', 'branch_admin']),
    createPermission('branch.staff.update', 'Update branch staff', 'Branch', 'Edit branch staff accounts.', ['super_admin', 'branch_admin']),
    createPermission('branch.staff.activate', 'Activate branch staff', 'Branch', 'Reactivate branch staff accounts.', ['super_admin', 'branch_admin']),
    createPermission('branch.staff.deactivate', 'Deactivate branch staff', 'Branch', 'Suspend branch staff accounts.', ['super_admin', 'branch_admin']),
    createPermission('branch.students.view', 'View branch students', 'Branch', 'View students in a branch.', ['super_admin', 'branch_admin', 'registrar', 'teacher']),
    createPermission('branch.students.detail', 'View branch student details', 'Branch', 'View detailed student records in a branch.', ['super_admin', 'branch_admin', 'registrar', 'teacher']),
    // super_admin is included so the head of school can run these directly. A school with a
    // single campus has no branch admin to delegate to, and listing super_admin here widens
    // the derived scope to 'any', which is what lets a school-wide role hold them.
    createPermission('branch.transfers.run', 'Run branch transfers', 'Branch', 'Transfer students between branches.', ['super_admin', 'branch_admin']),
    createPermission('branch.promotions.run', 'Run branch promotions', 'Branch', 'Promote students to the next grade.', ['super_admin', 'branch_admin']),
    createPermission('branch.assignments.view', 'View teacher assignments', 'Branch', 'View branch teacher assignments.', ['super_admin', 'branch_admin']),
    createPermission('branch.assignments.manage', 'Manage teacher assignments', 'Branch', 'Create and update teacher assignments.', ['super_admin', 'branch_admin']),
    createPermission('branch.exams.view', 'View branch exams', 'Branch', 'View exams in the branch.', ['super_admin', 'branch_admin']),
    createPermission('branch.exams.create', 'Create branch exams', 'Branch', 'Create exams in the branch.', ['super_admin', 'branch_admin']),
    createPermission('branch.exams.update', 'Update branch exams', 'Branch', 'Update exam status and metadata.', ['super_admin', 'branch_admin']),
    createPermission('branch.exams.delete', 'Delete branch exams', 'Branch', 'Delete exams without protected results.', ['super_admin', 'branch_admin']),
    createPermission('branch.results.view', 'View branch results', 'Branch', 'View branch results and summaries.', ['super_admin', 'branch_admin']),
    createPermission('branch.results.export', 'Export branch results', 'Branch', 'Export branch result data.', ['super_admin', 'branch_admin']),
    createPermission('branch.reports.view', 'View branch reports', 'Branch', 'View branch reports.', ['super_admin', 'branch_admin']),

    createPermission('finance.dashboard.view', 'View finance dashboard', 'Finance', 'View finance dashboard and collection summaries.', ['finance_director']),
    createPermission('finance.policies.view', 'View finance policies', 'Finance', 'View finance policy settings.', ['finance_director']),
    createPermission('finance.policies.update', 'Update finance policies', 'Finance', 'Update finance policy settings.', ['finance_director']),
    createPermission('finance.feeStructures.view', 'View fee structures', 'Finance', 'View fee structures.', ['finance_director']),
    createPermission('finance.feeStructures.create', 'Create fee structures', 'Finance', 'Create fee structures.', ['finance_director']),
    createPermission('finance.feeStructures.update', 'Update fee structures', 'Finance', 'Edit fee structures.', ['finance_director']),
    createPermission('finance.feeStructures.delete', 'Delete fee structures', 'Finance', 'Delete fee structures.', ['finance_director']),
    createPermission('finance.invoices.view', 'View invoices', 'Finance', 'View invoices.', ['finance_director']),
    createPermission('finance.invoices.generate', 'Generate invoices', 'Finance', 'Generate invoices for students.', ['finance_director']),
    createPermission('finance.invoices.detail', 'View invoice details', 'Finance', 'View invoice detail pages.', ['finance_director']),
    createPermission('finance.payments.view', 'View payments', 'Finance', 'View payments.', ['finance_director']),
    createPermission('finance.payments.summary', 'View payment summary', 'Finance', 'View payment summaries.', ['finance_director']),
    createPermission('finance.reports.view', 'View finance reports', 'Finance', 'View finance reports.', ['finance_director']),
    createPermission('finance.outstanding.view', 'View outstanding balances', 'Finance', 'View outstanding balances.', ['finance_director']),
    createPermission('finance.receiptBranding.view', 'View receipt branding', 'Finance', 'View receipt branding.', ['finance_director']),
    createPermission('finance.receiptBranding.update', 'Update receipt branding', 'Finance', 'Update receipt branding.', ['finance_director']),
    createPermission('finance.paymentReversals.approve', 'Approve payment reversals', 'Finance', 'Approve or perform payment reversals.', ['finance_director']),
    createPermission('finance.compensation.view', 'View compensation requests', 'Finance', 'View employee compensation change requests.', ['finance_director']),
    createPermission('finance.compensation.approve', 'Approve compensation requests', 'Finance', 'Approve or reject employee compensation changes.', ['finance_director']),

    createPermission('registrar.dashboard.view', 'View registrar dashboard', 'Registrar', 'View registrar dashboard.', ['registrar', 'super_admin']),
    createPermission('students.view', 'View students', 'Students', 'Search and view students.', ['super_admin', 'branch_admin', 'registrar', 'teacher']),
    createPermission('students.detail', 'View student details', 'Students', 'View detailed student records.', ['super_admin', 'branch_admin', 'registrar', 'teacher', 'student', 'parent']),
    createPermission('students.create', 'Admit students', 'Students', 'Create student admission records.', ['super_admin', 'branch_admin', 'registrar']),
    createPermission('students.update', 'Update students', 'Students', 'Edit student profile records.', ['super_admin', 'branch_admin', 'registrar']),
    createPermission('students.password.reset', 'Reset student passwords', 'Students', 'Reset student portal passwords.', ['super_admin', 'branch_admin', 'registrar']),
    createPermission('enrollments.create', 'Create enrollments', 'Enrollments', 'Create or re-enroll students.', ['super_admin', 'branch_admin', 'registrar']),

    createPermission('cashier.dashboard.view', 'View cashier dashboard', 'Cashier', 'View cashier dashboard.', ['finance_director', 'cashier']),
    createPermission('cashier.invoices.search', 'Search invoices', 'Cashier', 'Search invoices for payment.', ['finance_director', 'cashier']),
    createPermission('cashier.invoices.detail', 'View cashier invoice details', 'Cashier', 'View invoice details from cashier portal.', ['finance_director', 'cashier']),
    createPermission('cashier.payments.view', 'View cashier payments', 'Cashier', 'View cashier payment history.', ['finance_director', 'cashier']),
    createPermission('cashier.payments.create', 'Record payments', 'Cashier', 'Record student payments.', ['finance_director', 'cashier']),
    createPermission('cashier.payments.reverse', 'Reverse payments', 'Cashier', 'Reverse payments from cashier portal.', ['finance_director', 'cashier']),
    createPermission('cashier.receipts.view', 'View receipts', 'Cashier', 'View payment receipts.', ['finance_director', 'cashier']),
    createPermission('cashier.receipts.print', 'Print receipts', 'Cashier', 'Print payment receipts.', ['finance_director', 'cashier']),

    createPermission('teacher.dashboard.view', 'View teacher dashboard', 'Teacher', 'View teacher dashboard.', ['teacher']),
    createPermission('teacher.schedule.view', 'View teacher schedule', 'Teacher', 'View teacher timetable.', ['teacher']),
    createPermission('teacher.attendance.view', 'View teacher attendance', 'Teacher', 'View teacher attendance sessions.', ['teacher']),
    createPermission('teacher.attendance.open', 'Open attendance', 'Teacher', 'Open attendance sessions.', ['teacher']),
    createPermission('teacher.attendance.submit', 'Submit attendance', 'Teacher', 'Submit attendance records.', ['teacher']),
    createPermission('teacher.leaves.create', 'Request teacher leave', 'Teacher', 'Create leave requests.', ['teacher']),
    createPermission('teacher.examTemplates.view', 'View exam templates', 'Teacher', 'View exam templates.', ['teacher']),
    createPermission('teacher.examTemplates.manage', 'Manage exam templates', 'Teacher', 'Manage exam templates.', ['teacher']),
    createPermission('teacher.examCategories.view', 'View exam categories', 'Teacher', 'View exam categories.', ['teacher']),
    createPermission('teacher.examCategories.manage', 'Manage exam categories', 'Teacher', 'Manage exam categories.', ['teacher']),
    createPermission('teacher.exams.view', 'View teacher exams', 'Teacher', 'View exams assigned to the teacher.', ['teacher']),
    createPermission('teacher.results.enter', 'Enter results', 'Teacher', 'Enter results for assigned classes.', ['teacher']),
    createPermission('teacher.results.update', 'Update results', 'Teacher', 'Update results for assigned classes.', ['teacher']),
    createPermission('teacher.results.view', 'View teacher results', 'Teacher', 'View result summaries.', ['teacher']),
    createPermission('teacher.results.export', 'Export teacher results', 'Teacher', 'Export result data.', ['teacher']),
    createPermission('teacher.gradingPolicy.view', 'View grading policy', 'Teacher', 'View grading policy.', ['teacher']),
    createPermission('teacher.gradingPolicy.manage', 'Manage grading policy', 'Teacher', 'Manage grading policy.', ['teacher']),

    // Attendance oversight. Until now attendance could only be seen by the teacher who
    // took it, the student, or their parent — nobody running the school could look at it.
    // Listed against both a tenant-scoped and a branch-scoped role so the derived scope is
    // 'any': a single-campus head of school and a per-branch admissions officer both need it.
    createPermission('attendance.oversight.view', 'View school attendance', 'Attendance', 'See attendance for any class, and any student history.', ['super_admin', 'registrar']),
    createPermission('attendance.oversight.manage', 'Take school attendance', 'Attendance', 'Open attendance for any class, mark it, and close it.', ['super_admin', 'registrar']),

    createPermission('hr.leaves.create', 'Create leave requests', 'HR', 'Create staff leave requests.', ['teacher', 'cashier', 'registrar', 'branch_admin']),
    createPermission('hr.dashboard.view', 'View HR dashboard', 'HR', 'View school-wide staffing and payroll summaries.', ['hr_payroll_manager']),
    createPermission('hr.employees.view', 'View employees', 'HR', 'View employee and compensation profiles.', ['hr_payroll_manager']),
    createPermission('hr.employees.update', 'Request employee changes', 'HR', 'Submit employee compensation changes for Finance approval.', ['hr_payroll_manager']),
    createPermission('hr.leaves.view', 'View leave requests', 'HR', 'View leave requests.', ['super_admin', 'hr_payroll_manager', 'branch_admin', 'teacher', 'cashier', 'registrar']),
    createPermission('hr.leaves.review', 'Review leave requests', 'HR', 'Approve or reject leave requests.', ['super_admin', 'hr_payroll_manager', 'branch_admin']),
    createPermission('payroll.self.view', 'View own payroll', 'Payroll', 'View own payroll records.', ['teacher', 'cashier', 'registrar', 'branch_admin']),
    createPermission('payroll.view', 'View payroll', 'Payroll', 'View branch or school payroll.', ['super_admin', 'finance_director', 'hr_payroll_manager', 'branch_admin', 'cashier']),
    createPermission('payroll.generate', 'Generate payroll', 'Payroll', 'Generate payroll records.', ['hr_payroll_manager']),
    createPermission('payroll.review', 'Review payroll', 'Payroll', 'Review draft payroll records.', ['hr_payroll_manager']),
    createPermission('payroll.approve', 'Approve payroll', 'Payroll', 'Approve reviewed payroll records.', ['finance_director']),
    createPermission('payroll.pay', 'Mark payroll paid', 'Payroll', 'Mark approved payroll as paid.', ['super_admin', 'cashier']),

    createPermission('student.dashboard.view', 'View student dashboard', 'Student', 'View own student dashboard.', ['student']),
    createPermission('student.results.view', 'View own results', 'Student', 'View own results.', ['student']),
    createPermission('student.rank.view', 'View own rank', 'Student', 'View own rank.', ['student']),
    createPermission('student.schedule.view', 'View own schedule', 'Student', 'View own timetable.', ['student']),
    createPermission('student.attendance.view', 'View own attendance', 'Student', 'View own attendance.', ['student']),
    createPermission('student.profile.view', 'View own profile', 'Student', 'View own student profile.', ['student']),
    createPermission('student.password.change', 'Change own password', 'Student', 'Change student password.', ['student']),

    createPermission('parent.dashboard.view', 'View parent dashboard', 'Parent', 'View parent dashboard.', ['parent']),
    createPermission('parent.students.view', 'View linked students', 'Parent', 'View linked students.', ['parent']),
    createPermission('parent.grades.view', 'View child grades', 'Parent', 'View linked student grades.', ['parent']),
    createPermission('parent.attendance.view', 'View child attendance', 'Parent', 'View linked student attendance.', ['parent']),
    createPermission('parent.invoices.view', 'View child invoices', 'Parent', 'View linked student invoices.', ['parent']),
    createPermission('parent.notifications.view', 'View parent notifications', 'Parent', 'View parent notifications.', ['parent']),
    createPermission('parent.notifications.markRead', 'Mark notifications read', 'Parent', 'Mark parent notifications as read.', ['parent']),
    createPermission('parent.profile.view', 'View own parent profile', 'Parent', 'View own parent profile.', ['parent']),
    createPermission('parent.password.change', 'Change parent password', 'Parent', 'Change parent password.', ['parent'])
]);

const PERMISSION_KEYS = new Set(PERMISSION_CATALOG.map((permission) => permission.key));

const keysForRoles = (...roles) => PERMISSION_CATALOG
    .filter((permission) => permission.allowedRoles.some((role) => roles.includes(role)))
    .map((permission) => permission.key);

const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
    platform_owner: keysForRoles('platform_owner'),
    super_admin: keysForRoles('super_admin'),
    finance_director: keysForRoles('finance_director'),
    hr_payroll_manager: keysForRoles('hr_payroll_manager'),
    branch_admin: keysForRoles('branch_admin').filter((key) => !key.startsWith('payroll.')),
    registrar: keysForRoles('registrar'),
    cashier: keysForRoles('cashier').filter((key) => key !== 'cashier.payments.reverse'),
    teacher: keysForRoles('teacher').filter((key) => ![
        'teacher.examTemplates.manage',
        'teacher.examCategories.manage',
        'teacher.gradingPolicy.manage',
        'teacher.results.export'
    ].includes(key)),
    student: keysForRoles('student'),
    parent: keysForRoles('parent')
});

const getDefaultPermissionsForRole = (role = '') => {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return normalizePermissionList(DEFAULT_ROLE_PERMISSIONS[normalizedRole] || []);
};

const isKnownPermission = (permission) => PERMISSION_KEYS.has(permission);

const sanitizePermissions = (values = []) => normalizePermissionList(values).filter(isKnownPermission);

/**
 * Deprecated. Kept so existing callers keep working while they migrate to the scope-based
 * catalog. It answers "which permissions does this role hold by default", which is a
 * display question, not an authorization one.
 */
const getPermissionCatalogForRole = (role = '') => {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return PERMISSION_CATALOG.filter((permission) => permission.suggestedRoles.includes(normalizedRole));
};

/**
 * The administrative ceiling: every permission a school on `planTier` may grant to a role
 * or user of `scope`.
 *
 * This replaces the old allowedRoles whitelist as the enforcement boundary. Phase 1's
 * escalation guard noted that removing the whitelist leaves granting-to-another-account
 * unbounded; this ceiling is what bounds it now. Three limits apply:
 *
 *   1. Scope must match, so a branch role never holds a school-wide permission.
 *   2. Platform permissions are never grantable by a school, at any tier.
 *   3. The school's plan tier caps what can be reached, so a custom role cannot be used
 *      to obtain a capability the school has not paid for.
 */
const getAssignablePermissions = ({ scope = 'tenant', planTier = null } = {}) => {
    const rank = planTierRank(planTier);
    return PERMISSION_CATALOG.filter((permission) => {
        if (permission.requiredScope === 'platform') return false;
        if (!isScopeCompatible(permission.requiredScope, scope)) return false;
        if (permission.minPlanTier && planTierRank(permission.minPlanTier) > rank) return false;
        return true;
    });
};

const sanitizeAssignablePermissionsForScope = (scope = 'tenant', values = [], planTier = null) => {
    const allowed = new Set(getAssignablePermissions({ scope, planTier }).map((permission) => permission.key));
    return sanitizePermissions(values).filter((permission) => allowed.has(permission));
};

/**
 * Which of `values` a school on `planTier` may not grant at `scope`, and why. Returned so
 * callers can tell the user exactly what was rejected rather than failing opaquely.
 */
const findUnassignablePermissions = ({ scope = 'tenant', planTier = null, values = [] } = {}) => {
    const rank = planTierRank(planTier);
    const byKey = new Map(PERMISSION_CATALOG.map((permission) => [permission.key, permission]));

    return normalizePermissionList(values).reduce((rejected, key) => {
        const permission = byKey.get(key);
        if (!permission) {
            rejected.push({ key, reason: 'unknown permission' });
        } else if (permission.requiredScope === 'platform') {
            rejected.push({ key, reason: 'platform permissions cannot be granted by a school' });
        } else if (!isScopeCompatible(permission.requiredScope, scope)) {
            rejected.push({ key, reason: `requires ${permission.requiredScope} scope, but the role is ${scope}-scoped` });
        } else if (permission.minPlanTier && planTierRank(permission.minPlanTier) > rank) {
            rejected.push({ key, reason: `requires the ${permission.minPlanTier} plan or higher` });
        }
        return rejected;
    }, []);
};

/**
 * Deprecated. The old role-boxed filter. Phase 2 moved enforcement to scope, but user-level
 * allow/deny still routes through here until those call sites move to the scope form.
 */
const sanitizeAssignablePermissionsForRole = (role = '', values = []) => {
    const scope = ROLE_SCOPE[String(role || '').trim().toLowerCase()] || 'tenant';
    return sanitizeAssignablePermissionsForScope(scope, values);
};

/**
 * Where a user's baseline permissions come from.
 *
 * A seeded Role holds exactly the same keys as DEFAULT_ROLE_PERMISSIONS, so passing one
 * changes nothing until a school edits it. Users migrated before roleId was backfilled,
 * and platform owners, fall back to the built-in defaults.
 *
 * An inactive role grants nothing: deactivating a role must take access away, not silently
 * fall back to the defaults it was built from.
 */
const resolveRoleDefaults = (user = {}, roleRecord = null) => {
    if (!roleRecord) return getDefaultPermissionsForRole(user.role);
    if (roleRecord.isActive === false) return [];
    return sanitizePermissions(roleRecord.permissions || []);
};

const getUserPermissionParts = (user = {}, roleRecord = null) => {
    const defaults = resolveRoleDefaults(user, roleRecord);
    const allow = sanitizeAssignablePermissionsForRole(user.role, user.permissions?.allow || []);
    const deny = sanitizeAssignablePermissionsForRole(user.role, user.permissions?.deny || []);
    const effectiveSet = new Set([...defaults, ...allow]);

    deny.forEach((permission) => effectiveSet.delete(permission));

    return {
        defaults,
        allow,
        deny,
        effective: [...effectiveSet].sort()
    };
};

const getEffectivePermissions = (user = {}, roleRecord = null) => (
    getUserPermissionParts(user, roleRecord).effective
);

/**
 * Phase 1.6 — privilege escalation guard.
 *
 * A user may never grant a permission they do not themselves hold. Without this, an admin
 * whose own access was narrowed could still hand the removed permission to someone else,
 * or to a second account they control. Today the blast radius is small because the catalog
 * boxes permissions by role; Phase 2 removes that boxing, which makes this the main
 * escalation path.
 *
 * Returns the permissions the actor tried to grant but does not hold.
 */
const findEscalatedPermissions = (actorPermissions = [], requestedPermissions = []) => {
    const held = new Set(normalizePermissionList(actorPermissions));
    return normalizePermissionList(requestedPermissions).filter((permission) => !held.has(permission));
};

module.exports = {
    DEFAULT_ROLE_PERMISSIONS,
    PERMISSION_CATALOG,
    PLAN_TIERS,
    PLAN_TIER_ORDER,
    deriveRequiredScope,
    findEscalatedPermissions,
    findUnassignablePermissions,
    getAssignablePermissions,
    getDefaultPermissionsForRole,
    getEffectivePermissions,
    getPermissionCatalogForRole,
    getUserPermissionParts,
    isScopeCompatible,
    planTierRank,
    resolveRoleDefaults,
    sanitizeAssignablePermissionsForRole,
    sanitizeAssignablePermissionsForScope,
    sanitizePermissions
};
