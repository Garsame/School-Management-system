import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CircleDollarSign, FileWarning, UsersRound } from 'lucide-react';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { notify } from '../../components/feedback/notificationService';

const Metric = ({ label, value, detail, icon: Icon }) => <article className="phoenix-card flex min-h-[108px] items-center gap-4 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]"><Icon size={19} /></span><div><p className="text-xs font-semibold text-[#6e7891]">{label}</p><p className="mt-1 text-xl font-bold text-[#141824]">{value}</p><p className="mt-0.5 text-[11px] text-[#8a94ad]">{detail}</p></div></article>;

const Dashboard = () => {
    const [data, setData] = useState({ employees: [], payrolls: [], leaves: [] });
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        Promise.all([api.get('/hr/employees'), api.get('/hr/payroll'), api.get('/hr/leaves')])
            .then(([employees, payrolls, leaves]) => setData({ employees: employees.data?.data || [], payrolls: payrolls.data?.data || [], leaves: leaves.data?.data || [] }))
            .catch((error) => notify(error.response?.data?.message || 'HR dashboard could not be loaded.', 'error'))
            .finally(() => setLoading(false));
    }, []);
    const summary = useMemo(() => ({
        active: data.employees.filter((item) => item.isActive).length,
        missing: data.employees.filter((item) => Number(item.employmentInfo?.basicSalary || 0) <= 0).length,
        pendingLeave: data.leaves.filter((item) => item.status === 'Pending').length,
        pendingPayroll: data.payrolls.filter((item) => item.status !== 'Paid').reduce((sum, item) => sum + Number(item.netSalary || 0), 0),
        currency: data.payrolls[0]?.currency || data.employees.find((item) => item.employmentInfo?.currency)?.employmentInfo.currency || 'USD'
    }), [data]);
    if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Spinner size="lg" /></div>;
    return <div className="space-y-4">
        <div className="phoenix-page-header"><div><h1 className="phoenix-page-title">HR overview</h1><p className="phoenix-page-subtitle">Monitor staffing, compensation readiness, leave, and payroll.</p></div></div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active employees" value={summary.active} detail={`${data.employees.length} employee records`} icon={UsersRound} />
            <Metric label="Missing salary profiles" value={summary.missing} detail="Require compensation setup" icon={FileWarning} />
            <Metric label="Leave awaiting review" value={summary.pendingLeave} detail="Pending staff requests" icon={CalendarClock} />
            <Metric label="Pending payroll" value={`${summary.currency} ${summary.pendingPayroll.toLocaleString()}`} detail="Generated but not paid" icon={CircleDollarSign} />
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
            <article className="phoenix-card"><div className="phoenix-card-header"><div><h2 className="phoenix-section-title">Payroll workflow</h2><p className="phoenix-section-copy">Current records by processing stage.</p></div></div><div className="phoenix-card-body space-y-3">{['Draft','Reviewed','Approved','Paid'].map((status) => { const rows=data.payrolls.filter((item)=>item.status===status); return <div key={status} className="flex items-center justify-between border-b border-[#edf0f5] pb-3 last:border-0 last:pb-0"><span className="text-sm font-semibold text-[#3e465b]">{status}</span><span className="text-sm font-bold text-[#141824]">{rows.length}</span></div>; })}</div></article>
            <article className="phoenix-card"><div className="phoenix-card-header"><div><h2 className="phoenix-section-title">Workforce by role</h2><p className="phoenix-section-copy">Active staff distribution.</p></div></div><div className="phoenix-card-body space-y-3">{Object.entries(data.employees.filter((item)=>item.isActive).reduce((counts,item)=>({...counts,[item.role]:(counts[item.role]||0)+1}),{})).map(([role,count]) => <div key={role} className="flex items-center justify-between border-b border-[#edf0f5] pb-3 last:border-0 last:pb-0"><span className="text-sm font-semibold capitalize text-[#3e465b]">{role.replaceAll('_',' ')}</span><span className="text-sm font-bold text-[#141824]">{count}</span></div>)}</div></article>
        </section>
    </div>;
};
export default Dashboard;
