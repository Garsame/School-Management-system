import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    BookOpen,
    Users,
    GraduationCap,
    ArrowUpCircle,
    FileText,
    PieChart,
    Activity,
    CalendarDays,
    CalendarCheck,
    DollarSign
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import { filterMenuByPermission } from '../../utils/permissions';
import SchoolLogo from '../branding/SchoolLogo';

const BranchSidebar = ({ className = '', onNavigate }) => {
    const { branding } = useBranding();
    const { user } = useAuth();

    const menuItems = filterMenuByPermission(user, [
        { name: 'Dashboard', path: '/branch', icon: LayoutDashboard, permission: 'branch.dashboard.view' },
        { name: 'Classes', path: '/branch/classes', icon: BookOpen, permission: 'branch.classes.view' },
        { name: 'Timetable', path: '/branch/timetable', icon: CalendarDays, permission: 'branch.timetable.view' },
        { name: 'Staff Management', path: '/branch/staff', icon: Users, permission: 'branch.staff.view' },
        { name: 'Leaves Manager', path: '/branch/hr/leaves', icon: CalendarCheck, permission: 'hr.leaves.review' },
        { name: 'Payroll Dashboard', path: '/branch/hr/payroll', icon: DollarSign, permission: 'payroll.view' },
        { name: 'Students', path: '/branch/students', icon: GraduationCap, permission: 'branch.students.view' },
        { name: 'Promotions', path: '/branch/promotions', icon: ArrowUpCircle, permission: 'branch.promotions.run' },
        { name: 'Teacher Assignments', path: '/branch/assignments', icon: BookOpen, permission: 'branch.assignments.view' },
        { name: 'Exams', path: '/branch/exams', icon: FileText, permission: 'branch.exams.view' },
        { name: 'Results', path: '/branch/results', icon: Activity, permission: 'branch.results.view' },
        { name: 'Student Results', path: '/branch/results/student', icon: Activity, permission: 'branch.results.view' },
        { name: 'Reports', path: '/branch/reports', icon: PieChart, permission: 'branch.reports.view' }
    ]);

    return (
        <aside className={`w-64 school-sidebar border-r ${className}`}>
            <div className="flex h-full flex-col">
                <div className="border-b border-slate-200 px-5 py-5">
                    <div className="school-sidebar-logo-panel">
                        <SchoolLogo src={branding.logoUrl} name={branding.tenantName || branding.name} />
                    </div>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                    <p className="school-sidebar-label px-3 pb-2 text-[11px] font-bold uppercase tracking-wider">Menu</p>
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/branch'}
                            onClick={onNavigate}
                            className={({ isActive }) =>
                                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                                    isActive
                                        ? 'school-sidebar-link-active'
                                        : 'school-sidebar-link'
                                }`
                            }
                        >
                            <item.icon size={18} />
                            <span>{item.name}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
        </aside>
    );
};

export default BranchSidebar;
