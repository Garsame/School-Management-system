import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { Button, Spinner } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const statusStyle = {
    Draft: 'border-[#d8dde7] bg-[#f7f8fb] text-[#52617a]',
    Reviewed: 'border-blue-200 bg-blue-50 text-blue-700',
    Approved: 'border-amber-200 bg-amber-50 text-amber-700',
    Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700'
};

const PayrollDashboard = () => {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [payrolls, setPayrolls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [processingId, setProcessingId] = useState(null);
    const { user } = useAuth();

    const fetchPayroll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/hr/payroll', { params: { month, year } });
            setPayrolls(res.data?.data || []);
        } catch (error) {
            notify(error.response?.data?.message || 'Payroll could not be loaded.', 'error');
        } finally { setLoading(false); }
    }, [month, year]);
    useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

    const generate = async () => {
        setGenerating(true);
        try {
            const res = await api.post('/hr/payroll/generate', { month, year });
            const missing = res.data?.data?.missingCompensationProfiles || [];
            notify(
                missing.length
                    ? `Payroll generated. Missing salary: ${missing.map((item) => item.name).join(', ')}`
                    : (res.data?.message || 'Payroll generated.'),
                missing.length ? 'warning' : 'success'
            );
            await fetchPayroll();
        } catch (error) { notify(error.response?.data?.message || 'Payroll generation failed.', 'error'); }
        finally { setGenerating(false); }
    };

    const act = async (id, action) => {
        setProcessingId(id);
        try {
            await api.put(`/hr/payroll/${id}/${action}`);
            notify(`Payroll ${action === 'pay' ? 'marked paid' : `${action}ed`}.`, 'success');
            await fetchPayroll();
        } catch (error) { notify(error.response?.data?.message || `Payroll ${action} failed.`, 'error'); }
        finally { setProcessingId(null); }
    };

    const totals = useMemo(() => payrolls.reduce((result, row) => ({ total: result.total + Number(row.netSalary || 0), paid: result.paid + (row.status === 'Paid' ? Number(row.netSalary || 0) : 0), pending: result.pending + (row.status !== 'Paid' ? Number(row.netSalary || 0) : 0) }), { total: 0, paid: 0, pending: 0 }), [payrolls]);
    const currency = payrolls[0]?.currency || 'USD';

    // Gate on permission, not role: a school decides for itself who approves and who pays.
    // Hardcoding roles here hid the button from anyone the school had granted the permission to.
    const actionFor = (row) => {
        if (row.status === 'Draft' && hasPermission(user, 'payroll.review')) return { label: 'Review', action: 'review' };
        if (row.status === 'Reviewed' && hasPermission(user, 'payroll.approve')) return { label: 'Approve', action: 'approve' };
        if (row.status === 'Approved' && hasPermission(user, 'payroll.pay')) return { label: 'Mark paid', action: 'pay' };
        return null;
    };

    return <div className="space-y-4">
        <div className="phoenix-page-header">
            <div><h1 className="phoenix-page-title">Payroll</h1><p className="phoenix-page-subtitle">Generate, review, approve, and record monthly staff salaries.</p></div>
            <div className="flex flex-wrap items-center gap-2">
                <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="phoenix-control !h-9 !w-auto text-xs">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(0, index).toLocaleString(undefined, { month: 'long' })}</option>)}</select>
                <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="phoenix-control !h-9 !w-auto text-xs">{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((value) => <option key={value}>{value}</option>)}</select>
                {hasPermission(user, 'payroll.generate') && <Button onClick={generate} disabled={generating} className="!h-9 gap-2 text-xs"><RefreshCw size={14} className={generating ? 'animate-spin' : ''} />{generating ? 'Generating' : 'Generate payroll'}</Button>}
            </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
            {[[CircleDollarSign,'Total payroll',totals.total],[CheckCircle2,'Paid',totals.paid],[AlertTriangle,'Pending',totals.pending]].map(([Icon,label,value]) => <article key={label} className="phoenix-card flex items-center gap-4 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]"><Icon size={18}/></span><div><p className="text-xs font-semibold text-[#6e7891]">{label}</p><p className="mt-1 text-lg font-bold text-[#141824]">{currency} {value.toLocaleString()}</p></div></article>)}
        </section>

        {loading ? <div className="flex min-h-[300px] items-center justify-center"><Spinner size="lg" /></div> : payrolls.length === 0 ? <section className="phoenix-card flex min-h-[260px] flex-col items-center justify-center p-8 text-center"><CircleDollarSign size={28} className="text-[var(--primary)]"/><h2 className="mt-3 text-base font-semibold text-[#141824]">No payroll for this period</h2><p className="mt-1 text-sm text-[#6e7891]">Generate payroll after employee salary profiles are complete.</p></section> : <article className="phoenix-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="bg-[#f7f8fb]"><tr className="border-b border-[#e3e6ed] text-xs font-semibold text-[#52617a]"><th className="px-5 py-3.5">Employee</th><th className="px-4 py-3.5">Basic</th><th className="px-4 py-3.5">Allowances</th><th className="px-4 py-3.5">Deductions</th><th className="px-4 py-3.5">Net salary</th><th className="px-4 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#edf0f5]">{payrolls.map((row) => { const action=actionFor(row); return <tr key={row._id} className="hover:bg-[#fafbfc]"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#141824]">{row.userId?.name}</p><p className="mt-0.5 text-xs capitalize text-[#8a94ad]">{row.userId?.role?.replaceAll('_',' ')} · {row.branchId?.name || 'Head office'}</p></td><td className="px-4 py-4 text-sm text-[#3e465b]">{currency} {Number(row.basicSalary).toLocaleString()}</td><td className="px-4 py-4 text-sm text-[#3e465b]">{currency} {Number(row.allowances).toLocaleString()}</td><td className="px-4 py-4 text-sm text-[#3e465b]">{currency} {Number(row.deductions).toLocaleString()}</td><td className="px-4 py-4 text-sm font-bold text-[#141824]">{currency} {Number(row.netSalary).toLocaleString()}</td><td className="px-4 py-4"><span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusStyle[row.status] || statusStyle.Draft}`}>{row.status}</span></td><td className="px-5 py-4 text-right">{action ? <Button size="sm" onClick={() => act(row._id, action.action)} disabled={processingId === row._id}>{processingId === row._id ? 'Saving...' : action.label}</Button> : <span className="text-xs text-[#8a94ad]">{row.status === 'Paid' && row.paidAt ? new Date(row.paidAt).toLocaleDateString() : 'No action'}</span>}</td></tr>; })}</tbody></table></div></article>}
    </div>;
};

export default PayrollDashboard;
