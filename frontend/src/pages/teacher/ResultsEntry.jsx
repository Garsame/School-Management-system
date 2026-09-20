import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, Button, Select, Spinner, Toast, Badge } from '../../components/ui';
import {
    batchEnterResults,
    getExamStudents,
    getExams,
    getTeacherAssignments
} from '../../services/api/teacher.api';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    ClipboardList,
    Save,
    Search,
    Users
} from 'lucide-react';

const asArray = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const getId = (value) => value?._id || value || '';

const uniqueById = (items) => {
    const map = new Map();
    (items || []).forEach((item) => {
        const id = getId(item);
        if (id && !map.has(id)) map.set(id, item);
    });
    return Array.from(map.values());
};

const studentName = (student) => {
    const first = student?.firstName || '';
    const last = student?.lastName || '';
    return `${first} ${last}`.trim() || student?.name || 'Unnamed Student';
};

const studentInitials = (student) => {
    const name = studentName(student);
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
};

const ResultsEntry = () => {
    const [searchParams] = useSearchParams();
    const { examId: routeExamId } = useParams();
    const navigate = useNavigate();

    const examIdParam = routeExamId || searchParams.get('examId');
    const classIdParam = searchParams.get('classId');

    const [exams, setExams] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [students, setStudents] = useState([]);
    const [existingResults, setExistingResults] = useState([]);
    const [activeExam, setActiveExam] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState({ message: '', type: 'success' });
    const [entryDisabledReason, setEntryDisabledReason] = useState('');
    const [selection, setSelection] = useState({
        classId: classIdParam || '',
        subjectId: '',
        examId: examIdParam || ''
    });
    const [scores, setScores] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [examsRes, assignmentsRes] = await Promise.all([
                    getExams(),
                    getTeacherAssignments()
                ]);
                setExams(asArray(examsRes));
                setAssignments(asArray(assignmentsRes));
            } catch {
                setToast({ message: 'Failed to fetch teacher assignments and exams', type: 'error' });
            } finally {
                if (!examIdParam) setLoading(false);
            }
        };
        fetchData();
    }, [examIdParam]);

    useEffect(() => {
        if (routeExamId) {
            setSelection((prev) => routeExamId === prev.examId ? prev : { ...prev, examId: routeExamId });
        }
    }, [routeExamId]);

    useEffect(() => {
        const fetchContext = async () => {
            if (!selection.examId) {
                setStudents([]);
                setExistingResults([]);
                setScores({});
                setActiveExam(null);
                setEntryDisabledReason('');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const response = await getExamStudents(selection.examId);
                const context = response?.data || response || {};
                const exam = context.exam || null;
                const studentRows = context.students || [];
                const resultRows = context.existingResults || [];

                setStudents(studentRows);
                setExistingResults(resultRows);
                setActiveExam(exam);

                const existingMap = new Map((resultRows || []).map((result) => [
                    String(getId(result.studentId)),
                    result
                ]));

                const initialScores = {};
                (studentRows || []).forEach((student) => {
                    const existing = existingMap.get(String(student._id));
                    initialScores[student._id] = {
                        marksObtained: existing ? existing.marksObtained : 0,
                        isAbsent: existing ? !!existing.isAbsent : false,
                        remarks: existing ? existing.remarks || '' : ''
                    };
                });
                setScores(initialScores);

                const status = String(exam?.status || 'DRAFT').toUpperCase();
                if (status !== 'OPEN') {
                    setEntryDisabledReason('This exam is closed');
                } else if (exam?.canEnter === false) {
                    setEntryDisabledReason('You are not assigned to this exam');
                } else {
                    setEntryDisabledReason('');
                }

                if (exam) {
                    setSelection((prev) => ({
                        ...prev,
                        classId: getId(exam.classId) || prev.classId,
                        subjectId: getId(exam.subjectId) || prev.subjectId
                    }));
                }
            } catch (err) {
                console.error('[RESULT ENTRY ERROR]', err);
                setToast({ message: err.response?.data?.message || 'Failed to load exam students', type: 'error' });
            } finally {
                setLoading(false);
            }
        };

        fetchContext();
    }, [selection.examId]);

    const classOptions = useMemo(() => {
        const classes = uniqueById((assignments || []).map((assignment) => assignment.classId).filter(Boolean));
        return (classes || []).map((item) => ({ label: item?.name || 'Unnamed Class', value: item?._id }));
    }, [assignments]);

    const subjectOptions = useMemo(() => {
        const filtered = (assignments || []).filter((assignment) => {
            if (!selection.classId) return false;
            return String(getId(assignment.classId)) === String(selection.classId);
        });
        const subjects = uniqueById((filtered || []).map((assignment) => assignment.subjectId).filter(Boolean));
        return (subjects || []).map((item) => ({ label: item?.name || 'Unnamed Subject', value: item?._id }));
    }, [assignments, selection.classId]);

    const availableExams = useMemo(() => (exams || []).filter((exam) => {
        const matchesClass = selection.classId
            ? String(getId(exam.classId)) === String(selection.classId)
            : true;
        const matchesSubject = selection.subjectId
            ? String(getId(exam.subjectId)) === String(selection.subjectId)
            : true;
        return matchesClass && matchesSubject;
    }), [exams, selection.classId, selection.subjectId]);

    const handleScoreChange = (studentId, field, value) => {
        setScores((prev) => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: field === 'marksObtained' ? (value === '' ? '' : Number(value)) : value
            }
        }));
    };

    const handleBatchSubmit = async (e) => {
        e.preventDefault();
        if (!selection.examId || !activeExam) return;
        if (entryDisabledReason) {
            setToast({ message: `Entry disabled: ${entryDisabledReason}`, type: 'error' });
            return;
        }

        const maxScore = activeExam.maxScore || 100;
        const payload = [];

        for (const studentId in scores) {
            const score = scores[studentId];
            if (!score.isAbsent && (score.marksObtained < 0 || score.marksObtained > maxScore)) {
                setToast({ message: `One score is invalid. Maximum allowed score is ${maxScore}.`, type: 'error' });
                return;
            }
            payload.push({ studentId, ...score });
        }

        setSubmitting(true);
        try {
            await batchEnterResults(selection.examId, payload);
            setToast({ message: 'Results saved successfully', type: 'success' });
            setTimeout(() => navigate('/teacher/exams'), 1500);
        } catch (err) {
            setToast({ message: err.response?.data?.message || 'Failed to save results', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const maxScore = activeExam?.maxScore || 100;
    const recordedCount = (existingResults || []).length;

    if (loading) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <p className="text-xs font-semibold text-slate-400">Loading result entry...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            <div className="phoenix-page-header">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd0dd] bg-white text-[#525b75] hover:text-[var(--primary)]"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h1 className="phoenix-page-title">Enter Results</h1>
                        <p className="phoenix-page-subtitle">Select an open exam and record student scores.</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm text-center">
                        <p className="text-[10px] font-semibold text-slate-500">Students</p>
                        <p className="font-bold text-slate-900 text-sm">{students.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm text-center">
                        <p className="text-[10px] font-semibold text-slate-500">Recorded</p>
                        <p className="font-bold text-[var(--primary)] text-sm">{recordedCount}</p>
                    </div>
                </div>
            </div>

            <div className="phoenix-card">
                <div className="phoenix-card-body">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <Select
                            label="Class"
                            options={classOptions}
                            value={selection.classId}
                            onChange={(e) => setSelection((prev) => ({ ...prev, classId: e.target.value, subjectId: '', examId: '' }))}
                            placeholder="Select class"
                        />
                        <Select
                            label="Subject"
                            options={subjectOptions}
                            value={selection.subjectId}
                            onChange={(e) => setSelection((prev) => ({ ...prev, subjectId: e.target.value, examId: '' }))}
                            placeholder="Select subject"
                            disabled={!selection.classId}
                        />
                        <Select
                            label="Exam"
                            options={(availableExams || []).map((exam) => ({
                                label: `${exam?.name || exam?.examCategoryId?.name || 'Unnamed Exam'} (${exam?.termId?.name || 'No term'})`,
                                value: exam?._id
                            }))}
                            value={selection.examId}
                            onChange={(e) => setSelection((prev) => ({ ...prev, examId: e.target.value }))}
                            placeholder="Select exam"
                            disabled={!selection.subjectId}
                        />
                    </div>
                </div>
            </div>

            {!selection.examId ? (
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex flex-col items-center justify-center py-12 text-center">
                        <Search size={40} className="mb-3 text-slate-300" />
                        <h2 className="text-lg font-bold text-slate-800">Choose an exam to begin</h2>
                        <p className="mt-1 max-w-md text-sm text-slate-500">
                            Pick the class, subject, and exam above. Only open exams allow score entry.
                        </p>
                    </div>
                </div>
            ) : !activeExam ? (
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex flex-col items-center justify-center py-12 text-center">
                        <Spinner size="lg" />
                        <p className="text-sm font-semibold text-slate-400 mt-2">Loading exam context...</p>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleBatchSubmit} className="space-y-6">
                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                                <div className="md:col-span-2">
                                    <p className="text-xs font-semibold text-slate-500">Exam</p>
                                    <h2 className="mt-1 text-lg font-bold text-slate-900">
                                        {activeExam.name || activeExam.examCategoryId?.name || 'Unnamed Exam'}
                                    </h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {activeExam.classId?.name || 'Class'} - {activeExam.subjectId?.name || 'Subject'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2">
                                    <p className="text-[10px] font-semibold text-slate-500">Max Score</p>
                                    <p className="mt-1 font-bold text-slate-900 text-sm">{maxScore}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2">
                                    <p className="text-[10px] font-semibold text-slate-500">Status</p>
                                    <Badge variant={String(activeExam.status).toUpperCase() === 'OPEN' ? 'success' : 'warning'} className="mt-1 rounded-lg">
                                        {activeExam.status || 'DRAFT'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>

                    {entryDisabledReason && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
                            <AlertCircle size={20} className="mt-0.5 shrink-0" />
                            <div>
                                <p className="font-bold">Result entry is disabled</p>
                                <p className="text-sm">{entryDisabledReason}</p>
                            </div>
                        </div>
                    )}

                    <div className="phoenix-card">
                        <div className="phoenix-card-body p-0">
                            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Student Marksheet</h3>
                                    <p className="text-xs text-slate-500 font-semibold">Mark absent students and enter scores for present students.</p>
                                </div>
                                <Badge variant="outline" className="rounded-lg">
                                    <div className="flex items-center gap-1.5">
                                        <Users size={12} />
                                        <span>{students.length} students</span>
                                    </div>
                                </Badge>
                            </div>

                            {(students || []).length === 0 ? (
                                <div className="p-10 text-center">
                                    <ClipboardList size={38} className="mx-auto mb-3 text-slate-300" />
                                    <p className="font-bold text-slate-700">No students found for this exam</p>
                                    <p className="mt-1 text-sm text-slate-500">Check the exam class/enrollment setup.</p>
                                </div>
                            ) : (
                                <div className="phoenix-table-shell">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[900px] w-full text-left text-sm">
                                            <thead className="bg-[#f5f7fa] text-xs font-semibold text-slate-500">
                                                <tr>
                                                    <th className="px-4 py-3">Student</th>
                                                    <th className="px-4 py-3 text-center">Attendance</th>
                                                    <th className="px-4 py-3 text-center">Score</th>
                                                    <th className="px-4 py-3">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {(students || []).map((student) => {
                                                    const scoreData = scores[student._id] || { marksObtained: 0, isAbsent: false, remarks: '' };
                                                    const hasResult = (existingResults || []).some((result) => String(getId(result.studentId)) === String(student._id));

                                                    return (
                                                        <tr key={student._id} className={scoreData.isAbsent ? 'bg-rose-50/40' : 'hover:bg-slate-50/70'}>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">
                                                                        {studentInitials(student)}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <p className="font-bold text-slate-900 text-sm">{studentName(student)}</p>
                                                                            {hasResult && <CheckCircle2 size={14} className="text-emerald-500" />}
                                                                        </div>
                                                                        <p className="text-xs text-slate-400">#{student.admissionNumber || student.studentCode || student._id}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <label className="mx-auto flex w-fit cursor-pointer items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                                                        checked={scoreData.isAbsent}
                                                                        onChange={(e) => handleScoreChange(student._id, 'isAbsent', e.target.checked)}
                                                                        disabled={!!entryDisabledReason}
                                                                    />
                                                                    <span className={`text-xs font-semibold ${scoreData.isAbsent ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                        {scoreData.isAbsent ? 'Absent' : 'Present'}
                                                                    </span>
                                                                </label>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="mx-auto max-w-24">
                                                                    <input
                                                                        type="number"
                                                                        disabled={scoreData.isAbsent || !!entryDisabledReason}
                                                                        max={maxScore}
                                                                        min="0"
                                                                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-center font-bold text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                                                                        value={scoreData.marksObtained}
                                                                        onChange={(e) => handleScoreChange(student._id, 'marksObtained', e.target.value)}
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <input
                                                                    placeholder="Optional note"
                                                                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                                                                    value={scoreData.remarks}
                                                                    onChange={(e) => handleScoreChange(student._id, 'remarks', e.target.value)}
                                                                    disabled={!!entryDisabledReason}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-start gap-2 text-xs text-slate-500">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-slate-400" />
                                    <p className="font-semibold">Review scores before saving. Saved scores update existing records for this exam.</p>
                                </div>
                                <Button
                                    type="submit"
                                    disabled={submitting || !!entryDisabledReason || (students || []).length === 0}
                                    className="w-full md:w-auto"
                                >
                                    <div className="flex items-center gap-1.5">
                                        {submitting ? <Spinner size="sm" /> : <Save size={16} />}
                                        <span>Save Results</span>
                                    </div>
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            {toast.message && (
                <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '' })} />
            )}
        </div>
    );
};

export default ResultsEntry;
