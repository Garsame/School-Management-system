import React, { useCallback, useState, useEffect } from 'react';
import { exportInvoicesCsv, exportOutstandingCsv, exportPaymentsCsv, getRevenueReport } from '../../services/api/finance.api';
import { getBranches, getAcademicYears } from '../../services/api/tenant.api';
import { Select, Button } from '../../components/ui';
import { Download, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { dateStamp, downloadBlob } from '../../utils/download';
import FinanceFilterBar from '../../components/finance/FinanceFilterBar';

const DEFAULT_FILTERS = { branchId: '', academicYearId: '', groupBy: 'branch' };

const Reports = () => {
    const [reportData, setReportData] = useState([]);
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState('');

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
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

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getRevenueReport(filters);
            setReportData(Array.isArray(data) ? data : (data?.data || []));
        } catch (e) {
            console.error(e);
            setReportData([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const totals = reportData.reduce((summary, row) => ({
        billed: summary.billed + Number(row.totalRevenue || 0),
        collected: summary.collected + Number(row.totalPaid || 0),
        outstanding: summary.outstanding + Number(row.totalBalance || 0)
    }), { billed: 0, collected: 0, outstanding: 0 });
    const collectionRate = totals.billed > 0 ? (totals.collected / totals.billed) * 100 : 0;

    const downloadReport = async (type) => {
        setExporting(type);
        try {
            const params = { branchId: filters.branchId, academicYearId: filters.academicYearId };
            const response = type === 'invoices'
                ? await exportInvoicesCsv(params)
                : type === 'payments'
                    ? await exportPaymentsCsv(params)
                    : await exportOutstandingCsv(params);
            downloadBlob(response.data, `${type}_${dateStamp()}.csv`);
        } catch (error) {
            console.error(error);
        } finally {
            setExporting('');
        }
    };

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div>
                     <h1 className="phoenix-page-title">Financial intelligence</h1>
                     <p className="phoenix-page-subtitle">Analyze revenue streams and collection performance.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {['invoices', 'payments', 'debtors'].map((type) => (
                        <Button
                            key={type}
                            type="button"
                            variant="outline"
                            className="flex items-center gap-2 !h-9 text-xs capitalize"
                            onClick={() => downloadReport(type)}
                            disabled={Boolean(exporting)}
                        >
                            {exporting === type ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                            {type}
                        </Button>
                    ))}
                </div>
            </div>

            <FinanceFilterBar activeCount={[filters.branchId, filters.academicYearId].filter(Boolean).length} loading={loading} resultLabel={`${reportData.length} groups`} onApply={() => setFilters(draftFilters)} onReset={() => { setDraftFilters(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS); }}>
                    <Select 
                        label="Primary View (Group By)"
                        options={[
                            { label: 'By Branch', value: 'branch' },
                            { label: 'By Class/Grade', value: 'class' },
                            { label: 'By Academic Year', value: 'year', disabled: Boolean(draftFilters.academicYearId) },
                        ]}
                        value={draftFilters.groupBy}
                        onChange={e => setDraftFilters({...draftFilters, groupBy: e.target.value})}
                    />
                    <Select 
                        label="Filter Branch"
                        options={[{ label: 'All Branches', value: '' }, ...branches]}
                        value={draftFilters.branchId}
                        onChange={e => setDraftFilters({...draftFilters, branchId: e.target.value})}
                    />
                    <Select 
                        label="Filter Year"
                        options={[{ label: 'All Years', value: '' }, ...years]}
                        value={draftFilters.academicYearId}
                        onChange={e => setDraftFilters({...draftFilters, academicYearId: e.target.value, groupBy: e.target.value && draftFilters.groupBy === 'year' ? 'branch' : draftFilters.groupBy})}
                    />
            </FinanceFilterBar>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[['Billed', totals.billed, 'text-blue-700'], ['Collected', totals.collected, 'text-emerald-700'], ['Outstanding', totals.outstanding, 'text-rose-700']].map(([label, value, tone]) => <article key={label} className="phoenix-card p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>${value.toLocaleString()}</p></article>)}
                <article className="phoenix-card p-4"><p className="text-xs font-semibold text-slate-500">Collection rate</p><p className={`mt-1 text-2xl font-bold ${collectionRate < 50 ? 'text-rose-700' : collectionRate < 75 ? 'text-amber-700' : 'text-emerald-700'}`}>{collectionRate.toFixed(1)}%</p></article>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                 {/* Chart Section */}
                 <article className="phoenix-card h-96 flex flex-col">
                     <div className="phoenix-card-header">
                         <div>
                             <h2 className="phoenix-section-title">Revenue Visualization</h2>
                             <p className="phoenix-section-copy">Graphical representation of fee statuses.</p>
                         </div>
                     </div>
                     <div className="flex-1 min-h-0 p-4">
                         {loading ? (
                             <div className="flex h-full items-center justify-center">
                                 <Loader2 className="animate-spin text-[var(--primary)]" size={24} />
                             </div>
                         ) : reportData.length === 0 ? (
                             <div className="flex h-full items-center justify-center text-slate-400 text-xs font-semibold">
                                 No visualization data available
                             </div>
                         ) : (
                             <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reportData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e6ed" />
                                    <XAxis dataKey="_id" tick={{fontSize: 10, fill: '#6e7891'}} interval={0} angle={-30} textAnchor="end" height={50} stroke="#cbd0dd" />
                                    <YAxis tick={{fontSize: 10, fill: '#6e7891'}} stroke="#cbd0dd" />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '6px', border: '1px solid #cbd0dd', boxShadow: 'none', fontSize: '11px' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                                    <Bar dataKey="totalRevenue" name="Billed" fill="var(--primary, #3874ff)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="totalPaid" name="Collected" fill="#25b003" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="totalBalance" name="Outstanding" fill="#e63757" radius={[4, 4, 0, 0]} />
                                </BarChart>
                             </ResponsiveContainer>
                         )}
                     </div>
                 </article>

                 {/* Tabular Data */}
                 <article className="phoenix-card h-96 flex flex-col">
                     <div className="phoenix-card-header">
                         <div>
                             <h2 className="phoenix-section-title">Detailed Breakdown</h2>
                             <p className="phoenix-section-copy">Numeric breakdown of billed and collected fees.</p>
                         </div>
                     </div>
                     <div className="flex-1 overflow-y-auto p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="py-2 px-3 text-left">Category</th>
                                    <th className="py-2 px-3 text-right">Billed</th>
                                    <th className="py-2 px-3 text-right">Collected</th>
                                    <th className="py-2 px-3 text-right">Outstanding</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-slate-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 size={16} className="animate-spin" /> Loading breakdown...
                                            </div>
                                        </td>
                                    </tr>
                                ) : reportData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row._id || 'Unknown'}</td>
                                        <td className="py-2.5 px-3 text-right font-bold text-blue-600">${(row.totalRevenue || 0).toLocaleString()}</td>
                                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">${(row.totalPaid || 0).toLocaleString()}</td>
                                        <td className="py-2.5 px-3 text-right font-bold text-rose-500">${(row.totalBalance || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {!loading && reportData.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="py-12 text-center text-slate-400 text-xs font-semibold">No data available for selected period</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                     </div>
                 </article>
            </div>
        </div>
    );
};

export default Reports;
