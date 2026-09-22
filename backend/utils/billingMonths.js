/**
 * Calendar months a school bills in.
 *
 * Monthly invoices are keyed by the real month ("2026-10", "October 2026") rather than a
 * position in the year ("Month 2"), so an invoice says which month it is for and a monthly
 * view can find it. The months a school can bill are the ones its academic year spans.
 *
 * Academic year dates are stored as UTC midnight (the date inputs send YYYY-MM-DD), so every
 * calculation here uses UTC; local time would move 1 September back into August east of UTC.
 */
const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthLabel = (year, monthIndex) => {
    const name = new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    return `${name} ${year}`;
};

const monthKey = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

const listAcademicYearMonths = (academicYear) => {
    const start = new Date(academicYear?.startDate);
    const end = new Date(academicYear?.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

    const months = [];
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth();
    const lastYear = end.getUTCFullYear();
    const lastMonth = end.getUTCMonth();

    while (year < lastYear || (year === lastYear && month <= lastMonth)) {
        months.push({ key: monthKey(year, month), label: monthLabel(year, month) });
        month += 1;
        if (month === 12) {
            month = 0;
            year += 1;
        }
    }
    return months;
};

/**
 * The month to bill, or an error naming why it cannot be billed. A month outside the
 * academic year is rejected: its invoice would be filed against the wrong year.
 */
const resolveBillingMonth = (academicYear, key) => {
    if (!MONTH_KEY_PATTERN.test(String(key || ''))) {
        throw new Error('Choose the month to bill, for example 2026-10');
    }
    const month = listAcademicYearMonths(academicYear).find((item) => item.key === key);
    if (!month) {
        throw new Error(`${key} is outside the ${academicYear?.name || 'selected'} academic year`);
    }
    return month;
};

const DEFAULT_DUE_DAY = 10;

const isMonthKey = (key) => MONTH_KEY_PATTERN.test(String(key || ''));

/** Midnight UTC on the first day of a "2026-10" month key. */
const monthStart = (key) => {
    const [, year, month] = String(key).match(MONTH_KEY_PATTERN);
    return new Date(Date.UTC(Number(year), Number(month) - 1, 1));
};

/**
 * When a month's bill is due: the school's due day of that month. A day past 28 is clamped
 * so it exists in February.
 */
const dueDateForMonth = (key, dueDay = DEFAULT_DUE_DAY) => {
    const start = monthStart(key);
    const day = Math.min(Math.max(Math.trunc(Number(dueDay) || DEFAULT_DUE_DAY), 1), 28);
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
};

/**
 * Where an invoice sits in time, so a student's bills can be put oldest first. Monthly
 * invoices use their month; older term or yearly invoices have no month and fall back to
 * their due date, then to when they were made.
 */
const invoicePeriodStart = (invoice) => {
    if (isMonthKey(invoice?.billingPeriodKey)) return monthStart(invoice.billingPeriodKey);
    return new Date(invoice?.dueDate || invoice?.createdAt || 0);
};

const byPeriodOldestFirst = (a, b) => (invoicePeriodStart(a) - invoicePeriodStart(b))
    || (new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

// A bill is late once its due date has passed and something is still owed on it.
const isLate = (invoice, now = new Date()) => Number(invoice?.balance) > 0
    && invoice?.status !== 'VOID'
    && Boolean(invoice?.dueDate)
    && new Date(invoice.dueDate) < now;

module.exports = {
    DEFAULT_DUE_DAY,
    byPeriodOldestFirst,
    dueDateForMonth,
    invoicePeriodStart,
    isLate,
    isMonthKey,
    listAcademicYearMonths,
    monthStart,
    resolveBillingMonth
};
