import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard,
    BookOpen,
    PenTool,
    BarChart3,
    LogOut,
    CalendarCheck,
    CalendarDays,
    Settings,
    FileSpreadsheet,
    User
} from 'lucide-react';
import { filterMenuByPermission } from '../../utils/permissions';

const TeacherSidebar = ({ className = '', onNavigate }) => {
    const { logout, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const menuItems = filterMenuByPermission(user, [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/teacher', permission: 'teacher.dashboard.view' },
        { label: 'My Schedule', icon: CalendarDays, path: '/teacher/schedule', permission: 'teacher.schedule.view' },
        { label: 'Open Attendance', icon: CalendarCheck, path: '/teacher/attendance', permission: 'teacher.attendance.view' },
        { label: 'Leaves Request', icon: CalendarCheck, path: '/teacher/leaves', anyPermission: ['teacher.leaves.create', 'hr.leaves.create'] },
        { label: 'Templates', icon: FileSpreadsheet, path: '/teacher/templates', permission: 'teacher.examTemplates.view' },
        { label: 'Categories', icon: Settings, path: '/teacher/categories', permission: 'teacher.examCategories.view' },
        { label: 'Exams List', icon: BookOpen, path: '/teacher/exams', permission: 'teacher.exams.view' },
        { label: 'Enter Results', icon: PenTool, path: '/teacher/results-entry', permission: 'teacher.results.enter' },
        { label: 'Results Viewer', icon: BarChart3, path: '/teacher/results', permission: 'teacher.results.view' },
        { label: 'Grading Policy', icon: FileSpreadsheet, path: '/teacher/grading-policy', permission: 'teacher.gradingPolicy.view' },
        { label: 'My Profile', icon: User, path: '/teacher/profile' }
    ]);

    const handleLogout = () => {
        logout();
        navigate('/teacher/login');
    };

    return (
        <aside className={`phoenix-app-sidebar school-sidebar transition-transform duration-200 lg:translate-x-0 ${className}`}>
            <div className="flex h-full flex-col">
                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    <p className="school-sidebar-label px-3 pb-2 pt-1 text-[11px] font-semibold text-[#8a94ad]">Teacher Portal</p>
                    {(menuItems || []).map((item) => {
                        const isActive = item.path === '/teacher'
                            ? location.pathname === '/teacher'
                            : location.pathname.startsWith(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={onNavigate}
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
