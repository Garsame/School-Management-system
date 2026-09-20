import React, { useEffect, useState } from 'react';
import {
    ArrowUpRight,
    BarChart3,
    Building2,
    Calendar,
    CheckCircle2,
    Clock,
    DollarSign,
    GraduationCap,
    MapPin,
    Users
} from 'lucide-react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import tenantService from '../../services/tenantService';

const tones = {
    blue: { icon: 'text-[#3874ff]', bg: 'bg-[#eaf0ff]' },
    emerald: { icon: 'text-[#168403]', bg: 'bg-[#e9f7e7]' },
    rose: { icon: 'text-[#e63757]', bg: 'bg-[#fdebef]' },
    amber: { icon: 'text-[#e5780b]', bg: 'bg-[#fff2df]' }
};

const MetricCard = ({ label, value, helper, icon, tone }) => {
    const palette = tones[tone];
    return (
        <article className="phoenix-card flex min-h-[112px] items-center gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${palette.bg} ${palette.icon}`}>
                    {React.createElement(icon, { size: 19 })}
                </div>
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-[#6e7891]">{label}</p>
                <p className="mt-1 text-xl font-bold text-[#141824]">{value}</p>
                <p className="mt-1 truncate text-[11px] font-medium text-[#8a94ad]">{helper}</p>
            </div>
        </article>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        branches: 0,
        users: 0,
        students: 0,
        teachers: 0,
        graduates: 0,
        revenue: { totalRevenue: 0, projectedRevenue: 0 },
        branchDistribution: [],
        currentYear: null,
        trendData: []
    });
    const [branchesList, setBranchesList] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [branchesRes, reportsRes, yearsRes] = await Promise.all([
                    tenantService.getBranches(),
                    tenantService.getOverviewReport(),
                    tenantService.getAcademicYears()
                ]);

                setBranchesList(branchesRes.data || []);
                setStats({
                    branches: branchesRes.data?.length || 0,
                    users: reportsRes.data?.staffCount || 0,
                    students: reportsRes.data?.studentCount || 0,
                    teachers: reportsRes.data?.teacherCount || 0,
                    graduates: reportsRes.data?.graduateCount || 0,
                    revenue: reportsRes.data?.revenue || { totalRevenue: 0, projectedRevenue: 0 },
                    branchDistribution: reportsRes.data?.branchDistribution || [],
                    currentYear: yearsRes.data?.find((year) => year.isCurrent) || null,
                    trendData: reportsRes.data?.trendData || []
                });

                try {
                    const logsRes = await tenantService.getAuditLogs({ limit: 5 });
                    setActivities(logsRes.data?.logs || []);
                } catch (error) {
                    console.error('Failed to load audit logs:', error);
                    setActivities([]);
                }
            } catch (error) {
                console.error('Failed to load dashboard stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d9e2ff] border-t-[#3874ff]" />
            </div>
        );
    }

    const revenue = stats.revenue || { totalRevenue: 0, projectedRevenue: 0 };
    return (
        <div className="tenant-dashboard-tight">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">School dashboard</h1>
                    <p className="phoenix-page-subtitle">A concise view of operations, finance, and recent activity.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="phoenix-badge">
                        <Calendar size={13} />
                        {stats.currentYear?.name || 'Academic year not set'}
                    </div>
                    <button onClick={() => navigate('/tenant/reports')} className="phoenix-secondary-button">
                        <BarChart3 size={15} /> View reports
                    </button>
                </div>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard label="Branches" value={stats.branches} helper="Active school locations" icon={Building2} tone="emerald" />
                <MetricCard label="Teachers" value={stats.teachers} helper="Active teaching staff" icon={Users} tone="blue" />
                <MetricCard label="Students" value={stats.students} helper="Active learners" icon={GraduationCap} tone="rose" />
                <MetricCard label="Graduates" value={stats.graduates} helper="Completed final grade" icon={GraduationCap} tone="emerald" />
                <MetricCard label="All staff accounts" value={stats.users} helper="Accounts across all roles" icon={Users} tone="blue" />
                <MetricCard label="Collected" value={`$${revenue.totalRevenue.toLocaleString()}`} helper={`Projected $${revenue.projectedRevenue.toLocaleString()}`} icon={DollarSign} tone="amber" />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <article className="phoenix-card min-w-0">
                    <div className="phoenix-card-header">
                        <div>
                            <h2 className="phoenix-section-title">Financial performance</h2>
                            <p className="phoenix-section-copy">Collected fees compared with projected invoices.</p>
                        </div>
                    </div>
                    <div className="h-64 px-3 pb-3 pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.trendData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke="#e3e6ed" />
                                    <XAxis dataKey="month" stroke="#6e7891" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#6e7891" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #cbd0dd', boxShadow: 'none' }} />
                                    <Area type="monotone" dataKey="Collected" stroke="var(--primary)" strokeWidth={2.5} fill="var(--primary)" fillOpacity={0.1} name="Collected" />
                                    <Area type="monotone" dataKey="Projected" stroke="var(--secondary)" strokeWidth={2} fill="transparent" strokeDasharray="4 3" name="Projected" />
                                </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </article>

                <aside className="phoenix-card">
                    <div className="phoenix-card-header">
                        <div>
                            <h2 className="phoenix-section-title">Recent activity</h2>
                            <p className="phoenix-section-copy">Latest staff actions.</p>
                        </div>
                        <Clock size={17} className="text-[#8a94ad]" />
                    </div>
                    <div className="divide-y divide-[#e3e6ed] px-4">
                        {activities.length > 0 ? activities.slice(0, 4).map((activity, index) => (
                            <button
                                key={activity.id || activity._id || index}
                                type="button"
                                onClick={() => navigate('/tenant/audit-logs')}
                                className="flex w-full gap-3 py-3 text-left"
                            >
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--secondary)]" />
                                <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold text-[#31374a]">{activity.action}</span>
                                    <span className="mt-1 block truncate text-[11px] text-[#6e7891]">{activity.actor} ({activity.actorRole})</span>
                                    <span className="mt-1 block text-[10px] text-[#8a94ad]">{new Date(activity.timestamp).toLocaleString()}</span>
                                </span>
                            </button>
                        )) : (
                            <div className="flex min-h-56 items-center justify-center px-3 text-center">
                                <p className="text-xs leading-5 text-[#8a94ad]">Recent activity will appear here after staff actions are recorded.</p>
                            </div>
                        )}
                    </div>
                </aside>
            </section>

            <section className="phoenix-card overflow-hidden">
                <div className="phoenix-card-header">
                    <div>
                        <h2 className="phoenix-section-title">Branch network</h2>
                        <p className="phoenix-section-copy">Current status and student distribution.</p>
                    </div>
                    <button onClick={() => navigate('/tenant/branches')} className="phoenix-secondary-button">
                        Manage branches <ArrowUpRight size={14} />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                        <thead>
                            <tr>
                                <th className="px-4 py-3">Branch</th>
                                <th className="px-4 py-3">Code</th>
                                <th className="px-4 py-3">Students</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {branchesList.slice(0, 4).map((branch) => {
                                const distribution = stats.branchDistribution.find((item) => item.branchId === branch._id);
                                return (
                                    <tr key={branch._id}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#eaf0ff] text-[#3874ff]">
                                                    <MapPin size={15} />
                                                </div>
                                                <span className="font-semibold text-[#141824]">{branch.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-[#6e7891]">{branch.code || 'Not set'}</td>
                                        <td className="px-4 py-3 font-semibold text-[#31374a]">{distribution?.count || 0}</td>
                                        <td className="px-4 py-3">
                                            <span className={`phoenix-status ${branch.isActive ? 'phoenix-status-success' : 'phoenix-status-muted'}`}>
                                                <CheckCircle2 size={11} /> {branch.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {branchesList.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[#8a94ad]">No branches available.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
