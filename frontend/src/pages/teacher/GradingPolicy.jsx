import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Spinner, Badge } from '../../components/ui';
import { getGradingPolicy } from '../../services/api/teacher.api';
import {
    AlertCircle,
    Award,
    CheckCircle2,
    FileSpreadsheet,
    Info,
    Lock
} from 'lucide-react';

const asArray = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const gradeVariant = (grade) => {
    const normalized = String(grade || '').toUpperCase();
    if (normalized === 'A') return 'success';
    if (normalized === 'F') return 'danger';
    if (normalized === 'B') return 'primary';
    return 'default';
};

const GradingPolicy = () => {
    const [policy, setPolicy] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getGradingPolicy()
            .then((res) => setPolicy(asArray(res)))
            .catch(() => setPolicy([]))
            .finally(() => setLoading(false));
    }, []);

    const sortedPolicy = useMemo(() => (
        [...(policy || [])].sort((a, b) => Number(b.min || 0) - Number(a.min || 0))
    ), [policy]);

    const passingRules = sortedPolicy.filter((rule) => String(rule.grade || '').toUpperCase() !== 'F');
    const lowestPassingRule = passingRules[passingRules.length - 1];
    const topGrade = sortedPolicy[0];

    if (loading) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <p className="text-xs font-semibold text-slate-400">Loading grading policy...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Page Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Grading Policy</h1>
                    <p className="phoenix-page-subtitle">Read-only branch grading scale used when the system calculates result grades.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-fit gap-1.5 rounded-lg">
                        <Lock size={13} />
                        <span>Teacher read-only</span>
                    </Badge>
                </div>
            </div>

            {/* Stat Cards */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500">Rules</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{sortedPolicy.length}</p>
                        </div>
                        <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                            <Award size={22} />
                        </div>
                    </div>
                </div>
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500">Top Grade</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{topGrade?.grade || '-'}</p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                            <CheckCircle2 size={22} />
                        </div>
                    </div>
                </div>
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500">Pass Mark</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                {lowestPassingRule ? `${lowestPassingRule.min}%` : '-'}
                            </p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                            <AlertCircle size={22} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Scale & Information */}
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="phoenix-card xl:col-span-2">
                    <div className="phoenix-card-body">
                        <h2 className="text-base font-bold text-[#141824] mb-3">Current Grading Scale</h2>
                        {sortedPolicy.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                                <FileSpreadsheet size={38} className="mx-auto mb-3 text-slate-300" />
                                <p className="font-bold text-slate-700">No grading scale configured</p>
                                <p className="mt-1 text-sm text-slate-500">Ask the school super admin to configure grade thresholds.</p>
                            </div>
                        ) : (
                            <div className="phoenix-table-shell">
                                <div className="overflow-x-auto">
                                    <Table headers={['Grade', 'Percentage Range', 'Status']}>
                                        {(sortedPolicy || []).map((rule, index) => (
                                            <tr key={`${rule.grade}-${index}`} className="hover:bg-slate-50/70 border-b border-[#e3e6ed]">
                                                <td className="px-4 py-3">
                                                    <Badge variant={gradeVariant(rule.grade)} className="min-w-12 justify-center rounded-lg text-sm">
                                                        {rule.grade}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800 text-sm">
                                                    {rule.min}% - {rule.max}%
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                                                        <CheckCircle2 size={14} />
                                                        <span>Active</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <h3 className="text-base font-bold text-slate-800 mb-3">How It Works</h3>
                            <div className="space-y-4 text-sm font-semibold text-slate-600">
                                <div className="flex gap-3">
                                    <Info size={18} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                                    <p>Teachers enter scores. The backend applies this grading policy during result calculation.</p>
                                </div>
                                <div className="flex gap-3">
                                    <Lock size={18} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                                    <p>Teachers cannot edit thresholds. School super admins manage these rules for consistency.</p>
                                </div>
                                <div className="flex gap-3">
                                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                                    <p>Every published result uses the same scale, so reports stay consistent across classes.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                        <div className="flex gap-3">
                            <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                            <div>
                                <h3 className="font-bold text-amber-900">Need a change?</h3>
                                <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                                    Contact the school super admin before entering final results if the grading thresholds look incorrect.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default GradingPolicy;
