const mongoose = require('mongoose');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Student = require('../models/Student');
const AcademicYear = require('../models/AcademicYear');
const ClassModel = require('../models/Class');
const ClassCategory = require('../models/ClassCategory');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const ClassSubject = require('../models/ClassSubject');
const ExamCategory = require('../models/ExamCategory');
const ExamTemplate = require('../models/ExamTemplate');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Enrollment = require('../models/Enrollment');
const FeeStructure = require('../models/FeeStructure');
const FinancePolicy = require('../models/FinancePolicy');
const GradingPolicy = require('../models/GradingPolicy');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const TeacherAssignment = require('../models/TeacherAssignment');
const TimetableSlot = require('../models/TimetableSlot');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Counter = require('../models/Counter');
const Plan = require('../models/Plan');
const AuditLog = require('../models/AuditLog');
const PlatformSetting = require('../models/PlatformSetting');
const { logActivity } = require('../utils/logger');
const { getEffectivePermissions } = require('../utils/permissions');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const monitoringService = require('../services/monitoringService');
const { applyTenantStatus, resolveTenantStatus } = require('../services/tenantStatusService');
const { limitsFromPlan, staffSeatFilter } = require('../services/planLimitService');
const { linkUserToRole, seedRolesForTenant } = require('../scripts/seedSystemRoles');
const { clearAuthCookie, getJwtExpiresIn, setAuthCookie } = require('../utils/authCookies');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: getJwtExpiresIn() });
};

const ONE_MB = 1024 * 1024;
const ONE_GB = 1024 * ONE_MB;
const STORAGE_CACHE_TTL_MS = 60 * 1000;

const tenantStorageCache = new Map();
const SMTP_PASSWORD_MASK = '********';

const sanitizeSettings = (settings) => {
    const data = settings?.toObject ? settings.toObject() : { ...(settings || {}) };
    data.smtpPass = data.smtpPass ? SMTP_PASSWORD_MASK : '';
    return data;
};

const publicSettingsPayload = (settings = {}) => ({
    platformName: settings.platformName || 'MadrasaHub',
    logoUrl: settings.logoUrl || '',
    supportEmail: settings.supportEmail || '',
    contactPhone: settings.contactPhone || '',
    defaultCurrency: settings.defaultCurrency || 'USD',
    defaultPlan: settings.defaultPlan || 'basic',
    isRegistrationEnabled: settings.isRegistrationEnabled !== false
});

const TENANT_STORAGE_MODELS = [
    User,
    Branch,
    Student,
    AcademicYear,
    ClassCategory,
    ClassModel,
    Section,
    Subject,
    ClassSubject,
    ExamCategory,
    ExamTemplate,
    Exam,
    Result,
    Enrollment,
    FeeStructure,
    FinancePolicy,
    GradingPolicy,
    Invoice,
    Payment,
    TeacherAssignment,
    TimetableSlot,
    AttendanceSession,
    AttendanceRecord,
    Counter,
    AuditLog
];

const toBytesLabel = (bytes = 0) => {
    if (bytes >= ONE_GB) return `${(bytes / ONE_GB).toFixed(2)} GB`;
    if (bytes >= ONE_MB) return `${(bytes / ONE_MB).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
};

const toFixedNumber = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

const formatUptime = (seconds = 0) => {
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
};

const formatRelativeTime = (dateInput) => {
    if (!dateInput) return 'N/A';
    const date = new Date(dateInput);
    const diffMs = Date.now() - date.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const resolveUploadPath = (logoUrl = '') => {
    if (!logoUrl) return null;
    let normalized = String(logoUrl).trim();

    if (!normalized) return null;

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
            normalized = new URL(normalized).pathname;
        } catch (error) {
            return null;
        }
    }

    normalized = normalized.replace(/^\/+/, '').replaceAll('\\', '/');

    if (!normalized.startsWith('uploads/')) return null;
    return path.resolve(__dirname, '..', normalized);
};

const getFileSizeSafe = (filePath) => {
    if (!filePath) return 0;
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile() ? stats.size : 0;
    } catch (error) {
        return 0;
    }
};

const parseStorageLimitToBytes = (value) => {
    if (!value) return null;
    const raw = String(value).trim().toUpperCase();
    if (!raw || raw === 'UNLIMITED') return null;

    const match = raw.match(/^(\d+(\.\d+)?)\s*(KB|MB|GB|TB)$/);
    if (!match) return null;

    const amount = parseFloat(match[1]);
    const unit = match[3];

    if (unit === 'KB') return amount * 1024;
    if (unit === 'MB') return amount * ONE_MB;
    if (unit === 'GB') return amount * ONE_GB;
    if (unit === 'TB') return amount * ONE_GB * 1024;
    return null;
};

const aggregateModelStorageBytes = async (model, matchQuery) => {
    try {
        const result = await model.aggregate([
            { $match: matchQuery },
            { $project: { size: { $bsonSize: '$$ROOT' } } },
            { $group: { _id: null, total: { $sum: '$size' } } }
        ]);
        return result[0]?.total || 0;
    } catch (error) {
        const docs = await model.find(matchQuery).lean();
        return docs.reduce((sum, doc) => sum + Buffer.byteLength(JSON.stringify(doc || {}), 'utf8'), 0);
    }
};

const getTenantStorageUsage = async ({ tenant, branches = null, plan = null, force = false }) => {
    const tenantId = String(tenant._id);
    const cached = tenantStorageCache.get(tenantId);

    if (!force && cached && Date.now() - cached.timestamp < STORAGE_CACHE_TTL_MS) {
        return cached.data;
    }

    const tenantObjectId = tenant._id;
    const resolvedBranches = branches || await Branch.find({ tenantId: tenantObjectId }).select('logoUrl').lean();

    const modelBytesList = await Promise.all(
        TENANT_STORAGE_MODELS.map((model) => aggregateModelStorageBytes(model, { tenantId: tenantObjectId }))
    );
    const modelBytes = modelBytesList.reduce((sum, value) => sum + (value || 0), 0);

    const tenantDocBytes = await aggregateModelStorageBytes(Tenant, { _id: tenantObjectId });

    const fileBytes = [tenant.logoUrl, ...resolvedBranches.map((branch) => branch.logoUrl)]
        .map((url) => getFileSizeSafe(resolveUploadPath(url)))
        .reduce((sum, value) => sum + value, 0);

    const usedBytes = modelBytes + tenantDocBytes + fileBytes;
    const storageLimitBytes = parseStorageLimitToBytes(plan?.storage || null);
    const usagePercent = storageLimitBytes ? Math.min(100, (usedBytes / storageLimitBytes) * 100) : null;

    const data = {
        usedBytes,
        usedMB: toFixedNumber(usedBytes / ONE_MB),
        usedGB: toFixedNumber(usedBytes / ONE_GB),
        usedLabel: toBytesLabel(usedBytes),
        storageLimitBytes,
        storageLimitLabel: storageLimitBytes ? toBytesLabel(storageLimitBytes) : 'Unlimited',
        usagePercent: usagePercent === null ? null : toFixedNumber(usagePercent)
    };

    tenantStorageCache.set(tenantId, { timestamp: Date.now(), data });
    return data;
};

const getDiskStats = () => {
    try {
        const stat = fs.statfsSync(path.resolve(__dirname, '..'));
        const totalBytes = stat.bsize * stat.blocks;
        const freeBytes = stat.bsize * stat.bavail;
        const usedBytes = Math.max(0, totalBytes - freeBytes);
        const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

        return {
            totalBytes,
            usedBytes,
            freeBytes,
            usagePercent: toFixedNumber(usagePercent),
            totalLabel: toBytesLabel(totalBytes),
            usedLabel: toBytesLabel(usedBytes),
            freeLabel: toBytesLabel(freeBytes)
        };
    } catch (error) {
        return null;
    }
};

const inferActivityType = (action = '') => {
    const upper = String(action).toUpperCase();
    if (upper.includes('ERROR') || upper.includes('FAILED') || upper.includes('SUSPEND')) return 'danger';
    if (upper.includes('UPDATE') || upper.includes('CHANGED') || upper.includes('SET')) return 'update';
    if (upper.includes('WARN')) return 'warning';
    return 'info';
};

const getTenantStatusLabel = (tenant = {}) => {
    const status = resolveTenantStatus(
        tenant && typeof tenant === 'object'
            ? tenant
            : { isActive: Boolean(tenant), isApproved: true }
    );
    return status.charAt(0).toUpperCase() + status.slice(1);
};

const ensureMainBranchForTenant = async (tenant, adminEmail = '') => {
    const existingBranch = await Branch.findOne({ tenantId: tenant._id }).sort({ createdAt: 1 });
    if (existingBranch) return existingBranch;

    return Branch.create({
        tenantId: tenant._id,
        name: 'Main Branch',
        code: 'MAIN',
        address: '',
        phone: '',
        email: adminEmail || '',
        isActive: true
    });
};

const buildPlatformHealthPayload = async () => {
    const dbConnected = mongoose.connection.readyState === 1;

    let dbLatencyMs = null;
    if (dbConnected) {
        try {
            const start = process.hrtime.bigint();
            await mongoose.connection.db.admin().ping();
            dbLatencyMs = Number(process.hrtime.bigint() - start) / 1e6;
        } catch (error) {
            dbLatencyMs = null;
        }
    }

    const monitor = monitoringService.getSnapshot();
    const disk = getDiskStats();
    const systemMemoryTotal = os.totalmem();
    const systemMemoryFree = os.freemem();
    const systemMemoryUsed = systemMemoryTotal - systemMemoryFree;
    const memoryUsagePercent = systemMemoryTotal > 0 ? (systemMemoryUsed / systemMemoryTotal) * 100 : 0;
    const cpuCount = Math.max(os.cpus()?.length || 1, 1);
    const cpuLoadPercent = toFixedNumber(Math.min(100, (os.loadavg()[0] / cpuCount) * 100));
    const processMemory = process.memoryUsage();

    const healthStatus = !dbConnected
        ? 'Critical'
        : monitor.errorRate > 5 || monitor.avgResponseMs > 1000
            ? 'Degraded'
            : monitor.errorRate > 1 || monitor.avgResponseMs > 500
                ? 'Warning'
                : 'Excellent';

    return {
        healthStatus,
        api: healthStatus === 'Critical' ? 'Degraded' : 'Operational',
        database: dbConnected ? 'Connected' : 'Disconnected',
        redis: 'Not Configured',
        storage: disk ? `${disk.freeLabel} free of ${disk.totalLabel}` : 'Unavailable',
        uptime: formatUptime(process.uptime()),
        errorRate: `${monitor.errorRate.toFixed(2)}%`,
        avgResponseTime: `${monitor.avgResponseMs.toFixed(2)}ms`,
        queueStatus: monitor.errorRate < 1 ? 'Idle' : 'Active',
        responseTimeSeries: monitor.responseTimeSeries,
        recentErrors: monitor.recentErrors,
        services: [
            { name: 'Core REST API', status: healthStatus === 'Critical' ? 'Degraded' : 'Operational' },
            { name: 'MongoDB Cluster', status: dbConnected ? 'Connected' : 'Disconnected' },
            { name: 'Redis Cache', status: 'Not Configured' },
            { name: 'File Storage', status: disk ? `${(100 - disk.usagePercent).toFixed(2)}% Free` : 'Unavailable' }
        ],
        metrics: {
            requests24h: monitor.totalRequests,
            errors24h: monitor.errorRequests,
            p95ResponseMs: monitor.p95ResponseMs,
            avgResponseMs: monitor.avgResponseMs,
            dbLatencyMs: dbLatencyMs === null ? null : toFixedNumber(dbLatencyMs),
            cpuLoadPercent,
            memoryUsagePercent: toFixedNumber(memoryUsagePercent),
            systemMemoryUsedLabel: toBytesLabel(systemMemoryUsed),
            systemMemoryTotalLabel: toBytesLabel(systemMemoryTotal),
            processRssLabel: toBytesLabel(processMemory.rss),
            processHeapUsedLabel: toBytesLabel(processMemory.heapUsed),
            diskUsedLabel: disk?.usedLabel || 'N/A',
            diskTotalLabel: disk?.totalLabel || 'N/A',
            diskUsagePercent: disk?.usagePercent ?? null
        }
    };
};

// @desc    Register a new tenant (onboarding)
// @route   POST /api/platform/register-tenant
// @access  Private (Platform Owner)
const registerTenant = asyncHandler(async (req, res) => {
    // Handle both frontend (name, adminEmail) and alternate names
    const schoolName = req.body.name || req.body.schoolName;
    const adminName = req.body.adminName || req.body.ownerName;
    const adminEmail = String(req.body.adminEmail || req.body.ownerEmail || '').trim().toLowerCase();
    const domain = String(req.body.domain || '').trim().toLowerCase();
    const planSlug = (req.body.plan || 'basic').toLowerCase();
    const password = req.body.password || req.body.adminPassword || req.body.ownerPassword;

    // 0. Fetch Plan from DB to get limits
    const plan = await Plan.findOne({ slug: planSlug, isActive: true });
    if (!plan) {
        res.status(400);
        throw new Error('Selected subscription plan is invalid');
    }

    // 1. Validation
    if (!schoolName || !domain || !adminName || !adminEmail || !password) {
        res.status(400);
        throw new Error('Please provide school name, domain, admin name, admin email, and password');
    }
    if (String(password).length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }

    const tenantExists = await Tenant.findOne({ domain });
    if (tenantExists) {
        res.status(400);
        throw new Error('Tenant with this domain already exists');
    }
    const adminEmailExists = await User.exists({ email: adminEmail, role: 'super_admin' });
    if (adminEmailExists) {
        res.status(409);
        throw new Error('A school administrator already uses this email address');
    }

    // 2. Create Tenant
    const tenant = await Tenant.create({
        name: schoolName,
        domain,
        plan: planSlug,
        primaryColor: req.body.primaryColor || '#3b82f6',
        secondaryColor: req.body.secondaryColor || '#1e40af',
        logoUrl: req.file ? `/uploads/logos/${req.file.filename}` : (req.body.logoUrl || ''),
        status: 'active',
        isActive: true,
        isApproved: true,
        subscriptionLimits: limitsFromPlan(plan),
        billingContactEmail: adminEmail,
        subscription: {
            billingCycle: ['monthly', 'yearly'].includes(req.body.billingCycle)
                ? req.body.billingCycle
                : (['monthly', 'yearly'].includes(plan.billingCycle) ? plan.billingCycle : 'monthly'),
            status: 'pending'
        },
        statusHistory: [{
            status: 'active',
            reason: req.body.approvalReason || 'Created by Platform Admin',
            changedBy: req.user?._id
        }]
    });

    // 3. Create Default Branch
    const branch = await ensureMainBranchForTenant(tenant, adminEmail);

    // 3b. Give the school its roles before any user is created, so the super admin can be
    // linked to one. Without this a new school has nothing to configure and silently falls
    // back to the built-in defaults.
    await seedRolesForTenant(tenant._id);

    // 4. Create Initial Tenant Super Admin
    const user = await User.create({
        tenantId: tenant._id,
        scope: 'tenant', 
        name: adminName,
        email: adminEmail,
        passwordHash: password,
        role: 'super_admin',
        permissionProfile: 'default_super_admin',
        mustChangePassword: true
    });
    await linkUserToRole(user);

    // 5. Log activity
    await logActivity({
        action: 'TENANT_CREATED',
        entityType: 'Tenant',
        entityId: tenant._id.toString(),
        scope: 'platform',
        userId: req.user ? req.user._id : user._id,
        role: req.user ? req.user.role : user.role,
        after: {
            name: tenant.name,
            domain: tenant.domain,
            plan: tenant.plan,
            status: tenant.status
        },
        reason: req.body.approvalReason,
        req
    });

    // Send welcome/approval email notification asynchronously
    const { sendPlatformEmail } = require('../utils/emailHelper');
    sendPlatformEmail('approved', tenant, user).catch(err => console.error(`[SMTP Email Helper] Welcome email failed: ${err.message}`));

    res.status(201).json({
        message: 'Tenant registered successfully',
        tenant,
        branch, // Return default branch details
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
});

// @desc    Get all tenants (Platform Owner only)
// @route   GET /api/platform/tenants
// @access  Private (Platform Owner)
const getTenants = asyncHandler(async (req, res) => {
    const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();

    if (!tenants.length) {
        res.status(200).json([]);
        return;
    }

    const tenantIds = tenants.map((tenant) => tenant._id);
    const uniquePlanSlugs = [...new Set(tenants.map((tenant) => String(tenant.plan || '').toLowerCase()).filter(Boolean))];

    const [branchDocs, userCounts, studentCounts, plans] = await Promise.all([
        Branch.find({ tenantId: { $in: tenantIds } }).select('tenantId logoUrl').lean(),
        User.aggregate([
            { $match: { tenantId: { $in: tenantIds } } },
            { $group: { _id: '$tenantId', count: { $sum: 1 } } }
        ]),
        Student.aggregate([
            { $match: { tenantId: { $in: tenantIds } } },
            { $group: { _id: '$tenantId', count: { $sum: 1 } } }
        ]),
        uniquePlanSlugs.length ? Plan.find({ slug: { $in: uniquePlanSlugs } }).lean() : []
    ]);

    const branchCountByTenant = new Map();
    const branchDocsByTenant = new Map();
    branchDocs.forEach((branch) => {
        const key = String(branch.tenantId);
        branchCountByTenant.set(key, (branchCountByTenant.get(key) || 0) + 1);
        if (!branchDocsByTenant.has(key)) branchDocsByTenant.set(key, []);
        branchDocsByTenant.get(key).push(branch);
    });

    const userCountByTenant = new Map(userCounts.map((item) => [String(item._id), item.count]));
    const studentCountByTenant = new Map(studentCounts.map((item) => [String(item._id), item.count]));
    const planBySlug = new Map(plans.map((plan) => [String(plan.slug).toLowerCase(), plan]));

    const enrichedTenants = await Promise.all(tenants.map(async (tenant) => {
        const tenantIdKey = String(tenant._id);
        const tenantPlan = planBySlug.get(String(tenant.plan || '').toLowerCase()) || null;
        const storage = await getTenantStorageUsage({
            tenant,
            branches: branchDocsByTenant.get(tenantIdKey) || [],
            plan: tenantPlan
        });

        return {
            ...tenant,
            id: tenant._id,
            status: getTenantStatusLabel(tenant),
            plan: tenantPlan?.name || tenant.plan || 'basic',
            planSlug: tenant.plan,
            branchCount: branchCountByTenant.get(tenantIdKey) || 0,
            userCount: userCountByTenant.get(tenantIdKey) || 0,
            studentCount: studentCountByTenant.get(tenantIdKey) || 0,
            storageUsed: storage.usedLabel,
            storageUsedMB: storage.usedMB,
            storageUsedGB: storage.usedGB,
            storageLimit: storage.storageLimitLabel,
            storageUsagePercent: storage.usagePercent
        };
    }));

    res.status(200).json(enrichedTenants);
});

// @desc    Platform Owner Login
// @route   POST /api/platform/auth/login
// @access  Public
const platformLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email: String(email || '').trim().toLowerCase() });

    if (
        user &&
        user.isActive &&
        user.role === 'platform_owner' &&
        user.scope === 'platform' &&
        (await user.comparePassword(password))
    ) {
        const token = generateToken(user._id);
        setAuthCookie(res, token);

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl || '',
            role: user.role,
            scope: user.scope,
            permissions: getEffectivePermissions(user)
        });

        // Log login
        await logActivity({
            action: 'PLATFORM_LOGIN',
            entityType: 'PlatformSession',
            entityId: user._id.toString(),
            scope: 'platform',
            user: user.name,
            userId: user._id,
            role: user.role,
            req
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password for Platform access');
    }
});

const platformLogout = asyncHandler(async (req, res) => {
    clearAuthCookie(res);
    res.json({ message: 'Signed out successfully' });
});

// @desc    Get Platform Dashboard Stats
// @route   GET /api/platform/dashboard
const getPlatformDashboard = asyncHandler(async (req, res) => {
    const [
        totalTenants,
        activeTenants,
        pendingTenants,
        suspendedTenants,
        totalBranches,
        totalStudents,
        totalUsers,
        subscriptionRevenueSummary,
        subscriptionRevenueTrend,
        recentTenants,
        recentAudit,
        health
    ] = await Promise.all([
        Tenant.countDocuments(),
        Tenant.countDocuments({ $or: [{ status: 'active' }, { status: { $exists: false }, isActive: true, isApproved: true }] }),
        Tenant.countDocuments({ $or: [{ status: 'pending' }, { status: { $exists: false }, isApproved: false }] }),
        Tenant.countDocuments({ $or: [{ status: 'suspended' }, { status: { $exists: false }, isActive: false, isApproved: true }] }),
        Branch.countDocuments(),
        Student.countDocuments(),
        User.countDocuments(),
        SubscriptionPayment.aggregate([
            { $match: { status: 'ACTIVE' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        SubscriptionPayment.aggregate([
            { $match: { status: 'ACTIVE' } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    total: { $sum: '$amount' }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 12 }
        ]),
        Tenant.find({}).sort({ createdAt: -1 }).limit(5).lean(),
        AuditLog.find({ scope: 'platform' })
            .sort({ createdAt: -1 })
            .limit(8)
            .populate('actorUserId', 'name email role'),
        buildPlatformHealthPayload()
    ]);

    const recentTenantIds = recentTenants.map((tenant) => tenant._id);
    const totalSubscriptionRevenue = subscriptionRevenueSummary[0]?.total || 0;
    const recentPlanSlugs = [...new Set(recentTenants.map((tenant) => String(tenant.plan || '').toLowerCase()).filter(Boolean))];

    const [recentBranchCounts, recentPlans] = await Promise.all([
        recentTenantIds.length
            ? Branch.aggregate([
                { $match: { tenantId: { $in: recentTenantIds } } },
                { $group: { _id: '$tenantId', count: { $sum: 1 } } }
            ])
            : [],
        recentPlanSlugs.length
            ? Plan.find({ slug: { $in: recentPlanSlugs } }).lean()
            : []
    ]);

    const recentBranchCountByTenant = new Map(recentBranchCounts.map((item) => [String(item._id), item.count]));
    const recentPlanBySlug = new Map(recentPlans.map((plan) => [String(plan.slug).toLowerCase(), plan]));

    res.json({
        totalTenants,
        activeTenants,
        pendingTenants,
        suspendedTenants,
        totalBranches,
        totalStudents,
        totalUsers,
        totalRevenue: toFixedNumber(totalSubscriptionRevenue),
        subscriptionRevenue: toFixedNumber(totalSubscriptionRevenue),
        subscriptionRevenueTracked: true,
        subscriptionPaymentCount: subscriptionRevenueSummary[0]?.count || 0,
        subscriptionRevenueTrend,
        healthStatus: health.healthStatus,
        metrics: {
            errorRate: health.errorRate,
            avgResponseTime: health.avgResponseTime,
            requests24h: health.metrics.requests24h,
            p95ResponseMs: health.metrics.p95ResponseMs
        },
        recentTenants: recentTenants.map((tenant) => ({
            id: tenant._id,
            name: tenant.name,
            domain: tenant.domain,
            plan: recentPlanBySlug.get(String(tenant.plan || '').toLowerCase())?.name || tenant.plan || 'basic',
            branchCount: recentBranchCountByTenant.get(String(tenant._id)) || 0,
            status: getTenantStatusLabel(tenant),
            createdAt: tenant.createdAt,
            createdAgo: formatRelativeTime(tenant.createdAt)
        })),
        recentActivity: recentAudit.map((log) => ({
            id: log._id,
            action: log.action,
            actor: log.actorUserId?.name || log.actorName || log.actorRole || 'System',
            target: log.entityId ? `${log.entityType} (${log.entityId})` : (log.entityType || 'Platform'),
            timestamp: log.createdAt,
            time: formatRelativeTime(log.createdAt),
            type: inferActivityType(log.action)
        }))
    });
});

// @desc    Get Subscription Plans
// @route   GET /api/platform/plans
const getPlatformPlans = asyncHandler(async (req, res) => {
    const filter = String(req.query.includeInactive || '').toLowerCase() === 'true' ? {} : { isActive: true };
    let plans = await Plan.find(filter).sort({ isActive: -1, createdAt: -1 });
    
    // Seed initial plans if none exist
    if (plans.length === 0) {
        plans = await Plan.create([
            { 
              name: 'Basic', slug: 'basic', price: 49, monthlyPrice: 49, yearlyPrice: 490, maxBranches: 1, maxStudents: 200, maxUsers: 20,
              storage: '10GB', hasPrioritySupport: false, icon: 'Zap', color: 'text-blue-600', bg: 'bg-blue-50' 
            },
            { 
              name: 'Professional', slug: 'pro', price: 149, monthlyPrice: 149, yearlyPrice: 1490, maxBranches: 5, maxStudents: 2000, maxUsers: 100,
              storage: '100GB', hasPrioritySupport: true, icon: 'Star', color: 'text-purple-600', bg: 'bg-purple-50' 
            },
            { 
              name: 'Enterprise', slug: 'enterprise', price: 'Custom', maxBranches: 'Unlimited', maxStudents: 'Unlimited', maxUsers: 'Unlimited', 
              storage: 'Unlimited', hasPrioritySupport: true, icon: 'Crown', color: 'text-amber-600', bg: 'bg-amber-50' 
            }
        ]);
    }
    
    res.json(plans);
});

// @desc    Create a new Subscription Plan
// @route   POST /api/platform/plans
const createPlatformPlan = asyncHandler(async (req, res) => {
    const {
        name, slug, description, price, monthlyPrice, yearlyPrice, billingCycle, maxBranches, maxStudents, maxUsers,
        storage, storageLimit, features, hasPrioritySupport, icon, color, bg
    } = req.body;
    const normalizedSlug = String(slug || '').trim().toLowerCase();
    if (!name || !normalizedSlug) {
        res.status(400);
        throw new Error('Plan name and slug are required');
    }
    
    const planExists = await Plan.findOne({ slug: normalizedSlug });
    if (planExists) {
        res.status(409);
        throw new Error('Plan with this slug already exists');
    }

    const plan = await Plan.create({
        name, slug: normalizedSlug, description, price, monthlyPrice, yearlyPrice, billingCycle, maxBranches, maxStudents, maxUsers,
        storage: storageLimit || storage, storageLimit: storageLimit || storage,
        features, hasPrioritySupport, icon, color, bg
    });

    // Log Activity
    await logActivity({
        action: 'PLAN_CREATED',
        entityType: 'Plan',
        entityId: plan._id.toString(),
        scope: 'platform',
        user: req.user.name,
        userId: req.user._id,
        role: req.user.role,
        after: plan.toObject(),
        req
    });

    res.status(201).json(plan);
});

// @desc    Update a Subscription Plan
// @route   PUT /api/platform/plans/:id
const updatePlatformPlan = asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
        res.status(404);
        throw new Error('Plan not found');
    }

    const before = plan.toObject();
    const allowedFields = [
        'name', 'description', 'price', 'monthlyPrice', 'yearlyPrice', 'billingCycle', 'maxBranches', 'maxStudents',
        'maxUsers', 'storage', 'storageLimit', 'features', 'hasPrioritySupport',
        'icon', 'color', 'bg', 'isActive'
    ];
    allowedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) plan[field] = req.body[field];
    });
    await plan.save();
    const updatedPlan = plan;

    // Log update
    await logActivity({
        action: 'PLAN_UPDATED',
        entityType: 'Plan',
        entityId: updatedPlan._id.toString(),
        scope: 'platform',
        user: req.user.name,
        userId: req.user._id,
        role: req.user.role,
        before,
        after: updatedPlan.toObject(),
        req
    });

    res.json(updatedPlan);
});

// @desc    Delete a Subscription Plan
// @route   DELETE /api/platform/plans/:id
const deletePlatformPlan = asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
        res.status(404);
        throw new Error('Plan not found');
    }

    const before = plan.toObject();
    plan.isActive = false;
    await plan.save();

    // Log deletion
    await logActivity({
        action: 'PLAN_SOFT_DELETED',
        entityType: 'Plan',
        entityId: plan._id.toString(),
        scope: 'platform',
        user: req.user.name,
        userId: req.user._id,
        role: req.user.role,
        before,
        after: plan.toObject(),
        req
    });

    res.json({ message: 'Plan deactivated successfully', plan });
});

// @desc    Get System Health
// @route   GET /api/platform/health
const getPlatformHealth = asyncHandler(async (req, res) => {
    const health = await buildPlatformHealthPayload();
    const [
        tenants, totalBranches, totalUsers, totalStudents, activePlans, settings,
        branchUsage, userUsage, studentUsage
    ] = await Promise.all([
        Tenant.find({}).select('name status isActive isApproved subscriptionLimits').lean(),
        Branch.countDocuments(),
        User.countDocuments(),
        Student.countDocuments(),
        Plan.countDocuments({ isActive: true }),
        PlatformSetting.findOne().lean(),
        Branch.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
        User.aggregate([{ $match: staffSeatFilter() }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
        Student.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }])
    ]);

    const statusCounts = tenants.reduce((counts, tenant) => {
        const status = resolveTenantStatus(tenant);
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});
    const usageMaps = {
        maxBranches: new Map(branchUsage.map((item) => [String(item._id), item.count])),
        maxUsers: new Map(userUsage.map((item) => [String(item._id), item.count])),
        maxStudents: new Map(studentUsage.map((item) => [String(item._id), item.count]))
    };
    const nearLimits = tenants.filter((tenant) => {
        const limits = tenant.subscriptionLimits || {};
        return ['maxBranches', 'maxUsers', 'maxStudents'].some((key) => {
            const limit = Number(limits[key] || 0);
            const usage = usageMaps[key].get(String(tenant._id)) || 0;
            return limit > 0 && usage / limit >= 0.8;
        });
    }).map((tenant) => tenant.name);
    const warnings = [];
    if (statusCounts.pending) warnings.push(`${statusCounts.pending} tenant(s) are waiting for approval.`);
    if (nearLimits.length) warnings.push(`${nearLimits.length} tenant(s) may be near a subscription limit.`);
    if (!settings?.smtpHost || !settings?.senderEmail) warnings.push('SMTP is not fully configured.');
    warnings.push(`Public registration is ${settings?.isRegistrationEnabled === false ? 'disabled' : 'enabled'}.`);

    res.json({
        ...health,
        environment: process.env.NODE_ENV || 'development',
        summary: {
            tenantCount: tenants.length,
            activeTenants: statusCounts.active || 0,
            pendingTenants: statusCounts.pending || 0,
            suspendedTenants: statusCounts.suspended || 0,
            rejectedTenants: statusCounts.rejected || 0,
            totalBranches,
            totalUsers,
            totalStudents,
            activePlans
        },
        warnings
    });
});

// @desc    Get Audit Logs
// @route   GET /api/platform/audit-logs
const getPlatformAuditLogs = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const query = { scope: 'platform' };
    if (req.query.action) query.action = req.query.action;
    if (req.query.actor) {
        query.$or = [
            { actorName: { $regex: req.query.actor, $options: 'i' } },
            { actorEmail: { $regex: req.query.actor, $options: 'i' } }
        ];
    }
    if (req.query.entityType) query.entityType = req.query.entityType;
    if (req.query.entityId) query.entityId = String(req.query.entityId);
    if (req.query.tenantId) query.tenantId = req.query.tenantId;
    if (req.query.from || req.query.to) {
        query.createdAt = {};
        if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
        if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
        AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actorUserId', 'name email role'),
        AuditLog.countDocuments(query)
    ]);

    const transformedLogs = logs.map((log) => ({
        id: log._id,
        action: log.action,
        user: log.actorUserId?.name || log.actorName || log.actorRole || 'System',
        actor: log.actorUserId?.name || log.actorName || log.actorRole || 'System',
        actorEmail: log.actorUserId?.email || log.actorEmail || '',
        target: log.entityId ? `${log.entityType} (${log.entityId})` : (log.entityType || 'Unknown'),
        date: new Date(log.createdAt).toLocaleString(),
        timestamp: log.createdAt,
        type: inferActivityType(log.action),
        actorRole: log.actorRole,
        entityType: log.entityType,
        entityId: log.entityId,
        reason: log.reason,
        before: log.before,
        after: log.after
    }));

    res.json({ logs: transformedLogs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// @desc    Get Platform Settings
// @route   GET /api/platform/settings
const getPlatformSettings = asyncHandler(async (req, res) => {
    let settings = await PlatformSetting.findOne();
    if (!settings) {
        settings = await PlatformSetting.create({});
    }
    res.json(sanitizeSettings(settings));
});

// @desc    Get Single Tenant Details
// @route   GET /api/platform/tenants/:id
const getTenantDetails = asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
        res.status(404);
        throw new Error('Tenant not found');
    }

    const [branches, studentCount, userCount, tenantAdminPrimary, tenantPlan, branchStudentCounts, recentSubscriptionInvoices] = await Promise.all([
        Branch.find({ tenantId: tenant._id }).lean(),
        Student.countDocuments({ tenantId: tenant._id }),
        User.countDocuments(staffSeatFilter(tenant._id)),
        User.findOne({ tenantId: tenant._id, role: 'super_admin' }).select('name email role createdAt').lean(),
        Plan.findOne({ slug: String(tenant.plan || '').toLowerCase() }).lean(),
        Student.aggregate([
            { $match: { tenantId: tenant._id } },
            { $group: { _id: '$branchId', count: { $sum: 1 } } }
        ]),
        SubscriptionInvoice.find({ tenantId: tenant._id })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('invoiceNumber billingCycle periodStart periodEnd dueDate amount paidAmount balance status currency')
            .lean()
    ]);

    const tenantAdmin = tenantAdminPrimary
        || await User.findOne({ tenantId: tenant._id, scope: 'tenant' }).select('name email role createdAt').lean();

    const branchStudentCountMap = new Map(branchStudentCounts.map((item) => [String(item._id), item.count]));
    const storage = await getTenantStorageUsage({
        tenant,
        branches,
        plan: tenantPlan,
        force: true
    });

    res.json({
        ...tenant.toObject(),
        id: tenant._id,
        status: getTenantStatusLabel(tenant),
        plan: tenantPlan?.name || tenant.plan,
        planSlug: tenant.plan,
        admin: tenantAdmin
            ? {
                id: tenantAdmin._id,
                name: tenantAdmin.name,
                email: tenantAdmin.email,
                role: tenantAdmin.role,
                createdAt: tenantAdmin.createdAt
            }
            : null,
        usage: {
            branches: branches.length,
            students: studentCount,
            users: userCount,
            maxBranches: tenant.subscriptionLimits?.maxBranches || 0,
            maxStudents: tenant.subscriptionLimits?.maxStudents || 0,
            maxUsers: tenant.subscriptionLimits?.maxUsers || 0,
            storage: storage.usedLabel,
            storageUsedMB: storage.usedMB,
            storageUsedGB: storage.usedGB,
            storageLimit: storage.storageLimitLabel,
            storageUsagePercent: storage.usagePercent
        },
        branches: branches.map((branch) => ({
            id: branch._id,
            name: branch.name,
            code: branch.code,
            location: branch.address || 'Not Set',
            address: branch.address || '',
            students: branchStudentCountMap.get(String(branch._id)) || 0,
            status: branch.isActive ? 'Active' : 'Inactive',
            createdAt: branch.createdAt
        })),
        recentSubscriptionInvoices
    });
});

// @desc    Update Platform Settings
// @route   PUT /api/platform/settings
const updatePlatformSettings = asyncHandler(async (req, res) => {
    let settings = await PlatformSetting.findOne();
    const before = settings?.toObject ? settings.toObject() : {};
    const incoming = { ...req.body };
    if (!incoming.smtpPass || incoming.smtpPass === SMTP_PASSWORD_MASK) delete incoming.smtpPass;
    if (typeof incoming.isRegistrationEnabled === 'string') {
        incoming.isRegistrationEnabled = incoming.isRegistrationEnabled.toLowerCase() === 'true';
    }
    if (incoming.defaultPlan) {
        incoming.defaultPlan = String(incoming.defaultPlan).trim().toLowerCase();
        const defaultPlanExists = await Plan.exists({ slug: incoming.defaultPlan, isActive: true });
        if (!defaultPlanExists) {
            res.status(400);
            throw new Error('Default plan must be an active subscription plan');
        }
    }
    delete incoming._id;
    delete incoming.createdAt;
    delete incoming.updatedAt;
    delete incoming.__v;
    delete incoming.updatedBy;
    if (!settings) {
        settings = new PlatformSetting(incoming);
    } else {
        Object.assign(settings, incoming);
    }
    
    if (req.file) {
        settings.logoUrl = `/uploads/logos/${req.file.filename}`;
    }
    
    settings.updatedBy = req.user._id;
    await settings.save();

    // Log update
    await logActivity({
        action: 'PLATFORM_SETTINGS_UPDATED',
        entityType: 'PlatformSetting',
        entityId: settings._id.toString(),
        scope: 'platform',
        user: req.user.name,
        userId: req.user._id,
        role: req.user.role,
        before: { ...before, smtpPass: before.smtpPass ? SMTP_PASSWORD_MASK : '' },
        after: sanitizeSettings(settings),
        req
    });

    res.json({ message: 'Settings updated successfully', settings: sanitizeSettings(settings) });
});

// @desc    Update Tenant Status
// @route   PATCH /api/platform/tenants/:id/status
const updateTenantStatus = asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
        res.status(404);
        throw new Error('Tenant not found');
    }
    
    const requestedStatus = String(req.body.status || '').toLowerCase();
    const reason = String(
        req.body.reason
        || req.body.approvalReason
        || req.body.rejectionReason
        || req.body.suspensionReason
        || req.body.reactivationReason
        || ''
    ).trim();
    if (['rejected', 'suspended'].includes(requestedStatus) && !reason) {
        res.status(400);
        throw new Error(`A ${requestedStatus === 'rejected' ? 'rejection' : 'suspension'} reason is required`);
    }

    const before = {
        status: resolveTenantStatus(tenant),
        isActive: tenant.isActive,
        isApproved: tenant.isApproved
    };
    applyTenantStatus(tenant, requestedStatus, { reason, changedBy: req.user._id });

    let mainBranch = null;
    if (requestedStatus === 'active') {
        const tenantAdmin = await User.findOne({ tenantId: tenant._id, role: 'super_admin' }).select('email').lean();
        mainBranch = await ensureMainBranchForTenant(tenant, tenantAdmin?.email);
    }

    await tenant.save();
    
    // Log Activity
    await logActivity({
        action: `TENANT_${requestedStatus.toUpperCase()}`,
        entityType: 'Tenant',
        entityId: tenant._id.toString(),
        scope: 'platform',
        userId: req.user._id,
        role: req.user.role,
        before,
        after: {
            status: tenant.status,
            isActive: tenant.isActive,
            isApproved: tenant.isApproved
        },
        reason,
        req
    });

    // Send lifecycle email asynchronously
    let emailType = null;
    if (requestedStatus === 'active') {
        if (before.status === 'pending') emailType = 'approved';
        else if (before.status === 'suspended') emailType = 'reactivated';
    } else if (requestedStatus === 'rejected') {
        emailType = 'rejected';
    } else if (requestedStatus === 'suspended') {
        emailType = 'suspended';
    }

    if (emailType) {
        const { sendPlatformEmail } = require('../utils/emailHelper');
        User.findOne({ tenantId: tenant._id, role: 'super_admin' })
            .then(admin => {
                sendPlatformEmail(emailType, tenant, admin, { reason });
            })
            .catch(err => console.error(`[SMTP Email Helper] Failed to locate tenant admin for lifecycle email: ${err.message}`));
    }

    const statusLabel = getTenantStatusLabel(tenant);
    res.json({
        message: `Tenant status updated to ${statusLabel}`,
        status: statusLabel,
        branch: mainBranch || undefined
    });
});

const approveTenant = (req, res, next) => {
    req.body = { ...req.body, status: 'active', reason: req.body.approvalReason || req.body.reason };
    return updateTenantStatus(req, res, next);
};

const rejectTenant = (req, res, next) => {
    req.body = { ...req.body, status: 'rejected', reason: req.body.rejectionReason || req.body.reason };
    return updateTenantStatus(req, res, next);
};

const suspendTenant = (req, res, next) => {
    req.body = { ...req.body, status: 'suspended', reason: req.body.suspensionReason || req.body.reason };
    return updateTenantStatus(req, res, next);
};

const reactivateTenant = (req, res, next) => {
    req.body = { ...req.body, status: 'active', reason: req.body.reactivationReason || req.body.reason };
    return updateTenantStatus(req, res, next);
};

// @desc    Update Tenant Plan
// @route   PUT /api/platform/tenants/:id/plan
const updateTenantPlan = asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
        res.status(404);
        throw new Error('Tenant not found');
    }

    const nextPlanSlug = String(req.body.planId || '').toLowerCase().trim();
    if (!nextPlanSlug) {
        res.status(400);
        throw new Error('Plan is required');
    }

    const planExists = await Plan.findOne({ slug: nextPlanSlug, isActive: true }).lean();
    if (!planExists) {
        res.status(400);
        throw new Error('Selected plan is invalid');
    }

    const before = {
        plan: tenant.plan,
        subscriptionLimits: tenant.subscriptionLimits?.toObject
            ? tenant.subscriptionLimits.toObject()
            : tenant.subscriptionLimits
    };
    tenant.plan = nextPlanSlug;
    tenant.subscriptionLimits = limitsFromPlan(planExists);
    await tenant.save();
    
    // Log Activity
    await logActivity({
        action: 'TENANT_PLAN_CHANGED',
        entityType: 'Tenant',
        entityId: tenant._id.toString(),
        scope: 'platform',
        userId: req.user._id,
        role: req.user.role,
        before,
        after: { plan: tenant.plan, subscriptionLimits: tenant.subscriptionLimits },
        reason: req.body.reason,
        req
    });

    res.json({
        message: `Tenant plan updated to ${tenant.plan}`,
        plan: tenant.plan,
        subscriptionLimits: tenant.subscriptionLimits
    });
});

const testPlatformSmtp = asyncHandler(async (req, res) => {
    const savedSettings = await PlatformSetting.findOne().lean();
    const smtpHost = req.body.smtpHost || savedSettings?.smtpHost;
    const smtpPort = req.body.smtpPort || savedSettings?.smtpPort;
    const smtpUser = req.body.smtpUser || savedSettings?.smtpUser;
    const senderEmail = req.body.senderEmail || savedSettings?.senderEmail;
    const suppliedPassword = req.body.smtpPass;
    const smtpPass = suppliedPassword && suppliedPassword !== SMTP_PASSWORD_MASK
        ? suppliedPassword
        : savedSettings?.smtpPass;
    
    if (!smtpHost || !smtpPort) {
        res.status(400);
        throw new Error('SMTP Host and Port are required for testing');
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(smtpPort) || 587,
            secure: parseInt(smtpPort) === 465, // true for 465, false for other ports
            auth: smtpUser && smtpPass ? {
                user: smtpUser,
                pass: smtpPass
            } : undefined
        });

        // Verify connection configuration
        await transporter.verify();

        // Send a real test email
        const targetEmail = senderEmail || smtpUser || 'test@madrasahub.com';
        await transporter.sendMail({
            from: `"MadrasaHub SMTP Test" <${senderEmail || 'noreply@madrasahub.com'}>`,
            to: targetEmail,
            subject: 'MadrasaHub SMTP Verification Test',
            text: 'This is a test email confirming that your MadrasaHub platform SMTP settings have been configured successfully!',
            html: '<p>This is a test email confirming that your <strong>MadrasaHub</strong> platform SMTP settings have been configured successfully!</p>'
        });

        await logActivity({
            action: 'SMTP_TEST_SUCCEEDED',
            entityType: 'PlatformSetting',
            entityId: savedSettings?._id?.toString(),
            scope: 'platform',
            userId: req.user._id,
            role: req.user.role,
            after: { smtpHost, smtpPort, smtpUser, senderEmail },
            req
        });

        res.json({ 
            message: 'SMTP Connection & Test Email Successful',
            details: `Successfully connected to ${smtpHost}:${smtpPort} and dispatched a test email to ${targetEmail}.`
        });
    } catch (err) {
        await logActivity({
            action: 'SMTP_TEST_FAILED',
            entityType: 'PlatformSetting',
            entityId: savedSettings?._id?.toString(),
            scope: 'platform',
            userId: req.user._id,
            role: req.user.role,
            after: { smtpHost, smtpPort, smtpUser, senderEmail, error: err.message },
            req
        });
        res.status(500);
        throw new Error(`SMTP Connection failed: ${err.message}`);
    }
});

// @desc    Public platform stats (v2, database-backed summary)
// @route   GET /api/public/platform-stats
// @access  Public
const getPublicPlatformStats = asyncHandler(async (req, res) => {
    const [
        totalSchools,
        activeSchools,
        totalStudents,
        totalBranches,
        activePlans,
        settings
    ] = await Promise.all([
        Tenant.countDocuments(),
        Tenant.countDocuments({ $or: [{ status: 'active' }, { status: { $exists: false }, isActive: true, isApproved: true }] }),
        Student.countDocuments(),
        Branch.countDocuments(),
        Plan.countDocuments({ isActive: true }),
        PlatformSetting.findOne().lean()
    ]);

    res.json({
        totalSchools,
        activeSchools,
        totalStudents,
        totalBranches,
        activePlans,
        registrationEnabled: settings?.isRegistrationEnabled !== false,
        platformName: settings?.platformName || 'MadrasaHub'
    });
});

// @desc    Public platform stats (legacy wrapper)
// @route   GET /api/public/stats
// @access  Public
const getPublicStats = asyncHandler(async (req, res) => {
    // Return the enriched database stats payload to support legacy calls too
    return getPublicPlatformStats(req, res);
});

// @desc    Public subscription plans (for landing page pricing)
// @route   GET /api/public/plans
// @access  Public
const getPublicPlans = asyncHandler(async (req, res) => {
    let plans = await Plan.find({ isActive: true }).sort({ price: 1 }).lean();
    if (plans.length === 0) {
        plans = await Plan.create([
            { name: 'Free', slug: 'basic', price: 0, maxBranches: 1, maxStudents: 100, maxUsers: 10, storage: '5GB', hasPrioritySupport: false },
            { name: 'Pro', slug: 'pro', price: 49, maxBranches: 10, maxStudents: 2000, maxUsers: 100, storage: '100GB', hasPrioritySupport: true },
            { name: 'Enterprise', slug: 'enterprise', price: 'Custom', maxBranches: 'Unlimited', maxStudents: 'Unlimited', maxUsers: 'Unlimited', storage: 'Unlimited', hasPrioritySupport: true }
        ]);
    }
    res.json(plans);
});

// @desc    Public active school showcase for the landing page
// @route   GET /api/public/schools
// @access  Public
const getPublicSchools = asyncHandler(async (req, res) => {
    const schools = await Tenant.find({
        name: { $exists: true, $ne: '' },
        logoUrl: { $exists: true, $ne: '' },
        $or: [
            { status: 'active' },
            { status: { $exists: false }, isActive: true, isApproved: true }
        ]
    })
        .select('name logoUrl')
        .sort({ createdAt: -1 })
        .limit(16)
        .lean();

    res.json(schools.map(school => ({
        id: school._id,
        name: school.name,
        logoUrl: school.logoUrl || ''
    })));
});

const getPublicPlatformSettings = asyncHandler(async (req, res) => {
    const settings = await PlatformSetting.findOne().lean();
    res.json(publicSettingsPayload(settings || {}));
});

module.exports = {
    registerTenant,
    getTenants,
    platformLogin,
    platformLogout,
    getPlatformDashboard,
    getPlatformPlans,
    getPlatformHealth,
    getPlatformAuditLogs,
    getPlatformSettings,
    updatePlatformSettings,
    getTenantDetails,
    updateTenantStatus,
    approveTenant,
    rejectTenant,
    suspendTenant,
    reactivateTenant,
    updateTenantPlan,
    createPlatformPlan,
    updatePlatformPlan,
    deletePlatformPlan,
    testPlatformSmtp,
    getPublicStats,
    getPublicPlans,
    getPublicSchools,
    getPublicPlatformSettings,
    getPublicPlatformStats
};
