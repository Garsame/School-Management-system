// One way to say "this student has a discount or scholarship", used by every money screen so
// the payments desk, the student record, the monthly view and the parent page all agree.

const dollars = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * What a student holds today, in words. `discount` is the student's discount as the server
 * sends it (see activeDiscount in studentAccountService). Returns null when there is none.
 *
 *   short        for a badge: "Full scholarship", "20% discount", "$25 off"
 *   long         a sentence for a banner: "Full scholarship (100%) — Academic excellence"
 *   scholarship  true for a 100% percentage discount
 */
export const describeDiscount = (discount) => {
    if (!discount || !discount.enabled || !(Number(discount.value) > 0)) return null;
    const value = Number(discount.value);
    const reason = String(discount.reason || '').trim();
    const withReason = (text) => (reason ? `${text} — ${reason}` : text);

    if (discount.type === 'PERCENTAGE') {
        if (value >= 100) return { short: 'Full scholarship', long: withReason('Full scholarship (100%)'), scholarship: true };
        return { short: `${value}% discount`, long: withReason(`${value}% discount on the monthly fee`), scholarship: false };
    }
    return { short: `${dollars(value)} off`, long: withReason(`${dollars(value)} off the monthly fee`), scholarship: false };
};

/**
 * What one bill took off, read from the bill's own lines (the negative ones). The bill is the
 * truth for its month, so a discount granted later does not show on a month already billed.
 * Returns null when the bill has no discount.
 */
export const invoiceDiscount = (items) => {
    const lines = Array.isArray(items) ? items : [];
    const off = lines.filter((line) => Number(line.amount) < 0);
    if (!off.length) return null;
    const amount = off.reduce((total, line) => total - Math.round(Number(line.amount) * 100), 0) / 100;
    const name = String(off[0].name || '');
    return { amount, name, scholarship: /^full scholarship/i.test(name) };
};
