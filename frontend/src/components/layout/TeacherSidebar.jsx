import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';
import useStaffNav from './useStaffNav';

// The teacher portal keeps its own frame for the branch switcher, but its menu comes from the
// same place as every staff menu: the portal first, then any feature the school gave teachers
// from another area. A section with several pages is one link here; its pages show as tabs
// above the page (see TeacherLayout).
const TeacherSidebar = ({ className = '', onNavigate }) => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const { groups, activePath, activeSection } = useStaffNav(user);

    const handleLogout = () => {
        logout();
        navigate('/teacher/login');
    };

    const renderItem = (groupKey, item) => {
        const key = `${groupKey}.${item.key}`;
        const isActive = item.children ? activeSection?.key === key : activePath === item.path;
        return (
            <Link
                key={item.children ? key : item.path}
                to={item.children ? item.children[0].path : item.path}
                onClick={(event) => {
                    if (item.children && isActive) event.preventDefault();
                    onNavigate?.(event);
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
        <aside className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${className}`}>
            <div className="flex h-full flex-col">
                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    {groups.map((group, index) => (
                        <div key={group.key} className={index > 0 ? 'pt-4' : ''}>
                            <p className="school-sidebar-label px-3 pb-2 pt-1 text-[11px] font-semibold text-[#8a94ad]">{group.label}</p>
                            <div className="space-y-0.5">
                                {group.items.map((item) => renderItem(group.key, item))}
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
