import http from './http';

const unwrap = (res) => {
  if (res?.data && Object.prototype.hasOwnProperty.call(res.data, 'success')) return res.data.data;
  return res?.data;
};

const tryGet = async (paths = [], params = {}) => {
  let lastError;
  for (const path of paths) {
    try {
      const res = await http.get(path, { params });
      return unwrap(res);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

export const createTimetableSlot = async (payload) => {
  const res = await http.post('/branch/timetable/slots', payload);
  return unwrap(res);
};

export const getTimetableSlots = async (filters = {}) => {
  const res = await http.get('/branch/timetable/slots', { params: filters });
  return unwrap(res) || [];
};

export const updateTimetableSlot = async (slotId, payload) => {
  const res = await http.put(`/branch/timetable/slots/${slotId}`, payload);
  return unwrap(res);
};

export const setTimetableSlotStatus = async (slotId, isActive) => {
  const res = await http.patch(`/branch/timetable/slots/${slotId}/status`, { isActive });
  return unwrap(res);
};

export const getBranchClassesForTimetable = async () => {
  const data = await tryGet(['/branch/classes', '/branch/shared/classes']);
  return Array.isArray(data) ? data : [];
};

export const getAcademicYearsForTimetable = async () => {
  const data = await tryGet(['/tenant/academic-years', '/branch/academic-years/current', '/branch/shared/academic-years/current']);
  if (Array.isArray(data)) return data;
  if (data?._id) return [data];
  return [];
};

export const getBranchTeachersForTimetable = async () => {
  try {
    const data = await tryGet(['/branch/users'], { role: 'TEACHER' });
    return Array.isArray(data) ? data : [];
  } catch {
    const fallback = await tryGet(['/branch/users'], { role: 'teacher' });
    return Array.isArray(fallback) ? fallback : [];
  }
};

export const getCurriculumForClassYear = async ({ classId, schoolYearId }) => {
  try {
    const direct = await tryGet(['/branch/curriculum'], { classId, schoolYearId });
    return Array.isArray(direct) ? direct : [];
  } catch {
    const fallback = await tryGet(['/branch/shared/class-subjects'], { classId, academicYearId: schoolYearId });
    if (!Array.isArray(fallback)) return [];
    return fallback.map((item) => ({
      ...item,
      subjectId: item.subjectId?._id || item.subjectId,
      subject: item.subjectId,
    }));
  }
};

