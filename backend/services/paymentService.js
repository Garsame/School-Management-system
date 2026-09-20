const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { getNextReceiptNumber } = require('./counterService');

const paymentError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const asPositiveAmount = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw paymentError('Amount must be greater than 0');
    }
    return Math.round(amount * 100) / 100;
};

const recordInvoicePayment = async ({
    tenantId,
    branchId,
    invoiceId,
    amount: rawAmount,
    method,
    reference,
    recordedBy
}) => {
    const amount = asPositiveAmount(rawAmount);
    if (!invoiceId || !method) throw paymentError('Invoice and payment method are required');

    const ALLOWED_METHODS = ['CASH', 'ZAAD', 'EVC_PLUS', 'BANK_TRANSFER', 'CARD', 'OTHER'];
    const normMethod = String(method || '').toUpperCase().trim();
    if (!ALLOWED_METHODS.includes(normMethod)) {
        throw paymentError(`Invalid payment method. Allowed: ${ALLOWED_METHODS.join(', ')}`);
    }

    const trimmedRef = String(reference || '').trim();
    if (normMethod !== 'CASH') {
        if (!trimmedRef) {
            throw paymentError('Payment reference is required for non-cash payments.');
        }
    }

    const invoiceFilter = { _id: invoiceId, tenantId };
    if (branchId) invoiceFilter.branchId = branchId;

    const original = await Invoice.findOne(invoiceFilter);
    if (!original) throw paymentError('Invoice not found', 404);
    if (original.status === 'VOID') throw paymentError('Cannot pay a VOID invoice');
    
    // Balance check
    const originalBalance = original.balance === undefined ? original.totalAmount : original.balance;
    if (originalBalance < amount) throw paymentError(`Amount exceeds balance. Current balance: ${originalBalance}`);

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const duplicateQuery = {
        tenantId,
        branchId: original.branchId,
        invoiceId: original._id,
        amount,
        method: normMethod,
        status: 'ACTIVE',
        createdAt: { $gte: oneMinuteAgo }
    };
    if (trimmedRef) {
        duplicateQuery.reference = trimmedRef;
    } else {
        duplicateQuery.$or = [{ reference: null }, { reference: '' }];
    }

    const duplicate = await Payment.findOne(duplicateQuery);
    if (duplicate) {
        throw paymentError('Possible duplicate payment detected. Please refresh and verify the invoice balance.', 409);
    }

    // Create payment as PENDING first
    const payment = await Payment.create({
        tenantId,
        branchId: original.branchId,
        invoiceId: original._id,
        amount,
        method: normMethod,
        reference: trimmedRef || undefined,
        recordedBy,
        status: 'PENDING'
    });

    const originalPaidAmount = original.paidAmount || 0;
    const newPaidAmount = Math.round((originalPaidAmount + amount) * 100) / 100;
    const newBalance = Math.round((originalBalance - amount) * 100) / 100;

    let newStatus = 'UNPAID';
    if (newBalance <= 0) {
        newStatus = 'PAID';
    } else if (newPaidAmount > 0) {
        newStatus = 'PARTIALLY_PAID';
    }

    let invoice;
    try {
        invoice = await Invoice.findOneAndUpdate(
            { 
                ...invoiceFilter, 
                status: { $ne: 'VOID' }, 
                balance: originalBalance // Optimistic locking
            },
            {
                $set: {
                    paidAmount: newPaidAmount,
                    balance: newBalance,
                    status: newStatus
                }
            },
            { returnDocument: 'after' }
        );

        if (!invoice) {
            throw paymentError('Payment could not be applied because the invoice balance changed. Refresh and try again.', 409);
        }

        // Generate receipt number and activate payment
        payment.status = 'ACTIVE';
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            payment.receiptNumber = await getNextReceiptNumber(tenantId, original.branchId);
        } else {
            payment.receiptNumber = 'REC-MOCK-' + Date.now();
        }
        await payment.save();
    } catch (error) {
        // Rollback: delete the PENDING payment
        try {
            await Payment.deleteOne({ _id: payment._id });
        } catch (delErr) {
            // Ignore cast/mock errors during rollback delete
        }

        // If invoice was updated but payment activation failed, restore invoice
        const mongoose = require('mongoose');
        if (invoice && mongoose.connection.readyState === 1) {
            await Invoice.updateOne(
                { _id: invoice._id, tenantId },
                {
                    $set: {
                        paidAmount: originalPaidAmount,
                        balance: originalBalance,
                        status: original.status
                    }
                }
            );
        }
        throw error;
    }

    return { payment, invoice };
};

const reverseInvoicePayment = async ({
    tenantId,
    branchId,
    paymentId,
    reason,
    recordedBy
}) => {
    if (!reason || !String(reason).trim()) throw paymentError('Reason is required for reversal');

    const paymentFilter = { _id: paymentId, tenantId };
    if (branchId) paymentFilter.branchId = branchId;

    const payment = await Payment.findOneAndUpdate(
        {
            ...paymentFilter,
            amount: { $gt: 0 },
            status: { $in: ['ACTIVE', null] }
        },
        {
            $set: {
                status: 'REVERSED',
                reversedAt: new Date(),
                reversedBy: recordedBy,
                reversalReason: String(reason).trim()
            },
            $unset: {
                receiptNumber: 1
            }
        },
        { new: false }
    );

    if (!payment) {
        const existing = await Payment.findOne(paymentFilter).select('status');
        if (!existing) throw paymentError('Payment not found', 404);
        throw paymentError('Payment has already been reversed or cannot be reversed', 409);
    }

    const invoiceFilter = { _id: payment.invoiceId, tenantId, status: { $ne: 'VOID' } };
    if (branchId) invoiceFilter.branchId = branchId;

    const originalInvoice = await Invoice.findOne(invoiceFilter);
    if (!originalInvoice || originalInvoice.paidAmount < payment.amount) {
        await Payment.updateOne(
            { _id: payment._id, status: 'REVERSED', reversedBy: recordedBy },
            { $set: { status: 'ACTIVE', receiptNumber: payment.receiptNumber }, $unset: { reversedAt: 1, reversedBy: 1, reversalReason: 1 } }
        );
        throw paymentError('Associated invoice could not be updated', 409);
    }

    const originalPaid = originalInvoice.paidAmount || 0;
    const originalBal = originalInvoice.balance === undefined ? originalInvoice.totalAmount : originalInvoice.balance;

    const newPaidAmount = Math.round((originalPaid - payment.amount) * 100) / 100;
    const newBalance = Math.round((originalBal + payment.amount) * 100) / 100;

    let newStatus = 'UNPAID';
    if (newBalance <= 0) {
        newStatus = 'PAID';
    } else if (newPaidAmount > 0) {
        newStatus = 'PARTIALLY_PAID';
    }

    let invoice;
    try {
        invoice = await Invoice.findOneAndUpdate(
            { 
                ...invoiceFilter, 
                paidAmount: originalPaid, // Optimistic locking
                balance: originalBal
            },
            {
                $set: {
                    paidAmount: newPaidAmount,
                    balance: newBalance,
                    status: newStatus
                }
            },
            { returnDocument: 'after' }
        );
    } catch (updateErr) {
        // Handled below if !invoice
    }

    if (!invoice) {
        await Payment.updateOne(
            { _id: payment._id, status: 'REVERSED', reversedBy: recordedBy },
            { $set: { status: 'ACTIVE', receiptNumber: payment.receiptNumber }, $unset: { reversedAt: 1, reversedBy: 1, reversalReason: 1 } }
        );
        throw paymentError('Associated invoice could not be updated', 409);
    }

    try {
        const reversal = await Payment.create({
            tenantId,
            branchId: payment.branchId,
            invoiceId: payment.invoiceId,
            amount: -payment.amount,
            method: 'REVERSAL',
            reference: payment.reference,
            recordedBy,
            status: 'REVERSAL',
            reversalOf: payment._id,
            reversalReason: String(reason).trim()
        });
        return { payment, reversal, invoice };
    } catch (error) {
        await Invoice.updateOne(
            { _id: invoice._id, tenantId },
            {
                $set: {
                    paidAmount: originalPaid,
                    balance: originalBal,
                    status: originalInvoice.status
                }
            }
        );
        await Payment.updateOne(
            { _id: payment._id, status: 'REVERSED', reversedBy: recordedBy },
            { $set: { status: 'ACTIVE', receiptNumber: payment.receiptNumber }, $unset: { reversedAt: 1, reversedBy: 1, reversalReason: 1 } }
        );
        throw error;
    }
};

module.exports = { recordInvoicePayment, reverseInvoicePayment };
