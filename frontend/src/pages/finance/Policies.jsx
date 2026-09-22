import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CreditCard, Loader2, Save, ShieldCheck } from 'lucide-react';
import { fetchFeeStructures, getFinancePolicies, setFeeStructureOpen, updateFinancePolicies } from '../../services/api/finance.api';
import { getAcademicYears } from '../../services/api/tenant.api';
import { Badge, Button, Switch } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { feeTarget, isOpen, money, monthlyTotal, needsMonthlyAmount } from '../../utils/feeStructures';

const asList = (value) => (Array.isArray(value) ? value : []);

const Policies = () => {
    const { user } = useAuth();
    const canChange = hasPermission(user, 'finance.policies.update');
    const [years, setYears] = useState([]);
    const [yearId, setYearId] = useState('');
    const [structures, setStructures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(null);
    const [dueDay, setDueDay] = useState(10);
    const [savedDueDay, setSavedDueDay] = useState(10);
    const [savingDueDay, setSavingDueDay] = useState(false);

    useEffect(() => {
        getFinancePolicies()
            .then((policy) => {
                const day = Number(policy?.dueDay) || 10;
                setDueDay(day);
                setSavedDueDay(day);
            })
            .catch(() => notify('Could not load the finance policy', 'error'));
    }, []);

    const saveDueDay = async () => {
        const day = Number(dueDay);
        if (!Number.isInteger(day) || day < 1 || day > 28) {
            notify('Choose a day from 1 to 28', 'error');
            return;
        }
        setSavingDueDay(true);
        try {
            await updateFinancePolicies({ dueDay: day });
            setSavedDueDay(day);
            notify(`Bills are now due on day ${day} of their month`, 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Could not save the due day', 'error');
        } finally {
            setSavingDueDay(false);
        }
    };

    useEffect(() => {
        getAcademicYears()
            .then((data) => {
                const list = asList(data);
                setYears(list);
                setYearId((list.find((year) => year.isCurrent) || list[0])?._id || '');
                if (!list.length) setLoading(false);
            })
            .catch(() => {
                notify('Could not load academic years', 'error');
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!yearId) return;
        setLoading(true);
        fetchFeeStructures({ academicYearId: yearId })
            .then((data) => setStructures(asList(data)))
            .catch(() => notify('Could not load fee structures', 'error'))
            .finally(() => setLoading(false));
    }, [yearId]);

    const toggle = async (structure, open) => {
        setSwitching(structure._id);
        try {
            await setFeeStructureOpen(structure._id, open);
            setStructures((current) => current.map((item) => (item._id === structure._id ? { ...item, isOpen: open } : item)));
            notify(`${structure.name} is ${open ? 'open' : 'closed'}`, 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Could not change the fee structure', 'error');
        } finally {
            setSwitching(null);
        }
    };

    const openCount = structures.filter(isOpen).length;

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <div className="phoenix-page-header">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[var(--primary-soft)] p-2 text-[var(--primary)]">
                        <ShieldCheck size={18} />
                    </div>
                    <div>
                        <h1 className="phoenix-page-title">Finance policy</h1>
                        <p className="phoenix-page-subtitle">The rules finance works by.</p>
                    </div>
                </div>
            </div>

            <article className="phoenix-card">
                <div className="phoenix-card-body flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-[var(--primary-soft)] p-2 text-[var(--primary)]"><CalendarClock size={18} /></div>
                        <div>
                            <h2 className="phoenix-section-title">Due date</h2>
                            <p className="phoenix-section-copy max-w-xl">
                                Each month&apos;s bill is due on this day of that month. After it, an unpaid bill shows as <strong>late</strong> to
                                finance and a warning appears on the parent&apos;s page. Part payments are always accepted.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            Day
                            <input
                                type="number"
                                min="1"
                                max="28"
                                className="phoenix-control !h-9 !w-20"
                                value={dueDay}
                                disabled={!canChange}
                                onChange={(event) => setDueDay(event.target.value)}
                            />
                        </label>
                        {canChange && (
                            <Button onClick={saveDueDay} disabled={savingDueDay || Number(dueDay) === savedDueDay} className="flex items-center gap-2 !h-9 text-xs">
                                <Save size={14} /> {savingDueDay ? 'Saving...' : 'Save'}
                            </Button>
                        )}
                    </div>
                </div>
            </article>

            <article className="phoenix-card">
                <div className="phoenix-card-header flex-wrap gap-3">
                    <div>
                        <h2 className="phoenix-section-title">Fee structures used for billing</h2>
                        <p className="phoenix-section-copy max-w-xl">
                            When you generate a month&apos;s invoices, only <strong>open</strong> fee structures are used.
                            Closing one stops new invoices from it. Invoices already made stay as they are.
                        </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Year
                        <select className="phoenix-control !h-9 !w-auto" value={yearId} onChange={(event) => setYearId(event.target.value)}>
                            {years.map((year) => <option key={year._id} value={year._id}>{year.name}{year.isCurrent ? ' (current)' : ''}</option>)}
                        </select>
                    </label>
                </div>

                <div className="phoenix-card-body">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-[var(--primary)]" /></div>
                    ) : structures.length === 0 ? (
                        <div className="phoenix-empty-state">
                            <CreditCard size={28} />
                            <p>No fee structures for this year yet. <Link className="font-semibold text-[var(--primary)] hover:underline" to="/finance/fee-structures">Create one</Link>.</p>
                        </div>
                    ) : (
                        <>
                            <p className="mb-3 text-xs font-semibold text-slate-500">{openCount} open · {structures.length - openCount} closed</p>
                            <div className="overflow-x-auto rounded-lg border border-[#e3e6ed]">
                                <table className="w-full border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-4 py-2.5">Fee structure</th>
                                            <th className="px-4 py-2.5">Applies to</th>
                                            <th className="px-4 py-2.5 text-right">Monthly fee</th>
                                            <th className="px-4 py-2.5 text-right">Open</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e3e6ed]">
                                        {structures.map((structure) => {
                                            const open = isOpen(structure);
                                            return (
                                                <tr key={structure._id} className={open ? '' : 'bg-slate-50'}>
                                                    <td className="px-4 py-3">
                                                        <p className={`font-semibold ${open ? 'text-slate-800' : 'text-slate-500'}`}>{structure.name}</p>
                                                        {needsMonthlyAmount(structure) && (
                                                            <Link to="/finance/fee-structures" className="mt-1 inline-block">
                                                                <Badge variant="warning" className="!py-0.5 text-[10px]">Needs a monthly amount, not billed yet</Badge>
                                                            </Link>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600">{feeTarget(structure)}</td>
                                                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                                                        {needsMonthlyAmount(structure) ? '—' : money(monthlyTotal(structure))}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <span className={`text-xs font-semibold ${open ? 'text-emerald-700' : 'text-slate-500'}`}>{open ? 'Open' : 'Closed'}</span>
                                                            <Switch
                                                                checked={open}
                                                                onChange={(next) => toggle(structure, next)}
                                                                disabled={!canChange || switching === structure._id}
                                                                label={`${structure.name} open for billing`}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </article>
        </div>
    );
};

export default Policies;
