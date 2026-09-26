const express = require('express');
const router = express.Router();
const {
    createFeeStructure, getFeeStructures, getFeeStructureById, updateFeeStructure, deleteFeeStructure,
    getFinancePolicies, updateFinancePolicies, setFeeStructureOpen, getBillingMonths, generateInvoices,
    getInvoices, getInvoiceById,
    getPayments, getPaymentsSummary, getOutstandingBalances,
    getRevenueReport,
    exportInvoices,
    exportPayments,
    exportOutstandingBalances,
    getFinanceClasses,
    getFinanceSections,
    searchBillingStudents,
    getMonthlyCollectionReport,
    exportMonthlyCollection,
    getStudentPaymentRecordController,
    getDiscountedStudents,
    getStudentDiscountPreview,
    setStudentDiscount,
    removeStudentDiscount
} = require('../controllers/financeController');
const { getCompensationRequests, reviewCompensationRequest } = require('../controllers/compensationController');
const { protect, requireScope, tenantGuard } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { financeRateLimiter } = require('../middleware/rateLimiter');

// All routes require authentication, correct scope and tenant context
router.use(financeRateLimiter);
router.use(protect);
// Phase 3: no role lock. All 21 routes below carry their own finance.* permission, so a
// school can define its own finance role (a Bursar, say) without forking the platform.
router.use(requireScope('tenant'));
router.use(tenantGuard);

// A) Fee Structure & Discount Management
router.post('/fee-structures', requirePermission('finance.feeStructures.create'), createFeeStructure);
router.get('/fee-structures', requirePermission('finance.feeStructures.view'), getFeeStructures);
router.get('/fee-structures/:id', requirePermission('finance.feeStructures.view'), getFeeStructureById);
router.put('/fee-structures/:id', requirePermission('finance.feeStructures.update'), updateFeeStructure);
router.delete('/fee-structures/:id', requirePermission('finance.feeStructures.delete'), deleteFeeStructure);

// Student Discounts & Scholarships
router.get('/discounts', requirePermission('finance.discounts.view'), getDiscountedStudents);
router.get('/discounts/preview/:studentId', requirePermission('finance.discounts.view'), getStudentDiscountPreview);
router.put('/discounts/:studentId', requirePermission('finance.discounts.manage'), setStudentDiscount);
router.delete('/discounts/:studentId', requirePermission('finance.discounts.manage'), removeStudentDiscount);

// B) Invoice Governance & Policies
router.get('/policies', requirePermission('finance.policies.view'), getFinancePolicies);
router.put('/policies', requirePermission('finance.policies.update'), updateFinancePolicies);
router.put('/fee-structures/:id/open', requirePermission('finance.policies.update'), setFeeStructureOpen);
router.get('/billing-months', requirePermission('finance.invoices.generate'), getBillingMonths);
router.post('/invoices/generate', requirePermission('finance.invoices.generate'), generateInvoices);
router.get('/lookups/students', requirePermission('finance.invoices.generate'), searchBillingStudents);

// C) Invoice Review
router.get('/invoices', requirePermission('finance.invoices.view'), getInvoices);
router.get('/invoices/export.csv', requirePermission('finance.invoices.view'), exportInvoices);
router.get('/invoices/:id', requirePermission('finance.invoices.detail'), getInvoiceById);

// Monthly collection view and each student's payment record
router.get('/monthly-collection', requirePermission('finance.invoices.view'), getMonthlyCollectionReport);
router.get('/monthly-collection/export.xlsx', requirePermission('finance.invoices.view'), exportMonthlyCollection);
router.get('/students/:studentId/payment-record', requirePermission('finance.invoices.view'), getStudentPaymentRecordController);

// D) Payment Oversight
router.get('/payments', requirePermission('finance.payments.view'), getPayments);
router.get('/payments/export.csv', requirePermission('finance.payments.view'), exportPayments);
router.get('/payments/summary', requirePermission('finance.payments.summary'), getPaymentsSummary);
router.get('/outstanding', requirePermission('finance.outstanding.view'), getOutstandingBalances);
router.get('/outstanding/export.csv', requirePermission('finance.outstanding.view'), exportOutstandingBalances);
router.get('/lookups/classes', requireAnyPermission([
    'finance.outstanding.view',
    'finance.feeStructures.view',
    'finance.feeStructures.create',
    'finance.invoices.generate',
    'finance.invoices.view'
]), getFinanceClasses);
router.get('/lookups/sections', requirePermission('finance.outstanding.view'), getFinanceSections);

// E) Receipts & Branding

// F) Reports
router.get('/reports/revenue', requirePermission('finance.reports.view'), getRevenueReport);

// G) Employee compensation governance
router.get('/compensation-requests', requirePermission('finance.compensation.view'), getCompensationRequests);
router.put('/compensation-requests/:id/review', requirePermission('finance.compensation.approve'), reviewCompensationRequest);

module.exports = router;
