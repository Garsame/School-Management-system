import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, Search } from 'lucide-react';
import { exportMonthlyCollectionXlsx, getBillingMonths, getFinanceClasses, getMonthlyCollection } from '../../services/api/finance.api';
import { getAcademicYears, getBranches } from '../../services/api/tenant.api';
import { Badge, Button } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';
import { downloadBlob } from '../../utils/download';
import { money } from '../../utils/feeStructures';

const asList = (value) => (Array.isArray(value) ? value : []);
const thisMonthKey = () => new Date().toISOString().slice(0, 7);

const TABS = [
    { key: '', label: 'All', count: (counts, total) => total },
    { key: 'PAID', label: 'Paid', count: (counts) => counts.paid },
    { key: 'PARTIAL', label: 'Part paid', count: (counts) => counts.partial },
    { key: 'UNPAID', label: 'Not paid', count: (counts) => counts.unpaid },
    { key: 'LATE', label: 'Late', count: (counts) => counts.late }
];

const STATUS = {
    PAID: { label: 'Paid', variant: 'success' },
    PARTIALLY_PAID: { label: 'Part paid', variant: 'warning' },
    UNPAID: { label: 'Not paid', variant: 'danger' }
};

const Stat = ({ label, value, sub, tone = 'text-slate-900' }) => (
    <div className="rounded-lg border border-[#e3e6ed] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
);

/**
 * One month of school fees: who paid, who paid part, who has not paid, and what each
 * student still owes from earlier months. Downloads as Excel with the same filters.
 */
const MonthlyCollection = () => {
    const [years, setYears] = useState([]);
    const [branches, setBranches] = useState([]);
    const [classes, setClasses] = useState([]);
    const [yearId, setYearId] = useState('');
    const [months, setMonths] = useState([]);
    const [month, setMonth] = useState('');
    const [branchId, setBranchId] = useState('');
    const [classId, setClassId] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        Promise.all([getAcademicYears(), getBranches()])
            .then(([yearList, branchList]) => {
                const list = asList(yearList);
                setYears(list);
                setBranches(asList(branchList));
                setYearId((list.find((year) => year.isCurrent) || list[0])?._id || '');
                if (!list.length) setLoading(false);
            })
            .catch(() => {
                notify('Could not load academic years', 'error');
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        getFinanceClasses(branchId ? { branchId } : {})
            .then((list) => setClasses(asList(list)))
            .catch(() => setClasses([]));
    }, [branchId]);

    useEffect(() => {
        if (!yearId) return;
        getBillingMonths(yearId)
            .then((data) => {
                const list = asList(data?.months);
                setMonths(list);
                setMonth((list.find((item) => item.key === thisMonthKey()) || list[0])?.key || '');
            })
            .catch((error) => notify(error.response?.data?.message || 'Could not load the months of this year', 'error'));
    }, [yearId]);

    // Typing waits a moment before searching, so each letter is not its own request.
    useEffect(() => {
        const timer = setTimeout(() => setQuery(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const params = useMemo(() => (yearId && month ? {
        academicYearId: yearId,
        month,
        ...(branchId ? { branchId } : {}),
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
        ...(query ? { q: query } : {})
    } : null), [yearId, month, branchId, classId, status, query]);

    useEffect(() => {
        if (!params) return undefined;
        let cancelled = false;
        setLoading(true);
        getMonthlyCollection(params)
            .then((data) => { if (!cancelled) setReport(data); })
            .catch((error) => { if (!cancelled) notify(error.response?.data?.message || 'Could not load this month', 'error'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [params]);

    const download = async () => {
        setDownloading(true);
        try {
            const response = await exportMonthlyCollectionXlsx(params);
            downloadBlob(response.data, `fees-${month}${status ? `-${status.toLowerCase()}` : ''}.xlsx`);
        } catch {
            notify('Could not download the Excel file', 'error');
        } finally {
            setDownloading(false);
        }
    };

    const totals = report?.totals;
    const rows = report?.rows || [];
    const monthLabel = months.find((item) => item.key === month)?.label || '';

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Monthly collection</h1>
                    <p className="phoenix-page-subtitle">Who paid, who paid part, and who still owes, for one month.</p>
                </div>
                <Button variant="outline" onClick={download} disabled={!params || downloading} className="flex items-center gap-2 !h-9 text-xs">
                    <Download size={16} /> {downloading ? 'Preparing...' : 'Download Excel'}
                </Button>
            </div>

            <article className="phoenix-card">
                <div className="phoenix-card-body grid grid-cols-2 gap-3 md:grid-cols-5">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Year</span>
                        <select className="phoenix-control !h-9" value={yearId} onChange={(event) => setYearId(event.target.value)}>
                            {years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Month</span>
                        <select className="phoenix-control !h-9" value={month} onChange={(event) => setMonth(event.target.value)}>
                            {months.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                    </label>
                    {branches.length > 1 && (
                        <label className="space-y-1">
                            <span className="text-xs font-semibold text-slate-600">Campus</span>
                            <select className="phoenix-control !h-9" value={branchId} onChange={(event) => { setBranchId(event.target.value); setClassId(''); }}>
                                <option value="">All campuses</option>
                                {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Class</span>
                        <select className="phoenix-control !h-9" value={classId} onChange={(event) => setClassId(event.target.value)}>
                            <option value="">All classes</option>
                            {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                        </select>
                    </label>
                    <label className="col-span-2 space-y-1 md:col-span-1">
                        <span className="text-xs font-semibold text-slate-600">Student</span>
                        <span className="relative block">
                            <Search className="phoenix-input-icon" size={14} />
                            <input className="phoenix-control phoenix-control-with-icon !h-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or number" />
                        </span>
                    </label>
                </div>
            </article>

            {totals && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <Stat label={`Billed · ${monthLabel}`} value={money(totals.billed)} sub={`${totals.students} students`} />
                    <Stat label="Collected" value={money(totals.collected)} sub={`${totals.collectionRate}% of billed`} tone="text-emerald-700" />
                    <Stat label="Still owed this month" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? 'text-rose-700' : 'text-slate-900'} />
                    <Stat label="Owed from earlier months" value={money(totals.earlierDebt)} tone={totals.earlierDebt > 0 ? 'text-rose-700' : 'text-slate-900'} />
                    <Stat label="Total owed" value={money(totals.totalOwed)} tone={totals.totalOwed > 0 ? 'text-rose-700' : 'text-slate-900'} />
                </div>
            )}

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by payment">
                {TABS.map((tab) => (
                    <button
                        key={tab.key || 'all'}
                        type="button"
                        role="tab"
                        aria-selected={status === tab.key}
                        onClick={() => setStatus(tab.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${status === tab.key ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        {tab.label}{totals ? ` (${tab.count(totals.counts, totals.students)})` : ''}
                    </button>
                ))}
            </div>

            <article className="phoenix-card">
                {loading ? (
                    <div className="flex h-48 items-center justify-center"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
                ) : rows.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-slate-500">
                        {totals?.students ? 'No student matches these filters.' : `Nobody has been billed for ${monthLabel || 'this month'} yet. Generate the month's invoices first.`}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-2.5">Student</th>
                                    <th className="px-4 py-2.5">Class</th>
                                    <th className="px-4 py-2.5 text-right">Billed</th>
                                    <th className="px-4 py-2.5 text-right">Paid</th>
                                    <th className="px-4 py-2.5 text-right">Still owed</th>
                                    <th className="px-4 py-2.5">Status</th>
                                    <th className="px-4 py-2.5 text-right">Earlier months</th>
                                    <th className="px-4 py-2.5 text-right">Total owed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e3e6ed]">
                                {rows.map((row) => {
                                    const badge = STATUS[row.status] || { label: row.status, variant: 'default' };
                                    return (
                                        <tr key={row.invoiceId} className="hover:bg-slate-50">
                                            <td className="px-4 py-2.5">
                                                <Link to={`/finance/students/${row.studentId}`} className="font-semibold text-slate-800 hover:text-[var(--primary)] hover:underline">{row.studentName}</Link>
                                                <span className="block text-xs text-slate-500">{row.admissionNumber}{row.studentStatus && row.studentStatus !== 'Active' ? ` · ${row.studentStatus}` : ''}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-600">{row.className || '—'}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{money(row.billed)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{money(row.paid)}</td>
                                            <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${row.balance > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{money(row.balance)}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="inline-flex flex-wrap gap-1">
                                                    <Badge variant={badge.variant} className="!py-0.5 text-[10px]">{badge.label}</Badge>
                                                    {row.late && <Badge variant="danger" className="!py-0.5 text-[10px]">Late</Badge>}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-2.5 text-right tabular-nums ${row.earlierDebt > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{money(row.earlierDebt)}</td>
                                            <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${row.totalOwed > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{money(row.totalOwed)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </article>
        </div>
    );
};

export default MonthlyCollection;
