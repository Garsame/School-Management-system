import React, { useState, useEffect } from 'react';
import {
    Search, Download, Filter, User, ShieldAlert,
    Save, LogIn, History, Clock, AlertTriangle,
    Info, FileText
} from 'lucide-react';
import platformService from '../../services/platformService';

const NAVY = '#1b2a4a';
const BLUE = '#4477f5';

const typeMeta = {
    danger:  { bg: 'bg-rose-100',   text: 'text-rose-700',   border: 'border-rose-200',   dot: 'bg-rose-500' },
    warning: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400' },
    update:  { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500' },
    default: { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  dot: 'bg-slate-400' },
};

const getActionIcon = (action = '') => {
    const a = action.toUpperCase();
    if (a.includes('CREATED')) return <Save size={14} />;
    if (a.includes('LOGIN'))   return <LogIn size={14} />;
    if (a.includes('SUSPEND')) return <ShieldAlert size={14} />;
    if (a.includes('WARN'))    return <AlertTriangle size={14} />;
    return <History size={14} />;
};

const getType = (type = '') => typeMeta[type] || typeMeta.default;

const actorInitials = (name = '') => {
    const parts = String(name).trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || 'S')[0].toUpperCase();
};

const AuditLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [error, setError] = useState('');

    useEffect(() => {
        platformService.getAuditLogs()
            .then(res => { setLogs(res.data?.logs || res.data || []); setError(''); })
            .catch(err => { setLogs([]); setError(err.response?.data?.message || 'Failed to load audit logs.'); })
            .finally(() => setLoading(false));
    }, []);

    const filteredLogs = logs.filter(log => {
        const hay = `${log.action} ${log.actor || log.user} ${log.target}`.toLowerCase();
        const matchSearch = hay.includes(search.trim().toLowerCase());
        const matchFilter = filter === 'all' || log.type === filter;
        return matchSearch && matchFilter;
    });

    const typeFilters = [
        { id: 'all',     label: 'All' },
        { id: 'danger',  label: 'Security' },
        { id: 'warning', label: 'Warnings' },
        { id: 'update',  label: 'Updates' },
        { id: 'default', label: 'Info' },
    ];

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-[#4477f5] rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-extrabold text-slate-900">Audit Logs</h2>
                    <p className="text-slate-500 text-sm mt-1">Track all admin actions and platform events.</p>
                    {error && <p className="text-sm font-semibold text-rose-600 mt-1">{error}</p>}
                </div>
                <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-slate-200 text-slate-700 hover:bg-white hover:shadow-sm transition flex-shrink-0">
                    <Download size={16} /> Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by action, user or target..."
                            className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#4477f5]/20 focus:border-[#4477f5] transition"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                {/* Type filter pills */}
                <div className="flex flex-wrap gap-2">
                    {typeFilters.map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                                filter === f.id
                                    ? 'text-white border-transparent'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                            style={filter === f.id ? { background: NAVY } : {}}>
                            {f.label}
                        </button>
                    ))}
                    <span className="ml-auto text-xs font-semibold text-slate-400 self-center">
                        {filteredLogs.length} entries
                    </span>
                </div>
            </div>

            {/* Log Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80">
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Action</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Performed By</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Target</th>
                                <th className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredLogs.map(log => {
                                const tm = getType(log.type);
                                const actor = log.actor || log.user || 'System';
                                return (
                                    <tr key={log.id || log._id} className="hover:bg-slate-50/60 transition-colors">
                                        {/* Action */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${tm.bg} ${tm.text} ${tm.border} flex-shrink-0`}>
                                                    {getActionIcon(log.action)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{log.action}</p>
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest mt-0.5`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${tm.dot}`} />
                                                        <span className={tm.text}>{log.type || 'info'}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Actor */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-extrabold flex-shrink-0"
                                                    style={{ background: NAVY }}>
                                                    {actorInitials(actor)}
                                                </div>
                                                <span className="text-sm font-semibold text-slate-700">{actor}</span>
                                            </div>
                                        </td>
                                        {/* Target */}
                                        <td className="px-5 py-4">
                                            <span className="text-sm text-slate-500 font-medium">{log.target || '—'}</span>
                                        </td>
                                        {/* Time */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                                                <Clock size={12} />
                                                {log.time || log.date || (log.createdAt
                                                    ? new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                    : '—')}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-16 text-center">
                                        <FileText size={32} className="mx-auto mb-3 text-slate-200" />
                                        <p className="text-sm font-semibold text-slate-400">No audit logs found</p>
                                        <p className="text-xs text-slate-300 mt-1">Try adjusting your search or filter</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AuditLogs;
