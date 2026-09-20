import http from './http';

// Exams
export const getExams = (params) => http.get('/teacher/exams', { params }).then(res => res.data);
export const getExam = (id) => http.get(`/teacher/exams/${id}`).then(res => res.data);
export const getExamStudents = (id) => http.get(`/teacher/exams/${id}/students`).then(res => res.data); // Renamed and updated path
export const getExamCategories = () => http.get('/teacher/exam-categories').then(res => res.data);
export const getExamTemplates = () => http.get('/teacher/exam-templates').then(res => res.data);

// Results
export const getResults = (params) => http.get('/teacher/exam-results', { params }).then(res => res.data); // Updated path
export const enterResult = (data) => http.post('/teacher/exam-results', data).then(res => res.data); // Updated path
export const batchEnterResults = (examId, results) => http.post('/teacher/exam-results/bulk', { examId, results }).then(res => res.data); // Updated path
export const updateResult = (id, data) => http.put(`/teacher/exam-results/${id}`, data).then(res => res.data); // Updated path
export const getResultsSummary = (params) => http.get('/teacher/exam-results/summary', { params }).then(res => res.data); // Updated path
export const getClassResults = (params) => http.get('/teacher/results/class', { params }).then(res => res.data);

// Exports
export const exportResults = (examId, format) => {
    return http.get(`/teacher/exports/results?examId=${examId}&format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json'
    }).then(res => res.data);
};

// Policy
export const getGradingPolicy = () => http.get('/teacher/grading-policy').then(res => res.data);

// Students
export const getStudents = (params) => http.get('/teacher/students', { params }).then(res => res.data);

// Assignments
export const getAuthorizedBranches = () => http.get('/teacher/branches').then(res => res.data);
export const getTeacherAssignments = (academicYearId) => 
    http.get('/teacher/assignments', { params: { academicYearId } }).then(res => res.data);

// Shared / Academic Info
export const getClassSubjects = (classId) => 
    http.get('/branch/shared/class-subjects', { params: { classId } }).then(res => res.data);

// Profile and Settings
export const getProfile = () => http.get('/teacher/profile').then(res => res.data);
export const updateProfile = (data) => http.put('/teacher/profile', data).then(res => res.data);
export const changePassword = (data) => http.put('/teacher/change-password', data).then(res => res.data);
