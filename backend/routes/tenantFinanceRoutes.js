const express = require('express');
const router = express.Router();
const {
    createFeeStructure, getFeeStructures, getFeeStructureById, updateFeeStructure, deleteFeeStructure,
    getFinancePolicies, updateFinancePolicies, triggerBulkInvoices,
    getInvoices, getInvoiceById,
    getPayments, getPaymentsSummary, getOutstandingBalances,
    getRevenueReport,
    exportInvoices,
    exportPayments,
    exportOutstandingBalances,
    getFinanceClasses,
    getFinanceSections
} = require('../controllers/financeController');
const { getCompensationRequests, reviewCompensationRequest } = require('../controllers/compensationController');
const { protect, authorize, requireScope, tenantGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { financeRateLimiter } = require('../middleware/rateLimiter');

// All routes require authentication, correct scope and tenant context
router.use(financeRateLimiter);
router.use(protect);
router.use(authorize('finance_director'));
router.use(requireScope('tenant'));
router.use(tenantGuard);

// A) Fee Structure Management
router.post('/fee-structures', requirePermission('finance.feeStructures.create'), createFeeStructure);
router.get('/fee-structures', requirePermission('finance.feeStructures.view'), getFeeStructures);
router.get('/fee-structures/:id', requirePermission('finance.feeStructures.view'), getFeeStructureById);
router.put('/fee-structures/:id', requirePermission('finance.feeStructures.update'), updateFeeStructure);
router.delete('/fee-structures/:id', requirePermission('finance.feeStructures.delete'), deleteFeeStructure);

// B) Invoice Governance & Policies
router.get('/policies', requirePermission('finance.policies.view'), getFinancePolicies);
router.put('/policies', requirePermission('finance.policies.update'), updateFinancePolicies);
router.post('/invoices/generate', requirePermission('finance.invoices.generate'), triggerBulkInvoices);

// C) Invoice Review
router.get('/invoices', requirePermission('finance.invoices.view'), getInvoices);
router.get('/invoices/export.csv', requirePermission('finance.invoices.view'), exportInvoices);
router.get('/invoices/:id', requirePermission('finance.invoices.detail'), getInvoiceById);

// D) Payment Oversight
router.get('/payments', requirePermission('finance.payments.view'), getPayments);
router.get('/payments/export.csv', requirePermission('finance.payments.view'), exportPayments);
router.get('/payments/summary', requirePermission('finance.payments.summary'), getPaymentsSummary);
router.get('/outstanding', requirePermission('finance.outstanding.view'), getOutstandingBalances);
router.get('/outstanding/export.csv', requirePermission('finance.outstanding.view'), exportOutstandingBalances);
router.get('/lookups/classes', requirePermission('finance.outstanding.view'), getFinanceClasses);
router.get('/lookups/sections', requirePermission('finance.outstanding.view'), getFinanceSections);

// E) Receipts & Branding

// F) Reports
router.get('/reports/revenue', requirePermission('finance.reports.view'), getRevenueReport);

// G) Employee compensation governance
router.get('/compensation-requests', requirePermission('finance.compensation.view'), getCompensationRequests);
router.put('/compensation-requests/:id/review', requirePermission('finance.compensation.approve'), reviewCompensationRequest);

module.exports = router;
