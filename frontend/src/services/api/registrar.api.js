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

/**
 * Send the school's own file. The server reads .xlsx and .csv, matches the headings loosely,
 * and can create any class or section the list mentions that the school has not set up yet.
 */
// fixes are the corrections typed on the preview screen, keyed by the row number shown
// there: { 86: { guardianPhone: '+252615648340' } }. The file is sent again with them so
// the whole list can be finished without going back to Excel.
export const previewStudentImportFile = async (file, { createMissing = false, fixes = null } = {}) => {
    const payload = new FormData();
    payload.append('file', file);
    if (createMissing) payload.append('createMissing', 'true');
    if (fixes && Object.keys(fixes).length) payload.append('fixes', JSON.stringify(fixes));
    return await http.post('/registrar/students/import-preview-file', payload);
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

export const transferStudentClass = async (data) => {
    return await http.post('/academic/transfer/class', data);
};

export const apiResetStudentPassword = async (id) => {
    return await http.put(`/registrar/students/${id}/reset-password`);
};

export const getRegistrarStats = async () => {
    return await http.get('/registrar/stats');
};
