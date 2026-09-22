import React, { useCallback, useState, useEffect } from 'react';
import { exportInvoicesCsv, getInvoices } from '../../services/api/finance.api';
import { getBranches, getAcademicYears } from '../../services/api/tenant.api';
import { Select, Badge, Button, Input } from '../../components/ui';
import { Search, Eye, Plus, Loader2, Download } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import FinanceFilterBar from '../../components/finance/FinanceFilterBar';

const EMPTY_FILTERS = { branchId: '', academicYearId: '', status: '', q: '' };

const Invoices = () => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
    
    const navigate = useNavigate();

    useEffect(() => {
        fetchLookups();
    }, []);

    const fetchLookups = async () => {
        try {
            const [b, y] = await Promise.all([getBranches(), getAcademicYears()]);
            if (Array.isArray(b)) {
                setBranches(b.map(i => ({ label: i.name, value: i._id })));
            }
            if (Array.isArray(y)) {
                setYears(y.map(i => ({ label: i.name, value: i._id })));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getInvoices(filters);
            setInvoices(Array.isArray(data) ? data : (data?.data || []));
        } catch (e) {
            console.error(e);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    const downloadCsv = async () => {
        const response = await exportInvoicesCsv(filters);
        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url; link.download = 'invoices.csv'; link.click(); URL.revokeObjectURL(url);
    };

    const totals = invoices.reduce((result, invoice) => {
        result.billed += Number(invoice.totalAmount || 0);
        result.paid += Number(invoice.paidAmount || 0);
        result.balance += Number(invoice.balance ?? ((invoice.totalAmount || 0) - (invoice.paidAmount || 0)));
        if (invoice.status !== 'PAID' && invoice.dueDate && new Date(invoice.dueDate) < new Date()) result.overdue += 1;
        return result;
    }, { billed: 0, paid: 0, balance: 0, overdue: 0 });

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div>
                     <h1 className="phoenix-page-title">Invoice management</h1>
                     <p className="phoenix-page-subtitle">Track and manage student billing records.</p>
                </div>
                <div className="flex gap-2"><Button variant="outline" onClick={downloadCsv}><Download size={16}/> Export CSV</Button><Button onClick={() => navigate('/finance/invoices/generate')} className="flex items-center gap-2 !h-9 text-xs" variant="primary"><Plus size={16}/> Generate Invoice</Button></div>
            </div>

            <FinanceFilterBar activeCount={Object.values(filters).filter(Boolean).length} loading={loading} resultLabel={`${invoices.length} invoices`} onApply={() => setFilters(draftFilters)} onReset={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}>
                    <Select 
                        label="Branch"
                        options={branches}
                        value={draftFilters.branchId}
                        onChange={e => setDraftFilters({...draftFilters, branchId: e.target.value})}
                        placeholder="All campuses"
                    />
                    <Select 
                        label="Academic Year"
                        options={years}
                        value={draftFilters.academicYearId}
                        onChange={e => setDraftFilters({...draftFilters, academicYearId: e.target.value})}
                        placeholder="All academic years"
                    />
                    <Select 
                        label="Status"
                        options={[
                            {label: 'PAID', value: 'PAID'},
                            {label: 'UNPAID', value: 'UNPAID'},
                            {label: 'PARTIALLY_PAID', value: 'PARTIALLY_PAID'},
                            {label: 'VOID', value: 'VOID'},
                        ]}
                        value={draftFilters.status}
                        onChange={e => setDraftFilters({...draftFilters, status: e.target.value})}
                        placeholder="All statuses"
                    />
                    <Input 
                        label="Search Student"
                        placeholder="Name or admission number"
                        icon={<Search size={16} />}
                        value={draftFilters.q}
                        onChange={e => setDraftFilters({...draftFilters, q: e.target.value})}
                    />
            </FinanceFilterBar>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[['Filtered billed', totals.billed, 'text-slate-900'], ['Collected', totals.paid, 'text-emerald-700'], ['Balance due', totals.balance, 'text-rose-700']].map(([label, value, tone]) => <article key={label} className="phoenix-card min-h-[112px] p-5"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-3 text-2xl font-bold ${tone}`}>${value.toLocaleString()}</p></article>)}
                <article className="phoenix-card min-h-[112px] p-5"><p className="text-xs font-semibold text-slate-500">Overdue invoices</p><p className="mt-3 text-2xl font-bold text-amber-700">{totals.overdue}</p></article>
            </section>

            <div className="phoenix-table-shell">
                <div className="overflow-x-auto">
                    <table className="w-full text-left font-medium">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left">Invoice #</th>
                                <th className="px-4 py-3 text-left">Student</th>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Billing Period</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3 text-right">Paid</th>
                                <th className="px-4 py-3 text-right">Balance</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="px-4 py-8 text-center text-slate-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 size={16} className="animate-spin" /> Loading invoices...
                                        </div>
                                    </td>
                                </tr>
                            ) : invoices.length === 0 ? (
                                <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-400">No invoices found matching criteria</td></tr>
                            ) : (
                                invoices.map(inv => {
                                    const balance = (inv.totalAmount || 0) - (inv.paidAmount || 0);
                                    return (
                                        <tr key={inv._id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-4 py-3 text-slate-600 font-mono text-xs">INV-{inv._id.slice(-6)}</td>
                                            <td className="px-4 py-3 text-slate-900 font-bold">
                                                {inv.studentId && typeof inv.studentId === 'object'
                                                    ? <Link to={`/finance/students/${inv.studentId._id}`} className="hover:text-[var(--primary)] hover:underline">{inv.studentId.firstName} {inv.studentId.lastName}</Link>
                                                    : (inv.studentName || 'N/A')}
                                                <span className="block font-mono text-[10px] font-medium text-slate-400">{inv.studentId?.admissionNumber || ''}</span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A'}</td>
                                            <td className="px-4 py-3 text-slate-600">{inv.billingPeriodLabel || 'Annual'}</td>
                                            <td className="px-4 py-3 text-right text-slate-900 font-bold">${inv.totalAmount?.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-emerald-600 font-bold">${inv.paidAmount?.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-rose-500 font-bold">${balance?.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                                                    {inv.status}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button variant="ghost" aria-label="View invoice" title="View invoice" onClick={() => navigate(`/finance/invoices/${inv._id}`)} className="!h-8 !px-2.5">
                                                    <Eye size={16} />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Invoices;
