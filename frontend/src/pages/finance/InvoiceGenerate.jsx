import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle, Loader2, School, Search, User, X } from 'lucide-react';
import { generateInvoices, getBillingMonths, searchBillingStudents } from '../../services/api/finance.api';
import { getAcademicYears, getBranches } from '../../services/api/tenant.api';
import { Button } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';
import { money } from '../../utils/feeStructures';

const asList = (value) => (Array.isArray(value) ? value : []);
const thisMonthKey = () => new Date().toISOString().slice(0, 7);

const Stat = ({ label, value, tone = 'default' }) => {
    const tones = { default: 'text-slate-900', good: 'text-emerald-700', muted: 'text-slate-500', warn: 'text-amber-700' };
    return (
        <div className="rounded-lg border border-[#e3e6ed] bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
        </div>
    );
};

/**
 * Bill one month in one click. Pick the month and the page shows exactly what will happen:
 * which classes are billed from which fee, how many students, how many are already billed or
 * skipped and why. The button then does that and nothing else.
 */
const InvoiceGenerate = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState('school');
    const [years, setYears] = useState([]);
    const [branches, setBranches] = useState([]);
    const [yearId, setYearId] = useState('');
    const [months, setMonths] = useState([]);
    const [month, setMonth] = useState('');
    const [branchId, setBranchId] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [student, setStudent] = useState(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [studentResults, setStudentResults] = useState([]);
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null);
    const [initializing, setInitializing] = useState(true);
    const [previewRound, setPreviewRound] = useState(0);

    useEffect(() => {
        Promise.all([getAcademicYears(), getBranches()])
            .then(([yearList, branchList]) => {
                const list = asList(yearList);
                setYears(list);
                setBranches(asList(branchList));
                setYearId((list.find((year) => year.isCurrent) || list[0])?._id || '');
            })
            .catch(() => notify('Could not load academic years', 'error'))
            .finally(() => setInitializing(false));
    }, []);

    useEffect(() => {
        if (!yearId) return;
        setMonths([]);
        setMonth('');
        getBillingMonths(yearId)
            .then((data) => {
                const list = asList(data?.months);
                setMonths(list);
                setMonth((list.find((item) => item.key === thisMonthKey()) || list[0])?.key || '');
            })
            .catch((error) => notify(error.response?.data?.message || 'Could not load the months of this year', 'error'));
    }, [yearId]);

    // The preview is the same request with dryRun, so it can never disagree with the real run.
    const request = useMemo(() => {
        if (!yearId || !month) return null;
        if (mode === 'student' && !student) return null;
        return {
            academicYearId: yearId,
            month,
            ...(mode === 'school' && branchId ? { branchId } : {}),
            ...(mode === 'student' ? { studentId: student._id } : {}),
            ...(dueDate ? { dueDate } : {})
        };
    }, [yearId, month, mode, student, branchId, dueDate]);

    useEffect(() => {
        setPreview(null);
        setResult(null);
        if (!request) return undefined;
        let cancelled = false;
        setPreviewing(true);
        generateInvoices({ ...request, dryRun: true })
            .then((data) => { if (!cancelled) setPreview(data); })
            .catch((error) => { if (!cancelled) notify(error.response?.data?.message || 'Could not prepare the preview', 'error'); })
            .finally(() => { if (!cancelled) setPreviewing(false); });
        return () => { cancelled = true; };
    }, [request, previewRound]);

    useEffect(() => {
        if (mode !== 'student' || student || studentQuery.trim().length < 2) {
            setStudentResults([]);
            return undefined;
        }
        const timer = setTimeout(() => {
            searchBillingStudents({ q: studentQuery.trim(), academicYearId: yearId })
                .then((data) => setStudentResults(asList(data)))
                .catch(() => setStudentResults([]));
        }, 250);
        return () => clearTimeout(timer);
    }, [mode, student, studentQuery, yearId]);

    const monthLabel = months.find((item) => item.key === month)?.label || '';

    const generate = async () => {
        setGenerating(true);
        try {
            const data = await generateInvoices(request);
            setResult(data);
            setPreview(null);
            notify(`${data.created} invoice${data.created === 1 ? '' : 's'} created for ${data.month.label}`, 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Could not generate invoices', 'error');
        } finally {
            setGenerating(false);
        }
    };

    const switchMode = (next) => {
        setMode(next);
        setStudent(null);
        setStudentQuery('');
    };

    if (initializing) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <Button variant="ghost" onClick={() => navigate('/finance/invoices')} className="mb-2 flex items-center gap-2 !h-8 text-xs">
                <ArrowLeft size={16} /> Invoices
            </Button>

            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Generate monthly invoices</h1>
                    <p className="phoenix-page-subtitle">Pick the month. Every active student is billed from their class&apos;s open fee structure, once.</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3" role="tablist" aria-label="Who to bill">
                {[{ key: 'school', label: 'Whole school', icon: School }, { key: 'student', label: 'One student', icon: User }].map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={mode === tab.key}
                        onClick={() => switchMode(tab.key)}
                        className={`flex items-center justify-center gap-2.5 rounded-lg border p-3.5 text-sm font-bold transition-all ${mode === tab.key ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                    >
                        <tab.icon size={18} /> {tab.label}
                    </button>
                ))}
            </div>

            <article className="phoenix-card">
                <div className="phoenix-card-body grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="space-y-1.5">
                        <span className="text-[13px] font-semibold text-slate-700">Academic year</span>
                        <select className="phoenix-control" value={yearId} onChange={(event) => setYearId(event.target.value)}>
                            {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (current)' : ''}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1.5">
                        <span className="text-[13px] font-semibold text-slate-700">Month to bill</span>
                        <select className="phoenix-control" value={month} onChange={(event) => setMonth(event.target.value)} disabled={!months.length}>
                            {months.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                    </label>
                    {mode === 'school' && branches.length > 1 && (
                        <label className="space-y-1.5">
                            <span className="text-[13px] font-semibold text-slate-700">Campus</span>
                            <select className="phoenix-control" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                                <option value="">All campuses</option>
                                {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="space-y-1.5">
                        <span className="text-[13px] font-semibold text-slate-700">Due date <span className="font-normal text-slate-400">(optional, normally the policy day)</span></span>
                        <input type="date" className="phoenix-control" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                    </label>

                    {mode === 'student' && (
                        <div className="space-y-1.5 md:col-span-2">
                            <span className="text-[13px] font-semibold text-slate-700">Student</span>
                            {student ? (
                                <div className="flex items-center justify-between rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2.5">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{student.name}</p>
                                        <p className="text-xs text-slate-600">{student.admissionNumber}{student.className ? ` · ${student.className}` : ' · not enrolled this year'}{student.status !== 'Active' ? ` · ${student.status}` : ''}</p>
                                    </div>
                                    <button type="button" className="phoenix-icon-button" onClick={() => { setStudent(null); setStudentQuery(''); }} aria-label="Choose another student"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="phoenix-input-icon" size={16} />
                                    <input className="phoenix-control phoenix-control-with-icon" value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Type a name or admission number" />
                                    {studentResults.length > 0 && (
                                        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#e3e6ed] bg-white shadow-lg">
                                            {studentResults.map((item) => (
                                                <li key={item._id}>
                                                    <button type="button" className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => setStudent(item)}>
                                                        <span className="block text-sm font-semibold text-slate-800">{item.name}</span>
                                                        <span className="block text-xs text-slate-500">{item.admissionNumber}{item.className ? ` · ${item.className}` : ''}{item.status !== 'Active' ? ` · ${item.status}` : ''}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </article>

            {result && (
                <article className="phoenix-card border-emerald-200">
                    <div className="phoenix-card-body space-y-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle className="mt-0.5 shrink-0 text-emerald-600" size={22} />
                            <div>
                                <h2 className="text-base font-bold text-slate-900">{result.month.label} is billed</h2>
                                <p className="text-sm text-slate-600">
                                    {result.created} invoice{result.created === 1 ? '' : 's'} created, {money(result.totalAmount)} in total.
                                    {result.outcome && result.outcome.code !== 'BILLED' ? ` ${result.outcome.message}.` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => navigate('/finance/invoices')} className="!h-9 text-xs">View invoices</Button>
                            <Button variant="outline" onClick={() => setPreviewRound((round) => round + 1)} className="!h-9 text-xs">Bill another month</Button>
                        </div>
                    </div>
                </article>
            )}

            {!result && (previewing ? (
                <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
            ) : preview && (
                <article className="phoenix-card">
                    <div className="phoenix-card-header">
                        <div>
                            <h2 className="phoenix-section-title">What happens when you click</h2>
                            <p className="phoenix-section-copy">{mode === 'student' ? preview.outcome?.message : `${monthLabel} for ${branchId ? branches.find((branch) => branch._id === branchId)?.name : 'the whole school'}`}</p>
                        </div>
                    </div>
                    <div className="phoenix-card-body space-y-4">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <Stat label="Will be billed" value={preview.toBill} tone={preview.toBill ? 'good' : 'muted'} />
                            <Stat label="Total" value={money(preview.totalAmount)} />
                            <Stat label="Already billed" value={preview.alreadyBilled} tone="muted" />
                            <Stat label="Skipped" value={preview.noFee + preview.notActive} tone={preview.noFee ? 'warn' : 'muted'} />
                        </div>

                        <p className={`text-sm ${preview.dueDateHasPassed ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
                            Due on {new Date(preview.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.
                            {preview.dueDateHasPassed
                                ? ' That day has already passed, so parents will see these bills as late straight away. Pick a later due date above if you want to give them time.'
                                : ' Unpaid bills show as late after this day.'}
                        </p>

                        {preview.classes.length > 0 && (
                            <div className="overflow-x-auto rounded-lg border border-[#e3e6ed]">
                                <table className="w-full border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2">Class</th>
                                            <th className="px-3 py-2">Fee used</th>
                                            <th className="px-3 py-2 text-right">Per month</th>
                                            <th className="px-3 py-2 text-right">To bill</th>
                                            <th className="px-3 py-2 text-right">Already billed</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e3e6ed]">
                                        {preview.classes.map((row) => (
                                            <tr key={row.classId}>
                                                <td className="px-3 py-2">
                                                    <span className="font-semibold text-slate-800">{row.className}</span>
                                                    {branches.length > 1 && <span className="block text-xs text-slate-500">{row.branchName}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-slate-600">{row.feeStructureName}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{money(row.monthlyAmount)}</td>
                                                <td className="px-3 py-2 text-right font-semibold tabular-nums">{row.toBill}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.alreadyBilled}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {preview.skippedClasses.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle size={16} /> Not billed: these classes have no open monthly fee</p>
                                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                                    {preview.skippedClasses.map((row) => (
                                        <li key={row.classId}>{row.className}: {row.reason} ({row.students - row.alreadyBilled} student{row.students - row.alreadyBilled === 1 ? '' : 's'})</li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-xs text-amber-800">
                                    Set the fee in <Link className="font-semibold underline" to="/finance/fee-structures">Fee Structures</Link> or open it in <Link className="font-semibold underline" to="/finance/policies">Policies</Link>, then come back.
                                </p>
                            </div>
                        )}

                        {preview.notActive > 0 && (
                            <p className="text-xs text-slate-500">{preview.notActive} student{preview.notActive === 1 ? ' is' : 's are'} not active (left the school or marked inactive) and will not be billed.</p>
                        )}

                        <div className="flex justify-end border-t border-slate-100 pt-4">
                            <Button onClick={generate} disabled={generating || preview.toBill === 0} className="!h-10 text-xs">
                                {generating ? 'Generating...' : preview.toBill === 0 ? 'Nothing to bill' : `Generate ${monthLabel} invoices (${preview.toBill})`}
                            </Button>
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
};

export default InvoiceGenerate;
