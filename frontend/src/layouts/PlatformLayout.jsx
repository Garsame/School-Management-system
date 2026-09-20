import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Layers,
    CreditCard,
    History,
    Activity,
    Settings,
    LogOut,
    Menu,
    X,
    GraduationCap,
    Search,
    UserRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { filterMenuByPermission } from '../utils/permissions';
import UserAvatar from '../components/account/UserAvatar';

const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/platform', permission: 'platform.dashboard.view', keywords: ['home', 'main', 'index', 'overview', 'summary'] },
    { name: 'Tenants', icon: Users, path: '/platform/tenants', permission: 'platform.tenants.view', keywords: ['schools', 'clients', 'customers', 'institutions', 'list'] },
    { name: 'Plans', icon: Layers, path: '/platform/plans', permission: 'platform.plans.view', keywords: ['pricing', 'subscription', 'packages', 'pricing tiers'] },
    { name: 'Billing', icon: CreditCard, path: '/platform/billing', permission: 'platform.billing.view', keywords: ['money', 'invoices', 'payments', 'revenue', 'finance'] },
    { name: 'Audit Logs', icon: History, path: '/platform/audit', permission: 'platform.audit.view', keywords: ['history', 'security', 'actions', 'events', 'records', 'activity'] },
    { name: 'Monitoring', icon: Activity, path: '/platform/monitoring', permission: 'platform.monitoring.view', keywords: ['stats', 'health', 'uptime', 'cpu', 'database', 'system'] },
    { name: 'Settings', icon: Settings, path: '/platform/settings', permission: 'platform.settings.view', keywords: ['configuration', 'general', 'setup', 'platform name', 'registration'] },
    { name: 'My Profile', icon: UserRound, path: '/platform/profile', keywords: ['profile', 'account', 'personal', 'avatar'] }
];

const PlatformLayout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const visibleMenuItems = filterMenuByPermission(user, menuItems);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return visibleMenuItems.filter((item) => {
            const nameMatch = item.name.toLowerCase().includes(query);
            const keywordMatch = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));
            return nameMatch || keywordMatch;
        }).slice(0, 6);
    }, [searchQuery, visibleMenuItems]);

    const handleLogout = () => {
        logout();
        navigate('/platform/login');
    };

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
    };

    return (
        <div className="phoenix-app-shell platform-admin-shell">
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
                    <Link to="/platform" className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3874ff] text-white">
                            <GraduationCap size={18} />
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-sm font-bold leading-none text-[#141824]">MadrasaHub</p>
                            <p className="mt-1 text-[10px] font-semibold text-[#8a94ad]">Platform Console</p>
                        </div>
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
                            placeholder="Search platform pages..."
                            aria-label="Search platform pages"
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
                                        <span>{item.name}</span>
                                    </button>
                                )) : (
                                    <p className="px-3 py-3 text-xs font-semibold text-[#8a94ad]">No matching page</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        <div className="hidden text-right sm:block">
                            <p className="text-sm font-bold text-[#141824]">{user?.fullName || user?.name || 'Platform Owner'}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94ad]">Platform Owner</p>
                        </div>
                        <Link to="/platform/profile" aria-label="Open my profile"><UserAvatar user={user} /></Link>
                    </div>
                </div>
            </header>

            {sidebarOpen && (
                <div className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/35 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            <aside className={`phoenix-app-sidebar platform-phoenix-sidebar transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex h-full flex-col">
                    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                        <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-[#8a94ad]">Platform management</p>
                        {visibleMenuItems.map((item) => {
                            const isActive = location.pathname === item.path ||
                                (item.path !== '/platform' && location.pathname.startsWith(item.path));
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={isActive ? 'platform-phoenix-link-active' : 'platform-phoenix-link'}
                                >
                                    <item.icon size={16} />
                                    <span>{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="border-t border-[#e3e6ed] p-3">
                        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-[#6e7891] transition hover:bg-[#f5f7fa] hover:text-[#141824]">
                            <LogOut size={16} />
                            <span>Sign out</span>
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

export default PlatformLayout;
