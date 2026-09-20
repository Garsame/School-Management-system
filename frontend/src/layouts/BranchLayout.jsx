import React, { useMemo, useState } from 'react';
import { Outlet, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import {
    LayoutDashboard,
    BookOpen,
    Users,
    GraduationCap,
    ArrowUpCircle,
    FileText,
    PieChart,
    Activity,
    CalendarDays,
    CalendarCheck,
    DollarSign,
    LogOut,
    Menu,
    X,
    User as UserIcon,
    Search,
    ChevronDown,
    UserPlus,
    UserRound,
    BriefcaseBusiness,
    ArrowRightLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { filterMenuByPermission } from '../utils/permissions';
import SchoolLogo from '../components/branding/SchoolLogo';
import UserAvatar from '../components/account/UserAvatar';

const BranchLayout = () => {
    const { user, loading, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [openGroups, setOpenGroups] = useState({});

    const menuItems = useMemo(() => {
        if (!user) return [];
        const permittedItems = filterMenuByPermission(user, [
            { label: 'Dashboard', path: '/branch', icon: LayoutDashboard, permission: 'branch.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary'] },
            { label: 'Classes', path: '/branch/classes', icon: BookOpen, permission: 'branch.classes.view', keywords: ['class', 'sections', 'grades', 'subjects'] },
            { label: 'Timetable', path: '/branch/timetable', icon: CalendarDays, permission: 'branch.timetable.view', keywords: ['schedule', 'hours', 'calendar', 'timetable'] },
            {
                label: 'Teachers',
                key: 'teachers',
                icon: UserRound,
                permission: 'branch.staff.view',
                keywords: ['teachers', 'educators', 'instructors'],
                children: [
                    { label: 'Add teacher', path: '/branch/teachers/new', matchPath: '/branch/teachers/new', icon: UserPlus, permission: 'branch.staff.create', keywords: ['new teacher', 'create teacher'] },
                    { label: 'View and manage', path: '/branch/teachers', matchPath: '/branch/teachers', icon: Users, permission: 'branch.staff.view', keywords: ['teacher list', 'manage teachers'] },
                    { label: 'Teacher assignments', path: '/branch/assignments', matchPath: '/branch/assignments', icon: BookOpen, permission: 'branch.assignments.view', keywords: ['teachers', 'classes', 'assign', 'subjects'] }
                ]
            },
            {
                label: 'Staff',
                key: 'staff',
                icon: BriefcaseBusiness,
                permission: 'branch.staff.view',
                keywords: ['registrar', 'cashier', 'employees'],
                children: [
                    { label: 'Add staff', path: '/branch/staff/new', matchPath: '/branch/staff/new', icon: UserPlus, permission: 'branch.staff.create', keywords: ['new registrar', 'new cashier', 'create staff'] },
                    { label: 'View and manage', path: '/branch/staff', matchPath: '/branch/staff', icon: Users, permission: 'branch.staff.view', keywords: ['staff list', 'manage staff'] }
                ]
            },
            { label: 'Leaves Manager', path: '/branch/hr/leaves', icon: CalendarCheck, permission: 'hr.leaves.review', keywords: ['leave', 'vacation', 'timeoff', 'review'] },
            { label: 'Payroll Dashboard', path: '/branch/hr/payroll', icon: DollarSign, permission: 'payroll.view', keywords: ['salary', 'pay', 'payroll', 'slips'] },
            { label: 'Students', path: '/branch/students', icon: GraduationCap, permission: 'branch.students.view', keywords: ['student', 'pupils', 'admissions', 'enrolment'] },
            { label: 'Promotions', path: '/branch/promotions', icon: ArrowUpCircle, permission: 'branch.promotions.run', keywords: ['promote', 'passing', 'next grade'] },
            { label: 'Transfers', path: '/branch/transfers', icon: ArrowRightLeft, permission: 'branch.transfers.run', keywords: ['transfer', 'move student', 'another branch'] },
            { label: 'Exams', path: '/branch/exams', icon: FileText, permission: 'branch.exams.view', keywords: ['exam', 'test', 'grading', 'terms'] },
            { label: 'Results', path: '/branch/results', icon: Activity, permission: 'branch.results.view', keywords: ['scores', 'marks', 'report cards', 'performance'] },
            { label: 'Student Results', path: '/branch/results/student', icon: Activity, permission: 'branch.results.view', keywords: ['student marks', 'scorecards'] },
            { label: 'Reports', path: '/branch/reports', icon: PieChart, permission: 'branch.reports.view', keywords: ['stats', 'analytics', 'data', 'overview'] },
            { label: 'My Profile', path: '/branch/account', icon: UserIcon, keywords: ['profile', 'account', 'personal', 'avatar'] }
        ]);
        return permittedItems
            .map((item) => item.children ? { ...item, children: filterMenuByPermission(user, item.children) } : item)
            .filter((item) => !item.children || item.children.length > 0);
    }, [user]);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        const searchableItems = menuItems.flatMap((item) => item.children || [item]);
        return searchableItems.filter((item) => {
            const labelMatch = item.label.toLowerCase().includes(query);
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            return labelMatch || keywordMatch;
        }).slice(0, 6);
    }, [menuItems, searchQuery]);

    if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;

    if (!user || user.role !== 'branch_admin' || user.scope !== 'branch') {
        return <Navigate to="/branch/login" replace />;
    }

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
    };

    const handleLogout = () => {
        logout();
        navigate('/branch/login');
    };

    return (
        <div className="phoenix-app-shell">
            <header className="phoenix-global-topbar">
                <div className="phoenix-topbar-brand">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((previous) => !previous)}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd0dd] bg-white text-[#525b75] lg:hidden"
                        aria-label="Toggle navigation"
                    >
                        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>

                    <Link to="/branch" className="flex min-w-0 items-center">
                        <SchoolLogo src={branding.logoUrl} name={branding.tenantName || branding.name} placement="topbar" />
                    </Link>
                </div>

                <div className="phoenix-topbar-content">
                    <div className="phoenix-global-search">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a94ad]" size={14} />
                        <input
                            type="search"
                            className="phoenix-search-input"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search pages..."
                            aria-label="Search school pages"
                        />
                        {searchQuery.trim() && (
                            <div className="phoenix-search-results">
                                {searchResults.length > 0 ? searchResults.map((item) => (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => openSearchResult(item.path)}
                                        className="phoenix-search-result"
                                    >
                                        <item.icon size={15} />
                                        <span>{item.label}</span>
                                    </button>
                                )) : (
                                    <p className="px-3 py-3 text-xs font-semibold text-[#8a94ad]">No matching page</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        <div className="hidden text-right sm:block">
                            <p className="text-sm font-bold text-[#141824]">{user?.name}</p>
                            <p className="text-[10px] font-semibold text-[#8a94ad] capitalize">{user?.role?.replace('_', ' ')}</p>
                        </div>
                        <Link to="/branch/account" aria-label="Open my profile"><UserAvatar user={user} /></Link>
                    </div>
                </div>
            </header>

            {sidebarOpen && (
                <div className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/35 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            <aside
                className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="flex h-full flex-col">
                    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                        <p className="school-sidebar-label px-3 pb-2 pt-1 uppercase">Branch administration</p>
                        {menuItems.map((item) => {
                            if (item.children) {
                                const isGroupActive = item.children.some((child) => location.pathname.startsWith(child.matchPath));
                                const isOpen = openGroups[item.key] ?? isGroupActive;
                                return (
                                    <div key={item.key} className="space-y-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setOpenGroups((current) => ({ ...current, [item.key]: !(current[item.key] ?? isGroupActive) }))}
                                            className={`flex w-full items-center gap-3 ${isGroupActive ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
                                            aria-expanded={isOpen}
                                        >
                                            <item.icon size={16} />
                                            <span className="flex-1 text-left">{item.label}</span>
                                            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} aria-hidden={!isOpen}>
                                            <div className="min-h-0 overflow-hidden">
                                            <div className="ml-6 space-y-0.5 border-l border-[#e3e6ed] pl-2 pt-0.5">
                                                {item.children.map((child) => {
                                                    const childActive = location.pathname === child.matchPath;
                                                    return (
                                                        <Link
                                                            key={child.path}
                                                            to={child.path}
                                                            onClick={() => setSidebarOpen(false)}
                                                            className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${childActive ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
                                                        >
                                                            <child.icon size={14} />
                                                            <span>{child.label}</span>
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            const isActive = item.path === '/branch'
                                ? location.pathname === '/branch'
                                : (item.path === '/branch/results'
                                    ? location.pathname === '/branch/results'
                                    : location.pathname.startsWith(item.path));
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 ${isActive ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
                                >
                                    <item.icon size={16} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="school-sidebar-footer p-3">
                        <button onClick={handleLogout} className="school-sidebar-logout flex w-full items-center gap-3 px-3 py-2.5 text-sm font-semibold">
                            <LogOut size={16} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            <main className="phoenix-app-main">
                <div className="phoenix-app-page animate-fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default BranchLayout;
