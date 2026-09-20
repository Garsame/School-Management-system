import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Calendar, 
  ChevronDown,
  TrendingUp, 
  PieChart as PieChartIcon,
  Users,
  Building2,
  DollarSign,
  Download,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import tenantService from '../../services/tenantService';

const reportCardPalette = {
    blue: { bg: '#eff6ff', color: '#2563eb', border: '#dbeafe' },
    indigo: { bg: '#eef2ff', color: '#4f46e5', border: '#e0e7ff' },
    emerald: { bg: '#ecfdf5', color: '#059669', border: '#d1fae5' },
    amber: { bg: '#fffbeb', color: '#d97706', border: '#fef3c7' }
};

const collectionHealth = (collected, projected) => {
    const ratio = projected > 0 ? (collected / projected) * 100 : 0;
    if (ratio < 50) return { ratio, label: 'Critical', panel: 'border-rose-200 bg-rose-50/40', value: 'text-rose-700', badge: 'bg-rose-100 text-rose-700', outstanding: 'text-rose-700' };
    if (ratio < 75) return { ratio, label: 'Needs attention', panel: 'border-amber-200 bg-amber-50/40', value: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', outstanding: 'text-amber-700' };
    return { ratio, label: 'Healthy', panel: 'border-emerald-200 bg-emerald-50/40', value: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', outstanding: 'text-slate-900' };
};

const ReportCard = ({ title, value, subValue, icon, tone = 'blue', delay = '' }) => {
    const palette = reportCardPalette[tone] || reportCardPalette.blue;
    return (
    <div className={`phoenix-card p-5 ${delay}`}>
        <div className="flex justify-between items-start mb-4">
            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border"
                style={{ background: palette.bg, color: palette.color, borderColor: palette.border }}
            >
                {React.cloneElement(icon, { size: 18, className: 'shrink-0' })}
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Live</span>
        </div>
        <div className="space-y-0.5">
            <p className="text-xs font-semibold text-slate-500">{title}</p>
            <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 leading-tight">{subValue}</p>
        </div>
    </div>
    );
};

const Reports = () => {
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [filters, setFilters] = useState({ branchId: '', academicYearId: '' });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const health = report ? collectionHealth(report.revenue.totalRevenue, report.revenue.projectedRevenue) : null;
    const exportCsv = () => {
        if (!report) return;
        const rows = [
            ['Metric', 'Value'],
            ['Active students', report.studentCount],
            ['Active enrollments', report.activeEnrollments],
            ['Teachers', report.teacherCount],
            ['All staff', report.staffCount],
            ['Graduates', report.graduateCount],
            ['Average marks', Number(report.performance.avgMarks || 0).toFixed(1)],
            ['Recorded results', report.performance.totalResults],
            ['Collected revenue', report.revenue.totalRevenue],
            ['Projected revenue', report.revenue.projectedRevenue]
        ];
        const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'school-overview-report.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        const loadInitial = async () => {
            try {
                const [bRes, yRes] = await Promise.all([
                    tenantService.getBranches(),
                    tenantService.getAcademicYears()
                ]);
                setBranches(bRes.data);
                setYears(yRes.data);
                const current = yRes.data.find(y => y.isCurrent);
                if (current) setFilters(f => ({ ...f, academicYearId: current._id }));
            } catch (err) {
                console.error(err);
            }
        };
        loadInitial();
    }, []);

    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                const res = await tenantService.getOverviewReport(filters.branchId, filters.academicYearId);
                setReport(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [filters]);

    return (
        <div className="phoenix-resource-page pb-10">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Reports</h1>
                    <p className="phoenix-page-subtitle">Review academic performance, enrollment, and financial totals.</p>
                </div>
                <button type="button" onClick={exportCsv} disabled={!report || loading} className="phoenix-secondary-button disabled:opacity-50"><Download size={15} /> Export CSV</button>
            </div>

            {/* Global Filters — clean white card */}
            <div className="phoenix-resource-toolbar flex-wrap">
                <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                        <Building2 className="phoenix-input-icon" size={14} />
                        <select
                            className="phoenix-control phoenix-control-with-icon phoenix-control-select appearance-none"
                            value={filters.branchId}
                            onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}
                        >
                            <option value="">Aggregate – All Branches</option>
                            {branches.map(b => (
                                <option key={b._id} value={b._id}>{b.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="phoenix-select-icon" size={14} />
                    </div>
                </div>

                <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                        <Calendar className="phoenix-input-icon" size={14} />
                        <select
                            className="phoenix-control phoenix-control-with-icon phoenix-control-select appearance-none"
                            value={filters.academicYearId}
                            onChange={(e) => setFilters({ ...filters, academicYearId: e.target.value })}
                        >
                            <option value="">Select Timeline</option>
                            {years.map(y => (
                                <option key={y._id} value={y._id}>{y.name} {y.isCurrent ? '(Current)' : ''}</option>
                            ))}
                        </select>
                        <ChevronDown className="phoenix-select-icon" size={14} />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin shadow" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                    <p className="text-xs font-semibold text-slate-500">Loading report data...</p>
                </div>
            ) : report && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <ReportCard
                            title="Student Body"
                            value={report.studentCount}
                            subValue="Unique Identities Registered"
                            icon={<Users />}
                            tone="blue"
                            delay="delay-75"
                        />
                        <ReportCard
                            title="Enrollment Depth"
                            value={report.activeEnrollments}
                            subValue="Active Seats for Period"
                            icon={<BarChart3 />}
                            tone="indigo"
                            delay="delay-150"
                        />
                        <ReportCard
                            title="Revenue Liquid"
                            value={`$${report.revenue.totalRevenue.toLocaleString()}`}
                            subValue="Total Liquid Collections"
                            icon={<DollarSign />}
                            tone="emerald"
                            delay="delay-200"
                        />
                        <ReportCard
                            title="Projected Yield"
                            value={`$${report.revenue.projectedRevenue.toLocaleString()}`}
                            subValue="Institutional Revenue Pipeline"
                            icon={<TrendingUp />}
                            tone="amber"
                            delay="delay-300"
                        />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
                        <article className="phoenix-card p-5">
                            <div className="mb-5"><h3 className="phoenix-section-title">Six-month collection trend</h3><p className="phoenix-section-copy">Invoiced value compared with recorded payments.</p></div>
                            <div className="h-72" aria-label="Six-month collection trend chart">
                                <ResponsiveContainer width="100%" height="100%"><AreaChart data={report.trendData || []} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e3e6ed"/><XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false}/><YAxis fontSize={11} tickLine={false} axisLine={false}/><Tooltip/><Legend/><Area dataKey="Collected" stroke="var(--primary)" fill="var(--primary-soft)" strokeWidth={2.5}/><Area dataKey="Projected" stroke="var(--secondary)" fill="var(--secondary-soft)" strokeWidth={2}/></AreaChart></ResponsiveContainer>
                            </div>
                        </article>
                        <article className="phoenix-card p-5">
                            <div className="mb-5"><h3 className="phoenix-section-title">Student status mix</h3><p className="phoenix-section-copy">Active, graduated, transferred, and inactive learners.</p></div>
                            <div className="h-72" aria-label="Student status distribution chart">
                                <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={report.studentStatusDistribution || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={3}>{(report.studentStatusDistribution || []).map((entry, index) => <Cell key={entry.name} fill={['var(--primary)', 'var(--secondary)', '#f59e0b', '#94a3b8'][index % 4]} />)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer>
                            </div>
                        </article>
                    </div>

                    {/* Detail Panels */}
                    <div className="grid lg:grid-cols-3 gap-6">
                        {/* Academic Performance */}
                        <div className="lg:col-span-2 phoenix-card p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="phoenix-section-title">Academic performance</h3>
                                    <p className="phoenix-section-copy">Results in the selected branch and academic year.</p>
                                </div>
                                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                    <PieChartIcon className="text-slate-400" size={18} />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-2xl font-black text-slate-900">{report.performance.avgMarks.toFixed(1)}%</p>
                                    <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Average grade</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-slate-900">{report.performance.totalResults}</p>
                                        <p className="text-xs text-slate-500">Recorded results</p>
                                    </div>
                                </div>


                            </div>
                        </div>

                        {/* Financial Health – brand colors, no gradient */}
                        <div className={`phoenix-card p-6 flex flex-col justify-between ${health.panel}`}>
                            <div className="relative z-10">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="phoenix-section-title">Financial health</h3>
                                    <span className={`rounded px-2 py-1 text-xs font-bold ${health.badge}`}>{health.label}</span>
                                </div>
                                <p className="phoenix-section-copy">Collection ratio for the selected period.</p>

                                <div className="mt-6 space-y-0.5">
                                    <p className={`text-3xl font-bold ${health.value}`}>
                                        {health.ratio.toFixed(1)}%
                                    </p>
                                    <p className="text-xs text-slate-500 pt-1">Revenue collected</p>
                                </div>

                                <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500">Collected</span>
                                        <span className="font-bold text-sm">$ {report.revenue.totalRevenue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500">Outstanding</span>
                                        <span className={`font-bold text-sm ${health.outstanding}`}>$ {Math.max(0, report.revenue.projectedRevenue - report.revenue.totalRevenue).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;
