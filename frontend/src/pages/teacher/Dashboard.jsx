import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner, Badge, Button } from '../../components/ui';
import { getExams, getGradingPolicy, getTeacherAssignments } from '../../services/api/teacher.api';
import { useAuth } from '../../context/AuthContext';
import {
    ArrowRight,
    Award,
    BookOpen,
    Calendar,
    ClipboardList,
    Clock,
    FileSpreadsheet,
    GraduationCap,
    LayoutDashboard,
    PenLine,
    Target,
    Users
} from 'lucide-react';

const asArray = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const getId = (value) => value?._id || value || '';

const formatDate = (value) => {
    if (!value) return 'Not scheduled';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not scheduled';
    return date.toLocaleDateString();
};

const StatCard = ({ label, value, icon, tone = 'blue' }) => {
    const tones = {
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
        violet: 'bg-violet-50 text-violet-600 border-violet-100'
    };

    return (
        <div className="phoenix-card">
            <div className="phoenix-card-body flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tones[tone] || tones.blue}`}>
                    {React.createElement(icon, { size: 22 })}
                </div>
            </div>
        </div>
    );
};

const Dashboard = () => {
    const { user } = useAuth();
    const [exams, setExams] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [policy, setPolicy] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [examsData, policyData, assignmentsData] = await Promise.all([
                    getExams(),
                    getGradingPolicy(),
                    getTeacherAssignments()
                ]);
                setExams(asArray(examsData));
                setPolicy(asArray(policyData));
                setAssignments(asArray(assignmentsData));
            } catch (err) {
                console.error('Failed to load teacher dashboard:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const groupedAssignments = useMemo(() => (assignments || []).reduce((acc, item) => {
        const classId = getId(item.classId);
        const sectionId = getId(item.sectionId) || 'no-section';
        const key = `${classId}-${sectionId}`;

        if (!classId) return acc;
        if (!acc[key]) {
            acc[key] = {
                class: item.classId,
                section: item.sectionId,
                subjects: []
            };
        }

        if (item.subjectId) acc[key].subjects.push(item.subjectId);
        return acc;
    }, {}), [assignments]);

    const assignmentGroups = Object.values(groupedAssignments);
    const uniqueSubjectCount = new Set((assignments || []).map((item) => getId(item.subjectId)).filter(Boolean)).size;
    const openExams = (exams || []).filter((exam) => String(exam.status || '').toUpperCase() === 'OPEN');
    const recentExams = (exams || []).slice(0, 5);
    const sortedPolicy = [...(policy || [])].sort((a, b) => Number(b.min || 0) - Number(a.min || 0));

    if (loading) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <p className="text-xs font-semibold text-slate-400">Loading teacher workspace...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Welcome back, {user?.name || 'Teacher'}</h1>
                    <p className="phoenix-page-subtitle">Review assigned classes, open exams, result entry tasks, and the grading policy from one clean workspace.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link to="/teacher/results-entry">
                        <Button className="w-full sm:w-auto">
                            <PenLine size={16} />
                            <span>Enter Results</span>
                        </Button>
                    </Link>
                    <Link to="/teacher/schedule">
                        <Button variant="outline" className="w-full sm:w-auto">
                            <Calendar size={16} />
                            <span>My Schedule</span>
                        </Button>
                    </Link>
                </div>
            </div>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Open Exams" value={openExams.length} icon={BookOpen} tone="blue" />
                <StatCard label="Assigned Classes" value={assignmentGroups.length} icon={LayoutDashboard} tone="emerald" />
                <StatCard label="Subjects" value={uniqueSubjectCount} icon={Target} tone="violet" />
                <StatCard label="Grade Rules" value={sortedPolicy.length} icon={Award} tone="amber" />
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-[#141824]">My Teaching Assignments</h2>
                                <Badge variant="outline">{assignmentGroups.length} classes</Badge>
                            </div>
                            {assignmentGroups.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                                    <Users size={36} className="mx-auto mb-3 text-slate-300" />
                                    <p className="font-bold text-slate-700">No assignments yet</p>
                                    <p className="mt-1 text-sm text-slate-500">Ask the branch admin to assign your classes and subjects.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    {(assignmentGroups || []).map((group, index) => (
                                        <div key={`${getId(group.class)}-${getId(group.section) || index}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-[var(--primary)]/40 hover:bg-white">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-semibold text-slate-500">Class</p>
                                                    <h3 className="mt-1 text-base font-bold text-slate-900">{group.class?.name || 'Unnamed Class'}</h3>
                                                    {group.section?.name && (
                                                        <p className="mt-1 text-xs font-semibold text-slate-500">Section {group.section.name}</p>
                                                    )}
                                                </div>
                                                <div className="rounded-xl bg-white p-2 text-[var(--primary)] shadow-sm">
                                                    <ClipboardList size={20} />
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                <p className="mb-2 text-xs font-semibold text-slate-500">Subjects</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {group.subjects.length === 0 ? (
                                                        <Badge variant="outline">No subjects</Badge>
                                                    ) : (group.subjects || []).map((subject, subjectIndex) => (
                                                        <Badge key={`${getId(subject)}-${subjectIndex}`} variant="default" className="rounded-lg">
                                                            {subject?.name || 'Subject'}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="mt-5 flex flex-wrap gap-2">
                                                <Link to={`/teacher/attendance?classId=${getId(group.class)}`}>
                                                    <Button size="sm" variant="outline">
                                                        <span>Attendance</span>
                                                    </Button>
                                                </Link>
                                                <Link to={`/teacher/results-entry?classId=${getId(group.class)}`}>
                                                    <Button size="sm">
                                                        <span>Enter Results</span>
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-[#141824]">Recent Exams</h2>
                                <Link to="/teacher/exams" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">
                                    <span>View all</span>
                                    <ArrowRight size={14} />
                                </Link>
                            </div>
                            {recentExams.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                    <BookOpen size={34} className="mx-auto mb-3 text-slate-300" />
                                    <p className="font-bold text-slate-700">No exams published yet</p>
                                    <p className="mt-1 text-sm text-slate-500">Open exams will appear here when branch admin publishes them.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {(recentExams || []).map((exam) => {
                                        const status = String(exam.status || 'DRAFT').toUpperCase();
                                        const canEnter = status === 'OPEN' && exam.canEnter !== false;

                                        return (
                                            <div key={exam._id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="font-bold text-slate-900">{exam.name || exam.examCategoryId?.name || 'Unnamed Exam'}</h3>
                                                        <Badge variant={status === 'OPEN' ? 'success' : status === 'CLOSED' ? 'default' : 'warning'}>{status}</Badge>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        {exam.subjectId?.name || 'Subject'} - {exam.classId?.name || 'Class'} - {formatDate(exam.createdAt)}
                                                    </p>
                                                </div>
                                                <Link to={canEnter ? `/teacher/results-entry/${exam._id}` : `/teacher/exams/${exam._id}`}>
                                                    <Button size="sm" variant={canEnter ? 'primary' : 'outline'}>
                                                        <span>{canEnter ? 'Enter Results' : 'Open Details'}</span>
                                                    </Button>
                                                </Link>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-[#141824]">Grading Policy</h2>
                                <Link to="/teacher/grading-policy" className="text-xs font-bold text-[var(--primary)] hover:underline">
                                    <span>Details</span>
                                </Link>
                            </div>
                            {sortedPolicy.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                    <FileSpreadsheet size={32} className="mx-auto mb-3 text-slate-300" />
                                    <p className="font-bold text-slate-700">No grading scale configured</p>
                                    <p className="mt-1 text-sm text-slate-500">Branch admin should configure grading rules.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(sortedPolicy.slice(0, 6) || []).map((rule, index) => (
                                        <div key={`${rule.grade}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                            <div>
                                                <p className="text-sm font-bold text-slate-900">{rule.min}% - {rule.max}%</p>
                                                <p className="text-xs text-slate-500">Score range</p>
                                            </div>
                                            <Badge variant={String(rule.grade).toUpperCase() === 'A' ? 'success' : String(rule.grade).toUpperCase() === 'F' ? 'danger' : 'primary'} className="min-w-12 justify-center rounded-lg">
                                                {rule.grade}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="phoenix-card">
                        <div className="phoenix-card-body">
                            <h2 className="text-lg font-bold text-[#141824] mb-4">Quick Actions</h2>
                            <div className="space-y-3">
                                <Link to="/teacher/results-entry" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[var(--primary)]/30 hover:bg-white">
                                    <span className="font-semibold text-slate-700 text-sm">Enter exam scores</span>
                                    <PenLine size={18} className="text-[var(--primary)]" />
                                </Link>
                                <Link to="/teacher/attendance" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[var(--primary)]/30 hover:bg-white">
                                    <span className="font-semibold text-slate-700 text-sm">Open attendance</span>
                                    <Calendar size={18} className="text-[var(--primary)]" />
                                </Link>
                                <Link to="/teacher/results" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[var(--primary)]/30 hover:bg-white">
                                    <span className="font-semibold text-slate-700 text-sm">Review results</span>
                                    <FileSpreadsheet size={18} className="text-[var(--primary)]" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
