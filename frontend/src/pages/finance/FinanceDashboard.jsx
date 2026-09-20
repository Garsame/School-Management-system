import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Percent, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getOutstanding, getPaymentsSummary } from '../../services/api/finance.api';
import { getAcademicYears, getBranches } from '../../services/api/tenant.api';
import { Select } from '../../components/ui';
import FinanceFilterBar from '../../components/finance/FinanceFilterBar';

const EMPTY_FILTERS = { branchId: '', academicYearId: '' };
const COLORS = ['#3874ff', '#00a76f', '#f59e0b', '#8b5cf6', '#e63757'];
const money = value => `$${Number(value || 0).toLocaleString()}`;

const MetricCard = ({ label, value, helper, icon: Icon, tone }) => (
    <article className="phoenix-card min-h-[138px] p-5">
        <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#6e7891]">{label}</p><p className="mt-3 text-3xl font-bold text-[#141824]">{value}</p><p className="mt-2 text-xs text-[#8a94ad]">{helper}</p></div>
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon size={20}/></div>
        </div>
    </article>
);

const EmptyChart = ({ children }) => <div className="flex h-full items-center justify-center text-sm text-slate-400">{children}</div>;

const FinanceDashboard = () => {
    const [summary, setSummary] = useState({ byMethod: [], byBranch: [] });
    const [outstanding, setOutstanding] = useState({ totalOutstanding: 0, count: 0 });
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
    const [loading, setLoading] = useState(true);

    useEffect(() => { Promise.all([getBranches(), getAcademicYears()]).then(([b, y]) => { setBranches((b || []).map(item => ({ label: item.name, value: item._id }))); setYears((y || []).map(item => ({ label: item.name, value: item._id }))); }).catch(console.error); }, []);
    useEffect(() => { setLoading(true); Promise.all([getPaymentsSummary(filters), getOutstanding(filters)]).then(([s, o]) => { setSummary(s || { byMethod: [], byBranch: [] }); setOutstanding(o || { totalOutstanding: 0, count: 0 }); }).catch(console.error).finally(() => setLoading(false)); }, [filters]);

    const totalCollected = useMemo(() => (summary.byMethod || []).reduce((sum, item) => sum + Number(item.total || 0), 0), [summary]);
    const exposure = totalCollected + Number(outstanding.totalOutstanding || 0);
    const collectionRate = exposure ? Math.round((totalCollected / exposure) * 100) : 0;
    const branchData = (summary.byBranch || []).map(item => ({ name: branches.find(branch => branch.value === item._id)?.label || 'Unknown', Collected: item.total }));
    const methodData = (summary.byMethod || []).map(item => ({ name: item._id || 'Other', value: item.total }));

    if (loading && !totalCollected && !outstanding.count) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]"/></div>;

    return <div className="space-y-5">
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Financial overview</h1><p className="phoenix-page-subtitle">A decision-ready view of collections, exposure, and unpaid accounts.</p></div></div>
        <FinanceFilterBar activeCount={Object.values(filters).filter(Boolean).length} loading={loading} onApply={() => setFilters(draftFilters)} onReset={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}>
            <Select label="Campus" options={branches} value={draftFilters.branchId} onChange={e => setDraftFilters({ ...draftFilters, branchId: e.target.value })} placeholder="All campuses"/>
            <Select label="Academic year" options={years} value={draftFilters.academicYearId} onChange={e => setDraftFilters({ ...draftFilters, academicYearId: e.target.value })} placeholder="All academic years"/>
        </FinanceFilterBar>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Collected" value={money(totalCollected)} helper="Payments received in this view" icon={Wallet} tone="bg-emerald-50 text-emerald-700"/>
            <MetricCard label="Outstanding" value={money(outstanding.totalOutstanding)} helper="Balance still awaiting collection" icon={AlertTriangle} tone="bg-amber-50 text-amber-700"/>
            <MetricCard label="Collection rate" value={`${collectionRate}%`} helper="Collected against current exposure" icon={Percent} tone="bg-blue-50 text-blue-700"/>
            <MetricCard label="Unpaid invoices" value={outstanding.count || 0} helper="Invoices requiring follow-up" icon={FileText} tone="bg-rose-50 text-rose-700"/>
        </section>
        <section className="grid gap-4 xl:grid-cols-5">
            <article className="phoenix-card p-5 xl:col-span-3"><h2 className="phoenix-section-title">Collections by branch</h2><p className="phoenix-section-copy">Compare fee collections across campuses.</p><div className="mt-5 h-80">{branchData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={branchData}><CartesianGrid vertical={false} stroke="#e3e6ed"/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={11}/><Tooltip formatter={money}/><Bar dataKey="Collected" fill="#3874ff" radius={[6, 6, 0, 0]}/></BarChart></ResponsiveContainer> : <EmptyChart>No branch collection data for these filters.</EmptyChart>}</div></article>
            <article className="phoenix-card p-5 xl:col-span-2"><h2 className="phoenix-section-title">Payment channels</h2><p className="phoenix-section-copy">How families are paying fees.</p><div className="mt-5 h-80">{methodData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={methodData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={105} paddingAngle={3}>{methodData.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip formatter={money}/><Legend/></PieChart></ResponsiveContainer> : <EmptyChart>No payment method data for these filters.</EmptyChart>}</div></article>
        </section>
    </div>;
};

export default FinanceDashboard;
