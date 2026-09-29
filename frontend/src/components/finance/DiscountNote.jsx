import React from 'react';
import { invoiceDiscount } from '../../utils/discounts';

/**
 * A small line under a bill's amount when the bill has a discount taken off: "Full
 * scholarship" or "Discount $30". Reads the bill's own lines, so it shows exactly what that
 * month was charged. Renders nothing for a bill with no discount.
 */
const DiscountNote = ({ items, className = '' }) => {
    const taken = invoiceDiscount(items);
    if (!taken) return null;
    return (
        <span className={`block text-[11px] font-semibold text-emerald-700 ${className}`} title={taken.name}>
            {taken.scholarship ? 'Full scholarship' : `Discount $${taken.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} taken off`}
        </span>
    );
};

export default DiscountNote;
