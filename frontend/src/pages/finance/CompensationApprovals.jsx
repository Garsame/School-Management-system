import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Check, Clock3, Eye, UserRound, X } from 'lucide-react';
import api from '../../services/api';
import { Button, Spinner } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const statuses = ['Pending', 'Approved', 'Rejected'];
const statusStyle = {
    Pending: 'border-amber-200 bg-amber-50 text-amber-700',
    Approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Rejected: 'border-rose-200 bg-rose-50 text-rose-700'
};
const moneyFields = [
    ['basicSalary', 'Basic salary'],
    ['allowance', 'Allowance'],
    ['deductions', 'Deductions']
];

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : 'Not set';
const netAmount = (value = {}) => Number(value.basicSalary || 0) + Number(value.allowance || 0) - Number(value.deductions || 0);

const CompensationApprovals = () => {
    const [status, setStatus] = useState('Pending');
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reviewing, setReviewing] = useState(null);
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { user } = useAuth();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/tenant/finance/compensation-requests', { params: { status } });
            setRequests(response.data?.data || []);
        } catch (error) {
            notify(error.response?.data?.message || 'Compensation requests could not be loaded.', 'error');
        } finally {
            setLoading(false);
        }
    }, [status]);
    useEffect(() => { load(); }, [load]);

    const close = () => {
        if (!submitting) {
            setReviewing(null);
            setRemarks('');
        }
    };
    const review = async (action) => {
        if (action === 'Rejected' && !remarks.trim()) {
            notify('Add rejection remarks before rejecting this request.', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            await api.put(`/tenant/finance/compensation-requests/${reviewing._id}/review`, { action, reviewRemarks: remarks.trim() });
            notify(`Compensation change ${action.toLowerCase()}.`, 'success');
            setReviewing(null);
            setRemarks('');
            await load();
        } catch (error) {
            notify(error.response?.data?.message || 'Compensation request could not be reviewed.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const totals = useMemo(() => requests.reduce((result, request) => ({
        current: result.current + netAmount(request.currentCompensation),
        proposed: result.proposed + netAmount(request.proposedCompensation)
    }), { current: 0, proposed: 0 }), [requests]);
    const currency = requests[0]?.proposedCompensation?.currency || 'USD';
    const ownRequest = reviewing && String(reviewing.employeeId?._id) === String(user?._id || user?.id);

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div><h1 className="phoenix-page-title">Salary approvals</h1><p className="phoenix-page-subtitle">Review HR compensation requests before they affect payroll.</p></div>
                <div className="flex items-center gap-2 rounded-md border border-[#d8dde7] bg-white px-3 py-2 text-xs text-[#52617a]"><BadgeDollarSign size={15} className="text-[var(--primary)]" /><strong className="text-[#141824]">{requests.length}</strong> {status.toLowerCase()}</div>
            </div>

            <section className="flex flex-col gap-3 border-b border-[#d8dde7] pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex w-fit rounded-md border border-[#d8dde7] bg-white p-1">
                    {statuses.map((value) => <button key={value} type="button" onClick={() => setStatus(value)} className={`h-8 px-3 text-xs font-semibold transition-colors ${status === value ? 'rounded bg-[var(--primary)] text-white' : 'text-[#52617a] hover:text-[#141824]'}`}>{value}</button>)}
                </div>
                {status === 'Pending' && requests.length > 0 && <p className="text-xs text-[#52617a]">Net monthly change: <strong className={totals.proposed - totals.current >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{currency} {(totals.proposed - totals.current).toLocaleString()}</strong></p>}
            </section>

            {loading ? <div className="flex min-h-[320px] items-center justify-center"><Spinner size="lg" /></div> : requests.length === 0 ? (
                <section className="phoenix-card flex min-h-[280px] flex-col items-center justify-center p-8 text-center"><Clock3 size={28} className="text-[var(--primary)]" /><h2 className="mt-3 text-base font-semibold text-[#141824]">No {status.toLowerCase()} requests</h2><p className="mt-1 text-sm text-[#8a94ad]">Compensation requests from HR will appear here.</p></section>
            ) : (
                <article className="phoenix-card overflow-hidden">
                    <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left">
                        <thead className="bg-[#f7f8fb]"><tr className="border-b border-[#e3e6ed] text-xs font-semibold text-[#52617a]"><th className="px-5 py-3.5">Employee</th><th className="px-4 py-3.5">Requested by</th><th className="px-4 py-3.5">Current net</th><th className="px-4 py-3.5">Proposed net</th><th className="px-4 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Details</th></tr></thead>
                        <tbody className="divide-y divide-[#edf0f5]">{requests.map((request) => {
                            const rowCurrency = request.proposedCompensation?.currency || 'USD';
                            return <tr key={request._id} className="hover:bg-[#fafbfc]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]"><UserRound size={16} /></span><div><p className="text-sm font-semibold text-[#141824]">{request.employeeId?.name || 'Unknown employee'}</p><p className="mt-0.5 text-xs capitalize text-[#8a94ad]">{request.employeeId?.role?.replaceAll('_', ' ')} · {request.branchId?.name || 'Head office'}</p></div></div></td><td className="px-4 py-4"><p className="text-sm text-[#3e465b]">{request.requestedBy?.name}</p><p className="mt-0.5 text-xs text-[#8a94ad]">{formatDate(request.createdAt)}</p></td><td className="px-4 py-4 text-sm text-[#52617a]">{rowCurrency} {netAmount(request.currentCompensation).toLocaleString()}</td><td className="px-4 py-4 text-sm font-bold text-[#141824]">{rowCurrency} {netAmount(request.proposedCompensation).toLocaleString()}</td><td className="px-4 py-4"><span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusStyle[request.status]}`}>{request.status}</span></td><td className="px-5 py-4 text-right"><Button size="sm" variant="outline" onClick={() => { setReviewing(request); setRemarks(request.reviewRemarks || ''); }}><Eye size={14} />View</Button></td></tr>;
                        })}</tbody>
                    </table></div>
                </article>
            )}

            {reviewing && (
                <div className="phoenix-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="approval-title">
                    <button type="button" className="phoenix-modal-scrim" onClick={close} aria-label="Close salary approval" />
                    <div className="phoenix-modal-panel max-w-2xl">
                        <div className="phoenix-modal-header"><div><h2 id="approval-title" className="phoenix-section-title">Compensation request</h2><p className="phoenix-section-copy">Review the approved and proposed recurring amounts.</p></div><button type="button" className="phoenix-icon-button" onClick={close} disabled={submitting} aria-label="Close dialog"><X size={17} /></button></div>
                        <div className="phoenix-modal-body custom-scrollbar space-y-5">
                            <section className="flex flex-col gap-3 rounded-md border border-[#e3e6ed] bg-[#f7f8fb] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#141824]">{reviewing.employeeId?.name}</p><p className="mt-0.5 text-xs capitalize text-[#8a94ad]">{reviewing.employeeId?.role?.replaceAll('_', ' ')} · {reviewing.branchId?.name || 'Head office'}</p></div><span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${statusStyle[reviewing.status]}`}>{reviewing.status}</span></section>

                            <section><h3 className="mb-3 text-sm font-semibold text-[#141824]">Monthly compensation comparison</h3><div className="overflow-hidden rounded-md border border-[#e3e6ed]"><table className="w-full text-left text-sm"><thead className="bg-[#f7f8fb] text-xs text-[#52617a]"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Current</th><th className="px-4 py-3 text-right">Proposed</th></tr></thead><tbody className="divide-y divide-[#edf0f5]">{moneyFields.map(([field, label]) => <tr key={field}><td className="px-4 py-3 text-[#52617a]">{label}</td><td className="px-4 py-3 text-right text-[#52617a]">{reviewing.currentCompensation?.currency || 'USD'} {Number(reviewing.currentCompensation?.[field] || 0).toLocaleString()}</td><td className="px-4 py-3 text-right font-semibold text-[#141824]">{reviewing.proposedCompensation?.currency || 'USD'} {Number(reviewing.proposedCompensation?.[field] || 0).toLocaleString()}</td></tr>)}<tr className="bg-[#fafbfc]"><td className="px-4 py-3 font-semibold text-[#141824]">Net recurring</td><td className="px-4 py-3 text-right font-semibold text-[#52617a]">{reviewing.currentCompensation?.currency || 'USD'} {netAmount(reviewing.currentCompensation).toLocaleString()}</td><td className="px-4 py-3 text-right font-bold text-[#141824]">{reviewing.proposedCompensation?.currency || 'USD'} {netAmount(reviewing.proposedCompensation).toLocaleString()}</td></tr></tbody></table></div></section>

                            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><p className="phoenix-field-label">Employment type</p><p className="mt-1.5 text-sm text-[#3e465b]">{reviewing.currentCompensation?.employmentType || 'Not set'} to {reviewing.proposedCompensation?.employmentType || 'Not set'}</p></div><div><p className="phoenix-field-label">Payment method</p><p className="mt-1.5 text-sm text-[#3e465b]">{reviewing.currentCompensation?.paymentMethod || 'Not set'} to {reviewing.proposedCompensation?.paymentMethod || 'Not set'}</p></div></section>
                            <section className="rounded-md border border-[#d8dde7] p-4"><p className="phoenix-field-label">HR reason</p><p className="mt-2 text-sm leading-6 text-[#3e465b]">{reviewing.reason}</p><p className="mt-2 text-xs text-[#8a94ad]">Requested by {reviewing.requestedBy?.name} on {formatDate(reviewing.createdAt)}</p></section>

                            {reviewing.status === 'Pending' ? <label><span className="phoenix-field-label">Review remarks</span><textarea rows="3" maxLength="500" className="phoenix-control mt-1.5 !h-auto resize-none py-2.5" placeholder="Required when rejecting; optional when approving" value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label> : reviewing.reviewRemarks && <section><p className="phoenix-field-label">Review remarks</p><p className="mt-1.5 text-sm text-[#3e465b]">{reviewing.reviewRemarks}</p></section>}
                            {ownRequest && reviewing.status === 'Pending' && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">You cannot approve or reject your own compensation request. Another authorized Finance Director must review it.</p>}
                        </div>
                        <div className="phoenix-modal-footer"><Button type="button" variant="ghost" onClick={close} disabled={submitting}>Close</Button>{reviewing.status === 'Pending' && !ownRequest && hasPermission(user, 'finance.compensation.approve') && <><Button type="button" variant="danger" onClick={() => review('Rejected')} disabled={submitting}><X size={15} />Reject</Button><Button type="button" onClick={() => review('Approved')} disabled={submitting}><Check size={15} />{submitting ? 'Saving...' : 'Approve'}</Button></>}</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompensationApprovals;
