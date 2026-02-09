const crypto = require('crypto');

const CRM_USER = process.env.CRM_USER || 'admin';
const CRM_PASS = process.env.CRM_PASS || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cjota-crm-default-secret-change-me';
const SESSION_MAX_AGE = 24 * 60 * 60; // 24h em segundos

function signToken(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifyToken(token) {
    if (!token || !token.includes('.')) return null;
    const [data, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (sig !== expectedSig) return null;
    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
        if (Date.now() / 1000 - payload.iat > SESSION_MAX_AGE) return null;
        return payload;
    } catch { return null; }
}

function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(c => {
        const [k, ...v] = c.trim().split('=');
        if (k) cookies[k.trim()] = v.join('=').trim();
    });
    return cookies;
}

exports.handler = async (event) => {
    const path = event.path.replace('/.netlify/functions/auth', '').replace('/api/auth', '');
    const method = event.httpMethod;

    // POST /api/auth/login
    if (method === 'POST' && path === '/login') {
        try {
            const body = JSON.parse(event.body || '{}');
            if (body.username === CRM_USER && body.password === CRM_PASS) {
                const token = signToken({ user: body.username, iat: Math.floor(Date.now() / 1000) });
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Set-Cookie': `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`
                    },
                    body: JSON.stringify({ success: true, message: 'Login realizado com sucesso' })
                };
            }
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, message: 'Usuário ou senha inválidos' })
            };
        } catch {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Requisição inválida' }) };
        }
    }

    // POST /api/auth/logout
    if (method === 'POST' && path === '/logout') {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': 'crm_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
            },
            body: JSON.stringify({ success: true, message: 'Logout realizado' })
        };
    }

    // GET /api/auth/check
    if (method === 'GET' && (path === '/check' || path === '')) {
        const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
        const payload = verifyToken(cookies['crm_session']);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authenticated: !!payload })
        };
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
};
