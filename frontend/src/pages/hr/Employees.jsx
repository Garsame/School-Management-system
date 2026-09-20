import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BriefcaseBusiness, Clock3, CreditCard, Send, Search, UserRound, UsersRound, X } from 'lucide-react';
import api from '../../services/api';
import { Button, Spinner } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const defaults = {
    basicSalary: 0,
    allowance: 0,
    deductions: 0,
    currency: 'USD',
    employmentType: '',
    hireDate: '',
    paymentMethod: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    mobileMoneyNumber: ''
};
const employmentTypes = ['', 'Permanent', 'Contract', 'Part-time', 'Temporary', 'Volunteer'];
const paymentMethods = ['', 'Bank', 'Mobile Money', 'Cash', 'Other'];

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [query, setQuery] = useState('');
    const [branch, setBranch] = useState('');
    const [editing, setEditing] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { user } = useAuth();

    const load = useCallback(async () => {
        setLoading(true);
        try { const res = await api.get('/hr/employees'); setEmployees(res.data?.data || []); }
        catch (error) { notify(error.response?.data?.message || 'Employees could not be loaded.', 'error'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const branches = useMemo(() => [...new Set(employees.map((item) => item.branchId?.name || 'Head office'))].sort(), [employees]);
    const visible = useMemo(() => employees.filter((item) => {
        const matchesQuery = `${item.name} ${item.employeeId || ''} ${item.role}`.toLowerCase().includes(query.toLowerCase());
        return matchesQuery && (!branch || (item.branchId?.name || 'Head office') === branch);
    }), [employees, query, branch]);
    const missingSalary = employees.filter((item) => Number(item.employmentInfo?.basicSalary || 0) <= 0).length;

    const modalOpen = Boolean(editing);
    useEffect(() => {
        if (!modalOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !saving) setEditing(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [modalOpen, saving]);

    const open = (employee) => {
        const employmentInfo = employee.employmentInfo || {};
        const pendingRequest = employee.pendingCompensationRequest || null;
        const source = pendingRequest?.proposedCompensation || employmentInfo;
        setEditing({
            id: employee._id,
            name: employee.name,
            employeeId: employee.employeeId || employee.email,
            role: employee.role,
            branchName: employee.branchId?.name || 'Head office',
            isPending: Boolean(pendingRequest),
            requestReason: pendingRequest?.reason || '',
            reason: '',
            ...defaults,
            ...source,
            hireDate: source.hireDate ? String(source.hireDate).slice(0, 10) : ''
        });
    };
    const updateField = (field, value) => setEditing((current) => ({ ...current, [field]: value }));
    const close = () => {
        if (!saving) setEditing(null);
    };
    const save = async (event) => {
        event?.preventDefault();
        setSaving(true);
        try {
            const compensationFields = ['employmentType', 'hireDate', 'basicSalary', 'allowance', 'deductions', 'currency', 'paymentMethod', 'bankName', 'accountName', 'accountNumber', 'mobileMoneyNumber'];
            const payload = Object.fromEntries(compensationFields.map((field) => [
                field,
                ['employmentType', 'hireDate', 'paymentMethod'].includes(field) && editing[field] === '' ? null : editing[field]
            ]));
            payload.reason = editing.reason;
            await api.put(`/hr/employees/${editing.id}/compensation`, payload);
            notify('Compensation change submitted for Finance approval.', 'success');
            setEditing(null);
            await load();
        } catch (error) { notify(error.response?.data?.message || 'Employee update failed.', 'error'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Spinner size="lg" /></div>;
    return <div className="space-y-4">
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Employees</h1><p className="phoenix-page-subtitle">View approved compensation and submit changes for Finance approval.</p></div><div className="flex items-center gap-2 rounded-md border border-[#d8dde7] bg-white px-3 py-2 text-xs text-[#52617a]"><UsersRound size={15} className="text-[var(--primary)]"/><strong className="text-[#141824]">{employees.length}</strong> employees</div></div>

        <section className="phoenix-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <label className="relative block flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#8a94ad]" size={15}/><input className="phoenix-control !pl-9" placeholder="Search name, ID, or role" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
            <select className="phoenix-control sm:!w-52" value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">All locations</option>{branches.map((name) => <option key={name}>{name}</option>)}</select>
            {missingSalary > 0 && <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle size={14}/>{missingSalary} missing salary</span>}
        </section>

        {visible.length === 0 ? (
            <section className="phoenix-card p-8 text-center"><p className="text-sm font-semibold text-[#52617a]">No employees match these filters.</p></section>
        ) : (
            <article className="phoenix-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                        <thead className="bg-[#f7f8fb]"><tr className="border-b border-[#e3e6ed] text-xs font-semibold text-[#52617a]"><th className="px-5 py-3.5">Employee</th><th className="px-4 py-3.5">Role</th><th className="px-4 py-3.5">Location</th><th className="px-4 py-3.5">Basic salary</th><th className="px-4 py-3.5">Recurring net</th><th className="px-4 py-3.5">Change status</th><th className="px-5 py-3.5 text-right">Profile</th></tr></thead>
                        <tbody className="divide-y divide-[#edf0f5]">
                            {visible.map((employee) => {
                                const info = employee.employmentInfo || {};
                                const currency = info.currency || 'USD';
                                const net = Number(info.basicSalary || 0) + Number(info.allowance || 0) - Number(info.deductions || 0);
                                const pending = employee.pendingCompensationRequest;
                                const isOwnAccount = String(employee._id) === String(user?._id || user?.id);
                                return (
                                    <tr key={employee._id} className="hover:bg-[#fafbfc]">
                                        <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]"><UserRound size={16} /></span><div><p className="text-sm font-semibold text-[#141824]">{employee.name}</p><p className="mt-0.5 text-xs text-[#8a94ad]">{employee.employeeId || employee.email}</p></div></div></td>
                                        <td className="px-4 py-4 text-sm font-medium capitalize text-[#3e465b]">{employee.role.replaceAll('_', ' ')}</td>
                                        <td className="px-4 py-4 text-sm text-[#52617a]">{employee.branchId?.name || 'Head office'}</td>
                                        <td className="px-4 py-4 text-sm text-[#3e465b]">{currency} {Number(info.basicSalary || 0).toLocaleString()}</td>
                                        <td className="px-4 py-4 text-sm font-bold text-[#141824]">{currency} {net.toLocaleString()}</td>
                                        <td className="px-4 py-4">{pending ? <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><Clock3 size={13} />Pending Finance</span> : <span className="text-xs text-[#8a94ad]">No pending change</span>}</td>
                                        <td className="px-5 py-4 text-right">{isOwnAccount ? <span className="text-xs font-medium text-[#8a94ad]">Own account</span> : (pending || hasPermission(user, 'hr.employees.update')) ? <Button size="sm" variant="outline" onClick={() => open(employee)}>{pending ? 'View request' : 'Request change'}</Button> : <span className="text-xs font-medium text-[#8a94ad]">View only</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </article>
        )}

        {editing && (
            <div className="phoenix-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="employee-edit-title">
                <button type="button" className="phoenix-modal-scrim" onClick={close} aria-label="Close compensation profile" />
                <div className="phoenix-modal-panel max-w-2xl">
                    <div className="phoenix-modal-header">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                                <BriefcaseBusiness size={18} />
                            </span>
                            <div className="min-w-0">
                                <h2 id="employee-edit-title" className="phoenix-section-title">{editing.isPending ? 'Pending compensation request' : 'Request compensation change'}</h2>
                                <p className="phoenix-section-copy truncate">{editing.isPending ? 'Awaiting Finance Director review' : 'Approved values remain active until Finance approval'}</p>
                            </div>
                        </div>
                        <button type="button" className="phoenix-icon-button shrink-0" onClick={close} disabled={saving} aria-label="Close dialog" title="Close">
                            <X size={17} />
                        </button>
                    </div>

                    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="phoenix-modal-body custom-scrollbar space-y-6">
                            <section className="flex flex-col gap-3 rounded-md border border-[#e3e6ed] bg-[#f7f8fb] p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-[var(--primary)] shadow-sm"><UserRound size={17} /></span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[#141824]">{editing.name}</p>
                                        <p className="mt-0.5 truncate text-xs text-[#8a94ad]">{editing.employeeId}</p>
                                    </div>
                                </div>
                                <div className="sm:text-right">
                                    <p className="text-xs font-medium capitalize text-[#3e465b]">{editing.role.replaceAll('_', ' ')}</p>
                                    <p className="mt-0.5 text-xs text-[#8a94ad]">{editing.branchName}</p>
                                </div>
                            </section>

                            {editing.isPending && (
                                <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
                                    <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><Clock3 size={15} />Waiting for Finance approval</p>
                                    <p className="mt-2 text-xs leading-5 text-amber-700"><strong>Reason:</strong> {editing.requestReason}</p>
                                </section>
                            )}

                            <fieldset disabled={editing.isPending} className="space-y-6">
                            <section>
                                <div className="mb-3">
                                    <h3 className="text-sm font-semibold text-[#141824]">Employment terms</h3>
                                    <p className="mt-0.5 text-xs text-[#8a94ad]">Contract type and employment start date.</p>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label><span className="phoenix-field-label">Employment type</span><select className="phoenix-control mt-1.5" value={editing.employmentType} onChange={(event) => updateField('employmentType', event.target.value)}>{employmentTypes.map((value) => <option key={value} value={value}>{value || 'Not set'}</option>)}</select></label>
                                    <label><span className="phoenix-field-label">Hire date</span><input type="date" className="phoenix-control mt-1.5" value={editing.hireDate} onChange={(event) => updateField('hireDate', event.target.value)} /></label>
                                </div>
                            </section>

                            <section className="border-t border-[#edf0f5] pt-5">
                                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                    <div><h3 className="text-sm font-semibold text-[#141824]">Recurring compensation</h3><p className="mt-0.5 text-xs text-[#8a94ad]">These amounts are used for future payroll runs.</p></div>
                                    <p className="text-xs text-[#52617a]">Net recurring: <strong className="text-[#141824]">{editing.currency || 'USD'} {(Number(editing.basicSalary || 0) + Number(editing.allowance || 0) - Number(editing.deductions || 0)).toLocaleString()}</strong></p>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label><span className="phoenix-field-label">Basic salary</span><input required type="number" min="0" step="0.01" className="phoenix-control mt-1.5" value={editing.basicSalary} onChange={(event) => updateField('basicSalary', event.target.value)} /></label>
                                    <label><span className="phoenix-field-label">Currency</span><input required maxLength="3" className="phoenix-control mt-1.5 uppercase" value={editing.currency} onChange={(event) => updateField('currency', event.target.value.toUpperCase())} /></label>
                                    <label><span className="phoenix-field-label">Recurring allowance</span><input type="number" min="0" step="0.01" className="phoenix-control mt-1.5" value={editing.allowance} onChange={(event) => updateField('allowance', event.target.value)} /></label>
                                    <label><span className="phoenix-field-label">Recurring deductions</span><input type="number" min="0" step="0.01" className="phoenix-control mt-1.5" value={editing.deductions} onChange={(event) => updateField('deductions', event.target.value)} /></label>
                                </div>
                            </section>

                            <section className="border-t border-[#edf0f5] pt-5">
                                <div className="mb-3 flex items-center gap-2"><CreditCard size={16} className="text-[var(--primary)]" /><h3 className="text-sm font-semibold text-[#141824]">Payment details</h3></div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <label><span className="phoenix-field-label">Payment method</span><select className="phoenix-control mt-1.5" value={editing.paymentMethod} onChange={(event) => updateField('paymentMethod', event.target.value)}>{paymentMethods.map((value) => <option key={value} value={value}>{value || 'Not set'}</option>)}</select></label>
                                    {editing.paymentMethod === 'Bank' && <label><span className="phoenix-field-label">Bank name</span><input className="phoenix-control mt-1.5" value={editing.bankName} onChange={(event) => updateField('bankName', event.target.value)} /></label>}
                                    {editing.paymentMethod === 'Bank' && <label><span className="phoenix-field-label">Account name</span><input className="phoenix-control mt-1.5" value={editing.accountName} onChange={(event) => updateField('accountName', event.target.value)} /></label>}
                                    {editing.paymentMethod === 'Bank' && <label><span className="phoenix-field-label">Account number</span><input className="phoenix-control mt-1.5" value={editing.accountNumber} onChange={(event) => updateField('accountNumber', event.target.value)} /></label>}
                                    {editing.paymentMethod === 'Mobile Money' && <label><span className="phoenix-field-label">Mobile money number</span><input type="tel" className="phoenix-control mt-1.5" placeholder="e.g. +252 61 234 5678" value={editing.mobileMoneyNumber} onChange={(event) => updateField('mobileMoneyNumber', event.target.value)} /></label>}
                                </div>
                            </section>
                            </fieldset>

                            {!editing.isPending && (
                                <section className="border-t border-[#edf0f5] pt-5">
                                    <label htmlFor="compensation-reason" className="phoenix-field-label">Reason for change</label>
                                    <textarea id="compensation-reason" required maxLength="500" rows="3" className="phoenix-control mt-1.5 !h-auto resize-none py-2.5" placeholder="Explain why this compensation change is required" value={editing.reason} onChange={(event) => updateField('reason', event.target.value)} />
                                    <p className="mt-1.5 text-xs text-[#8a94ad]">Finance Director will see this reason when reviewing the request.</p>
                                </section>
                            )}
                        </div>

                        <div className="phoenix-modal-footer">
                            <Button type="button" variant="ghost" onClick={close} disabled={saving}>{editing.isPending ? 'Close' : 'Cancel'}</Button>
                            {!editing.isPending && hasPermission(user, 'hr.employees.update') && <Button type="submit" disabled={saving} className="gap-2"><Send size={15} />{saving ? 'Submitting...' : 'Submit for approval'}</Button>}
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>;
};
export default Employees;
