import React, { useState, useEffect } from 'react';
import {
    Search, ShieldAlert,
    Save, LogIn, History, Clock, AlertTriangle,
    FileText
} from 'lucide-react';
import tenantService from '../../services/tenantService';

const typeMeta = {
    danger:  { label: 'Security', className: 'audit-severity-danger' },
    warning: { label: 'Warning', className: 'audit-severity-warning' },
    update:  { label: 'Change', className: 'audit-severity-brand' },
    default: { label: 'Info', className: 'audit-severity-muted' },
};

const getActionIcon = (action = '') => {
    const a = action.toUpperCase();
    if (a.includes('CREATED') || a.includes('ADD')) return <Save size={14} />;
    if (a.includes('LOGIN'))   return <LogIn size={14} />;
    if (a.includes('SUSPEND') || a.includes('DEACTIVATED')) return <ShieldAlert size={14} />;
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
        tenantService.getAuditLogs()
            .then(res => { setLogs(res.data?.logs || res.data || []); setError(''); })
            .catch(err => { setLogs([]); setError(err.response?.data?.message || 'Failed to load school audit logs.'); })
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
        { id: 'danger',  label: 'Security & Suspension' },
        { id: 'warning', label: 'Warnings' },
        { id: 'update',  label: 'Updates & Changes' },
        { id: 'default', label: 'Info' },
    ];

    const summary = {
        total: logs.length,
        changes: logs.filter((log) => log.type === 'update').length,
        security: logs.filter((log) => log.type === 'danger').length,
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="audit-loading-spinner" />
        </div>
    );

    return (
        <div className="phoenix-resource-page">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Audit logs</h1>
                    <p className="phoenix-page-subtitle">Review staff actions, account changes, and security events.</p>
                    {error && <p className="text-sm font-semibold text-rose-600 mt-1">{error}</p>}
                </div>
            </div>

            <div className="audit-summary-strip">
                <div className="audit-summary-item">
                    <span>Total events</span>
                    <strong>{summary.total}</strong>
                </div>
                <div className="audit-summary-item">
                    <span>Recorded changes</span>
                    <strong>{summary.changes}</strong>
                </div>
                <div className="audit-summary-item">
                    <span>Security events</span>
                    <strong>{summary.security}</strong>
                </div>
            </div>

            <div className="phoenix-card p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="phoenix-input-icon" />
                        <input
                            type="text"
                            placeholder="Search by action, user or target..."
                            className="phoenix-control phoenix-control-with-icon"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                {/* Type filter pills */}
                <div className="flex flex-wrap gap-2">
                    {typeFilters.map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                            className={`audit-filter-button ${
                                filter === f.id
                                    ? 'text-white border-transparent'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-350'
                            }`}
                            style={filter === f.id ? { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#ffffff' } : {}}>
                            {f.label}
                        </button>
                    ))}
                    <span className="ml-auto text-xs font-semibold text-slate-450 self-center">
                        {filteredLogs.length} entries
                    </span>
                </div>
            </div>

            {/* Log Table */}
            <div className="phoenix-table-shell overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80">
                                <th className="px-5 py-3.5">Action</th>
                                <th className="px-5 py-3.5">Performed by</th>
                                <th className="px-5 py-3.5">Target resource</th>
                                <th className="px-5 py-3.5">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredLogs.map(log => {
                                const tm = getType(log.type);
                                const actor = log.actor || log.user || 'System';
                                return (
                                    <tr key={log.id || log._id} className="audit-log-row">
                                        {/* Action */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="audit-action-icon">
                                                    {getActionIcon(log.action)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{log.action}</p>
                                                    <span className={`audit-type-badge ${tm.className}`}>
                                                        <span className="audit-type-dot" />
                                                        {tm.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Actor */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="audit-actor-avatar">
                                                    {actorInitials(actor)}
                                                </div>
                                                <span className="text-sm font-semibold text-slate-700">{actor}</span>
                                            </div>
                                        </td>
                                        {/* Target */}
                                        <td className="px-5 py-4">
                                            <span className="text-sm text-slate-500 font-semibold">{log.target || '—'}</span>
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
                                        <FileText size={32} className="audit-empty-icon mx-auto mb-3" />
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
