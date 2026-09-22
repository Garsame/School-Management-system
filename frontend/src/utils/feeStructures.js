// Shared wording for fee structures, so the policy, fee and billing pages describe one the
// same way.

const nameOf = (value, fallback) => (value && typeof value === 'object' ? value.name : null) || fallback;

export const feeTarget = (structure) => {
    if (structure.targetType === 'SCHOOL_GRADE') return `Grade ${structure.gradeLevel} (all campuses)`;
    if (structure.targetType === 'CATEGORY') return `${nameOf(structure.categoryId, 'Category')} level · ${nameOf(structure.branchId, 'Campus')}`;
    return `${nameOf(structure.classId, 'Class')} · ${nameOf(structure.branchId, 'Campus')}`;
};

export const monthlyTotal = (structure) => (structure.feeItems || [])
    .reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0) / 100;

// Structures saved before monthly billing hold a yearly total. They are not billed until
// finance saves a monthly amount on them.
export const needsMonthlyAmount = (structure) => structure.amountsArePerMonth !== true;

export const isOpen = (structure) => structure.isOpen !== false;

export const money = (amount) => `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
