/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { filterMenuByPermission } from '../utils/permissions';
import SchoolLogo from '../components/branding/SchoolLogo';
import UserAvatar from '../components/account/UserAvatar';
import {
    LayoutDashboard,
    FileText,
    CalendarCheck,
    LogOut,
    User,
    Menu,
    X,
    Bell,
    CreditCard,
    Search
} from 'lucide-react';
import api from '../services/api';

const ParentLayout = () => {
    const { user, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const menuItems = useMemo(() => {
        if (!user) return [];
        return filterMenuByPermission(user, [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/parent', permission: 'parent.dashboard.view', keywords: ['dashboard', 'home', 'main', 'summary'] },
            { icon: FileText, label: 'Grades & Ranks', path: '/parent/grades', permission: 'parent.grades.view', keywords: ['grades', 'marks', 'ranks', 'report', 'results'] },
            { icon: CalendarCheck, label: 'Attendance', path: '/parent/attendance', permission: 'parent.attendance.view', keywords: ['attendance', 'presence', 'calendar', 'dates'] },
            { icon: CreditCard, label: 'Fees & Invoices', path: '/parent/invoices', permission: 'parent.invoices.view', keywords: ['fees', 'invoices', 'payments', 'billing', 'finance'] },
            { icon: User, label: 'My Profile', path: '/parent/profile', permission: 'parent.profile.view', keywords: ['profile', 'settings', 'account', 'me'] }
        ]);
    }, [user]);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/parent/notifications');
            if (res.data?.success) {
                setNotifications(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load notifications', err);
        }
    };

    useEffect(() => {
        if (user) {
            fetchNotifications();
            // Poll for notifications every 30 seconds
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const markAsRead = async (id) => {
        try {
            await api.put(`/parent/notifications/${id}/read`);
            fetchNotifications();
        } catch (err) {
            console.error(err);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return menuItems.filter((item) => {
            const labelMatch = item.label.toLowerCase().includes(query);
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            return labelMatch || keywordMatch;
        }).slice(0, 6);
    }, [menuItems, searchQuery]);

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
    };

    const unreadCount = (notifications || []).filter(n => !n.isRead).length;

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

                    <Link to="/parent" className="flex min-w-0 items-center">
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
                                {searchResults.length > 0 ? (searchResults || []).map((item) => (
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
                        {/* Notifications Bell */}
                        <div className="relative">
                            <button 
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd0dd] bg-white text-[#525b75] hover:bg-slate-50 relative"
                            >
                                <Bell size={17} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white px-1">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notifications Dropdown */}
                            {showNotifications && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[#cbd0dd] bg-white shadow-lg z-50 overflow-hidden">
                                        <div className="p-3 border-b border-[#f0f2f5] flex items-center justify-between bg-[#f5f7fa]">
                                            <h4 className="font-bold text-[#141824] text-xs">Notifications</h4>
                                            <button className="text-xs font-semibold text-[var(--primary)] hover:underline" onClick={fetchNotifications}>Refresh</button>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            {(notifications || []).length === 0 ? (
                                                <p className="p-4 text-center text-xs text-slate-400 font-semibold">No notifications</p>
                                            ) : (
                                                (notifications || []).map(noti => (
                                                    <div
                                                        key={noti._id}
                                                        onClick={() => {
                                                            markAsRead(noti._id);
                                                            setShowNotifications(false);
                                                        }}
                                                        className={`p-3 border-b border-[#f0f2f5] cursor-pointer transition ${
                                                            !noti.isRead ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-[#f5f7fa]'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start mb-0.5">
                                                            <p className="font-bold text-xs text-[#141824]">{noti.title}</p>
                                                            {!noti.isRead && <span className="h-2 w-2 rounded-full bg-blue-600 mt-1" />}
                                                        </div>
                                                        <p className="text-xs text-[#525b75] leading-normal mb-1">{noti.message}</p>
                                                        <span className="text-[10px] font-semibold text-[#8a94ad]">
                                                            {new Date(noti.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="h-8 w-px bg-slate-200" />
                        
                        <Link to="/parent/profile" className="flex items-center gap-2" aria-label="Open my profile">
                            <UserAvatar user={user} />
                            <div className="hidden sm:block text-left">
                                <p className="text-sm font-bold text-[#141824]">{user?.name}</p>
                                <p className="text-[10px] font-semibold text-[#8a94ad] capitalize">{user?.role}</p>
                            </div>
                        </Link>
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
                        <p className="school-sidebar-label px-3 pb-2 pt-1">Parent Portal</p>
                        {(menuItems || []).map((item) => {
                            const isActive = item.path === '/parent'
                                ? location.pathname === '/parent'
                                : location.pathname.startsWith(item.path);
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 ${
                                        isActive ? 'school-sidebar-link-active' : 'school-sidebar-link'
                                    }`}
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

export default ParentLayout;
