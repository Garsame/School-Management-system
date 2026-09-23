import React, { useCallback, useState, useEffect } from 'react';
import { 
  UserPlus, 
  Search, 
  Filter, 
  Mail, 
  MapPin, 
  ShieldCheck, 
  Activity, 
  ChevronDown, 
  X, 
  Loader2,
  Lock,
  MoreVertical
} from 'lucide-react';
import tenantService from '../../services/tenantService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { confirmAction, notify } from '../../components/feedback/notificationService';

const PORTAL_ROLES = ['student', 'parent'];
const FALLBACK_ROLES = [
    { value: 'super_admin', label: 'Super Admin', scope: 'tenant' },
    { value: 'finance_director', label: 'Finance Director', scope: 'tenant' },
    { value: 'hr_payroll_manager', label: 'HR & Payroll Manager', scope: 'tenant' },
    { value: 'branch_admin', label: 'Branch Admin', scope: 'branch' },
    { value: 'registrar', label: 'Admissions Officer / Registrar', scope: 'branch' },
    { value: 'cashier', label: 'Cashier', scope: 'branch' },
    { value: 'teacher', label: 'Academic Teacher', scope: 'branch' },
    { value: 'dugsi_teacher', label: 'Dugsi Teacher (Macallin Dugsi)', scope: 'branch' }
];

const UsersManagement = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filters, setFilters] = useState({ branchId: '', role: '' });
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: '',
        scope: '',
        branchId: '',
        authorizedBranchIds: [],
        phone: '',
        address: '',
        employmentInfo: { jobTitle: '', department: '', employmentType: '', hireDate: '', basicSalary: '', allowance: '', deductions: '', currency: 'USD', paymentMethod: '' }
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [activeDropdownUserId, setActiveDropdownUserId] = useState(null);
    const [editModal, setEditModal] = useState({ open: false, user: null, name: '', email: '', role: '', scope: '', branchId: '', authorizedBranchIds: [], phone: '', address: '', employmentInfo: {} });
    const [passwordResetModal, setPasswordResetModal] = useState({ open: false, user: null, tempPassword: '' });
    const [permissionModal, setPermissionModal] = useState({
        open: false,
        user: null,
        catalog: [],
        allow: [],
        deny: [],
        defaults: [],
        effective: []
    });
    const [permissionSubmitting, setPermissionSubmitting] = useState(false);

    const toggleDropdown = (userId) => {
        setActiveDropdownUserId(activeDropdownUserId === userId ? null : userId);
    };

    const fetchData = useCallback(async () => {
        try {
            const [usersRes, branchesRes] = await Promise.all([
                tenantService.getUsers(filters),
                tenantService.getBranches()
            ]);
            setUsers(usersRes.data);
            setBranches(branchesRes.data);
        } catch (error) {
            console.error('Failed to load users/branches:', error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await tenantService.createUser(formData);
            await fetchData();
            setIsModalOpen(false);
            setFormData({
                name: '', email: '', password: '', role: '', scope: '', branchId: '', authorizedBranchIds: [],
                phone: '', address: '',
                employmentInfo: { jobTitle: '', department: '', employmentType: '', hireDate: '', basicSalary: '', allowance: '', deductions: '', currency: 'USD', paymentMethod: '' }
            });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to create administrator', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleStatus = async (id, currentStatus) => {
        try {
            await tenantService.updateUserStatus(id, !currentStatus);
            fetchData();
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to update administrator status', 'error');
        }
    };

    const handleEditUserSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await tenantService.updateUser(editModal.user._id, {
                name: editModal.name,
                email: editModal.email,
                role: editModal.role,
                scope: editModal.scope,
                branchId: editModal.branchId,
                authorizedBranchIds: [],
                phone: editModal.phone,
                address: editModal.address,
                employmentInfo: editModal.employmentInfo
            });
            await fetchData();
            setEditModal({ open: false, user: null, name: '', email: '', role: '', scope: '', branchId: '', authorizedBranchIds: [], phone: '', address: '', employmentInfo: {} });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to update administrator', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePasswordReset = async (user) => {
        if (!(await confirmAction(`Reset the password for ${user.name} and generate temporary credentials?`, { title: 'Reset password', confirmLabel: 'Reset password' }))) return;
        try {
            const res = await tenantService.resetUserPassword(user._id);
            setPasswordResetModal({
                open: true,
                user,
                tempPassword: res.data.temporaryPassword
            });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to reset password', 'error');
        }
    };

    const handleCopyToClipboard = async (text) => {
        await navigator.clipboard.writeText(text);
        notify('Password copied to clipboard', 'success');
    };

    const handleOpenPermissions = async (user) => {
        try {
            const res = await tenantService.getUserPermissions(user._id);
            const { catalog, allow, deny, defaults, effective } = res.data;
            setPermissionModal({
                open: true,
                user,
                catalog: catalog || [],
                allow: allow || [],
                deny: deny || [],
                defaults: defaults || [],
                effective: effective || []
            });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to load user permissions', 'error');
        }
    };

    const handlePermissionChange = (key, state) => {
        setPermissionModal((current) => {
            let nextAllow = [...current.allow];
            let nextDeny = [...current.deny];

            nextAllow = nextAllow.filter((k) => k !== key);
            nextDeny = nextDeny.filter((k) => k !== key);

            if (state === 'allow') {
                nextAllow.push(key);
            } else if (state === 'deny') {
                nextDeny.push(key);
            }

            return {
                ...current,
                allow: nextAllow,
                deny: nextDeny
            };
        });
    };

    const handleSavePermissions = async (e) => {
        e.preventDefault();
        setPermissionSubmitting(true);
        try {
            await tenantService.updateUserPermissions(permissionModal.user._id, {
                allow: permissionModal.allow,
                deny: permissionModal.deny
            });
            notify('Permissions updated successfully', 'success');
            setPermissionModal((current) => ({ ...current, open: false }));
            await fetchData();
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to update user permissions', 'error');
        } finally {
            setPermissionSubmitting(false);
        }
    };

    // Accounts can be made for any staff role the school has switched on, under the school's
    // own name for it. Student and parent accounts come from admission, not from here.
    const [roles, setRoles] = useState(FALLBACK_ROLES);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        tenantService.getRoles()
            .then((response) => {
                const list = (Array.isArray(response.data) ? response.data : [])
                    .filter((role) => role.isActive && !PORTAL_ROLES.includes(role.key))
                    .map((role) => ({ value: role.key, label: role.name, scope: role.scope }));
                if (list.length) setRoles(list);
            })
            .catch(() => {});
    }, []);

    return (
        <div className="phoenix-resource-page pb-10">
            {/* Header Area */}
            <div className="phoenix-page-header">
                <div>
                     <h1 className="phoenix-page-title">Staff accounts</h1>
                     <p className="phoenix-page-subtitle">Create and manage accounts for every staff role your school uses, with complete employment profiles.</p>
                </div>
                {hasPermission(currentUser, 'tenant.users.create') && <button 
                  onClick={() => setIsModalOpen(true)}
                  className="phoenix-primary-button"
                >
                    <UserPlus size={14} />
                    Add staff account
                </button>}
            </div>

            {/* Filter Bar */}
            <div className="phoenix-resource-toolbar phoenix-filter-grid">
                <div className="relative group">
                    <Search className="phoenix-input-icon" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search administrators by name, email or role..."
                      className="phoenix-control phoenix-control-with-icon"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative">
                    <Filter className="phoenix-input-icon" size={14} />
                    <select 
                      className="phoenix-control phoenix-control-with-icon phoenix-control-select appearance-none"
                      value={filters.branchId}
                      onChange={(e) => setFilters({...filters, branchId: e.target.value})}
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                    <ChevronDown className="phoenix-select-icon" size={14} />
                </div>
                <div className="relative">
                    <ShieldCheck className="phoenix-input-icon" size={14} />
                    <select 
                      className="phoenix-control phoenix-control-with-icon phoenix-control-select appearance-none"
                      value={filters.role}
                      onChange={(e) => setFilters({...filters, role: e.target.value})}
                    >
                        <option value="">Any Role</option>
                        {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <ChevronDown className="phoenix-select-icon" size={14} />
                </div>
            </div>

            {/* List */}
            <div className="phoenix-table-shell">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead className="bg-slate-50/50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left">User</th>
                                <th className="px-4 py-3 text-left">Role and scope</th>
                                <th className="px-4 py-3 text-left">Branch</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-10 text-center">
                                        <Loader2 className="animate-spin text-[var(--primary)] mx-auto w-8 h-8" />
                                    </td>
                                </tr>
                            ) : users.filter(user => {
                                const term = searchTerm.toLowerCase();
                                return (
                                    user.name.toLowerCase().includes(term) ||
                                    user.email.toLowerCase().includes(term) ||
                                    user.role.toLowerCase().includes(term)
                                );
                            }).length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-10 text-center font-semibold text-slate-400 text-sm">
                                        No administrator accounts found matching the current filters.
                                    </td>
                                </tr>
                            ) : (
                                users.filter(user => {
                                    const term = searchTerm.toLowerCase();
                                    return (
                                        user.name.toLowerCase().includes(term) ||
                                        user.email.toLowerCase().includes(term) ||
                                        user.role.toLowerCase().includes(term)
                                    );
                                }).map((user) => (
                                    <tr key={user._id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="phoenix-user-avatar">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-900 text-sm">{user.name}</p>
                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                <span className="phoenix-role-badge">
                                                    {user.role.replace('_', ' ')}
                                                </span>
                                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                                                    <Activity size={10} className="text-[var(--primary)]" />
                                                     {user.scope} scope
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                             <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <MapPin size={12} className="text-slate-350" />
                                                {user.branchId ? branches.find(b => b._id === user.branchId)?.name : <span className="text-slate-400 italic text-[11px]">Entire Institution</span>}
                                             </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`phoenix-status ${user.isActive ? 'phoenix-status-success' : 'phoenix-status-danger'}`}>
                                                <div className={`w-1 h-1 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                {user.isActive ? 'Active' : 'Suspended'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-350 relative">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {hasPermission(currentUser, 'tenant.users.update') && <button 
                                                    onClick={() => toggleStatus(user._id, user.isActive)}
                                                    className={`phoenix-compact-action ${user.isActive ? 'text-rose-600' : 'text-emerald-700'}`}
                                                >
                                                    {user.isActive ? 'Suspend' : 'Reinstate'}
                                                </button>}
                                                <div className="relative">
                                                    <button 
                                                        onClick={() => toggleDropdown(user._id)}
                                                        className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>
                                                    {activeDropdownUserId === user._id && (
                                                        <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                                                            {hasPermission(currentUser, 'tenant.users.update') && <button
                                                                onClick={() => {
                                                                    setActiveDropdownUserId(null);
                                                                    setEditModal({
                                                                        open: true,
                                                                        user,
                                                                        name: user.name,
                                                                        email: user.email,
                                                                        role: user.role,
                                                                        scope: user.scope,
                                                                        branchId: user.branchId || '',
                                                                        authorizedBranchIds: user.authorizedBranchIds || (user.branchId ? [user.branchId] : []),
                                                                        phone: user.phone || '',
                                                                        address: user.address || '',
                                                                        employmentInfo: {
                                                                            jobTitle: user.employmentInfo?.jobTitle || '',
                                                                            department: user.employmentInfo?.department || '',
                                                                            employmentType: user.employmentInfo?.employmentType || '',
                                                                            hireDate: user.employmentInfo?.hireDate?.slice?.(0, 10) || '',
                                                                            basicSalary: user.employmentInfo?.basicSalary ?? '',
                                                                            allowance: user.employmentInfo?.allowance ?? '',
                                                                            deductions: user.employmentInfo?.deductions ?? '',
                                                                            currency: user.employmentInfo?.currency || 'USD',
                                                                            paymentMethod: user.employmentInfo?.paymentMethod || ''
                                                                        }
                                                                    });
                                                                }}
                                                                className="w-full px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors block text-left"
                                                            >
                                                                Edit Details
                                                            </button>}
                                                            {hasPermission(currentUser, 'tenant.users.permissions.update') && <button
                                                                onClick={() => {
                                                                    setActiveDropdownUserId(null);
                                                                    handleOpenPermissions(user);
                                                                }}
                                                                className="w-full px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-55 transition-colors block text-left"
                                                            >
                                                                Manage Permissions
                                                            </button>}
                                                            {user._id !== currentUser?._id && hasPermission(currentUser, 'tenant.users.password.reset') && (
                                                                <button
                                                                    onClick={() => {
                                                                        setActiveDropdownUserId(null);
                                                                        handlePasswordReset(user);
                                                                    }}
                                                                    className="w-full px-4 py-2 text-xs font-semibold text-slate-750 hover:bg-slate-50 transition-colors block text-left"
                                                                >
                                                                    Reset Password
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="phoenix-modal-backdrop">
                    <div className="phoenix-modal-scrim" onClick={() => setIsModalOpen(false)} />
                    <div className="phoenix-modal-panel max-w-2xl">
                        <div className="phoenix-modal-header">
                            <div>
                                <h3 className="phoenix-section-title">Add staff account</h3>
                                <p className="phoenix-section-copy">Create a Branch Admin, Finance Director, or HR Manager account.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="phoenix-icon-button" aria-label="Close dialog">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreateUser} className="phoenix-modal-body grid grid-cols-1 gap-4 sm:grid-cols-2 custom-scrollbar">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Full Legal Name</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="Jonathan Edwards"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm placeholder:font-normal placeholder:text-slate-400"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Institutional Email</label>
                                <div className="relative group">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        required
                                        type="email" 
                                        placeholder="j.edwards@institution.com"
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm placeholder:font-normal placeholder:text-slate-400"
                                        value={formData.email}
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Access Credentials</label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        required
                                        type="password" 
                                        placeholder="At least 8 characters"
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm placeholder:font-normal placeholder:text-slate-400"
                                        value={formData.password}
                                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="phoenix-field-label">Role</label>
                                <div className="relative">
                                    <select
                                        required
                                        className="phoenix-control phoenix-control-select appearance-none"
                                        value={formData.role}
                                        onChange={(event) => {
                                            const selectedRole = roles.find((role) => role.value === event.target.value);
                                            setFormData({
                                                ...formData,
                                                role: selectedRole?.value || '',
                                                scope: selectedRole?.scope || '',
                                                branchId: selectedRole?.scope === 'tenant' ? '' : formData.branchId,
                                                authorizedBranchIds: []
                                            });
                                        }}
                                    >
                                        <option value="">Select a role</option>
                                        {roles.map((role) => (
                                            <option key={role.value} value={role.value}>{role.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="phoenix-select-icon" size={14} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="phoenix-field-label">Phone</label>
                                <input
                                    type="tel"
                                    className="phoenix-control"
                                    placeholder="e.g. +252 61 234 5678"
                                    value={formData.phone}
                                    onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="phoenix-field-label">Address</label>
                                <input className="phoenix-control" placeholder="e.g. Main Road, Hargeisa" value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} />
                            </div>

                            {formData.scope === 'branch' && (
                                <div className="space-y-1.5 animate-in slide-in-from-top-4 duration-300">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Assign to Branch</label>
                                    <div className="relative">
                                        <select 
                                            required
                                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all outline-none appearance-none text-sm"
                                            value={formData.branchId}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                branchId: e.target.value,
                                                authorizedBranchIds: []
                                            })}
                                        >
                                            <option value="">Select Target Campus</option>
                                            {branches.map(b => (
                                                <option key={b._id} value={b._id}>{b.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="phoenix-select-icon" size={14} />
                                    </div>
                                </div>
                            )}

                            {formData.role && (
                                <div className="space-y-3 border-t border-[#e3e6ed] pt-4 sm:col-span-2">
                                    <div>
                                        <p className="phoenix-field-label">Employment details</p>
                                        <p className="text-[11px] text-[#8a94ad]">Set the administrator's employment and recurring compensation profile.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="space-y-1.5">
                                            <span className="phoenix-field-label">Employment type</span>
                                            <select className="phoenix-control" value={formData.employmentInfo.employmentType} onChange={(event) => setFormData({ ...formData, employmentInfo: { ...formData.employmentInfo, employmentType: event.target.value } })}>
                                            <option value="">Select employment type</option>
                                            <option value="Permanent">Permanent</option>
                                            <option value="Contract">Contract</option>
                                            <option value="Part-time">Part-time</option>
                                            <option value="Temporary">Temporary</option>
                                            <option value="Volunteer">Volunteer</option>
                                            </select>
                                        </label>
                                        <label className="space-y-1.5"><span className="phoenix-field-label">Hire date</span><input type="date" className="phoenix-control" value={formData.employmentInfo.hireDate} onChange={(event) => setFormData({ ...formData, employmentInfo: { ...formData.employmentInfo, hireDate: event.target.value } })} /></label>
                                        <label className="space-y-1.5"><span className="phoenix-field-label">Basic salary</span><input type="number" min="0" step="0.01" className="phoenix-control" placeholder="e.g. 1200" value={formData.employmentInfo.basicSalary} onChange={(event) => setFormData({ ...formData, employmentInfo: { ...formData.employmentInfo, basicSalary: event.target.value } })} /></label>
                                        <label className="space-y-1.5"><span className="phoenix-field-label">Allowance</span><input type="number" min="0" step="0.01" className="phoenix-control" placeholder="e.g. 150" value={formData.employmentInfo.allowance} onChange={(event) => setFormData({ ...formData, employmentInfo: { ...formData.employmentInfo, allowance: event.target.value } })} /></label>
                                        <label className="space-y-1.5"><span className="phoenix-field-label">Deductions</span><input type="number" min="0" step="0.01" className="phoenix-control" placeholder="e.g. 25" value={formData.employmentInfo.deductions} onChange={(event) => setFormData({ ...formData, employmentInfo: { ...formData.employmentInfo, deductions: event.target.value } })} /></label>
                                        <label className="space-y-1.5"><span className="phoenix-field-label">Currency</span><input maxLength="3" className="phoenix-control uppercase" placeholder="e.g. USD" value={formData.employmentInfo.currency} onChange={(event) => setFormData({ ...formData, employmentInfo: { ...formData.employmentInfo, currency: event.target.value.toUpperCase() } })} /></label>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 sm:col-span-2">
                                 <div className="flex gap-3">
                                    <ShieldCheck className="text-blue-500 shrink-0" size={16} />
                                    <div>
                                        <p className="text-[10px] font-black text-slate-900 mb-0.5 uppercase tracking-wide">Access Protocol</p>
                                        <p className="text-[9px] leading-relaxed font-semibold text-slate-450 uppercase">User will be restricted to the specified branch scope unless granted higher authority.</p>
                                    </div>
                                 </div>
                            </div>
                        </form>

                        <div className="phoenix-modal-footer">
                             <button 
                                onClick={() => setIsModalOpen(false)}
                                className="phoenix-secondary-button"
                             >
                                Discard
                             </button>
                             <button 
                                onClick={handleCreateUser}
                                disabled={submitting || !formData.role || (formData.scope === 'branch' && !formData.branchId)}
                                className="phoenix-primary-button disabled:opacity-30 disabled:pointer-events-none"
                             >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create administrator'}
                             </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Reset Modal */}
            {passwordResetModal.open && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setPasswordResetModal({ open: false, user: null, tempPassword: '' })} />
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 p-6">
                        <div className="flex items-center gap-3 text-emerald-600 mb-4">
                            <ShieldCheck size={28} />
                            <h3 className="text-lg font-black text-slate-900 tracking-tight">Password Reset Complete</h3>
                        </div>
                        <p className="text-sm font-semibold text-slate-600 mb-4">
                            A new temporary security key has been generated for <strong className="text-slate-800">{passwordResetModal.user?.name}</strong>.
                        </p>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between mb-6">
                            <span className="font-mono text-base font-bold text-slate-800 select-all tracking-wider">
                                {passwordResetModal.tempPassword}
                            </span>
                            <button
                                onClick={() => handleCopyToClipboard(passwordResetModal.tempPassword)}
                                className="px-3.5 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white text-[10px] font-black tracking-widest uppercase rounded-lg transition-all"
                            >
                                Copy
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 font-semibold mb-6">
                            * The user will be prompted to change this password upon their next sign-in.
                        </p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setPasswordResetModal({ open: false, user: null, tempPassword: '' })}
                                className="h-10 px-6 bg-slate-900 text-white rounded-lg font-black tracking-widest text-[10px] uppercase shadow hover:bg-slate-800 transition-all active:scale-95"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {editModal.open && (
                <div className="phoenix-modal-backdrop">
                    <div className="phoenix-modal-scrim" onClick={() => setEditModal({ open: false, user: null, name: '', email: '', role: '', scope: '', branchId: '', authorizedBranchIds: [] })} />
                    <div className="phoenix-modal-panel max-w-2xl">
                        <div className="phoenix-modal-header">
                            <div>
                                <h3 className="phoenix-section-title">Edit user</h3>
                                <p className="phoenix-section-copy">Update account details, role, and branch access.</p>
                            </div>
                            <button onClick={() => setEditModal({ open: false, user: null, name: '', email: '', role: '', scope: '', branchId: '', authorizedBranchIds: [] })} className="phoenix-icon-button" aria-label="Close dialog">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleEditUserSubmit} className="phoenix-modal-body grid grid-cols-1 gap-4 sm:grid-cols-2 custom-scrollbar">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Full Legal Name</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="e.g. Jonathan Edwards"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm placeholder:font-normal placeholder:text-slate-400"
                                    value={editModal.name}
                                    onChange={(e) => setEditModal({...editModal, name: e.target.value})}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Institutional Email</label>
                                <div className="relative group">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        required
                                        type="email" 
                                        placeholder="e.g. admin@institution.com"
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all text-sm placeholder:font-normal placeholder:text-slate-400"
                                        value={editModal.email}
                                        onChange={(e) => setEditModal({...editModal, email: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="phoenix-field-label">Role</label>
                                <div className="relative">
                                    <select
                                        required
                                        className="phoenix-control phoenix-control-select appearance-none"
                                        value={editModal.role}
                                        onChange={(event) => {
                                            const selectedRole = roles.find((role) => role.value === event.target.value);
                                            setEditModal({
                                                ...editModal,
                                                role: selectedRole?.value || '',
                                                scope: selectedRole?.scope || '',
                                                branchId: selectedRole?.scope === 'tenant' ? '' : editModal.branchId,
                                                authorizedBranchIds: []
                                            });
                                        }}
                                    >
                                        <option value="">Select a role</option>
                                        {roles.map((role) => (
                                            <option key={role.value} value={role.value}>{role.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="phoenix-select-icon" size={14} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="phoenix-field-label">Phone</label>
                                <input type="tel" className="phoenix-control" placeholder="e.g. +252 61 234 5678" value={editModal.phone} onChange={(event) => setEditModal({ ...editModal, phone: event.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="phoenix-field-label">Address</label>
                                <input className="phoenix-control" placeholder="e.g. Main Road, Hargeisa" value={editModal.address} onChange={(event) => setEditModal({ ...editModal, address: event.target.value })} />
                            </div>

                            {editModal.scope === 'branch' && (
                                <div className="space-y-1.5 animate-in slide-in-from-top-4 duration-300">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Assign to Branch</label>
                                    <div className="relative">
                                        <select 
                                            required
                                            className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/10 transition-all outline-none appearance-none text-sm"
                                            value={editModal.branchId}
                                            onChange={(e) => setEditModal({
                                                ...editModal,
                                                branchId: e.target.value,
                                                authorizedBranchIds: []
                                            })}
                                        >
                                            <option value="">Select Target Campus</option>
                                            {branches.map(b => (
                                                <option key={b._id} value={b._id}>{b.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="phoenix-select-icon" size={14} />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3 border-t border-[#e3e6ed] pt-4 sm:col-span-2">
                                <div><p className="phoenix-field-label">Employment and salary</p><p className="text-[11px] text-[#8a94ad]">Employee ID remains protected and cannot be edited.</p></div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <label className="space-y-1.5"><span className="phoenix-field-label">Employment type</span><select className="phoenix-control" value={editModal.employmentInfo.employmentType || ''} onChange={(event) => setEditModal({ ...editModal, employmentInfo: { ...editModal.employmentInfo, employmentType: event.target.value } })}><option value="">Select type</option><option>Permanent</option><option>Contract</option><option>Part-time</option><option>Temporary</option><option>Volunteer</option></select></label>
                                    <label className="space-y-1.5"><span className="phoenix-field-label">Hire date</span><input type="date" className="phoenix-control" value={editModal.employmentInfo.hireDate || ''} onChange={(event) => setEditModal({ ...editModal, employmentInfo: { ...editModal.employmentInfo, hireDate: event.target.value } })} /></label>
                                    <label className="space-y-1.5"><span className="phoenix-field-label">Basic salary</span><input type="number" min="0" step="0.01" className="phoenix-control" placeholder="e.g. 1200" value={editModal.employmentInfo.basicSalary ?? ''} onChange={(event) => setEditModal({ ...editModal, employmentInfo: { ...editModal.employmentInfo, basicSalary: event.target.value } })} /></label>
                                    <label className="space-y-1.5"><span className="phoenix-field-label">Allowance</span><input type="number" min="0" step="0.01" className="phoenix-control" placeholder="e.g. 150" value={editModal.employmentInfo.allowance ?? ''} onChange={(event) => setEditModal({ ...editModal, employmentInfo: { ...editModal.employmentInfo, allowance: event.target.value } })} /></label>
                                    <label className="space-y-1.5"><span className="phoenix-field-label">Deductions</span><input type="number" min="0" step="0.01" className="phoenix-control" placeholder="e.g. 25" value={editModal.employmentInfo.deductions ?? ''} onChange={(event) => setEditModal({ ...editModal, employmentInfo: { ...editModal.employmentInfo, deductions: event.target.value } })} /></label>
                                    <label className="space-y-1.5"><span className="phoenix-field-label">Currency</span><input maxLength="3" className="phoenix-control uppercase" placeholder="e.g. USD" value={editModal.employmentInfo.currency || 'USD'} onChange={(event) => setEditModal({ ...editModal, employmentInfo: { ...editModal.employmentInfo, currency: event.target.value.toUpperCase() } })} /></label>
                                </div>
                            </div>

                        </form>

                        <div className="phoenix-modal-footer">
                             <button 
                                onClick={() => setEditModal({ open: false, user: null, name: '', email: '', role: '', scope: '', branchId: '', authorizedBranchIds: [] })}
                                className="phoenix-secondary-button"
                             >
                                Discard
                             </button>
                             <button 
                                onClick={handleEditUserSubmit}
                                disabled={submitting || !editModal.role || (editModal.scope === 'branch' && !editModal.branchId)}
                                className="phoenix-primary-button disabled:opacity-30 disabled:pointer-events-none"
                             >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
                             </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Permission Settings Modal */}
            {permissionModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setPermissionModal(curr => ({ ...curr, open: false }))} />
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Manage User Permissions</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                    Override access privileges for {permissionModal.user?.name} ({permissionModal.user?.role.replace('_', ' ')})
                                </p>
                            </div>
                            <button onClick={() => setPermissionModal(curr => ({ ...curr, open: false }))} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSavePermissions} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            <div className="space-y-3">
                                {permissionModal.catalog.length === 0 ? (
                                    <p className="text-sm font-semibold text-slate-400 text-center py-6">
                                        No customizable permissions available for this user role.
                                    </p>
                                ) : (
                                    permissionModal.catalog.map((perm) => {
                                        const isDefault = !permissionModal.allow.includes(perm.key) && !permissionModal.deny.includes(perm.key);
                                        const isAllowed = permissionModal.allow.includes(perm.key);
                                        const isDenied = permissionModal.deny.includes(perm.key);
                                        const defaultsToAllow = permissionModal.defaults.includes(perm.key);

                                        return (
                                            <div key={perm.key} className="p-4 bg-slate-55 rounded-xl border border-slate-200 hover:border-slate-350 transition-all">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="text-xs font-black text-slate-900 uppercase tracking-wider">{perm.label}</p>
                                                            <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[8px] font-bold font-mono">
                                                                {perm.key}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{perm.group} Group</p>
                                                        <p className="text-[11px] text-slate-500 font-medium mt-1.5 leading-relaxed">{perm.description}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {/* Default */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePermissionChange(perm.key, 'default')}
                                                            className={`h-8 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                                                isDefault 
                                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                                                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-350 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            Default ({defaultsToAllow ? 'Allow' : 'Deny'})
                                                        </button>
                                                        {/* Allow */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePermissionChange(perm.key, 'allow')}
                                                            className={`h-8 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                                                isAllowed 
                                                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                                                                    : 'bg-white text-emerald-600 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                                                            }`}
                                                        >
                                                            Allow
                                                        </button>
                                                        {/* Deny */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePermissionChange(perm.key, 'deny')}
                                                            className={`h-8 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                                                isDenied 
                                                                    ? 'bg-rose-600 text-white border-rose-650 shadow-sm' 
                                                                    : 'bg-white text-rose-650 border-slate-200 hover:border-rose-300 hover:bg-rose-50/30'
                                                            }`}
                                                        >
                                                            Deny
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </form>

                        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                             <button 
                                type="button"
                                onClick={() => setPermissionModal(curr => ({ ...curr, open: false }))}
                                className="px-5 font-black text-[10px] tracking-widest uppercase text-slate-400 hover:text-slate-650 transition-colors"
                             >
                                Discard
                             </button>
                             <button 
                                onClick={handleSavePermissions}
                                disabled={permissionSubmitting}
                                className="h-10 px-6 bg-[var(--primary)] text-white rounded-lg font-black tracking-widest text-[10px] uppercase flex items-center gap-2 shadow hover:bg-[var(--primary-dark)] transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                             >
                                {permissionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SAVE PERMISSIONS'}
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersManagement;


