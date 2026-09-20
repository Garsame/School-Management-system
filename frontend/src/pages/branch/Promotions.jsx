import React, { useEffect, useState } from 'react';
import { getAcademicYears, getClasses, promoteStudents } from '../../services/api/branch.api';
import { Button, Spinner, Toast, Select } from '../../components/ui';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { confirmAction } from '../../components/feedback/notificationService';

const gradeNumber = (value) => {
    const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
};

const recordId = (value) => String(value?._id || value || '');

const findNextClass = (sourceClass, classes) => {
    const sourceGrade = gradeNumber(sourceClass.gradeLevel);
    if (!Number.isFinite(sourceGrade)) return null;
    const candidates = classes.filter((candidate) => gradeNumber(candidate.gradeLevel) === sourceGrade + 1);
    const sameCategory = candidates.find((candidate) => recordId(candidate.categoryId) === recordId(sourceClass.categoryId));
    return sameCategory || candidates[0] || null;
};

const Promotions = () => {
    const [currentYear, setCurrentYear] = useState(null);
    const [years, setYears] = useState([]);
    const [targetYearId, setTargetYearId] = useState('');
    const [classMap, setClassMap] = useState([]); // [{ fromClassId, toClassId }]
    const [loading, setLoading] = useState(true);
    const [promoting, setPromoting] = useState(false);
    const [toast, setToast] = useState(null);
    const [promotionResult, setPromotionResult] = useState(null);

    useEffect(() => {
        const init = async () => {
            try {
                const [yearsRes, classRes] = await Promise.all([
                    getAcademicYears(),
                    getClasses()
                ]);
                const yearRows = Array.isArray(yearsRes) ? yearsRes : (yearsRes?.data || []);
                const classRows = classRes?.data || [];
                const currentYearPayload = yearRows.find((year) => year.isCurrent) || null;
                const currentStart = currentYearPayload ? new Date(currentYearPayload.startDate).getTime() : Number.NaN;
                const nextYear = yearRows
                    .filter((year) => new Date(year.startDate).getTime() > currentStart)
                    .sort((left, right) => new Date(left.startDate) - new Date(right.startDate))[0] || null;

                setCurrentYear(currentYearPayload);
                setYears(nextYear ? [nextYear] : []);
                const initialMap = classRows.map((sourceClass) => {
                    const nextClass = findNextClass(sourceClass, classRows);
                    return {
                        fromClassId: sourceClass._id,
                        fromClassName: sourceClass.name,
                        toClassId: nextClass?._id || '',
                        toClassName: nextClass?.name || ''
                    };
                });
                setClassMap(initialMap);

                if (nextYear) {
                    setTargetYearId(nextYear._id);
                }
                if (!currentYearPayload) {
                    setToast({ type: 'error', message: 'No current academic year is set by the school administrator.' });
                } else if (!nextYear) {
                    setToast({ type: 'warning', message: 'Create the next academic year before running promotion.' });
                }

            } catch (err) {
                console.error(err);
                setToast({ type: 'error', message: err.response?.data?.message || 'Academic years or classes could not be loaded.' });
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const handlePromote = async () => {
        if (!currentYear) return setToast({ type: 'error', message: 'No current active year found' });
        if (!targetYearId) return setToast({ type: 'error', message: 'Please select target academic year' });
        
        const activeMaps = classMap.filter(m => m.toClassId !== '');
        if (activeMaps.length === 0) return setToast({ type: 'error', message: 'No class has an exact next grade configured.' });

        if (!(await confirmAction(`Promote students from ${activeMaps.length} classes? This will create their next-year enrollments.`, { title: 'Confirm promotion', confirmLabel: 'Promote', tone: 'primary' }))) return;

        setPromoting(true);
        setPromotionResult(null);
        try {
            const payload = {
                fromAcademicYearId: currentYear._id,
                toAcademicYearId: targetYearId,
                rules: {
                    classMap: activeMaps.map(m => ({ fromClassId: m.fromClassId, toClassId: m.toClassId }))
                }
            };
            
            const res = await promoteStudents(payload);
            const stats = res?.data || {};
            setPromotionResult(stats);
            setToast({
                type: 'success',
                message: `Promotion complete: ${stats.promoted || 0} promoted, ${stats.retained || 0} retained, ${stats.incomplete || 0} incomplete, ${stats.failed || 0} processing errors.`
            });
        } catch (err) {
            setToast({ type: 'error', message: err.response?.data?.message || 'Promotion failed' });
        } finally {
            setPromoting(false);
        }
    };

    if (loading) return <div className="h-96 flex items-center justify-center"><Spinner /></div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Student Promotions</h1>
                    <p className="phoenix-page-subtitle">Batch promote student cohorts to their respective classes for the next academic cycle.</p>
                </div>
            </div>
            
            <div className="p-3 bg-[#fff2df] rounded border border-[#e5780b]/30 flex gap-2.5 items-start">
                <AlertTriangle className="text-[#e5780b] mt-0.5 shrink-0" size={16} />
                <div>
                    <p className="text-xs font-bold text-[#141824] uppercase tracking-wider">Promotion rule</p>
                    <p className="text-xs text-[#525b75] mt-0.5">Students who fail at least half their subjects remain in the same class. Complete results are required before a decision is applied.</p>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {promotionResult && (
                <section className="phoenix-card p-4">
                    <h2 className="phoenix-section-title">Promotion outcome</h2>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                        <div><p className="text-xl font-bold text-emerald-700">{promotionResult.promoted || 0}</p><p className="text-xs text-[#6e7891]">Promoted</p></div>
                        <div><p className="text-xl font-bold text-rose-700">{promotionResult.retained || 0}</p><p className="text-xs text-[#6e7891]">Retained</p></div>
                        <div><p className="text-xl font-bold text-amber-700">{promotionResult.incomplete || 0}</p><p className="text-xs text-[#6e7891]">Incomplete</p></div>
                        <div><p className="text-xl font-bold text-[#141824]">{promotionResult.skippedExisting || 0}</p><p className="text-xs text-[#6e7891]">Already enrolled</p></div>
                    </div>
                    {(promotionResult.retainedStudents || []).length > 0 && (
                        <div className="mt-5 max-h-64 overflow-y-auto border-t border-[#e3e6ed] pt-3">
                            <p className="mb-2 text-xs font-bold uppercase text-[#525b75]">Retained students</p>
                            {(promotionResult.retainedStudents || []).map((student) => (
                                <div key={String(student.studentId)} className="flex items-center justify-between gap-4 border-b border-[#e3e6ed] py-2 text-xs last:border-0">
                                    <span className="font-semibold text-[#141824]">{student.admissionNumber} - {student.name}</span>
                                    <span className="text-rose-700">Failed {student.failedSubjects}/{student.totalSubjects}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            <article className="phoenix-card p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="text-xs font-semibold text-[#525b75] uppercase tracking-wider mb-1 block">Current Academic Year</label>
                        <div className="p-2.5 bg-[#f5f7fa] rounded border border-[#cbd0dd] font-bold text-[#141824] text-sm">
                            {currentYear?.name || 'Not Set'}
                        </div>
                    </div>
                    <div>
                        <Select
                            label="Target Academic Year"
                            value={targetYearId}
                            onChange={(e) => setTargetYearId(e.target.value)}
                            options={years
                                .map((y) => ({ value: y._id, label: y.name }))}
                            placeholder="Select Target Year"
                        />
                        <p className="text-[10px] text-[#8a94ad] mt-1">Only the immediate next academic year is available.</p>
                    </div>
                </div>

                <h3 className="font-bold text-[#141824] text-xs uppercase tracking-wider mb-3">Class Mapping Rules</h3>
                <div className="space-y-2">
                    {classMap.map((mapItem) => (
                        <div key={mapItem.fromClassId} className="flex items-center gap-4 p-2.5 border border-[#e3e6ed] rounded hover:bg-[#f5f7fa] transition-colors">
                            <div className="w-1/3 font-semibold text-[#141824] text-xs">
                                {mapItem.fromClassName}
                            </div>
                            <ArrowRight className="text-[#8a94ad]" size={14} />
                            <div className="w-1/2 md:w-1/3">
                                <div className={`w-full border px-3 py-1.5 text-xs font-semibold ${mapItem.toClassId ? 'border-[#cbd0dd] bg-white text-[#141824]' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                    {mapItem.toClassName || 'No next grade configured'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex justify-end">
                    <Button 
                        onClick={handlePromote} 
                        disabled={promoting || !currentYear || !targetYearId || !classMap.some((mapping) => mapping.toClassId)}
                        variant="primary"
                        className="w-full md:w-auto text-xs"
                    >
                        {promoting ? 'Processing...' : 'Run Promotion Cycle'}
                    </Button>
                </div>
            </article>
        </div>
    );
};

export default Promotions;
