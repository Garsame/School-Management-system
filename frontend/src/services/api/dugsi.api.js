import http from './http';

export const getQuranReference = async () => {
    const response = await http.get('/dugsi/quran-reference');
    return response.data;
};

export const getMyAllocatedClasses = async () => {
    const response = await http.get('/dugsi/my-classes');
    return response.data;
};

export const getCandidateStudents = async () => {
    const response = await http.get('/dugsi/candidates');
    return response.data;
};

export const enrollStudents = async (data) => {
    const response = await http.post('/dugsi/students/enroll', data);
    return response.data;
};

export const withdrawStudent = async (studentId, reason = '') => {
    const response = await http.delete(`/dugsi/students/${studentId}`, { data: { reason } });
    return response.data;
};

export const getMyDugsiStudents = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/dugsi/students${query ? `?${query}` : ''}`);
    return response.data;
};

export const updateLearningStage = async (studentId, learningStage) => {
    const response = await http.patch(`/dugsi/students/${studentId}/stage`, { learningStage });
    return response.data;
};

export const getTodayRegister = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/dugsi/attendance/today${query ? `?${query}` : ''}`);
    return response.data;
};

export const submitDugsiAttendance = async (data) => {
    const response = await http.post('/dugsi/attendance', data);
    return response.data;
};

export const getStudentProgress = async (studentId) => {
    const response = await http.get(`/dugsi/progress/${studentId}`);
    return response.data;
};

export const recordStudentProgress = async (studentId, data) => {
    const response = await http.post(`/dugsi/progress/${studentId}`, data);
    return response.data;
};

export const getAdminAllocations = async () => {
    const response = await http.get('/dugsi/admin/allocations');
    return response.data;
};

export const allocateClassesToTeacher = async (data) => {
    const response = await http.post('/dugsi/admin/allocate-classes', data);
    return response.data;
};

export const removeClassAllocation = async (allocationId) => {
    const response = await http.delete(`/dugsi/admin/allocations/${allocationId}`);
    return response.data;
};

export const getAdminOverview = async () => {
    const response = await http.get('/dugsi/admin/overview');
    return response.data;
};

export const getParentStudentDugsi = async (studentId) => {
    const response = await http.get(`/parent/students/${studentId}/dugsi`);
    return response.data;
};

export const getStudentPortalDugsi = async () => {
    const response = await http.get('/student/dugsi');
    return response.data;
};
