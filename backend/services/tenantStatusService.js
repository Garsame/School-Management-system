const VALID_STATUSES = Object.freeze(['pending', 'active', 'rejected', 'suspended']);

const VALID_TRANSITIONS = Object.freeze({
    pending: ['active', 'rejected'],
    active: ['suspended'],
    rejected: [],
    suspended: ['active']
});

const resolveTenantStatus = (tenant = {}) => {
    let baseStatus;
    if (VALID_STATUSES.includes(tenant.status)) {
        if (tenant.status === 'pending' && tenant.isApproved === true) {
            baseStatus = tenant.isActive ? 'active' : 'suspended';
        } else {
            baseStatus = tenant.status;
        }
    } else if (tenant.isApproved === false) {
        baseStatus = 'pending';
    } else {
        baseStatus = tenant.isActive ? 'active' : 'suspended';
    }

    if (baseStatus !== 'active') return baseStatus;

    const subscriptionStatus = String(tenant.subscription?.status || '').toLowerCase();
    if (['suspended', 'cancelled'].includes(subscriptionStatus)) return 'suspended';
    if (subscriptionStatus === 'past_due') {
        const graceEndsAt = tenant.subscription?.gracePeriodEndsAt
            ? new Date(tenant.subscription.gracePeriodEndsAt)
            : null;
        if (!graceEndsAt || graceEndsAt <= new Date()) return 'suspended';
    }

    return baseStatus;
};

const assertTenantTransition = (tenant, nextStatus) => {
    const currentStatus = resolveTenantStatus(tenant);
    const normalizedNext = String(nextStatus || '').trim().toLowerCase();

    if (!VALID_STATUSES.includes(normalizedNext)) {
        const error = new Error(`Invalid tenant status: ${nextStatus}`);
        error.statusCode = 400;
        throw error;
    }
    if (!VALID_TRANSITIONS[currentStatus].includes(normalizedNext)) {
        const error = new Error(`Tenant cannot transition from ${currentStatus} to ${normalizedNext}`);
        error.statusCode = 409;
        throw error;
    }
    return { currentStatus, nextStatus: normalizedNext };
};

const applyTenantStatus = (tenant, nextStatus, { reason = '', changedBy = null } = {}) => {
    const transition = assertTenantTransition(tenant, nextStatus);
    tenant.status = transition.nextStatus;
    tenant.statusHistory = tenant.statusHistory || [];
    tenant.statusHistory.push({
        status: transition.nextStatus,
        reason: String(reason || '').trim() || undefined,
        changedBy: changedBy || undefined,
        changedAt: new Date()
    });
    return transition;
};

module.exports = {
    VALID_STATUSES,
    VALID_TRANSITIONS,
    applyTenantStatus,
    assertTenantTransition,
    resolveTenantStatus
};
