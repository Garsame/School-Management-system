/**
 * A small HTTP client for the demo build.
 *
 * Every step after the bootstrap goes through the real endpoints, so a role that lacks a
 * permission fails here with the actual 403 rather than being quietly seeded around it.
 * That is the point of the exercise: the build is also the test.
 *
 * Auth is a signed httpOnly cookie, not a bearer token, so a session is a cookie jar.
 */
const BASE = process.env.DEMO_API || 'http://127.0.0.1:5112/api';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo#Passw0rd';

class ApiError extends Error {
    constructor(status, body, method, path) {
        super(`${method} ${path} -> ${status}: ${body?.message || JSON.stringify(body).slice(0, 180)}`);
        this.status = status;
        this.body = body;
    }
}

/** One signed-in user. Holds their cookies and their identity for reporting. */
class Session {
    constructor(label) {
        this.label = label;
        this.cookies = new Map();
        this.user = null;
    }

    get cookieHeader() {
        return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    absorb(response) {
        // Node exposes multiple Set-Cookie headers through getSetCookie().
        const raw = typeof response.headers.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : [response.headers.get('set-cookie')].filter(Boolean);
        for (const entry of raw) {
            const [pair] = entry.split(';');
            const index = pair.indexOf('=');
            if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
        }
    }

    async request(method, path, body) {
        const response = await fetch(BASE + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(this.cookies.size ? { Cookie: this.cookieHeader } : {})
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        this.absorb(response);
        const text = await response.text();
        let payload;
        try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
        if (!response.ok) throw new ApiError(response.status, payload, method, path);
        return payload;
    }

    get(path) { return this.request('GET', path); }
    post(path, body) { return this.request('POST', path, body); }
    put(path, body) { return this.request('PUT', path, body); }
    patch(path, body) { return this.request('PATCH', path, body); }
    del(path) { return this.request('DELETE', path); }
}

const signIn = async (label, path, email, password = PASSWORD) => {
    const session = new Session(label);
    session.user = await session.post(path, { email, password });
    return session;
};

const loginPlatform = (email) => signIn('platform owner', '/platform/auth/login', email);
const loginTenant = (label, email) => signIn(label, '/tenant/auth/login', email);

/** Assert that a call is refused, proving a permission boundary actually holds. */
const expectDenied = async (label, fn) => {
    try {
        await fn();
        console.log(`   LEAK  ${label} — expected a refusal but it succeeded`);
        return false;
    } catch (error) {
        if ([401, 403, 404].includes(error.status)) {
            console.log(`   ok    ${label} — refused with ${error.status}`);
            return true;
        }
        console.log(`   ??    ${label} — failed with ${error.status}: ${error.message}`);
        return false;
    }
};

const step = (n, title) => console.log(`\n${'─'.repeat(3)} ${n}. ${title} ${'─'.repeat(Math.max(2, 56 - title.length))}`);

module.exports = { ApiError, PASSWORD, Session, expectDenied, loginPlatform, loginTenant, signIn, step };
