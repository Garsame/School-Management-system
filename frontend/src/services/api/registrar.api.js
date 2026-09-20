import { http } from './http';

export const getCurrentAcademicYear = async () => {
    return await http.get('/registrar/academic-years/current');
};

export const createStudentAdmission = async (data) => {
    return await http.post('/registrar/students', data);
};

export const getStudents = async (params) => {
    // params: { classId, academicYearId, status, q }
    return await http.get('/registrar/students', { params });
};

export const exportStudentsCsv = async (params) => {
    return await http.get('/registrar/students/export.csv', { params, responseType: 'blob' });
};

export const downloadStudentImportTemplate = async () => {
    return await http.get('/registrar/students/import-template.csv', { responseType: 'blob' });
};

export const previewStudentImport = async (rows) => {
    return await http.post('/registrar/students/import-preview', { rows });
};

export const getStudentById = async (id) => {
    return await http.get(`/registrar/students/${id}`);
};

export const getAdmissionSummary = async (id) => {
    return await http.get(`/registrar/students/${id}/admission-summary`);
};

export const updateStudent = async (id, data) => {
    return await http.put(`/registrar/students/${id}`, data);
};

export const createEnrollment = async (data) => {
    return await http.post('/registrar/enrollments', data);
};

export const apiResetStudentPassword = async (id) => {
    return await http.put(`/registrar/students/${id}/reset-password`);
};

export const getRegistrarStats = async () => {
    return await http.get('/registrar/stats');
};
