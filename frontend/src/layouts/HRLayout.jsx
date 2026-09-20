import React, { useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarCheck, LayoutDashboard, LogOut, Menu, Search, User, UserRound, WalletCards, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { filterMenuByPermission, hasPermission } from '../utils/permissions';
import SchoolLogo from '../components/branding/SchoolLogo';
import UserAvatar from '../components/account/UserAvatar';

const HRLayout = () => {
    const { user, loading, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const menuItems = useMemo(() => user ? filterMenuByPermission(user, [
        { label: 'HR Dashboard', path: '/hr', icon: LayoutDashboard, permission: 'hr.dashboard.view', keywords: ['overview', 'summary', 'home'] },
        { label: 'Employees', path: '/hr/employees', icon: UserRound, permission: 'hr.employees.view', keywords: ['staff', 'salary profiles', 'compensation'] },
        { label: 'Leave Management', path: '/hr/leaves', icon: CalendarCheck, permission: 'hr.leaves.review', keywords: ['absence', 'time off', 'requests'] },
        { label: 'Payroll', path: '/hr/payroll', icon: WalletCards, permission: 'payroll.view', keywords: ['salary', 'pay run', 'payslips'] },
        { label: 'Reports', path: '/hr/reports', icon: BarChart3, permission: 'payroll.view', keywords: ['totals', 'analysis', 'history'] },
        { label: 'My Profile', path: '/hr/profile', icon: User, keywords: ['account', 'personal', 'avatar'] }
    ]) : [], [user]);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return menuItems.filter((item) => item.label.toLowerCase().includes(query) || item.keywords?.some((keyword) => keyword.includes(query))).slice(0, 6);
    }, [menuItems, searchQuery]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== 'hr_payroll_manager' || !hasPermission(user, 'hr.dashboard.view')) return <Navigate to="/login" replace />;

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
    };

    return (
        <div className="phoenix-app-shell">
            <header className="phoenix-global-topbar">
                <div className="phoenix-topbar-brand">
                    <button type="button" onClick={() => setSidebarOpen((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd0dd] bg-white text-[#525b75] lg:hidden" aria-label="Toggle navigation">
                        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                    <Link to="/hr" className="flex min-w-0 items-center"><SchoolLogo src={branding.logoUrl} name={branding.tenantName || branding.name} placement="topbar" /></Link>
                </div>
                <div className="phoenix-topbar-content">
                    <div className="phoenix-global-search">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a94ad]" size={14} />
                        <input type="search" className="phoenix-search-input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search HR pages..." aria-label="Search HR pages" />
                        {searchQuery.trim() && <div className="phoenix-search-results">{searchResults.length ? searchResults.map((item) => <button key={item.path} type="button" onClick={() => openSearchResult(item.path)} className="phoenix-search-result"><item.icon size={15} /><span>{item.label}</span></button>) : <p className="px-3 py-3 text-xs font-semibold text-[#8a94ad]">No matching page</p>}</div>}
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <div className="hidden text-right sm:block"><p className="text-sm font-bold text-[#141824]">{user.name}</p><p className="text-[10px] font-semibold uppercase text-[#8a94ad]">HR & Payroll Manager</p></div>
                        <Link to="/hr/profile" aria-label="Open my profile"><UserAvatar user={user} /></Link>
                    </div>
                </div>
            </header>

            {sidebarOpen && <div className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/35 lg:hidden" onClick={() => setSidebarOpen(false)} />}
            <aside className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex h-full flex-col">
                    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                        <p className="school-sidebar-label px-3 pb-2 pt-1 uppercase">People management</p>
                        {menuItems.map((item) => {
                            const active = location.pathname === item.path || (item.path !== '/hr' && location.pathname.startsWith(item.path));
                            return <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 ${active ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}><item.icon size={16} /><span>{item.label}</span></Link>;
                        })}
                    </nav>
                    <div className="school-sidebar-footer p-3"><button onClick={() => { logout(); navigate('/login'); }} className="school-sidebar-logout flex w-full items-center gap-3 px-3 py-2.5 text-sm font-semibold"><LogOut size={16} /><span>Logout</span></button></div>
                </div>
            </aside>
            <main className="phoenix-app-main"><div className="phoenix-app-page"><Outlet /></div></main>
        </div>
    );
};

export default HRLayout;
