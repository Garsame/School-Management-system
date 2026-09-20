import React, { useState, useEffect } from 'react';
import { Spinner } from '../../components/ui';
import { apiGetStudentAttendance, apiGetStudentAcademicYears } from '../../services/api/student.api';
import { 
    CalendarCheck, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Calendar,
    UserCheck,
    AlertCircle
} from 'lucide-react';

const StudentAttendance = () => {
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedYearId, setSelectedYearId] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchYears = async () => {
            try {
                const yearsRes = await apiGetStudentAcademicYears();
                const yearsPayload = yearsRes.data || yearsRes || [];
                setAcademicYears(yearsPayload);
                if (yearsPayload.length) {
                    const current = yearsPayload.find(y => y.isCurrent);
                    setSelectedYearId((current || yearsPayload[0])._id);
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load academic years.');
                setLoading(false);
            }
        };
        fetchYears();
    }, []);

    useEffect(() => {
        if (!selectedYearId && academicYears.length > 0) return;
        const fetchAttendance = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await apiGetStudentAttendance(selectedYearId || undefined);
                setAttendance(res.data || []);
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.message || 'Failed to load attendance. Please try again.');
                setAttendance([]);
            } finally {
                setLoading(false);
            }
        };
        fetchAttendance();
    }, [selectedYearId, academicYears.length]);

    const filtered = (attendance || []).filter(a => filter === 'All' ? true : a.status === filter);

    const stats = {
        Present: (attendance || []).filter(a => a.status === 'PRESENT').length,
        Absent: (attendance || []).filter(a => a.status === 'ABSENT').length,
        Late: (attendance || []).filter(a => a.status === 'LATE').length,
    };

    const attendanceRate = (attendance || []).length > 0 
        ? Math.round(((stats.Present + stats.Late) / attendance.length) * 100)
        : 100;

    const formatStatus = (status) => {
        if (!status) return '';
        return status.charAt(0) + status.slice(1).toLowerCase();
    };

    if (loading) return <div className="flex h-96 items-center justify-center"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Attendance Tracking</h1>
                    <p className="phoenix-page-subtitle">Review attended and missed class periods for each academic year.</p>
                </div>
                {academicYears.length > 0 && (
                    <div className="flex items-center gap-2">
                        <select
                            className="rounded-lg border border-[#cbd0dd] bg-white px-3 py-1.5 text-xs font-bold text-[#525b75] outline-none"
                            value={selectedYearId}
                            onChange={(e) => setSelectedYearId(e.target.value)}
                        >
                            {(academicYears || []).map((year) => (
                                <option key={year._id} value={year._id}>
                                    {year.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg">
                    <AlertCircle size={20} className="shrink-0" />
                    <span className="text-sm font-semibold">{error}</span>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="phoenix-card">
                    <div className="phoenix-card-body flex flex-col justify-between h-full">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[11px] font-semibold text-[#8a94ad]">Overall presence</p>
                                <h3 className="text-2xl font-bold text-[#141824] mt-1">{attendanceRate}%</h3>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                <CheckCircle2 size={20} />
                            </div>
                        </div>
                        <div className="mt-4 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${attendanceRate}%` }}></div>
                        </div>
                    </div>
                </div>

                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-start justify-between">
                        <div>
                                <p className="text-[11px] font-semibold text-[#8a94ad]">Periods attended</p>
                            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{stats.Present + stats.Late}</h3>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
                            <CheckCircle2 size={20} />
                        </div>
                    </div>
                </div>

                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-start justify-between">
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Periods missed</p>
                            <h3 className="text-2xl font-bold text-rose-600 mt-1">{stats.Absent}</h3>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
                            <XCircle size={20} />
                        </div>
                    </div>
                </div>

                <div className="phoenix-card">
                    <div className="phoenix-card-body flex items-start justify-between">
                        <div>
                            <p className="text-[11px] font-semibold text-[#8a94ad]">Late periods</p>
                            <h3 className="text-2xl font-bold text-amber-600 mt-1">{stats.Late}</h3>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Attendance List */}
            <div className="phoenix-card">
                <div className="phoenix-card-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex border-b border-[#cbd0dd] w-full">
                        {[
                            { value: 'All', label: 'All' },
                            { value: 'PRESENT', label: 'Present' },
                            { value: 'ABSENT', label: 'Absent' },
                            { value: 'LATE', label: 'Late' }
                        ].map((item) => (
                            <button
                                key={item.value}
                                onClick={() => setFilter(item.value)}
                                className={`px-4 py-2 -mb-[1px] text-xs font-bold transition-all border-b-2 ${
                                    filter === item.value 
                                    ? 'border-[var(--primary)] text-[var(--primary)]' 
                                    : 'border-transparent text-[#6e7891] hover:text-[#141824]'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="divide-y divide-[#e3e6ed]">
                    {(filtered || []).length > 0 ? (filtered || []).map((record) => (
                        <div key={record._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center relative overflow-hidden shrink-0 ${
                                    record.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-600' :
                                    record.status === 'ABSENT' ? 'bg-red-50 text-red-600' :
                                    'bg-amber-50 text-amber-600'
                                }`}>
                                     <div className={`absolute top-0 left-0 w-1 h-full ${
                                        record.status === 'PRESENT' ? 'bg-emerald-500' :
                                        record.status === 'ABSENT' ? 'bg-red-500' :
                                        'bg-amber-500'
                                    }`}></div>
                                    <p className="text-[9px] font-bold uppercase leading-none mb-1">{new Date(record.sessionId?.date).toLocaleDateString('en-US', { month: 'short' })}</p>
                                    <p className="text-lg font-bold leading-none">{new Date(record.sessionId?.date).getDate()}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm text-[#141824] group-hover:text-[var(--primary)] transition-colors">{record.sessionId?.period || 'General Session'}</h4>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                        <div className="flex items-center gap-1 text-xs text-[#8a94ad]">
                                            <Calendar size={12} className="text-[#cbd0dd]" />
                                            <span>{new Date(record.sessionId?.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-[#8a94ad]">
                                            <UserCheck size={12} className="text-[#cbd0dd]" />
                                            <span>Teacher: {record.sessionId?.teacherUserId?.name || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                                    record.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    record.status === 'ABSENT' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                    {formatStatus(record.status)}
                                </span>
                            </div>
                        </div>
                    )) : (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-4">
                                <CalendarCheck size={32} />
                            </div>
                            <h3 className="text-base font-bold text-[#141824]">No attendance records</h3>
                            <p className="text-sm text-[#8a94ad] mt-1">There are no records found for the selected filter.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentAttendance;
