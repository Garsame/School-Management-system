import React, { useEffect, useMemo, useState } from 'react';
import { getBranchOverview, getCurrentAcademicYear } from '../../services/api/branch.api';
import { Spinner, Toast } from '../../components/ui';
import { Users, BookOpen, DollarSign, TrendingUp, Calendar, ClipboardCheck, GraduationCap, WalletCards } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const COLORS = ['#3874ff', '#00a76f', '#f5a524', '#e63757', '#6e7891'];
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
const MetricCard = ({ label, value, helper, icon: Icon, tone = 'blue' }) => {
    const tones = { blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700' };
    return <article className="phoenix-card min-h-[132px] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[#6e7891]">{label}</p><p className="mt-2 text-2xl font-bold text-[#141824]">{value}</p>{helper && <p className="mt-2 text-xs text-[#8a94ad]">{helper}</p>}</div><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={20} /></div></div></article>;
};

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [year, setYear] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        getCurrentAcademicYear().then(async (yearResponse) => {
            const activeYear = yearResponse?.data || yearResponse;
            setYear(activeYear);
            const response = await getBranchOverview(activeYear?._id);
            setStats(response?.data || response);
        }).catch((err) => setError(err.response?.data?.message || 'Dashboard analytics could not be loaded.')).finally(() => setLoading(false));
    }, []);
    const invoiced = stats?.finance?.totalInvoiced || 0;
    const collected = stats?.finance?.totalCollected || 0;
    const rate = invoiced ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0;
    const activeExams = useMemo(() => stats?.exams?.byStatus?.find(item => item.name === 'Open')?.count || 0, [stats]);
    if (loading) return <div className="flex h-96 items-center justify-center"><Spinner size="lg" /></div>;
    return <div className="space-y-6">
        {error && <Toast type="error" message={error} onClose={() => setError('')} />}
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Branch Console</h1><p className="phoenix-page-subtitle">Academic, operational, and financial health at a glance.</p></div><div className="flex items-center gap-2 rounded border border-[#e3e6ed] bg-white px-3 py-2 text-xs"><Calendar size={14}/><span className="font-semibold">Academic Year:</span><strong className="text-[var(--primary)]">{year?.name || 'Not configured'}</strong></div></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Active Students" value={stats?.students?.totalActive || 0} helper={`${stats?.students?.enrolledCurrentYear || 0} enrolled this year`} icon={Users}/>
            <MetricCard label="Active Staff" value={stats?.staff?.total || 0} helper="All active branch employees" icon={GraduationCap} tone="green"/>
            <MetricCard label="Outstanding Fees" value={money(stats?.finance?.outstanding)} helper={`${rate}% collection rate`} icon={WalletCards} tone="amber"/>
            <MetricCard label="Open Exams" value={activeExams} helper={`${stats?.academics?.resultsRecorded || 0} results recorded`} icon={ClipboardCheck} tone="rose"/>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="phoenix-card p-5"><h2 className="text-sm font-bold text-[#141824]">Fee collection trend</h2><p className="mt-1 text-xs text-[#8a94ad]">Invoiced and collected during the last six months.</p><div className="mt-5 h-80"><ResponsiveContainer><AreaChart data={stats?.financeTrend || []}><CartesianGrid strokeDasharray="3 3" stroke="#e3e6ed"/><XAxis dataKey="month" fontSize={11}/><YAxis fontSize={11}/><Tooltip formatter={(v) => money(v)}/><Legend/><Area dataKey="Invoiced" stroke="#3874ff" fill="#eaf0ff" strokeWidth={2}/><Area dataKey="Collected" stroke="#00a76f" fill="#e8f8f1" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></section>
            <section className="phoenix-card p-5"><h2 className="text-sm font-bold text-[#141824]">Enrollment by class</h2><p className="mt-1 text-xs text-[#8a94ad]">Current-year class population.</p><div className="mt-5 h-80"><ResponsiveContainer><BarChart data={stats?.enrollmentByClass || []} margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3e6ed"/><XAxis dataKey="name" fontSize={11}/><YAxis allowDecimals={false} fontSize={11}/><Tooltip/><Bar dataKey="count" name="Students" fill="#3874ff" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>
            <section className="phoenix-card p-5"><h2 className="text-sm font-bold">Student status</h2><div className="mt-3 h-64"><ResponsiveContainer><PieChart><Pie data={stats?.studentStatuses || []} dataKey="count" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>{(stats?.studentStatuses || []).map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div></section>
            <section className="phoenix-card p-5"><h2 className="text-sm font-bold">Academic snapshot</h2><div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><MetricCard label="Average result" value={`${stats?.academics?.averagePercentage || 0}%`} icon={TrendingUp} tone="green"/><MetricCard label="Total invoiced" value={money(invoiced)} icon={DollarSign}/><MetricCard label="Total collected" value={money(collected)} icon={BookOpen} tone="green"/><MetricCard label="Exam sessions" value={stats?.exams?.total || 0} icon={ClipboardCheck} tone="amber"/></div></section>
        </div>
    </div>;
};
export default Dashboard;
