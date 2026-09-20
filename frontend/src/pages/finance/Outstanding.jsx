import React, { useCallback, useState, useEffect } from 'react';
import { getFinanceClasses, getFinanceSections, getOutstanding } from '../../services/api/finance.api';
import { getBranches, getAcademicYears } from '../../services/api/tenant.api';
import { Select } from '../../components/ui';
import { AlertCircle, TrendingDown, Loader2 } from 'lucide-react';
import FinanceFilterBar from '../../components/finance/FinanceFilterBar';

const EMPTY_FILTERS = { branchId: '', academicYearId: '', classId: '', sectionId: '' };

const Outstanding = () => {
    const [data, setData] = useState({ totalOutstanding: 0, count: 0, debtors: [] });
    const [branches, setBranches] = useState([]);
    const [years, setYears] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadLookups();
    }, []);

    const loadLookups = async () => {
        try {
            const [b, y] = await Promise.all([getBranches(), getAcademicYears()]);
            if (Array.isArray(b)) {
                setBranches(b.map(i => ({ label: i.name, value: i._id })));
            }
            if (Array.isArray(y)) {
                setYears(y.map(i => ({ label: i.name, value: i._id })));
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (!draftFilters.branchId) return setClasses([]);
        getFinanceClasses({ branchId: draftFilters.branchId }).then(list => setClasses((list || []).map(item => ({ label: item.name, value: item._id })))).catch(() => setClasses([]));
    }, [draftFilters.branchId]);

    useEffect(() => {
        if (!draftFilters.classId) return setSections([]);
        getFinanceSections({ branchId: draftFilters.branchId || undefined, classId: draftFilters.classId }).then(list => setSections((list || []).map(item => ({ label: item.name, value: item._id })))).catch(() => setSections([]));
    }, [draftFilters.branchId, draftFilters.classId]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getOutstanding(filters);
            setData(res?.data || res || { totalOutstanding: 0, count: 0, debtors: [] });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-4">
            <div className="phoenix-page-header">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
                        <AlertCircle size={18} />
                    </div>
                    <div>
                        <h1 className="phoenix-page-title">Outstanding balances</h1>
                        <p className="phoenix-page-subtitle">Monitor unpaid dues and collection risks.</p>
                    </div>
                </div>
            </div>

            <FinanceFilterBar activeCount={Object.values(filters).filter(Boolean).length} loading={loading} resultLabel={`${data.count || 0} unpaid invoices`} onApply={() => setFilters(draftFilters)} onReset={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }}>
                    <Select 
                        label="Filter by Branch"
                        options={branches}
                        value={draftFilters.branchId}
                        onChange={e => setDraftFilters({...draftFilters, branchId: e.target.value, classId: '', sectionId: ''})}
                        placeholder="All campuses"
                    />
                    <Select label="Filter by Class" options={classes} value={draftFilters.classId} onChange={e => setDraftFilters({...draftFilters, classId: e.target.value, sectionId: ''})} placeholder={draftFilters.branchId ? 'All classes' : 'Select a branch first'} disabled={!draftFilters.branchId} />
                    <Select label="Filter by Section" options={sections} value={draftFilters.sectionId} onChange={e => setDraftFilters({...draftFilters, sectionId: e.target.value})} placeholder="All sections" disabled={!draftFilters.classId} />
                    <Select 
                        label="Filter by Year"
                        options={years}
                        value={draftFilters.academicYearId}
                        onChange={e => setDraftFilters({...draftFilters, academicYearId: e.target.value})}
                        placeholder="All academic years"
                    />
            </FinanceFilterBar>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <article className="phoenix-card p-4 bg-rose-50/30 border-rose-100 flex items-center gap-4">
                    <div className="p-3 bg-white border border-rose-100 rounded-lg text-rose-500 shadow-sm shrink-0">
                        <TrendingDown size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Receivables</p>
                        <p className="text-3xl font-black text-slate-900 mt-1">${(data.totalOutstanding || 0).toLocaleString()}</p>
                        <p className="text-xs font-semibold text-rose-600 mt-1">{data.count || 0} Unpaid Invoices</p>
                    </div>
                </article>
                
                <article className="phoenix-card p-4 bg-blue-50/30 border-blue-100 flex items-center">
                    <div className="p-1">
                        <h3 className="font-bold text-slate-700 text-sm mb-1">Billing Operations</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Use due dates and the debtor list to coordinate invoice follow-up.
                        </p>
                        <p className="text-xs font-semibold text-slate-600 mt-2">
                            Active outstanding invoice count: <strong className="text-slate-800">{data.count || 0}</strong>
                        </p>
                    </div>
                </article>
            </div>

            <article className="phoenix-card">
                <div className="phoenix-card-header">
                    <div>
                        <h2 className="phoenix-section-title">Top Debtors Watchlist</h2>
                        <p className="phoenix-section-copy">Students with the largest outstanding fee balances.</p>
                    </div>
                </div>
                <div className="phoenix-table-shell">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    <th className="px-4 py-3 text-left">Student</th>
                                    <th className="px-4 py-3 text-left">Adm No.</th>
                                    <th className="px-4 py-3 text-left">Branch</th>
                                    <th className="px-4 py-3 text-left">Class</th>
                                    <th className="px-4 py-3 text-left">Section</th>
                                    <th className="px-4 py-3 text-left">Oldest Due Date</th>
                                    <th className="px-4 py-3 text-right">Balance Due</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 size={16} className="animate-spin" /> Loading watchlist...
                                            </div>
                                        </td>
                                    </tr>
                                ) : data.debtors?.slice(0, 10).map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-800">{d.studentName}</td>
                                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{d.admissionNumber || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500">{d.branchName || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500">{d.className || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500">{d.sectionName || '-'}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{d.oldestDueDate ? new Date(d.oldestDueDate).toLocaleDateString() : '-'}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">${(d.balance || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {!loading && (!data.debtors || data.debtors.length === 0) && (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-8 text-center text-slate-400 text-xs font-semibold">No outstanding balances match these filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </article>
        </div>
    );
};

export default Outstanding;
