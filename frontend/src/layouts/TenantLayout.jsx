import React, { useMemo, useState } from 'react';
import {
    LayoutDashboard,
    Palette,
    MapPin,
    Users,
    Calendar,
    BarChart3,
    LogOut,
    Menu,
    X,
    User as UserIcon,
    ClipboardList,
    KeyRound,
    GraduationCap,
    Search, CalendarCheck} from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { filterMenuByPermission } from '../utils/permissions';
import SchoolLogo from '../components/branding/SchoolLogo';
import UserAvatar from '../components/account/UserAvatar';

const TenantLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const menuItems = filterMenuByPermission(user, [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/tenant', permission: 'tenant.dashboard.view', keywords: ['home', 'main', 'index', 'overview'] },
        { icon: Palette, label: 'Branding', path: '/tenant/branding', permission: 'tenant.branding.view', keywords: ['logo', 'color', 'theme', 'appearance', 'style', 'white-label'] },
        { icon: MapPin, label: 'Branches', path: '/tenant/branches', permission: 'tenant.branches.view', keywords: ['campus', 'location', 'schools', 'branch', 'offices'] },
        { icon: Users, label: 'Administrators', path: '/tenant/users', permission: 'tenant.users.view', keywords: ['branch administrators', 'finance director', 'accounts', 'admins'] },
        { icon: KeyRound, label: 'Staff Permissions', path: '/tenant/staff-permissions', permission: 'tenant.users.permissions.view', keywords: ['staff', 'cashier', 'teacher', 'registrar', 'security', 'permissions'] },
        { icon: Calendar, label: 'Academic Years', path: '/tenant/academic-years', permission: 'tenant.academicYears.view', keywords: ['calendar', 'terms', 'semesters', 'years', 'dates'] },
        { icon: GraduationCap, label: 'Academic Policy', path: '/tenant/academic-policy', permission: 'tenant.academicPolicy.view', keywords: ['curriculum', 'grade', 'rules', 'classes', 'education'] },
        { icon: GraduationCap, label: 'Students', path: '/tenant/students', permission: 'students.view', keywords: ['students', 'classes', 'history', 'enrollment'] },
        { icon: CalendarCheck, label: 'Attendance', path: '/tenant/attendance', permission: 'attendance.oversight.view', keywords: ['attendance', 'register', 'present', 'absent', 'late'] },
        { icon: BarChart3, label: 'Reports', path: '/tenant/reports', permission: 'tenant.reports.view', keywords: ['stats', 'analytics', 'charts', 'performance', 'summary'] },
        { icon: ClipboardList, label: 'Audit Logs', path: '/tenant/audit-logs', permission: 'tenant.audit.view', keywords: ['history', 'security', 'actions', 'events', 'records', 'activity'] },
        { icon: UserIcon, label: 'My Profile', path: '/tenant/profile', keywords: ['profile', 'account', 'personal', 'avatar'] }
    ]);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return menuItems.filter((item) => {
            const labelMatch = item.label.toLowerCase().includes(query);
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            return labelMatch || keywordMatch;
        }).slice(0, 6);
    }, [menuItems, searchQuery]);

    const handleLogout = () => {
        logout();
        navigate('/tenant/login');
    };

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
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

                    <Link to="/tenant" className="flex min-w-0 flex-1 items-center justify-center">
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
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94ad]">{user?.role?.replace('_', ' ')}</p>
                        </div>
                        <Link to="/tenant/profile" aria-label="Open my profile"><UserAvatar user={user} /></Link>
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
                        <p className="school-sidebar-label px-3 pb-2 pt-1 uppercase">School management</p>
                        {menuItems.map((item) => {
                            const isActive = location.pathname === item.path ||
                                (item.path !== '/tenant' && location.pathname.startsWith(item.path));
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
                <div className="phoenix-app-page">{children}</div>
            </main>
        </div>
    );
};

export default TenantLayout;
