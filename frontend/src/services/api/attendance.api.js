import http from './http';

// School-side attendance. Serves both a school-wide role and a branch-scoped one; the
// backend confines a branch caller to their own branch.

export const getAttendanceSummary = async (params = {}) => {
    const response = await http.get('/attendance/summary', { params });
    return response.data;
};

export const getAttendanceSessions = async (params = {}) => {
    const response = await http.get('/attendance/sessions', { params });
    return response.data;
};

export const openAttendanceSession = async (payload) => {
    const response = await http.post('/attendance/sessions', payload);
    return response.data;
};

export const getSessionRegister = async (sessionId) => {
    const response = await http.get(`/attendance/sessions/${sessionId}`);
    return response.data;
};

export const submitAttendanceRecords = async (sessionId, records) => {
    const response = await http.put(`/attendance/sessions/${sessionId}/records`, { records });
    return response.data;
};

export const closeAttendanceSession = async (sessionId) => {
    const response = await http.patch(`/attendance/sessions/${sessionId}/close`);
    return response.data;
};

export const getStudentAttendance = async (studentId, params = {}) => {
    const response = await http.get(`/attendance/students/${studentId}`, { params });
    return response.data;
};
