import React, { useState, useEffect } from 'react';
import {
    getMyDugsiStudents,
    getCandidateStudents,
    enrollStudents,
    withdrawStudent,
    updateLearningStage,
    getMyAllocatedClasses
} from '../../services/api/dugsi.api';
import { Button, Input, Select, Badge } from '../../components/ui';
import { Users, UserPlus, Trash2, BookOpen, CheckCircle, AlertCircle, Loader2, Sparkles, X } from 'lucide-react';
import { notify, confirmAction } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const unwrapList = (response) => {
    const payload = response?.data?.data ?? response?.data ?? response;
    return Array.isArray(payload) ? payload : [];
};

const DugsiStudents = () => {
    const { user } = useAuth();
    const canManage = hasPermission(user, 'dugsi.students.manage');

    const [students, setStudents] = useState([]);
    const [allocatedClasses, setAllocatedClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [stageFilter, setStageFilter] = useState('ALL');

    // Add Student Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
    const [enrollStage, setEnrollStage] = useState('READING');
    const [modalSearch, setModalSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [studentsRes, classesRes] = await Promise.all([
                getMyDugsiStudents(),
                getMyAllocatedClasses()
            ]);
            setStudents(unwrapList(studentsRes));
            setAllocatedClasses(unwrapList(classesRes));
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to load Dugsi students');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openAddModal = async () => {
        setModalOpen(true);
        setCandidatesLoading(true);
        setSelectedStudentIds(new Set());
        try {
            const res = await getCandidateStudents();
            setCandidates(unwrapList(res));
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to load candidate students');
        } finally {
            setCandidatesLoading(false);
        }
    };

    const toggleSelectCandidate = (studentId) => {
        const next = new Set(selectedStudentIds);
        if (next.has(studentId)) {
            next.delete(studentId);
        } else {
            next.add(studentId);
        }
        setSelectedStudentIds(next);
    };

    const handleEnroll = async () => {
        if (!selectedStudentIds.size) {
            notify.error('Please select at least one student');
            return;
        }
        setSubmitting(true);
        try {
            const res = await enrollStudents({
                studentIds: Array.from(selectedStudentIds),
                learningStage: enrollStage
            });
            notify.success(res.message || 'Students successfully added to your Dugsi');
            setModalOpen(false);
            loadData();
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to enroll students');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveStudent = async (student) => {
        const confirmed = await confirmAction(
            `Are you sure you want to remove ${student.name} from your Dugsi circle? Their attendance and Quran progress records will be preserved.`
        );
        if (!confirmed) return;

        try {
            await withdrawStudent(student._id);
            notify.success(`${student.name} removed from Dugsi`);
            loadData();
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to remove student');
        }
    };

    const handleToggleStage = async (student) => {
        const nextStage = student.learningStage === 'READING' ? 'MEMORIZING' : 'READING';
        try {
            await updateLearningStage(student._id, nextStage);
            notify.success(`Updated ${student.name}'s stage to ${nextStage === 'MEMORIZING' ? 'Memorization (Hifz)' : 'Reading (Qaida)'}`);
            setStudents((prev) =>
                prev.map((s) => (s._id === student._id ? { ...s, learningStage: nextStage } : s))
            );
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to update learning stage');
        }
    };

    const filteredStudents = students.filter((s) => {
        const matchesSearch =
            s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.admissionNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.className?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStage = stageFilter === 'ALL' || s.learningStage === stageFilter;
        return matchesSearch && matchesStage;
    });

    const filteredCandidates = candidates.filter((c) => {
        const q = modalSearch.toLowerCase();
        return (
            c.name?.toLowerCase().includes(q) ||
            c.admissionNumber?.toLowerCase().includes(q) ||
            c.className?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quran Dugsi Students</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Manage your Dugsi student circle, track learning stages, and import students from your allocated classes.
                    </p>
                </div>
                {canManage && (
                    <Button onClick={openAddModal} className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Add Students from Classes
                    </Button>
                )}
            </div>

            {/* Allocated Classes Banner */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
                <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-[var(--primary)]" />
                    <div>
                        <h4 className="text-sm font-semibold text-slate-900">My Allocated Classes</h4>
                        <p className="text-xs text-slate-600 mt-0.5">
                            {allocatedClasses.length > 0
                                ? `You can select Dugsi students from: ${allocatedClasses.map((c) => c.name).join(', ')}`
                                : 'No classes assigned yet by the administrator. Contact your school admin to allocate classes.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                    <Input
                        placeholder="Search student name, admission #, class..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Select
                        value={stageFilter}
                        onChange={(e) => setStageFilter(e.target.value)}
                        options={[
                            { value: 'ALL', label: 'All Learning Stages' },
                            { value: 'READING', label: 'Qaida / Reading' },
                            { value: 'MEMORIZING', label: 'Memorization (Hifz)' }
                        ]}
                        className="w-48"
                    />
                </div>
            </div>

            {/* Students Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                    <div className="flex h-48 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="p-12 text-center">
                        <Users className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-3 text-base font-semibold text-slate-800">No students in your Dugsi yet</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Click &ldquo;Add Students from Classes&rdquo; to select the children who attend your Quran circle.
                        </p>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-6 py-3">Student</th>
                                <th className="px-6 py-3">Admission #</th>
                                <th className="px-6 py-3">School Class</th>
                                <th className="px-6 py-3">Learning Stage</th>
                                <th className="px-6 py-3">Latest Quran Progress</th>
                                {canManage && <th className="px-6 py-3 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredStudents.map((s) => (
                                <tr key={s._id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        <div className="flex items-center gap-2">
                                            <span>{s.name}</span>
                                            {s.gender && (
                                                <span className="text-xs text-slate-400">({s.gender[0]})</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">{s.admissionNumber}</td>
                                    <td className="px-6 py-4 text-slate-600">{s.className}</td>
                                    <td className="px-6 py-4">
                                        {canManage ? (
                                            <button
                                                onClick={() => handleToggleStage(s)}
                                                className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold cursor-pointer transition-all"
                                            >
                                                {s.learningStage === 'MEMORIZING' ? (
                                                    <span className="bg-emerald-100 text-emerald-800 group-hover:bg-emerald-200 px-2.5 py-0.5 rounded-full">
                                                        Memorization (Hifz)
                                                    </span>
                                                ) : (
                                                    <span className="bg-blue-100 text-blue-800 group-hover:bg-blue-200 px-2.5 py-0.5 rounded-full">
                                                        Reading (Qaida)
                                                    </span>
                                                )}
                                            </button>
                                        ) : (
                                            <Badge variant={s.learningStage === 'MEMORIZING' ? 'success' : 'info'}>
                                                {s.learningStage === 'MEMORIZING' ? 'Memorization' : 'Reading'}
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-600">
                                        {s.latestProgress ? (
                                            <div>
                                                <span className="font-semibold text-slate-900">
                                                    {s.latestProgress.surahName || `Surah #${s.latestProgress.surahNumber}`}
                                                </span>
                                                {s.latestProgress.juz && (
                                                    <span className="text-slate-500 ml-1.5">(Juz {s.latestProgress.juz})</span>
                                                )}
                                                {s.latestProgress.startAyah && s.latestProgress.endAyah && (
                                                    <div className="text-[11px] text-slate-400">
                                                        Ayah {s.latestProgress.startAyah} - {s.latestProgress.endAyah}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">No progress logged</span>
                                        )}
                                    </td>
                                    {canManage && (
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleRemoveStudent(s)}
                                                className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                                                title="Remove from Dugsi"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Students Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Select Students for Your Dugsi</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Tick the students from your allocated classes who attend your Quran circle.
                                </p>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Controls */}
                        <div className="p-6 border-b border-slate-100 space-y-4 bg-slate-50/50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Default Learning Stage for Selected
                                    </label>
                                    <Select
                                        value={enrollStage}
                                        onChange={(e) => setEnrollStage(e.target.value)}
                                        options={[
                                            { value: 'READING', label: 'Qaida / Reading (Qira\'ah)' },
                                            { value: 'MEMORIZING', label: 'Memorization (Hifz)' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Search Candidate Students
                                    </label>
                                    <Input
                                        placeholder="Filter by name, class, or admission #..."
                                        value={modalSearch}
                                        onChange={(e) => setModalSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Candidates List */}
                        <div className="p-6 overflow-y-auto flex-1 divide-y divide-slate-100">
                            {candidatesLoading ? (
                                <div className="flex h-48 items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                                </div>
                            ) : filteredCandidates.length === 0 ? (
                                <div className="py-12 text-center text-sm text-slate-500">
                                    No students found in your allocated classes.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredCandidates.map((c) => {
                                         const isChecked = selectedStudentIds.has(c.studentId);
                                         const isAlreadyInMine = c.isEnrolledWithMe;
                                         const isOtherDugsi = c.isEnrolledInDugsi && !c.isEnrolledWithMe;

                                         return (
                                             <div
                                                 key={c.studentId}
                                                 className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                                     isOtherDugsi
                                                         ? 'bg-amber-50/50 border-amber-200 opacity-80'
                                                         : isAlreadyInMine
                                                         ? 'bg-emerald-50/60 border-emerald-200'
                                                         : isChecked
                                                         ? 'bg-[var(--primary-soft)] border-[var(--primary)] ring-1 ring-[var(--primary)]'
                                                         : 'bg-white border-slate-200 hover:border-slate-300'
                                                 }`}
                                             >
                                                 <div className="flex items-center gap-3">
                                                     <input
                                                         type="checkbox"
                                                         disabled={isOtherDugsi || isAlreadyInMine}
                                                         checked={isChecked || isAlreadyInMine}
                                                         onChange={() => toggleSelectCandidate(c.studentId)}
                                                         className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer disabled:cursor-not-allowed"
                                                     />
                                                     <div>
                                                         <div className="text-sm font-semibold text-slate-900">
                                                             {c.name}
                                                         </div>
                                                         <div className="text-xs text-slate-500">
                                                             {c.className} • Adm: <span className="font-mono">{c.admissionNumber}</span>
                                                         </div>
                                                     </div>
                                                 </div>

                                                 <div>
                                                     {isOtherDugsi ? (
                                                         <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium bg-amber-100 px-2.5 py-0.5 rounded-full">
                                                             <AlertCircle className="h-3 w-3" />
                                                             In {c.enrolledTeacherName}&apos;s Dugsi
                                                         </span>
                                                     ) : isAlreadyInMine ? (
                                                         <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium bg-emerald-100 px-2.5 py-0.5 rounded-full">
                                                             <CheckCircle className="h-3 w-3" />
                                                             Already in your Dugsi
                                                         </span>
                                                     ) : isChecked ? (
                                                         <span className="text-xs font-semibold text-[var(--primary)]">Selected</span>
                                                     ) : null}
                                                 </div>
                                             </div>
                                         );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/80">
                            <span className="text-xs text-slate-600 font-medium">
                                {selectedStudentIds.size} student(s) selected
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleEnroll}
                                    disabled={!selectedStudentIds.size || submitting}
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        `Add ${selectedStudentIds.size} Student(s)`
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DugsiStudents;
