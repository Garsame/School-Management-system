import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Award,
    CalendarDays,
    CheckCircle2,
    GraduationCap,
    Loader2,
    Pencil,
    Plus,
    RotateCcw,
    Save,
    Trash2,
    X,
} from 'lucide-react';
import tenantService from '../../services/tenantService';
import { confirmAction } from '../../components/feedback/notificationService';

const PLUS_MINUS_RULES = [
    { min: 95, max: 100, grade: 'A+' },
    { min: 90, max: 94, grade: 'A-' },
    { min: 85, max: 89, grade: 'B+' },
    { min: 80, max: 84, grade: 'B-' },
    { min: 75, max: 79, grade: 'C+' },
    { min: 70, max: 74, grade: 'C-' },
    { min: 65, max: 69, grade: 'D+' },
    { min: 60, max: 64, grade: 'D-' },
    { min: 0, max: 59, grade: 'F' },
];

const EMPTY_TERM = { name: '', sequence: 1, startDate: '', endDate: '' };
const EMPTY_POLICY = {
    name: 'Institution Grading Scale',
    finalGradeLevel: '12',
    graduationRequiresPass: true,
    rules: PLUS_MINUS_RULES,
};

const sortRulesHighToLow = (rules = []) => (
    [...rules].sort((a, b) => Number(b.min || 0) - Number(a.min || 0))
);

const normalizePolicy = (data = {}) => ({
    name: data.name || EMPTY_POLICY.name,
    finalGradeLevel: data.finalGradeLevel || EMPTY_POLICY.finalGradeLevel,
    graduationRequiresPass: data.graduationRequiresPass !== false,
    rules: sortRulesHighToLow(
        Array.isArray(data.rules) && data.rules.length
            ? data.rules.map((rule) => ({
                grade: String(rule.grade || ''),
                min: rule.min ?? '',
                max: rule.max ?? '',
            }))
            : PLUS_MINUS_RULES
    ),
});

const toInputDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const toDisplayDate = (value) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString();
};

const buildApiRules = (rules = []) => (
    rules.map((rule) => ({
        grade: String(rule.grade || '').trim(),
        min: Number(rule.min),
        max: Number(rule.max),
    }))
);

const AcademicPolicy = () => {
    const [policy, setPolicy] = useState(EMPTY_POLICY);
    const [years, setYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [terms, setTerms] = useState([]);
    const [termForm, setTermForm] = useState(EMPTY_TERM);
    const [editingTermId, setEditingTermId] = useState('');
    const [loading, setLoading] = useState(true);
    const [termsLoading, setTermsLoading] = useState(false);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [savingTerm, setSavingTerm] = useState(false);
    const [notice, setNotice] = useState(null);

    const selectedYear = useMemo(
        () => years.find((year) => year._id === selectedYearId),
        [selectedYearId, years]
    );

    const yearBounds = useMemo(() => ({
        start: toInputDate(selectedYear?.startDate),
        end: toInputDate(selectedYear?.endDate),
    }), [selectedYear]);

    const showNotice = (type, message) => {
        setNotice({ type, message });
    };

    const loadTerms = async (yearId) => {
        if (!yearId) {
            setTerms([]);
            return;
        }
        setTermsLoading(true);
        try {
            const response = await tenantService.getTerms(yearId);
            setTerms(response.data || []);
        } finally {
            setTermsLoading(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [policyResponse, yearsResponse] = await Promise.all([
                    tenantService.getAcademicPolicy(),
                    tenantService.getAcademicYears(),
                ]);
                setPolicy(normalizePolicy(policyResponse.data));
                const loadedYears = yearsResponse.data || [];
                setYears(loadedYears);
                const initialYear = loadedYears.find((year) => year.isCurrent)?._id || loadedYears[0]?._id || '';
                setSelectedYearId(initialYear);
                await loadTerms(initialYear);
            } catch (error) {
                showNotice('error', error.response?.data?.message || 'Failed to load academic policy.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const updateRule = (index, field, value) => {
        setPolicy((current) => ({
            ...current,
            rules: current.rules.map((rule, ruleIndex) => (
                ruleIndex === index ? { ...rule, [field]: field === 'grade' ? value.toUpperCase() : value } : rule
            )),
        }));
    };

    const addRule = () => {
        setPolicy((current) => ({
            ...current,
            rules: [...current.rules, { grade: '', min: '', max: '' }],
        }));
    };

    const removeRule = (index) => {
        setPolicy((current) => ({
            ...current,
            rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index),
        }));
    };

    const savePolicy = async (event) => {
        event.preventDefault();
        setSavingPolicy(true);
        try {
            const response = await tenantService.updateAcademicPolicy({
                ...policy,
                rules: buildApiRules(policy.rules),
            });
            setPolicy(normalizePolicy(response.data));
            showNotice('success', 'Academic policy saved.');
        } catch (error) {
            showNotice('error', error.response?.data?.message || 'Failed to save academic policy.');
        } finally {
            setSavingPolicy(false);
        }
    };

    const handleYearChange = async (event) => {
        const yearId = event.target.value;
        setSelectedYearId(yearId);
        setEditingTermId('');
        setTermForm(EMPTY_TERM);
        try {
            await loadTerms(yearId);
        } catch (error) {
            showNotice('error', error.response?.data?.message || 'Failed to load terms.');
        }
    };

    const resetTermForm = () => {
        setEditingTermId('');
        setTermForm(EMPTY_TERM);
    };

    const submitTerm = async (event) => {
        event.preventDefault();
        if (!selectedYearId) {
            showNotice('error', 'Select an academic year before saving a term.');
            return;
        }
        setSavingTerm(true);
        try {
            if (editingTermId) {
                await tenantService.updateTerm(editingTermId, termForm);
                showNotice('success', 'Term updated.');
            } else {
                await tenantService.createTerm(selectedYearId, termForm);
                showNotice('success', 'Term added.');
            }
            resetTermForm();
            await loadTerms(selectedYearId);
        } catch (error) {
            showNotice('error', error.response?.data?.message || 'Failed to save term.');
        } finally {
            setSavingTerm(false);
        }
    };

    const editTerm = (term) => {
        setEditingTermId(term._id);
        setTermForm({
            name: term.name || '',
            sequence: term.sequence || 1,
            startDate: toInputDate(term.startDate),
            endDate: toInputDate(term.endDate),
        });
    };

    const deleteTerm = async (term) => {
        if (!(await confirmAction(`Delete ${term.name}?`, { title: 'Delete academic term', confirmLabel: 'Delete' }))) return;
        try {
            await tenantService.deleteTerm(term._id);
            if (editingTermId === term._id) resetTermForm();
            await loadTerms(selectedYearId);
            showNotice('success', 'Term deleted.');
        } catch (error) {
            showNotice('error', error.response?.data?.message || 'Failed to delete term.');
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="phoenix-resource-page pb-10">
            <div className="phoenix-page-header">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
                    <div>
                        <h1 className="phoenix-page-title">Academic policy</h1>
                        <p className="phoenix-page-subtitle max-w-2xl">
                            Manage plus/minus grading, final-grade graduation rules, and academic terms used by exams.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 sm:flex">
                        <span className="phoenix-badge">Final grade {policy.finalGradeLevel || '12'}</span>
                        <span className="phoenix-badge">{policy.rules.length} grade bands</span>
                    </div>
                </div>
            </div>

            {notice && (
                <div
                    className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                        notice.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-rose-200 bg-rose-50 text-rose-800'
                    }`}
                >
                    <span className="flex items-start gap-2">
                        {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        {notice.message}
                    </span>
                    <button type="button" onClick={() => setNotice(null)} className="rounded-md p-1 hover:bg-white/60" aria-label="Dismiss message">
                        <X size={15} />
                    </button>
                </div>
            )}

            <form onSubmit={savePolicy} className="phoenix-card">
                <div className="phoenix-card-header">
                    <div className="flex items-center gap-3">
                        <span className="phoenix-section-icon">
                            <Award size={20} />
                        </span>
                        <div>
                            <h2 className="phoenix-section-title">Grading and graduation</h2>
                            <p className="phoenix-section-copy">Use ranges that cover 0 to 100 without gaps.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6 p-5">
                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr_1fr]">
                        <label className="space-y-1.5">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Policy name</span>
                            <input
                                required
                                value={policy.name || ''}
                                onChange={(event) => setPolicy({ ...policy, name: event.target.value })}
                                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                            />
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Final grade level</span>
                            <input
                                required
                                value={policy.finalGradeLevel || ''}
                                onChange={(event) => setPolicy({ ...policy, finalGradeLevel: event.target.value })}
                                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                            />
                        </label>

                        <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                            <span>
                                <span className="block text-sm font-black text-slate-900">Require passing results</span>
                                <span className="block text-xs font-medium text-slate-500">Block graduation when final results are failed or missing.</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={policy.graduationRequiresPass !== false}
                                onChange={(event) => setPolicy({ ...policy, graduationRequiresPass: event.target.checked })}
                                className="h-5 w-5 accent-[var(--primary)]"
                            />
                        </label>
                    </div>

                    <div className="phoenix-table-shell">
                        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="font-black text-slate-950">Plus/minus grading scale</h3>
                                <p className="text-xs font-medium text-slate-500">Default bands use A+, A-, B+, B-, C+, C-, D+, D-, and F.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPolicy((current) => ({ ...current, rules: PLUS_MINUS_RULES }))}
                                    className="phoenix-secondary-button"
                                >
                                    <RotateCcw size={14} /> Use default
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPolicy((current) => ({ ...current, rules: sortRulesHighToLow(current.rules) }))}
                                    className="phoenix-secondary-button"
                                >
                                    Sort
                                </button>
                                <button
                                    type="button"
                                    onClick={addRule}
                                    className="phoenix-primary-button"
                                >
                                    <Plus size={14} /> Add band
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-left text-sm">
                                <thead className="border-b border-slate-200 bg-white text-xs font-black uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Grade</th>
                                        <th className="px-4 py-3">Minimum</th>
                                        <th className="px-4 py-3">Maximum</th>
                                        <th className="w-16 px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {policy.rules.map((rule, index) => (
                                        <tr key={`${rule.grade}-${index}`} className="border-b border-slate-100 last:border-b-0">
                                            <td className="px-4 py-3">
                                                <input
                                                    required
                                                    value={rule.grade}
                                                    placeholder="A+"
                                                    onChange={(event) => updateRule(index, 'grade', event.target.value)}
                                                    className="h-10 w-24 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    required
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={rule.min}
                                                    onChange={(event) => updateRule(index, 'min', event.target.value)}
                                                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    required
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={rule.max}
                                                    onChange={(event) => updateRule(index, 'max', event.target.value)}
                                                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    title="Remove band"
                                                    onClick={() => removeRule(index)}
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={savingPolicy}
                            className="phoenix-primary-button disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {savingPolicy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Save policy
                        </button>
                    </div>
                </div>
            </form>

            <section className="phoenix-card">
                <div className="phoenix-card-header flex-col lg:flex-row lg:items-end">
                    <div className="flex items-start gap-3">
                        <span className="phoenix-section-icon">
                            <CalendarDays size={20} />
                        </span>
                        <div>
                            <h2 className="phoenix-section-title">Academic terms</h2>
                            <p className="phoenix-section-copy">Terms are scoped to an academic year and can be attached to exams.</p>
                        </div>
                    </div>
                    <label className="space-y-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Academic year</span>
                        <select
                            value={selectedYearId}
                            onChange={handleYearChange}
                            className="h-11 min-w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                        >
                            {years.length === 0 && <option value="">No academic years</option>}
                            {years.map((year) => <option key={year._id} value={year._id}>{year.name}</option>)}
                        </select>
                    </label>
                </div>

                <div className="grid gap-0 xl:grid-cols-[0.95fr_1.05fr]">
                    <form onSubmit={submitTerm} className="academic-term-form p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="font-black text-slate-950">{editingTermId ? 'Edit term' : 'Add term'}</h3>
                                <p className="text-xs font-medium text-slate-500">
                                    {selectedYear ? `${toDisplayDate(selectedYear.startDate)} to ${toDisplayDate(selectedYear.endDate)}` : 'Create an academic year first.'}
                                </p>
                            </div>
                            {editingTermId && (
                                <button type="button" onClick={resetTermForm} className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700" aria-label="Cancel edit">
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5 sm:col-span-2">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Term name</span>
                                <input
                                    required
                                    placeholder="First term"
                                    value={termForm.name}
                                    onChange={(event) => setTermForm({ ...termForm, name: event.target.value })}
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                />
                            </label>
                            <label className="space-y-1.5">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Sequence</span>
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    value={termForm.sequence}
                                    onChange={(event) => setTermForm({ ...termForm, sequence: Number(event.target.value) })}
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                />
                            </label>
                            <label className="space-y-1.5">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Start date</span>
                                <input
                                    required
                                    type="date"
                                    min={yearBounds.start}
                                    max={yearBounds.end}
                                    value={termForm.startDate}
                                    onChange={(event) => setTermForm({ ...termForm, startDate: event.target.value })}
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                />
                            </label>
                            <label className="space-y-1.5 sm:col-span-2">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">End date</span>
                                <input
                                    required
                                    type="date"
                                    min={yearBounds.start}
                                    max={yearBounds.end}
                                    value={termForm.endDate}
                                    onChange={(event) => setTermForm({ ...termForm, endDate: event.target.value })}
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-50"
                                />
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={!selectedYearId || savingTerm}
                            className="phoenix-primary-button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {savingTerm ? <Loader2 size={16} className="animate-spin" /> : editingTermId ? <Save size={16} /> : <Plus size={16} />}
                            {editingTermId ? 'Update term' : 'Add term'}
                        </button>
                    </form>

                    <div className="academic-term-list">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <h3 className="font-black text-slate-950">Configured terms</h3>
                            {termsLoading && <Loader2 size={16} className="animate-spin text-[var(--primary)]" />}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {terms.map((term) => (
                                <div key={term._id} className="flex items-center justify-between gap-4 px-4 py-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-700">
                                            {term.sequence}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-slate-950">{term.name}</p>
                                            <p className="text-xs font-medium text-slate-500">{toDisplayDate(term.startDate)} to {toDisplayDate(term.endDate)}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            title="Edit term"
                                            onClick={() => editTerm(term)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-[var(--primary)]"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            title="Delete term"
                                            onClick={() => deleteTerm(term)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {terms.length === 0 && !termsLoading && (
                                <div className="flex items-center gap-3 px-4 py-8 text-sm font-medium text-slate-500">
                                    <GraduationCap size={20} />
                                    No terms configured for this academic year.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default AcademicPolicy;
