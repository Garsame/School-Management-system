import React, { useEffect, useState } from 'react';
import { getDashboardStats } from '../../services/api/cashier.api';
import { Card, Spinner } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { Receipt, Clock, Search, FileText } from 'lucide-react';

const Dashboard = () => {
    const [recentPayments, setRecentPayments] = useState([]);
    const [todayTotal, setTodayTotal] = useState(0);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [quickSearch, setQuickSearch] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            try {
                const res = await getDashboardStats();
                const data = res.data || {};
                setStats(data);
                setRecentPayments(data.recentTransactions || []);
                setTodayTotal(data.collectedToday || 0);
            } catch (err) {
                console.error("Dashboard Load Error", err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const handleQuickSearch = (e) => {
        e.preventDefault();
        if(quickSearch.trim()) {
            navigate(`/cashier/invoices?q=${quickSearch}`);
        }
    };

    if (loading) return <Spinner size="lg" />;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Cashier Dashboard</h1>
                    <p className="phoenix-page-subtitle">Overview of today's payments, active transactions, and outstanding invoice balances.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Today's Stats */}
                 <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <article className="phoenix-card p-6 flex items-center justify-between">
                         <div>
                             <p className="text-sm text-slate-500 font-medium mb-1">Collected Today</p>
                             <h3 className="text-2xl font-bold text-green-600">${todayTotal.toLocaleString()}</h3>
                         </div>
                         <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-green-50 text-green-600">
                             <Clock size={24} />
                         </div>
                      </article>

                      <article className="phoenix-card p-6 flex items-center justify-between">
                         <div>
                             <p className="text-sm text-slate-500 font-medium mb-1">Transactions Today</p>
                             <h3 className="text-2xl font-bold text-blue-600">{stats?.transactionCountToday || 0}</h3>
                         </div>
                         <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                             <Receipt size={24} />
                         </div>
                      </article>

                      <article className="phoenix-card p-6 flex items-center justify-between">
                         <div>
                             <p className="text-sm text-slate-500 font-medium mb-1">Pending Invoices</p>
                             <h3 className="text-2xl font-bold text-amber-600">{stats?.pendingInvoicesCount || 0}</h3>
                         </div>
                         <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600">
                             <FileText size={24} />
                         </div>
                      </article>

                      <article className="phoenix-card p-6 flex items-center justify-between">
                         <div>
                             <p className="text-sm text-slate-500 font-medium mb-1">Branch Outstanding Balance</p>
                             <h3 className="text-2xl font-bold text-rose-600">${(stats?.totalOutstandingForBranch || 0).toLocaleString()}</h3>
                         </div>
                         <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600">
                             <FileText size={24} />
                         </div>
                      </article>
                 </div>

                 {/* Quick Actions */}
                 <article className="phoenix-card p-6 flex flex-col justify-center gap-4">
                    <form onSubmit={handleQuickSearch} className="flex gap-2">
                        <input 
                            className="flex-1 px-4 py-2 border rounded-lg text-sm"
                            placeholder="Enter Admission # or Invoice ID..."
                            value={quickSearch}
                            onChange={e=>setQuickSearch(e.target.value)}
                        />
                        <button type="submit" className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700">
                            <Search size={18} />
                        </button>
                    </form>
                    <div className="flex gap-2 text-sm">
                        <button 
                            className="flex-1 py-2 font-medium border rounded-lg hover:bg-slate-50 text-slate-600"
                            onClick={() => navigate('/cashier/payments/new')}
                        >
                            + Record Payment
                        </button>
                         <button 
                            className="flex-1 py-2 font-medium border rounded-lg hover:bg-slate-50 text-slate-600"
                            onClick={() => navigate('/cashier/invoices')}
                        >
                            Lookup Invoice
                        </button>
                    </div>
                 </article>
            </div>

            {/* Recent Payments */}
            <article className="phoenix-card overflow-hidden">
                <div className="phoenix-card-header">Recent Transactions</div>
                <div className="phoenix-card-body p-0">
                    {(recentPayments || []).length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No payments recorded recently.</div>
                    ) : (
                        <div>
                            {(recentPayments || []).map(p => (
                                <div key={p._id} className="p-4 border-b last:border-0 flex justify-between items-center hover:bg-slate-50">
                                    <div>
                                        <div className="font-bold flex items-center gap-2">
                                            <span className="text-slate-800">${p.amount}</span>
                                            <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-500">{p.method}</span>
                                            {p.status === 'REVERSED' && (
                                                <span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-600 rounded">Reversed</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Ref: {p.reference || 'N/A'} • {new Date(p.createdAt).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => navigate(`/cashier/receipts/${p._id}`)}
                                        className="p-2 text-slate-400 hover:text-[var(--primary)]"
                                        title="View Receipt"
                                    >
                                        <Receipt size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </article>
        </div>
    );
};

export default Dashboard;
