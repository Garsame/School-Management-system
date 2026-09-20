import http from './http';

const unwrap = (res) => {
  if (res?.data && Object.prototype.hasOwnProperty.call(res.data, 'success')) return res.data.data;
  return res?.data;
};

export const getTeacherTimetableToday = async (schoolYearId) => {
  const res = await http.get('/teacher/timetable/today', { params: { schoolYearId } });
  return unwrap(res) || [];
};

export const getTeacherTimetableWeek = async (schoolYearId) => {
  const res = await http.get('/teacher/timetable/week', { params: { schoolYearId } });
  return unwrap(res) || [];
};

export const getTeacherCurrentAcademicYear = async () => {
  const res = await http.get('/branch/shared/academic-years/current');
  return unwrap(res) || null;
};

