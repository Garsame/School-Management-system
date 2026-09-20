import React, { useEffect, useMemo, useState } from 'react';
import {
    CalendarDays,
    CalendarRange,
    Check,
    CheckCircle2,
    Clock3,
    MessageSquare,
    UserRound,
    X,
    XCircle
} from 'lucide-react';
import { Button, Modal, Spinner } from '../../components/ui';
import api from '../../services/api';
import { notify } from '../../components/feedback/notificationService';

const filters = [
    { key: 'All', label: 'All requests' },
    { key: 'Pending', label: 'Pending' },
    { key: 'Approved', label: 'Approved' },
    { key: 'Rejected', label: 'Rejected' }
];

const statusConfig = {
    Approved: {
        icon: CheckCircle2,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700'
    },
    Rejected: {
        icon: XCircle,
        className: 'border-rose-200 bg-rose-50 text-rose-700'
    },
    Pending: {
        icon: Clock3,
        className: 'border-amber-200 bg-amber-50 text-amber-700'
    }
};

const formatDate = (value) => new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
});

const getDurationDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
};

const StatusBadge = ({ status }) => {
    const config = statusConfig[status] || statusConfig.Pending;
    const Icon = config.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${config.className}`}>
            <Icon size={13} />
            {status}
        </span>
    );
};

const StaffLeavesManager = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('All');
    const [reviewModal, setReviewModal] = useState(null);
    const [reviewRemarks, setReviewRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchRequests = async () => {
        try {
            const res = await api.get('/hr/leaves');
            if (res.data?.success) setRequests(res.data.data);
        } catch (err) {
            notify(err.response?.data?.message || 'Leave requests could not be loaded.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const requestCounts = useMemo(() => requests.reduce((counts, request) => ({
        ...counts,
        [request.status]: (counts[request.status] || 0) + 1
    }), { All: requests.length }), [requests]);

    const visibleRequests = useMemo(
        () => activeFilter === 'All' ? requests : requests.filter((request) => request.status === activeFilter),
        [activeFilter, requests]
    );

    const closeReview = () => {
        if (submitting) return;
        setReviewModal(null);
        setReviewRemarks('');
    };

    const handleReview = async (status) => {
        if (!reviewModal) return;
        setSubmitting(true);
        try {
            await api.put(`/hr/leaves/${reviewModal._id}/review`, { status, reviewRemarks });
            notify(`Leave request ${status.toLowerCase()}.`, 'success');
            setReviewModal(null);
            setReviewRemarks('');
            await fetchRequests();
        } catch (err) {
            notify(err.response?.data?.message || 'Failed to review request', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[360px] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    const openReview = (request) => {
        setReviewRemarks('');
        setReviewModal(request);
    };

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Leave requests</h1>
                    <p className="phoenix-page-subtitle">Review staff time off and keep branch coverage organized.</p>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-[#d8dde7] bg-white px-3 py-2 text-xs text-[#52617a]">
                    <Clock3 size={15} className="text-[var(--primary)]" />
                    <span><strong className="text-[#141824]">{requestCounts.Pending || 0}</strong> awaiting review</span>
                </div>
            </div>

            <section className="phoenix-card p-3">
                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Leave request status">
                    {filters.map((filter) => {
                        const selected = activeFilter === filter.key;
                        return (
                            <button
                                key={filter.key}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => setActiveFilter(filter.key)}
                                className={`flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors ${
                                    selected
                                        ? 'bg-[var(--primary)] text-white'
                                        : 'text-[#52617a] hover:bg-[color-mix(in_srgb,var(--primary)_8%,white)] hover:text-[var(--primary)]'
                                }`}
                            >
                                {filter.label}
                                <span className={`min-w-5 text-center text-[11px] ${selected ? 'text-white/80' : 'text-[#8a94ad]'}`}>
                                    {requestCounts[filter.key] || 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {visibleRequests.length === 0 ? (
                <section className="phoenix-card flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]">
                        <CalendarDays size={22} />
                    </span>
                    <h2 className="text-base font-semibold text-[#141824]">No {activeFilter === 'All' ? '' : activeFilter.toLowerCase()} leave requests</h2>
                    <p className="mt-1 max-w-sm text-sm text-[#6e7891]">Requests will appear here when staff submit time off.</p>
                </section>
            ) : (
                <>
                    <section className="phoenix-card hidden overflow-hidden md:block">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] table-fixed text-left">
                                <thead className="bg-[#f7f8fb]">
                                    <tr className="border-b border-[#e3e6ed] text-xs font-semibold text-[#52617a]">
                                        <th className="w-[22%] px-5 py-3.5">Employee</th>
                                        <th className="w-[11%] px-4 py-3.5">Leave type</th>
                                        <th className="w-[18%] px-4 py-3.5">Dates</th>
                                        <th className="w-[23%] px-4 py-3.5">Reason</th>
                                        <th className="w-[12%] px-4 py-3.5">Status</th>
                                        <th className="w-[14%] px-5 py-3.5 text-right">Review</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#edf0f5]">
                                    {visibleRequests.map((request) => {
                                        const days = getDurationDays(request.startDate, request.endDate);
                                        return (
                                            <tr key={request._id} className="transition-colors hover:bg-[#fafbfc]">
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--primary)_18%,#d8dde7)] bg-[color-mix(in_srgb,var(--primary)_8%,white)] text-sm font-semibold text-[var(--primary)]">
                                                            {request.userId?.name?.charAt(0) || <UserRound size={15} />}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-[#141824]">{request.userId?.name || 'Staff member'}</p>
                                                            <p className="mt-0.5 text-xs capitalize text-[#8a94ad]">{request.userId?.role?.replaceAll('_', ' ') || 'Staff'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-sm font-medium text-[#3e465b]">{request.type}</td>
                                                <td className="px-4 py-4">
                                                    <p className="flex items-center gap-1.5 text-sm font-medium text-[#3e465b]"><CalendarRange size={14} className="text-[var(--primary)]" />{formatDate(request.startDate)}</p>
                                                    <p className="mt-1 pl-5 text-xs text-[#8a94ad]">to {formatDate(request.endDate)} · {days} {days === 1 ? 'day' : 'days'}</p>
                                                </td>
                                                <td className="px-4 py-4 text-sm leading-5 text-[#52617a]">{request.reason}</td>
                                                <td className="px-4 py-4"><StatusBadge status={request.status} /></td>
                                                <td className="px-5 py-4 text-right">
                                                    {request.status === 'Pending' ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openReview(request)}
                                                            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--primary)] px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                                        >
                                                            <MessageSquare size={14} /> Review
                                                        </button>
                                                    ) : (
                                                        <div className="inline-flex max-w-[150px] items-center justify-end gap-1.5 text-xs text-[#8a94ad]">
                                                            <CheckCircle2 size={14} className="shrink-0" />
                                                            <span>By {request.reviewedBy?.name || 'Branch admin'}</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid gap-3 md:hidden">
                        {visibleRequests.map((request) => {
                            const days = getDurationDays(request.startDate, request.endDate);
                            return (
                                <article key={request._id} className="phoenix-card p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--primary)_9%,white)] font-semibold text-[var(--primary)]">
                                                {request.userId?.name?.charAt(0) || <UserRound size={16} />}
                                            </span>
                                            <div className="min-w-0">
                                                <h2 className="truncate text-sm font-semibold text-[#141824]">{request.userId?.name || 'Staff member'}</h2>
                                                <p className="text-xs capitalize text-[#8a94ad]">{request.userId?.role?.replaceAll('_', ' ') || 'Staff'} · {request.type}</p>
                                            </div>
                                        </div>
                                        <StatusBadge status={request.status} />
                                    </div>
                                    <div className="mt-4 border-t border-[#edf0f5] pt-3">
                                        <p className="flex items-center gap-1.5 text-xs font-medium text-[#52617a]"><CalendarRange size={14} className="text-[var(--primary)]" />{formatDate(request.startDate)} to {formatDate(request.endDate)} · {days} {days === 1 ? 'day' : 'days'}</p>
                                        <p className="mt-2 text-sm leading-5 text-[#52617a]">{request.reason}</p>
                                    </div>
                                    {request.status === 'Pending' ? (
                                        <button type="button" onClick={() => openReview(request)} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] text-xs font-semibold text-white">
                                            <MessageSquare size={14} /> Review request
                                        </button>
                                    ) : (
                                        <p className="mt-4 flex items-center gap-1.5 text-xs text-[#8a94ad]"><CheckCircle2 size={14} />Reviewed by {request.reviewedBy?.name || 'Branch admin'}</p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </>
            )}

            <Modal
                isOpen={Boolean(reviewModal)}
                onClose={closeReview}
                title={reviewModal ? (
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]">
                            <CalendarDays size={19} />
                        </span>
                        <div>
                            <h2 className="text-base font-semibold text-[#141824]">Review leave request</h2>
                            <p className="text-xs font-normal text-[#8a94ad]">Approve or reject this time-off request.</p>
                        </div>
                    </div>
                ) : null}
            >
                {reviewModal && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 border-b border-[#edf0f5] pb-5 sm:grid-cols-2">
                            <div>
                                <p className="text-xs text-[#8a94ad]">Employee</p>
                                <p className="mt-1 text-sm font-semibold text-[#141824]">{reviewModal.userId?.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-[#8a94ad]">Leave type</p>
                                <p className="mt-1 text-sm font-semibold text-[#141824]">{reviewModal.type}</p>
                            </div>
                            <div className="sm:col-span-2">
                                <p className="text-xs text-[#8a94ad]">Dates</p>
                                <p className="mt-1 text-sm font-medium text-[#3e465b]">{formatDate(reviewModal.startDate)} to {formatDate(reviewModal.endDate)}</p>
                            </div>
                            <div className="sm:col-span-2">
                                <p className="text-xs text-[#8a94ad]">Reason</p>
                                <p className="mt-1 text-sm leading-5 text-[#52617a]">{reviewModal.reason}</p>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="review-remarks" className="mb-1.5 block text-xs font-semibold text-[#3e465b]">Review remarks</label>
                            <textarea
                                id="review-remarks"
                                rows="4"
                                placeholder="Add a note for the staff member..."
                                className="w-full resize-none rounded-md border border-[#d8dde7] bg-white p-3 text-sm text-[#141824] outline-none transition-colors focus:border-[var(--primary)]"
                                value={reviewRemarks}
                                onChange={(event) => setReviewRemarks(event.target.value)}
                            />
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-[#edf0f5] pt-4 sm:flex-row sm:justify-end">
                            <Button type="button" variant="ghost" onClick={closeReview} disabled={submitting}>Cancel</Button>
                            <button type="button" onClick={() => handleReview('Rejected')} disabled={submitting} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-4 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50">
                                <X size={15} /> Reject
                            </button>
                            <button type="button" onClick={() => handleReview('Approved')} disabled={submitting} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">
                                <Check size={15} /> {submitting ? 'Saving...' : 'Approve'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default StaffLeavesManager;
