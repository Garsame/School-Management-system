import http from './http';

const unwrap = (res) => res?.data?.data || res?.data || res;

export const fetchFeeStructures = (params) => http.get('/tenant/finance/fee-structures', { params }).then(unwrap);
export const createFeeStructure = (data) => http.post('/tenant/finance/fee-structures', data).then(unwrap);
export const getFeeStructure = (id) => http.get(`/tenant/finance/fee-structures/${id}`).then(unwrap);
export const updateFeeStructure = (id, data) => http.put(`/tenant/finance/fee-structures/${id}`, data).then(unwrap);
export const deleteFeeStructure = (id) => http.delete(`/tenant/finance/fee-structures/${id}`).then(unwrap);
export const setFeeStructureOpen = (id, isOpen) => http.put(`/tenant/finance/fee-structures/${id}/open`, { isOpen }).then(unwrap);

export const getDiscountedStudents = (params) => http.get('/tenant/finance/discounts', { params }).then(unwrap);
export const getStudentDiscountPreview = (studentId, params) => http.get(`/tenant/finance/discounts/preview/${studentId}`, { params }).then(unwrap);
export const setStudentDiscount = (studentId, data) => http.put(`/tenant/finance/discounts/${studentId}`, data).then(unwrap);
export const removeStudentDiscount = (studentId) => http.delete(`/tenant/finance/discounts/${studentId}`).then(unwrap);

export const getFinancePolicies = () => http.get('/tenant/finance/policies').then(unwrap);
export const updateFinancePolicies = (data) => http.put('/tenant/finance/policies', data).then(unwrap);

export const getInvoices = (params) => http.get('/tenant/finance/invoices', { params }).then(unwrap);
export const exportInvoicesCsv = (params) => http.get('/tenant/finance/invoices/export.csv', { params, responseType: 'blob' });
export const getInvoice = (id) => http.get(`/tenant/finance/invoices/${id}`).then(unwrap);
export const getBillingMonths = (academicYearId) => http.get('/tenant/finance/billing-months', { params: { academicYearId } }).then(unwrap);
export const generateInvoices = (data) => http.post('/tenant/finance/invoices/generate', data).then(unwrap);
export const searchBillingStudents = (params) => http.get('/tenant/finance/lookups/students', { params }).then(unwrap);

export const getPayments = (params) => http.get('/tenant/finance/payments', { params }).then(unwrap);
export const exportPaymentsCsv = (params) => http.get('/tenant/finance/payments/export.csv', { params, responseType: 'blob' });
export const getPaymentsSummary = (params) => http.get('/tenant/finance/payments/summary', { params }).then(unwrap);
export const getOutstanding = (params) => http.get('/tenant/finance/outstanding', { params }).then(unwrap);
export const exportOutstandingCsv = (params) => http.get('/tenant/finance/outstanding/export.csv', { params, responseType: 'blob' });
export const getFinanceClasses = (params) => http.get('/tenant/finance/lookups/classes', { params }).then(unwrap);
export const getFinanceSections = (params) => http.get('/tenant/finance/lookups/sections', { params }).then(unwrap);

export const getRevenueReport = (params) => http.get('/tenant/finance/reports/revenue', { params }).then(unwrap);

// Monthly collection view, its Excel file, and one student's payment record
export const getMonthlyCollection = (params) => http.get('/tenant/finance/monthly-collection', { params }).then(unwrap);
export const exportMonthlyCollectionXlsx = (params) => http.get('/tenant/finance/monthly-collection/export.xlsx', { params, responseType: 'blob' });
export const getStudentPaymentRecord = (studentId) => http.get(`/tenant/finance/students/${studentId}/payment-record`).then(unwrap);
