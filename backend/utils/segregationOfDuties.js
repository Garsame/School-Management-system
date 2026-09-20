/**
 * Segregation of duties.
 *
 * Phase 2 lets a school grant any permission whose scope fits, which is the point — a
 * school decides its own org chart. But some combinations put one person in control of a
 * whole money or trust path with no second signature, and the school should see that at
 * the moment they tick the boxes rather than discover it in an audit.
 *
 * These WARN. They never block. Refusing would put the platform's judgement above the
 * school's, and there are legitimate reasons for every combination below — a one-teacher
 * school genuinely has nobody to delegate to.
 */
const CONFLICTS = Object.freeze([
    {
        key: 'payroll_full_cycle',
        label: 'One person controls the entire payroll cycle',
        permissions: ['payroll.generate', 'payroll.approve', 'payroll.pay'],
        detail: 'Whoever holds this role can create a payroll record, approve it, and mark it paid without anyone else seeing it. Splitting approve or pay onto a second role puts a second signature on the money path.'
    },
    {
        key: 'invoice_to_payment',
        label: 'One person can raise a charge and settle it',
        permissions: ['finance.invoices.generate', 'cashier.payments.create', 'cashier.payments.reverse'],
        detail: 'This role can invoice a student, record the payment, and reverse it again. Cash can be taken without a trace that survives review.'
    },
    {
        key: 'identity_takeover',
        label: 'One person can create an identity and take it over',
        permissions: ['students.create', 'students.password.reset'],
        detail: 'This role can admit a student and then set their portal password, which allows signing in as them.'
    },
    {
        key: 'unobserved_admin',
        label: 'One person can mint a privileged account unobserved',
        permissions: ['tenant.users.create', 'tenant.users.permissions.update'],
        detail: 'This role can create a user and grant it any permission, including creating a second account for themselves with more access than their own.'
    },
    {
        key: 'role_self_service',
        label: 'One person can define roles and assign them',
        permissions: ['tenant.roles.update', 'tenant.roles.assign'],
        detail: 'This role can change what a role grants and move users into it, so access can be widened without a separate approval.'
    }
]);

/**
 * Which conflicts a permission set triggers. A conflict fires only when every permission in
 * it is present — holding two of three is the split we are recommending.
 */
const findDutyConflicts = (permissions = []) => {
    const held = new Set(permissions);
    return CONFLICTS
        .filter((conflict) => conflict.permissions.every((permission) => held.has(permission)))
        .map((conflict) => ({
            key: conflict.key,
            label: conflict.label,
            detail: conflict.detail,
            permissions: conflict.permissions
        }));
};

/**
 * Conflicts that this change introduces — ones not already present before. A school editing
 * an unrelated part of a role should not be re-warned about a split it already accepted.
 */
const findNewDutyConflicts = (beforePermissions = [], afterPermissions = []) => {
    const existing = new Set(findDutyConflicts(beforePermissions).map((conflict) => conflict.key));
    return findDutyConflicts(afterPermissions).filter((conflict) => !existing.has(conflict.key));
};

module.exports = { CONFLICTS, findDutyConflicts, findNewDutyConflicts };
