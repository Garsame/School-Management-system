import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, GraduationCap, Building2, Search } from 'lucide-react';
import {
    getCurrentAcademicYear,
    getStudents,
    getClasses,
    getSections,
    getTransferBranches,
    getTransferClasses,
    getTransferSections,
    transferStudent,
    transferStudentClass
} from '../../services/api/branch.api';
import { Button, Spinner, Toast } from '../../components/ui';
import { confirmAction } from '../../components/feedback/notificationService';

const listFrom = (payload) => payload?.data || payload || [];

const Transfer = () => {
    const [activeTab, setActiveTab] = useState('class'); // 'class' | 'branch'
    const [year, setYear] = useState(null);
    const [branches, setBranches] = useState([]);
    const [branchClasses, setBranchClasses] = useState([]);
    const [branchSections, setBranchSections] = useState([]);
    const [targetClasses, setTargetClasses] = useState([]);
    const [targetSections, setTargetSections] = useState([]);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [query, setQuery] = useState('');
    
    // Class Transfer form
    const [classForm, setClassForm] = useState({ newClassId: '', newSectionId: '', reason: '' });
    // Branch Transfer form
    const [branchForm, setBranchForm] = useState({ newBranchId: '', newClassId: '', newSectionId: '', reason: '' });

    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [complete, setComplete] = useState(false);
    const [receipt, setReceipt] = useState(null);
    const [classesLoading, setClassesLoading] = useState(false);
    const [sectionsLoading, setSectionsLoading] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [yearResponse, branchResponse, classesResponse] = await Promise.all([
                    getCurrentAcademicYear(),
                    getTransferBranches(),
                    getClasses()
                ]);
                setYear(yearResponse?.data || yearResponse || null);
                setBranches(listFrom(branchResponse));
                setBranchClasses(listFrom(classesResponse));
            } catch (error) {
                setToast({ type: 'error', message: error.response?.data?.message || 'Could not load transfer requirements.' });
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Inside-School: when destination class changes
    const selectInsideClass = async (newClassId) => {
        setClassForm((current) => ({ ...current, newClassId, newSectionId: '' }));
        setBranchSections([]);
        if (!newClassId) return;
        setSectionsLoading(true);
        try {
            const response = await getSections(newClassId);
            setBranchSections(listFrom(response));
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not load class sections.' });
        } finally {
            setSectionsLoading(false);
        }
    };

    // Inter-Branch: when destination branch changes
    const selectBranch = async (newBranchId) => {
        setBranchForm((current) => ({ ...current, newBranchId, newClassId: '', newSectionId: '' }));
        setTargetClasses([]);
        setTargetSections([]);
        if (!newBranchId) return;
        if (!selectedStudent) {
            setToast({ type: 'warning', message: 'Select a student before choosing the destination branch.' });
            return;
        }
        setClassesLoading(true);
        try {
            const response = await getTransferClasses(newBranchId, selectedStudent?._id);
            setTargetClasses(listFrom(response));
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not load destination classes.' });
        } finally {
            setClassesLoading(false);
        }
    };

    // Inter-Branch: when destination class changes
    const selectBranchTargetClass = async (newClassId) => {
        setBranchForm((current) => ({ ...current, newClassId, newSectionId: '' }));
        setTargetSections([]);
        if (!newClassId || !branchForm.newBranchId) return;
        try {
            const response = await getTransferSections(branchForm.newBranchId, newClassId);
            setTargetSections(listFrom(response));
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Could not load destination sections.' });
        }
    };

    const searchStudents = async (event) => {
        if (event) event.preventDefault();
        if (!query.trim()) return;
        setSearching(true);
        setStudents([]);
        try {
            const response = await getStudents({ q: query.trim(), status: 'Active' });
            setStudents(listFrom(response));
            setSelectedStudent(null);
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Student search failed.' });
        } finally {
            setSearching(false);
        }
    };

    const handleSelectStudent = (student) => {
        setSelectedStudent(student);
        // Reset forms for fresh selection
        setClassForm({ newClassId: '', newSectionId: '', reason: '' });
        setBranchForm({ newBranchId: '', newClassId: '', newSectionId: '', reason: '' });
        setBranchSections([]);
        setTargetClasses([]);
        setTargetSections([]);
    };

    // Submit Inside-School Class Transfer
    const submitClassTransfer = async (event) => {
        event.preventDefault();
        if (!selectedStudent || !year?._id || !classForm.newClassId) return;

        const currentClassLabel = selectedStudent.currentEnrollment?.classId?.name || 'Current class';
        const targetClassObj = branchClasses.find((c) => String(c._id) === String(classForm.newClassId));
        const targetClassLabel = targetClassObj?.name || 'selected class';
        const targetSectionObj = branchSections.find((s) => String(s._id) === String(classForm.newSectionId));
        const destinationSummary = targetSectionObj ? `${targetClassLabel} (${targetSectionObj.name})` : targetClassLabel;

        const confirmed = await confirmAction(
            `Transfer ${selectedStudent.firstName} ${selectedStudent.lastName} from ${currentClassLabel} to ${destinationSummary}? Past attendance, marks, and bills will remain preserved.`,
            { title: 'Confirm class transfer', confirmLabel: 'Transfer class' }
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            const response = await transferStudentClass({
                studentId: selectedStudent._id,
                newClassId: classForm.newClassId,
                newSectionId: classForm.newSectionId || undefined,
                reason: classForm.reason || 'Class transfer'
            });
            const data = response?.data || response;
            setReceipt({
                type: 'class',
                student: selectedStudent,
                previousClass: data?.previousClass?.className || currentClassLabel,
                previousSection: data?.previousClass?.sectionName || '',
                newClass: targetClassLabel,
                newSection: targetSectionObj?.name || '',
                enrollmentId: data?.enrollment?._id
            });
            setComplete(true);
            setToast({ type: 'success', message: 'Student transferred to new class successfully.' });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Class transfer failed.' });
        } finally {
            setSaving(false);
        }
    };

    // Submit Inter-Branch Transfer
    const submitBranchTransfer = async (event) => {
        event.preventDefault();
        if (!selectedStudent || !year?._id || !branchForm.newBranchId || !branchForm.newClassId) return;

        const targetBranchObj = branches.find((b) => String(b._id) === String(branchForm.newBranchId));
        const targetBranchLabel = targetBranchObj?.name || 'the destination branch';

        const confirmed = await confirmAction(
            `Transfer ${selectedStudent.firstName} ${selectedStudent.lastName} to ${targetBranchLabel}? Their current enrollment and portal branch will change.`,
            { title: 'Confirm branch transfer', confirmLabel: 'Transfer student' }
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            const response = await transferStudent({
                studentId: selectedStudent._id,
                newBranchId: branchForm.newBranchId,
                newClassId: branchForm.newClassId,
                newSectionId: branchForm.newSectionId || undefined,
                newAcademicYearId: year._id,
                reason: branchForm.reason
            });
            setReceipt({
                type: 'branch',
                student: selectedStudent,
                targetBranch: targetBranchLabel,
                enrollmentId: response?.data?._id || response?._id
            });
            setComplete(true);
            setToast({ type: 'success', message: 'Student transferred to new branch successfully.' });
        } catch (error) {
            setToast({ type: 'error', message: error.response?.data?.message || 'Branch transfer failed.' });
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        setComplete(false);
        setReceipt(null);
        setSelectedStudent(null);
        setStudents([]);
        setQuery('');
        setBranchSections([]);
        setTargetClasses([]);
        setTargetSections([]);
        setClassForm({ newClassId: '', newSectionId: '', reason: '' });
        setBranchForm({ newBranchId: '', newClassId: '', newSectionId: '', reason: '' });
    };

    const switchTab = (tab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        reset();
    };

    if (loading) return <Spinner />;

    const currentEnrollment = selectedStudent?.currentEnrollment;
    const currentClassName = currentEnrollment?.classId?.name || (selectedStudent ? 'Not actively enrolled' : 'Select student');
    const currentSectionName = currentEnrollment?.sectionId?.name ? `Section ${currentEnrollment.sectionId.name}` : '';

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header & Tabs */}
            <div className="phoenix-page-header flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="phoenix-page-title">
                        {activeTab === 'class' ? 'Inside School Class Transfer' : 'Student Branch Transfer'}
                    </h1>
                    <p className="phoenix-page-subtitle">
                        {activeTab === 'class'
                            ? 'Move a student from their current class to another class in this branch while keeping history intact.'
                            : 'Move a student from your branch to another branch while preserving academic and financial history.'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Mode Tabs */}
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                        <button
                            type="button"
                            onClick={() => switchTab('class')}
                            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
                                activeTab === 'class'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <GraduationCap size={15} className={activeTab === 'class' ? 'text-[var(--primary)]' : ''} />
                            Inside School Class Transfer
                        </button>
                        <button
                            type="button"
                            onClick={() => switchTab('branch')}
                            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${
                                activeTab === 'branch'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Building2 size={15} className={activeTab === 'branch' ? 'text-[var(--primary)]' : ''} />
                            Student Branch Transfer
                        </button>
                    </div>

                    <div className="rounded-xl border border-[#e3e6ed] bg-white px-3 py-2 text-xs font-semibold text-[#525b75]">
                        Academic Year: <span className="font-bold text-[var(--primary)]">{year?.name || 'Not active'}</span>
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {!year && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    No active academic year is configured. Transfers cannot be processed until an academic year is active.
                </div>
            )}

            {complete ? (
                <div className="phoenix-card p-10 text-center animate-fade-in">
                    <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
                    <h2 className="mt-4 text-2xl font-bold text-[#141824]">
                        {receipt?.type === 'class' ? 'Class transfer complete' : 'Branch transfer complete'}
                    </h2>
                    <p className="mt-1 text-sm text-[#6e7891]">
                        {receipt?.type === 'class'
                            ? 'The student has been enrolled in their new class. Previous records and bills remain preserved.'
                            : 'The student now belongs to the destination branch.'}
                    </p>
                    <div className="mx-auto mt-6 max-w-lg rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-left text-sm text-emerald-950 space-y-2">
                        <p><strong>Student:</strong> {[receipt?.student?.firstName, receipt?.student?.middleName, receipt?.student?.lastName].filter(Boolean).join(' ')} ({receipt?.student?.admissionNumber})</p>
                        {receipt?.type === 'class' ? (
                            <>
                                <p><strong>Previous class:</strong> {receipt.previousClass} {receipt.previousSection ? `(${receipt.previousSection})` : ''}</p>
                                <p><strong>New class:</strong> {receipt.newClass} {receipt.newSection ? `(${receipt.newSection})` : ''}</p>
                            </>
                        ) : (
                            <p><strong>Destination branch:</strong> {receipt?.targetBranch}</p>
                        )}
                        <p><strong>New enrollment ID:</strong> <span className="font-mono text-xs">{receipt?.enrollmentId || 'Created'}</span></p>
                        <p><strong>Academic year:</strong> {year?.name}</p>
                    </div>
                    <Button className="mt-6" onClick={reset}>Start another transfer</Button>
                </div>
            ) : (
                <div className="phoenix-card p-6">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {/* Left Column: Student Search & Selection */}
                        <div className="space-y-4">
                            <label className="block space-y-1.5">
                                <span className="phoenix-field-label">1. Find student</span>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-3 text-[#8a94ad]" size={16} />
                                        <input
                                            className="phoenix-control pl-9"
                                            placeholder="Student, parent, or admission number"
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') searchStudents(event);
                                            }}
                                        />
                                    </div>
                                    <Button type="button" loading={searching} onClick={searchStudents}>Search</Button>
                                </div>
                            </label>

                            {!selectedStudent && students.length > 0 && (
                                <div className="max-h-56 overflow-y-auto rounded-xl border border-[#e3e6ed] divide-y divide-[#e3e6ed] bg-white shadow-sm">
                                    {students.map((student) => {
                                        const enrolledClass = student.currentEnrollment?.classId?.name;
                                        const enrolledSection = student.currentEnrollment?.sectionId?.name;
                                        return (
                                            <button
                                                key={student._id}
                                                type="button"
                                                onClick={() => handleSelectStudent(student)}
                                                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-50 transition"
                                            >
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">
                                                        {[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-mono">{student.admissionNumber}</div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${enrolledClass ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600'}`}>
                                                        {enrolledClass ? `${enrolledClass}${enrolledSection ? ` · ${enrolledSection}` : ''}` : 'No class'}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {!searching && query.trim() && students.length === 0 && (
                                <p className="rounded-xl border border-[#e3e6ed] p-3 text-xs text-[#6e7891]">
                                    No active student matched that name or admission number.
                                </p>
                            )}

                            {selectedStudent && (
                                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-slate-900 text-base">
                                                {[selectedStudent.firstName, selectedStudent.middleName, selectedStudent.lastName].filter(Boolean).join(' ')}
                                            </p>
                                            <p className="text-xs text-slate-500 font-mono">ID: {selectedStudent.admissionNumber}</p>
                                        </div>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedStudent(null)} className="text-xs">
                                            Change Student
                                        </Button>
                                    </div>

                                    <div className="pt-2 border-t border-blue-100 flex items-center gap-2 text-xs text-blue-900">
                                        <span className="font-bold">Current Placement:</span>
                                        <span className="rounded bg-blue-100/80 px-2 py-0.5 font-semibold text-blue-800">
                                            {currentClassName} {currentSectionName}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Inside School Class Transfer Form */}
                        {activeTab === 'class' ? (
                            <form onSubmit={submitClassTransfer} className="space-y-4 lg:border-l lg:border-[#e3e6ed] lg:pl-6">
                                <div className="space-y-1.5">
                                    <label className="phoenix-field-label">Current class (at change time)</label>
                                    <input
                                        type="text"
                                        className="phoenix-control bg-slate-50 text-slate-700 font-semibold cursor-not-allowed"
                                        value={selectedStudent ? `${currentClassName} ${currentSectionName}`.trim() : 'Select a student on the left'}
                                        disabled
                                        readOnly
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="space-y-1.5">
                                        <span className="phoenix-field-label">2. Destination class</span>
                                        <select
                                            className="phoenix-control"
                                            value={classForm.newClassId}
                                            onChange={(e) => selectInsideClass(e.target.value)}
                                            required
                                            disabled={!selectedStudent}
                                        >
                                            <option value="">-- Choose New Class --</option>
                                            {branchClasses.map((cls) => {
                                                const isCurrent = selectedStudent?.currentEnrollment?.classId?._id === cls._id;
                                                return (
                                                    <option key={cls._id} value={cls._id}>
                                                        {cls.name} {isCurrent ? '(Current Class)' : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </label>

                                    <label className="space-y-1.5">
                                        <span className="phoenix-field-label">Destination section</span>
                                        <select
                                            className="phoenix-control"
                                            value={classForm.newSectionId}
                                            onChange={(e) => setClassForm({ ...classForm, newSectionId: e.target.value })}
                                            disabled={!classForm.newClassId || sectionsLoading}
                                        >
                                            <option value="">
                                                {sectionsLoading
                                                    ? 'Loading sections...'
                                                    : branchSections.length
                                                        ? '-- Choose Section --'
                                                        : 'No sections configured'}
                                            </option>
                                            {branchSections.map((sec) => (
                                                <option key={sec._id} value={sec._id}>
                                                    {sec.name} {sec.capacity ? `(Cap: ${sec.capacity})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <label className="block space-y-1.5">
                                    <span className="phoenix-field-label">Reason for transfer (optional)</span>
                                    <input
                                        className="phoenix-control"
                                        placeholder="E.g., Section stream re-balancing, class reassignment"
                                        value={classForm.reason}
                                        onChange={(e) => setClassForm({ ...classForm, reason: e.target.value })}
                                        disabled={!selectedStudent}
                                    />
                                </label>

                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 leading-relaxed">
                                    <strong>Transfer effect:</strong> Current enrollment is closed as <em>Transferred</em>, a new class enrollment is created in the same branch, and all existing financial records, grades, and attendance remain fully linked.
                                </div>

                                <Button
                                    className="w-full h-11"
                                    type="submit"
                                    loading={saving}
                                    disabled={!year || !selectedStudent || !classForm.newClassId}
                                >
                                    <ArrowRightLeft size={16} /> Transfer class
                                </Button>
                            </form>
                        ) : (
                            /* Right Column: Inter-Branch Transfer Form */
                            <form onSubmit={submitBranchTransfer} className="space-y-4 lg:border-l lg:border-[#e3e6ed] lg:pl-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="space-y-1.5">
                                        <span className="phoenix-field-label">Destination branch</span>
                                        <select
                                            className="phoenix-control"
                                            value={branchForm.newBranchId}
                                            onChange={(e) => selectBranch(e.target.value)}
                                            required
                                            disabled={!selectedStudent}
                                        >
                                            <option value="">Select branch</option>
                                            {branches.map((branch) => (
                                                <option key={branch._id} value={branch._id}>{branch.name}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="space-y-1.5">
                                        <span className="phoenix-field-label">Destination class (same grade)</span>
                                        <select
                                            className="phoenix-control"
                                            value={branchForm.newClassId}
                                            onChange={(e) => selectBranchTargetClass(e.target.value)}
                                            required
                                            disabled={!branchForm.newBranchId || classesLoading}
                                        >
                                            <option value="">
                                                {classesLoading
                                                    ? 'Loading matching classes...'
                                                    : branchForm.newBranchId && targetClasses.length === 0
                                                        ? 'No matching grade configured'
                                                        : 'Select class'}
                                            </option>
                                            {targetClasses.map((item) => (
                                                <option key={item._id} value={item._id}>{item.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="space-y-1.5">
                                        <span className="phoenix-field-label">Destination section</span>
                                        <select
                                            className="phoenix-control"
                                            value={branchForm.newSectionId}
                                            onChange={(e) => setBranchForm({ ...branchForm, newSectionId: e.target.value })}
                                            disabled={!branchForm.newClassId}
                                            required={targetSections.length > 0}
                                        >
                                            <option value="">
                                                {targetSections.length ? 'Select section' : 'No sections configured'}
                                            </option>
                                            {targetSections.map((section) => (
                                                <option key={section._id} value={section._id}>{section.name}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="space-y-1.5">
                                        <span className="phoenix-field-label">Reason</span>
                                        <input
                                            className="phoenix-control"
                                            placeholder="Reason for branch transfer"
                                            value={branchForm.reason}
                                            onChange={(e) => setBranchForm({ ...branchForm, reason: e.target.value })}
                                            required
                                            disabled={!selectedStudent}
                                        />
                                    </label>
                                </div>

                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 leading-relaxed">
                                    <strong>Transfer effect:</strong> Current enrollment becomes Transferred, a destination enrollment is created in the selected branch, and the student portal moves to the destination branch.
                                </div>

                                <Button
                                    className="w-full h-11"
                                    type="submit"
                                    loading={saving}
                                    disabled={!year || !selectedStudent || !branchForm.newBranchId || !branchForm.newClassId}
                                >
                                    <ArrowRightLeft size={16} /> Transfer student to branch
                                </Button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Transfer;
