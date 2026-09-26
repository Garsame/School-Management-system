import {
    Activity,
    AlertCircle,
    ArrowRightLeft,
    ArrowUpCircle,
    Award,
    BadgeDollarSign,
    Banknote,
    BarChart3,
    BookOpen,
    BriefcaseBusiness,
    Calendar,
    CalendarCheck,
    CalendarDays,
    CalendarRange,
    ClipboardCheck,
    ClipboardList,
    CreditCard,
    DollarSign,
    FileSpreadsheet,
    FileText,
    GraduationCap,
    History,
    KeyRound,
    LayoutDashboard,
    MapPin,
    Palette,
    PenTool,
    PieChart,
    Receipt,
    Settings,
    ShieldCheck,
    User as UserIcon,
    UserPlus,
    UserRound,
    Users,
    WalletCards
} from 'lucide-react';
import { hasAnyPermission, hasAllPermissions, hasPermission } from '../utils/permissions';

/**
 * Every staff page, grouped by the area it lives in.
 *
 * A person's menu is built from the features their role holds, not from the role's name:
 * their own area comes first, then any page from another area they have the permission for.
 * A Finance Officer who holds "record payment" gets Record Payment, although that page lives
 * in the payments desk. The pages and their addresses do not change.
 *
 * Item fields:
 *   permission / anyPermission   what opening the page needs
 *   feature                      pages that do the same job in several areas (payroll,
 *                                attendance, leave). The first one reached is shown and the
 *                                rest are skipped, so nobody sees Payroll twice.
 *   homeOnly                     only in the person's own area (their profile)
 *   quietFor                     roles that hold the page's permission only so their own
 *                                pages can read data. It stays out of their menu unless they
 *                                also hold one of quietFor.unless.
 *
 * Area fields:
 *   scope   the account scope the area's pages need from the server ('tenant', 'branch', or
 *           'any'). A school-wide account cannot use branch pages and the reverse.
 *   roles   when set, only these roles can use the area at all (teacher pages are bound to
 *           the teacher's own record on the server).
 */
export const STAFF_AREAS = [
    {
        key: 'school',
        label: 'School management',
        home: '/tenant',
        scope: 'tenant',
        items: [
            { label: 'Dashboard', path: '/tenant', icon: LayoutDashboard, permission: 'tenant.dashboard.view', keywords: ['home', 'main', 'index', 'overview'] },
            {
                key: 'school_setup',
                label: 'School Setup',
                icon: Settings,
                keywords: ['branding', 'branches', 'academic years', 'curriculum', 'policy'],
                children: [
                    { label: 'Branding', path: '/tenant/branding', icon: Palette, permission: 'tenant.branding.view', keywords: ['logo', 'color', 'theme', 'appearance', 'style', 'white-label'] },
                    { label: 'Branches', path: '/tenant/branches', icon: MapPin, permission: 'tenant.branches.view', keywords: ['campus', 'location', 'schools', 'branch', 'offices'] },
                    { label: 'Academic Years', path: '/tenant/academic-years', icon: Calendar, permission: 'tenant.academicYears.view', keywords: ['calendar', 'terms', 'semesters', 'years', 'dates'] },
                    { label: 'Academic Policy', path: '/tenant/academic-policy', icon: GraduationCap, permission: 'tenant.academicPolicy.view', keywords: ['curriculum', 'grade', 'rules', 'classes', 'education'] }
                ]
            },
            {
                key: 'staff_security',
                label: 'Staff & Roles',
                icon: ShieldCheck,
                keywords: ['staff', 'accounts', 'roles', 'permissions', 'audit', 'logs'],
                children: [
                    { label: 'Staff Accounts', path: '/tenant/users', icon: Users, permission: 'tenant.users.view', keywords: ['administrators', 'finance director', 'accounts', 'admins', 'staff', 'users', 'teacher', 'create user'] },
                    { label: 'Roles & Features', path: '/tenant/roles', icon: ShieldCheck, permission: 'tenant.roles.view', keywords: ['roles', 'features', 'access', 'permissions', 'turn off', 'rename'] },
                    { label: 'Staff Permissions', path: '/tenant/staff-permissions', icon: KeyRound, permission: 'tenant.users.permissions.view', keywords: ['staff', 'cashier', 'teacher', 'registrar', 'security', 'permissions', 'exceptions'] },
                    { label: 'Audit Logs', path: '/tenant/audit-logs', icon: ClipboardList, permission: 'tenant.audit.view', keywords: ['history', 'security', 'actions', 'events', 'records', 'activity'] }
                ]
            },
            {
                key: 'school_academics',
                label: 'Academics & Operations',
                icon: BookOpen,
                keywords: ['students', 'attendance', 'dugsi', 'classes', 'oversight'],
                children: [
                    { label: 'Students', path: '/tenant/students', icon: GraduationCap, permission: 'students.view', keywords: ['students', 'classes', 'history', 'enrollment'] },
                    { label: 'Attendance', path: '/tenant/attendance', icon: CalendarCheck, permission: 'attendance.oversight.view', feature: 'attendance', keywords: ['attendance', 'register', 'present', 'absent', 'late'] },
                    { label: 'Dugsi Oversight', path: '/tenant/dugsi', icon: BookOpen, permission: 'dugsi.overview.view', keywords: ['dugsi', 'quran', 'oversight', 'classes', 'allocations'] }
                ]
            },
            { label: 'Reports', path: '/tenant/reports', icon: BarChart3, permission: 'tenant.reports.view', keywords: ['stats', 'analytics', 'charts', 'performance', 'summary'] },
            { label: 'My Profile', path: '/tenant/profile', icon: UserIcon, homeOnly: true, keywords: ['profile', 'account', 'personal', 'avatar'] }
        ]
    },
    {
        key: 'hr',
        label: 'People management',
        home: '/hr',
        scope: 'tenant',
        items: [
            { label: 'HR Dashboard', path: '/hr', icon: LayoutDashboard, permission: 'hr.dashboard.view', keywords: ['overview', 'summary', 'home'] },
            {
                key: 'hr_staff_leaves',
                label: 'Staff & Leaves',
                icon: UserRound,
                keywords: ['employees', 'staff', 'leaves', 'vacation', 'timeoff'],
                children: [
                    { label: 'Employees', path: '/hr/employees', icon: UserRound, permission: 'hr.employees.view', keywords: ['staff', 'salary profiles', 'compensation'] },
                    { label: 'Leave Management', path: '/hr/leaves', icon: CalendarCheck, permission: 'hr.leaves.review', feature: 'leaves', keywords: ['absence', 'time off', 'requests'] }
                ]
            },
            {
                key: 'hr_payroll_group',
                label: 'Payroll & Compensation',
                icon: WalletCards,
                keywords: ['payroll', 'salary', 'payslips', 'reports', 'pay run'],
                children: [
                    { label: 'Payroll', path: '/hr/payroll', icon: WalletCards, permission: 'payroll.view', feature: 'payroll', keywords: ['salary', 'pay run', 'payslips', 'approve'] },
                    { label: 'Payroll Reports', path: '/hr/reports', icon: BarChart3, permission: 'payroll.view', feature: 'payroll', keywords: ['totals', 'analysis', 'history'] }
                ]
            },
            { label: 'My Profile', path: '/hr/profile', icon: UserIcon, homeOnly: true, keywords: ['account', 'personal', 'avatar'] }
        ]
    },
    {
        key: 'finance',
        label: 'Finance management',
        home: '/finance',
        scope: 'tenant',
        items: [
            { label: 'Finance Dashboard', path: '/finance', icon: LayoutDashboard, permission: 'finance.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary'] },
            {
                key: 'finance_payments',
                label: 'Payments',
                icon: Receipt,
                keywords: ['pay', 'payment', 'record', 'lookup', 'history', 'outstanding', 'collection', 'ledger'],
                children: [
                    { label: 'Record Payment', path: '/cashier/payments/new', icon: Receipt, permission: 'cashier.payments.create', keywords: ['pay', 'new', 'payment', 'record', 'collect', 'receive'] },
                    { label: 'Invoice Lookup', path: '/cashier/invoices', icon: FileText, permission: 'cashier.invoices.search', keywords: ['invoice', 'search', 'find', 'lookup'] },
                    { label: 'Payment History', path: '/cashier/payments', icon: History, permission: 'cashier.payments.view', keywords: ['history', 'log', 'payments', 'past', 'receipts'] },
                    { label: 'Monthly Collection', path: '/finance/monthly', icon: CalendarRange, permission: 'finance.invoices.view', keywords: ['month', 'monthly', 'who paid', 'partial', 'unpaid', 'late', 'debt', 'excel', 'collection'] },
                    { label: 'Outstanding', path: '/finance/outstanding', icon: AlertCircle, permission: 'finance.outstanding.view', keywords: ['debtors', 'debt', 'unpaid', 'balances'] },
                    { label: 'Payments Ledger', path: '/finance/payments', icon: History, permission: 'finance.payments.view', keywords: ['ledger', 'history', 'received', 'transactions'] }
                ]
            },
            {
                key: 'finance_salary',
                label: 'Salary & Payroll',
                icon: BadgeDollarSign,
                keywords: ['salary', 'approvals', 'payroll', 'compensation', 'pay run'],
                children: [
                    { label: 'Salary Approvals', path: '/finance/salary-approvals', icon: BadgeDollarSign, permission: 'finance.compensation.view', keywords: ['salary', 'employee', 'compensation', 'approval', 'payroll'] },
                    { label: 'Payroll Approvals', path: '/finance/payroll-approvals', icon: ClipboardCheck, permission: 'payroll.view', feature: 'payroll', keywords: ['monthly payroll', 'reviewed', 'salary run', 'approve', 'pay'] }
                ]
            },
            {
                key: 'finance_setup',
                label: 'Settings & Fee Structure',
                icon: Settings,
                keywords: ['policies', 'fee structures', 'invoices', 'billing', 'rules'],
                children: [
                    { label: 'Policies', path: '/finance/policies', icon: Settings, permission: 'finance.policies.view', keywords: ['rules', 'setup', 'general', 'settings', 'open', 'close', 'fee structure'] },
                    { label: 'Fee Structures', path: '/finance/fee-structures', icon: CreditCard, permission: 'finance.feeStructures.view', keywords: ['pricing', 'structures', 'tuition', 'setup', 'monthly fee'] },
                    { label: 'Discounts & Scholarships', path: '/finance/discounts', icon: Award, permission: 'finance.discounts.view', keywords: ['discounts', 'scholarships', 'aid', 'concession', 'waiver', 'free', 'percentage'] },
                    { label: 'Invoices', path: '/finance/invoices', icon: FileText, permission: 'finance.invoices.view', keywords: ['billing', 'charges', 'student invoices', 'invoice list', 'generate', 'month'] }
                ]
            },
            { label: 'Reports', path: '/finance/reports', icon: PieChart, permission: 'finance.reports.view', keywords: ['revenue', 'charts', 'stats', 'analytics', 'intel'] },
            { label: 'My Profile', path: '/finance/profile', icon: UserIcon, homeOnly: true, keywords: ['profile', 'account', 'personal', 'avatar'] }
        ]
    },
    {
        key: 'payments',
        label: 'Payments desk',
        home: '/cashier',
        scope: 'any',
        items: [
            { label: 'Desk Dashboard', path: '/cashier', icon: LayoutDashboard, permission: 'cashier.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary', 'cashier'] },
            {
                key: 'payments_student_ops',
                label: 'Student Payments',
                icon: Receipt,
                keywords: ['pay', 'new', 'payment', 'record', 'lookup', 'history'],
                children: [
                    { label: 'Record Payment', path: '/cashier/payments/new', icon: Receipt, permission: 'cashier.payments.create', keywords: ['pay', 'new', 'payment', 'record', 'collect', 'receive'] },
                    { label: 'Invoice Lookup', path: '/cashier/invoices', icon: FileText, permission: 'cashier.invoices.search', keywords: ['invoice', 'search', 'find', 'lookup'] },
                    { label: 'Payment History', path: '/cashier/payments', icon: History, permission: 'cashier.payments.view', keywords: ['history', 'log', 'payments', 'past', 'receipts'] }
                ]
            },
            {
                key: 'payments_staff_payouts',
                label: 'Staff Payouts',
                icon: Banknote,
                keywords: ['salary', 'payroll', 'employee', 'staff payout'],
                children: [
                    { label: 'Salary Payments', path: '/cashier/salary-payments', icon: Banknote, permission: 'payroll.pay', feature: 'payroll', keywords: ['salary', 'payroll', 'employee', 'staff payout'] }
                ]
            },
            { label: 'My Profile', path: '/cashier/profile', icon: UserIcon, homeOnly: true, keywords: ['profile', 'account', 'personal', 'avatar'] }
        ]
    },
    {
        key: 'admissions',
        label: 'Admissions',
        home: '/registrar',
        scope: 'branch',
        items: [
            { label: 'Dashboard', path: '/registrar', icon: LayoutDashboard, permission: 'registrar.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary'] },
            {
                key: 'admissions_ops',
                label: 'Student Admissions',
                icon: UserPlus,
                keywords: ['admission', 'students', 'directory', 're-enrollment'],
                children: [
                    { label: 'New Admission', path: '/registrar/admissions', icon: UserPlus, permission: 'students.create', keywords: ['admission', 'new student', 'admit'] },
                    { label: 'Students Directory', path: '/registrar/students', icon: Users, permission: 'students.view', quietFor: { roles: ['teacher'] }, keywords: ['student', 'directory', 'list', 'search'] },
                    { label: 'Re-Enrollment', path: '/registrar/enrollments/new', icon: Users, permission: 'enrollments.create', keywords: ['enroll', 're-enroll', 'register'] }
                ]
            },
            { label: 'Attendance', path: '/registrar/attendance', icon: CalendarCheck, permission: 'attendance.oversight.view', feature: 'attendance', keywords: ['attendance', 'register', 'present', 'absent', 'late'] },
            { label: 'My Profile', path: '/registrar/profile', icon: UserIcon, homeOnly: true, keywords: ['profile', 'account', 'personal', 'avatar'] }
        ]
    },
    {
        key: 'branch',
        label: 'Branch administration',
        home: '/branch',
        scope: 'branch',
        items: [
            { label: 'Dashboard', path: '/branch', icon: LayoutDashboard, permission: 'branch.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary'] },
            {
                key: 'branch_academics',
                label: 'Academics & Schedule',
                icon: BookOpen,
                keywords: ['class', 'sections', 'grades', 'subjects', 'timetable', 'schedule', 'dugsi'],
                children: [
                    {
                        label: 'Classes', path: '/branch/classes', icon: BookOpen, permission: 'branch.classes.view',
                        quietFor: { roles: ['teacher', 'registrar'], unless: ['branch.classes.create', 'branch.classes.update', 'branch.sections.manage', 'branch.subjects.manage'] },
                        keywords: ['class', 'sections', 'grades', 'subjects']
                    },
                    {
                        label: 'Timetable', path: '/branch/timetable', icon: CalendarDays, permission: 'branch.timetable.view',
                        quietFor: { roles: ['teacher'], unless: ['branch.timetable.manage'] },
                        keywords: ['schedule', 'hours', 'calendar', 'timetable']
                    },
                    { label: 'Dugsi Oversight', path: '/branch/dugsi', icon: BookOpen, permission: 'dugsi.overview.view', keywords: ['dugsi', 'quran', 'oversight', 'classes', 'allocations'] }
                ]
            },
            {
                key: 'branch_staff_mgmt',
                label: 'Teachers & Staff',
                icon: BriefcaseBusiness,
                keywords: ['teachers', 'staff', 'leaves', 'payroll'],
                children: [
                    { label: 'Teachers', path: '/branch/teachers', icon: Users, permission: 'branch.staff.view', keywords: ['teacher list', 'manage teachers'] },
                    { label: 'Add Teacher', path: '/branch/teachers/new', icon: UserPlus, permission: 'branch.staff.create', keywords: ['new teacher', 'create teacher'] },
                    { label: 'Teacher Assignments', path: '/branch/assignments', icon: BookOpen, permission: 'branch.assignments.view', keywords: ['teachers', 'classes', 'assign', 'subjects'] },
                    { label: 'Staff', path: '/branch/staff', icon: UserRound, permission: 'branch.staff.view', keywords: ['staff list', 'manage staff'] },
                    { label: 'Add Staff', path: '/branch/staff/new', icon: UserPlus, permission: 'branch.staff.create', keywords: ['new registrar', 'new cashier', 'create staff'] },
                    { label: 'Leaves Manager', path: '/branch/hr/leaves', icon: CalendarCheck, permission: 'hr.leaves.review', feature: 'leaves', keywords: ['leave', 'vacation', 'timeoff', 'review'] },
                    { label: 'Payroll Dashboard', path: '/branch/hr/payroll', icon: DollarSign, permission: 'payroll.view', feature: 'payroll', keywords: ['salary', 'pay', 'payroll', 'slips'] }
                ]
            },
            {
                key: 'branch_students_exams',
                label: 'Students & Exams',
                icon: GraduationCap,
                keywords: ['students', 'promotions', 'transfers', 'exams', 'results'],
                children: [
                    { label: 'Students', path: '/branch/students', icon: GraduationCap, permission: 'branch.students.view', quietFor: { roles: ['teacher', 'registrar'] }, keywords: ['student', 'pupils', 'admissions', 'enrolment'] },
                    { label: 'Promotions', path: '/branch/promotions', icon: ArrowUpCircle, permission: 'branch.promotions.run', keywords: ['promote', 'passing', 'next grade'] },
                    { label: 'Transfers', path: '/branch/transfers', icon: ArrowRightLeft, permission: 'branch.transfers.run', keywords: ['transfer', 'move student', 'another branch'] },
                    { label: 'Exams', path: '/branch/exams', icon: FileText, permission: 'branch.exams.view', keywords: ['exam', 'test', 'grading', 'terms'] },
                    { label: 'Results', path: '/branch/results', icon: Activity, permission: 'branch.results.view', keywords: ['scores', 'marks', 'report cards', 'performance'] },
                    { label: 'Student Results', path: '/branch/results/student', icon: Activity, permission: 'branch.results.view', keywords: ['student marks', 'scorecards'] }
                ]
            },
            { label: 'Reports', path: '/branch/reports', icon: PieChart, permission: 'branch.reports.view', keywords: ['stats', 'analytics', 'data', 'overview'] },
            { label: 'My Profile', path: '/branch/account', icon: UserIcon, homeOnly: true, keywords: ['profile', 'account', 'personal', 'avatar'] }
        ]
    },
    {
        key: 'teacher',
        label: 'Teacher portal',
        home: '/teacher',
        scope: 'branch',
        roles: ['teacher'],
        items: [
            { label: 'Dashboard', path: '/teacher', icon: LayoutDashboard, permission: 'teacher.dashboard.view' },
            { label: 'My Schedule', path: '/teacher/schedule', icon: CalendarDays, permission: 'teacher.schedule.view' },
            { label: 'Open Attendance', path: '/teacher/attendance', icon: CalendarCheck, permission: 'teacher.attendance.view' },
            { label: 'Leaves Request', path: '/teacher/leaves', icon: CalendarCheck, anyPermission: ['teacher.leaves.create', 'hr.leaves.create'] },
            {
                key: 'teacher_exams_eval',
                label: 'Exams & Grading',
                icon: FileSpreadsheet,
                children: [
                    { label: 'Exams List', path: '/teacher/exams', icon: BookOpen, permission: 'teacher.exams.view' },
                    { label: 'Enter Results', path: '/teacher/results-entry', icon: PenTool, permission: 'teacher.results.enter' },
                    { label: 'Results Viewer', path: '/teacher/results', icon: BarChart3, permission: 'teacher.results.view' },
                    { label: 'Templates', path: '/teacher/templates', icon: FileSpreadsheet, permission: 'teacher.examTemplates.view' },
                    { label: 'Categories', path: '/teacher/categories', icon: Settings, permission: 'teacher.examCategories.view' },
                    { label: 'Grading Policy', path: '/teacher/grading-policy', icon: FileSpreadsheet, permission: 'teacher.gradingPolicy.view' }
                ]
            },
            { label: 'My Profile', path: '/teacher/profile', icon: UserIcon, homeOnly: true }
        ]
    },
    {
        key: 'dugsi',
        label: 'Quran Dugsi',
        home: '/dugsi/students',
        scope: 'branch',
        roles: ['dugsi_teacher', 'teacher', 'branch_admin'],
        items: [
            { label: 'My Students', path: '/dugsi/students', icon: Users, permission: 'dugsi.students.view', keywords: ['students', 'quran', 'roster', 'classes', 'dugsi'] },
            { label: 'Dugsi Attendance', path: '/dugsi/attendance', icon: CalendarCheck, permission: 'dugsi.attendance.take', keywords: ['register', 'attendance', 'dugsi', 'present'] },
            { label: 'Quran Progress', path: '/dugsi/progress', icon: BookOpen, permission: 'dugsi.progress.manage', keywords: ['quran', 'juz', 'surah', 'memorization', 'reading'] },
            { label: 'My Profile', path: '/dugsi/profile', icon: UserIcon, homeOnly: true }
        ]
    }
];

// Each role's own area. Roles are fixed, so this is where a person lands and what leads
// their menu; everything else follows from the permissions the school gave the role.
export const HOME_AREA_BY_ROLE = Object.freeze({
    super_admin: 'school',
    hr_payroll_manager: 'hr',
    finance_director: 'finance',
    cashier: 'payments',
    registrar: 'admissions',
    branch_admin: 'branch',
    teacher: 'teacher',
    dugsi_teacher: 'dugsi'
});

export const STAFF_ROLES = Object.keys(HOME_AREA_BY_ROLE);

export const isStaffRole = (role) => STAFF_ROLES.includes(String(role || ''));

const scopeFits = (areaScope, userScope) => areaScope === 'any' || areaScope === userScope;

export const canUseArea = (area, user) => Boolean(user)
    && isStaffRole(user.role)
    && scopeFits(area.scope, user.scope)
    && (!area.roles || area.roles.includes(user.role));

const canOpen = (user, item) => {
    if (item.permission) return hasPermission(user, item.permission);
    if (item.anyPermission) return hasAnyPermission(user, item.anyPermission);
    if (item.allPermissions) return hasAllPermissions(user, item.allPermissions);
    return true;
};

const isQuiet = (user, item) => Boolean(item.quietFor?.roles?.includes(user.role))
    && !(item.quietFor.unless && hasAnyPermission(user, item.quietFor.unless));

/**
 * The menu for one person: their own area first, then every other area that has a page they
 * can open. Returns groups ready to render plus where "home" and "profile" point.
 */
export const buildStaffMenu = (user) => {
    const homeKey = HOME_AREA_BY_ROLE[user?.role];
    const homeArea = STAFF_AREAS.find((area) => area.key === homeKey) || null;
    if (!user || !homeArea) return { groups: [], homePath: '/login', profilePath: '/login' };

    const ordered = [homeArea, ...STAFF_AREAS.filter((area) => area !== homeArea)];
    const seenFeatures = new Set();
    const groups = [];

    for (const area of ordered) {
        if (!canUseArea(area, user)) continue;
        const isHome = area === homeArea;
        const visible = (item) => (isHome || !item.homeOnly)
            && canOpen(user, item)
            && (isHome || !isQuiet(user, item))
            && (!item.feature || !seenFeatures.has(item.feature));

        const items = area.items
            .map((item) => (item.children ? { ...item, children: item.children.filter(visible) } : item))
            .filter((item) => (item.children ? item.children.length > 0 : visible(item)));
        if (!items.length) continue;

        // Features are claimed per area, so two payroll pages inside one area both stay.
        items.flatMap((item) => item.children || [item])
            .forEach((item) => item.feature && seenFeatures.add(item.feature));
        groups.push({ key: area.key, label: area.label, items });
    }

    return {
        groups,
        homePath: homeArea.home,
        profilePath: homeArea.items.find((item) => item.homeOnly)?.path || homeArea.home
    };
};

export const homePathForRole = (role) => STAFF_AREAS.find((area) => area.key === HOME_AREA_BY_ROLE[role])?.home || null;

// The school's own name for the role when it has one ("Finance Officer"), else the key.
export const roleDisplayName = (user) => user?.roleName || String(user?.role || '').replace(/_/g, ' ');
