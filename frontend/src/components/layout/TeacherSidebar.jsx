import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';
import { buildStaffMenu } from '../../config/staffMenu';

// The teacher portal keeps its own frame for the branch switcher, but its menu comes from the
// same place as every staff menu: the portal first, then any feature the school gave teachers
// from another area.
const TeacherSidebar = ({ className = '', onNavigate }) => {
    const { logout, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const { groups } = useMemo(() => buildStaffMenu(user), [user]);

    const handleLogout = () => {
        logout();
        navigate('/teacher/login');
    };

    const isActive = (path) => (path === '/teacher'
        ? location.pathname === '/teacher'
        : location.pathname === path || location.pathname.startsWith(`${path}/`));

    return (
        <aside className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${className}`}>
            <div className="flex h-full flex-col">
                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    {groups.map((group, index) => (
                        <div key={group.key} className={index > 0 ? 'pt-4' : ''}>
                            <p className="school-sidebar-label px-3 pb-2 pt-1 text-[11px] font-semibold text-[#8a94ad]">{group.label}</p>
                            {group.items.flatMap((item) => item.children || [item]).map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={onNavigate}
                                    className={`flex items-center gap-3 ${isActive(item.path) ? 'school-sidebar-link-active' : 'school-sidebar-link'}`}
                                >
                                    <item.icon size={16} />
                                    <span>{item.label}</span>
                                </Link>
                            ))}
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
