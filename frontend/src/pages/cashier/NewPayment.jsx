import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileText, Loader2, Printer, Search, UserRound } from 'lucide-react';
import { createPayment, getInvoiceById, searchInvoices } from '../../services/api/cashier.api';
import { Badge, Button, Input, Select, Spinner, Toast } from '../../components/ui';

const METHODS = [
    { label: 'Cash', value: 'CASH' }, { label: 'Card / POS', value: 'CARD' },
    { label: 'Bank Transfer', value: 'BANK_TRANSFER' }, { label: 'Mobile Money', value: 'MOBILE_MONEY' },
    { label: 'Check', value: 'CHECK' }, { label: 'Other', value: 'OTHER' }
];
const money = value => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NewPayment = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const searchInputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [invoice, setInvoice] = useState(null);
    const [searching, setSearching] = useState(false);
    const [loadingInvoice, setLoadingInvoice] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searched, setSearched] = useState(false);
    const [completed, setCompleted] = useState(null);
    const [form, setForm] = useState({ amount: '', method: 'CASH', reference: '' });
    const [toast, setToast] = useState(null);

    const selectInvoice = (selected) => {
        setInvoice(selected);
        setCompleted(null);
        setForm({ amount: String(selected.balance || ''), method: 'CASH', reference: '' });
    };

    useEffect(() => {
        const invoiceId = searchParams.get('invoiceId');
        if (!invoiceId) return;
        setLoadingInvoice(true);
        getInvoiceById(invoiceId).then(res => selectInvoice(res.data)).catch(() => setToast({ type: 'error', message: 'Could not load the selected invoice.' })).finally(() => setLoadingInvoice(false));
    }, [searchParams]);

    const handleSearch = async (event) => {
        event?.preventDefault();
        if (!query.trim()) return setToast({ type: 'error', message: 'Enter a student name, admission number, or invoice ID.' });
        setSearching(true); setSearched(true); setCompleted(null);
        try {
            const res = await searchInvoices({ q: query.trim() });
            setResults(res.data || []);
        } catch (error) {
            setResults([]);
            setToast({ type: 'error', message: error.response?.data?.message || 'Invoice search failed.' });
        } finally { setSearching(false); }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const amount = Number(form.amount);
        if (!invoice || amount <= 0) return setToast({ type: 'error', message: 'Enter an amount greater than zero.' });
        if (amount > Number(invoice.balance)) return setToast({ type: 'error', message: 'Payment cannot exceed the remaining balance.' });
        setSubmitting(true); setToast(null);
        try {
            const res = await createPayment({ invoiceId: invoice._id, amount, method: form.method, reference: form.reference.trim() });
            setCompleted({ ...res.data, student: invoice.studentId });
            setInvoice(res.data.invoice);
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.errors?.[0]?.message || error.response?.data?.message || 'Payment failed.' });
        } finally { setSubmitting(false); }
    };

    const startAnother = () => {
        setCompleted(null); setInvoice(null); setResults([]); setQuery(''); setSearched(false);
        setForm({ amount: '', method: 'CASH', reference: '' });
        requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    if (loadingInvoice) return <div className="flex h-72 items-center justify-center"><Spinner/></div>;

    return <div className="space-y-5">
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Receive payment</h1><p className="phoenix-page-subtitle">Find an account, confirm the amount, and issue a receipt without leaving this workspace.</p></div></div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)}/>}

        {!completed && <article className="phoenix-card p-5">
            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1"><Input ref={searchInputRef} label="Student or invoice" icon={<Search size={16}/>} value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, admission number, or invoice ID"/></div>
                <Button type="submit" disabled={searching || !query.trim()}>{searching ? <><Loader2 size={16} className="animate-spin"/> Searching</> : 'Find account'}</Button>
            </form>
            {searched && <div className="mt-4 border-t border-slate-100 pt-4">
                {results.length === 0 && !searching ? <p className="py-3 text-sm text-slate-500">No invoices matched this search.</p> : <div className="grid gap-2">
                    {results.map(item => {
                        const unavailable = item.status === 'PAID' || item.status === 'VOID' || Number(item.balance) <= 0;
                        return <button key={item._id} type="button" disabled={unavailable} onClick={() => selectInvoice(item)} className={`flex w-full flex-col gap-3 rounded-lg border p-4 text-left sm:flex-row sm:items-center sm:justify-between ${invoice?._id === item._id ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-slate-200 bg-white'} disabled:cursor-not-allowed disabled:opacity-55`}>
                            <div><p className="font-bold text-slate-900">{item.studentId?.firstName} {item.studentId?.lastName}</p><p className="mt-1 text-xs text-slate-500">{item.studentId?.admissionNumber} · Invoice #{item._id.slice(-6).toUpperCase()} · {item.academicYearId?.name}</p></div>
                            <div className="flex items-center gap-3"><Badge variant={item.status === 'PAID' ? 'success' : item.status === 'PARTIALLY_PAID' ? 'warning' : item.status === 'VOID' ? 'default' : 'danger'}>{item.status?.replaceAll('_', ' ')}</Badge><span className="min-w-24 text-right font-bold text-slate-900">{money(item.balance)}</span></div>
                        </button>;
                    })}
                </div>}
            </div>}
        </article>}

        {!completed && invoice && <section className="grid gap-5 lg:grid-cols-5">
            <article className="phoenix-card p-5 lg:col-span-3">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-xs font-semibold text-slate-500">Selected account</p><h2 className="mt-1 text-xl font-bold text-slate-900">{invoice.studentId?.firstName} {invoice.studentId?.lastName}</h2><p className="text-sm text-slate-500">{invoice.studentId?.admissionNumber} · {invoice.academicYearId?.name}</p></div><Badge variant={invoice.status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>{invoice.status?.replaceAll('_', ' ')}</Badge></div>
                <div className="mt-5 grid grid-cols-3 gap-3"><div><p className="text-xs text-slate-500">Billed</p><p className="mt-1 font-bold">{money(invoice.totalAmount)}</p></div><div><p className="text-xs text-slate-500">Paid</p><p className="mt-1 font-bold text-emerald-700">{money(invoice.paidAmount)}</p></div><div><p className="text-xs text-slate-500">Balance</p><p className="mt-1 text-xl font-bold text-rose-700">{money(invoice.balance)}</p></div></div>
                <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">{(invoice.items || []).map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between text-sm"><span className="text-slate-600">{item.name}</span><span className="font-semibold">{money(item.amount)}</span></div>)}</div>
            </article>
            <article className="phoenix-card p-5 lg:col-span-2"><h2 className="text-base font-bold text-slate-900">Payment details</h2><form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <Input label="Amount" type="number" min="0.01" step="0.01" max={invoice.balance} value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} required/>
                <button type="button" onClick={() => setForm({ ...form, amount: String(invoice.balance) })} className="text-xs font-bold text-[var(--primary)] hover:underline">Use full balance: {money(invoice.balance)}</button>
                <Select label="Payment method" options={METHODS} value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}/>
                <Input label="Reference number" value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} placeholder={form.method === 'CASH' ? 'Optional for cash' : 'Transaction or reference number'}/>
                <Button type="submit" className="w-full" disabled={submitting}>{submitting ? <><Loader2 size={16} className="animate-spin"/> Recording payment</> : `Confirm ${money(form.amount)} ${METHODS.find(item => item.value === form.method)?.label || ''}`}</Button>
            </form></article>
        </section>}

        {completed && <article className="phoenix-card mx-auto max-w-2xl p-6 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={48}/><h2 className="mt-3 text-2xl font-bold text-slate-900">Payment recorded</h2><p className="mt-1 text-sm text-slate-500">The transaction is complete and the receipt is ready.</p>
            <div className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-5 text-left sm:grid-cols-2"><div className="flex gap-3"><UserRound size={18} className="text-slate-400"/><div><p className="text-xs text-slate-500">Student</p><p className="font-bold">{completed.student?.firstName} {completed.student?.lastName}</p></div></div><div className="flex gap-3"><FileText size={18} className="text-slate-400"/><div><p className="text-xs text-slate-500">Receipt</p><p className="font-mono font-bold">{completed.payment?.receiptNumber || completed.payment?._id?.slice(-8).toUpperCase()}</p></div></div><div><p className="text-xs text-slate-500">Amount paid</p><p className="text-xl font-bold text-emerald-700">{money(completed.payment?.amount)}</p></div><div><p className="text-xs text-slate-500">Remaining balance</p><p className="text-xl font-bold">{money(completed.invoice?.balance)}</p></div></div>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button variant="outline" onClick={startAnother}>Take another payment</Button><Button onClick={() => navigate(`/cashier/receipts/${completed.payment._id}`)}><Printer size={16}/> View / print receipt</Button></div>
        </article>}
    </div>;
};

export default NewPayment;
