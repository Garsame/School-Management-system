import React, { useCallback, useState, useEffect } from 'react';
import { exportPaymentsCsv, getPayments } from '../../services/api/finance.api';
import { getBranches, getAcademicYears } from '../../services/api/tenant.api';
import { Select, Badge, Button, Input } from '../../components/ui';
import { Download, Loader2, Search } from 'lucide-react';
import FinanceFilterBar from '../../components/finance/FinanceFilterBar';

const EMPTY_FILTERS = { branchId: '', academicYearId: '', method: '', status: '', q: '', from: '', to: '' };

const Payments = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);

    useEffect(() => {
        fetchLookups();
    }, []);

    const fetchLookups = async () => {
        try {
            const [b, y] = await Promise.all([getBranches(), getAcademicYears()]);
            if (Array.isArray(b)) {
                setBranches(b.map(i => ({ label: i.name, value: i._id })));
            }
            if (Array.isArray(y)) setYears(y.map(i => ({ label: i.name, value: i._id })));
        } catch (e) {
            console.error(e);
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPayments(filters);
            setPayments(Array.isArray(data) ? data : (data?.data || data || []));
        } catch (e) {
            console.error(e);
            setPayments([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const downloadCsv = async () => {
        const response = await exportPaymentsCsv(filters);
        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a'); link.href = url; link.download = 'payments.csv'; link.click(); URL.revokeObjectURL(url);
    };

    const netCollected = payments.reduce((sum, payment) => sum + (payment.status === 'REVERSAL' ? -Math.abs(payment.amount || 0) : Number(payment.amount || 0)), 0);

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Transaction history</h1>
                    <p className="phoenix-page-subtitle">Read-only ledger of all received student payments.</p>
                </div>
                <Button variant="outline" onClick={downloadCsv}><Download size={16}/> Export CSV</Button>
            </div>

            <FinanceFilterBar activeCount={Object.values(filters).filter(Boolean).length} loading={loading} resultLabel={`${payments.length} payments`} onApply={() => setFilters(draftFilters)} onReset={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}>
                    <Select 
                        label="Branch"
                        options={branches}
                        value={draftFilters.branchId}
                        onChange={e => setDraftFilters({...draftFilters, branchId: e.target.value})}
                        placeholder="All campuses"
                    />
                    <Select 
                        label="Method"
                        options={[
                            { label: 'Cash', value: 'CASH' },
                            { label: 'EVC Plus', value: 'EVC_PLUS' },
                            { label: 'Zaad', value: 'ZAAD' },
                            { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
                            { label: 'Card / POS', value: 'CARD' },
                            { label: 'Other', value: 'OTHER' }
                        ]}
                        value={draftFilters.method}
                        onChange={e => setDraftFilters({...draftFilters, method: e.target.value})}
                        placeholder="All methods"
                    />
                    <Select label="Academic year" options={years} value={draftFilters.academicYearId} onChange={e => setDraftFilters({...draftFilters, academicYearId: e.target.value})} placeholder="All academic years" />
                    <Select label="Status" options={[{ label: 'Active', value: 'ACTIVE' }, { label: 'Reversal', value: 'REVERSAL' }, { label: 'Pending', value: 'PENDING' }]} value={draftFilters.status} onChange={e => setDraftFilters({...draftFilters, status: e.target.value})} placeholder="All statuses" />
                    <Input label="Student / receipt / reference" icon={<Search size={16}/>} value={draftFilters.q} onChange={e => setDraftFilters({...draftFilters, q: e.target.value})} placeholder="Search ledger" />
                    <Input 
                        type="date" 
                        label="From Date"
                        value={draftFilters.from}
                        onChange={e => setDraftFilters({...draftFilters, from: e.target.value})}
                    />
                    <Input 
                        type="date" 
                        label="To Date"
                        value={draftFilters.to}
                        min={draftFilters.from || undefined}
                        onChange={e => setDraftFilters({...draftFilters, to: e.target.value})}
                    />
            </FinanceFilterBar>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><article className="phoenix-card p-5"><p className="text-xs font-semibold text-slate-500">Filtered transactions</p><p className="mt-2 text-2xl font-bold">{payments.length}</p></article><article className="phoenix-card p-5"><p className="text-xs font-semibold text-slate-500">Net collected</p><p className="mt-2 text-2xl font-bold text-emerald-700">${netCollected.toLocaleString()}</p></article><article className="phoenix-card p-5"><p className="text-xs font-semibold text-slate-500">Reversals</p><p className="mt-2 text-2xl font-bold text-rose-700">{payments.filter(item => item.status === 'REVERSAL').length}</p></article></div>

            <div className="phoenix-table-shell">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr>
                                <th className="px-4 py-3 text-left">Receipt ID</th>
                                <th className="px-4 py-3 text-left">Invoice Ref</th>
                                <th className="px-4 py-3 text-left">Student</th>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Method</th>
                                <th className="px-4 py-3 text-left">Reference</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {loading ? (
                                 <tr>
                                     <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                                         <div className="flex items-center justify-center gap-2">
                                             <Loader2 size={16} className="animate-spin" /> Loading ledger...
                                         </div>
                                     </td>
                                 </tr>
                            ) : payments.length === 0 ? (
                                 <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-400">No payments match the selected filters.</td></tr>
                            ) : (
                                payments.map((pay) => (
                                    <tr key={pay._id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-slate-500 text-xs">RCP-{pay._id.slice(-6)}</td>
                                        <td className="px-4 py-3 font-bold text-slate-700">
                                            INV-{typeof pay.invoiceId === 'object' && pay.invoiceId ? pay.invoiceId._id?.slice(-6) : typeof pay.invoiceId === 'string' ? pay.invoiceId.slice(-6) : 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-slate-700">{pay.invoiceId?.studentId ? [pay.invoiceId.studentId.firstName, pay.invoiceId.studentId.middleName, pay.invoiceId.studentId.lastName].filter(Boolean).join(' ') : 'N/A'}<span className="block font-mono text-[10px] text-slate-400">{pay.invoiceId?.studentId?.admissionNumber || ''}</span></td>
                                        <td className="px-4 py-3 text-slate-500">
                                            {new Date(pay.date || pay.createdAt).toLocaleDateString()} {new Date(pay.date || pay.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3"><Badge variant="outline">{pay.method}</Badge></td>
                                        <td className="px-4 py-3 text-slate-500">{pay.reference || '-'}</td>
                                        <td className="px-4 py-3"><Badge variant={pay.status === 'REVERSAL' ? 'danger' : pay.status === 'ACTIVE' ? 'success' : 'warning'}>{pay.status}</Badge></td>
                                        <td className={`px-4 py-3 text-right font-bold ${pay.status === 'REVERSAL' ? 'text-rose-600' : 'text-emerald-600'}`}>{pay.status === 'REVERSAL' ? '-' : '+'}${pay.amount?.toLocaleString()}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Payments;
