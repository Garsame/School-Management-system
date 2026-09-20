import React, { useMemo, useState } from 'react';
import { Outlet, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import SchoolLogo from '../components/branding/SchoolLogo';
import UserAvatar from '../components/account/UserAvatar';
import { filterMenuByPermission } from '../utils/permissions';
import {
    LayoutDashboard,
    FileText,
    CalendarCheck,
    LogOut,
    User as UserIcon,
    Menu,
    X,
    Trophy,
    CalendarDays,
    Lock,
    Search
} from 'lucide-react';

const StudentLayout = () => {
    const { user, loading, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const menuItems = useMemo(() => {
        if (!user) return [];
        return filterMenuByPermission(user, [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/student', permission: 'student.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary'] },
            { icon: FileText, label: 'My Results', path: '/student/results', permission: 'student.results.view', keywords: ['results', 'scores', 'marks', 'report card'] },
            { icon: Trophy, label: 'My Rank', path: '/student/rank', permission: 'student.rank.view', keywords: ['rank', 'position', 'leaderboard', 'standing'] },
            { icon: CalendarDays, label: 'My Schedule', path: '/student/schedule', permission: 'student.schedule.view', keywords: ['schedule', 'timetable', 'calendar', 'classes'] },
            { icon: CalendarCheck, label: 'Attendance', path: '/student/attendance', permission: 'student.attendance.view', keywords: ['attendance', 'presence', 'absent'] },
            { icon: UserIcon, label: 'Profile', path: '/student/profile', permission: 'student.profile.view', keywords: ['profile', 'settings', 'account', 'me'] },
            { icon: Lock, label: 'Change Password', path: '/student/change-password', permission: 'student.password.change', keywords: ['password', 'security', 'change', 'reset'] }
        ]);
    }, [user]);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return menuItems.filter((item) => {
            const labelMatch = item.label.toLowerCase().includes(query);
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            return labelMatch || keywordMatch;
        }).slice(0, 6);
    }, [menuItems, searchQuery]);

    if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;

    if (!user || user.role !== 'student') {
        return <Navigate to="/student/login" replace />;
    }

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
    };

    const handleLogout = () => {
        logout();
        navigate('/student/login');
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

                    <Link to="/student" className="flex min-w-0 items-center">
                        <SchoolLogo src={branding?.logoUrl} name={branding?.tenantName || branding?.name} placement="topbar" />
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
                            <p className="text-[10px] font-semibold text-[#8a94ad] capitalize">{user?.username}</p>
                        </div>
                        <Link to="/student/profile" aria-label="Open my profile"><UserAvatar user={user} /></Link>
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
                        <p className="school-sidebar-label px-3 pb-2 pt-1 text-[11px] font-semibold text-[#8a94ad]">Student portal</p>
                        {menuItems.map((item) => {
                            const isActive = item.path === '/student'
                                ? location.pathname === '/student'
                                : location.pathname.startsWith(item.path);
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

export default StudentLayout;
