const rule = (pattern, permission) => ({ pattern, permission });

export const ROUTE_PERMISSION_RULES = [
    rule(/^\/platform$/, 'platform.dashboard.view'),
    rule(/^\/platform\/tenants\/new$/, 'platform.tenants.create'),
    rule(/^\/platform\/tenants(?:\/[^/]+)?$/, 'platform.tenants.view'),
    rule(/^\/platform\/plans$/, 'platform.plans.view'),
    rule(/^\/platform\/audit$/, 'platform.audit.view'),
    rule(/^\/platform\/monitoring$/, 'platform.monitoring.view'),
    rule(/^\/platform\/settings$/, 'platform.settings.view'),

    rule(/^\/tenant$/, 'tenant.dashboard.view'),
    rule(/^\/tenant\/branding$/, 'tenant.branding.view'),
    rule(/^\/tenant\/branches$/, 'tenant.branches.view'),
    rule(/^\/tenant\/users$/, 'tenant.users.view'),
    rule(/^\/tenant\/roles$/, 'tenant.roles.view'),
    rule(/^\/tenant\/staff-permissions$/, 'tenant.users.permissions.view'),
    rule(/^\/tenant\/academic-years$/, 'tenant.academicYears.view'),
    rule(/^\/tenant\/academic-policy$/, 'tenant.academicPolicy.view'),
    rule(/^\/tenant\/reports$/, 'tenant.reports.view'),
    rule(/^\/tenant\/students\/[^/]+$/, 'students.detail'),
    rule(/^\/tenant\/students$/, 'students.view'),
    rule(/^\/tenant\/audit-logs$/, 'tenant.audit.view'),
    rule(/^\/tenant\/attendance$/, 'attendance.oversight.view'),
    rule(/^\/tenant\/dugsi$/, 'dugsi.overview.view'),

    rule(/^\/branch\/dugsi$/, 'dugsi.overview.view'),
    rule(/^\/registrar\/attendance$/, 'attendance.oversight.view'),

    rule(/^\/dugsi(?:\/students)?$/, 'dugsi.students.view'),
    rule(/^\/dugsi\/attendance$/, 'dugsi.attendance.take'),
    rule(/^\/dugsi\/progress$/, 'dugsi.progress.manage'),

    rule(/^\/teacher\/attendance$/, 'teacher.attendance.view'),
    rule(/^\/teacher\/leaves$/, 'teacher.leaves.create'),

    rule(/^\/student$/, 'student.dashboard.view'),
    rule(/^\/student\/results$/, 'student.results.view'),
    rule(/^\/student\/rank$/, 'student.rank.view'),
    rule(/^\/student\/schedule$/, 'student.schedule.view'),
    rule(/^\/student\/attendance$/, 'student.attendance.view'),
    rule(/^\/student\/dugsi$/, 'dugsi.student.view'),
    rule(/^\/student\/profile$/, 'student.profile.view'),
    rule(/^\/student\/change-password$/, 'student.password.change'),

    rule(/^\/parent\/profile$/, 'parent.profile.view'),
    rule(/^\/parent$/, 'parent.dashboard.view'),
    rule(/^\/parent\/grades$/, 'parent.grades.view'),
    rule(/^\/parent\/attendance$/, 'parent.attendance.view'),
    rule(/^\/parent\/invoices$/, 'parent.invoices.view'),
    rule(/^\/parent\/students\/[^/]+\/dugsi$/, 'dugsi.parent.view')
];

export const getRequiredPermissionForPath = (pathname = '') => (
    ROUTE_PERMISSION_RULES.find(({ pattern }) => pattern.test(pathname))?.permission || null
);
