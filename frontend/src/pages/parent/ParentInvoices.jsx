import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import PaymentRecordView from '../../components/finance/PaymentRecordView';

/**
 * The parent's view of a child's school fees: this month, what is still owed from earlier
 * months, the total, a warning when a bill is past its due date, and every payment made.
 * It is the same record the school's finance office sees.
 */
const ParentInvoices = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [children, setChildren] = useState([]);
    const [record, setRecord] = useState(null);
    const [loadingChildren, setLoadingChildren] = useState(true);
    const [loadingRecord, setLoadingRecord] = useState(false);
    const [error, setError] = useState('');

    const activeStudentId = searchParams.get('studentId') || '';

    useEffect(() => {
        api.get('/parent/dashboard')
            .then((res) => {
                const list = res.data?.data || [];
                setChildren(list);
                if (!searchParams.get('studentId') && list.length > 0) {
                    setSearchParams({ studentId: list[0].student._id }, { replace: true });
                }
            })
            .catch((err) => setError(err.response?.data?.message || 'Could not load your children.'))
            .finally(() => setLoadingChildren(false));
    }, [searchParams, setSearchParams]);

    const fetchRecord = useCallback(async () => {
        if (!activeStudentId) return;
        setLoadingRecord(true);
        setError('');
        try {
            const res = await api.get(`/parent/students/${activeStudentId}/payment-record`);
            setRecord(res.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Could not load the fees.');
        } finally {
            setLoadingRecord(false);
        }
    }, [activeStudentId]);

    useEffect(() => {
        fetchRecord();
    }, [fetchRecord]);

    if (loadingChildren) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Fees & Payments</h1>
                    <p className="phoenix-page-subtitle">What is billed each month, what is paid, and what is still owed.</p>
                </div>
                {children.length > 1 && (
                    <label className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#8a94ad]">Child</span>
                        <select
                            value={activeStudentId}
                            onChange={(event) => {
                                setRecord(null);
                                setSearchParams({ studentId: event.target.value });
                            }}
                            className="h-10 rounded-xl border border-[#cbd0dd] bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:ring-4 focus:ring-[var(--primary)]/5"
                        >
                            {children.map((child) => (
                                <option key={child.student._id} value={child.student._id}>
                                    {child.student.firstName} {child.student.lastName}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-rose-900">
                    <AlertCircle className="shrink-0 text-rose-500" size={20} />
                    <div className="flex-1 text-sm font-semibold">{error}</div>
                    <button onClick={fetchRecord} className="flex items-center gap-1.5 rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-200">
                        <RefreshCw size={12} /> Retry
                    </button>
                </div>
            )}

            {!activeStudentId ? (
                <div className="phoenix-card mx-auto max-w-md p-6 text-center">
                    <AlertTriangle className="mx-auto mb-4 text-amber-500" size={36} />
                    <p className="text-sm font-semibold text-slate-500">No child is linked to your account yet.</p>
                </div>
            ) : loadingRecord || !record ? (
                !error && (
                    <div className="flex h-64 items-center justify-center">
                        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent"></div>
                    </div>
                )
            ) : (
                <PaymentRecordView record={record} audience="parent" />
            )}
        </div>
    );
};

export default ParentInvoices;
