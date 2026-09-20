import http from './http';

const unwrap = (res) => {
  if (res?.data && Object.prototype.hasOwnProperty.call(res.data, 'success')) return res.data.data;
  return res?.data;
};

export const openAttendanceForScheduledClass = async (payload) => {
  const res = await http.post('/teacher/attendance/open', payload);
  return unwrap(res);
};

export const submitAttendanceSessionRecords = async (sessionId, records = []) => {
  const res = await http.post(`/teacher/attendance/sessions/${sessionId}/records`, { records });
  return unwrap(res);
};

export const closeAttendanceSession = async (sessionId) => {
  const res = await http.post(`/teacher/attendance/sessions/${sessionId}/close`);
  return unwrap(res);
};

export const getTeacherAttendanceSessions = async (params = {}) => {
  const res = await http.get('/teacher/attendance/sessions', { params });
  return unwrap(res) || [];
};

