import http from './http';

const unwrap = (res) => {
  if (res?.data && Object.prototype.hasOwnProperty.call(res.data, 'success')) return res.data.data;
  return res?.data;
};

export const getStudentTimetableToday = async (schoolYearId) => {
  const res = await http.get('/student/timetable/today', { params: { schoolYearId } });
  return unwrap(res) || [];
};

export const getStudentTimetableWeek = async (schoolYearId) => {
  const res = await http.get('/student/timetable/week', { params: { schoolYearId } });
  return unwrap(res) || [];
};

