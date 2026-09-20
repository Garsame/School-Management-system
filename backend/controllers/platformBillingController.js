const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { logActivity } = require('../utils/logger');
const {
    createSubscriptionInvoice,
    reconcileSubscriptionStatuses,
    recordSubscriptionPayment,
    reverseSubscriptionPayment
} = require('../services/subscriptionBillingService');

const tenantObjectId = (value) => {
    if (!value) return null;
    if (!mongoose.isValidObjectId(value)) {
        const error = new Error('Invalid tenantId');
        error.status = 400;
        throw error;
    }
    return new mongoose.Types.ObjectId(value);
};

const getBillingSummary = asyncHandler(async (req, res) => {
    const requestedTenantId = tenantObjectId(req.query.tenantId);
    const tenantMatch = requestedTenantId ? { tenantId: requestedTenantId } : {};
    const [revenue, outstanding, recentPayments, revenueTrend] = await Promise.all([
        SubscriptionPayment.aggregate([
            { $match: { ...tenantMatch, status: 'ACTIVE' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        SubscriptionInvoice.aggregate([
            { $match: { ...tenantMatch, status: { $in: ['ISSUED', 'PARTIALLY_PAID'] } } },
            { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } }
        ]),
        SubscriptionPayment.find({ ...tenantMatch, status: 'ACTIVE' })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('tenantId', 'name domain')
            .populate('invoiceId', 'invoiceNumber billingCycle periodStart periodEnd'),
        SubscriptionPayment.aggregate([
            { $match: { ...tenantMatch, status: 'ACTIVE' } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 12 }
        ])
    ]);

    res.json({
        success: true,
        data: {
            totalRevenue: revenue[0]?.total || 0,
            paymentCount: revenue[0]?.count || 0,
            outstandingBalance: outstanding[0]?.total || 0,
            outstandingInvoiceCount: outstanding[0]?.count || 0,
            revenueTrend,
            recentPayments
        }
    });
});

const getSubscriptionInvoices = asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.tenantId) query.tenantId = tenantObjectId(req.query.tenantId);
    if (req.query.status) query.status = req.query.status;
    if (req.query.billingCycle) query.billingCycle = req.query.billingCycle;

    const invoices = await SubscriptionInvoice.find(query)
        .sort({ createdAt: -1 })
        .populate('tenantId', 'name domain billingContactEmail subscription')
        .populate('planId', 'name slug monthlyPrice yearlyPrice')
        .populate('createdBy', 'name email');
    res.json({ success: true, data: invoices });
});

const createInvoice = asyncHandler(async (req, res) => {
    const invoice = await createSubscriptionInvoice({
        ...req.body,
        createdBy: req.user._id
    });
    await logActivity({
        req,
        action: 'SUBSCRIPTION_INVOICE_CREATED',
        entityType: 'SubscriptionInvoice',
        entityId: invoice._id.toString(),
        scope: 'platform',
        after: invoice.toObject()
    });
    res.status(201).json({ success: true, data: invoice });
});

const recordPayment = asyncHandler(async (req, res) => {
    const result = await recordSubscriptionPayment({
        invoiceId: req.params.invoiceId,
        amount: req.body.amount,
        method: req.body.method,
        reference: req.body.reference,
        recordedBy: req.user._id
    });
    await logActivity({
        req,
        action: 'SUBSCRIPTION_PAYMENT_RECORDED',
        entityType: 'SubscriptionPayment',
        entityId: result.payment._id.toString(),
        scope: 'platform',
        after: result.payment.toObject()
    });
    res.status(201).json({ success: true, data: result });
});

const reversePayment = asyncHandler(async (req, res) => {
    const result = await reverseSubscriptionPayment({
        paymentId: req.params.paymentId,
        reason: req.body.reason,
        reversedBy: req.user._id
    });
    await logActivity({
        req,
        action: 'SUBSCRIPTION_PAYMENT_REVERSED',
        entityType: 'SubscriptionPayment',
        entityId: result.payment._id.toString(),
        scope: 'platform',
        reason: req.body.reason,
        after: result.payment.toObject()
    });
    res.json({ success: true, data: result });
});

const reconcileBilling = asyncHandler(async (req, res) => {
    const result = await reconcileSubscriptionStatuses();
    await logActivity({
        req,
        action: 'SUBSCRIPTION_BILLING_RECONCILED',
        entityType: 'SubscriptionInvoice',
        scope: 'platform',
        after: result
    });
    res.json({ success: true, data: result });
});

module.exports = {
    createInvoice,
    getBillingSummary,
    getSubscriptionInvoices,
    reconcileBilling,
    recordPayment,
    reversePayment
};
