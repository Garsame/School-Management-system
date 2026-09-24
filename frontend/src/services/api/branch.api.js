import http from './http';

export const getCurrentAcademicYear = async () => {
    const response = await http.get('/branch/shared/academic-years/current');
    return response.data;
};

export const getAcademicYears = async () => {
    const response = await http.get('/branch/academic-years');
    return response.data;
};

export const getTerms = async (yearId) => {
    const response = await http.get(`/branch/academic-years/${yearId}/terms`);
    return response.data;
};

// --- Classes ---
export const getClasses = async () => {
    const response = await http.get('/branch/shared/classes');
    return response.data;
};

export const createClass = async (data) => {
    const response = await http.post('/branch/classes', data);
    return response.data;
};

export const getClass = async (id) => {
    const response = await http.get(`/branch/classes/${id}`);
    return response.data;
};

export const updateClass = async (id, data) => {
    const response = await http.put(`/branch/classes/${id}`, data);
    return response.data;
};

// --- Class Categories ---
export const getClassCategories = async () => {
    const response = await http.get('/branch/shared/class-categories');
    return response.data;
};

export const createClassCategory = async (data) => {
    const response = await http.post('/branch/class-categories', data);
    return response.data;
};

// --- Sections ---
export const getSections = async (classId) => {
    let url = '/branch/shared/sections';
    if (classId) url += `?classId=${classId}`;
    const response = await http.get(url);
    return response.data;
};

export const createSection = async (data) => {
    const response = await http.post('/branch/sections', data);
    return response.data;
};

// --- Subjects ---
export const getSubjects = async () => {
    const response = await http.get('/branch/shared/subjects');
    return response.data;
};

export const createSubject = async (data) => {
    const response = await http.post('/branch/subjects', data);
    return response.data;
};

// --- Class Subjects (Assignment of Subjects to Classes) ---
export const getClassSubjects = async (classId) => {
    let url = '/branch/shared/class-subjects';
    if (classId) url += `?classId=${classId}`;
    const response = await http.get(url);
    return response.data;
};

export const createClassSubject = async (data) => {
    const response = await http.post('/branch/class-subjects', data);
    return response.data;
};

export const deleteClassSubject = async (id) => {
    const response = await http.delete(`/branch/class-subjects/${id}`);
    return response.data;
};

// --- Staff ---
export const getBranchUsers = async (role) => {
    let url = '/branch/users';
    if (role) url += `?role=${role}`;
    const response = await http.get(url);
    return response.data;
};

export const createBranchUser = async (data) => {
    const response = await http.post('/branch/users', data);
    return response.data;
};

export const updateBranchUser = async (id, data) => {
    const response = await http.put(`/branch/users/${id}`, data);
    return response.data;
};

// --- Students ---
export const getStudents = async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const response = await http.get(`/branch/students?${query}`);
    return response.data;
};

export const getStudent = async (id) => {
    const response = await http.get(`/branch/students/${id}`);
    return response.data;
};

export const promoteStudents = async (data) => {
    const response = await http.post('/branch/enrollments/promote', data);
    return response.data;
};

export const getTransferBranches = async () => {
    const response = await http.get('/academic/transfer/branches');
    return response.data;
};

export const getTransferClasses = async (branchId, studentId) => {
    const response = await http.get(`/academic/transfer/branches/${branchId}/classes`, { params: { studentId } });
    return response.data;
};

export const getTransferSections = async (branchId, classId) => {
    const response = await http.get(`/academic/transfer/branches/${branchId}/classes/${classId}/sections`);
    return response.data;
};

export const transferStudent = async (data) => {
    const response = await http.post('/academic/transfer', data);
    return response.data;
};

export const transferStudentClass = async (data) => {
    const response = await http.post('/academic/transfer/class', data);
    return response.data;
};

// --- Exams ---
export const getExams = async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const response = await http.get(`/branch/exams?${query}`);
    return response.data;
};

export const createExam = async (data) => {
    const response = await http.post('/branch/exams', data);
    return response.data;
};

export const getExam = async (id) => {
    const response = await http.get(`/branch/exams/${id}`);
    return response.data;
};

export const updateExamStatus = async (id, status) => {
    const response = await http.patch(`/branch/exams/${id}/status`, { status });
    return response.data;
};

export const deleteExam = async (id) => {
    const response = await http.delete(`/branch/exams/${id}`);
    return response.data;
};

// --- Exam Categories ---
export const getExamCategories = async () => {
    const response = await http.get('/branch/exam-categories');
    return response.data;
};

export const createExamCategory = async (data) => {
    const response = await http.post('/branch/exam-categories', data);
    return response.data;
};

// --- Results ---
export const getResults = async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const response = await http.get(`/branch/results?${query}`);
    return response.data;
};

export const getResultsSummary = async (examId, classId) => {
    let query = `?examId=${examId}`;
    if (classId) query += `&classId=${classId}`;
    const response = await http.get(`/branch/results/summary${query}`);
    return response.data;
};

export const getClassResults = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/branch/results/class?${query}`);
    return response.data;
};

export const getStudentResults = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await http.get(`/branch/results/student?${query}`);
    return response.data;
};

// --- Teacher Assignments ---
export const createTeacherWithAssignments = async (data) => {
    const response = await http.post('/branch/users/teachers', data);
    return response.data;
};

export const getTeacherAssignments = async (teacherUserId) => {
    const response = await http.get(`/branch/users/teachers/${teacherUserId}/assignments`);
    return response.data;
};

export const updateTeacherAssignments = async (teacherUserId, assignments) => {
    const response = await http.put(`/branch/users/teachers/${teacherUserId}/assignments`, { assignments });
    return response.data;
};

export const getAllBranchAssignments = async () => {
    const response = await http.get('/branch/assignments/all');
    return response.data;
};

// --- Reports ---
export const getBranchOverview = async (academicYearId = '') => {
    const response = await http.get(`/branch/reports/overview?academicYearId=${academicYearId}`);
    return response.data;
};

// --- Student ID Format Configuration ---
export const getStudentIdConfig = async () => {
    const response = await http.get('/branch/student-id-config');
    return response.data;
};

export const updateStudentIdConfig = async (data) => {
    const response = await http.put('/branch/student-id-config', data);
    return response.data;
};

