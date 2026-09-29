import React, { useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { roleDisplayName } from '../config/staffMenu';
import SchoolLogo from '../components/branding/SchoolLogo';
import SectionTabs from '../components/layout/SectionTabs';
import useStaffNav from '../components/layout/useStaffNav';
import UserAvatar from '../components/account/UserAvatar';

/**
 * The frame every staff page renders in: school logo, page search, who is signed in, and a
 * menu built from what this person's role can do. One frame for every role, so a page opened
 * from another area looks and navigates exactly like the person's own pages.
 *
 * The sidebar stays short: a section with several pages (Payments) is one link. Its pages
 * show as tabs above the page instead.
 */
const StaffLayout = ({ children }) => {
    const { user, loading, logout } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const { groups, homePath, profilePath, allItems, activePath, activeSection } = useStaffNav(user);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return allItems.filter((item) => item.label.toLowerCase().includes(query)
            || item.keywords?.some((keyword) => keyword.toLowerCase().includes(query))).slice(0, 6);
    }, [allItems, searchQuery]);

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;

    const openSearchResult = (path) => {
        navigate(path);
        setSearchQuery('');
        setSidebarOpen(false);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // A section links to its first page. Clicking it while already inside it leaves the person
    // on the tab they are on, instead of jumping back to the first one.
    const renderItem = (groupKey, item) => {
        const key = `${groupKey}.${item.key}`;
        const isActive = item.children ? activeSection?.key === key : activePath === item.path;
        return (
            <Link
                key={item.children ? key : item.path}
                to={item.children ? item.children[0].path : item.path}
                onClick={(event) => {
                    if (item.children && isActive) event.preventDefault();
                    setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
                aria-current={isActive ? 'page' : undefined}
            >
                <item.icon size={16} />
                <span>{item.label}</span>
            </Link>
        );
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
                    <Link to={homePath} className="flex min-w-0 items-center">
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
                                    <button key={item.path} type="button" onClick={() => openSearchResult(item.path)} className="phoenix-search-result">
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
                            <p className="text-sm font-bold text-[#141824]">{user.name}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94ad]">{roleDisplayName(user)}</p>
                        </div>
                        <Link to={profilePath} aria-label="Open my profile"><UserAvatar user={user} /></Link>
                    </div>
                </div>
            </header>

            {sidebarOpen && (
                <div className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/35 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            <aside className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex h-full flex-col">
                    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                        {groups.map((group, index) => (
                            <div key={group.key} className={index > 0 ? 'pt-4' : ''}>
                                <p className="school-sidebar-label px-3 pb-2 pt-1 uppercase">{group.label}</p>
                                <div className="space-y-0.5">
                                    {group.items.map((item) => renderItem(group.key, item))}
                                </div>
                            </div>
                        ))}
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
                    <SectionTabs section={activeSection} activePath={activePath} />
                    {children || <Outlet />}
                </div>
            </main>
        </div>
    );
};

export default StaffLayout;
