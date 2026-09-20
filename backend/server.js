const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('path');
const connectDB = require('./config/db');
const { parseBoolean, validateRuntimeEnv } = require('./config/env');
const { apiRateLimiter } = require('./middleware/rateLimiter');
const monitoringService = require('./services/monitoringService');
const { reconcileSubscriptionStatuses } = require('./services/subscriptionBillingService');

dotenv.config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
}
app.disable('x-powered-by');

const normalizeOrigin = (origin = '') => String(origin).trim().toLowerCase().replace(/\/+$/, '');
const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];
const allowedOrigins = (process.env.CORS_ORIGINS || (isProduction ? '' : defaultAllowedOrigins.join(',')))
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalized = normalizeOrigin(origin);
        if (allowedOrigins.includes(normalized)) return callback(null, true);
        const error = new Error('CORS origin is not allowed');
        error.statusCode = 403;
        return callback(error);
    },
    credentials: true,
    maxAge: 600,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-Id']
};

const contentSecurityPolicy = {
    useDefaults: true,
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', ...(isProduction ? [] : ['http:'])],
        connectSrc: ["'self'", ...allowedOrigins],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
    }
};

app.use(helmet({
    contentSecurityPolicy,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false
}));
app.use(compression());
app.use(cors(corsOptions));
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: false, limit: process.env.FORM_BODY_LIMIT || '1mb' }));

const uploadPath = path.resolve(__dirname, 'uploads');
app.use('/uploads', express.static(uploadPath, {
    fallthrough: false,
    index: false,
    maxAge: isProduction ? '1d' : 0,
    setHeaders: (res) => {
        // Vite and the API use different localhost ports during development.
        // Allow those public image assets to render cross-origin locally while
        // retaining Helmet's same-origin policy in production.
        if (!isProduction) res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        if (req.path.startsWith('/uploads')) return;
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        monitoringService.recordRequest({
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs
        });
    });
    next();
});

app.get('/api/health', (req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    const payload = isProduction
        ? { ok: dbReady }
        : { ok: dbReady, database: dbReady ? 'connected' : 'unavailable', uptime: process.uptime() };
    res.status(dbReady ? 200 : 503).json(payload);
});

app.use('/api', apiRateLimiter);

const publicRoutes = require('./routes/publicRoutes');
app.use('/api/public', publicRoutes);
app.use('/api/platform', require('./routes/platformRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));
app.use('/api/parent', require('./routes/parentRoutes'));
app.use('/api/branch/auth', require('./routes/branchAuthRoutes'));
app.use('/api/branch/shared', require('./routes/branchSharedRoutes'));
app.use('/api/branch', require('./routes/branchAdminRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/cashier', require('./routes/cashierRoutes'));
app.use('/api/academic', require('./routes/academicRoutes'));
app.use('/api/exams', require('./routes/examRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/registrar', require('./routes/registrarRoutes'));
app.use('/api/teacher', require('./routes/teacherRoutes'));
app.use('/api/student', require('./routes/studentPortalRoutes'));

app.use('/api/tenant/finance', require('./routes/tenantFinanceRoutes'));
app.use('/api/tenant', require('./routes/tenantRoutes'));

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API route not found'
    });
});

const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
const hasFrontendDist = fs.existsSync(frontendDistPath);

if (hasFrontendDist) {
    app.use(express.static(frontendDistPath, {
        index: false,
        maxAge: isProduction ? '1d' : 0
    }));
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        if (req.path.startsWith('/uploads')) return next();
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.json({ message: 'Enterprise School Management API is running' });
    });
}

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
    const isServerError = statusCode >= 500;
    const message = isServerError
        ? 'Internal server error'
        : statusCode === 404
            ? 'Resource not found'
            : (err.message || 'Request could not be completed');

    console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
    if (!isProduction && err.stack) console.error(err.stack);

    return res.status(statusCode).json({
        success: false,
        message
    });
});

const startSubscriptionReconciliation = () => {
    const enabled = parseBoolean(process.env.SUBSCRIPTION_RECONCILE_ENABLED, isProduction);
    if (!enabled) return null;

    const intervalMs = Math.max(15, Number(process.env.SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES || 360)) * 60 * 1000;
    const run = async () => {
        try {
            const result = await reconcileSubscriptionStatuses();
            console.log(`[BILLING] Reconciled subscription statuses: checked=${result.checked}, active=${result.active}, past_due=${result.pastDue}, suspended=${result.suspended}, errors=${result.errors.length}`);
        } catch (error) {
            console.error(`[BILLING] Subscription reconciliation failed: ${error.message}`);
        }
    };

    const initialDelay = Math.max(5, Number(process.env.SUBSCRIPTION_RECONCILE_INITIAL_DELAY_SECONDS || 30)) * 1000;
    setTimeout(run, initialDelay);
    return setInterval(run, intervalMs);
};

const startServer = async () => {
    validateRuntimeEnv();
    await connectDB();

    const PORT = Number(process.env.PORT || 5112);
    const HOST = process.env.HOST || '127.0.0.1';
    const server = app.listen(PORT, HOST, () => {
        console.log(`Server running on ${HOST}:${PORT}`);
    });
    server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
    server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 15000);
    server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5000);
    server.maxHeadersCount = Number(process.env.MAX_HEADERS_COUNT || 100);

    const reconciliationTimer = startSubscriptionReconciliation();
    const shutdown = async (signal) => {
        console.log(`${signal} received. Closing server.`);
        if (reconciliationTimer) clearInterval(reconciliationTimer);
        server.close(async () => {
            await mongoose.connection.close(false).catch(() => {});
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return server;
};

if (require.main === module) {
    startServer().catch((error) => {
        console.error(`Server startup failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { app, startServer };
