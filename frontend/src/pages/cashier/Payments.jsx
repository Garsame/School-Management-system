import React, { useCallback, useEffect, useState } from 'react';
import { exportDayCloseCsv, getDayCloseSummary, getPayments, reversePayment } from '../../services/api/cashier.api';
import { Card, Table, Spinner, Button, Input, Badge, Toast } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Download, Receipt as ReceiptIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { downloadBlob } from '../../utils/download';

const Payments = () => {
    const { user } = useAuth();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        from: '',
        to: '',
        method: ''
    });
    const [dayCloseDate, setDayCloseDate] = useState(new Date().toISOString().slice(0, 10));
    const [dayClose, setDayClose] = useState(null);
    const [dayCloseLoading, setDayCloseLoading] = useState(false);
    const [dayCloseExporting, setDayCloseExporting] = useState(false);
    const navigate = useNavigate();

    // Reversal States
    const [showReversalModal, setShowReversalModal] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState(null);
    const [reversalReason, setReversalReason] = useState('');
    const [submittingReversal, setSubmittingReversal] = useState(false);
    const [toast, setToast] = useState(null);

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getPayments(filters);
            setPayments(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const fetchDayClose = useCallback(async () => {
        setDayCloseLoading(true);
        try {
            const response = await getDayCloseSummary({ date: dayCloseDate });
            setDayClose(response.data || null);
        } catch (error) {
            console.error(error);
            setDayClose(null);
        } finally {
            setDayCloseLoading(false);
        }
    }, [dayCloseDate]);

    useEffect(() => {
        fetchDayClose();
    }, [fetchDayClose]);

    const handleFilter = (e) => {
        e.preventDefault();
        fetchPayments();
    };

    const handleReverseClick = (payment) => {
        setSelectedPayment(payment);
        setReversalReason('');
        setShowReversalModal(true);
    };

    const handleDayCloseExport = async () => {
        setDayCloseExporting(true);
        try {
            const blob = await exportDayCloseCsv({ date: dayCloseDate });
            downloadBlob(blob, `cashier_day_close_${dayCloseDate}.csv`);
        } catch (error) {
            console.error(error);
        } finally {
            setDayCloseExporting(false);
        }
    };

    const formatRecordedBy = (recordedBy) => {
        if (!recordedBy) return 'System';
        if (recordedBy.name) return recordedBy.name;
        const fullName = [recordedBy.firstName, recordedBy.lastName].filter(Boolean).join(' ');
        return fullName || recordedBy.email || 'System';
    };

    const confirmReversal = async () => {
        if (!selectedPayment) return;
        setSubmittingReversal(true);
        setToast(null);

        try {
            await reversePayment(selectedPayment._id, reversalReason);
            setToast({ type: 'success', message: 'Payment reversed successfully.' });
            setShowReversalModal(false);
            setSelectedPayment(null);
            setReversalReason('');
            fetchPayments();
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Reversal failed.';
            setToast({ type: 'error', message: msg });
        } finally {
            setSubmittingReversal(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Payment History</h1>
                    <p className="phoenix-page-subtitle">View and manage history of all recorded branch transactions and payments.</p>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <article className="phoenix-card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                            <CalendarCheck size={20} />
                        </span>
                        <div>
                            <h2 className="phoenix-section-title">Cashier day close</h2>
                            <p className="phoenix-section-copy">Own-drawer totals for the selected business day.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <Input
                            label="Close Date"
                            type="date"
                            value={dayCloseDate}
                            onChange={(e) => setDayCloseDate(e.target.value)}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            className="flex items-center gap-2 !h-10 text-xs"
                            onClick={handleDayCloseExport}
                            disabled={dayCloseExporting}
                        >
                            {dayCloseExporting ? <Spinner size="sm" /> : <Download size={15} />}
                            Export close
                        </Button>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {[
                        ['Collected', dayClose?.totals?.collected || 0],
                        ['Reversed', dayClose?.totals?.reversed || 0],
                        ['Net', dayClose?.totals?.net || 0],
                        ['Expected cash', dayClose?.totals?.expectedCash || 0],
                        ['Transactions', dayClose?.totals?.transactionCount || 0]
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-[var(--border)] bg-white p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a94ad]">{label}</p>
                            <p className="mt-1 text-lg font-bold text-[#141824]">
                                {label === 'Transactions' ? value : `$${Number(value).toLocaleString()}`}
                            </p>
                        </div>
                    ))}
                </div>
                {dayCloseLoading && <p className="mt-3 text-xs font-semibold text-[#8a94ad]">Refreshing close totals...</p>}
            </article>

            <article className="phoenix-card p-4">
                <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
                    <Input 
                        label="From Date" 
                        type="date" 
                        value={filters.from} 
                        onChange={e => setFilters({...filters, from: e.target.value})} 
                    />
                    <Input 
                        label="To Date" 
                        type="date" 
                        value={filters.to} 
                        onChange={e => setFilters({...filters, to: e.target.value})} 
                    />
                    <div className="form-group w-40">
                        <label className="block text-sm font-medium mb-1 text-[#525b75]">Method</label>
                        <select 
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 bg-white text-[#141824]"
                            value={filters.method}
                            onChange={e => setFilters({...filters, method: e.target.value})}
                        >
                            <option value="">All</option>
                            <option value="CASH">Cash</option>
                            <option value="ZAAD">Zaad</option>
                            <option value="EVC_PLUS">EVC Plus</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="CARD">Card / POS</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                    <Button type="submit">Filtered Search</Button>
                </form>
            </article>

            {loading ? <Spinner /> : (
                <article className="phoenix-card overflow-hidden">
                    <div className="phoenix-card-body p-0">
                        <div className="phoenix-table-shell">
                            <div className="overflow-x-auto">
                                <Table headers={['Date/Time', 'Amount', 'Method', 'Ref', 'Invoice ID', 'Recorded By', 'Status', 'Action']}>
                                    {(payments || []).map(p => {
                                        const invoiceIdVal = p.invoiceId && typeof p.invoiceId === 'object' ? p.invoiceId._id : p.invoiceId;
                                        return (
                                            <tr key={p._id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-sm">{new Date(p.createdAt).toLocaleString()}</td>
                                                <td className="px-4 py-3 font-bold text-slate-800">${p.amount.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-xs font-medium text-[#141824]">{p.method?.replace('_', ' ')}</td>
                                                <td className="px-4 py-3 text-xs font-mono">{p.reference || '-'}</td>
                                                <td 
                                                    className="px-4 py-3 text-xs font-mono text-blue-600 cursor-pointer" 
                                                    onClick={() => invoiceIdVal && navigate(`/cashier/invoices/${invoiceIdVal}`)}
                                                >
                                                    {invoiceIdVal ? `#${invoiceIdVal.slice(-8)}` : 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-sm">{formatRecordedBy(p.recordedBy)}</td>
                                                <td className="px-4 py-3">
                                                    {p.status === 'REVERSED' ? (
                                                        <Badge variant="danger">Reversed</Badge>
                                                    ) : p.status === 'REVERSAL' ? (
                                                        <Badge variant="danger">Reversal</Badge>
                                                    ) : (
                                                        <Badge variant="success">Active</Badge>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 flex items-center gap-2">
                                                     <Button size="sm" variant="ghost" onClick={() => navigate(`/cashier/receipts/${p._id}`)} title="View Receipt">
                                                        <ReceiptIcon size={16} />
                                                     </Button>
                                                     {hasPermission(user, 'cashier.payments.reverse') && p.status !== 'REVERSED' && p.amount > 0 && (
                                                         <Button 
                                                             size="sm" 
                                                             variant="danger" 
                                                             onClick={() => handleReverseClick(p)}
                                                             title="Reverse Payment"
                                                         >
                                                             Reverse
                                                         </Button>
                                                     )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(payments || []).length === 0 && (
                                        <tr><td colSpan="8" className="text-center py-8 text-slate-500">No history found.</td></tr>
                                    )}
                                </Table>
                            </div>
                        </div>
                    </div>
                </article>
            )}

            {/* Reversal Confirmation Modal */}
            {showReversalModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl border shadow-xl max-w-md w-full space-y-4 m-4">
                        <h3 className="font-bold text-lg text-slate-900">Confirm Reversal</h3>
                        <p className="text-sm text-slate-500">
                            Please provide a reason for reversing this payment of <strong>${selectedPayment?.amount?.toFixed(2)}</strong>.
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
                                onClick={() => { setShowReversalModal(false); setSelectedPayment(null); setReversalReason(''); }}
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

export default Payments;
