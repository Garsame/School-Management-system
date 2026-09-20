import React, { useState, useEffect } from 'react';
import {
    ArrowLeft, School, MapPin, Users, Calendar,
    ShieldCheck, Database, Mail, Activity,
    CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import platformService from '../../services/platformService';
import { confirmAction, promptAction } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const NAVY = '#1b2a4a';
const BLUE = '#4477f5';

const StatCard = ({ icon, label, value, color = NAVY }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
            style={{ background: color }}>
            {React.createElement(icon, { size: 20 })}
        </div>
        <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-0.5">{value}</p>
        </div>
    </div>
);

const UsageBar = ({ label, used, max, pct }) => (
    <div>
        <div className="flex justify-between items-center mb-1.5">
            <span className="text-sm font-semibold text-slate-600">{label}</span>
            <span className="text-xs font-bold text-slate-500">{used} / {max}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, pct)}%`, background: pct > 80 ? '#f43f5e' : BLUE }} />
        </div>
    </div>
);

const TenantDetails = () => {
    const { user } = useAuth();
    const { tenantId } = useParams();
    const navigate = useNavigate();
    const [tenant, setTenant] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([platformService.getTenantDetails(tenantId), platformService.getPlans(false)])
            .then(([tenantResponse, plansResponse]) => {
                setTenant(tenantResponse.data);
                setPlans(plansResponse.data || []);
                setError('');
            })
            .catch(err => { setTenant(null); setError(err.response?.data?.message || 'Failed to load tenant details.'); })
            .finally(() => setLoading(false));
    }, [tenantId]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-[#4477f5] rounded-full animate-spin" />
        </div>
    );

    if (!tenant) return (
        <div className="space-y-4">
            <button onClick={() => navigate('/platform/tenants')}
                className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition">
                <ArrowLeft size={16} /> Back to Tenants
            </button>
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700 font-semibold text-sm">
                {error || 'Tenant not found.'}
            </div>
        </div>
    );

    const createdDate = tenant.createdAt
        ? new Date(tenant.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'N/A';

    const branchPct = tenant.usage?.maxBranches > 0
        ? ((tenant.usage?.branches || 0) / tenant.usage.maxBranches) * 100 : 0;
    const studentPct = tenant.usage?.maxStudents > 0
        ? ((tenant.usage?.students || 0) / tenant.usage.maxStudents) * 100 : 0;

    const normalizedStatus = String(tenant.status || (tenant.isApproved === false ? 'pending' : tenant.isActive ? 'active' : 'suspended')).toLowerCase();
    const isActive = normalizedStatus === 'active';
    const isPending = normalizedStatus === 'pending';

    const refreshTenant = async () => {
        const response = await platformService.getTenantDetails(tenantId);
        setTenant(response.data);
    };

    const approve = async () => {
        const reason = await promptAction('Add an optional approval note.', { title: 'Approve school', label: 'Approval note', confirmLabel: 'Continue' });
        if (reason === null || !(await confirmAction('Approve this school and enable access?', { title: 'Confirm approval', confirmLabel: 'Approve', tone: 'primary' }))) return;
        await platformService.approveTenant(tenantId, reason.trim());
        await refreshTenant();
    };

    const reject = async () => {
        const reason = await promptAction('Explain why this registration is being rejected.', { title: 'Reject registration', label: 'Rejection reason', required: true, confirmLabel: 'Continue' });
        if (!reason || !(await confirmAction('Reject this registration?', { title: 'Confirm rejection', confirmLabel: 'Reject' }))) return;
        await platformService.rejectTenant(tenantId, reason.trim());
        await refreshTenant();
    };

    const toggleAccess = async () => {
        if (isActive) {
            const reason = await promptAction('Explain why school access is being suspended.', { title: 'Suspend school', label: 'Suspension reason', required: true, confirmLabel: 'Continue' });
            if (!reason || !(await confirmAction('Suspend this school?', { title: 'Confirm suspension', confirmLabel: 'Suspend' }))) return;
            await platformService.suspendTenant(tenantId, reason.trim());
        } else {
            const reason = await promptAction('Add an optional note for the reactivation.', { title: 'Reactivate school', label: 'Reactivation note', confirmLabel: 'Continue' });
            if (reason === null || !(await confirmAction('Reactivate this school?', { title: 'Confirm reactivation', confirmLabel: 'Reactivate', tone: 'primary' }))) return;
            await platformService.reactivateTenant(tenantId, reason.trim());
        }
        await refreshTenant();
    };

    const changePlan = async () => {
        const plan = await promptAction('Choose the active subscription plan for this school.', {
            title: 'Change subscription plan',
            label: 'Plan',
            required: true,
            defaultValue: tenant.planSlug || '',
            choices: plans.map((item) => ({ value: item.slug, label: item.name || item.slug })),
            confirmLabel: 'Change plan'
        });
        if (!plan || plan === tenant.planSlug) return;
        await platformService.updateTenantPlan(tenantId, plan.trim().toLowerCase(), 'Changed from tenant details');
        await refreshTenant();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/platform/tenants')}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-white hover:shadow-sm transition text-slate-500 hover:text-slate-800">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-extrabold text-lg flex-shrink-0"
                            style={{ background: NAVY }}>
                            {(tenant.name || 'S')[0].toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{tenant.name}</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-lg border"
                                    style={{ background: '#e8f0fe', color: BLUE, borderColor: '#c7d9fd' }}>
                                    {tenant.domain}
                                </span>
                                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                                    <Calendar size={11} /> {createdDate}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        disabled={!tenant.admin?.email}
                        onClick={() => tenant.admin?.email && window.open(`mailto:${tenant.admin.email}`, '_blank')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-white hover:shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Mail size={15} /> Contact Admin
                    </button>
                    {['active', 'suspended'].includes(normalizedStatus) && hasPermission(user, 'platform.tenants.deactivate') && (
                    <button onClick={toggleAccess} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 transition shadow-sm"
                        style={{ background: isActive ? '#e11d48' : '#059669' }}>
                        {isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                    )}
                    {hasPermission(user, 'platform.tenants.plan.update') && <button onClick={changePlan} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 transition shadow-sm"
                        style={{ background: NAVY }}>
                        Manage Plan
                    </button>}
                </div>
            </div>

            {/* Status banner for pending */}
            {isPending && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                    <Clock size={18} className="text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="font-bold text-amber-800 text-sm">Pending Approval</p>
                        <p className="text-xs text-amber-600 font-medium">This school registered from the public portal and is awaiting platform approval.</p>
                    </div>
                    <button
                        onClick={approve}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm flex-shrink-0"
                    >
                        <CheckCircle2 size={15} /> Approve
                    </button>
                    <button onClick={reject}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm flex-shrink-0">
                        <XCircle size={15} /> Reject
                    </button>
                </div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left - Main content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatCard icon={Users}    label="Total Students" value={(tenant.usage?.students || 0).toLocaleString()} color={NAVY} />
                        <StatCard icon={School}   label="Active Branches" value={tenant.branches?.length || 0}                  color={BLUE} />
                        <StatCard icon={Database} label="Storage Used"    value={tenant.usage?.storage || '0 B'}               color="#0f766e" />
                    </div>

                    {/* Branch List */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-extrabold text-slate-800">Branch Network</h3>
                            <span className="text-xs font-bold text-slate-400">{tenant.branches?.length || 0} branches</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {tenant.branches?.map(branch => (
                                <div key={branch.id || branch._id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/60 transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                            style={{ background: NAVY }}>
                                            {(branch.name || 'B')[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{branch.name}</p>
                                            {branch.location && (
                                                <p className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                                                    <MapPin size={10} /> {branch.location}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-800">{(branch.students || 0).toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold uppercase">Students</p>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                                            {branch.status || 'Active'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {(!tenant.branches || tenant.branches.length === 0) && (
                                <div className="px-6 py-10 text-center">
                                    <School size={28} className="mx-auto mb-2 text-slate-200" />
                                    <p className="text-sm text-slate-400 font-semibold">No branches yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right - Sidebar */}
                <div className="space-y-5">
                    {/* Subscription card */}
                    <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 text-white" style={{ background: NAVY }}>
                            <div className="flex items-center justify-between mb-4">
                                <ShieldCheck size={22} className="opacity-80" />
                                <span className="text-xs font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg"
                                    style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}>
                                    {tenant.plan}
                                </span>
                            </div>
                            <h3 className="font-extrabold text-lg mb-1">Subscription Plan</h3>
                            <p className="text-white/55 text-sm font-medium">
                                {tenant.plan} tier · {tenant.subscription?.billingCycle || 'monthly'} billing
                            </p>
                        </div>
                        <div className="px-6 py-5 bg-white space-y-4">
                            <UsageBar
                                label="Branches"
                                used={tenant.usage?.branches || 0}
                                max={tenant.usage?.maxBranches || '∞'}
                                pct={branchPct}
                            />
                            <UsageBar
                                label="Students"
                                used={(tenant.usage?.students || 0).toLocaleString()}
                                max={tenant.usage?.maxStudents?.toLocaleString() || '∞'}
                                pct={studentPct}
                            />
                            <div className="pt-2 border-t border-slate-100 text-xs space-y-1">
                                <p className="flex justify-between gap-3"><span className="text-slate-500">Billing status</span><strong className="capitalize">{tenant.subscription?.status || 'pending'}</strong></p>
                                <p className="flex justify-between gap-3"><span className="text-slate-500">Billing email</span><strong className="truncate max-w-40">{tenant.billingContactEmail || tenant.admin?.email || 'Not set'}</strong></p>
                            </div>
                            <button onClick={() => navigate('/platform/billing')} className="w-full mt-2 py-2.5 rounded-xl text-sm font-bold border-2 hover:bg-slate-50 transition"
                                style={{ borderColor: NAVY, color: NAVY }}>
                                Open Billing
                            </button>
                        </div>
                    </div>

                    {/* Tenant info card */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                        <h3 className="font-extrabold text-slate-800 flex items-center gap-2 mb-4">
                            <Activity size={16} style={{ color: BLUE }} /> Tenant Info
                        </h3>
                        {[
                            { label: 'Status',       value: normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1),
                              color: isPending ? 'text-amber-600' : isActive ? 'text-emerald-600' : 'text-rose-600' },
                            { label: 'Admin',        value: tenant.admin?.name || 'Not assigned', color: 'text-slate-800' },
                            { label: 'Admin Email',  value: tenant.admin?.email || '—',           color: 'text-slate-600' },
                            { label: 'Storage Used', value: `${tenant.usage?.storageUsagePercent ?? 0}%`, color: 'text-slate-800' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                                <span className="text-sm font-semibold text-slate-500">{label}</span>
                                <span className={`text-sm font-bold ${color}`}>{value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <h3 className="font-extrabold text-slate-800 mb-4">Status History</h3>
                        <div className="space-y-3">
                            {(tenant.statusHistory || []).slice().reverse().map((entry, index) => (
                                <div key={`${entry.changedAt}-${index}`} className="border-b border-slate-50 pb-3 last:border-0">
                                    <p className="text-sm font-bold text-slate-700 capitalize">{entry.status}</p>
                                    <p className="text-xs text-slate-500">{entry.reason || 'No reason provided'}</p>
                                    <p className="text-[10px] text-slate-400">{entry.changedAt ? new Date(entry.changedAt).toLocaleString() : ''}</p>
                                </div>
                            ))}
                            {(tenant.statusHistory || []).length === 0 && <p className="text-xs text-slate-400">No status history recorded yet.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TenantDetails;
