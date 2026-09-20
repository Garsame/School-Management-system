import http from './http';

export const apiStudentLogin = async (username, password) => {
    const response = await http.post('/auth/login', { 
        username, 
        password,
        requiredRoles: ['student']
    }); 
    return response.data;
};

export const apiGetStudentProfile = async () => {
    const response = await http.get('/student/profile');
    return response.data;
};

export const apiGetStudentAcademicYears = async () => {
    const response = await http.get('/student/academic-years');
    return response.data;
};

export const apiChangeStudentPassword = async (oldPassword, newPassword) => {
    const response = await http.post('/student/auth/change-password', { oldPassword, newPassword });
    return response.data;
};

export const apiGetStudentResults = async () => {
    const response = await http.get('/student/results');
    return response.data;
};

export const apiGetStudentResultsBy = async (params) => {
    const response = await http.get('/student/results', { params });
    return response.data;
};

export const apiGetStudentSubjects = async (params) => {
    const response = await http.get('/student/subjects', { params });
    return response.data;
};

export const apiGetStudentRank = async (params) => {
    const response = await http.get('/student/rank', { params });
    return response.data;
};

export const apiGetStudentAttendance = async (schoolYearId) => {
    const params = schoolYearId ? { schoolYearId } : {};
    const response = await http.get('/student/attendance', { params });
    return response.data;
};

export const apiGetStudentExams = async (params) => {
    const response = await http.get('/student/exams', { params });
    return response.data;
};
