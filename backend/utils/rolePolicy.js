const ROLE_SCOPE = Object.freeze({
    platform_owner: 'platform',
    super_admin: 'tenant',
    finance_director: 'tenant',
    hr_payroll_manager: 'tenant',
    parent: 'tenant',
    branch_admin: 'branch',
    teacher: 'branch',
    dugsi_teacher: 'branch',
    cashier: 'branch',
    registrar: 'branch',
    student: 'branch',
    // Support staff who never open the app — a watchman, driver, cook. One branch each, like
    // a teacher. Held for payroll only: zero permissions, no email, no password.
    general_staff: 'branch'
});

const TENANT_ADMIN_CREATABLE_ROLES = new Set([
    'finance_director',
    'hr_payroll_manager',
    'branch_admin',
    'general_staff'
]);

const BRANCH_ADMIN_CREATABLE_ROLES = new Set([
    'teacher',
    'dugsi_teacher',
    'cashier',
    'registrar',
    'general_staff'
]);

const normalizeRole = (value = '') => String(value).trim().toLowerCase();
const normalizeScope = (value = '') => String(value).trim().toLowerCase();

const getExpectedScope = (role) => ROLE_SCOPE[normalizeRole(role)] || null;

const assertValidRoleScope = (role, scope) => {
    const normalizedRole = normalizeRole(role);
    const normalizedScope = normalizeScope(scope);
    const expectedScope = getExpectedScope(normalizedRole);

    if (!expectedScope) {
        throw new Error('Unsupported user role');
    }
    if (normalizedScope !== expectedScope) {
        throw new Error(`Role ${normalizedRole} requires ${expectedScope} scope`);
    }

    return { role: normalizedRole, scope: normalizedScope };
};

module.exports = {
    BRANCH_ADMIN_CREATABLE_ROLES,
    ROLE_SCOPE,
    TENANT_ADMIN_CREATABLE_ROLES,
    assertValidRoleScope,
    getExpectedScope,
    normalizeRole,
    normalizeScope
};
