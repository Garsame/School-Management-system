import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ChevronDown, LogOut } from 'lucide-react';
import { buildStaffMenu } from '../../config/staffMenu';

// The teacher portal keeps its own frame for the branch switcher, but its menu comes from the
// same place as every staff menu: the portal first, then any feature the school gave teachers
// from another area.
const TeacherSidebar = ({ className = '', onNavigate }) => {
    const { logout, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [openGroups, setOpenGroups] = useState({});
    const { groups } = useMemo(() => buildStaffMenu(user), [user]);

    const handleLogout = () => {
        logout();
        navigate('/teacher/login');
    };

    const isActive = (path) => (path === '/teacher'
        ? location.pathname === '/teacher'
        : location.pathname === path || location.pathname.startsWith(`${path}/`));

    const renderLink = (item, nested = false) => (
        <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={nested
                ? `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${isActive(item.path) ? 'school-sidebar-link-active' : 'school-sidebar-link'}`
                : `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${isActive(item.path) ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
        >
            <item.icon size={nested ? 14 : 16} />
            <span>{item.label}</span>
        </Link>
    );

    const renderGroupItem = (groupKey, item) => {
        if (!item.children) return renderLink(item);
        const openKey = `${groupKey}.${item.key}`;
        const isGroupActive = item.children.some((child) => isActive(child.path));
        const isOpen = openGroups[openKey] ?? isGroupActive;
        return (
            <div key={openKey} className="space-y-0.5">
                <button
                    type="button"
                    onClick={() => setOpenGroups((current) => ({ ...current, [openKey]: !(current[openKey] ?? isGroupActive) }))}
                    className="school-sidebar-link flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
                    aria-expanded={isOpen}
                >
                    <item.icon size={16} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                    <div className="ml-4 space-y-0.5 pl-2 pt-0.5">
                        {item.children.map((child) => renderLink(child, true))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${className}`}>
            <div className="flex h-full flex-col">
                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    {groups.map((group, index) => (
                        <div key={group.key} className={index > 0 ? 'pt-4' : ''}>
                            <p className="school-sidebar-label px-3 pb-2 pt-1 text-[11px] font-semibold text-[#8a94ad]">{group.label}</p>
                            <div className="space-y-0.5">
                                {group.items.map((item) => renderGroupItem(group.key, item))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="school-sidebar-footer p-3">
                    <button
                        onClick={handleLogout}
                        className="school-sidebar-logout flex w-full items-center gap-3 px-3 py-2.5 text-sm font-semibold"
                    >
                        <LogOut size={16} />
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default TeacherSidebar;
