import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Settings,
    CreditCard,
    FileText,
    History,
    PieChart,
    AlertCircle
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import { filterMenuByPermission } from '../../utils/permissions';
import SchoolLogo from '../branding/SchoolLogo';

const Sidebar = ({ className = '', onNavigate }) => {
    const { branding } = useBranding();
    const { user } = useAuth();

    const menuItems = filterMenuByPermission(user, [
        { name: 'Finance Dashboard', path: '/finance', icon: LayoutDashboard, permission: 'finance.dashboard.view' },
        { name: 'Policies', path: '/finance/policies', icon: Settings, permission: 'finance.policies.view' },
        { name: 'Fee Structures', path: '/finance/fee-structures', icon: CreditCard, permission: 'finance.feeStructures.view' },
        { name: 'Invoices', path: '/finance/invoices', icon: FileText, permission: 'finance.invoices.view' },
        { name: 'Payments', path: '/finance/payments', icon: History, permission: 'finance.payments.view' },
        { name: 'Reports', path: '/finance/reports', icon: PieChart, permission: 'finance.reports.view' },
        { name: 'Outstanding', path: '/finance/outstanding', icon: AlertCircle, permission: 'finance.outstanding.view' }
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
                            end={item.path === '/finance'}
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

export default Sidebar;
