import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReceipt, reversePayment } from '../../services/api/cashier.api';
import { Spinner, Button, Toast } from '../../components/ui';
import { Printer, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const Receipt = () => {
    const { user } = useAuth();
    const { paymentId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const printRef = useRef();

    // Reversal States
    const [showReversalModal, setShowReversalModal] = useState(false);
    const [reversalReason, setReversalReason] = useState('');
    const [submittingReversal, setSubmittingReversal] = useState(false);
    const [toast, setToast] = useState(null);

    const loadReceipt = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getReceipt(paymentId);
            setData(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [paymentId]);

    useEffect(() => {
        loadReceipt();
    }, [loadReceipt]);

    const handlePrint = () => {
        window.print();
    };

    const confirmReversal = async () => {
        if (!data || !data.payment) return;
        setSubmittingReversal(true);
        setToast(null);

        try {
            await reversePayment(paymentId, reversalReason);
            setToast({ type: 'success', message: 'Payment reversed successfully.' });
            setShowReversalModal(false);
            setReversalReason('');
            loadReceipt();
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Reversal failed.';
            setToast({ type: 'error', message: msg });
        } finally {
            setSubmittingReversal(false);
        }
    };

    if (loading) return <Spinner />;
    if (!data) return <div>Receipt not found.</div>;

    const { branch, student, invoice, payment, dateTime, receiptNo } = data;

    return (
        <div className="space-y-6 print:m-0 print:w-full">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Action Bar / Page Header (Hidden when printing) */}
            <div className="phoenix-page-header print:hidden">
                <div>
                    <h1 className="phoenix-page-title">Receipt Details</h1>
                    <p className="phoenix-page-subtitle">Official statement of receipt for transaction payment.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => navigate(`/cashier/invoices/${invoice.invoiceId}`)}>
                        <ArrowLeft size={18} className="mr-2" /> Back to Invoice
                    </Button>
                    {hasPermission(user, 'cashier.payments.reverse') && payment.status !== 'REVERSED' && payment.amount > 0 && (
                        <Button onClick={() => setShowReversalModal(true)} variant="danger">
                            Reverse Payment
                        </Button>
                    )}
                    <Button onClick={() => navigate('/cashier/payments/new')}>New Payment</Button>
                    <Button onClick={handlePrint} variant="outline">
                        <Printer size={18} className="mr-2" /> Print Receipt
                    </Button>
                </div>
            </div>

            {/* Receipt Container */}
            <article ref={printRef} className="phoenix-card w-full max-w-lg mx-auto p-8 shadow-xl print:shadow-none border print:border-none text-sm bg-white">
                {/* Header */}
                <div className="text-center mb-6 border-b pb-4">
                    {branch.logoUrl && (
                        <img src={branch.logoUrl} alt="Logo" className="h-12 mx-auto mb-2 object-contain" />
                    )}
                    <h2 className="text-xl font-bold text-slate-800">{branch.name}</h2>
                    <p className="text-slate-500 text-xs mt-1">{branch.address}</p>
                    <p className="text-slate-500 text-xs">{branch.contactInfo}</p>
                </div>

                {/* Meta */}
                <div className="flex justify-between mb-6 text-xs text-slate-600">
                    <div>
                        <p><span className="font-bold">Date:</span> {new Date(dateTime).toLocaleString()}</p>
                        <p><span className="font-bold">Receipt #:</span> {receiptNo ? receiptNo.slice(-8).toUpperCase() : 'N/A'}</p>
                        <p><span className="font-bold">Ref:</span> {payment.reference || 'N/A'}</p>
                    </div>
                    <div className="text-right">
                        <p><span className="font-bold">Received From:</span></p>
                        <p className="font-medium text-slate-800">{student.name}</p>
                        <p>({student.admissionNumber})</p>
                    </div>
                </div>

                {/* Payment Detail */}
                <div className={`mb-6 border rounded p-4 ${payment.status === 'REVERSED' ? 'bg-red-50/50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center">
                        <span className="font-bold text-lg text-slate-700">
                            {payment.status === 'REVERSED' ? 'Amount reversed' : 'Amount paid'}
                        </span>
                        <span className={`font-bold text-xl ${payment.status === 'REVERSED' ? 'text-rose-600' : 'text-slate-900'}`}>
                            ${Number(data.batch && payment.status !== 'REVERSED' ? data.batch.total : payment.amount).toFixed(2)}
                        </span>
                    </div>
                    <div className="text-right text-xs text-slate-500 mt-1">
                        Method: {payment.method} {payment.status === 'REVERSED' && ' (Reversed)'}
                    </div>
                </div>

                {/* One amount that paid several months: where it went, oldest first */}
                {data.batch && data.batch.lines.length > 1 && (
                    <div className="mb-6">
                        <h3 className="font-bold border-b pb-1 mb-2 text-xs text-slate-500">Paid for</h3>
                        <div className="grid grid-cols-3 gap-y-1 text-slate-600">
                            <span className="text-xs font-semibold text-slate-400">Month</span>
                            <span className="text-right text-xs font-semibold text-slate-400">Paid</span>
                            <span className="text-right text-xs font-semibold text-slate-400">Still owed</span>
                            {data.batch.lines.map((line) => (
                                <React.Fragment key={line.paymentId}>
                                    <span className={line.status === 'REVERSED' ? 'line-through' : ''}>{line.month}</span>
                                    <span className={`text-right ${line.status === 'REVERSED' ? 'line-through' : ''}`}>${Number(line.amount).toFixed(2)}</span>
                                    <span className="text-right">{line.stillOwed === null ? '—' : `$${Number(line.stillOwed).toFixed(2)}`}</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                {/* Account Status */}
                {!(data.batch && data.batch.lines.length > 1) && <div className="mb-6">
                    <h3 className="font-bold border-b pb-1 mb-2 text-xs text-slate-500">Account status (Inv #{invoice.invoiceId.slice(-6)})</h3>
                    <div className="grid grid-cols-2 gap-y-1 text-slate-600">
                        <span>Total Invoice:</span>
                        <span className="text-right">${Number(invoice.totalAmount).toFixed(2)}</span>
                        
                        <span>Total Paid:</span>
                        <span className="text-right font-medium text-green-700">${Number(invoice.paidAmount).toFixed(2)}</span>
                        
                        <span className="font-bold text-slate-800">Balance Due:</span>
                        <span className="text-right font-bold text-slate-800">${Number(invoice.balance).toFixed(2)}</span>
                    </div>
                </div>}

                {/* Footer */}
                <div className="text-center text-xs text-slate-400 mt-8 pt-4 border-t border-dashed">
                    <p>{branch.receiptFooter || 'Thank you for your payment.'}</p>
                    <p className="mt-1 font-mono text-[10px]">
                        Recorded By: {payment.recordedBy} 
                        {payment.reversalReason && ` • Reversed Reason: ${payment.reversalReason}`}
                    </p>
                </div>
            </article>

            {/* Reversal Confirmation Modal */}
            {showReversalModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl border shadow-xl max-w-md w-full space-y-4 m-4">
                        <h3 className="font-bold text-lg text-slate-900">Confirm Reversal</h3>
                        <p className="text-sm text-slate-500">
                            Please provide a reason for reversing this payment of <strong>${Number(payment?.amount || 0).toFixed(2)}</strong>.
                        </p>
                        <textarea
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-sm"
                            rows="3"
                            placeholder="Reason for reversal (required)..."
                            value={reversalReason}
                            onChange={e => setReversalReason(e.target.value)}
                            required
                        />
                        <div className="flex gap-3 justify-end text-sm">
                            <Button 
                                variant="ghost" 
                                onClick={() => { setShowReversalModal(false); setReversalReason(''); }}
                                disabled={submittingReversal}
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="danger" 
                                disabled={!reversalReason.trim() || submittingReversal} 
                                onClick={confirmReversal}
                            >
                                {submittingReversal ? <Spinner size="sm" color="white" /> : 'Confirm Reversal'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Receipt;
