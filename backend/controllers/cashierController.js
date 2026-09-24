const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const Branch = require('../models/Branch');
const { logAction } = require('../services/auditLogService');
const mongoose = require('mongoose');
const { recordInvoicePayment, recordStudentPayment, reverseInvoicePayment } = require('../services/paymentService');
const { getStudentPaymentRecord } = require('../services/studentAccountService');
const { buildStudentSearchCriteria } = require('../utils/studentSearch');
const exportService = require('../services/exportService');

const getDayBounds = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return null;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end, date: start.toISOString().slice(0, 10) };
};

/**
 * Which branch this caller acts in.
 *
 * A branch-scoped cashier is confined to their own branch. A school-wide finance user — a
 * school where one person is both finance and cashier — covers every branch, so their reads
 * carry no branch filter. Writes are unaffected either way: recordInvoicePayment resolves the
 * invoice by tenant and stamps the payment with the invoice's own branch, never the caller's.
 *
 * Spread into a query: `{ tenantId, ...branchScope(req) }`.
 */
const branchScope = (req) => (req.scope === 'branch' ? { branchId: req.branchId } : {});

/** Bare branch id for callers that need a value, undefined for school-wide users. */
const scopedBranchId = (req) => (req.scope === 'branch' ? req.branchId : undefined);

const getCashierDayCloseData = async (req) => {
    const bounds = getDayBounds(req.query.date);
    if (!bounds) {
        const error = new Error('Invalid date.');
        error.status = 400;
        throw error;
    }

    const query = {
        tenantId: req.user.tenantId,
        ...branchScope(req),
        recordedBy: req.user._id,
        createdAt: { $gte: bounds.start, $lte: bounds.end }
    };

    const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .populate({
            path: 'invoiceId',
            populate: { path: 'studentId', select: 'firstName lastName admissionNumber' }
        })
        .populate('recordedBy', 'name firstName lastName email');

    const byMethod = {};
    const byStatus = {};
    let collected = 0;
    let reversed = 0;
    let expectedCash = 0;

    for (const payment of payments) {
        const amount = Number(payment.amount || 0);
        const method = payment.method || 'Unknown';
        const status = payment.status || 'UNKNOWN';

        byStatus[status] = (byStatus[status] || 0) + amount;
        if (!byMethod[method]) byMethod[method] = { collected: 0, count: 0 };
        byMethod[method].count += 1;

        if (status === 'ACTIVE') {
            collected += amount;
            byMethod[method].collected += amount;
            if (String(method).toUpperCase() === 'CASH') expectedCash += amount;
        } else if (status === 'REVERSAL') {
            reversed += Math.abs(amount);
        }
    }

    return {
        date: bounds.date,
        cashierId: req.user._id,
        cashierName: req.user.name || [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email || 'Cashier',
        totals: {
            collected,
            reversed,
            net: collected - reversed,
            expectedCash,
            transactionCount: payments.length,
            activeTransactionCount: payments.filter(payment => payment.status === 'ACTIVE').length
        },
        byMethod,
        byStatus,
        payments
    };
};

// @desc    Search Invoices
// @route   GET /api/cashier/invoices/search
// @access  Private (Cashier)
exports.searchInvoices = async (req, res) => {
    try {
        const { invoiceId, admissionNumber, studentId, q } = req.query;

        // Base Query: Tenant & Branch Isolation
        const query = {
            tenantId: req.user.tenantId,
            ...branchScope(req)
        };
        
        let found = false;

        if (q && String(q).trim()) {
            const criteria = buildStudentSearchCriteria(q);
            const studentFilter = {
                tenantId: req.user.tenantId,
                ...branchScope(req)
            };
            if (criteria.length) studentFilter.$and = criteria;
            const students = await Student.find(studentFilter).select('_id').limit(50);
            const choices = [{ studentId: { $in: students.map(student => student._id) } }];
            if (mongoose.Types.ObjectId.isValid(String(q).trim())) choices.push({ _id: String(q).trim() });
            query.$or = choices;
            found = true;
        } else if (invoiceId) {
            query._id = invoiceId;
            found = true;
        } else if (studentId) {
            query.studentId = studentId;
            found = true;
        } else if (admissionNumber) {
            // First find student by admission number
            const student = await Student.findOne({
                tenantId: req.user.tenantId,
                ...branchScope(req),
                admissionNumber: admissionNumber
            });
            
            if (student) {
                query.studentId = student._id;
                found = true;
            } else {
                // If student not found by admission number, return empty immediately
                return res.json({ success: true, data: [] });
            }
        }

        if (!found) {
            return res.status(400).json({ success: false, message: 'Please provide invoiceId, studentId, or admissionNumber.' });
        }

        const invoices = await Invoice.find(query)
            .populate('studentId', 'firstName lastName admissionNumber classId')
            .populate('academicYearId', 'name')
            .sort({ balance: -1, createdAt: -1 })
            .limit(25);

        res.json({ success: true, data: invoices });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Invoice Details
// @route   GET /api/cashier/invoices/:id
// @access  Private (Cashier)
exports.getInvoiceById = async (req, res) => {
    try {
        const invoice = await Invoice.findOne({
            _id: req.params.id,
            tenantId: req.user.tenantId,
            ...branchScope(req)
        })
        .populate('studentId', 'firstName lastName admissionNumber guardianInfo')
        .populate('academicYearId', 'name');

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found.' });
        }

        res.json({ success: true, data: invoice });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Record Payment
// @route   POST /api/cashier/payments
// @access  Private (Cashier)
exports.createPayment = async (req, res) => {
    try {
        const { invoiceId, amount, method, reference } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Validation error', 
                errors: [{ field: 'amount', message: 'Amount must be greater than 0.' }] 
            });
        }

        const { payment, invoice } = await recordInvoicePayment({
            tenantId: req.user.tenantId,
            branchId: scopedBranchId(req),
            invoiceId,
            amount,
            method,
            reference,
            recordedBy: req.user._id
        });

        // 5. Audit Logs
        try {
            await logAction({
                tenantId: req.user.tenantId,
                branchId: payment.branchId,
                actorUserId: req.user._id,
                actorRole: req.user.role,
                action: 'PAYMENT_CREATED',
                entityType: 'Payment',
                entityId: payment._id,
                after: payment.toObject(), // safe to object
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

             await logAction({
                tenantId: req.user.tenantId,
                branchId: invoice.branchId,
                actorUserId: req.user._id,
                actorRole: req.user.role,
                action: 'INVOICE_UPDATED',
                entityType: 'Invoice',
                entityId: invoice._id,
                after: { paidAmount: invoice.paidAmount, balance: invoice.balance, status: invoice.status },
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        } catch (auditErr) { console.error("Audit log error", auditErr); }

        res.status(201).json({
            success: true,
            data: {
                payment,
                invoice // Return updated invoice for UI
            }
        });

    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

// @desc    Find students to take money from, with what each owes
// @route   GET /api/cashier/students/search?q=
// @access  cashier.invoices.search
exports.searchStudentAccounts = async (req, res) => {
    try {
        const criteria = buildStudentSearchCriteria(req.query.q);
        if (!criteria.length) return res.json({ success: true, data: [] });

        const studentFilter = {
            tenantId: req.user.tenantId,
            ...branchScope(req),
            $and: criteria
        };

        const students = await Student.find(studentFilter)
            .select('firstName middleName lastName admissionNumber studentCode status')
            .limit(20)
            .lean();

        if (!students.length) return res.json({ success: true, data: [] });

        const owed = await Invoice.aggregate([
            { $match: {
                tenantId: new mongoose.Types.ObjectId(String(req.user.tenantId)),
                studentId: { $in: students.map((student) => student._id) },
                status: { $in: ['UNPAID', 'PARTIALLY_PAID'] },
                balance: { $gt: 0 }
            } },
            { $group: { _id: '$studentId', owed: { $sum: '$balance' }, months: { $sum: 1 } } }
        ]);
        const owedByStudent = new Map(owed.map((row) => [String(row._id), row]));

        res.json({
            success: true,
            data: students.map((student) => ({
                _id: student._id,
                name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ').trim(),
                admissionNumber: student.admissionNumber,
                studentCode: student.studentCode,
                status: student.status,
                owed: Math.round((owedByStudent.get(String(student._id))?.owed || 0) * 100) / 100,
                unpaidMonths: owedByStudent.get(String(student._id))?.months || 0
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    One student's account: every month, what is owed, oldest first
// @route   GET /api/cashier/students/:studentId/account
// @access  cashier.invoices.detail
exports.getStudentAccount = async (req, res) => {
    try {
        const record = await getStudentPaymentRecord({
            tenantId: req.user.tenantId,
            studentId: req.params.studentId,
            branchId: scopedBranchId(req)
        });
        res.json({ success: true, data: record });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

// @desc    Take one amount from a student; it fills the oldest unpaid month first
// @route   POST /api/cashier/payments/student
// @access  cashier.payments.create
exports.createStudentPayment = async (req, res) => {
    try {
        const { studentId, amount, method, reference } = req.body || {};
        const result = await recordStudentPayment({
            tenantId: req.user.tenantId,
            branchId: scopedBranchId(req),
            studentId,
            amount,
            method,
            reference,
            recordedBy: req.user._id
        });

        try {
            for (const payment of result.payments) {
                await logAction({
                    tenantId: req.user.tenantId,
                    branchId: payment.branchId,
                    actorUserId: req.user._id,
                    actorRole: req.user.role,
                    action: 'PAYMENT_CREATED',
                    entityType: 'Payment',
                    entityId: payment._id,
                    after: { ...payment.toObject(), studentId },
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
            }
        } catch (auditErr) { console.error('Audit log error', auditErr); }

        res.status(201).json({
            success: true,
            data: {
                batchId: result.batchId,
                amount: result.amount,
                allocations: result.allocations,
                remainingOwed: result.remainingOwed,
                // Any payment of the batch opens the combined receipt.
                receiptPaymentId: result.payments[0]?._id,
                receiptNumbers: result.payments.map((payment) => payment.receiptNumber)
            }
        });
    } catch (error) {
        res.status(error.status || error.statusCode || 500).json({ success: false, message: error.message });
    }
};

// @desc    Get Receipt Data
// @route   GET /api/cashier/receipts/:paymentId
// @access  Private (Cashier)
exports.getReceipt = async (req, res) => {
    try {
        const payment = await Payment.findOne({
            _id: req.params.paymentId,
            tenantId: req.user.tenantId,
            ...branchScope(req)
        }).populate('invoiceId')
          .populate('recordedBy', 'name firstName lastName email');

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found.' });
        }

        if (!['ACTIVE', 'REVERSED'].includes(payment.status)) {
            return res.status(400).json({
                success: false,
                message: 'Receipt is only available for completed payments.'
            });
        }

        const invoice = payment.invoiceId;
        
        // Fetch Student Info
        const student = await Student.findOne({ _id: invoice.studentId, tenantId: req.user.tenantId, ...branchScope(req) }).select('firstName lastName admissionNumber');

        // Branding comes from the branch that issued the payment, not from the caller: a
        // school-wide finance user has no branch of their own to read it from.
        const branch = await Branch.findOne({ _id: payment.branchId, tenantId: req.user.tenantId }).select('name logoUrl address contactInfo receiptFooter');

        const formatRecordedBy = (recordedBy) => {
            if (!recordedBy) return 'System User';
            if (recordedBy.name && String(recordedBy.name).trim()) {
                return String(recordedBy.name).trim();
            }
            const first = recordedBy.firstName ? String(recordedBy.firstName).trim() : '';
            const last = recordedBy.lastName ? String(recordedBy.lastName).trim() : '';
            if (first || last) {
                return `${first} ${last}`.trim();
            }
            if (recordedBy.email && String(recordedBy.email).trim()) {
                return String(recordedBy.email).trim();
            }
            return 'System User';
        };

        const receiptPayload = {
            receiptNo: payment.receiptNumber || payment._id,
            dateTime: payment.createdAt,
            branch: {
                name: branch.name,
                logoUrl: branch.logoUrl,
                address: branch.address,
                contactInfo: branch.contactInfo,
                receiptFooter: branch.receiptFooter
            },
            student: {
                admissionNumber: student?.admissionNumber || 'N/A',
                name: student ? `${student.firstName} ${student.lastName}` : 'Unknown'
            },
            invoice: {
                invoiceId: invoice._id,
                totalAmount: invoice.totalAmount,
                paidAmount: invoice.paidAmount,
                balance: invoice.balance,
                status: invoice.status,
                items: invoice.items
            },
            payment: {
                amount: payment.amount,
                method: payment.method,
                reference: payment.reference,
                status: payment.status,
                reversalReason: payment.reversalReason,
                reversedAt: payment.reversedAt,
                createdAt: payment.createdAt,
                recordedBy: formatRecordedBy(payment.recordedBy)
            }
        };

        // One amount paid for several months: the receipt shows the whole amount and which
        // months it paid, oldest first, whichever of the batch's payments was opened.
        if (payment.batchId) {
            const batch = await Payment.find({
                tenantId: req.user.tenantId,
                batchId: payment.batchId,
                status: { $in: ['ACTIVE', 'REVERSED'] }
            }).populate('invoiceId', 'billingPeriodLabel balance totalAmount').sort({ createdAt: 1 }).lean();
            const active = batch.filter((item) => item.status === 'ACTIVE');
            receiptPayload.batch = {
                total: Math.round(active.reduce((sum, item) => sum + Math.round(item.amount * 100), 0)) / 100,
                lines: batch.map((item) => ({
                    paymentId: item._id,
                    receiptNo: item.receiptNumber || null,
                    month: item.invoiceId?.billingPeriodLabel || 'School fees',
                    amount: item.amount,
                    stillOwed: item.invoiceId?.balance ?? null,
                    status: item.status
                }))
            };
        }

        res.json({ success: true, data: receiptPayload });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    List Payments
// @route   GET /api/cashier/payments
// @access  Private (Cashier)
exports.getPayments = async (req, res) => {
    try {
        const { from, to, method, invoiceId } = req.query;

        const query = {
            tenantId: req.user.tenantId,
            ...branchScope(req)
        };

        if (invoiceId) query.invoiceId = invoiceId;
        if (method) query.method = method;
        
        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = toDate;
            }
        }

        const payments = await Payment.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate('invoiceId', 'balance totalAmount')
            .populate('recordedBy', 'name firstName lastName email');

        res.json({ success: true, data: payments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Cashier day close summary
// @route   GET /api/cashier/day-close
// @access  Private (Cashier)
exports.getDayCloseSummary = async (req, res) => {
    try {
        const report = await getCashierDayCloseData(req);
        const { payments, ...summary } = report;
        res.json({ success: true, data: summary });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

// @desc    Export cashier day close payment list
// @route   GET /api/cashier/day-close/export.csv
// @access  Private (Cashier)
exports.exportDayClose = async (req, res) => {
    try {
        const report = await getCashierDayCloseData(req);
        const csv = exportService.generatePaymentsCSV(report.payments);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=cashier_day_close_${report.date}.csv`);
        res.send(csv);
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

// @desc    Reverse Payment
// @route   POST /api/cashier/payments/:id/reverse
// @access  Private (Cashier)
exports.reversePayment = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Reason is required for reversal.' });

        const { payment, reversal } = await reverseInvoicePayment({
            tenantId: req.user.tenantId,
            branchId: scopedBranchId(req),
            paymentId: req.params.id,
            reason,
            recordedBy: req.user._id
        });

        // 5. Audit
        await logAction({
             tenantId: req.user.tenantId,
             branchId: payment.branchId,
             actorUserId: req.user._id,
             actorRole: req.user.role,
             action: 'PAYMENT_REVERSED',
             entityType: 'Payment',
             entityId: payment._id,
             after: { reversalId: reversal._id, reason },
             ip: req.ip,
             userAgent: req.get('User-Agent')
        });

        res.json({ success: true, message: 'Reversal successful', data: reversal });

    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

// @desc    Get Cashier Dashboard Stats
// @route   GET /api/cashier/dashboard/stats
// @access  Private (Cashier)
exports.getDashboardStats = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const branchId = scopedBranchId(req);

        // Timezone safe local day boundaries on server
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Sum of payment amounts today in this branch/tenant
        const todayPayments = await Payment.aggregate([
            {
                $match: {
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    branchId: new mongoose.Types.ObjectId(branchId),
                    status: { $ne: 'REVERSED' }, // exclude reversed payments
                    createdAt: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    collectedToday: { $sum: '$amount' },
                    transactionCountToday: { $sum: 1 }
                }
            }
        ]);

        const collectedToday = todayPayments[0]?.collectedToday || 0;
        const transactionCountToday = todayPayments[0]?.transactionCountToday || 0;

        // Top 5 recent transactions
        const recentTransactions = await Payment.find({
            tenantId,
            branchId
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('invoiceId', 'balance totalAmount')
        .populate('recordedBy', 'firstName lastName');

        // Pending Invoices Count (status NOT PAID, NOT VOID)
        const pendingInvoicesCount = await Invoice.countDocuments({
            tenantId,
            branchId,
            status: { $nin: ['PAID', 'VOID'] }
        });

        // Total Outstanding (sum of balance on invoices NOT VOID)
        const outstandingInvoices = await Invoice.aggregate([
            {
                $match: {
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    branchId: new mongoose.Types.ObjectId(branchId),
                    status: { $ne: 'VOID' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalOutstanding: { $sum: '$balance' }
                }
            }
        ]);

        const totalOutstandingForBranch = outstandingInvoices[0]?.totalOutstanding || 0;

        res.json({
            success: true,
            data: {
                collectedToday,
                transactionCountToday,
                recentTransactions,
                pendingInvoicesCount,
                totalOutstandingForBranch
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

