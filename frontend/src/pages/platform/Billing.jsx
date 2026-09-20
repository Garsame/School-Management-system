import React, { useEffect, useState } from 'react';
import { CreditCard, FilePlus2, Receipt, RefreshCw, RotateCcw, WalletCards } from 'lucide-react';
import platformService from '../../services/platformService';

const unwrapData = (response, fallback) => response?.data?.data ?? response?.data ?? fallback;
const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
}).format(Number(value || 0));

const Billing = () => {
    const [summary, setSummary] = useState({});
    const [invoices, setInvoices] = useState([]);
    const [tenants, setTenants] = useState([]);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [reconciling, setReconciling] = useState(false);
    const [form, setForm] = useState({
        tenantId: '',
        billingCycle: 'monthly',
        periodStart: new Date().toISOString().slice(0, 10),
        dueDate: '',
        notes: ''
    });

    const load = async () => {
        try {
            const [summaryResponse, invoicesResponse, tenantsResponse] = await Promise.all([
                platformService.getBillingSummary(),
                platformService.getSubscriptionInvoices(),
                platformService.getTenants()
            ]);
            setSummary(unwrapData(summaryResponse, {}));
            setInvoices(unwrapData(invoicesResponse, []));
            setTenants(unwrapData(tenantsResponse, []));
            setError('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not load platform billing.');
        }
    };

    useEffect(() => {
        load();
    }, []);

    const createInvoice = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            await platformService.createSubscriptionInvoice(form);
            setForm(previous => ({ ...previous, tenantId: '', dueDate: '', notes: '' }));
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not create subscription invoice.');
        } finally {
            setSubmitting(false);
        }
    };

    const recordPayment = async (invoice) => {
        const amount = window.prompt(`Payment amount. Current balance: ${invoice.balance}`, invoice.balance);
        if (!amount) return;
        const method = window.prompt('Payment method: CASH, BANK_TRANSFER, MOBILE_MONEY, CARD, or OTHER', 'BANK_TRANSFER');
        if (!method) return;
        const reference = String(method).toUpperCase() === 'CASH' ? '' : window.prompt('Payment reference:');
        if (String(method).toUpperCase() !== 'CASH' && !reference?.trim()) return;
        try {
            await platformService.recordSubscriptionPayment(invoice._id, { amount, method, reference });
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not record subscription payment.');
        }
    };

    const reversePayment = async (payment) => {
        const reason = window.prompt('Enter the required reversal reason:');
        if (!reason?.trim() || !window.confirm('Reverse this subscription payment?')) return;
        try {
            await platformService.reverseSubscriptionPayment(payment._id, reason.trim());
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not reverse subscription payment.');
        }
    };

    const reconcileBilling = async () => {
        setReconciling(true);
        try {
            await platformService.reconcileSubscriptionBilling();
            await load();
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Could not reconcile subscription billing.');
        } finally {
            setReconciling(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-extrabold text-slate-900">Platform Billing</h2>
                    <p className="text-sm text-slate-500 mt-1">Issue school subscription invoices, record payments, and enforce overdue access rules.</p>
                    {error && <p className="text-sm font-semibold text-rose-600 mt-2">{error}</p>}
                </div>
                <button
                    onClick={reconcileBilling}
                    disabled={reconciling}
                    className="flex h-10 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-xs font-extrabold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    <RefreshCw size={15} className={reconciling ? 'animate-spin' : ''} />
                    Reconcile Billing
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'Subscription Revenue', value: money(summary.totalRevenue), icon: WalletCards, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Outstanding Balance', value: money(summary.outstandingBalance), icon: CreditCard, color: 'text-amber-600 bg-amber-50' },
                    { label: 'Active Payments', value: summary.paymentCount || 0, icon: Receipt, color: 'text-blue-600 bg-blue-50' }
                ].map(item => (
                    <div key={item.label} className="bg-white border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase text-slate-400">{item.label}</p>
                            <p className="text-xl font-black text-slate-900 mt-1">{item.value}</p>
                        </div>
                        <div className={`p-2 ${item.color}`}><item.icon size={18} /></div>
                    </div>
                ))}
            </div>

            <section className="bg-white border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <FilePlus2 size={18} className="text-blue-600" />
                    <h3 className="font-extrabold text-slate-800">Issue Subscription Invoice</h3>
                </div>
                <form onSubmit={createInvoice} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                    <label className="text-xs font-bold text-slate-600 md:col-span-2">
                        School
                        <select required value={form.tenantId} onChange={event => setForm({ ...form, tenantId: event.target.value })}
                            className="mt-1 w-full h-10 border border-slate-200 px-3 bg-white text-sm">
                            <option value="">Select school</option>
                            {tenants.map(tenant => <option key={tenant._id} value={tenant._id}>{tenant.name}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                        Cycle
                        <select value={form.billingCycle} onChange={event => setForm({ ...form, billingCycle: event.target.value })}
                            className="mt-1 w-full h-10 border border-slate-200 px-3 bg-white text-sm">
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                        Period start
                        <input required type="date" value={form.periodStart} onChange={event => setForm({ ...form, periodStart: event.target.value })}
                            className="mt-1 w-full h-10 border border-slate-200 px-3 text-sm" />
                    </label>
                    <button disabled={submitting} className="h-10 bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                        {submitting ? 'Issuing...' : 'Issue Invoice'}
                    </button>
                </form>
            </section>

            <section className="bg-white border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="font-extrabold text-slate-800">Subscription Invoices</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase text-slate-400">
                            <tr>
                                <th className="px-4 py-3 text-left">Invoice</th>
                                <th className="px-4 py-3 text-left">School</th>
                                <th className="px-4 py-3 text-left">Cycle</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-right">Balance</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {invoices.map(invoice => (
                                <tr key={invoice._id}>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{invoice.invoiceNumber}</td>
                                    <td className="px-4 py-3 font-bold text-slate-800">{invoice.tenantId?.name || 'Unknown school'}</td>
                                    <td className="px-4 py-3 capitalize text-slate-600">{invoice.billingCycle}</td>
                                    <td className="px-4 py-3 text-right font-bold">{money(invoice.amount, invoice.currency)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-amber-700">{money(invoice.balance, invoice.currency)}</td>
                                    <td className="px-4 py-3 font-bold text-xs">{invoice.status}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button disabled={invoice.balance <= 0 || invoice.status === 'VOID'} onClick={() => recordPayment(invoice)}
                                            className="px-3 py-1.5 text-xs font-bold border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-30">
                                            Record Payment
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {invoices.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No subscription invoices issued yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="bg-white border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="font-extrabold text-slate-800">Recent Subscription Payments</h3>
                </div>
                <div className="divide-y divide-slate-100">
                    {(summary.recentPayments || []).map(payment => (
                        <div key={payment._id} className="px-5 py-3 flex items-center justify-between gap-4">
                            <div>
                                <p className="font-bold text-sm text-slate-800">{payment.tenantId?.name || 'Unknown school'}</p>
                                <p className="text-xs text-slate-400">{payment.method} · {payment.reference || 'Cash'} · {payment.receiptNumber}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-black text-emerald-700">{money(payment.amount)}</span>
                                <button onClick={() => reversePayment(payment)} title="Reverse payment" className="p-2 text-slate-400 hover:text-rose-600">
                                    <RotateCcw size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {(!summary.recentPayments || summary.recentPayments.length === 0) && <p className="py-8 text-center text-sm text-slate-400">No subscription payments recorded yet.</p>}
                </div>
            </section>
        </div>
    );
};

export default Billing;
