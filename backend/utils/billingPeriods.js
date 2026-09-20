const BILLING_FREQUENCIES = Object.freeze({
    YEARLY: { count: 1, label: 'Annual' },
    MONTHLY: { count: 12, label: 'Month' },
    EVERY_TWO_MONTHS: { count: 6, label: 'Two-month period' },
    QUARTERLY: { count: 4, label: 'Quarter' },
    TERM: { count: 3, label: 'Term' },
    CUSTOM: { count: null, label: 'Custom period' }
});

const toCents = (amount) => Math.round(Number(amount || 0) * 100);
const fromCents = (amount) => amount / 100;

const splitCents = (totalCents, count) => {
    const base = Math.floor(totalCents / count);
    const remainder = totalCents - (base * count);
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
};

const normalizeBillingSchedule = ({ billingFrequency = 'YEARLY', billingPeriods = [], totalAmount }) => {
    const frequency = String(billingFrequency || 'YEARLY').toUpperCase();
    if (!BILLING_FREQUENCIES[frequency]) {
        throw new Error('Unsupported billing frequency');
    }

    if (frequency !== 'CUSTOM') {
        return { billingFrequency: frequency, billingPeriods: [] };
    }

    if (!Array.isArray(billingPeriods) || billingPeriods.length === 0) {
        throw new Error('Custom billing schedules require at least one billing period');
    }

    const normalizedPeriods = billingPeriods.map((period, index) => {
        const label = String(period?.label || '').trim();
        const amount = Number(period?.amount);
        if (!label || !Number.isFinite(amount) || amount < 0) {
            throw new Error('Custom billing periods require valid labels and non-negative amounts');
        }

        return {
            key: `CUSTOM_${index + 1}`,
            label,
            amount: fromCents(toCents(amount))
        };
    });

    const customTotal = normalizedPeriods.reduce((sum, period) => sum + toCents(period.amount), 0);
    if (customTotal !== toCents(totalAmount)) {
        throw new Error('Custom billing period amounts must equal the fee structure total');
    }

    return { billingFrequency: frequency, billingPeriods: normalizedPeriods };
};

const buildPresetPeriods = (feeStructure) => {
    const frequency = BILLING_FREQUENCIES[feeStructure.billingFrequency]
        ? feeStructure.billingFrequency
        : 'YEARLY';
    const config = BILLING_FREQUENCIES[frequency];
    const itemAllocations = (feeStructure.feeItems || []).map((item) => ({
        name: item.name,
        amounts: splitCents(toCents(item.amount), config.count)
    }));

    return Array.from({ length: config.count }, (_, index) => {
        const items = itemAllocations.map((item) => ({
            name: item.name,
            amount: fromCents(item.amounts[index])
        }));
        const amount = items.reduce((sum, item) => sum + toCents(item.amount), 0);

        return {
            key: frequency === 'YEARLY' ? 'YEARLY' : `${frequency}_${index + 1}`,
            label: frequency === 'YEARLY' ? config.label : `${config.label} ${index + 1}`,
            amount: fromCents(amount),
            items
        };
    });
};

const getBillingPeriods = (feeStructure) => {
    const frequency = BILLING_FREQUENCIES[feeStructure?.billingFrequency]
        ? feeStructure.billingFrequency
        : 'YEARLY';

    if (frequency !== 'CUSTOM') {
        return buildPresetPeriods({
            billingFrequency: frequency,
            feeItems: feeStructure.feeItems || []
        });
    }

    return (feeStructure.billingPeriods || []).map((period, index) => ({
        key: period.key || `CUSTOM_${index + 1}`,
        label: period.label,
        amount: fromCents(toCents(period.amount)),
        items: [{
            name: `${feeStructure.name || 'School fees'} - ${period.label}`,
            amount: fromCents(toCents(period.amount))
        }]
    }));
};

const resolveBillingPeriod = (feeStructure, billingPeriodKey) => {
    const periods = getBillingPeriods(feeStructure);
    if (periods.length === 0) {
        throw new Error('Fee structure has no valid billing periods');
    }

    if (!billingPeriodKey && periods.length > 1) {
        throw new Error('billingPeriodKey is required for this fee structure');
    }

    const selected = periods.find((period) => period.key === (billingPeriodKey || periods[0].key));
    if (!selected) {
        throw new Error('Invalid billing period for the selected fee structure');
    }
    return selected;
};

module.exports = {
    BILLING_FREQUENCIES,
    normalizeBillingSchedule,
    getBillingPeriods,
    resolveBillingPeriod
};
