import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getInvoice } from '../../services/api/finance.api';
import { Badge, Button } from '../../components/ui';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';

const InvoiceDetails = () => {
    const { invoiceId } = useParams();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const data = await getInvoice(invoiceId);
                setInvoice(data?.data || data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [invoiceId]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="phoenix-card p-6 text-center text-rose-500 font-bold">
                Invoice not found
            </div>
        );
    }

    const studentName = invoice.studentId ? `${invoice.studentId.firstName} ${invoice.studentId.lastName}` : 'N/A';
    const studentRef = invoice.studentId ? `ID: ${invoice.studentId.admissionNumber}` : 'N/A';

    return (
        <div className="max-w-4xl mx-auto space-y-4">
            <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2 !h-8 text-xs mb-2">
                <ArrowLeft size={16} /> Back to Invoices
            </Button>

            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Invoice #{invoice._id.slice(-6)}</h1>
                    <p className="phoenix-page-subtitle">Issued on {new Date(invoice.createdAt).toLocaleDateString()} &middot; {invoice.billingPeriodLabel || 'Annual'} billing period</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="flex items-center gap-2 !h-9 text-xs" onClick={() => window.print()}>
                        <Printer size={16} /> Print / Save PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <article className="phoenix-card md:col-span-2">
                    <div className="phoenix-card-header">
                        <div>
                            <h2 className="phoenix-section-title">Bill To: {invoice.studentId?._id ? <Link to={`/finance/students/${invoice.studentId._id}`} className="text-[var(--primary)] hover:underline">{studentName}</Link> : studentName}</h2>
                            <p className="phoenix-section-copy">{studentRef}</p>
                        </div>
                        <Badge variant={invoice.status === 'PAID' ? 'success' : invoice.status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                            {invoice.status}
                        </Badge>
                    </div>
                    
                    <div className="phoenix-card-body space-y-4">
                        <div className="flex justify-between items-center text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                             <span className="font-semibold text-slate-500">DUE DATE</span>
                             <span className="font-bold text-slate-900">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}</span>
                        </div>

                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-3 text-left">Description</th>
                                            <th className="px-4 py-3 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {invoice.items?.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3 text-slate-700 font-semibold">{item.name}</td>
                                                <td className="px-4 py-3 text-right text-slate-900 font-bold">${item.amount.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t font-bold text-slate-700">
                                        <tr>
                                            <td className="px-4 py-2.5 text-right font-semibold text-slate-500">Total Billed</td>
                                            <td className="px-4 py-2.5 text-right text-base text-slate-900">${invoice.totalAmount?.toLocaleString()}</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-2.5 text-right font-semibold text-slate-500">Paid to Date</td>
                                            <td className="px-4 py-2.5 text-right text-emerald-600">-${invoice.paidAmount?.toLocaleString()}</td>
                                        </tr>
                                        <tr className="bg-white border-t-2 border-slate-200">
                                            <td className="px-4 py-3 text-right text-slate-900 text-base">Balance Due</td>
                                            <td className="px-4 py-3 text-right text-xl text-[var(--primary)] font-black">${((invoice.totalAmount || 0) - (invoice.paidAmount || 0)).toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </article>

                <div className="space-y-4">
                    <article className="phoenix-card">
                         <div className="phoenix-card-header">
                             <div>
                                 <h2 className="phoenix-section-title">Payment History</h2>
                                 <p className="phoenix-section-copy">Receipt ledger for this invoice.</p>
                             </div>
                         </div>
                         <div className="phoenix-card-body space-y-3">
                            {(!invoice.payments || invoice.payments.length === 0) && (
                                <p className="text-center text-slate-400 text-xs font-semibold py-4">No payments recorded</p>
                            )}
                            {invoice.payments?.map((pay, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                                    <div>
                                        <p className="font-bold text-slate-700 text-xs">{new Date(pay.date).toLocaleDateString()}</p>
                                        <p className="text-[10px] font-semibold text-slate-400">{pay.method} ({pay.recordedBy})</p>
                                    </div>
                                    <span className="font-bold text-emerald-600 text-xs">+${pay.amount?.toLocaleString()}</span>
                                </div>
                            ))}
                         </div>
                    </article>
                </div>
            </div>
        </div>
    );
};

export default InvoiceDetails;
