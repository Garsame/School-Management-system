import React, { useMemo, useState, useEffect } from 'react';
import { 
  ArrowUpCircle, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  GraduationCap
} from 'lucide-react';
import tenantService from '../../services/tenantService';
import { notify } from '../../components/feedback/notificationService';

const gradeNumber = (value) => {
    const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
};

const Promote = () => {
    const [years, setYears] = useState([]);
    const [branches, setBranches] = useState([]);
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [classes, setClasses] = useState([]);
    const [finalGradeLevel, setFinalGradeLevel] = useState('12');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [stats, setStats] = useState(null);

    const [promoteData, setPromoteData] = useState({
        fromAcademicYearId: '',
        toAcademicYearId: '',
        rules: {
            classMap: [
                { fromClassId: '', toClassId: '', graduate: false }
            ]
        }
    });

    const sortedYears = useMemo(
        () => [...years].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)),
        [years]
    );
    const sourceYearIndex = sortedYears.findIndex((year) => year._id === promoteData.fromAcademicYearId);
    const immediateNextYear = sourceYearIndex >= 0 ? sortedYears[sourceYearIndex + 1] : null;
    const eligibleTargets = (sourceClassId) => {
        const source = classes.find((item) => item._id === sourceClassId);
        const sourceGrade = gradeNumber(source?.gradeLevel);
        return Number.isFinite(sourceGrade)
            ? classes.filter((item) => gradeNumber(item.gradeLevel) === sourceGrade + 1)
            : [];
    };
    const isFinalGrade = (sourceClassId) => {
        const source = classes.find((item) => item._id === sourceClassId);
        return String(source?.gradeLevel || '').trim().toLowerCase() === finalGradeLevel.trim().toLowerCase();
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [yearsRes, branchesRes, policyRes] = await Promise.all([
                    tenantService.getAcademicYears(),
                    tenantService.getBranches(),
                    tenantService.getAcademicPolicy()
                ]);
                setYears(yearsRes.data);
                setBranches(branchesRes.data || []);
                setFinalGradeLevel(String(policyRes.data?.finalGradeLevel || '12'));
                if (branchesRes.data?.length) setSelectedBranchId(branchesRes.data[0]._id);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!selectedBranchId) {
            setClasses([]);
            return;
        }

        tenantService.getBranchClasses(selectedBranchId)
            .then((res) => setClasses(res.data || []))
            .catch(() => setClasses([]));
    }, [selectedBranchId]);

    const handlePromote = async (e) => {
        e.preventDefault();
        const activeMaps = promoteData.rules.classMap.filter((mapping) => mapping.fromClassId && (mapping.toClassId || mapping.graduate));
        if (activeMaps.length === 0) {
            notify('Please add at least one valid promotion or graduation mapping', 'warning');
            return;
        }
        if (!promoteData.toAcademicYearId) {
            notify('Select a destination year for promotion, retention, or graduation history', 'warning');
            return;
        }
        if (promoteData.toAcademicYearId !== immediateNextYear?._id) {
            notify('The destination must be the immediate next academic year', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const response = await tenantService.promoteStudents({
                ...promoteData,
                rules: { classMap: activeMaps }
            });
            setStats(response.data);
            setSuccess(true);
        } catch (err) {
            notify(err.response?.data?.message || 'Promotion failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="phoenix-resource-page pb-10">
            <div className="phoenix-page-header">
                <div>
                 <h1 className="phoenix-page-title">Student promotion</h1>
                 <p className="phoenix-page-subtitle">Promote or graduate student cohorts while preserving academic history.</p>
                </div>
            </div>

            {success ? (
                <div className="phoenix-success-state">
                    <div className="w-14 h-14 bg-emerald-500 text-white rounded-xl flex items-center justify-center mx-auto shadow">
                        <CheckCircle2 size={28} />
                    </div>
                    <div className="space-y-1">
                         <h2 className="text-lg font-black text-slate-900">Promotion Successful</h2>
                         <p className="text-slate-600 text-sm">
                            {stats
                                ? `${stats.promoted || 0} promoted, ${stats.retained || 0} retained, ${stats.graduated || 0} graduated, ${stats.incomplete || 0} incomplete, ${stats.failed || 0} processing errors.`
                                : 'New enrollments initialized for target classes.'}
                         </p>
                    </div>
                    {(stats?.retainedStudents || []).length > 0 && (
                        <div className="mx-auto w-full max-w-2xl border-t border-[#e3e6ed] pt-4 text-left">
                            <p className="mb-2 text-xs font-bold uppercase text-[#525b75]">Retained students</p>
                            <div className="max-h-64 overflow-y-auto">
                                {stats.retainedStudents.map((student) => (
                                    <div key={String(student.studentId)} className="flex items-center justify-between gap-4 border-b border-[#e3e6ed] py-2 text-xs last:border-0">
                                        <span className="font-semibold text-[#141824]">{student.admissionNumber} · {student.name}</span>
                                        <span className="text-rose-700">Failed {student.failedSubjects}/{student.totalSubjects}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={() => { setSuccess(false); setStats(null); }}
                        className="phoenix-primary-button"
                    >
                        Start another promotion
                    </button>
                </div>
            ) : (
                <form onSubmit={handlePromote} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="phoenix-card p-5 space-y-6">
                        {/* Timeline Selection */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Source Timeline</label>
                                 <select
                                    required
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary)]/10 focus:bg-white transition-all text-sm"
                                    value={promoteData.fromAcademicYearId}
                                    onChange={(e) => {
                                        const nextIndex = sortedYears.findIndex((year) => year._id === e.target.value);
                                        setPromoteData((current) => ({
                                            ...current,
                                            fromAcademicYearId: e.target.value,
                                            toAcademicYearId: nextIndex >= 0 ? (sortedYears[nextIndex + 1]?._id || '') : ''
                                        }));
                                    }}
                                >
                                    <option value="">Select Origin Year</option>
                                    {sortedYears.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Destination Timeline</label>
                                <select 
                                    required
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary)]/10 focus:bg-white transition-all text-sm"
                                    value={promoteData.toAcademicYearId}
                                    onChange={(e) => setPromoteData({...promoteData, toAcademicYearId: e.target.value})}
                                    disabled={!immediateNextYear}
                                >
                                    <option value="">{promoteData.fromAcademicYearId ? 'No next academic year available' : 'Select the source year first'}</option>
                                    {immediateNextYear ? <option value={immediateNextYear._id}>{immediateNextYear.name}</option> : null}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Branch</label>
                            <select
                                required
                                className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary)]/10 focus:bg-white transition-all text-sm"
                                value={selectedBranchId}
                                onChange={(e) => {
                                    setSelectedBranchId(e.target.value);
                                    setPromoteData((current) => ({
                                        ...current,
                                        rules: { classMap: [{ fromClassId: '', toClassId: '', graduate: false }] }
                                    }));
                                }}
                            >
                                <option value="">Select branch</option>
                                {branches.map((branch) => (
                                    <option key={branch._id} value={branch._id}>{branch.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Rules Section (Draft UI) */}
                        <div className="promotion-rules space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ArrowUpCircle className="text-[var(--primary)]" size={18} />
                                    <h2 className="phoenix-section-title">Class transition rules</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPromoteData((current) => ({
                                        ...current,
                                        rules: {
                                            classMap: [...current.rules.classMap, { fromClassId: '', toClassId: '', graduate: false }]
                                        }
                                    }))}
                                    className="phoenix-text-action"
                                >
                                    + Add Mapping
                                </button>
                            </div>
                            
                            <div className="space-y-3">
                                {promoteData.rules.classMap.map((map, idx) => (
                                    <div key={idx} className="promotion-rule-row">
                                         <div className="flex-1 w-full p-2">
                                            <p className="text-xs font-semibold text-slate-500 mb-1.5 ml-1">Source class</p>
                                            <select
                                                required
                                                className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs font-semibold font-mono outline-none focus:ring-2 focus:ring-[var(--primary)]/10 focus:bg-white transition-all"
                                                value={map.fromClassId}
                                                onChange={(e) => {
                                                    const newMap = [...promoteData.rules.classMap];
                                                    newMap[idx] = { ...newMap[idx], fromClassId: e.target.value, toClassId: '', graduate: false };
                                                    setPromoteData({...promoteData, rules: { classMap: newMap }});
                                                }}
                                            >
                                                <option value="">Select source class</option>
                                                {classes.filter((classItem) => !promoteData.rules.classMap.some((item, mapIndex) => mapIndex !== idx && item.fromClassId === classItem._id)).map((classItem) => (
                                                    <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                                                ))}
                                            </select>
                                         </div>
                                         <ArrowRight className="text-slate-300 shrink-0 hidden sm:block" size={14} />
                                         <div className="flex-1 w-full p-2">
                                            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                                                <p className="text-xs font-semibold text-slate-500">Target class</p>
                                                <label className={`flex items-center gap-1.5 text-xs font-semibold ${isFinalGrade(map.fromClassId) ? 'cursor-pointer text-slate-500' : 'cursor-not-allowed text-slate-300'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={map.graduate === true}
                                                        disabled={!isFinalGrade(map.fromClassId)}
                                                        onChange={(e) => {
                                                            const newMap = promoteData.rules.classMap.map((item, mapIndex) => (
                                                                mapIndex === idx ? { ...item, graduate: e.target.checked, toClassId: e.target.checked ? '' : item.toClassId } : item
                                                            ));
                                                            setPromoteData({ ...promoteData, rules: { classMap: newMap } });
                                                        }}
                                                        className="accent-[var(--primary)]"
                                                    />
                                                    Graduate
                                                </label>
                                            </div>
                                            <select
                                                required={!map.graduate}
                                                disabled={map.graduate}
                                                className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs font-semibold font-mono outline-none focus:ring-2 focus:ring-[var(--primary)]/10 focus:bg-white transition-all"
                                                value={map.toClassId}
                                                onChange={(e) => {
                                                    const newMap = [...promoteData.rules.classMap];
                                                    newMap[idx].toClassId = e.target.value;
                                                    setPromoteData({...promoteData, rules: { classMap: newMap }});
                                                }}
                                            >
                                                <option value="">{map.graduate ? 'Graduates school' : 'Select target class'}</option>
                                                 {eligibleTargets(map.fromClassId).map((classItem) => (
                                                    <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                                                ))}
                                            </select>
                                         </div>
                                         {promoteData.rules.classMap.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newMap = promoteData.rules.classMap.filter((_, mapIndex) => mapIndex !== idx);
                                                    setPromoteData({...promoteData, rules: { classMap: newMap }});
                                                }}
                                                className="text-[10px] font-black uppercase tracking-wider text-rose-500 px-3"
                                            >
                                                Remove
                                            </button>
                                         )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Warnings */}
                        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 flex gap-3 text-rose-800">
                             <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                             <div>
                                <p className="text-xs font-semibold mb-0.5">Historical records are preserved</p>
                                <p className="text-xs leading-relaxed">Students failing at least half their subjects remain in the same class for the target year. Every decision preserves the source enrollment as history.</p>
                             </div>
                        </div>

                        {/* Action */}
                        <div className="pt-2 flex justify-end">
                             <button 
                                type="submit"
                                disabled={submitting}
                                className="phoenix-primary-button disabled:opacity-50"
                             >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                    <>
                                        Run promotion
                                        <GraduationCap size={14} />
                                    </>
                                )}
                             </button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
};

export default Promote;


