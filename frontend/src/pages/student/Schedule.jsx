import React, { useEffect, useMemo, useState } from 'react';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Toast from '../../components/ui/Toast';
import { apiGetStudentAcademicYears } from '../../services/api/student.api';
import { getStudentTimetableToday, getStudentTimetableWeek } from '../../services/api/studentTimetable.api';
import { DAY_LABELS, DAY_ORDER } from '../../utils/dates';
import { useAuth } from '../../context/AuthContext';

const normalizeSlot = (slot) => ({
  ...slot,
  id: slot._id || slot.id,
  dayOfWeek: slot.dayOfWeek || slot.day || '',
  className: slot.classId?.name || slot.className || slot.class || 'Class',
  sectionId: slot.sectionId?._id || slot.sectionId,
  sectionName: slot.sectionId?.name || slot.sectionName || '',
  subjectName: slot.subjectId?.name || slot.subjectName || slot.subject || 'Subject',
  teacherName: slot.teacherUserId?.name || slot.teacherName || 'Teacher',
  startTime: slot.startTime || '--:--',
  endTime: slot.endTime || '--:--',
  room: slot.room || '',
});

const normalizeWeekResponse = (payload) => {
  if (Array.isArray(payload)) return payload.map(normalizeSlot);
  if (payload && typeof payload === 'object') {
    return Object.entries(payload).flatMap(([day, slots]) =>
      (Array.isArray(slots) ? slots : []).map((slot) => normalizeSlot({ ...slot, dayOfWeek: day }))
    );
  }
  return [];
};

const StudentSchedule = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(user?.schoolYearId || user?.academicYearId || '');
  const [todaySlots, setTodaySlots] = useState([]);
  const [weekSlots, setWeekSlots] = useState([]);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    const loadAcademicYears = async () => {
      try {
        const response = await apiGetStudentAcademicYears();
        const years = response.data || response || [];
        setAcademicYears(years);
        setSelectedYear((current) => current || (years.find((year) => year.isCurrent) || years[0])?._id || '');
        if (!years.length) setLoading(false);
      } catch (error) {
        setAcademicYears([]);
        setLoading(false);
        setToast({
          message: error?.response?.data?.message || 'Failed to load academic years.',
          type: 'error',
        });
      }
    };
    loadAcademicYears();
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    const fetchSchedule = async () => {
      setLoading(true);
      try {
        const [today, week] = await Promise.all([
          getStudentTimetableToday(selectedYear),
          getStudentTimetableWeek(selectedYear),
        ]);
        setTodaySlots((today || []).map(normalizeSlot));
        setWeekSlots(normalizeWeekResponse(week));
      } catch (error) {
        setToast({
          message: error?.response?.data?.message || 'Failed to load your schedule.',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [selectedYear]);

  const weekGrouped = useMemo(() => {
    const map = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] };
    (weekSlots || []).forEach((slot) => {
      if (map[slot.dayOfWeek]) map[slot.dayOfWeek].push(slot);
    });
    return map;
  }, [weekSlots]);

  return (
    <div className="space-y-6">
      <div className="phoenix-page-header">
        <div>
          <h1 className="phoenix-page-title">My Schedule</h1>
          <p className="phoenix-page-subtitle">Your class timetable by day and week.</p>
        </div>
        {(academicYears || []).length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-[#cbd0dd] bg-white px-3 py-1.5 text-xs font-bold text-[#525b75] outline-none"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {(academicYears || []).map((year) => (
                <option key={year._id} value={year._id}>
                  {year.name || 'Academic Year'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="phoenix-card">
        <div className="phoenix-card-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex border-b border-[#cbd0dd] w-full sm:w-auto">
            <button
              className={`px-4 py-2 -mb-[1px] text-xs font-bold transition-all border-b-2 ${
                activeTab === 'today' 
                ? 'border-[var(--primary)] text-[var(--primary)]' 
                : 'border-transparent text-[#6e7891] hover:text-[#141824]'
              }`}
              onClick={() => setActiveTab('today')}
            >
              Today
            </button>
            <button
              className={`px-4 py-2 -mb-[1px] text-xs font-bold transition-all border-b-2 ${
                activeTab === 'week' 
                ? 'border-[var(--primary)] text-[var(--primary)]' 
                : 'border-transparent text-[#6e7891] hover:text-[#141824]'
              }`}
              onClick={() => setActiveTab('week')}
            >
              Week
            </button>
          </div>
          <Badge variant="primary">Today you have {todaySlots.length} subjects</Badge>
        </div>

        <div className="phoenix-card-body">
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : activeTab === 'today' ? (
            <div className="space-y-3">
              {(todaySlots || []).length ? (
                (todaySlots || []).map((slot) => (
                  <article key={slot.id || `${slot.startTime}-${slot.subjectName}`} className="border border-[#e3e6ed] rounded-lg p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-[#8a94ad]">
                        {slot.startTime} - {slot.endTime}
                      </p>
                      {slot.room ? <Badge>{slot.room}</Badge> : null}
                    </div>
                    <p className="mt-1 text-base font-bold text-[#141824]">{slot.subjectName}</p>
                    <p className="text-sm text-[#525b75]">Teacher: {slot.teacherName}</p>
                    <p className="text-xs text-[#8a94ad]">
                      {slot.className}{slot.sectionName ? ` • Section ${slot.sectionName}` : ''}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[#8a94ad] py-6 text-center">No timetable slots for today.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {DAY_ORDER.map((day) => (
                <div key={day} className="space-y-3 border border-[#e3e6ed] rounded-lg p-3">
                  <h3 className="border-b border-[#e3e6ed] pb-2 text-sm font-bold text-[#141824]">{DAY_LABELS[day]}</h3>
                  {(weekGrouped[day] || []).length ? (
                    (weekGrouped[day] || [])
                      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
                      .map((slot) => (
                        <article key={slot.id || `${day}-${slot.startTime}`} className="border border-[#e3e6ed] bg-slate-50/30 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                          <p className="text-xs font-semibold text-[#8a94ad]">
                            {slot.startTime} - {slot.endTime}
                          </p>
                          <p className="text-sm font-semibold text-[#141824]">{slot.subjectName}</p>
                          <p className="text-xs text-[#525b75]">{slot.teacherName}</p>
                          <p className="text-xs text-[#8a94ad]">
                            {slot.className}{slot.sectionName ? ` • Section ${slot.sectionName}` : ''}
                          </p>
                          {slot.room ? <p className="text-xs text-[#8a94ad] mt-1">Room: {slot.room}</p> : null}
                        </article>
                      ))
                  ) : (
                    <p className="bg-slate-50 p-4 text-xs text-[#8a94ad] rounded text-center">No classes</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
};

export default StudentSchedule;
