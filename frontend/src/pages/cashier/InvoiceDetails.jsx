import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoiceById } from '../../services/api/cashier.api';
import { Card, Button, Spinner, Badge } from '../../components/ui';

const InvoiceDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInv = async () => {
            try {
                const res = await getInvoiceById(id);
                setInvoice(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchInv();
    }, [id]);

    if (loading) return <Spinner />;
    if (!invoice) return <div>Invoice not found.</div>;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Invoice Details</h1>
                    <p className="phoenix-page-subtitle">View detailed breakdown of invoice items, payment status, and balances.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <article className="phoenix-card p-6">
                        <div className="flex justify-between items-start mb-6 pb-6 border-b">
                            <div>
                                <h2 className="text-xl font-bold">{invoice.academicYearId?.name} Invoice</h2>
                                <p className="text-slate-500 text-sm">#{invoice._id}</p>
                            </div>
                            <div className="text-right">
                                <Badge variant={invoice.status === 'PAID' ? 'success' : invoice.status === 'PARTIALLY_PAID' ? 'warning' : 'danger'} size="lg">
                                    {invoice.status === 'PAID' ? 'Paid' : invoice.status === 'PARTIALLY_PAID' ? 'Partially paid' : invoice.status === 'VOID' ? 'Void' : 'Unpaid'}
                                </Badge>
                                <p className="text-xs text-slate-400 mt-2">Created: {new Date(invoice.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>

                        {/* Student Info */}
                        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                            <h3 className="text-sm font-bold text-slate-500 mb-2">Student Details</h3>
                            <div className="flex justify-between">
                                <div>
                                    <p className="font-bold text-lg">{invoice.studentId?.firstName} {invoice.studentId?.lastName}</p>
                                    <p className="text-sm">{invoice.studentId?.admissionNumber}</p>
                                </div>
                                <div className="text-right">
                                     <p className="text-sm">{invoice.studentId?.guardianInfo?.name}</p>
                                     <p className="text-xs text-slate-500">{invoice.studentId?.guardianInfo?.phone}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items */}
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#e3e6ed] bg-[#f5f7fa]">
                                            <th className="px-4 py-3 text-left font-semibold text-[#525b75]">Description</th>
                                            <th className="px-4 py-3 text-right font-semibold text-[#525b75]">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(invoice.items || []).map((item, idx) => (
                                            <tr key={idx} className="border-b last:border-0 hover:bg-[#f5f7fa]">
                                                <td className="px-4 py-3 text-[#141824]">{item.name}</td>
                                                <td className="px-4 py-3 text-right font-medium text-[#141824]">${item.amount.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </article>
                </div>

                <div className="space-y-6">
                    <article className="phoenix-card p-6">
                        <h3 className="font-bold border-b pb-2 mb-4">Payment Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>Total Amount</span>
                                <span className="font-bold text-slate-800">${invoice.totalAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                                <span>Paid Amount</span>
                                <span className="font-bold">-${invoice.paidAmount.toFixed(2)}</span>
                            </div>
                            <div className="border-t pt-2 mt-2 flex justify-between items-center">
                                <span className="font-bold">Balance Due</span>
                                <span className={`text-xl font-bold ${invoice.balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                    ${invoice.balance.toFixed(2)}
                                </span>
                            </div>
                        </div>

                         {invoice.balance > 0 && invoice.status !== 'VOID' && (
                            <div className="mt-6">
                                <Button className="w-full" onClick={() => navigate(`/cashier/payments/new?invoiceId=${invoice._id}`)}>
                                    Record Payment
                                </Button>
                            </div>
                        )}
                    </article>
                </div>
            </div>
        </div>
    );
};

export default InvoiceDetails;
