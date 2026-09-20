const express = require('express');
const router = express.Router();
const {
    searchInvoices,
    getInvoiceById,
    createPayment,
    getReceipt,
    getPayments,
    reversePayment,
    getDashboardStats,
    getDayCloseSummary,
    exportDayClose
} = require('../controllers/cashierController');

const { protect, authorize, requireScope, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
// 1. Authenticated
// 2. Role = CASHIER
// 3. Scope = BRANCH
// 4. Tenant Valid
// 5. Branch Valid
router.use(protect);
router.use(authorize('cashier')); 
router.use(requireScope('branch'));
router.use(tenantGuard);
router.use(branchGuard);

// --- Dashboard ---
router.get('/dashboard/stats', requirePermission('cashier.dashboard.view'), getDashboardStats);
router.get('/day-close', requirePermission('cashier.payments.view'), getDayCloseSummary);
router.get('/day-close/export.csv', requirePermission('cashier.payments.view'), exportDayClose);

// --- Invoices ---
router.get('/invoices/search', requirePermission('cashier.invoices.search'), searchInvoices);
router.get('/invoices/:id', requirePermission('cashier.invoices.detail'), getInvoiceById);

// --- Payments ---
router.get('/payments', requirePermission('cashier.payments.view'), getPayments);
router.post('/payments', requirePermission('cashier.payments.create'), createPayment);
router.post('/payments/:id/reverse', requirePermission('cashier.payments.reverse'), reversePayment);

// --- Receipts ---
router.get('/receipts/:paymentId', requirePermission('cashier.receipts.view'), getReceipt);

module.exports = router;
