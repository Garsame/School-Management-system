import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Building2, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { getAuthorizedBranches } from '../../services/api/teacher.api';
import { getStoredTeacherBranchId, setStoredTeacherBranchId } from '../../utils/storage';
import SchoolLogo from '../branding/SchoolLogo';
import UserAvatar from '../account/UserAvatar';

const TeacherTopbar = ({ onToggleSidebar, sidebarOpen }) => {
    const { user } = useAuth();
    const { branding } = useBranding();
    const [branches, setBranches] = useState([]);
    const [activeBranchId, setActiveBranchId] = useState(() => getStoredTeacherBranchId() || user?.branchId || '');

    useEffect(() => {
        const loadBranches = async () => {
            try {
                const response = await getAuthorizedBranches();
                const list = response?.data || response || [];
                setBranches(Array.isArray(list) ? list : []);
            } catch (error) {
                console.error('Failed to load authorized teacher branches', error);
            }
        };
        loadBranches();
    }, []);

    const changeBranch = (branchId) => {
        setStoredTeacherBranchId(branchId);
        setActiveBranchId(branchId);
        window.location.reload();
    };

    return (
        <header className="phoenix-global-topbar">
            <div className="phoenix-topbar-brand">
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd0dd] bg-white text-[#525b75] lg:hidden"
                    aria-label="Toggle navigation"
                >
                    {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                </button>

                <Link to="/teacher" className="flex min-w-0 items-center">
                    <SchoolLogo src={branding?.logoUrl} name={branding?.tenantName || branding?.name} placement="topbar" />
                </Link>
            </div>

            <div className="phoenix-topbar-content">
                <div className="phoenix-global-search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a94ad]" size={14} />
                    <input
                        type="search"
                        className="phoenix-search-input"
                        placeholder="Search..."
                        aria-label="Search"
                    />
                </div>

                <div className="ml-auto flex items-center gap-3">
                    {branches.length > 1 && (
                        <div className="flex items-center gap-1.5 rounded-lg border border-[#cbd0dd] bg-white px-2 py-1">
                            <Building2 size={14} className="text-[#8a94ad]" />
                            <select
                                value={activeBranchId}
                                onChange={(event) => changeBranch(event.target.value)}
                                className="max-w-[120px] bg-transparent text-[11px] font-semibold text-[#525b75] outline-none border-none focus:ring-0 cursor-pointer"
                                aria-label="Active teaching branch"
                            >
                                {branches.map((branch) => (
                                    <option key={branch._id} value={branch._id}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button className="relative rounded-lg p-2 text-[#525b75] transition hover:bg-slate-100 hover:text-slate-700">
                        <Bell size={16} />
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
                    </button>

                    <div className="hidden text-right sm:block">
                        <p className="text-xs font-bold text-[#141824]">{user?.name}</p>
                        <p className="text-[10px] font-semibold text-[#8a94ad] capitalize">
                            {user?.role?.replace('_', ' ')}
                        </p>
                    </div>

                    <Link to="/teacher/profile" aria-label="Open my profile"><UserAvatar user={user} /></Link>
                </div>
            </div>
        </header>
    );
};

export default TeacherTopbar;
