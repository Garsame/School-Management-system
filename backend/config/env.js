const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const requireEnv = (name, { minLength = 1, productionOnly = false } = {}) => {
    const value = process.env[name];
    if (productionOnly && process.env.NODE_ENV !== 'production') return value;
    if (!value || String(value).length < minLength) {
        throw new Error(`${name} must be set${minLength > 1 ? ` and at least ${minLength} characters long` : ''}.`);
    }
    return value;
};

const requireHttpsUrl = (name) => {
    const value = requireEnv(name);
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid URL.`);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error(`${name} must be an HTTPS origin without credentials, a path, query, or fragment.`);
    }
    return parsed.origin;
};

const assertProductionConfig = () => {
    const publicOrigin = requireHttpsUrl('PUBLIC_APP_URL');
    const corsOrigins = requireEnv('CORS_ORIGINS')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
            let parsed;
            try {
                parsed = new URL(origin);
            } catch {
                throw new Error('Every CORS_ORIGINS entry must be a valid URL origin.');
            }
            if (parsed.protocol !== 'https:' || parsed.origin !== origin.replace(/\/+$/, '')) {
                throw new Error('Production CORS_ORIGINS entries must be HTTPS origins without paths.');
            }
            return parsed.origin;
        });

    if (!corsOrigins.includes(publicOrigin)) {
        throw new Error('CORS_ORIGINS must include PUBLIC_APP_URL.');
    }
    requireEnv('TRUST_PROXY');

    const port = Number(requireEnv('PORT'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT must be an integer from 1 to 65535.');
    }

    const jwtSecret = requireEnv('JWT_SECRET', { minLength: 32 });
    const cookieSecret = requireEnv('COOKIE_SECRET', { minLength: 32 });
    if (jwtSecret === cookieSecret) {
        throw new Error('JWT_SECRET and COOKIE_SECRET must be different values.');
    }
    if (/replace|change.?me|example/i.test(jwtSecret) || /replace|change.?me|example/i.test(cookieSecret)) {
        throw new Error('Production secrets must not use example or placeholder values.');
    }

    const mongoUri = requireEnv('MONGO_URI');
    let parsedMongoUri;
    try {
        parsedMongoUri = new URL(mongoUri);
    } catch {
        throw new Error('MONGO_URI must be a valid MongoDB connection URI.');
    }
    if (!['mongodb:', 'mongodb+srv:'].includes(parsedMongoUri.protocol) || !parsedMongoUri.username || !parsedMongoUri.password) {
        throw new Error('Production MONGO_URI must include an authenticated MongoDB user.');
    }

    const sameSite = String(process.env.COOKIE_SAMESITE || 'strict').toLowerCase();
    if (!['strict', 'lax', 'none'].includes(sameSite)) {
        throw new Error('COOKIE_SAMESITE must be strict, lax, or none.');
    }
};

const validateRuntimeEnv = () => {
    requireEnv('MONGO_URI');
    requireEnv('JWT_SECRET', { minLength: process.env.NODE_ENV === 'production' ? 32 : 16 });
    requireEnv('COOKIE_SECRET', { minLength: 32, productionOnly: true });
    if (process.env.NODE_ENV === 'production') assertProductionConfig();
};

module.exports = {
    assertProductionConfig,
    parseBoolean,
    requireEnv,
    validateRuntimeEnv
};
