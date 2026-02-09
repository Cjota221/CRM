const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SESSION_SECRET = process.env.SESSION_SECRET || 'cjota-crm-default-secret-change-me';
const SESSION_MAX_AGE = 24 * 60 * 60; // 24h em segundos
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
            const { username, password } = body;
            if (!username || !password) {
                return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'E-mail e senha são obrigatórios' }) };
            }

            if (!SUPABASE_SERVICE_KEY) {
                // Fallback: env vars
                const envUser = process.env.CRM_USER || 'admin';
                const envPass = process.env.CRM_PASS || 'admin';
                if (username === envUser && password === envPass) {
                    const token = signToken({ user: username, iat: Math.floor(Date.now() / 1000) });
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json', 'Set-Cookie': `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax` },
                        body: JSON.stringify({ success: true, message: 'Login realizado com sucesso' })
                    };
                }
                return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'E-mail ou senha inválidos' }) };
            }

            // Supabase auth
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data: users, error } = await supabase
                .from('crm_users')
                .select('*')
                .eq('email', username.toLowerCase().trim())
                .eq('active', true)
                .limit(1);

            if (error || !users || users.length === 0) {
                return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'E-mail ou senha inválidos' }) };
            }

            const user = users[0];
            const inputHash = crypto.createHash('sha256').update(password + (user.salt || '')).digest('hex');
            if (user.password_hash !== inputHash) {
                return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'E-mail ou senha inválidos' }) };
            }

            const token = signToken({ user: user.email, name: user.name, iat: Math.floor(Date.now() / 1000) });
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Set-Cookie': `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax` },
                body: JSON.stringify({ success: true, message: 'Login realizado com sucesso', user: { name: user.name, email: user.email } })
            };
        } catch (err) {
            return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Erro interno' }) };
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
