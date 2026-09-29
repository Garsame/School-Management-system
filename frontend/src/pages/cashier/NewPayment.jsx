import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Award, CheckCircle2, Loader2, Printer, Search } from 'lucide-react';
import { createStudentPayment, getInvoiceById, getStudentAccount, searchStudentAccounts } from '../../services/api/cashier.api';
import { Badge, Button, Input, Select, Spinner, Toast } from '../../components/ui';
import { describeDiscount, invoiceDiscount } from '../../utils/discounts';
import DiscountBadge from '../../components/finance/DiscountBadge';

// Must match the methods the server accepts (paymentService ALLOWED_METHODS).
const METHODS = [
    { label: 'Cash', value: 'CASH' },
    { label: 'EVC Plus', value: 'EVC_PLUS' },
    { label: 'Zaad', value: 'ZAAD' },
    { label: 'Bank transfer', value: 'BANK_TRANSFER' },
    { label: 'Card / POS', value: 'CARD' },
    { label: 'Other', value: 'OTHER' }
];
const STATUS = {
    PAID: { label: 'Paid', variant: 'success' },
    PARTIALLY_PAID: { label: 'Part paid', variant: 'warning' },
    UNPAID: { label: 'Not paid', variant: 'danger' }
};
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (value) => Math.round(Number(value || 0) * 100);
const dueText = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const emptyForm = { amount: '', method: 'CASH' };

// The same split the server makes: the oldest month among those being paid is filled first.
const splitOldestFirst = (months, amount) => {
    let remaining = cents(amount);
    return months.map((line) => {
        const part = Math.max(0, Math.min(cents(line.balance), remaining));
        remaining -= part;
        return { ...line, pays: part / 100, after: (cents(line.balance) - part) / 100 };
    }).filter((line) => line.pays > 0);
};

/**
 * Take money from a student. It shows every month billed for them, oldest first, with what
 * each one charged (and any discount taken off), paid and still owes. The finance officer
 * ticks the months this payment is for. With no month ticked, the amount fills the oldest
 * unpaid month first, then the next. The split is shown before anything is recorded, and one
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
    const [chosen, setChosen] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(null);
    const [toast, setToast] = useState(null);

    // Arriving from an invoice (?invoiceId) opens its student with that month already ticked.
    const openAccount = async (studentId, preselectInvoiceId = null) => {
        setLoadingAccount(true);
        setCompleted(null);
        try {
            const res = await getStudentAccount(studentId);
            const line = preselectInvoiceId
                ? (res.data.unpaid || []).find((item) => String(item.invoiceId) === String(preselectInvoiceId))
                : null;
            setAccount(res.data);
            setChosen(line ? [String(line.invoiceId)] : []);
            setForm({ ...emptyForm, amount: line ? String(line.balance) : '' });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not open this student.' });
        } finally {
            setLoadingAccount(false);
        }
    };

    useEffect(() => {
        const studentId = searchParams.get('studentId');
        const invoiceId = searchParams.get('invoiceId');
        if (studentId) {
            openAccount(studentId);
        } else if (invoiceId) {
            getInvoiceById(invoiceId)
                .then((res) => openAccount(res.data?.studentId?._id || res.data?.studentId, invoiceId))
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

    const months = useMemo(() => account?.months || [], [account]);
    const unpaid = useMemo(() => account?.unpaid || [], [account]);
    const owed = account?.totals?.owed || 0;
    const discount = describeDiscount(account?.student?.discount);

    // The months this payment is for: the ticked ones, or every unpaid month when none is ticked.
    const payable = useMemo(
        () => (chosen.length ? unpaid.filter((line) => chosen.includes(String(line.invoiceId))) : unpaid),
        [unpaid, chosen]
    );
    const payableOwed = payable.reduce((total, line) => total + cents(line.balance), 0) / 100;
    const split = useMemo(() => splitOldestFirst(payable, form.amount), [payable, form.amount]);
    const tooMuch = cents(form.amount) > cents(payableOwed);

    // Ticking months fills the amount with what they owe; it can then be lowered for a part payment.
    const chooseMonths = (ids) => {
        setChosen(ids);
        const total = unpaid.filter((line) => ids.includes(String(line.invoiceId))).reduce((sum, line) => sum + cents(line.balance), 0);
        setForm((current) => ({ ...current, amount: ids.length ? String(total / 100) : '' }));
    };
    const toggleMonth = (line) => {
        const id = String(line.invoiceId);
        chooseMonths(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]);
    };
    const allUnpaidIds = unpaid.map((line) => String(line.invoiceId));
    const allTicked = allUnpaidIds.length > 0 && allUnpaidIds.every((id) => chosen.includes(id));

    const handleSubmit = async (event) => {
        event.preventDefault();
        const amount = Number(form.amount);
        if (!(amount > 0)) return setToast({ type: 'error', message: 'Enter an amount greater than zero.' });
        if (tooMuch) {
            return setToast({ type: 'error', message: `${chosen.length ? 'The ticked months owe' : 'This student owes'} ${money(payableOwed)}. The amount cannot be more.` });
        }
        setSubmitting(true);
        setToast(null);
        try {
            const res = await createStudentPayment({
                studentId: account.student._id,
                amount,
                method: form.method,
                ...(chosen.length ? { invoiceIds: chosen } : {})
            });
            setCompleted({ ...res.data, student: account.student, method: form.method });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Payment failed.' });
            // Someone else may have paid a ticked month while this screen was open.
            if (error.response?.status === 409) openAccount(account.student._id);
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
        setChosen([]);
        setForm(emptyForm);
        requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    if (loadingAccount) return <div className="flex h-72 items-center justify-center"><Spinner /></div>;

    return (
        <div className="space-y-5">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Receive payment</h1>
                    <p className="phoenix-page-subtitle">Find the student, tick the months you are paying and enter the amount. With no month ticked, it pays the oldest unpaid month first.</p>
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
                                                <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">{item.name} <DiscountBadge discount={item.discount} /></p>
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
                                <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">{account.student.name} <DiscountBadge discount={account.student.discount} className="!py-1 text-xs" /></h2>
                                <p className="text-sm text-slate-500">{account.student.admissionNumber}{account.student.className ? ` · ${account.student.className}` : ''}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-500">Total owed</p>
                                <p className={`text-2xl font-bold tabular-nums ${owed > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{money(owed)}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {months.length} month{months.length === 1 ? '' : 's'} billed · {unpaid.length} unpaid
                                </p>
                            </div>
                        </div>

                        {discount && (
                            <div className="mt-4 flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-900">
                                <Award size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                                <div className="text-sm">
                                    <p className="font-semibold">{discount.scholarship ? 'This student has a full scholarship' : 'This student has a discount'}</p>
                                    <p className="text-xs">{discount.long}. It applies to months billed after it was granted; months already billed keep their amount.</p>
                                </div>
                            </div>
                        )}
                        {account.totals.late > 0 && (
                            <p className="mt-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                <AlertTriangle size={16} /> Late: {account.totals.lateMonths.join(', ')} ({money(account.totals.late)})
                            </p>
                        )}

                        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Billed months, oldest first</h3>
                            {unpaid.length > 0 && <p className="text-xs text-slate-500">Tick the months you are paying</p>}
                        </div>
                        {months.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">No bill has been generated for this student yet.</p>
                        ) : (
                            <div className="mt-2 overflow-x-auto">
                                <table className="w-full border-collapse text-sm">
                                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <tr>
                                            <th className="w-8 py-2 pr-2">
                                                {unpaid.length > 1 && (
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                                                        checked={allTicked}
                                                        onChange={() => chooseMonths(allTicked ? [] : allUnpaidIds)}
                                                        aria-label="Tick every unpaid month"
                                                    />
                                                )}
                                            </th>
                                            <th className="py-2 pr-3">Month</th>
                                            <th className="py-2 pr-3 text-right">Billed</th>
                                            <th className="py-2 pr-3 text-right">Paid</th>
                                            <th className="py-2 pr-3 text-right">Owed</th>
                                            <th className="py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {months.map((line) => {
                                            const id = String(line.invoiceId);
                                            const open = line.balance > 0 && line.status !== 'VOID';
                                            const ticked = chosen.includes(id);
                                            const taken = invoiceDiscount(line.items);
                                            const status = STATUS[line.status] || { label: line.status, variant: 'default' };
                                            return (
                                                <tr
                                                    key={id}
                                                    onClick={open ? () => toggleMonth(line) : undefined}
                                                    className={`${open ? 'cursor-pointer hover:bg-slate-50' : ''} ${ticked ? 'bg-[var(--primary-soft)]' : ''}`}
                                                >
                                                    <td className="py-2.5 pr-2">
                                                        {open ? (
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                                                                checked={ticked}
                                                                onChange={() => toggleMonth(line)}
                                                                onClick={(event) => event.stopPropagation()}
                                                                aria-label={`Pay ${line.label}`}
                                                            />
                                                        ) : (
                                                            <CheckCircle2 size={16} className="text-emerald-500" aria-hidden="true" />
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 pr-3">
                                                        <span className="font-semibold text-slate-800">{line.label}</span>
                                                        {line.dueDate && <span className="block text-xs text-slate-400">due {dueText(line.dueDate)}</span>}
                                                    </td>
                                                    <td className="py-2.5 pr-3 text-right tabular-nums">
                                                        {money(line.billed)}
                                                        {taken && (
                                                            <span className="block text-[11px] font-semibold text-emerald-700">
                                                                {taken.scholarship ? 'Full scholarship' : `${money(line.fee)} less ${money(taken.amount)} discount`}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700">{money(line.paid)}</td>
                                                    <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${line.balance > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{money(line.balance)}</td>
                                                    <td className="py-2.5">
                                                        <span className="inline-flex flex-wrap gap-1">
                                                            <Badge variant={status.variant} className="!py-0.5 text-[10px]">{status.label}</Badge>
                                                            {line.late && <Badge variant="danger" className="!py-0.5 text-[10px]">Late</Badge>}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button type="button" className="mt-4 text-xs font-semibold text-[var(--primary)] hover:underline" onClick={() => setAccount(null)}>Choose another student</button>
                    </article>

                    <article className="phoenix-card p-5 lg:col-span-2">
                        <h2 className="text-base font-bold text-slate-900">Payment</h2>
                        {owed <= 0 ? (
                            <p className="mt-4 text-sm text-slate-500">
                                {discount?.scholarship && months.length > 0
                                    ? 'This student has a full scholarship, so there is nothing to pay.'
                                    : 'This student has nothing to pay.'}
                            </p>
                        ) : (
                            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    {chosen.length ? (
                                        <>
                                            <p className="font-semibold text-slate-700">Paying for {payable.map((line) => line.label).join(', ')}</p>
                                            <button type="button" className="mt-1 font-semibold text-[var(--primary)] hover:underline" onClick={() => chooseMonths([])}>Clear the ticked months</button>
                                        </>
                                    ) : (
                                        <p>No month ticked. The money fills the oldest unpaid month first.</p>
                                    )}
                                </div>
                                <Input label="Amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Enter amount..." required />
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <button type="button" onClick={() => chooseMonths([String(unpaid[0].invoiceId)])} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-[var(--primary)]">
                                        {unpaid[0].label}: {money(unpaid[0].balance)}
                                    </button>
                                    {unpaid.length > 1 && (
                                        <button type="button" onClick={() => chooseMonths(allUnpaidIds)} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-[var(--primary)]">
                                            Everything: {money(owed)}
                                        </button>
                                    )}
                                </div>
                                {tooMuch && <p className="text-xs font-semibold text-rose-700">That is more than the {money(payableOwed)} {chosen.length ? 'owed on the ticked months' : 'owed'}.</p>}
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
