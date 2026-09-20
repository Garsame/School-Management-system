import React, { useEffect, useState } from 'react';
import { Download, Printer, Users, DollarSign, GraduationCap, ClipboardCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAcademicYears, getBranchOverview, getCurrentAcademicYear } from '../../services/api/branch.api';
import { Button, Spinner, Toast } from '../../components/ui';

const COLORS = ['#3874ff', '#00a76f', '#f5a524', '#e63757', '#6e7891'];
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
const quoteCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const Reports = () => {
    const [years, setYears] = useState([]);
    const [yearId, setYearId] = useState('');
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([getAcademicYears(), getCurrentAcademicYear()]).then(([allYears, current]) => {
            const list = allYears?.data || allYears || [];
            const active = current?.data || current;
            setYears(list);
            setYearId(active?._id || list[0]?._id || '');
        }).catch((err) => setError(err.response?.data?.message || 'Report filters could not be loaded.'));
    }, []);
    useEffect(() => {
        if (!yearId) return;
        setLoading(true);
        getBranchOverview(yearId).then((response) => setStats(response?.data || response)).catch((err) => setError(err.response?.data?.message || 'Report could not be loaded.')).finally(() => setLoading(false));
    }, [yearId]);

    const exportCsv = () => {
        const rows = [
            ['Metric', 'Value'], ['Active students', stats?.students?.totalActive], ['Year enrollments', stats?.students?.enrolledCurrentYear], ['Active staff', stats?.staff?.total], ['Exam sessions', stats?.exams?.total], ['Average result', stats?.academics?.averagePercentage], ['Results recorded', stats?.academics?.resultsRecorded], ['Total invoiced', stats?.finance?.totalInvoiced], ['Total collected', stats?.finance?.totalCollected], ['Outstanding', stats?.finance?.outstanding],
            [], ['Class', 'Students'], ...(stats?.enrollmentByClass || []).map(item => [item.name, item.count])
        ];
        const blob = new Blob([rows.map(row => row.map(quoteCsv).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `branch-report-${yearId}.csv`; link.click(); URL.revokeObjectURL(url);
    };

    if (loading && !stats) return <div className="flex h-96 items-center justify-center"><Spinner/></div>;
    const cards = [
        ['Active students', stats?.students?.totalActive || 0, `${stats?.students?.enrolledCurrentYear || 0} enrolled in selected year`, Users],
        ['Active staff', stats?.staff?.total || 0, 'Branch employees', GraduationCap],
        ['Average result', `${stats?.academics?.averagePercentage || 0}%`, `${stats?.academics?.resultsRecorded || 0} results recorded`, ClipboardCheck],
        ['Outstanding fees', money(stats?.finance?.outstanding), `${money(stats?.finance?.totalCollected)} collected`, DollarSign]
    ];
    return <div className="space-y-6">
        {error && <Toast type="error" message={error} onClose={() => setError('')}/>}
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Branch Analytics</h1><p className="phoenix-page-subtitle">Exportable academic, enrollment, staffing, exam, and finance insights.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><Printer size={15}/> Print</Button><Button onClick={exportCsv}><Download size={15}/> Export CSV</Button></div></div>
        <section className="phoenix-card p-4"><label className="block max-w-sm"><span className="phoenix-field-label">Academic year</span><select className="phoenix-control mt-1" value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map(year => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (Current)' : ''}</option>)}</select></label></section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,helper,Icon]) => <article key={label} className="phoenix-card p-5"><div className="flex justify-between"><div><p className="text-xs font-semibold text-[#6e7891]">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-2 text-xs text-[#8a94ad]">{helper}</p></div><Icon className="text-[var(--primary)]" size={21}/></div></article>)}</div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="phoenix-card p-5"><h2 className="text-sm font-bold">Enrollment by class</h2><div className="mt-4 h-80"><ResponsiveContainer><BarChart data={stats?.enrollmentByClass || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" fontSize={11}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" name="Students" fill="#3874ff" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>
            <section className="phoenix-card p-5"><h2 className="text-sm font-bold">Exam lifecycle</h2><div className="mt-4 h-80"><ResponsiveContainer><PieChart><Pie data={stats?.exams?.byStatus || []} dataKey="count" nameKey="name" innerRadius={60} outerRadius={95}>{(stats?.exams?.byStatus || []).map((item,index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div></section>
            <section className="phoenix-card p-5 xl:col-span-2"><h2 className="text-sm font-bold">Student status distribution</h2><div className="mt-4 h-72"><ResponsiveContainer><BarChart data={stats?.studentStatuses || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" name="Students" fill="#00a76f" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>
        </div>
    </div>;
};
export default Reports;
