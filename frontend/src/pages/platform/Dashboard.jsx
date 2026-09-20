import React, { useEffect, useState } from 'react';
import {
    Activity,
    CheckCircle2,
    DollarSign,
    HeartPulse,
    Users
} from 'lucide-react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid
} from 'recharts';
import platformService from '../../services/platformService';

const MetricTile = ({ icon, label, value, helper, tone = 'blue' }) => {
    const colors = {
        blue: { bg: '#eaf0ff', color: '#3874ff' },
        green: { bg: '#e9f7e7', color: '#168403' }
    };
    const palette = colors[tone];

    return (
        <article className="phoenix-card flex min-h-56 flex-col justify-between p-5">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: palette.bg, color: palette.color }}>
                    {React.createElement(icon, { size: 19 })}
                </div>
                <span className="text-xs font-semibold text-[#6e7891]">{label}</span>
            </div>
            <div>
                <p className="text-3xl font-bold text-[#141824]">{value}</p>
                <div className="mt-7 border-t border-[#e3e6ed] pt-3">
                    <span className="rounded bg-[#e9f7e7] px-2 py-1 text-[10px] font-bold text-[#168403]">Live</span>
                    <p className="mt-3 text-xs font-medium text-[#6e7891]">{helper}</p>
                </div>
            </div>
        </article>
    );
};

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await platformService.getDashboardStats();
                setStats(response.data);
                setError('');
            } catch (requestError) {
                console.error('Error fetching stats:', requestError);
                setError(requestError.response?.data?.message || 'Failed to load dashboard data.');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="space-y-5 animate-pulse">
                <div className="h-16 w-80 rounded bg-[#e3e6ed]" />
                <div className="grid gap-5 lg:grid-cols-3">
                    <div className="h-56 bg-[#e3e6ed]" />
                    <div className="h-56 bg-[#e3e6ed]" />
                    <div className="h-56 bg-[#e3e6ed]" />
                </div>
            </div>
        );
    }

    const totalTenants = stats?.totalTenants || 0;
    const activeTenants = stats?.activeTenants || 0;
    const inactiveTenants = Math.max(0, totalTenants - activeTenants);
    const revenueTracked = Boolean(stats?.subscriptionRevenueTracked);
    const subscriptionRevenue = stats?.subscriptionRevenue || 0;
    const revenueTrend = stats?.subscriptionRevenueTrend || [];
    const tenantDistribution = [
        { name: 'Active', value: activeTenants },
        { name: 'Inactive', value: inactiveTenants }
    ];
    const summaryRows = [
        { label: 'Branches', value: stats?.totalBranches || 0, color: '#3874ff' },
        { label: 'Students', value: (stats?.totalStudents || 0).toLocaleString(), color: '#25b003' },
        { label: 'Revenue', value: revenueTracked ? `$${subscriptionRevenue.toLocaleString()}` : 'Pending', color: '#e5780b' },
        { label: 'Health', value: stats?.healthStatus || 'Unknown', color: '#e63757' }
    ];

    return (
        <div className="space-y-8 pb-8">
            <section className="grid gap-8 xl:grid-cols-[minmax(520px,0.95fr)_minmax(0,1.25fr)]">
                <div>
                    <div className="mb-5">
                        <h1 className="phoenix-page-title">Platform Dashboard</h1>
                        <p className="phoenix-page-subtitle">Monitor tenant growth, subscription activity, and system health in one place.</p>
                        {error && <p className="mt-2 text-xs font-bold text-[#e63757]">{error}</p>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <MetricTile icon={Users} label="Registered schools" value={totalTenants} helper="All tenant accounts" tone="blue" />
                        <MetricTile icon={CheckCircle2} label="Active schools" value={activeTenants} helper="Currently operational" tone="green" />
                    </div>

                    <div className="mt-5">
                        <h2 className="mb-3 text-sm font-bold text-[#141824]">Platform summary</h2>
                        <div className="divide-y divide-[#e3e6ed] border-y border-[#cbd0dd]">
                            {summaryRows.map((row, index) => (
                                <div key={row.label} className="flex items-center justify-between px-1 py-3 text-sm">
                                    <span className="flex items-center gap-2 font-medium text-[#525b75]">
                                        <span className="h-2 w-2 rounded-sm" style={{ background: row.color }} />
                                        {index + 1}. {row.label}
                                    </span>
                                    <span className="font-bold text-[#141824]">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="min-w-0">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-[#141824]">Subscription revenue</h2>
                            <p className="mt-1 text-sm font-medium text-[#6e7891]">Recorded tenant subscription transactions.</p>
                        </div>
                        <div className="phoenix-badge">
                            <DollarSign size={13} className="text-[#3874ff]" />
                            {revenueTracked ? `$${subscriptionRevenue.toLocaleString()}` : 'Not tracked'}
                        </div>
                    </div>

                    <div className="h-[430px] border-y border-[#cbd0dd] py-4">
                        {revenueTrend.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="platformRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3874ff" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#3874ff" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical stroke="#dde2ea" />
                                    <XAxis dataKey="_id" stroke="#6e7891" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#6e7891" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #cbd0dd', boxShadow: 'none' }} />
                                    <Area type="monotone" dataKey="total" name="Revenue" stroke="#3874ff" strokeWidth={2.5} fill="url(#platformRevenue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-center">
                                <div>
                                    <DollarSign size={26} className="mx-auto mb-3 text-[#8a94ad]" />
                                    <p className="text-sm font-bold text-[#525b75]">No subscription transactions yet</p>
                                    <p className="mt-1 text-xs text-[#8a94ad]">Recorded platform payments will appear here.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="grid gap-8 border-t border-[#cbd0dd] pt-7 xl:grid-cols-[420px_minmax(0,1fr)]">
                <div>
                    <h2 className="text-xl font-bold text-[#141824]">Tenant activation</h2>
                    <p className="mt-1 text-sm font-medium text-[#6e7891]">Active compared with inactive schools.</p>
                    <div className="relative mt-4 h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={tenantDistribution} cx="50%" cy="50%" innerRadius={68} outerRadius={94} paddingAngle={3} dataKey="value">
                                    <Cell fill="#3874ff" />
                                    <Cell fill="#d9e2ff" />
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-[#141824]">{totalTenants}</span>
                            <span className="text-xs font-medium text-[#6e7891]">Schools</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-[#e3e6ed] pt-3">
                        <div><span className="text-xs text-[#6e7891]">Active</span><p className="text-lg font-bold text-[#141824]">{activeTenants}</p></div>
                        <div><span className="text-xs text-[#6e7891]">Inactive</span><p className="text-lg font-bold text-[#141824]">{inactiveTenants}</p></div>
                    </div>
                </div>

                <div className="min-w-0">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-[#141824]">Recently onboarded tenants</h2>
                            <p className="mt-1 text-sm font-medium text-[#6e7891]">Latest schools registered on the platform.</p>
                        </div>
                        <span className="phoenix-badge">{(stats?.recentTenants || []).length} records</span>
                    </div>
                    <div className="overflow-x-auto border-y border-[#cbd0dd]">
                        <table className="w-full min-w-[650px] text-left">
                            <thead><tr><th className="px-3 py-3">School</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Branches</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Joined</th></tr></thead>
                            <tbody>
                                {(stats?.recentTenants || []).map((tenant) => (
                                    <tr key={tenant.id}>
                                        <td className="px-3 py-3.5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf0ff] font-bold text-[#3874ff]">{tenant.name?.charAt(0)?.toUpperCase() || 'T'}</span><span className="font-semibold text-[#141824]">{tenant.name}</span></div></td>
                                        <td className="px-3 py-3.5 font-medium">{tenant.plan}</td>
                                        <td className="px-3 py-3.5 font-medium">{tenant.branchCount}</td>
                                        <td className="px-3 py-3.5"><span className="rounded bg-[#e9f7e7] px-2 py-1 text-[10px] font-bold text-[#168403]">{tenant.status}</span></td>
                                        <td className="px-3 py-3.5 text-[#6e7891]">{tenant.createdAgo}</td>
                                    </tr>
                                ))}
                                {(!stats?.recentTenants || stats.recentTenants.length === 0) && <tr><td colSpan={5} className="px-3 py-12 text-center text-sm text-[#8a94ad]">No tenant onboarding records found yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section className="border-t border-[#cbd0dd] pt-7">
                <div className="mb-4 flex items-center justify-between">
                    <div><h2 className="text-xl font-bold text-[#141824]">System activity</h2><p className="mt-1 text-sm font-medium text-[#6e7891]">Recent platform audit events.</p></div>
                    <HeartPulse size={20} className="text-[#3874ff]" />
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(stats?.recentActivity || []).slice(0, 6).map((event, index) => (
                        <div key={event.id || index} className="flex gap-3 border-b border-[#e3e6ed] px-1 py-3">
                            <Activity size={15} className="mt-0.5 shrink-0 text-[#3874ff]" />
                            <div className="min-w-0"><p className="truncate text-xs font-bold text-[#31374a]">{event.action}</p><p className="mt-1 truncate text-[11px] text-[#6e7891]">{event.actor} - {event.target}</p><p className="mt-1 text-[10px] text-[#8a94ad]">{event.time}</p></div>
                        </div>
                    ))}
                    {(!stats?.recentActivity || stats.recentActivity.length === 0) && <p className="text-xs font-medium text-[#8a94ad]">No recent audit activity available.</p>}
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
