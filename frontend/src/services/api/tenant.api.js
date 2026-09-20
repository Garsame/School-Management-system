import http from './http';

const unwrap = (res) => res?.data?.data || res?.data || res;

export const getBranches = () => http.get('/tenant/branches').then(unwrap);
export const getAcademicYears = () => http.get('/tenant/academic-years').then(unwrap);
export const getClasses = (params) => http.get('/academic/classes', { params }).then(unwrap);
export const getClassCategories = (branchId) => http.get(`/tenant/branches/${branchId}/class-categories`).then(unwrap);
export const getTenantBranding = () => http.get('/tenant/settings/branding').then((res) => res.data?.data || res.data);
