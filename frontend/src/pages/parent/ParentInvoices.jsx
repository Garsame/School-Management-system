import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, FileText, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const ParentInvoices = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [children, setChildren] = useState([]);
    const [years, setYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [financeData, setFinanceData] = useState({ invoices: [], payments: [] });

    const [loadingChildren, setLoadingChildren] = useState(true);
    const [loadingFinance, setLoadingFinance] = useState(false);
    const [error, setError] = useState('');

    const activeStudentId = searchParams.get('studentId') || '';

    // Fetch children list first
    useEffect(() => {
        const fetchChildren = async () => {
            try {
                const res = await api.get('/parent/dashboard');
                if (res.data?.success) {
                    setChildren(res.data.data);
                    if (!activeStudentId && res.data.data.length > 0) {
                        setSearchParams({ studentId: res.data.data[0].student._id });
                    }
                } else {
                    setError('Failed to retrieve children list.');
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Error loading student profiles.');
            } finally {
                setLoadingChildren(false);
            }
        };
        fetchChildren();
    }, [activeStudentId, setSearchParams]);

    // Fetch academic years when activeStudentId changes
    useEffect(() => {
        if (!activeStudentId) return;

        const fetchYears = async () => {
            setError('');
            try {
                const res = await api.get(`/parent/students/${activeStudentId}/academic-years`);
                if (res.data?.success) {
                    const yearList = res.data.data || [];
                    setYears(yearList);
                    
                    const currentYear = yearList.find(y => y.isCurrent) || yearList[0];
                    if (currentYear) {
                        setSelectedYearId(currentYear._id);
                    } else {
                        setSelectedYearId('');
                    }
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to load academic years.');
            }
        };
        fetchYears();
    }, [activeStudentId]);

    // Fetch invoices and payments when student or year changes
    const fetchFinance = useCallback(async () => {
        if (!activeStudentId) return;
        setLoadingFinance(true);
        setError('');
        try {
            const params = selectedYearId ? { schoolYearId: selectedYearId } : {};
            const res = await api.get(`/parent/students/${activeStudentId}/invoices`, { params });
            if (res.data?.success) {
                setFinanceData(res.data.data || { invoices: [], payments: [] });
            } else {
                setError('Failed to retrieve invoices and payments.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error loading financial logs.');
        } finally {
            setLoadingFinance(false);
        }
    }, [activeStudentId, selectedYearId]);

    useEffect(() => {
        fetchFinance();
    }, [fetchFinance]);

    const activeChild = children.find(c => c.student._id === activeStudentId);
    const { invoices = [], payments = [] } = financeData;

    const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    if (loadingChildren) {
        return (
            <div className="h-96 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">
                        Fees & Payments
                    </h1>
                    <p className="phoenix-page-subtitle">Review school invoices, payments history, and fee statements.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {/* Child Selector */}
                    {(children || []).length > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#8a94ad]">Student:</span>
                            <select 
                                value={activeStudentId} 
                                onChange={(e) => {
                                    setSearchParams({ studentId: e.target.value });
                                    setYears([]);
                                    setSelectedYearId('');
                                    setFinanceData({ invoices: [], payments: [] });
                                }}
                                className="h-10 bg-white border border-[#cbd0dd] rounded-xl px-3 font-bold text-slate-800 outline-none shadow-sm focus:ring-4 focus:ring-[var(--primary)]/5 text-xs"
                            >
                                {(children || []).map(c => (
                                    <option key={c.student._id} value={c.student._id}>
                                        {c.student.firstName} {c.student.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Academic Year Selector */}
                    {(years || []).length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#8a94ad]">Academic Year:</span>
                            <select 
                                value={selectedYearId} 
                                onChange={(e) => setSelectedYearId(e.target.value)}
                                className="h-10 bg-white border border-[#cbd0dd] rounded-xl px-3 font-bold text-slate-800 outline-none shadow-sm focus:ring-4 focus:ring-[var(--primary)]/5 text-xs"
                            >
                                {(years || []).map(y => (
                                    <option key={y._id} value={y._id}>
                                        {y.name} {y.isCurrent ? '(Current)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-900 animate-fade-in">
                    <AlertCircle className="text-rose-500 flex-shrink-0" size={20} />
                    <div className="text-sm font-semibold flex-1">{error}</div>
                    <button 
                        onClick={fetchFinance} 
                        className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                        <RefreshCw size={12} />
                        Retry
                    </button>
                </div>
            )}

            {/* Financial view */}
            {!activeStudentId ? (
                <div className="phoenix-card p-6 text-center max-w-md mx-auto">
                    <AlertTriangle className="mx-auto text-amber-500 mb-4" size={36} />
                    <p className="text-slate-500 text-sm font-semibold">No student selected or linked.</p>
                </div>
            ) : loadingFinance ? (
                <div className="h-64 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (years || []).length === 0 ? (
                <div className="phoenix-card p-6 text-center max-w-md mx-auto">
                    <AlertTriangle className="mx-auto text-amber-500 mb-4" size={36} />
                    <p className="text-slate-500 text-sm font-semibold">No academic year records found for this child.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Financial Summary Banner */}
                    <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        totalOutstanding > 0 
                            ? 'bg-rose-50 border-rose-100 text-rose-900' 
                            : 'bg-emerald-50 border-emerald-100 text-emerald-900'
                    }`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                totalOutstanding > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                                <CreditCard size={18} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold tracking-tight">
                                    {totalOutstanding > 0 ? 'Pending Fee Balance' : 'Account Settled'}
                                </h3>
                                <p className="text-xs font-semibold opacity-75 mt-0.5">
                                    Total outstanding school fees for {activeChild?.student?.firstName} (selected year)
                                </p>
                            </div>
                        </div>
                        <div>
                            <span className="text-xs font-semibold opacity-65 block text-right">Outstanding amount</span>
                            <span className="text-xl font-bold">${totalOutstanding.toLocaleString()}</span>
                        </div>
                    </div>
 
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Invoices List */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="phoenix-card p-5">
                                <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <FileText size={18} className="text-slate-400" />
                                    Invoices Directory
                                </h3>
                                
                                {(invoices || []).length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm font-semibold py-8">No invoices generated for this year.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {(invoices || []).map(inv => (
                                            <div key={inv._id} className="p-4 border border-slate-100 rounded-xl bg-slate-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-800 text-sm">Invoice #{inv._id.toString().slice(-6).toUpperCase()}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                                                            inv.status === 'PAID' 
                                                                ? 'bg-emerald-50 text-emerald-600'
                                                                : inv.status === 'PARTIALLY_PAID'
                                                                ? 'bg-amber-50 text-amber-600'
                                                                : 'bg-rose-50 text-rose-600'
                                                        }`}>
                                                            {inv.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-[#8a94ad] font-medium">
                                                        Created: {new Date(inv.createdAt).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs font-semibold text-[#6e7891]">{inv.billingPeriodLabel || 'School fees'}{inv.dueDate ? ` | Due ${new Date(inv.dueDate).toLocaleDateString()}` : ''}</p>
                                                    <div className="pt-1 text-xs text-[#6e7891]">{(inv.items || []).map((item) => <span key={`${inv._id}-${item.name}`} className="mr-3 inline-block">{item.name}: ${Number(item.amount || 0).toLocaleString()}</span>)}</div>
                                                </div>
                                                <div className="flex items-center gap-6 justify-between sm:justify-start">
                                                    <div className="text-right">
                                                        <span className="text-xs font-semibold text-[#8a94ad] block">Total / Balance</span>
                                                        <span className="font-semibold text-slate-800">${inv.totalAmount}</span>
                                                        <span className="text-xs font-medium text-slate-400 block">${inv.balance} remaining</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
 
                        {/* Payments Logs */}
                        <div className="space-y-6">
                            <div className="phoenix-card p-5">
                                <h3 className="text-base font-bold text-slate-800 mb-4">Receipt History</h3>
                                
                                {(payments || []).length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm font-semibold py-8">No payments recorded.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {(payments || []).map(pay => (
                                            <div key={pay._id} className="p-3 border-b border-slate-100 last:border-b-0 space-y-1 relative">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm text-slate-800">${pay.amount}</span>
                                                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">PAID</span>
                                                </div>
                                                <p className="text-xs text-[#8a94ad] font-medium">
                                                    {new Date(pay.createdAt).toLocaleDateString()} | {pay.method}
                                                </p>
                                                <p className="text-[10px] font-semibold text-[#8a94ad] truncate">
                                                    Ref: {pay.reference || 'N/A'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParentInvoices;
