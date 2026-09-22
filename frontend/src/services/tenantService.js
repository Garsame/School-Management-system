import api from './api';

const tenantService = {
  // Auth
  login: (data) => api.post('/tenant/auth/login', data),

  // Branding
  getBranding: () => api.get('/tenant/settings/branding'),
  updateBranding: (data) => api.put(
    '/tenant/settings/branding',
    data,
    data instanceof FormData
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined
  ),

  // Branches
  getBranches: () => api.get('/tenant/branches'),
  getBranchClasses: (branchId, studentId) => api.get(`/tenant/branches/${branchId}/classes`, { params: studentId ? { studentId } : {} }),
  createBranch: (data) => api.post('/tenant/branches', data),
  getBranch: (id) => api.get(`/tenant/branches/${id}`),
  updateBranch: (id, data) => api.put(`/tenant/branches/${id}`, data),
  updateBranchStatus: (id, isActive) => api.patch(`/tenant/branches/${id}/status`, { isActive }),
  assignBranchAdmin: (branchId, userId) => api.post(`/tenant/branches/${branchId}/assign-branch-admin`, { userId }),

  // Users
  getUsers: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return api.get(`/tenant/users?${params}`);
  },
  createUser: (data) => api.post('/tenant/users', data),
  getUser: (id) => api.get(`/tenant/users/${id}`),
  updateUser: (id, data) => api.put(`/tenant/users/${id}`, data),
  updateUserStatus: (id, isActive) => api.patch(`/tenant/users/${id}/status`, { isActive }),
  resetUserPassword: (id, password) => api.patch(`/tenant/users/${id}/password`, password ? { password } : {}),
  getPermissionCatalog: () => api.get('/tenant/permissions/catalog'),
  getUserPermissions: (id) => api.get(`/tenant/users/${id}/permissions`),
  updateUserPermissions: (id, data) => api.put(`/tenant/users/${id}/permissions`, data),

  // Roles: what each role can do. Roles are fixed; their names, features and on/off are the school's.
  getRoles: () => api.get('/tenant/roles'),
  getRoleCatalog: (scope) => api.get('/tenant/roles/assignable-catalog', { params: { scope } }),
  updateRole: (id, data) => api.put(`/tenant/roles/${id}`, data),

  // Academic Years
  getAcademicYears: () => api.get('/tenant/academic-years'),
  createAcademicYear: (data) => api.post('/tenant/academic-years', data),
  updateAcademicYear: (id, data) => api.put(`/tenant/academic-years/${id}`, data),
  deleteAcademicYear: (id) => api.delete(`/tenant/academic-years/${id}`),
  setCurrentYear: (id) => api.patch(`/tenant/academic-years/${id}/set-current`),
  clearCurrentYear: (id) => api.patch(`/tenant/academic-years/${id}/clear-current`),
  getAcademicPolicy: () => api.get('/tenant/academic-policy'),
  updateAcademicPolicy: (data) => api.put('/tenant/academic-policy', data),
  getTerms: (yearId) => api.get(`/tenant/academic-years/${yearId}/terms`),
  createTerm: (yearId, data) => api.post(`/tenant/academic-years/${yearId}/terms`, data),
  updateTerm: (termId, data) => api.put(`/tenant/terms/${termId}`, data),
  deleteTerm: (termId) => api.delete(`/tenant/terms/${termId}`),

  // Reports
  getOverviewReport: (branchId = '', academicYearId = '') => 
    api.get(`/tenant/reports/overview?branchId=${branchId}&academicYearId=${academicYearId}`),

  // Student directory
  getStudents: (filters = {}) => api.get('/students', { params: filters }),
  getStudent: (id) => api.get(`/students/${id}`),

  // Audit Logs
  getAuditLogs: (filters = {}) => api.get('/tenant/audit', { params: filters })
};

export default tenantService;
