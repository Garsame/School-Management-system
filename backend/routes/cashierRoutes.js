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
    exportDayClose,
    searchStudentAccounts,
    getStudentAccount,
    createStudentPayment
} = require('../controllers/cashierController');

const { protect, tenantGuard, branchGuard } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
router.use(protect);
// No role or scope lock. Many schools have one person doing both finance and cashier work,
// and splitting them was our assumption rather than theirs. Every route below is
// permission-gated, and cashierController resolves the branch from the caller's scope:
// a branch cashier is confined to their own branch, while a school-wide finance user
// covers all of them. Payments always take the branch of the invoice being paid, never
// the caller's, so a school-wide user cannot misfile one.
router.use(tenantGuard);
router.use(branchGuard);

// --- Dashboard ---
router.get('/dashboard/stats', requirePermission('cashier.dashboard.view'), getDashboardStats);
router.get('/day-close', requirePermission('cashier.payments.view'), getDayCloseSummary);
router.get('/day-close/export.csv', requirePermission('cashier.payments.view'), exportDayClose);

// --- Invoices ---
router.get('/invoices/search', requirePermission('cashier.invoices.search'), searchInvoices);
router.get('/invoices/:id', requirePermission('cashier.invoices.detail'), getInvoiceById);

// --- Student accounts: what one student owes, month by month ---
router.get('/students/search', requirePermission('cashier.invoices.search'), searchStudentAccounts);
router.get('/students/:studentId/account', requirePermission('cashier.invoices.detail'), getStudentAccount);

// --- Payments ---
router.get('/payments', requirePermission('cashier.payments.view'), getPayments);
router.post('/payments', requirePermission('cashier.payments.create'), createPayment);
// One amount for a student, filling the oldest unpaid month first.
router.post('/payments/student', requirePermission('cashier.payments.create'), createStudentPayment);
router.post('/payments/:id/reverse', requirePermission('cashier.payments.reverse'), reversePayment);

// --- Receipts ---
router.get('/receipts/:paymentId', requirePermission('cashier.receipts.view'), getReceipt);

module.exports = router;
