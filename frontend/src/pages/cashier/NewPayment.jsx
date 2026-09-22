import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, Printer, Search } from 'lucide-react';
import { createStudentPayment, getInvoiceById, getStudentAccount, searchStudentAccounts } from '../../services/api/cashier.api';
import { Badge, Button, Input, Select, Spinner, Toast } from '../../components/ui';

// Must match the methods the server accepts (paymentService ALLOWED_METHODS).
const METHODS = [
    { label: 'Cash', value: 'CASH' },
    { label: 'EVC Plus', value: 'EVC_PLUS' },
    { label: 'Zaad', value: 'ZAAD' },
    { label: 'Bank transfer', value: 'BANK_TRANSFER' },
    { label: 'Card / POS', value: 'CARD' },
    { label: 'Other', value: 'OTHER' }
];
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (value) => Math.round(Number(value || 0) * 100);
const dueText = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

// The same split the server makes: the oldest unpaid month is filled first.
const splitOldestFirst = (unpaid, amount) => {
    let remaining = cents(amount);
    return unpaid.map((line) => {
        const part = Math.max(0, Math.min(cents(line.balance), remaining));
        remaining -= part;
        return { ...line, pays: part / 100, after: (cents(line.balance) - part) / 100 };
    }).filter((line) => line.pays > 0);
};

/**
 * Take money from a student. One amount can cover several months: it fills the oldest unpaid
 * month first, then the next. The split is shown before anything is recorded, and one
 * receipt lists every month it paid.
 */
const NewPayment = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const searchInputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [account, setAccount] = useState(null);
    const [loadingAccount, setLoadingAccount] = useState(false);
    const [form, setForm] = useState({ amount: '', method: 'CASH', reference: '' });
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(null);
    const [toast, setToast] = useState(null);

    const openAccount = async (studentId) => {
        setLoadingAccount(true);
        setCompleted(null);
        try {
            const res = await getStudentAccount(studentId);
            setAccount(res.data);
            setForm({ amount: '', method: 'CASH', reference: '' });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not open this student.' });
        } finally {
            setLoadingAccount(false);
        }
    };

    // Arriving from a student record (?studentId) or an invoice (?invoiceId) opens that account.
    useEffect(() => {
        const studentId = searchParams.get('studentId');
        const invoiceId = searchParams.get('invoiceId');
        if (studentId) {
            openAccount(studentId);
        } else if (invoiceId) {
            getInvoiceById(invoiceId)
                .then((res) => openAccount(res.data?.studentId?._id || res.data?.studentId))
                .catch(() => setToast({ type: 'error', message: 'Could not load the selected invoice.' }));
        }
    }, [searchParams]);

    const handleSearch = async (event) => {
        event?.preventDefault();
        if (query.trim().length < 2) return setToast({ type: 'error', message: 'Type at least two letters of a name or admission number.' });
        setSearching(true);
        setSearched(true);
        try {
            const res = await searchStudentAccounts(query.trim());
            setResults(res.data || []);
        } catch (error) {
            setResults([]);
            setToast({ type: 'error', message: error.response?.data?.message || 'Search failed.' });
        } finally {
            setSearching(false);
        }
    };

    const unpaid = useMemo(() => account?.unpaid || [], [account]);
    const owed = account?.totals?.owed || 0;
    const split = useMemo(() => splitOldestFirst(unpaid, form.amount), [unpaid, form.amount]);
    const tooMuch = cents(form.amount) > cents(owed);
    const needsReference = form.method !== 'CASH';

    const handleSubmit = async (event) => {
        event.preventDefault();
        const amount = Number(form.amount);
        if (!(amount > 0)) return setToast({ type: 'error', message: 'Enter an amount greater than zero.' });
        if (tooMuch) return setToast({ type: 'error', message: `This student owes ${money(owed)}. The amount cannot be more.` });
        if (needsReference && !form.reference.trim()) return setToast({ type: 'error', message: 'Enter the transaction reference for this payment method.' });
        setSubmitting(true);
        setToast(null);
        try {
            const res = await createStudentPayment({
                studentId: account.student._id,
                amount,
                method: form.method,
                reference: form.reference.trim()
            });
            setCompleted({ ...res.data, student: account.student, method: form.method });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Payment failed.' });
        } finally {
            setSubmitting(false);
        }
    };

    const startAnother = () => {
        setCompleted(null);
        setAccount(null);
        setResults([]);
        setQuery('');
        setSearched(false);
        setForm({ amount: '', method: 'CASH', reference: '' });
        requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    if (loadingAccount) return <div className="flex h-72 items-center justify-center"><Spinner /></div>;

    return (
        <div className="space-y-5">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Receive payment</h1>
                    <p className="phoenix-page-subtitle">Find the student, enter the amount. It pays the oldest unpaid month first.</p>
                </div>
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {!completed && (
                <article className="phoenix-card p-5">
                    <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <Input ref={searchInputRef} label="Student" icon={<Search size={16} />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or admission number" />
                        </div>
                        <Button type="submit" disabled={searching || query.trim().length < 2}>
                            {searching ? <><Loader2 size={16} className="animate-spin" /> Searching</> : 'Find student'}
                        </Button>
                    </form>
                    {searched && !account && (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                            {results.length === 0 && !searching ? (
                                <p className="py-3 text-sm text-slate-500">No student matched this search.</p>
                            ) : (
                                <div className="grid gap-2">
                                    {results.map((item) => (
                                        <button
                                            key={item._id}
                                            type="button"
                                            onClick={() => openAccount(item._id)}
                                            className="flex w-full flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-[var(--primary)] sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div>
                                                <p className="font-bold text-slate-900">{item.name}</p>
                                                <p className="mt-0.5 text-xs text-slate-500">{item.admissionNumber}{item.status !== 'Active' ? ` · ${item.status}` : ''}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-bold ${item.owed > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{item.owed > 0 ? money(item.owed) : 'Nothing owed'}</p>
                                                {item.unpaidMonths > 0 && <p className="text-xs text-slate-500">{item.unpaidMonths} unpaid month{item.unpaidMonths === 1 ? '' : 's'}</p>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </article>
            )}

            {!completed && account && (
                <section className="grid gap-5 lg:grid-cols-5">
                    <article className="phoenix-card p-5 lg:col-span-3">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Student</p>
                                <h2 className="mt-1 text-xl font-bold text-slate-900">{account.student.name}</h2>
                                <p className="text-sm text-slate-500">{account.student.admissionNumber}{account.student.className ? ` · ${account.student.className}` : ''}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-500">Total owed</p>
                                <p className={`text-2xl font-bold ${owed > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{money(owed)}</p>
                            </div>
                        </div>
                        {account.totals.late > 0 && (
                            <p className="mt-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                <AlertTriangle size={16} /> Late: {account.totals.lateMonths.join(', ')} ({money(account.totals.late)})
                            </p>
                        )}
                        <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Unpaid months, oldest first</h3>
                        {unpaid.length === 0 ? (
                            <p className="mt-2 text-sm text-emerald-700">Nothing is owed.</p>
                        ) : (
                            <ul className="mt-2 divide-y divide-slate-100">
                                {unpaid.map((line) => (
                                    <li key={line.invoiceId} className="flex items-center justify-between py-2 text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800">{line.label}</span>
                                            {line.late && <Badge variant="danger" className="!py-0.5 text-[10px]">Late</Badge>}
                                            {line.dueDate && <span className="text-xs text-slate-400">due {dueText(line.dueDate)}</span>}
                                        </span>
                                        <span className="font-semibold tabular-nums text-rose-700">{money(line.balance)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button type="button" className="mt-4 text-xs font-semibold text-[var(--primary)] hover:underline" onClick={() => setAccount(null)}>Choose another student</button>
                    </article>

                    <article className="phoenix-card p-5 lg:col-span-2">
                        <h2 className="text-base font-bold text-slate-900">Payment</h2>
                        {owed <= 0 ? (
                            <p className="mt-4 text-sm text-slate-500">This student has nothing to pay.</p>
                        ) : (
                            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                                <Input label="Amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <button type="button" onClick={() => setForm({ ...form, amount: String(unpaid[0].balance) })} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-[var(--primary)]">
                                        {unpaid[0].label}: {money(unpaid[0].balance)}
                                    </button>
                                    {unpaid.length > 1 && (
                                        <button type="button" onClick={() => setForm({ ...form, amount: String(owed) })} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-[var(--primary)]">
                                            Everything: {money(owed)}
                                        </button>
                                    )}
                                </div>
                                {tooMuch && <p className="text-xs font-semibold text-rose-700">That is more than the {money(owed)} owed.</p>}
                                {!tooMuch && split.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                                        <p className="mb-1.5 font-semibold text-slate-600">This payment covers</p>
                                        {split.map((line) => (
                                            <p key={line.invoiceId} className="flex justify-between gap-3 py-0.5 text-slate-700">
                                                <span>{line.label}</span>
                                                <span className="tabular-nums">{money(line.pays)}{line.after > 0 ? ` (${money(line.after)} left)` : ' (paid)'}</span>
                                            </p>
                                        ))}
                                    </div>
                                )}
                                <Select label="Payment method" options={METHODS} value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} />
                                <Input label={needsReference ? 'Reference number' : 'Reference (optional)'} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder={needsReference ? 'Transaction number' : 'Optional for cash'} required={needsReference} />
                                <Button type="submit" className="w-full" disabled={submitting || tooMuch || !(Number(form.amount) > 0)}>
                                    {submitting ? <><Loader2 size={16} className="animate-spin" /> Recording</> : `Take ${money(form.amount)}`}
                                </Button>
                            </form>
                        )}
                    </article>
                </section>
            )}

            {completed && (
                <article className="phoenix-card mx-auto max-w-2xl p-6 text-center">
                    <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
                    <h2 className="mt-3 text-2xl font-bold text-slate-900">Payment recorded</h2>
                    <p className="mt-1 text-sm text-slate-500">{money(completed.amount)} from {completed.student.name}, {METHODS.find((item) => item.value === completed.method)?.label}.</p>
                    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left text-sm">
                        {completed.allocations.map((line) => (
                            <p key={line.invoiceId} className="flex justify-between py-1">
                                <span className="font-semibold text-slate-700">{line.label}</span>
                                <span className="tabular-nums text-slate-700">{money(line.amount)}{line.balanceAfter > 0 ? ` · ${money(line.balanceAfter)} left` : ' · paid'}</span>
                            </p>
                        ))}
                        <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold">
                            <span>Still owed after this</span>
                            <span className={completed.remainingOwed > 0 ? 'text-rose-700' : 'text-emerald-700'}>{money(completed.remainingOwed)}</span>
                        </p>
                    </div>
                    <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                        <Button variant="outline" onClick={startAnother}>Take another payment</Button>
                        <Button onClick={() => navigate(`/cashier/receipts/${completed.receiptPaymentId}`)}><Printer size={16} /> View / print receipt</Button>
                    </div>
                </article>
            )}
        </div>
    );
};

export default NewPayment;
