import React, { useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { buildStaffMenu, roleDisplayName } from '../config/staffMenu';
import SchoolLogo from '../components/branding/SchoolLogo';
import UserAvatar from '../components/account/UserAvatar';

const flatten = (groups) => groups.flatMap((group) => group.items.flatMap((item) => item.children || [item]));

// The menu entry for the current page: the longest path the address falls under. An area's
// home ("/finance") only matches itself, or it would light up for every page in the area.
const activePathFor = (pathname, items) => items
    .map((item) => item.path)
    .filter((path) => pathname === path || (path.split('/').length > 2 && pathname.startsWith(`${path}/`)))
    .sort((a, b) => b.length - a.length)[0] || null;

/**
 * The frame every staff page renders in: school logo, page search, who is signed in, and a
 * menu built from what this person's role can do. One frame for every role, so a page opened
 * from another area looks and navigates exactly like the person's own pages.
 */
const StaffLayout = ({ children }) => {
    const { user, loading, logout } = useAuth();
    const { branding } = useBranding();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [openGroups, setOpenGroups] = useState({});

    const { groups, homePath, profilePath } = useMemo(() => buildStaffMenu(user), [user]);
    const allItems = useMemo(() => flatten(groups), [groups]);
    const activePath = activePathFor(location.pathname, allItems);

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

    const renderLink = (item, nested = false) => (
        <Link
            key={item.path}
            to={item.path}
            onClick={() => setSidebarOpen(false)}
            className={nested
                ? `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${activePath === item.path ? 'school-sidebar-link-active' : 'school-sidebar-link'}`
                : `flex items-center gap-3 ${activePath === item.path ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
        >
            <item.icon size={nested ? 14 : 16} />
            <span>{item.label}</span>
        </Link>
    );

    const renderGroupItem = (groupKey, item) => {
        if (!item.children) return renderLink(item);
        const openKey = `${groupKey}.${item.key}`;
        const isGroupActive = item.children.some((child) => child.path === activePath);
        const isOpen = openGroups[openKey] ?? isGroupActive;
        return (
            <div key={openKey} className="space-y-0.5">
                <button
                    type="button"
                    onClick={() => setOpenGroups((current) => ({ ...current, [openKey]: !(current[openKey] ?? isGroupActive) }))}
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
                            {item.children.map((child) => renderLink(child, true))}
                        </div>
                    </div>
                </div>
            </div>
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
                                    {group.items.map((item) => renderGroupItem(group.key, item))}
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
                    {children || <Outlet />}
                </div>
            </main>
        </div>
    );
};

export default StaffLayout;
