import React, { useState, useEffect } from 'react';
import {
    getAdminOverview,
    getAdminAllocations,
    allocateClassesToTeacher,
    removeClassAllocation
} from '../../services/api/dugsi.api';
import { Button, Input, Select, Badge } from '../../components/ui';
import {
    BookOpen,
    Users,
    Sparkles,
    CalendarCheck,
    Plus,
    Trash2,
    Loader2,
    CheckCircle,
    X,
    FolderKanban
} from 'lucide-react';
import { notify, confirmAction } from '../../components/feedback/notificationService';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const DugsiOversight = () => {
    const { user } = useAuth();
    const canAssign = hasPermission(user, 'dugsi.classes.assign');

    const [activeTab, setActiveTab] = useState('circles'); // 'circles' | 'allocations'
    const [stats, setStats] = useState(null);
    const [circles, setCircles] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [allocations, setAllocations] = useState([]);
    const [availableClasses, setAvailableClasses] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedTeacherId, setSelectedTeacherId] = useState('');
    const [selectedClassIds, setSelectedClassIds] = useState(new Set());
    const [submitting, setSubmitting] = useState(false);

    const loadOverview = async () => {
        setLoading(true);
        try {
            const [overviewRes, allocRes] = await Promise.all([
                getAdminOverview(),
                getAdminAllocations()
            ]);

            const overviewData = overviewRes?.data ?? overviewRes;
            setStats(overviewData?.stats || null);
            setCircles(overviewData?.circles || []);

            const allocData = allocRes?.data ?? allocRes;
            setTeachers(allocData?.teachers || []);
            setAllocations(allocData?.allocations || []);
            setAvailableClasses(allocData?.availableClasses || []);

            if (allocData?.teachers?.length > 0) {
                setSelectedTeacherId(allocData.teachers[0]._id);
            }
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to load Dugsi oversight data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOverview();
    }, []);

    const toggleClassSelection = (classId) => {
        const next = new Set(selectedClassIds);
        if (next.has(classId)) {
            next.delete(classId);
        } else {
            next.add(classId);
        }
        setSelectedClassIds(next);
    };

    const handleAllocate = async (e) => {
        e.preventDefault();
        if (!selectedTeacherId) {
            notify.error('Please select a teacher');
            return;
        }
        if (!selectedClassIds.size) {
            notify.error('Please select at least one class');
            return;
        }

        setSubmitting(true);
        try {
            await allocateClassesToTeacher({
                teacherUserId: selectedTeacherId,
                classIds: Array.from(selectedClassIds)
            });
            notify.success('Classes successfully allocated to teacher');
            setModalOpen(false);
            setSelectedClassIds(new Set());
            loadOverview();
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to allocate classes');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveAllocation = async (allocationId) => {
        const confirmed = await confirmAction('Are you sure you want to remove this class allocation?');
        if (!confirmed) return;

        try {
            await removeClassAllocation(allocationId);
            notify.success('Class allocation removed');
            loadOverview();
        } catch (error) {
            notify.error(error.response?.data?.message || 'Failed to remove class allocation');
        }
    };

    // Group allocations by teacher
    const allocationsByTeacher = new Map();
    for (const alloc of allocations) {
        const tId = String(alloc.teacherUserId?._id || alloc.teacherUserId || 'unknown');
        const teacherName = alloc.teacherUserId?.name || 'Assigned Teacher';
        const entry = allocationsByTeacher.get(tId) || { teacherName, items: [] };
        entry.items.push(alloc);
        allocationsByTeacher.set(tId, entry);
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quran Dugsi Oversight</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        School-wide oversight of Quran study circles, teacher class assignments, and memorization progress.
                    </p>
                </div>
                {canAssign && (
                    <Button
                        onClick={() => setModalOpen(true)}
                        className="flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Assign Classes to Teacher
                    </Button>
                )}
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Students in Dugsi</span>
                        <div className="rounded-lg bg-[var(--primary-soft)] p-2 text-[var(--primary)]">
                            <Users className="h-4 w-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                        {loading ? '...' : stats?.totalStudentsInDugsi ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Across all circles</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Memorization (Hifz)</span>
                        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                            <Sparkles className="h-4 w-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700 mt-2">
                        {loading ? '...' : stats?.memorizingCount ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Active memorizers</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reading / Qaida</span>
                        <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                            <BookOpen className="h-4 w-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-blue-700 mt-2">
                        {loading ? '...' : stats?.readingCount ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Learning to read</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dugsi Attendance</span>
                        <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                            <CalendarCheck className="h-4 w-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                        {loading ? '...' : stats?.attendanceRate ?? 'N/A'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Overall Dugsi rate</p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('circles')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === 'circles'
                            ? 'border-[var(--primary)] text-[var(--primary)]'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Active Dugsi Circles ({circles.length})
                </button>
                <button
                    onClick={() => setActiveTab('allocations')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === 'allocations'
                            ? 'border-[var(--primary)] text-[var(--primary)]'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Class Allocations ({allocations.length})
                </button>
            </div>

            {/* Tab 1: Active Circles */}
            {activeTab === 'circles' && (
                <div className="space-y-4">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                        </div>
                    ) : circles.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
                            <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
                            <h3 className="mt-3 text-base font-semibold text-slate-800">No active Dugsi circles yet</h3>
                            <p className="mt-1 text-sm text-slate-500">
                                Allocate classes to a Dugsi teacher so they can begin enrolling students.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {circles.map((circle) => (
                                <div
                                    key={circle.teacherId}
                                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                                >
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <div>
                                            <h3 className="font-bold text-slate-900">{circle.teacherName}</h3>
                                            <span className="text-xs text-slate-500">Macallin Dugsi</span>
                                        </div>
                                        <Badge variant="info">
                                            {circle.studentsCount} Students
                                        </Badge>
                                    </div>

                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Memorization (Hifz):</span>
                                            <strong className="text-emerald-700 font-semibold">{circle.memorizingCount}</strong>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Reading (Qaida):</span>
                                            <strong className="text-blue-700 font-semibold">{circle.readingCount}</strong>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tab 2: Class Allocations */}
            {activeTab === 'allocations' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                        </div>
                    ) : allocations.length === 0 ? (
                        <div className="p-12 text-center">
                            <FolderKanban className="mx-auto h-12 w-12 text-slate-300" />
                            <h3 className="mt-3 text-base font-semibold text-slate-800">No classes allocated to Dugsi teachers</h3>
                            <p className="mt-1 text-sm text-slate-500">
                                Click &ldquo;Assign Classes to Teacher&rdquo; to give a Dugsi teacher their classes.
                            </p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse text-left text-sm">
                            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-6 py-3">Dugsi Teacher</th>
                                    <th className="px-6 py-3">Allocated Class</th>
                                    <th className="px-6 py-3">Grade Level</th>
                                    {canAssign && <th className="px-6 py-3 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {allocations.map((alloc) => (
                                    <tr key={alloc._id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-slate-900">
                                            {alloc.teacherUserId?.name || 'Assigned Teacher'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-700 font-medium">
                                            {alloc.classId?.name || 'Unassigned Class'}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500">
                                            Grade {alloc.classId?.gradeLevel || 'N/A'}
                                        </td>
                                        {canAssign && (
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleRemoveAllocation(alloc._id)}
                                                    className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                                                    title="Remove Allocation"
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
            )}

            {/* Allocate Classes Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Assign Classes to Dugsi Teacher</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    The teacher will be able to select Dugsi students from these classes.
                                </p>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAllocate} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                    Dugsi Teacher
                                </label>
                                <Select
                                    value={selectedTeacherId}
                                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                                    options={teachers.map((t) => ({
                                        value: t._id,
                                        label: `${t.name} (${t.email})`
                                    }))}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                                    Select Classes to Allocate
                                </label>
                                <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                                    {availableClasses.map((c) => {
                                        const isChecked = selectedClassIds.has(c._id);
                                        return (
                                            <label
                                                key={c._id}
                                                className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                    isChecked
                                                        ? 'bg-[var(--primary-soft)] border-[var(--primary)] ring-1 ring-[var(--primary)]'
                                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleClassSelection(c._id)}
                                                        className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                                                    />
                                                    <span className="text-xs font-semibold text-slate-900">{c.name}</span>
                                                </div>
                                                <span className="text-[11px] text-slate-400 font-medium">Grade {c.gradeLevel}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <Button variant="outline" onClick={() => setModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting || !selectedClassIds.size}
                                    variant="primary"
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign Classes'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DugsiOversight;
