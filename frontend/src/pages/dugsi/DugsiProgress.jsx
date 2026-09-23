import React, { useState, useEffect } from 'react';
import {
    getMyDugsiStudents,
    getQuranReference,
    getStudentProgress,
    recordStudentProgress
} from '../../services/api/dugsi.api';
import { Button, Input, Select, Badge } from '../../components/ui';
import { BookOpen, Calendar, Save, History, Loader2, Sparkles, User } from 'lucide-react';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const unwrapList = (response) => {
    const payload = response?.data?.data ?? response?.data ?? response;
    return Array.isArray(payload) ? payload : [];
};

const DugsiProgress = () => {
    const { user } = useAuth();
    const canManage = hasPermission(user, 'dugsi.progress.manage');
    const todayISO = new Date().toISOString().split('T')[0];

    const [students, setStudents] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [referenceData, setReferenceData] = useState({ surahs: [], juzList: [], learningStages: [] });
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [saving, setSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        date: todayISO,
        learningStage: 'READING',
        juz: '1',
        surahNumber: '1',
        startAyah: '',
        endAyah: '',
        notes: ''
    });

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [studentsRes, refRes] = await Promise.all([
                getMyDugsiStudents(),
                getQuranReference()
            ]);
            const studentList = unwrapList(studentsRes);
            setStudents(studentList);
            const ref = refRes?.data ?? refRes;
            setReferenceData({
                surahs: ref?.surahs || [],
                juzList: ref?.juzList || [],
                learningStages: ref?.learningStages || []
            });

            if (studentList.length > 0) {
                const first = studentList[0];
                setSelectedStudentId(first._id);
                setFormData((prev) => ({
                    ...prev,
                    learningStage: first.learningStage || 'READING'
                }));
            }
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to load Dugsi progress data');
        } finally {
            setLoading(false);
        }
    };

    const loadStudentHistory = async (studentId) => {
        if (!studentId) return;
        setHistoryLoading(true);
        try {
            const res = await getStudentProgress(studentId);
            const data = res?.data ?? res;
            setHistory(data?.history || []);
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to load Quran history');
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (selectedStudentId) {
            loadStudentHistory(selectedStudentId);
            const currentStudent = students.find((s) => s._id === selectedStudentId);
            if (currentStudent) {
                setFormData((prev) => ({
                    ...prev,
                    learningStage: currentStudent.learningStage || 'READING'
                }));
            }
        }
    }, [selectedStudentId]);

    const handleSaveProgress = async (e) => {
        e.preventDefault();
        if (!selectedStudentId) {
            notify.error('Please select a student');
            return;
        }

        const selectedSurah = referenceData.surahs.find(
            (s) => String(s.number) === String(formData.surahNumber)
        );

        setSaving(true);
        try {
            await recordStudentProgress(selectedStudentId, {
                date: formData.date,
                learningStage: formData.learningStage,
                juz: Number(formData.juz),
                surahNumber: Number(formData.surahNumber),
                surahName: selectedSurah ? selectedSurah.name : '',
                startAyah: formData.startAyah ? Number(formData.startAyah) : undefined,
                endAyah: formData.endAyah ? Number(formData.endAyah) : undefined,
                notes: formData.notes
            });
            notify.success('Quran progress successfully recorded');
            loadStudentHistory(selectedStudentId);
            setFormData((prev) => ({
                ...prev,
                startAyah: '',
                endAyah: '',
                notes: ''
            }));
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to record progress');
        } finally {
            setSaving(false);
        }
    };

    const activeStudent = students.find((s) => s._id === selectedStudentId);

    const surahOptions = referenceData.surahs.map((s) => ({
        value: String(s.number),
        label: `${s.number}. ${s.name} (${s.arabic}) - ${s.verses} ayahs`
    }));

    const juzOptions = referenceData.juzList.map((j) => ({
        value: String(j.number),
        label: `Juz ${j.number}`
    }));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quran Progress Tracking</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Record daily Quran memorization (Hifz) and recitation progress for each student in your circle.
                </p>
            </div>

            {loading ? (
                <div className="flex h-48 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                </div>
            ) : students.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                    <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
                    <h3 className="mt-3 text-base font-semibold text-slate-800">No students enrolled yet</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Add students to your circle under &ldquo;My Students&rdquo; before logging Quran progress.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-teal-600" />
                                Record Today&apos;s Recitation
                            </h2>

                            <form onSubmit={handleSaveProgress} className="space-y-4">
                                {/* Student Selector */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Select Student
                                    </label>
                                    <Select
                                        value={selectedStudentId}
                                        onChange={(e) => setSelectedStudentId(e.target.value)}
                                        options={students.map((s) => ({
                                            value: s._id,
                                            label: `${s.name} (${s.className || 'Class'} • ${s.admissionNumber})`
                                        }))}
                                    />
                                </div>

                                {/* Active Student Info Card */}
                                {activeStudent && (
                                    <div className="rounded-xl bg-teal-50/60 border border-teal-100 p-3 flex items-center justify-between text-xs">
                                        <div>
                                            <span className="text-teal-900 font-semibold">{activeStudent.name}</span>
                                            <div className="text-teal-700">Class: {activeStudent.className}</div>
                                        </div>
                                        <Badge variant={activeStudent.learningStage === 'MEMORIZING' ? 'success' : 'info'}>
                                            {activeStudent.learningStage === 'MEMORIZING' ? 'Memorization (Hifz)' : 'Reading (Qaida)'}
                                        </Badge>
                                    </div>
                                )}

                                {/* Date & Learning Stage */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                            Date
                                        </label>
                                        <Input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                            Learning Stage
                                        </label>
                                        <Select
                                            value={formData.learningStage}
                                            onChange={(e) => setFormData({ ...formData, learningStage: e.target.value })}
                                            options={[
                                                { value: 'READING', label: 'Qaida / Reading' },
                                                { value: 'MEMORIZING', label: 'Memorization (Hifz)' }
                                            ]}
                                        />
                                    </div>
                                </div>

                                {/* Juz & Surah Selection */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                            Juz (1 - 30)
                                        </label>
                                        <Select
                                            value={formData.juz}
                                            onChange={(e) => setFormData({ ...formData, juz: e.target.value })}
                                            options={juzOptions}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                            Surah
                                        </label>
                                        <Select
                                            value={formData.surahNumber}
                                            onChange={(e) => setFormData({ ...formData, surahNumber: e.target.value })}
                                            options={surahOptions}
                                        />
                                    </div>
                                </div>

                                {/* Ayah Range */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                            Start Ayah (Optional)
                                        </label>
                                        <Input
                                            type="number"
                                            min="1"
                                            placeholder="From ayah..."
                                            value={formData.startAyah}
                                            onChange={(e) => setFormData({ ...formData, startAyah: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                            End Ayah (Optional)
                                        </label>
                                        <Input
                                            type="number"
                                            min="1"
                                            placeholder="To ayah..."
                                            value={formData.endAyah}
                                            onChange={(e) => setFormData({ ...formData, endAyah: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Teacher Notes / Tajweed Feedback
                                    </label>
                                    <textarea
                                        rows="2"
                                        placeholder="E.g., Excellent recitation, reviewed first half of juz..."
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Save Progress Entry
                                </Button>
                            </form>
                        </div>
                    </div>

                    {/* Right Column: Student History Timeline */}
                    <div className="lg:col-span-7">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm min-h-[420px]">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <History className="h-4 w-4 text-slate-500" />
                                        Memorization History &amp; Logs
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Chronological progress entries for {activeStudent?.name || 'Selected Student'}.
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                                    {history.length} Entries
                                </span>
                            </div>

                            {historyLoading ? (
                                <div className="flex h-48 items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                                </div>
                            ) : history.length === 0 ? (
                                <div className="py-16 text-center text-sm text-slate-400">
                                    No Quran progress recorded yet for this student.
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                                    {history.map((log) => (
                                        <div
                                            key={log._id}
                                            className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {log.surahName || `Surah #${log.surahNumber}`}
                                                    </span>
                                                    {log.juz && (
                                                        <span className="text-xs font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md">
                                                            Juz {log.juz}
                                                        </span>
                                                    )}
                                                    <Badge variant={log.learningStage === 'MEMORIZING' ? 'success' : 'info'}>
                                                        {log.learningStage === 'MEMORIZING' ? 'Hifz' : 'Reading'}
                                                    </Badge>
                                                </div>

                                                {(log.startAyah || log.endAyah) && (
                                                    <p className="text-xs text-slate-600">
                                                        Ayah {log.startAyah || 1} to {log.endAyah || 'End'}
                                                    </p>
                                                )}

                                                {log.notes && (
                                                    <p className="text-xs text-slate-500 italic mt-1">&ldquo;{log.notes}&rdquo;</p>
                                                )}
                                            </div>

                                            <div className="text-xs text-slate-400 font-mono whitespace-nowrap self-start sm:self-center">
                                                {log.date}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DugsiProgress;
