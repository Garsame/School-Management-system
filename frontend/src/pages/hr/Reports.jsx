import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Building2, CheckCircle2, Clock3 } from 'lucide-react';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';

const Reports = () => {
    const [payrolls, setPayrolls] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => { api.get('/hr/payroll').then((res) => setPayrolls(res.data?.data || [])).catch((error) => notify(error.response?.data?.message || 'Payroll report could not be loaded.', 'error')).finally(() => setLoading(false)); }, []);
    const totals = useMemo(() => payrolls.reduce((result, row) => ({ gross: result.gross + Number(row.basicSalary || 0) + Number(row.allowances || 0), deductions: result.deductions + Number(row.deductions || 0), paid: result.paid + (row.status === 'Paid' ? Number(row.netSalary || 0) : 0), pending: result.pending + (row.status !== 'Paid' ? Number(row.netSalary || 0) : 0) }), { gross: 0, deductions: 0, paid: 0, pending: 0 }), [payrolls]);
    const byBranch = useMemo(() => Object.values(payrolls.reduce((groups, row) => { const name=row.branchId?.name || 'Head office'; groups[name] ||= { name, count: 0, total: 0 }; groups[name].count += 1; groups[name].total += Number(row.netSalary || 0); return groups; }, {})), [payrolls]);
    const currency = payrolls[0]?.currency || 'USD';
    if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Spinner size="lg" /></div>;
    return <div className="space-y-4">
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">Payroll reports</h1><p className="phoenix-page-subtitle">Review payroll cost, deductions, disbursement, and branch totals.</p></div></div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[[Banknote,'Gross payroll',totals.gross],[Clock3,'Pending payout',totals.pending],[CheckCircle2,'Paid payroll',totals.paid],[Building2,'Deductions',totals.deductions]].map(([Icon,label,value]) => <article key={label} className="phoenix-card p-4"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]"><Icon size={17}/></span><p className="mt-3 text-xs font-semibold text-[#6e7891]">{label}</p><p className="mt-1 text-lg font-bold text-[#141824]">{currency} {value.toLocaleString()}</p></article>)}</section>
        <article className="phoenix-card overflow-hidden"><div className="phoenix-card-header"><div><h2 className="phoenix-section-title">Payroll by location</h2><p className="phoenix-section-copy">All generated payroll records.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="bg-[#f7f8fb] text-xs font-semibold text-[#52617a]"><tr><th className="px-5 py-3.5">Location</th><th className="px-5 py-3.5">Payroll records</th><th className="px-5 py-3.5 text-right">Net payroll</th></tr></thead><tbody className="divide-y divide-[#edf0f5]">{byBranch.map((row)=><tr key={row.name}><td className="px-5 py-4 text-sm font-semibold text-[#141824]">{row.name}</td><td className="px-5 py-4 text-sm text-[#52617a]">{row.count}</td><td className="px-5 py-4 text-right text-sm font-bold text-[#141824]">{currency} {row.total.toLocaleString()}</td></tr>)}</tbody></table></div></article>
    </div>;
};
export default Reports;
