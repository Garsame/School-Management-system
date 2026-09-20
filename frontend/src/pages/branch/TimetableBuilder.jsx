import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Select, Input, Modal, Spinner, Toast } from '../../components/ui';
import {
  createTimetableSlot,
  getAcademicYearsForTimetable,
  getBranchClassesForTimetable,
  getBranchTeachersForTimetable,
  getCurriculumForClassYear,
  getTimetableSlots,
  setTimetableSlotStatus,
  updateTimetableSlot,
} from '../../services/api/branchTimetable.api';
import { getSections } from '../../services/api/branch.api';
import { DAY_ORDER, DAY_LABELS } from '../../utils/dates';
import {
  Plus,
  Calendar,
  Clock,
  Edit2,
  CalendarDays,
  CalendarOff,
  MapPin,
  UserRound,
  Power,
  RotateCcw,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const defaultForm = {
  schoolYearId: '',
  classId: '',
  sectionId: '',
  subjectId: '',
  teacherUserId: '',
  dayOfWeek: 'MON',
  startTime: '',
  endTime: '',
  room: '',
};

const extractId = (value) => (typeof value === 'object' ? value?._id : value);
const extractName = (value, fallback = '') => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.name || value.fullName || fallback;
};

const normalizeSlot = (slot) => ({
  ...slot,
  id: slot._id || slot.id,
  classId: extractId(slot.classId),
  className: extractName(slot.classId),
  sectionId: extractId(slot.sectionId),
  sectionName: extractName(slot.sectionId),
  subjectId: extractId(slot.subjectId),
  subjectName: extractName(slot.subjectId),
  teacherUserId: extractId(slot.teacherUserId),
  teacherName: extractName(slot.teacherUserId, 'Teacher'),
  schoolYearId: extractId(slot.schoolYearId || slot.academicYearId),
});

const TimetableBuilder = () => {
    const { user } = useAuth();
  const { classId: classIdFromRoute } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [inlineError, setInlineError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [yearsData, classesData, teachersData] = await Promise.all([
          getAcademicYearsForTimetable(),
          getBranchClassesForTimetable(),
          getBranchTeachersForTimetable(),
        ]);

        const yearRows = yearsData || [];
        const classRows = classesData || [];
        setYears(yearRows);
        setClasses(classRows);
        setTeachers(teachersData || []);
        if (yearRows.length) setSelectedYear((current) => current || yearRows[0]._id);
        if (classIdFromRoute) setSelectedClass((current) => current || classIdFromRoute);
      } catch (error) {
        setToast({
          message: error?.response?.data?.message || 'Failed to load timetable setup data.',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [classIdFromRoute]);

  useEffect(() => {
    if (!selectedYear || !selectedClass) {
      setSlots([]);
      setSubjects([]);
      return;
    }

    const loadData = async () => {
      setSlotsLoading(true);
      try {
        const [slotsData, curriculumData] = await Promise.all([
          getTimetableSlots({
            schoolYearId: selectedYear,
            classId: selectedClass,
            ...(selectedSection ? { sectionId: selectedSection } : {}),
          }),
          getCurriculumForClassYear({ schoolYearId: selectedYear, classId: selectedClass }),
        ]);
        setSlots((slotsData || []).map(normalizeSlot));

        const subjectMap = new Map();
        (curriculumData || []).forEach((item) => {
          const subjectRef = item.subject || item.subjectId;
          const subjectId = extractId(subjectRef || item.subjectId);
          const subjectName = extractName(subjectRef, item.subjectName || 'Subject');
          if (subjectId) subjectMap.set(subjectId, { value: subjectId, label: subjectName });
        });
        setSubjects(Array.from(subjectMap.values()));
      } catch (error) {
        setToast({
          message: error?.response?.data?.message || 'Failed to load timetable slots.',
          type: 'error',
        });
      } finally {
        setSlotsLoading(false);
      }
    };

    loadData();
  }, [selectedYear, selectedClass, selectedSection]);

  const loadSectionsForClass = async (classId) => {
    if (!classId) {
      setSections([]);
      return;
    }
    setSectionsLoading(true);
    try {
      const payload = await getSections(classId);
      setSections(Array.isArray(payload) ? payload : payload?.data || []);
    } catch (error) {
      setSections([]);
      setToast({
        message: error?.response?.data?.message || 'Failed to load sections for selected class.',
        type: 'error',
      });
    } finally {
      setSectionsLoading(false);
    }
  };

  useEffect(() => {
    loadSectionsForClass(selectedClass);
  }, [selectedClass]);

  const teacherOptions = useMemo(
    () =>
      teachers.map((teacher) => ({
        value: teacher._id,
        label: teacher.name || teacher.fullName || teacher.email || 'Teacher',
      })),
    [teachers]
  );

  const classOptions = useMemo(
    () => classes.map((cls) => ({ value: cls._id, label: cls.name || cls.className || 'Class' })),
    [classes]
  );

  const sectionOptions = useMemo(
    () => sections.map((section) => ({ value: section._id, label: section.name || 'Section' })),
    [sections]
  );

  const yearOptions = useMemo(
    () => years.map((year) => ({ value: year._id, label: year.name || year.title || 'Academic Year' })),
    [years]
  );

  const openCreate = () => {
    setEditingSlot(null);
    setInlineError('');
    setForm({
      ...defaultForm,
      schoolYearId: selectedYear,
      classId: selectedClass,
      sectionId: selectedSection,
      dayOfWeek: 'MON',
    });
    loadSectionsForClass(selectedClass);
    setIsModalOpen(true);
  };

  const openEdit = (slot) => {
    setEditingSlot(slot);
    setInlineError('');
    setForm({
      schoolYearId: slot.schoolYearId || selectedYear,
      classId: slot.classId || selectedClass,
      sectionId: slot.sectionId || '',
      subjectId: slot.subjectId || '',
      teacherUserId: slot.teacherUserId || '',
      dayOfWeek: slot.dayOfWeek || 'MON',
      startTime: slot.startTime || '',
      endTime: slot.endTime || '',
      room: slot.room || '',
    });
    loadSectionsForClass(slot.classId || selectedClass);
    setIsModalOpen(true);
  };

  const sortByTime = (a, b) => a.startTime.localeCompare(b.startTime);

  const slotsByDay = useMemo(() => {
    const map = {
      MON: [],
      TUE: [],
      WED: [],
      THU: [],
      FRI: [],
      SAT: [],
    };
    slots.forEach((slot) => {
      if (map[slot.dayOfWeek]) map[slot.dayOfWeek].push(slot);
    });
    Object.keys(map).forEach((day) => map[day].sort(sortByTime));
    return map;
  }, [slots]);

  const activeSlotCount = useMemo(
    () => slots.filter((slot) => slot.isActive).length,
    [slots]
  );

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setInlineError('');
    try {
      if (editingSlot) {
        await updateTimetableSlot(editingSlot.id, form);
        setToast({ message: 'Timetable slot updated.', type: 'success' });
      } else {
        await createTimetableSlot(form);
        setToast({ message: 'Timetable slot created.', type: 'success' });
      }
      setIsModalOpen(false);
      const latest = await getTimetableSlots({
        schoolYearId: selectedYear,
        classId: selectedClass,
        ...(selectedSection ? { sectionId: selectedSection } : {}),
      });
      setSlots((latest || []).map(normalizeSlot));
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to save timetable slot.';
      let formatted = message;
      if (/overlap/i.test(message)) {
        formatted = 'Timetable overlap detected';
      } else if (/duplicate/i.test(message) || /already exists/i.test(message)) {
        formatted = 'Duplicate slot exists';
      }
      setInlineError(formatted);
      setToast({ message: formatted, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSlotStatus = async (slot) => {
    try {
      await setTimetableSlotStatus(slot.id, !slot.isActive);
      const latest = await getTimetableSlots({
        schoolYearId: selectedYear,
        classId: selectedClass,
        ...(selectedSection ? { sectionId: selectedSection } : {}),
      });
      setSlots((latest || []).map(normalizeSlot));
      setToast({ message: 'Slot status updated.', type: 'success' });
    } catch (error) {
      setToast({
        message: error?.response?.data?.message || 'Failed to update slot status.',
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="phoenix-page-header">
        <div>
          <h1 className="phoenix-page-title">Timetable Builder</h1>
          <p className="phoenix-page-subtitle">Create and manage weekly class schedules.</p>
        </div>
        {hasPermission(user, 'branch.timetable.manage') && <Button onClick={openCreate} disabled={!selectedYear || !selectedClass} className="flex items-center gap-2 !h-9 text-xs" variant="primary">
          <Plus size={16} /> Add Slot
        </Button>}
      </div>

      <article className="phoenix-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <Select
            label="School Year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            options={yearOptions}
            className="!h-10 text-xs"
          />
          <Select
            label="Class"
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setSelectedSection('');
            }}
            options={classOptions}
            className="!h-10 text-xs"
          />
          <Select
            label="Section"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            options={sectionOptions}
            disabled={!selectedClass || sectionsLoading}
            placeholder={sectionsLoading ? 'Loading sections...' : 'All Sections'}
            className="!h-10 text-xs"
          />
          <div className="flex h-10 min-w-[190px] items-center gap-3 rounded-md border border-[#d8dde7] bg-white px-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]">
              <CalendarDays size={15} />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-[#141824]">{slots.length} weekly slots</p>
              <p className="text-[11px] text-[#6e7891]">{activeSlotCount} currently active</p>
            </div>
          </div>
        </div>
      </article>

      {loading || slotsLoading ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <section className="phoenix-card overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {DAY_ORDER.map((day) => (
            <article key={day} className="min-h-[270px] border-b border-r border-[#e3e6ed] bg-white">
              <header className="flex items-center justify-between border-b border-[#e3e6ed] bg-[#f7f8fb] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--primary)_20%,#d8dde7)] bg-white text-[var(--primary)]">
                    <CalendarDays size={15} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#141824]">{DAY_LABELS[day]}</h3>
                    <p className="text-[11px] text-[#8a94ad]">Weekly schedule</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#6e7891]">
                  {slotsByDay[day]?.length || 0} {slotsByDay[day]?.length === 1 ? 'class' : 'classes'}
                </span>
              </header>
              <div className="divide-y divide-[#edf0f5] px-4">
                {slotsByDay[day]?.length ? (
                  slotsByDay[day].map((slot) => (
                    <div key={slot.id} className="relative py-4 pl-3" style={{ borderLeft: `3px solid ${slot.isActive ? 'var(--primary)' : '#cbd0dd'}` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#3e465b]">
                              <Clock size={13} className="text-[var(--primary)]" />
                              {slot.startTime} - {slot.endTime}
                            </span>
                            <span className={`flex items-center gap-1 text-[10px] font-semibold ${slot.isActive ? 'text-emerald-700' : 'text-[#8a94ad]'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${slot.isActive ? 'bg-emerald-500' : 'bg-[#b8c0d2]'}`} />
                              {slot.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-[#141824]">{slot.subjectName || 'Subject'}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6e7891]">
                            <UserRound size={13} />
                            <span className="truncate">{slot.teacherName || 'Teacher'}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(slot)}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#d8dde7] bg-white text-[#52617a] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                            aria-label={`Edit ${slot.subjectName || 'timetable'} slot`}
                            title="Edit slot"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSlotStatus(slot)}
                            className={`flex h-8 w-8 items-center justify-center rounded-md border bg-white transition-colors ${
                              slot.isActive
                                ? 'border-[#f1c3cc] text-[#d63354] hover:bg-[#fff3f5]'
                                : 'border-[#d8dde7] text-[#52617a] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                            }`}
                            aria-label={slot.isActive ? 'Deactivate slot' : 'Activate slot'}
                            title={slot.isActive ? 'Deactivate slot' : 'Activate slot'}
                          >
                            {slot.isActive ? <Power size={14} /> : <RotateCcw size={14} />}
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8a94ad]">
                        <span className="flex items-center gap-1"><UsersRound size={12} />{slot.sectionName || 'All sections'}</span>
                        {slot.room && <span className="flex items-center gap-1"><MapPin size={12} />{slot.room}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex min-h-[205px] flex-col items-center justify-center px-4 text-center">
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#f1f3f7] text-[#9aa4b8]">
                      <CalendarOff size={19} />
                    </span>
                    <p className="text-xs font-semibold text-[#52617a]">No classes scheduled</p>
                    <p className="mt-1 text-[11px] text-[#8a94ad]">Add a slot when this day is needed.</p>
                  </div>
                )}
              </div>
            </article>
          ))}
          </div>
        </section>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-[#eaf0ff] text-[#3874ff] rounded flex items-center justify-center">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#141824]">{editingSlot ? 'Edit Timetable Slot' : 'Add Timetable Slot'}</h3>
              <p className="text-[10px] font-semibold text-[#8a94ad] uppercase tracking-wider">Weekly Schedule Coordinator</p>
            </div>
          </div>
        }
      >
        <form className="space-y-4 py-2" onSubmit={handleSave}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="School Year"
              value={form.schoolYearId}
              onChange={(e) => setForm((prev) => ({ ...prev, schoolYearId: e.target.value }))}
              options={yearOptions}
              required
            />
            <Select
              label="Class"
              value={form.classId}
              onChange={(e) => {
                const nextClassId = e.target.value;
                setForm((prev) => ({ ...prev, classId: nextClassId, sectionId: '' }));
                loadSectionsForClass(nextClassId);
              }}
              options={classOptions}
              required
            />
            <Select
              label="Section (Optional)"
              value={form.sectionId}
              onChange={(e) => setForm((prev) => ({ ...prev, sectionId: e.target.value }))}
              options={sectionOptions}
              disabled={!form.classId || sectionsLoading}
              placeholder={sectionsLoading ? 'Loading sections...' : 'All Sections'}
            />
            <Select
              label="Subject"
              value={form.subjectId}
              onChange={(e) => setForm((prev) => ({ ...prev, subjectId: e.target.value }))}
              options={subjects}
              required
            />
            <Select
              label="Teacher"
              value={form.teacherUserId}
              onChange={(e) => setForm((prev) => ({ ...prev, teacherUserId: e.target.value }))}
              options={teacherOptions}
              required
            />
            <Select
              label="Day"
              value={form.dayOfWeek}
              onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))}
              options={DAY_ORDER.map((day) => ({ value: day, label: DAY_LABELS[day] }))}
              required
            />
            <Input
              label="Room"
              value={form.room}
              onChange={(e) => setForm((prev) => ({ ...prev, room: e.target.value }))}
              placeholder="e.g. Lab 20"
            />
            <Input
              label="Start Time"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
              required
            />
            <Input
              label="End Time"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
              required
            />
          </div>

          {inlineError && <p className="rounded bg-[#fdebef] text-[#e63757] px-3 py-2 text-xs font-semibold">{inlineError}</p>}

          <div className="flex justify-end gap-2 pt-4 border-t border-[#e3e6ed]">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} variant="primary">
              {saving ? 'Saving...' : editingSlot ? 'Update Slot' : 'Create Slot'}
            </Button>
          </div>
        </form>
      </Modal>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
};

export default TimetableBuilder;
