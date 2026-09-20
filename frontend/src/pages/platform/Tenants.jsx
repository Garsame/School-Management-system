import React, { useState, useEffect } from 'react';
import {
    Plus, Search, Eye, ShieldAlert, ShieldCheck,
    ChevronLeft, ChevronRight, Building2, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import platformService from '../../services/platformService';
import { confirmAction, promptAction } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const NAVY = '#1b2a4a';
const BLUE = '#4477f5';

const planBadge = (plan = '') => {
    const p = plan.toLowerCase();
    if (p.includes('enterprise')) return 'bg-purple-100 text-purple-700 border-purple-200';
    if (p.includes('pro'))        return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
};

const statusConfig = {
    Active:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Active' },
    Suspended: { dot: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',       label: 'Suspended' },
    Pending:   { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     label: 'Pending' },
    Rejected:  { dot: 'bg-slate-500',   text: 'text-slate-700',   bg: 'bg-slate-50 border-slate-200',     label: 'Rejected' },
};

const Tenants = () => {
    const { user } = useAuth();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [planFilter, setPlanFilter] = useState('all');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => { fetchTenants(); }, []);

    const fetchTenants = async () => {
        try {
            const res = await platformService.getTenants();
            setTenants(res.data);
            setError('');
        } catch (err) {
            setTenants([]);
            setError(err.response?.data?.message || 'Failed to load tenants.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            if (currentStatus === 'Active') {
                const reason = await promptAction('Explain why access is being suspended.', { title: 'Suspend school', label: 'Suspension reason', required: true, confirmLabel: 'Continue' });
                if (!reason || !(await confirmAction('Suspend this school and block normal access?', { title: 'Confirm suspension', confirmLabel: 'Suspend' }))) return;
                await platformService.suspendTenant(id, reason.trim());
            } else {
                const reason = await promptAction('Add an optional note for the reactivation.', { title: 'Reactivate school', label: 'Reactivation note', confirmLabel: 'Continue' });
                if (reason === null || !(await confirmAction('Reactivate this school?', { title: 'Confirm reactivation', confirmLabel: 'Reactivate', tone: 'primary' }))) return;
                await platformService.reactivateTenant(id, reason.trim());
            }
            fetchTenants();
        } catch (err) {
            setError(err.response?.data?.message || 'Could not update tenant status.');
        }
    };

    const handleApprove = async (id) => {
        try {
            const reason = await promptAction('Add an optional approval note.', { title: 'Approve school', label: 'Approval note', confirmLabel: 'Continue' });
            if (reason === null || !(await confirmAction('Approve this school and enable access?', { title: 'Confirm approval', confirmLabel: 'Approve', tone: 'primary' }))) return;
            await platformService.approveTenant(id, reason.trim());
            fetchTenants();
        } catch (err) {
            setError(err.response?.data?.message || 'Could not approve tenant.');
        }
    };

    const handleReject = async (id) => {
        const reason = await promptAction('Explain why this registration is being rejected.', { title: 'Reject registration', label: 'Rejection reason', required: true, confirmLabel: 'Continue' });
        if (!reason || !(await confirmAction('Reject this school registration?', { title: 'Confirm rejection', confirmLabel: 'Reject' }))) return;
        try {
            await platformService.rejectTenant(id, reason.trim());
            fetchTenants();
        } catch (err) {
            setError(err.response?.data?.message || 'Could not reject tenant.');
        }
    };

    const getStatus = (tenant) => {
        if (tenant.status) return tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1).toLowerCase();
        if (!tenant.isApproved) return 'Pending';
        if (tenant.status) return tenant.status;
        return tenant.isActive ? 'Active' : 'Suspended';
    };

    const filteredTenants = tenants.filter(t => {
        const hay = `${t.name} ${t.domain} ${t.plan}`.toLowerCase();
        const status = getStatus(t);
        const matchesSearch = hay.includes(search.trim().toLowerCase());
        const matchesStatus = statusFilter === 'all' || status.toLowerCase() === statusFilter;
        const matchesPlan = planFilter === 'all' || String(t.planSlug || t.plan).toLowerCase() === planFilter;
        return matchesSearch && matchesStatus && matchesPlan;
    });

    const pendingCount = tenants.filter(t => !t.isApproved).length;

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-[#4477f5] rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-400">Loading tenants...</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-extrabold text-slate-900">Tenant Management</h2>
                        {pendingCount > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                <Clock size={11} /> {pendingCount} Pending
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 text-sm">Manage and monitor all school tenants on the platform.</p>
                    {error && <p className="text-sm font-semibold text-rose-600 mt-1">{error}</p>}
                </div>
                {hasPermission(user, 'platform.tenants.create') && <button
                    onClick={() => navigate('/platform/tenants/new')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-md hover:opacity-90 hover:-translate-y-0.5 transition-all flex-shrink-0"
                    style={{ background: NAVY }}
                >
                    <Plus size={18} />
                    Add New School
                </button>}
            </div>

            {/* Search bar */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by school name, domain or plan..."
                        className="w-full pl-10 pr-4 h-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 font-medium placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="rejected">Rejected</option>
                </select>
                <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
                    <option value="all">All plans</option>
                    {[...new Set(tenants.map(t => String(t.planSlug || t.plan).toLowerCase()))].map(plan => (
                        <option key={plan} value={plan}>{plan}</option>
                    ))}
                </select>
                <p className="text-xs font-semibold text-slate-400 flex-shrink-0">
                    {filteredTenants.length} of {tenants.length} schools
                </p>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80">
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">School</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Plan</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Status</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Branches</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Students</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Joined</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredTenants.map(tenant => {
                                const status = getStatus(tenant);
                                const sc = statusConfig[status] || statusConfig.Active;
                                const isPending = status === 'Pending';
                                return (
                                    <tr key={tenant._id || tenant.id} className="hover:bg-slate-50/60 transition-colors">
                                        {/* School */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                                                    style={{ background: NAVY }}>
                                                    {(tenant.name || 'S')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{tenant.name}</p>
                                                    <p className="text-xs text-slate-400 font-medium">{tenant.domain}</p>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Plan */}
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${planBadge(tenant.plan)}`}>
                                                {tenant.plan || 'Basic'}
                                            </span>
                                        </td>
                                        {/* Status */}
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${sc.bg} ${sc.text}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                                {sc.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm font-semibold text-slate-600">{tenant.branchCount ?? 0}</td>
                                        <td className="px-5 py-4 text-sm font-semibold text-slate-600">{(tenant.studentCount ?? 0).toLocaleString()}</td>
                                        <td className="px-5 py-4 text-xs text-slate-400 font-medium">
                                            {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        {/* Actions */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {isPending && (
                                                    <>
                                                        {hasPermission(user, 'platform.tenants.approve') && <button
                                                            onClick={() => handleApprove(tenant._id || tenant.id)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                                                            title="Approve School"
                                                        >
                                                            <CheckCircle2 size={13} /> Approve
                                                        </button>}
                                                        {hasPermission(user, 'platform.tenants.reject') && <button
                                                            onClick={() => handleReject(tenant._id || tenant.id)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition"
                                                            title="Reject School"
                                                        >
                                                            <XCircle size={13} /> Reject
                                                        </button>}
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/platform/tenants/${tenant._id || tenant.id}`)}
                                                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                                    title="View Details"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                {!isPending && status !== 'Rejected' && hasPermission(user, 'platform.tenants.deactivate') && (
                                                    <button
                                                        onClick={() => handleToggleStatus(tenant._id || tenant.id, status)}
                                                        className={`p-2 rounded-lg transition ${status === 'Active' ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                                        title={status === 'Active' ? 'Suspend' : 'Activate'}
                                                    >
                                                        {status === 'Active' ? <XCircle size={16} /> : <ShieldCheck size={16} />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTenants.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center">
                                        <Building2 size={32} className="mx-auto mb-3 text-slate-200" />
                                        <p className="text-sm font-semibold text-slate-400">No schools found</p>
                                        <p className="text-xs text-slate-300 mt-1">Try adjusting your search</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Footer */}
                <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-400">
                        Showing <span className="text-slate-700">{filteredTenants.length}</span> of <span className="text-slate-700">{tenants.length}</span> tenants
                    </p>
                    <div className="flex gap-2">
                        <button className="p-1.5 border border-slate-200 rounded-lg hover:bg-white transition disabled:opacity-40" disabled>
                            <ChevronLeft size={14} />
                        </button>
                        <button className="p-1.5 border border-slate-200 rounded-lg hover:bg-white transition">
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Tenants;
