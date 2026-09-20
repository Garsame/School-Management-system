const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Student = require('../models/Student');

const PLAN_LIMIT_MESSAGE = 'Your current subscription plan limit has been reached. Please contact Platform Admin or upgrade your plan.';

// Students and parents get a User record so they can sign in to their portal, but they are
// not billable staff seats. Counting them against maxUsers made every plan's advertised
// student capacity unreachable: Basic allows 200 students but only 20 users, so admission
// stopped at student 14 once staff were created. maxStudents caps them instead.
const SEAT_EXEMPT_ROLES = Object.freeze(['student', 'parent']);

const staffSeatFilter = (tenantId) => ({
    ...(tenantId ? { tenantId } : {}),
    isActive: { $ne: false },
    role: { $nin: SEAT_EXEMPT_ROLES }
});

const toPlanLimit = (value, fallback = 0) => {
    if (String(value || '').trim().toLowerCase() === 'unlimited') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const limitsFromPlan = (plan = {}) => ({
    maxBranches: toPlanLimit(plan.maxBranches, 1) ?? 999999,
    maxStudents: toPlanLimit(plan.maxStudents, 50) ?? 999999999,
    maxUsers: toPlanLimit(plan.maxUsers, 10) ?? 999999999,
    storageLimit: plan.storageLimit || plan.storage || '5GB'
});

const countUsage = async (tenantId, resource) => {
    if (resource === 'branches') return Branch.countDocuments({ tenantId });
    if (resource === 'users') return User.countDocuments(staffSeatFilter(tenantId));
    if (resource === 'students') return Student.countDocuments({ tenantId });
    throw new Error(`Unsupported plan limit resource: ${resource}`);
};

const assertWithinPlanLimit = async (tenantId, resource) => {
    const tenant = await Tenant.findById(tenantId).select('subscriptionLimits');
    if (!tenant) {
        const error = new Error('Tenant not found');
        error.statusCode = 404;
        throw error;
    }

    const limitKey = { branches: 'maxBranches', users: 'maxUsers', students: 'maxStudents' }[resource];
    const limit = Number(tenant.subscriptionLimits?.[limitKey] || 0);
    const usage = await countUsage(tenantId, resource);
    if (limit > 0 && usage >= limit) {
        const error = new Error(PLAN_LIMIT_MESSAGE);
        error.statusCode = 409;
        throw error;
    }
    return { usage, limit };
};

const enforcePlanLimit = (resource) => async (req, res, next) => {
    try {
        await assertWithinPlanLimit(req.tenantId, resource);
        return next();
    } catch (error) {
        return res.status(error.statusCode || 500).json({ message: error.message });
    }
};

module.exports = {
    PLAN_LIMIT_MESSAGE,
    SEAT_EXEMPT_ROLES,
    assertWithinPlanLimit,
    enforcePlanLimit,
    limitsFromPlan,
    staffSeatFilter,
    toPlanLimit
};
