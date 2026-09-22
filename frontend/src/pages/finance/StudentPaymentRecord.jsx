import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Receipt } from 'lucide-react';
import { getStudentPaymentRecord } from '../../services/api/finance.api';
import { Button } from '../../components/ui';
import PaymentRecordView from '../../components/finance/PaymentRecordView';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

/**
 * One student's payment record for finance: every month billed, paid and still owed,
 * earlier debt, late months and every payment. The parent sees the same record.
 */
const StudentPaymentRecord = () => {
    const { studentId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [record, setRecord] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        getStudentPaymentRecord(studentId)
            .then((data) => { if (!cancelled) setRecord(data); })
            .catch((failure) => { if (!cancelled) setError(failure.response?.data?.message || 'Could not load this student'); });
        return () => { cancelled = true; };
    }, [studentId]);

    const canTakePayment = hasPermission(user, 'cashier.payments.create') && record?.totals?.owed > 0;

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2 !h-8 text-xs">
                <ArrowLeft size={16} /> Back
            </Button>
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Payment record</h1>
                    <p className="phoenix-page-subtitle">Every month billed, paid and still owed for this student.</p>
                </div>
            </div>
            {error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
            ) : !record ? (
                <div className="flex h-60 items-center justify-center"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
            ) : (
                <PaymentRecordView
                    record={record}
                    actions={canTakePayment && (
                        <Button onClick={() => navigate(`/cashier/payments/new?studentId=${studentId}`)} className="flex items-center gap-2 !h-9 text-xs">
                            <Receipt size={16} /> Take a payment
                        </Button>
                    )}
                />
            )}
        </div>
    );
};

export default StudentPaymentRecord;
