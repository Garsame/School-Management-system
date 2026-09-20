import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, KeyRound, Loader2, Search, X } from 'lucide-react';
import tenantService from '../../services/tenantService';
import { notify } from '../../components/feedback/notificationService';

const roleOptions = [
    { value: 'hr_payroll_manager', label: 'HR & Payroll Manager' },
    { value: 'branch_admin', label: 'Branch Admin' },
    { value: 'finance_director', label: 'Finance Director' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'registrar', label: 'Registrar' },
    { value: 'cashier', label: 'Cashier' }
];

const StaffPermissions = () => {
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [filters, setFilters] = useState({ branchId: '', role: '' });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modal, setModal] = useState({ open: false, user: null, catalog: [], defaults: [], allow: [], deny: [] });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [usersResponse, branchesResponse] = await Promise.all([
                tenantService.getUsers({ ...filters, category: 'all_staff' }),
                tenantService.getBranches()
            ]);
            setUsers(usersResponse.data || []);
            setBranches(branchesResponse.data || []);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const openPermissions = async (user) => {
        try {
            const response = await tenantService.getUserPermissions(user._id);
            setModal({
                open: true,
                user,
                catalog: response.data.catalog || [],
                defaults: response.data.defaults || [],
                allow: response.data.allow || [],
                deny: response.data.deny || []
            });
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to load staff permissions', 'error');
        }
    };

    const setPermissionState = (key, state) => {
        setModal((current) => ({
            ...current,
            allow: state === 'allow' ? [...current.allow.filter((item) => item !== key), key] : current.allow.filter((item) => item !== key),
            deny: state === 'deny' ? [...current.deny.filter((item) => item !== key), key] : current.deny.filter((item) => item !== key)
        }));
    };

    const savePermissions = async () => {
        setSaving(true);
        try {
            await tenantService.updateUserPermissions(modal.user._id, { allow: modal.allow, deny: modal.deny });
            setModal((current) => ({ ...current, open: false }));
            notify('Staff permissions updated successfully', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Failed to update staff permissions', 'error');
        } finally {
            setSaving(false);
        }
    };

    const visibleUsers = users.filter((user) => {
        const query = search.trim().toLowerCase();
        return !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
    });

    return (
        <div className="phoenix-resource-page pb-10">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Staff Permissions</h1>
                    <p className="phoenix-page-subtitle">Review and customize access for school administrators and branch staff.</p>
                </div>
            </div>

            <div className="phoenix-resource-toolbar phoenix-filter-grid">
                <div className="relative md:col-span-2">
                    <Search className="phoenix-input-icon" size={16} />
                    <input className="phoenix-control phoenix-control-with-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branch staff..." />
                </div>
                <div className="relative">
                    <select className="phoenix-control phoenix-control-select appearance-none" value={filters.branchId} onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value }))}>
                        <option value="">All branches</option>
                        {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                    </select>
                    <ChevronDown className="phoenix-select-icon" size={14} />
                </div>
                <div className="relative">
                    <select className="phoenix-control phoenix-control-select appearance-none" value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}>
                        <option value="">All staff roles</option>
                        {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                    </select>
                    <ChevronDown className="phoenix-select-icon" size={14} />
                </div>
            </div>

            <div className="phoenix-table-shell overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead><tr><th className="px-4 py-3 text-left">Staff member</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Branch</th><th className="px-4 py-3 text-right">Security</th></tr></thead>
                    <tbody className="divide-y divide-[#e3e6ed]">
                        {loading ? (
                            <tr><td colSpan="4" className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-[var(--primary)]" /></td></tr>
                        ) : visibleUsers.length === 0 ? (
                            <tr><td colSpan="4" className="py-10 text-center text-sm text-[#8a94ad]">No branch staff found.</td></tr>
                        ) : visibleUsers.map((user) => (
                            <tr key={user._id}>
                                <td className="px-4 py-3"><p className="text-sm font-semibold text-[#141824]">{user.name}</p><p className="text-xs text-[#8a94ad]">{user.email}</p></td>
                                <td className="px-4 py-3 text-sm capitalize text-[#525b75]">{user.role.replace('_', ' ')}</td>
                                <td className="px-4 py-3 text-sm text-[#525b75]">{branches.find((branch) => branch._id === user.branchId)?.name || 'Assigned branch'}</td>
                                <td className="px-4 py-3 text-right"><button type="button" className="phoenix-secondary-button !h-8 !px-3" onClick={() => openPermissions(user)}><KeyRound size={14} /> Permissions</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal.open && (
                <div className="phoenix-modal-backdrop">
                    <div className="phoenix-modal-scrim" onClick={() => setModal((current) => ({ ...current, open: false }))} />
                    <div className="phoenix-modal-panel max-w-3xl">
                        <div className="phoenix-modal-header">
                            <div><h2 className="phoenix-section-title">Permissions for {modal.user?.name}</h2><p className="phoenix-section-copy capitalize">{modal.user?.role.replace('_', ' ')} account</p></div>
                            <button type="button" className="phoenix-icon-button" onClick={() => setModal((current) => ({ ...current, open: false }))}><X size={18} /></button>
                        </div>
                        <div className="phoenix-modal-body max-h-[60vh] space-y-3 overflow-y-auto">
                            {modal.catalog.map((permission) => {
                                const state = modal.allow.includes(permission.key) ? 'allow' : modal.deny.includes(permission.key) ? 'deny' : 'default';
                                return (
                                    <div key={permission.key} className="flex flex-col gap-3 rounded-md border border-[#e3e6ed] p-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div><p className="text-sm font-semibold text-[#141824]">{permission.label}</p><p className="text-xs text-[#8a94ad]">{permission.description}</p></div>
                                        <div className="flex shrink-0 gap-1" role="group" aria-label={`${permission.label} setting`}>
                                            {['default', 'allow', 'deny'].map((option) => (
                                                <button key={option} type="button" onClick={() => setPermissionState(permission.key, option)} className={`h-8 rounded border px-2.5 text-xs font-semibold capitalize ${state === option ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[#cbd0dd] bg-white text-[#525b75]'}`}>
                                                    {option === 'default' ? `Default (${modal.defaults.includes(permission.key) ? 'allow' : 'deny'})` : option}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="phoenix-modal-footer"><button type="button" className="phoenix-secondary-button" onClick={() => setModal((current) => ({ ...current, open: false }))}>Cancel</button><button type="button" className="phoenix-primary-button" disabled={saving} onClick={savePermissions}>{saving ? 'Saving...' : 'Save permissions'}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StaffPermissions;
