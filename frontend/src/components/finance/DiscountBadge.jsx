import React from 'react';
import { Badge } from '../ui';
import { describeDiscount } from '../../utils/discounts';

/**
 * The scholarship or discount a student holds today, as a small badge: "Full scholarship",
 * "20% discount", "$25 off". `discount` is the student's discount as the server sends it.
 * Hover shows the reason. Renders nothing when the student has none.
 */
const DiscountBadge = ({ discount, className = '' }) => {
    const info = describeDiscount(discount);
    if (!info) return null;
    return (
        <span title={info.long}>
            <Badge variant={info.scholarship ? 'success' : 'warning'} className={`!py-0.5 text-[10px] font-bold ${className}`}>{info.short}</Badge>
        </span>
    );
};

export default DiscountBadge;
