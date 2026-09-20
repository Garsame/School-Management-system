const isProduction = () => process.env.NODE_ENV === 'production';

const parseDurationMs = (value, fallbackMs) => {
    if (!value) return fallbackMs;
    if (/^\d+$/.test(String(value))) return Number(value) * 1000;
    const match = String(value).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's') return amount * 1000;
    if (unit === 'm') return amount * 60 * 1000;
    if (unit === 'h') return amount * 60 * 60 * 1000;
    if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
    return fallbackMs;
};

const getJwtExpiresIn = () => process.env.JWT_EXPIRES_IN || '8h';

const getAuthCookieName = () => (isProduction() ? '__Host-access_token' : 'access_token');

const getCookieOptions = () => ({
    httpOnly: true,
    secure: isProduction(),
    sameSite: String(process.env.COOKIE_SAMESITE || (isProduction() ? 'strict' : 'lax')).toLowerCase(),
    signed: Boolean(process.env.COOKIE_SECRET),
    maxAge: Number(process.env.JWT_COOKIE_MAX_AGE_MS || parseDurationMs(getJwtExpiresIn(), 8 * 60 * 60 * 1000)),
    priority: 'high',
    path: '/'
});

const setAuthCookie = (res, token) => {
    res.cookie(getAuthCookieName(), token, getCookieOptions());
};

const clearAuthCookie = (res) => {
    const options = getCookieOptions();
    delete options.maxAge;
    res.clearCookie(getAuthCookieName(), options);
};

module.exports = {
    clearAuthCookie,
    getAuthCookieName,
    getCookieOptions,
    getJwtExpiresIn,
    setAuthCookie
};
