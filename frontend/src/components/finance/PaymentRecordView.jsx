import React from 'react';
import { AlertTriangle, CheckCircle2, Receipt } from 'lucide-react';
import { Badge } from '../ui';
import { money } from '../../utils/feeStructures';

const STATUS = {
    PAID: { label: 'Paid', variant: 'success' },
    PARTIALLY_PAID: { label: 'Part paid', variant: 'warning' },
    UNPAID: { label: 'Not paid', variant: 'danger' }
};

// Due and leaving dates are calendar days stored at UTC midnight; payment times are local.
const shortDate = (value, calendarDay = false) => (value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...(calendarDay ? { timeZone: 'UTC' } : {}) })
    : '—');

const StatusBadge = ({ line }) => {
    const status = STATUS[line.status] || { label: line.status, variant: 'default' };
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            <Badge variant={status.variant} className="!py-0.5 text-[10px]">{status.label}</Badge>
            {line.late && <Badge variant="danger" className="!py-0.5 text-[10px]">Late</Badge>}
        </span>
    );
};

const Card = ({ label, value, sub, tone = 'default' }) => {
    const tones = { default: 'text-slate-900', bad: 'text-rose-700', good: 'text-emerald-700' };
    return (
        <div className="rounded-lg border border-[#e3e6ed] bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
            {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
    );
};

/**
 * One student's fees month by month: this month, what is still owed from earlier months,
 * the total, which months are late, and every payment. Finance, the payments desk and the
 * parent all see this same view; `audience` only changes the wording of the late warning.
 */
const PaymentRecordView = ({ record, audience = 'staff', actions = null }) => {
    if (!record) return null;
    const { student, thisMonth, earlierDebt, totals, months, payments } = record;
    const firstName = student.name.split(' ')[0];

    return (
        <div className="space-y-4">
            <article className="phoenix-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{student.name}</h2>
                        <p className="text-sm text-slate-500">
                            {student.admissionNumber}
                            {student.className ? ` · ${student.className}` : ''}
                            {student.branchName ? ` · ${student.branchName}` : ''}
                        </p>
                        {student.status === 'Left' && (
                            <p className="mt-1 text-xs font-semibold text-slate-600">
                                Left the school{student.leftOn ? ` on ${shortDate(student.leftOn, true)}` : ''}. No new bills are made; earlier bills still count.
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {student.discount?.enabled && (
                            <Badge
                                variant={student.discount.type === 'PERCENTAGE' && student.discount.value >= 100 ? 'success' : 'warning'}
                                className="font-bold"
                            >
                                {student.discount.type === 'PERCENTAGE'
                                    ? (student.discount.value >= 100 ? '100% Scholarship' : `${student.discount.value}% Discount`)
                                    : `-$${student.discount.value} Discount`}
                            </Badge>
                        )}
                        {student.status !== 'Active' && <Badge variant="outline">{student.status}</Badge>}
                        {actions}
                    </div>
                </div>
            </article>

            {totals.late > 0 ? (
                <div role="alert" className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">
                    <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={20} />
                    <div>
                        <p className="font-bold">
                            {audience === 'parent' ? `${firstName}'s fees are late` : 'Late payment'}: {money(totals.late)}
                        </p>
                        <p className="text-sm">
                            {totals.lateMonths.join(', ')} {totals.lateMonths.length === 1 ? 'was' : 'were'} due and {totals.lateMonths.length === 1 ? 'is' : 'are'} not fully paid.
                            {audience === 'parent' ? ' Please pay at the school office.' : ''}
                        </p>
                    </div>
                </div>
            ) : totals.owed === 0 && months.length > 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                    <CheckCircle2 className="shrink-0 text-emerald-600" size={20} />
                    <p className="font-semibold">Everything is paid. Nothing is owed.</p>
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card
                    label={thisMonth ? `This month · ${thisMonth.label}` : 'This month'}
                    value={thisMonth ? money(thisMonth.balance) : '—'}
                    sub={thisMonth ? `Billed ${money(thisMonth.billed)} · paid ${money(thisMonth.paid)}` : 'No bill yet'}
                    tone={thisMonth?.balance > 0 ? 'bad' : 'good'}
                />
                <Card label="Owed from earlier months" value={money(earlierDebt)} tone={earlierDebt > 0 ? 'bad' : 'default'} />
                <Card label="Total owed" value={money(totals.owed)} sub={`Billed ${money(totals.billed)} · paid ${money(totals.paid)} in total`} tone={totals.owed > 0 ? 'bad' : 'good'} />
            </div>

            <article className="phoenix-card">
                <div className="phoenix-card-header"><h3 className="phoenix-section-title">Month by month</h3></div>
                {months.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">No bills yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-2.5">Month</th>
                                    <th className="px-4 py-2.5 text-right">Billed</th>
                                    <th className="px-4 py-2.5 text-right">Paid</th>
                                    <th className="px-4 py-2.5 text-right">Still owed</th>
                                    <th className="px-4 py-2.5">Due</th>
                                    <th className="px-4 py-2.5">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e3e6ed]">
                                {months.map((line) => (
                                    <tr key={line.invoiceId} className={line.late ? 'bg-rose-50/50' : ''}>
                                        <td className="px-4 py-2.5 font-semibold text-slate-800">{line.label}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{money(line.billed)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{money(line.paid)}</td>
                                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${line.balance > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{money(line.balance)}</td>
                                        <td className="px-4 py-2.5 text-slate-600">{shortDate(line.dueDate, true)}</td>
                                        <td className="px-4 py-2.5"><StatusBadge line={line} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </article>

            <article className="phoenix-card">
                <div className="phoenix-card-header"><h3 className="phoenix-section-title">Payments</h3></div>
                {payments.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-slate-500">No payments yet.</p>
                ) : (
                    <ul className="divide-y divide-[#e3e6ed]">
                        {payments.map((payment) => (
                            <li key={payment._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <Receipt size={16} className="text-slate-400" />
                                    <div>
                                        <p className={`text-sm font-semibold ${payment.status === 'REVERSED' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                            {money(payment.amount)} for {payment.monthLabel || 'school fees'}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {shortDate(payment.date)} · {String(payment.method || '').replace(/_/g, ' ')}
                                            {payment.receiptNumber ? ` · Receipt ${payment.receiptNumber}` : ''}
                                            {payment.reference ? ` · Ref ${payment.reference}` : ''}
                                        </p>
                                    </div>
                                </div>
                                {payment.status === 'REVERSED' && <Badge variant="outline" className="!py-0.5 text-[10px]">Reversed</Badge>}
                            </li>
                        ))}
                    </ul>
                )}
            </article>
        </div>
    );
};

export default PaymentRecordView;
