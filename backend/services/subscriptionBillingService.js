const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const User = require('../models/User');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const mongoose = require('mongoose');

const UNPAID_INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID'];
const DEFAULT_GRACE_DAYS = Math.max(0, Number.parseInt(process.env.SUBSCRIPTION_GRACE_DAYS || '7', 10) || 7);

const billingError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const normalizeCycle = (value) => {
    const cycle = String(value || '').trim().toLowerCase();
    if (!['monthly', 'yearly'].includes(cycle)) {
        throw billingError('Billing cycle must be monthly or yearly');
    }
    return cycle;
};

const resolvePlanPrice = (plan, billingCycle) => {
    const cycle = normalizeCycle(billingCycle);
    const legacyPrice = Number(plan?.price);
    const monthlyPrice = Number(plan?.monthlyPrice);
    const yearlyPrice = Number(plan?.yearlyPrice);
    const amount = cycle === 'yearly'
        ? (Number.isFinite(yearlyPrice) ? yearlyPrice : (Number.isFinite(monthlyPrice) ? monthlyPrice * 12 : legacyPrice * 12))
        : (Number.isFinite(monthlyPrice) ? monthlyPrice : legacyPrice);

    if (!Number.isFinite(amount) || amount < 0) {
        throw billingError(`The selected plan does not have a valid ${cycle} price`);
    }
    return Math.round(amount * 100) / 100;
};

const addBillingPeriod = (startInput, billingCycle) => {
    const start = startInput ? new Date(startInput) : new Date();
    if (Number.isNaN(start.getTime())) throw billingError('Invalid billing period start date');
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    if (normalizeCycle(billingCycle) === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end };
};

const addDays = (dateInput, days) => {
    const date = new Date(dateInput);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
};

const getGracePeriodEndsAt = (dueDate, graceDays = DEFAULT_GRACE_DAYS) => addDays(dueDate, graceDays);

const refreshTenantSubscriptionStatus = async (tenantId, { now = new Date(), graceDays = DEFAULT_GRACE_DAYS } = {}) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw billingError('Tenant not found', 404);

    const overdueQuery = SubscriptionInvoice.findOne({
        tenantId: tenant._id,
        status: { $in: UNPAID_INVOICE_STATUSES },
        dueDate: { $lt: now }
    });
    const overdueInvoice = typeof overdueQuery?.sort === 'function'
        ? await overdueQuery.sort({ dueDate: 1 })
        : await overdueQuery;

    tenant.subscription = tenant.subscription || {};

    if (overdueInvoice) {
        const gracePeriodEndsAt = getGracePeriodEndsAt(overdueInvoice.dueDate, graceDays);
        tenant.subscription.status = gracePeriodEndsAt <= now ? 'suspended' : 'past_due';
        tenant.subscription.gracePeriodEndsAt = gracePeriodEndsAt;
        await tenant.save();
        return {
            tenant,
            overdueInvoice,
            subscriptionStatus: tenant.subscription.status,
            gracePeriodEndsAt
        };
    }

    if (['past_due', 'suspended', 'pending'].includes(String(tenant.subscription.status || '').toLowerCase())) {
        tenant.subscription.status = 'active';
        tenant.subscription.gracePeriodEndsAt = undefined;
        await tenant.save();
    }

    return { tenant, overdueInvoice: null, subscriptionStatus: tenant.subscription.status || 'active' };
};

const reconcileSubscriptionStatuses = async ({ now = new Date(), graceDays = DEFAULT_GRACE_DAYS } = {}) => {
    const invoiceTenantIds = await SubscriptionInvoice.distinct('tenantId', {
        status: { $in: UNPAID_INVOICE_STATUSES }
    });
    const statusTenantIds = await Tenant.distinct('_id', {
        'subscription.status': { $in: ['past_due', 'suspended', 'pending'] }
    });
    const tenantIds = [...new Set([...invoiceTenantIds, ...statusTenantIds].map(String))];
    const results = [];

    for (const tenantId of tenantIds) {
        try {
            const result = await refreshTenantSubscriptionStatus(tenantId, { now, graceDays });
            results.push({
                tenantId,
                subscriptionStatus: result.subscriptionStatus,
                overdueInvoiceId: result.overdueInvoice?._id || null,
                gracePeriodEndsAt: result.gracePeriodEndsAt || null
            });
        } catch (error) {
            results.push({ tenantId, error: error.message });
        }
    }

    return {
        checked: results.length,
        pastDue: results.filter((item) => item.subscriptionStatus === 'past_due').length,
        suspended: results.filter((item) => item.subscriptionStatus === 'suspended').length,
        active: results.filter((item) => item.subscriptionStatus === 'active').length,
        errors: results.filter((item) => item.error),
        results
    };
};

const createSubscriptionInvoice = async ({
    tenantId,
    billingCycle,
    periodStart,
    dueDate,
    currency = 'USD',
    notes,
    createdBy
}) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw billingError('Tenant not found', 404);

    const plan = await Plan.findOne({ slug: String(tenant.plan || '').toLowerCase(), isActive: true });
    if (!plan) throw billingError('Tenant subscription plan is invalid', 409);

    const cycle = normalizeCycle(billingCycle || tenant.subscription?.billingCycle || plan.billingCycle || 'monthly');
    const { start, end } = addBillingPeriod(periodStart, cycle);
    const parsedDueDate = dueDate ? new Date(dueDate) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(parsedDueDate.getTime())) throw billingError('Invalid due date');
    if (parsedDueDate < start) throw billingError('Due date cannot be before the billing period starts');
    const amount = resolvePlanPrice(plan, cycle);

    const existing = await SubscriptionInvoice.findOne({
        tenantId: tenant._id,
        billingCycle: cycle,
        periodStart: start,
        periodEnd: end,
        status: { $ne: 'VOID' }
    });
    if (existing) throw billingError('A subscription invoice already exists for this billing period', 409);

    let billingEmail = tenant.billingContactEmail;
    if (!billingEmail) {
        const admin = await User.findOne({ tenantId: tenant._id, role: 'super_admin' }).select('email').lean();
        billingEmail = admin?.email;
    }

    const invoice = new SubscriptionInvoice({
        tenantId: tenant._id,
        planId: plan._id,
        planSlug: plan.slug,
        invoiceNumber: 'PENDING',
        billingEmail,
        billingCycle: cycle,
        periodStart: start,
        periodEnd: end,
        dueDate: parsedDueDate,
        currency,
        amount,
        balance: amount,
        notes,
        createdBy
    });
    invoice.invoiceNumber = `SUB-${start.getUTCFullYear()}${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(invoice._id).slice(-6).toUpperCase()}`;
    await invoice.save();

    tenant.billingContactEmail = billingEmail || tenant.billingContactEmail;
    tenant.subscription = tenant.subscription || {};
    tenant.subscription.billingCycle = cycle;
    tenant.subscription.status = tenant.subscription.status || 'pending';
    tenant.subscription.nextBillingDate = end;
    await tenant.save();
    await refreshTenantSubscriptionStatus(tenant._id).catch(() => {});

    return invoice;
};

const recordSubscriptionPayment = async ({ invoiceId, amount: rawAmount, method, reference, recordedBy }) => {
    const amount = Math.round(Number(rawAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw billingError('Amount must be greater than 0');
    const normalizedMethod = String(method || '').trim().toUpperCase();
    if (!['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER'].includes(normalizedMethod)) {
        throw billingError('Invalid subscription payment method');
    }
    const trimmedReference = String(reference || '').trim();
    if (normalizedMethod !== 'CASH' && !trimmedReference) {
        throw billingError('Payment reference is required for non-cash payments');
    }

    const invoice = await SubscriptionInvoice.findOne({ _id: invoiceId, status: { $ne: 'VOID' } });
    if (!invoice) throw billingError('Subscription invoice not found', 404);
    if (amount > invoice.balance) throw billingError(`Amount exceeds balance. Current balance: ${invoice.balance}`);

    const duplicate = await SubscriptionPayment.findOne({
        invoiceId: invoice._id,
        amount,
        method: normalizedMethod,
        reference: trimmedReference || undefined,
        status: 'ACTIVE',
        createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
    });
    if (duplicate) throw billingError('Possible duplicate subscription payment detected', 409);

    const payment = await SubscriptionPayment.create({
        tenantId: invoice.tenantId,
        invoiceId: invoice._id,
        amount,
        method: normalizedMethod,
        reference: trimmedReference || undefined,
        receiptNumber: `SUB-REC-${Date.now()}-${String(new mongoose.Types.ObjectId()).slice(-6).toUpperCase()}`,
        recordedBy,
        status: 'ACTIVE'
    });

    const previous = { paidAmount: invoice.paidAmount, balance: invoice.balance, status: invoice.status };
    try {
        invoice.paidAmount = Math.round(((invoice.paidAmount || 0) + amount) * 100) / 100;
        invoice.balance = Math.round((invoice.balance - amount) * 100) / 100;
        invoice.status = invoice.balance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
        await invoice.save();

        if (invoice.status === 'PAID') {
            await Tenant.updateOne(
                { _id: invoice.tenantId },
                {
                    $set: {
                        'subscription.billingCycle': invoice.billingCycle,
                        'subscription.currentPeriodStart': invoice.periodStart,
                        'subscription.currentPeriodEnd': invoice.periodEnd,
                        'subscription.nextBillingDate': invoice.periodEnd
                    }
                }
            );
        }
        await refreshTenantSubscriptionStatus(invoice.tenantId);
    } catch (error) {
        await SubscriptionPayment.deleteOne({ _id: payment._id });
        await SubscriptionInvoice.updateOne(
            { _id: invoice._id },
            { $set: previous }
        );
        Object.assign(invoice, previous);
        throw error;
    }

    return { invoice, payment };
};

const reverseSubscriptionPayment = async ({ paymentId, reason, reversedBy }) => {
    if (!String(reason || '').trim()) throw billingError('Reversal reason is required');
    const payment = await SubscriptionPayment.findOne({ _id: paymentId, status: 'ACTIVE' });
    if (!payment) throw billingError('Active subscription payment not found', 404);
    const invoice = await SubscriptionInvoice.findById(payment.invoiceId);
    if (!invoice || invoice.status === 'VOID') throw billingError('Associated subscription invoice not found', 409);

    const previousPayment = { status: payment.status, receiptNumber: payment.receiptNumber };
    const previousInvoice = { paidAmount: invoice.paidAmount, balance: invoice.balance, status: invoice.status };
    try {
        payment.status = 'REVERSED';
        payment.reversedAt = new Date();
        payment.reversedBy = reversedBy;
        payment.reversalReason = String(reason).trim();
        payment.receiptNumber = undefined;
        await payment.save();

        invoice.paidAmount = Math.max(0, Math.round((invoice.paidAmount - payment.amount) * 100) / 100);
        invoice.balance = Math.round((invoice.amount - invoice.paidAmount) * 100) / 100;
        invoice.status = invoice.paidAmount > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
        await invoice.save();

        await refreshTenantSubscriptionStatus(invoice.tenantId);
    } catch (error) {
        await SubscriptionPayment.updateOne(
            { _id: payment._id },
            {
                $set: {
                    status: previousPayment.status,
                    receiptNumber: previousPayment.receiptNumber
                },
                $unset: { reversedAt: 1, reversedBy: 1, reversalReason: 1 }
            }
        );
        await SubscriptionInvoice.updateOne(
            { _id: invoice._id },
            { $set: previousInvoice }
        );
        Object.assign(payment, previousPayment);
        Object.assign(invoice, previousInvoice);
        throw error;
    }
    return { invoice, payment };
};

module.exports = {
    addBillingPeriod,
    createSubscriptionInvoice,
    DEFAULT_GRACE_DAYS,
    getGracePeriodEndsAt,
    normalizeCycle,
    reconcileSubscriptionStatuses,
    recordSubscriptionPayment,
    refreshTenantSubscriptionStatus,
    resolvePlanPrice,
    reverseSubscriptionPayment
};
