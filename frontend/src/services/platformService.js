import api from './api';
import axios from 'axios';
import { API_BASE_URL } from './api';

// Public API — no auth token needed
const publicApi = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' } });

const platformService = {
  getDashboardStats: () => api.get('/platform/dashboard'),
  
  getTenants: () => api.get('/platform/tenants'),
  createTenant: (data) => api.post('/platform/tenants', data),
  getTenantDetails: (id) => api.get(`/platform/tenants/${id}`),
  updateTenantStatus: (id, status, reason = '') => api.patch(`/platform/tenants/${id}/status`, { status, reason }),
  approveTenant: (id, approvalReason = '') => api.post(`/platform/tenants/${id}/approve`, { approvalReason }),
  rejectTenant: (id, rejectionReason) => api.post(`/platform/tenants/${id}/reject`, { rejectionReason }),
  suspendTenant: (id, suspensionReason) => api.post(`/platform/tenants/${id}/suspend`, { suspensionReason }),
  reactivateTenant: (id, reactivationReason = '') => api.post(`/platform/tenants/${id}/reactivate`, { reactivationReason }),
  updateTenantPlan: (id, planId, reason = '') => api.put(`/platform/tenants/${id}/plan`, { planId, reason }),
  
  getPlans: (includeInactive = true) => api.get('/platform/plans', { params: { includeInactive } }),
  createPlan: (data) => api.post('/platform/plans', data),
  updatePlan: (id, data) => api.put(`/platform/plans/${id}`, data),
  deletePlan: (id) => api.delete(`/platform/plans/${id}`),
  getBillingSummary: (params = {}) => api.get('/platform/billing/summary', { params }),
  getSubscriptionInvoices: (params = {}) => api.get('/platform/billing/invoices', { params }),
  createSubscriptionInvoice: (data) => api.post('/platform/billing/invoices', data),
  reconcileSubscriptionBilling: () => api.post('/platform/billing/reconcile'),
  recordSubscriptionPayment: (invoiceId, data) => api.post(`/platform/billing/invoices/${invoiceId}/payments`, data),
  reverseSubscriptionPayment: (paymentId, reason) => api.post(`/platform/billing/payments/${paymentId}/reverse`, { reason }),
  
  getAuditLogs: (params = {}) => api.get('/platform/audit-logs', { params }),
  
  
  getSystemHealth: () => api.get('/platform/health'),
  
  getSettings: () => api.get('/platform/settings'),
  updateSettings: (data) => api.put('/platform/settings', data),
  testEmail: (data) => api.post('/platform/settings/test-email', data),

  // ── Public endpoints (no auth required, for landing page) ──
  getPublicStats: () => publicApi.get('/public/platform-stats'),
  getPublicPlans: () => publicApi.get('/public/plans'),
  getPublicSchools: () => publicApi.get('/public/schools'),
  getPublicSettings: () => publicApi.get('/public/settings'),
};

export default platformService;
