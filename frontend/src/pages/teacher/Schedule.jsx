import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import Toast from '../../components/ui/Toast';
import { openAttendanceForScheduledClass } from '../../services/api/teacherAttendance.api';
import { getTeacherCurrentAcademicYear, getTeacherTimetableToday, getTeacherTimetableWeek } from '../../services/api/teacherTimetable.api';
import { DAY_LABELS, DAY_ORDER, getDayKey, isWithinAttendanceWindow } from '../../utils/dates';
import { useAuth } from '../../context/AuthContext';

const normalizeSlot = (slot) => ({
  ...slot,
  id: slot._id || slot.id,
  dayOfWeek: slot.dayOfWeek || slot.day || '',
  classId: slot.classId?._id || slot.classId,
  className: slot.classId?.name || slot.className || slot.class || 'Class',
  sectionId: slot.sectionId?._id || slot.sectionId,
  sectionName: slot.sectionId?.name || slot.sectionName || '',
  subjectId: slot.subjectId?._id || slot.subjectId,
  subjectName: slot.subjectId?.name || slot.subjectName || slot.subject || 'Subject',
  teacherUserId: slot.teacherUserId?._id || slot.teacherUserId,
  teacherName: slot.teacherUserId?.name || slot.teacherName || 'Teacher',
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

const getAttendanceButtonState = (slot, dayKey) => {
  const sessionStatus = String(slot.sessionStatus || slot.status || '').toUpperCase();
  if (sessionStatus === 'SUBMITTED' || sessionStatus === 'CLOSED') {
    return { enabled: false, reason: 'Attendance already submitted' };
  }

  if (slot.dayOfWeek && slot.dayOfWeek !== dayKey) {
    return { enabled: false, reason: 'This class is not today' };
  }

  if (slot.canOpenAttendance === false || slot.canOpen === false) {
    return { enabled: false, reason: slot.lockReason || 'No scheduled class now. Attendance is locked.' };
  }

  if (slot.startTime && slot.endTime) {
    const open = isWithinAttendanceWindow(slot, 10);
    if (!open) return { enabled: false, reason: 'Not time yet' };
  }

  return { enabled: true, reason: '' };
};

const SlotCard = ({ slot, openLabel = 'Take Attendance', onTakeAttendance, dayKey, hideAction = false }) => {
  const attendanceState = getAttendanceButtonState(slot, dayKey);

  return (
    <article className="phoenix-card">
      <div className="phoenix-card-body">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">{slot.subjectName}</p>
          <Badge variant="primary">
            <span>{slot.startTime} - {slot.endTime}</span>
          </Badge>
        </div>
        <p className="text-xs text-slate-700 font-semibold">
          {slot.className}{slot.sectionName ? ` • Section ${slot.sectionName}` : ''}
        </p>
        <p className="text-[11px] text-slate-500 mt-1">{slot.room ? `Room ${slot.room}` : 'Room not set'}</p>
        {!hideAction && (
          <div className="mt-4">
            <Button
              className="w-full"
              disabled={!attendanceState.enabled}
              onClick={() => onTakeAttendance(slot)}
              title={attendanceState.reason}
            >
              <span>{attendanceState.enabled ? openLabel : attendanceState.reason}</span>
            </Button>
          </div>
        )}
      </div>
    </article>
  );
};

const TeacherSchedule = ({ focusAttendance = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState('');
  const [todaySlots, setTodaySlots] = useState([]);
  const [weekSlots, setWeekSlots] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(user?.schoolYearId || user?.academicYearId || '');
  const [errorBySlotId, setErrorBySlotId] = useState({});
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    const loadAcademicYears = async () => {
      try {
        const currentYear = await getTeacherCurrentAcademicYear();
        const data = currentYear ? [currentYear] : [];
        setAcademicYears(data);
        if (currentYear?._id) setSelectedYear((value) => value || currentYear._id);
      } catch {
        setAcademicYears([]);
      }
    };
    loadAcademicYears();
  }, []);

  useEffect(() => {
    const fetchSchedule = async () => {
      setLoading(true);
      try {
        const [today, week] = await Promise.all([
          getTeacherTimetableToday(selectedYear),
          getTeacherTimetableWeek(selectedYear),
        ]);
        setTodaySlots((today || []).map(normalizeSlot));
        setWeekSlots(normalizeWeekResponse(week));
      } catch (error) {
        setToast({
          message: error?.response?.data?.message || 'Failed to load schedule.',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [selectedYear]);

  useEffect(() => {
    if (focusAttendance) setActiveTab('today');
  }, [focusAttendance]);

  const weekGrouped = useMemo(() => {
    const map = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] };
    (weekSlots || []).forEach((slot) => {
      if (map[slot.dayOfWeek]) map[slot.dayOfWeek].push(slot);
    });
    return map;
  }, [weekSlots]);

  const handleOpenAttendance = async (slot) => {
    const slotId = slot.id || `${slot.classId}-${slot.subjectId}-${slot.startTime}`;
    setOpeningId(slotId);
    setErrorBySlotId((prev) => ({ ...prev, [slotId]: '' }));
    try {
      const data = await openAttendanceForScheduledClass({
        schoolYearId: selectedYear,
        classId: slot.classId,
        subjectId: slot.subjectId,
      });
      const session = data?.session || data;
      const sessionId = session?._id || session?.sessionId || data?.sessionId;
      if (!sessionId) throw new Error('Attendance session was not returned by backend.');
      navigate(`/teacher/attendance/${sessionId}`, {
        state: {
          session,
          students: data?.students || [],
          slot,
          schoolYearId: selectedYear,
        },
      });
    } catch (error) {
      const message = error?.response?.data?.message || 'No scheduled class now. Attendance is locked.';
      setErrorBySlotId((prev) => ({ ...prev, [slotId]: message }));
      setToast({ message, type: 'error' });
    } finally {
      setOpeningId('');
    }
  };

  const yearOptions = (academicYears || []).map((year) => ({ value: year._id, label: year.name || 'Academic Year' }));
  const todayDayKey = getDayKey(new Date());

  return (
    <div className="space-y-6">
      <div className="phoenix-page-header">
        <div>
          <h1 className="phoenix-page-title">{focusAttendance ? 'Open Attendance' : 'My Schedule'}</h1>
          <p className="phoenix-page-subtitle">Today and weekly timetable with attendance lock checks.</p>
        </div>
        <div className="w-full max-w-xs mt-3 md:mt-0">
          <Select
            label="School Year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            options={yearOptions}
          />
        </div>
      </div>

      <div className="phoenix-card">
        <div className="phoenix-card-body p-4 pb-0">
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'today'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('today')}
            >
              <span>Today</span>
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'week'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('week')}
            >
              <span>Week</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : activeTab === 'today' ? (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-700">Today ({DAY_LABELS[todayDayKey]})</h2>
          {(todaySlots || []).length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(todaySlots || []).map((slot) => {
                const slotId = slot.id || `${slot.classId}-${slot.subjectId}-${slot.startTime}`;
                const isOpening = openingId === slotId;
                return (
                  <div key={slotId} className="space-y-2">
                    <SlotCard
                      slot={slot}
                      dayKey={todayDayKey}
                      onTakeAttendance={handleOpenAttendance}
                      openLabel={isOpening ? 'Opening...' : 'Take Attendance'}
                    />
                    {errorBySlotId[slotId] && (
                      <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{errorBySlotId[slotId]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="phoenix-card">
              <div className="phoenix-card-body text-center py-8 text-sm text-slate-500">
                No classes scheduled for today.
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {(DAY_ORDER || []).map((day) => (
            <div key={day} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-700">{DAY_LABELS[day]}</h3>
              {weekGrouped[day]?.length ? (
                (weekGrouped[day] || [])
                  .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
                  .map((slot) => <SlotCard key={slot.id || `${day}-${slot.startTime}`} slot={slot} dayKey={day} hideAction />)
              ) : (
                <p className="rounded-md bg-slate-50 p-4 text-xs text-slate-400 font-semibold italic text-center">No classes</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
};

export default TeacherSchedule;
