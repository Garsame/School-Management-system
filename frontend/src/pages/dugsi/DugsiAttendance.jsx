import React, { useState, useEffect } from 'react';
import { getTodayRegister, submitDugsiAttendance } from '../../services/api/dugsi.api';
import { Button, Input, Badge } from '../../components/ui';
import { Calendar, Check, X, Clock, AlertCircle, Loader2, Save, Users } from 'lucide-react';
import { notify } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const DugsiAttendance = () => {
    const { user } = useAuth();
    const canTakeAttendance = hasPermission(user, 'dugsi.attendance.take');
    const todayISO = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(todayISO);
    const [register, setRegister] = useState([]);
    const [sessionInfo, setSessionInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadRegister = async (date) => {
        setLoading(true);
        try {
            const res = await getTodayRegister({ date });
            const data = res?.data ?? res;
            setRegister(data?.register || []);
            setSessionInfo(data?.session || null);
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to load Dugsi register');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRegister(selectedDate);
    }, [selectedDate]);

    const handleStatusChange = (studentId, status) => {
        setRegister((prev) =>
            prev.map((s) => (s.studentId === studentId ? { ...s, status } : s))
        );
    };

    const handleMarkAll = (status) => {
        setRegister((prev) => prev.map((s) => ({ ...s, status })));
    };

    const handleSave = async () => {
        const unassigned = register.filter((s) => !s.status);
        if (unassigned.length > 0) {
            const proceed = window.confirm(
                `${unassigned.length} student(s) have not been marked. Unmarked students will be marked as PRESENT by default. Continue?`
            );
            if (!proceed) return;
        }

        setSaving(true);
        try {
            const records = register.map((s) => ({
                studentId: s.studentId,
                status: s.status || 'PRESENT'
            }));

            await submitDugsiAttendance({
                date: selectedDate,
                period: 'DUGSI',
                records
            });
            notify.success(`Dugsi attendance for ${selectedDate} saved successfully`);
            loadRegister(selectedDate);
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to save attendance');
        } finally {
            setSaving(false);
        }
    };

    const counts = {
        PRESENT: register.filter((s) => s.status === 'PRESENT').length,
        ABSENT: register.filter((s) => s.status === 'ABSENT').length,
        LATE: register.filter((s) => s.status === 'LATE').length,
        EXCUSED: register.filter((s) => s.status === 'EXCUSED').length
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dugsi Attendance Register</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Mark and record daily attendance specifically for your Quran Dugsi circle.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="!w-44 !h-10 text-sm"
                        />
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={saving || loading || register.length === 0}
                        className="flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Register
                    </Button>
                </div>
            </div>

            {/* Attendance Stat Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Present</span>
                    <p className="text-2xl font-bold text-emerald-900 mt-1">{counts.PRESENT}</p>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Absent</span>
                    <p className="text-2xl font-bold text-rose-900 mt-1">{counts.ABSENT}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Late</span>
                    <p className="text-2xl font-bold text-amber-900 mt-1">{counts.LATE}</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Excused</span>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{counts.EXCUSED}</p>
                </div>
            </div>

            {/* Quick Actions Bar */}
            {register.length > 0 && !loading && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-medium">
                        Total Students in Circle: <strong className="text-slate-800">{register.length}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium mr-1">Quick Mark:</span>
                        <button
                            type="button"
                            onClick={() => handleMarkAll('PRESENT')}
                            className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                        >
                            Mark All Present
                        </button>
                        <button
                            type="button"
                            onClick={() => handleMarkAll('ABSENT')}
                            className="text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors"
                        >
                            Mark All Absent
                        </button>
                    </div>
                </div>
            )}

            {/* Register Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                    <div className="flex h-48 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                    </div>
                ) : register.length === 0 ? (
                    <div className="p-12 text-center">
                        <Users className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-3 text-base font-semibold text-slate-800">No students enrolled in your Dugsi</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Go to &ldquo;My Students&rdquo; to add students to your circle first.
                        </p>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-6 py-3">Student Name</th>
                                <th className="px-6 py-3">Admission #</th>
                                <th className="px-6 py-3">Learning Stage</th>
                                <th className="px-6 py-3 text-right">Attendance Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {register.map((s) => (
                                <tr key={s.studentId} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 font-semibold text-slate-900">{s.name}</td>
                                    <td className="px-6 py-4 text-xs font-mono text-slate-600">{s.admissionNumber}</td>
                                    <td className="px-6 py-4">
                                        <Badge variant={s.learningStage === 'MEMORIZING' ? 'success' : 'info'}>
                                            {s.learningStage === 'MEMORIZING' ? 'Memorization' : 'Reading'}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleStatusChange(s.studentId, 'PRESENT')}
                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                                    s.status === 'PRESENT'
                                                        ? 'bg-emerald-600 text-white shadow-sm'
                                                        : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                                                }`}
                                            >
                                                Present
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleStatusChange(s.studentId, 'ABSENT')}
                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                                    s.status === 'ABSENT'
                                                        ? 'bg-rose-600 text-white shadow-sm'
                                                        : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                                                }`}
                                            >
                                                Absent
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleStatusChange(s.studentId, 'LATE')}
                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                                    s.status === 'LATE'
                                                        ? 'bg-amber-500 text-white shadow-sm'
                                                        : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                                                }`}
                                            >
                                                Late
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleStatusChange(s.studentId, 'EXCUSED')}
                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                                    s.status === 'EXCUSED'
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
                                                }`}
                                            >
                                                Excused
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DugsiAttendance;
