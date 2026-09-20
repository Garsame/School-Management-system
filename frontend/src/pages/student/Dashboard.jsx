import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    apiGetStudentProfile,
    apiGetStudentResultsBy,
    apiGetStudentRank,
    apiGetStudentAcademicYears,
    apiGetStudentAttendance
} from '../../services/api/student.api';
import { Spinner, Badge } from '../../components/ui';
import { GraduationCap, Trophy, BookOpen, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const StudentDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [subjects, setSubjects] = useState([]);
    const [overall, setOverall] = useState(null);
    const [rankInfo, setRankInfo] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [yearError, setYearError] = useState('');

    useEffect(() => {
        const loadProfileAndYears = async () => {
            try {
                const [profileRes, yearsRes] = await Promise.all([
                    apiGetStudentProfile(),
                    apiGetStudentAcademicYears()
                ]);

                setProfile(profileRes.data || profileRes);
                const yearsPayload = yearsRes.data || yearsRes || [];
                setAcademicYears(yearsPayload);
                if (yearsPayload.length) {
                    const current = yearsPayload.find((year) => year.isCurrent);
                    setSelectedYearId((current || yearsPayload[0])._id);
                } else {
                    setLoading(false);
                }
            } catch (error) {
                console.error(error);
                setYearError('Failed to load academic year data.');
                setLoading(false);
            }
        };

        loadProfileAndYears();
    }, []);

    useEffect(() => {
        if (!selectedYearId) return;
        const loadYearData = async () => {
            try {
                setLoading(true);
                const [resultsRes, rankRes, attendanceRes] = await Promise.all([
                    apiGetStudentResultsBy({ schoolYearId: selectedYearId }),
                    apiGetStudentRank({ schoolYearId: selectedYearId }),
                    apiGetStudentAttendance(selectedYearId)
                ]);

                const resultPayload = resultsRes.data || resultsRes;
                setSubjects(resultPayload.subjects || []);
                setOverall(resultPayload.overall || null);
                setRankInfo(rankRes.data || rankRes);
                setAttendance(attendanceRes.data || attendanceRes || []);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        loadYearData();
    }, [selectedYearId]);

    if (!loading && academicYears.length === 0) {
        return (
            <div className="space-y-6">
                <div className="phoenix-page-header">
                    <div>
                        <h1 className="phoenix-page-title">
                            Hello, {user?.firstName || profile?.student?.firstName || 'Scholar'}!
                        </h1>
                        <p className="phoenix-page-subtitle">Track your academic progress and performance in real time.</p>
                    </div>
                </div>
                <div className="flex flex-col items-center justify-center py-20 text-center phoenix-card">
                    <div className="phoenix-card-body flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                            <AlertCircle size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-[#141824]">No academic year records found yet</h3>
                        <p className="text-sm text-[#8a94ad] mt-2 max-w-sm">
                            {yearError || 'Your academic history will appear here once you are enrolled in an academic year.'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) return <div className="h-64 flex items-center justify-center"><Spinner size="lg" /></div>;

    const gradedSubjects = (subjects || []).filter(s => s.status !== 'NOT_GRADED');
    const ungradedSubjects = (subjects || []).filter(s => s.status === 'NOT_GRADED');
    const selectedYear = academicYears.find((year) => String(year._id) === String(selectedYearId));
    const attendedPeriods = attendance.filter(record => ['PRESENT', 'LATE'].includes(record.status)).length;
    const missedPeriods = attendance.filter(record => record.status === 'ABSENT').length;

    return (
        <div className="space-y-6">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">
                        Hello, {user?.firstName || profile?.student?.firstName || 'Scholar'}!
                    </h1>
                    <p className="phoenix-page-subtitle">Track your academic progress and performance in real time.</p>
                </div>
                {(academicYears || []).length > 0 && (
                    <div className="flex items-center gap-2">
                        <select
                            className="rounded-lg border border-[#cbd0dd] bg-white px-3 py-1.5 text-xs font-bold text-[#525b75] outline-none"
                            value={selectedYearId}
                            onChange={(e) => setSelectedYearId(e.target.value)}
                        >
                            {(academicYears || []).map((year) => (
                                <option key={year._id} value={year._id} className="text-slate-900">
                                    {year.name}{year.className ? ` - ${year.className}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <GraduationCap size={24} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Class</p>
                            <h3 className="truncate text-base font-bold text-[#141824]">{selectedYear?.className || profile?.enrollment?.classId?.name || 'Not enrolled'}</h3>
                            <p className="truncate text-[10px] text-slate-400">{selectedYear?.name || 'No academic year'}</p>
                        </div>
                    </div>
                </div>
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                            <BookOpen size={24} />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Total marks</p>
                            <h3 className="text-xl font-bold text-[#141824]">
                                {overall?.totalMarks ?? 0}/{overall?.totalMax ?? 0}
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                            <Trophy size={24} />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Overall status</p>
                            <h3 className="text-xl font-bold text-[#141824]">{overall?.overallStatus || '—'}</h3>
                            <p className="text-[10px] text-slate-400">Pass ≥ {overall?.overallPassMark ?? 0}</p>
                        </div>
                    </div>
                </div>

                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <CheckCircle2 size={24} />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Class rank</p>
                            <h3 className="text-xl font-bold text-[#141824]">
                                {rankInfo?.rank || '—'} <span className="text-[#8a94ad] text-xs">/ {rankInfo?.classSize || 0}</span>
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                            <XCircle size={24} />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Periods attended</p>
                            <h3 className="text-xl font-bold text-[#141824]">{attendedPeriods} <span className="text-xs text-slate-400">/ {attendance.length}</span></h3>
                            <p className="text-[10px] text-rose-500">{missedPeriods} missed</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <h2 className="text-base font-bold text-[#141824]">Subject Status</h2>
                <div className="phoenix-card">
                    <div className="phoenix-card-body">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(gradedSubjects || []).map(subject => (
                                <div key={subject.subjectId} className="flex items-center justify-between border border-[#e3e6ed] rounded-lg px-4 py-3">
                                    <div>
                                        <p className="font-semibold text-[#141824] text-sm">{subject.subjectName}</p>
                                        <p className="text-xs text-[#8a94ad]">{subject.totalMarks}/{subject.totalMax}</p>
                                    </div>
                                    <Badge variant={subject.status === 'PASS' ? 'success' : 'danger'}>
                                        {subject.status === 'PASS' ? 'Pass' : 'Fail'}
                                    </Badge>
                                </div>
                            ))}
                            {(ungradedSubjects || []).map(subject => (
                                <div key={subject.subjectId} className="flex items-center justify-between border border-dashed border-[#cbd0dd] rounded-lg px-4 py-3 opacity-70">
                                    <div>
                                        <p className="font-semibold text-[#525b75] text-sm">{subject.subjectName}</p>
                                        <p className="text-xs text-[#8a94ad]">No exams recorded yet</p>
                                    </div>
                                    <span className="text-xs font-semibold text-[#8a94ad] bg-slate-100 px-2 py-0.5 rounded">Not graded</span>
                                </div>
                            ))}
                            {(subjects || []).length === 0 && (
                                <div className="col-span-full text-center text-[#8a94ad] py-6 text-sm">No subject results yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentDashboard;
