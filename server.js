const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const fetch = require('node-fetch');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { Server: SocketIO } = require('socket.io');
const PhoneNormalizer = require('./core/phone-normalizer');

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
    cors: { origin: '*' },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
});
const PORT = 3000;

// ============================================================================
// SISTEMA DE AUTENTICAÇÃO
// ============================================================================
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dias

// ============================================================================
// PERSISTÊNCIA EM ARQUIVO (Sessões + ChatModes sobrevivem ao restart)
// ============================================================================
const DATA_DIR = path.join(__dirname, '.crm-data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const CHAT_MODES_FILE = path.join(DATA_DIR, 'chat-modes.json');

function loadJsonFile(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) { console.warn(`[Persist] Erro ao ler ${path.basename(filePath)}:`, e.message); }
    return fallback;
}

function saveJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.warn(`[Persist] Erro ao salvar ${path.basename(filePath)}:`, e.message); }
}

// Armazena sessões ativas com persistência em arquivo
const _savedSessions = loadJsonFile(SESSIONS_FILE, {});
const activeSessions = new Map(Object.entries(_savedSessions));
console.log(`[Auth] ${activeSessions.size} sessões restauradas do disco`);

function persistSessions() {
    const obj = {};
    for (const [token, session] of activeSessions) obj[token] = session;
    saveJsonFile(SESSIONS_FILE, obj);
}

function generateSessionToken() {
    return crypto.randomBytes(48).toString('hex');
}

function cleanExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, session] of activeSessions) {
        if (now - session.createdAt > SESSION_MAX_AGE) {
            activeSessions.delete(token);
            cleaned++;
        }
    }
    if (cleaned > 0) persistSessions();
}
// Limpa sessões expiradas a cada hora
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(c => {
        const [key, ...rest] = c.trim().split('=');
        if (key) cookies[key.trim()] = rest.join('=').trim();
    });
    return cookies;
}

function isAuthenticated(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['crm_session'];
    if (!token) return false;
    const session = activeSessions.get(token);
    if (!session) return false;
    if (Date.now() - session.createdAt > SESSION_MAX_AGE) {
        activeSessions.delete(token);
        return false;
    }
    // Sliding window: renovar timestamp a cada uso (max 1x por minuto)
    if (Date.now() - session.createdAt > 60000) {
        session.createdAt = Date.now();
    }
    return true;
}

// ============================================================================
// SISTEMA DE MONITORAMENTO DE CONEXÃO (HEALTH CHECK)
// ============================================================================
const ConnectionMonitor = {
    status: 'unknown',
    lastCheck: null,
    lastConnected: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    checkInterval: 2 * 60 * 1000, // 2 minutos (reduzido de 5 para detectar desconexões mais rápido)
    reconnectDelay: 30 * 1000, // 30 segundos entre tentativas
    errorLog: [],
    isReconnecting: false,
    
    // Log de erro com timestamp
    logError(type, message, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            message,
            details
        };
        this.errorLog.unshift(entry);
        // Manter apenas últimos 50 erros
        if (this.errorLog.length > 50) this.errorLog.pop();
        console.error(`[CONNECTION ERROR] ${type}: ${message}`, details);
        return entry;
    },
    
    // Atualizar status
    updateStatus(newStatus, reason = '') {
        const oldStatus = this.status;
        this.status = newStatus;
        this.lastCheck = new Date().toISOString();
        
        if (newStatus === 'connected') {
            this.lastConnected = new Date().toISOString();
            this.reconnectAttempts = 0;
        }
        
        console.log(`[CONNECTION] Status: ${oldStatus} → ${newStatus} ${reason ? `(${reason})` : ''}`);
        return { oldStatus, newStatus, reason };
    },
    
    // Obter resumo do status
    getStatusSummary() {
        return {
            status: this.status,
            lastCheck: this.lastCheck,
            lastConnected: this.lastConnected,
            reconnectAttempts: this.reconnectAttempts,
            isReconnecting: this.isReconnecting,
            recentErrors: this.errorLog.slice(0, 5)
        };
    }
};

// ============================================================================
// CACHE EM MEMÓRIA PARA CRM
// ============================================================================
let crmCache = {
    clients: [],
    orders: [],
    products: [],
    lastUpdate: null
};
let crmCacheLoading = false; // Evitar requisições duplicadas

/**
 * Normalizar telefone de forma consistente (server-side)
 * Remove tudo que não é dígito, remove DDI 55 se o número tiver 12+ dígitos
 * @param {string} raw - Número bruto
 * @returns {string} Número limpo (ex: "94984121802")
 */
function normalizePhoneServer(raw) {
    return PhoneNormalizer.normalize(raw);
}

/**
 * Garantir que o número tenha DDI 55 (Brasil) para envio via Evolution API
 * Delega para PhoneNormalizer.withDDI()
 */
function ensureDDI55(phone) {
    return PhoneNormalizer.withDDI(phone);
}

/**
 * Buscar cliente por telefone no cache com lógica fuzzy + 9º dígito
 * Hierarquia: match exato → últimos 9 dígitos → últimos 8 dígitos (ignora 9ºdígito)
 * Também tenta variações com/sem 9º dígito brasileiro
 */
function findClientByPhone(normalizedPhone) {
    if (!crmCache.clients || crmCache.clients.length === 0) return null;
    if (!normalizedPhone || normalizedPhone.length < 8) return null;
    
    const last9 = normalizedPhone.slice(-9);
    const last8 = normalizedPhone.slice(-8);
    
    // Gerar variações com/sem 9º dígito
    const searchVariations = [normalizedPhone];
    if (normalizedPhone.length === 11 && normalizedPhone.charAt(2) === '9') {
        searchVariations.push(normalizedPhone.substring(0, 2) + normalizedPhone.substring(3));
    }
    if (normalizedPhone.length === 10) {
        searchVariations.push(normalizedPhone.substring(0, 2) + '9' + normalizedPhone.substring(2));
    }
    
    // Helper: extrair todos os telefones limpos de um cliente
    const getClientPhones = (c) => [
        normalizePhoneServer(c.telefone),
        normalizePhoneServer(c.celular),
        normalizePhoneServer(c.phone),
        normalizePhoneServer(c.whatsapp)
    ].filter(p => p.length >= 8);
    
    // ETAPA 1: Match exato em qualquer campo (incluindo variações)
    let client = crmCache.clients.find(c => {
        const phones = getClientPhones(c);
        return phones.some(p => searchVariations.includes(p));
    });
    if (client) return client;
    
    // ETAPA 2: Match por últimos 9 dígitos
    client = crmCache.clients.find(c => {
        const phones = getClientPhones(c);
        return phones.some(p => p.slice(-9) === last9);
    });
    if (client) return client;
    
    // ETAPA 3: Match por últimos 8 dígitos (ignora 9ºdígito completamente)
    client = crmCache.clients.find(c => {
        const phones = getClientPhones(c);
        return phones.some(p => {
            if (p.slice(-8) !== last8) return false;
            // Confirmar DDD compatível (se ambos têm)
            const dddSearch = normalizedPhone.length >= 10 ? normalizedPhone.substring(0, 2) : '';
            const dddClient = p.length >= 10 ? p.substring(0, 2) : '';
            return !dddSearch || !dddClient || dddSearch === dddClient;
        });
    });
    
    return client;
}

/**
 * Garantir que o cache CRM está populado (auto-load se vazio)
 */
async function ensureCrmCache() {
    if (crmCache.clients && crmCache.clients.length > 0) return true;
    if (crmCacheLoading) {
        // Esperar até 10s pelo carregamento em andamento
        for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (crmCache.clients && crmCache.clients.length > 0) return true;
        }
        return false;
    }
    
    if (!FACILZAP_TOKEN) {
        console.warn('[CACHE] FACILZAP_TOKEN não configurado — tentando Supabase...');
    }
    
    try {
        crmCacheLoading = true;
        
        if (FACILZAP_TOKEN) {
            console.log('[CACHE] Auto-carregando dados FacilZap...');
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            const dataInicial = twoYearsAgo.toISOString().split('T')[0];
            const dataFinal = new Date().toISOString().split('T')[0];
            
            const [clients, orders, products] = await Promise.all([
                fetchAllPages('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN),
                fetchAllPages('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN, `&filtros[data_inicial]=${dataInicial}&filtros[data_final]=${dataFinal}&filtros[incluir_produtos]=1`),
                fetchAllPages('https://api.facilzap.app.br/produtos', FACILZAP_TOKEN)
            ]);
            
            // Enriquecer produtos (mesma lógica do /api/facilzap-proxy)
            const productsEnriched = enrichProducts(products);
            // Normalizar pedidos: garantir cliente_id e valor_total
            const ordersNormalized = orders.map(o => ({
                ...o,
                cliente_id: o.cliente_id || o.id_cliente || o.cliente?.id || null,
                id_cliente: o.id_cliente || o.cliente_id || o.cliente?.id || null,
                valor_total: o.valor_total || o.total || o.subtotal || 0,
                itens: o.itens || o.produtos || o.items || []
            }));
            crmCache = { clients, orders: ordersNormalized, products: productsEnriched, lastUpdate: new Date() };
            console.log(`[CACHE] ✅ Auto-carregado: ${clients.length} clientes, ${ordersNormalized.length} pedidos, ${productsEnriched.length} produtos`);
            
            if (clients.length > 0) return true;
            // Se FacilZap retornou vazio, cair no fallback Supabase abaixo
            console.warn('[CACHE] FacilZap retornou 0 clientes — tentando Supabase fallback...');
        }
        
        // FALLBACK: Carregar do Supabase se FacilZap falhar ou retornar vazio
        if (SUPABASE_SERVICE_KEY) {
            console.log('[CACHE] Tentando carregar do Supabase...');
            const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const [clientsRes, ordersRes, productsRes] = await Promise.all([
                supa.from('clients').select('*'),
                supa.from('orders').select('*'),
                supa.from('products').select('*')
            ]);
            const supaClients = (clientsRes.data || []).map(c => ({
                ...c, nome: c.name, telefone: c.phone, celular: c.phone
            }));
            const supaProducts = enrichProducts((productsRes.data || []).map(p => ({
                ...p, nome: p.name, preco: p.price
            })));
            if (supaClients.length > 0 || crmCache.clients.length === 0) {
                crmCache = { 
                    clients: supaClients.length > 0 ? supaClients : crmCache.clients,
                    orders: (ordersRes.data || []).length > 0 ? ordersRes.data : crmCache.orders,
                    products: supaProducts.length > 0 ? supaProducts : crmCache.products,
                    lastUpdate: new Date()
                };
                console.log(`[CACHE] ✅ Supabase fallback: ${supaClients.length} clientes, ${(ordersRes.data||[]).length} pedidos`);
                return supaClients.length > 0;
            }
        }
        
        return false;
    } catch (error) {
        console.error('[CACHE] Erro ao auto-carregar:', error.message);
        return false;
    } finally {
        crmCacheLoading = false;
    }
}

/**
 * Enriquecer lista de produtos com link_oficial, preço normalizado, imagem e estoque
 * Reutilizado em /api/facilzap-proxy e ensureCrmCache
 */
function enrichProducts(products) {
    return products.map(p => {
        const slug = p.slug || p.url_amigavel || p.nome?.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '-').replace(/[^\w-]/g, '') || p.id;

        // Preço: FacilZap guarda em catalogos[0].precos.preco — fallback nos campos tradicionais
        let precoRaw = p.preco_promocional || p.preco_venda || p.preco || p.valor;
        if (!precoRaw && Array.isArray(p.catalogos) && p.catalogos.length > 0) {
            const cat = p.catalogos[0];
            precoRaw = cat.precos?.preco_promocional || cat.precos?.preco || cat.preco;
        }
        if (!precoRaw && p.price) precoRaw = p.price; // Supabase fallback
        const preco = parseFloat(precoRaw || 0) || 0;

        let imagem = '';
        if (Array.isArray(p.imagens) && p.imagens.length > 0) {
            imagem = p.imagens[0].url || p.imagens[0].src || p.imagens[0];
        } else if (p.imagem_principal) {
            imagem = p.imagem_principal;
        } else if (p.imagem) {
            imagem = p.imagem;
        } else if (p.thumbnail) {
            imagem = p.thumbnail;
        }

        // Estoque: FacilZap retorna objeto {controlar_estoque, estoque} — calcular de variações
        let estoque = -1; // -1 = não controla estoque
        if (typeof p.estoque === 'object' && p.estoque !== null) {
            // Formato FacilZap: estoque é um objeto
            if (p.estoque.controlar_estoque) {
                // Somar estoque das variações
                if (Array.isArray(p.variacoes) && p.variacoes.length > 0) {
                    estoque = p.variacoes.reduce((sum, v) => sum + (parseInt(v.estoque?.estoque || v.estoque?.quantidade || 0) || 0), 0);
                } else {
                    // Produto sem variações — usar estoque direto do objeto
                    estoque = parseInt(p.estoque.estoque ?? p.estoque.quantidade ?? 0) || 0;
                }
            }
            // Se não controla estoque, mantém -1 (infinito)
        } else {
            // Formato numérico (Supabase ou já normalizado)
            estoque = parseInt(p.estoque ?? p.estoque_atual ?? p.quantidade_estoque ?? p.stock ?? p.qty ?? -1);
            if (isNaN(estoque)) estoque = -1;
        }

        // Referência / SKU
        const referencia = p.referencia || p.codigo || p.sku || p.ref || '';

        return {
            ...p,
            preco,
            imagem: imagem || 'https://via.placeholder.com/300x300?text=Sem+Foto',
            link_oficial: p.id ? `${SITE_BASE_URL}/c/atacado/produto/${p.id}` : (p.link || p.url || `${SITE_BASE_URL}/c/atacado`),
            estoque,
            referencia,
            slug
        };
    });
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
// Token da FacilZap
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN || '18984snBHqwS7ACgukUyeqadAYzE8E6ch2k27Qavj1vheckRVXKjJAMZfvcu8aS7MIanmBsnxOjyqPXpEcwT4';

// Configuração Evolution API (WhatsApp) - VPS Hostinger/Easypanel
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api.cjota.site'; 
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'EB6B5AB56A35-43C4-B590-1188166D4E7A';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'Cjota';
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://cjotarasteirinhas.com.br'; // URL da loja CJ Rasteirinhas

// Middleware - CORS restrito às origens permitidas
const ALLOWED_ORIGINS = [
    'https://crmcjota.netlify.app',
    'https://cjota-crm.9eo9b2.easypanel.host',
    'http://localhost:3000',
    'http://localhost:8080'
];
app.use(cors({
    origin: function(origin, callback) {
        // Permitir requests sem origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        console.warn(`[CORS] Origem bloqueada: ${origin}`);
        callback(new Error('Não permitido por CORS'));
    },
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' })); // Limite razoável (reduzido de 1GB)

// ============================================================================
// PRIORIZAÇÃO DE TRÁFEGO — Rotas de mensagens têm prioridade máxima
// ============================================================================
// Webhook da Evolution e rotas de mensagens: sem timeout, processamento imediato
app.use((req, res, next) => {
    const isHighPriority = 
        req.path === '/api/evolution/webhook' ||
        req.path === '/api/whatsapp/send-message' ||
        req.path === '/api/whatsapp/messages/fetch' ||
        req.path === '/api/evolution/messages';
    
    if (isHighPriority) {
        // Sem timeout para rotas críticas
        req.setTimeout(0);
        res.setTimeout(0);
        // Header para indicar prioridade (útil para proxies)
        res.setHeader('X-Priority', 'high');
    }
    next();
});

// ============================================================================
// ROTAS DE AUTENTICAÇÃO (ANTES do static middleware)
// ============================================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios' });
    }
    try {
        // Buscar usuário no Supabase
        const SUPA_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
        const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
        
        // Credenciais válidas (fallback seguro quando Supabase indisponível)
        const VALID_CREDENTIALS = [
            { email: process.env.CRM_USER || 'carolineazevedo075@gmail.com', pass: process.env.CRM_PASS || 'Cjota@015', name: 'Caroline Azevedo' },
            { email: 'admin', pass: 'admin', name: 'Admin' }
        ];
        
        // FASE 1: Verificar credenciais locais primeiro (rápido, sem dependência)
        const localMatch = VALID_CREDENTIALS.find(c => 
            (username.toLowerCase().trim() === c.email.toLowerCase()) && password === c.pass
        );
        
        if (localMatch) {
            const token = generateSessionToken();
            activeSessions.set(token, { user: localMatch.email, name: localMatch.name, createdAt: Date.now() });
            persistSessions();
            res.setHeader('Set-Cookie', `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax`);
            return res.json({ success: true, message: 'Login realizado com sucesso', user: { name: localMatch.name, email: localMatch.email } });
        }
        
        // FASE 2: Tentar Supabase (tabela crm_users)
        if (!SUPA_KEY) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
        }
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(SUPA_URL, SUPA_KEY);
        const { data: users, error } = await supabase
            .from('crm_users')
            .select('*')
            .eq('email', username.toLowerCase().trim())
            .eq('active', true)
            .limit(1);
        if (error || !users || users.length === 0) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
        }
        const user = users[0];
        // Comparar senha com hash
        const inputHash = crypto.createHash('sha256').update(password + (user.salt || '')).digest('hex');
        if (user.password_hash !== inputHash) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos' });
        }
        const token = generateSessionToken();
        activeSessions.set(token, { user: user.email, name: user.name, createdAt: Date.now() });
        persistSessions();
        res.setHeader('Set-Cookie', `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax`);
        return res.json({ success: true, message: 'Login realizado com sucesso', user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error('[Auth] Erro no login:', err.message);
        return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['crm_session'];
    if (token) activeSessions.delete(token);
    persistSessions();
    res.setHeader('Set-Cookie', 'crm_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return res.json({ success: true, message: 'Logout realizado' });
});

app.get('/api/auth/check', (req, res) => {
    return res.json({ authenticated: isAuthenticated(req) });
});

// Middleware de proteção — redireciona para login se não autenticado
app.use((req, res, next) => {
    // Permitir sempre: login page, auth API, webhooks, assets públicos
    const publicPaths = [
        '/login.html',
        '/api/auth/',
        '/api/evolution/webhook',  // Webhook precisa funcionar sem auth
        '/api/facilzap/webhook'
    ];

    const reqPath = req.path.toLowerCase();

    // Permitir paths públicos
    if (publicPaths.some(p => reqPath.startsWith(p))) return next();

    // Permitir raiz redirecionar
    if (reqPath === '/' || reqPath === '') {
        if (!isAuthenticated(req)) return res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
        return next();
    }

    // Proteger páginas HTML
    if (reqPath.endsWith('.html') && reqPath !== '/login.html') {
        if (!isAuthenticated(req)) return res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
        return next();
    }

    // Proteger rotas de API (exceto auth e webhooks)
    if (reqPath.startsWith('/api/') && !publicPaths.some(p => reqPath.startsWith(p))) {
        if (!isAuthenticated(req)) {
            return res.status(401).json({ error: 'Não autenticado' });
        }
        return next();
    }

    // Permitir assets estáticos (JS, CSS, imagens, fontes)
    next();
});

app.use(express.static(path.join(__dirname, '/')));

// ============================================================================
// FUNÇÕES AUXILIARES (FACILZAP)
// ============================================================================
async function fetchAPI(url, token) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    
    if (response.status === 401) throw new Error('401 - Token inválido');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    return await response.json();
}

async function fetchAllPages(endpoint, token, extraParams = '') {
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `${endpoint}?page=${page}&length=100${extraParams}`;
        console.log(`[INFO] Buscando ${endpoint}, página ${page}...`);
        
        try {
            const data = await fetchAPI(url, token);
            const items = data.data || [];
            if (items.length > 0) {
                allData = allData.concat(items);
                page++;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`[ERRO] ${endpoint} pg ${page}: ${error.message}`);
            hasMore = false;
        }
    }
    return allData;
}

// ============================================================================
// ROTAS DO CRM (LEGADO + DADOS)
// ============================================================================
app.get('/api/facilzap-proxy', async (req, res) => {
    try {
        console.log('[INFO] Iniciando sincronização FacilZap...');
        
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const dataInicial = twoYearsAgo.toISOString().split('T')[0];
        const dataFinal = new Date().toISOString().split('T')[0];

        // Busca paralela
        const [clients, orders, products] = await Promise.all([
            fetchAllPages('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN),
            fetchAllPages('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN, `&filtros[data_inicial]=${dataInicial}&filtros[data_final]=${dataFinal}&filtros[incluir_produtos]=1`),
            fetchAllPages('https://api.facilzap.app.br/produtos', FACILZAP_TOKEN)
        ]);

        // Enriquecer produtos com link, preço, imagem e estoque
        const productsEnriched = enrichProducts(products);

        // Normalizar pedidos: garantir cliente_id e valor_total (FacilZap usa o.cliente.id e o.total)
        const ordersNormalized = orders.map(o => ({
            ...o,
            cliente_id: o.cliente_id || o.id_cliente || o.cliente?.id || null,
            id_cliente: o.id_cliente || o.cliente_id || o.cliente?.id || null,
            valor_total: o.valor_total || o.total || o.subtotal || 0,
            itens: o.itens || o.produtos || o.items || []
        }));

        res.json({ clients, orders: ordersNormalized, products: productsEnriched });
        
        // Salvar em cache para uso em endpoints de lookup
        crmCache = {
            clients,
            orders: ordersNormalized,
            products: productsEnriched,
            lastUpdate: new Date()
        };
        
        // Sync fire-and-forget: salvar produtos no Supabase para persistência
        if (SUPABASE_SERVICE_KEY && productsEnriched.length > 0) {
            try {
                const supaSync = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
                const supaProducts = productsEnriched.map(p => ({
                    id: String(p.id),
                    codigo: p.codigo || p.referencia || '',
                    name: p.nome || p.name || 'Produto',
                    description: p.descricao || p.description || '',
                    sku: p.referencia || p.sku || '',
                    price: p.preco || 0,
                    stock: p.estoque != null ? p.estoque : -1,
                    is_active: p.ativo !== false && p.estoque !== 0,
                    manages_stock: (p.estoque != null && p.estoque >= 0),
                    image: p.imagem || '',
                    images: p.imagens ? JSON.stringify(p.imagens) : '[]',
                    updated_at: new Date().toISOString()
                }));
                await supaSync.from('products').upsert(supaProducts, { onConflict: 'id' });
                console.log(`[Supabase] ✅ ${supaProducts.length} produtos sincronizados ao Supabase`);
            } catch (syncErr) {
                console.warn('[Supabase] Sync produtos fire-and-forget falhou:', syncErr.message);
            }
        }
    } catch (error) {
        console.error(error);
        
        // FALLBACK: Se FacilZap falhar, tentar carregar do Supabase
        if (SUPABASE_SERVICE_KEY) {
            try {
                console.log('[FALLBACK] Tentando carregar produtos do Supabase...');
                const supaFallback = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
                const { data: supaProducts } = await supaFallback.from('products').select('*').eq('is_active', true);
                if (supaProducts && supaProducts.length > 0) {
                    const normalizedProducts = supaProducts.map(p => ({
                        id: p.id,
                        nome: p.name,
                        preco: parseFloat(p.price || 0),
                        estoque: p.stock != null ? p.stock : -1,
                        imagem: p.image || 'https://via.placeholder.com/300x300?text=Sem+Foto',
                        referencia: p.sku || p.codigo || '',
                        link_oficial: p.id ? `${SITE_BASE_URL}/c/atacado/produto/${p.id}` : `${SITE_BASE_URL}/c/atacado`,
                        slug: p.id
                    }));
                    console.log(`[FALLBACK] ✅ ${normalizedProducts.length} produtos do Supabase`);
                    return res.json({ 
                        clients: crmCache.clients || [], 
                        orders: crmCache.orders || [], 
                        products: normalizedProducts,
                        source: 'supabase-fallback'
                    });
                }
            } catch (fbErr) {
                console.warn('[FALLBACK] Supabase também falhou:', fbErr.message);
            }
        }
        
        res.status(500).json({ error: error.message });
    }
});

// Endpoint dedicado: produtos do Supabase (sidebar products)
app.get('/api/supabase-products', async (req, res) => {
    if (!SUPABASE_SERVICE_KEY) {
        // Sem Supabase configurado, usar cache do FacilZap
        return res.json({ products: crmCache.products || [], source: 'facilzap-cache' });
    }
    try {
        const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data, error } = await supa.from('products').select('*').order('updated_at', { ascending: false });
        if (error) throw error;
        
        const products = (data || []).map(p => ({
            id: p.id,
            nome: p.name,
            preco: parseFloat(p.price || 0),
            estoque: p.stock != null ? p.stock : -1,
            imagem: p.image || 'https://via.placeholder.com/300x300?text=Sem+Foto',
            referencia: p.sku || p.codigo || '',
            link_oficial: p.id ? `${SITE_BASE_URL}/c/atacado/produto/${p.id}` : `${SITE_BASE_URL}/c/atacado`,
            slug: p.id,
            is_active: p.is_active,
            descricao: p.description || ''
        }));
        
        res.json({ products, source: 'supabase', count: products.length });
    } catch (err) {
        console.error('[Supabase Products]', err.message);
        // Fallback para cache FacilZap
        res.json({ products: crmCache.products || [], source: 'facilzap-fallback' });
    }
});

app.get('/api/image-proxy', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('URL missing');
    
    try {
        const response = await fetch(imageUrl);
        const buffer = await response.buffer();
        res.set('Content-Type', response.headers.get('content-type'));
        res.send(buffer);
    } catch (e) {
        res.status(500).send('Error fetching image');
    }
});

// ============================================================================
// WEBHOOK HANDLER - Recebe eventos do FacilZap (carrinhos abandonados, pedidos, etc)
// ============================================================================

// Armazenamento em memória para webhooks (em produção use banco de dados)
let webhookEvents = [];
let abandonedCarts = [];

// Rota principal do webhook (mesma URL que no Netlify)
app.post('/webhook', handleWebhook);
app.post('/.netlify/functions/webhook-handler', handleWebhook);
app.post('/api/webhook', handleWebhook);

async function handleWebhook(req, res) {
    try {
        const payload = req.body || {};
        
        const webhookId = payload.id || `wh_${Date.now()}`;
        const evento = payload.evento || 'unknown';
        const dados = payload.dados || {};
        
        console.log('========================================');
        console.log(`[WEBHOOK] Recebido: ${evento}`);
        console.log(`[WEBHOOK] ID: ${webhookId}`);
        console.log(`[WEBHOOK] Timestamp: ${new Date().toISOString()}`);
        
        let processedData = null;
        
        switch (evento) {
            case 'pedido_criado':
                processedData = {
                    tipo: 'pedido_criado',
                    pedido: { id: dados.id, codigo: dados.codigo, total: dados.total },
                    cliente: { id: dados.cliente?.id, nome: dados.cliente?.nome, whatsapp: dados.cliente?.whatsapp }
                };
                console.log(`[WEBHOOK] Novo pedido: #${dados.id} - ${dados.cliente?.nome} - R$ ${dados.total}`);
                break;
                
            case 'pedido_atualizado':
            case 'pedido_pago':
                processedData = {
                    tipo: evento,
                    pedido_id: dados.id,
                    status: dados.status_pago ? 'Pago' : 'Pendente',
                    valor: dados.total
                };
                console.log(`[WEBHOOK] Pedido ${evento}: #${dados.id}`);
                break;
                
            case 'carrinho_abandonado_criado':
                // Normalizar WhatsApp do cliente (garantir DDI 55)
                const cartPhone = dados.cliente?.whatsapp || dados.cliente?.telefone || dados.cliente?.celular || '';
                const cartPhoneNorm = normalizePhoneServer(cartPhone);
                const cartPhoneWithDDI = ensureDDI55(cartPhoneNorm);
                
                processedData = {
                    tipo: 'carrinho_abandonado',
                    id: dados.id,
                    cliente: {
                        id: dados.cliente?.id,
                        nome: dados.cliente?.nome,
                        whatsapp: cartPhoneWithDDI, // Normalizado com DDI 55
                        whatsapp_raw: cartPhone, // Original para debug
                        email: dados.cliente?.email
                    },
                    valor_total: dados.valor_total,
                    quantidade_produtos: dados.quantidade_produtos,
                    produtos: dados.produtos?.map(p => {
                        // Garantir que p.nome seja string (fix [object Object])
                        let nomeProduto = '';
                        if (typeof p === 'string') {
                            nomeProduto = p;
                        } else if (p && typeof p === 'object') {
                            nomeProduto = p.nome || p.name || p.titulo || p.descricao || JSON.stringify(p);
                        }
                        return {
                            nome: nomeProduto,
                            variacao: typeof p?.variacao === 'object' ? (p.variacao?.nome || p.variacao?.name || '') : (p?.variacao || ''),
                            quantidade: parseInt(p?.quantidade || p?.qty || 1),
                            preco: parseFloat(p?.preco || p?.valor || p?.price || 0)
                        };
                    }),
                    link_carrinho: dados.url || dados.link_carrinho || dados.link || dados.checkout_url || null,
                    iniciado_em: dados.iniciado_em,
                    ultima_atualizacao: dados.ultima_atualizacao
                };
                
                // Log de debug: mostrar TODOS os campos que chegam (para identificar o campo correto do link)
                console.log(`[WEBHOOK] 🔗 link_carrinho capturado: ${processedData.link_carrinho || 'NENHUM'}`);
                console.log(`[WEBHOOK] 📋 Campos do payload: ${Object.keys(dados).join(', ')}`);
                if (!processedData.link_carrinho) {
                    console.log(`[WEBHOOK] ⚠️ Nenhum link encontrado! Campos disponíveis:`, JSON.stringify(dados, null, 2).slice(0, 500));
                }
                
                // Salvar carrinho abandonado em memória
                const existingCartIndex = abandonedCarts.findIndex(c => c.id === dados.id);
                if (existingCartIndex >= 0) {
                    abandonedCarts[existingCartIndex] = processedData;
                } else {
                    abandonedCarts.unshift(processedData);
                }
                // Manter apenas os últimos 100
                abandonedCarts = abandonedCarts.slice(0, 100);
                
                // ====== PERSISTIR NO SUPABASE (fire-and-forget) ======
                try {
                    const sbCarts = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
                    await sbCarts.from('abandoned_carts').upsert({
                        id: String(processedData.id || webhookId),
                        cliente_id: processedData.cliente?.id,
                        cliente_nome: processedData.cliente?.nome,
                        cliente_whatsapp: processedData.cliente?.whatsapp,
                        cliente_email: processedData.cliente?.email,
                        valor_total: processedData.valor_total || 0,
                        quantidade_produtos: processedData.quantidade_produtos || 0,
                        produtos: processedData.produtos || [],
                        link_carrinho: processedData.link_carrinho,
                        iniciado_em: processedData.iniciado_em,
                        ultima_atualizacao: processedData.ultima_atualizacao,
                        status: 'pendente'
                    }, { onConflict: 'id' });
                    console.log('[WEBHOOK] ✅ Carrinho persistido no Supabase');
                } catch (supErr) {
                    console.warn('[WEBHOOK] Supabase save falhou (não-crítico):', supErr.message);
                }
                
                console.log(`[WEBHOOK] Carrinho abandonado: ${dados.cliente?.nome} - R$ ${dados.valor_total}`);
                break;
                
            default:
                console.log(`[WEBHOOK] Evento não tratado: ${evento}`);
        }
        
        // Salvar evento no histórico
        webhookEvents.unshift({
            id: webhookId,
            evento,
            dados: processedData || dados,
            receivedAt: new Date().toISOString()
        });
        webhookEvents = webhookEvents.slice(0, 100);
        
        console.log('========================================');
        
        res.json({
            success: true,
            message: `Webhook ${evento} recebido com sucesso`,
            webhookId,
            processedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[WEBHOOK] Erro:', error.message);
        res.status(200).json({ success: false, error: error.message });
    }
}

// API para o frontend buscar eventos e carrinhos
app.get('/api/webhook/events', (req, res) => {
    res.json({ events: webhookEvents, abandonedCarts });
});

app.get('/api/webhook/carts', (req, res) => {
    res.json({ carts: abandonedCarts });
});

app.delete('/api/webhook/events', (req, res) => {
    webhookEvents = [];
    res.json({ success: true, message: 'Histórico limpo' });
});

app.delete('/api/webhook/carts/:id', (req, res) => {
    abandonedCarts = abandonedCarts.filter(c => c.id !== req.params.id);
    res.json({ success: true });
});


// ============================================================================
// ROTAS WHATSAPP (EVOLUTION API) + SISTEMA DE MONITORAMENTO
// ============================================================================
const evolutionHeaders = {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
};

// Função auxiliar para verificar conexão
async function checkWhatsAppConnection() {
    try {
        const url = `${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`;
        const response = await fetch(url, { headers: evolutionHeaders, timeout: 10000 });
        
        if (response.status === 404) {
            ConnectionMonitor.updateStatus('not_created', 'Instância não existe');
            return { connected: false, state: 'NOT_CREATED', reason: 'Instância não criada' };
        }
        
        const data = await response.json();
        const state = data.instance?.state || data.state || 'unknown';
        
        if (state === 'open') {
            ConnectionMonitor.updateStatus('connected');
            return { connected: true, state: 'open', data };
        } else if (state === 'close' || state === 'closed') {
            ConnectionMonitor.updateStatus('disconnected', 'Sessão fechada');
            return { connected: false, state, reason: 'Sessão do WhatsApp fechada' };
        } else if (state === 'connecting') {
            ConnectionMonitor.updateStatus('connecting');
            return { connected: false, state, reason: 'Conectando...' };
        } else {
            ConnectionMonitor.updateStatus('disconnected', state);
            return { connected: false, state, reason: `Estado: ${state}` };
        }
    } catch (error) {
        const errorType = error.code === 'ECONNREFUSED' ? 'api_offline' : 
                         error.code === 'ETIMEDOUT' ? 'timeout' : 'network_error';
        
        ConnectionMonitor.logError(errorType, error.message, { code: error.code });
        ConnectionMonitor.updateStatus('error', error.message);
        
        return { 
            connected: false, 
            state: 'ERROR', 
            reason: errorType === 'api_offline' ? 'Evolution API está offline' :
                    errorType === 'timeout' ? 'Timeout na conexão' :
                    `Erro de rede: ${error.message}`
        };
    }
}

// Função de auto-reconnect
async function attemptAutoReconnect() {
    if (ConnectionMonitor.isReconnecting) {
        console.log('[AUTO-RECONNECT] Já está tentando reconectar...');
        return false;
    }
    
    if (ConnectionMonitor.reconnectAttempts >= ConnectionMonitor.maxReconnectAttempts) {
        console.log('[AUTO-RECONNECT] Limite de tentativas atingido. Aguardando intervenção manual.');
        ConnectionMonitor.logError('max_attempts', 'Máximo de tentativas de reconexão atingido');
        return false;
    }
    
    ConnectionMonitor.isReconnecting = true;
    ConnectionMonitor.reconnectAttempts++;
    
    console.log(`[AUTO-RECONNECT] Tentativa ${ConnectionMonitor.reconnectAttempts}/${ConnectionMonitor.maxReconnectAttempts}...`);
    
    try {
        // 1. Tentar restart da instância
        console.log('[AUTO-RECONNECT] Fazendo restart da instância...');
        await fetch(`${EVOLUTION_URL}/instance/restart/${INSTANCE_NAME}`, {
            method: 'PUT',
            headers: evolutionHeaders
        });
        
        // Aguardar um pouco
        await new Promise(r => setTimeout(r, 5000));
        
        // 2. Verificar se reconectou
        const status = await checkWhatsAppConnection();
        
        if (status.connected) {
            console.log('[AUTO-RECONNECT] ✅ Reconectado com sucesso!');
            ConnectionMonitor.isReconnecting = false;
            // Delta sync: buscar mensagens perdidas durante a desconexão
            deltaSync().catch(e => console.warn('[DELTA SYNC] Erro pós-reconnect:', e.message));
            // Notificar frontend via Socket.io
            io.emit('connection-update', { state: 'open', timestamp: new Date().toISOString() });
            return true;
        }
        
        // 3. Se ainda não conectou, tentar connect
        console.log('[AUTO-RECONNECT] Tentando /connect...');
        const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`, {
            headers: evolutionHeaders
        });
        
        await new Promise(r => setTimeout(r, 3000));
        const finalStatus = await checkWhatsAppConnection();
        
        ConnectionMonitor.isReconnecting = false;
        return finalStatus.connected;
        
    } catch (error) {
        ConnectionMonitor.logError('reconnect_failed', error.message);
        ConnectionMonitor.isReconnecting = false;
        return false;
    }
}

// Health Check periódico (a cada 5 minutos)
let healthCheckInterval = null;

function startHealthCheck() {
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    
    console.log('[HEALTH CHECK] Iniciando monitoramento de conexão (intervalo: 2min)');
    
    // Verificar imediatamente
    checkWhatsAppConnection().then(status => {
        console.log(`[HEALTH CHECK] Status inicial: ${status.state}`);
    });
    
    healthCheckInterval = setInterval(async () => {
        console.log('[HEALTH CHECK] Verificando conexão...');
        const status = await checkWhatsAppConnection();
        
        if (!status.connected && status.state !== 'connecting' && status.state !== 'NOT_CREATED') {
            console.log('[HEALTH CHECK] ⚠️ Desconectado! Tentando reconexão automática...');
            attemptAutoReconnect();
        }
    }, ConnectionMonitor.checkInterval);
}

// Endpoint para status detalhado da conexão
app.get('/api/whatsapp/connection-status', async (req, res) => {
    const liveStatus = await checkWhatsAppConnection();
    res.json({
        ...ConnectionMonitor.getStatusSummary(),
        liveCheck: liveStatus
    });
});

// Endpoint para resetar contador de tentativas
app.post('/api/whatsapp/reset-reconnect', (req, res) => {
    ConnectionMonitor.reconnectAttempts = 0;
    ConnectionMonitor.isReconnecting = false;
    res.json({ success: true, message: 'Contador de reconexão resetado' });
});

// Endpoint para forçar reconexão
app.post('/api/whatsapp/force-reconnect', async (req, res) => {
    ConnectionMonitor.reconnectAttempts = 0; // Resetar contador
    const success = await attemptAutoReconnect();
    res.json({ 
        success, 
        message: success ? 'Reconectado com sucesso' : 'Falha na reconexão',
        status: ConnectionMonitor.getStatusSummary()
    });
});

// 0. DESCONECTAR / LOGOUT - Para trocar de WhatsApp
app.post('/api/whatsapp/logout', async (req, res) => {
    try {
        console.log(`[INFO] Desconectando WhatsApp da instância ${INSTANCE_NAME}...`);
        
        // 1. Fazer logout (desconecta o WhatsApp mas mantém a instância)
        const logoutRes = await fetch(`${EVOLUTION_URL}/instance/logout/${INSTANCE_NAME}`, {
            method: 'DELETE',
            headers: evolutionHeaders
        });
        
        const logoutData = await logoutRes.json();
        console.log('[INFO] Logout response:', logoutData);
        
        // 2. Opcional: Deletar a instância completamente para limpar tudo
        if (req.query.deleteInstance === 'true') {
            console.log(`[INFO] Deletando instância ${INSTANCE_NAME} completamente...`);
            await fetch(`${EVOLUTION_URL}/instance/delete/${INSTANCE_NAME}`, {
                method: 'DELETE',
                headers: evolutionHeaders
            });
        }
        
        res.json({ 
            success: true, 
            message: 'WhatsApp desconectado! Agora você pode conectar outro número.',
            data: logoutData
        });
    } catch (error) {
        console.error('[ERRO] Logout:', error);
        res.status(500).json({ error: error.message });
    }
});
// 1. Verificar/Criar Instância
app.get('/api/whatsapp/status', async (req, res) => {
    try {
        const url = `${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`;
        const response = await fetch(url, { headers: evolutionHeaders });
        
        // Se retornar 404, significa que a instância não existe
        if (response.status === 404) {
            return res.json({ state: 'NOT_CREATED' });
        }
        
        const data = await response.json();
        // Evolution retorna { instance: { state: "open", ... } }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao conectar Evolution API: ' + error.message });
    }
});

// 2. Conectar (QR Code)
app.get('/api/whatsapp/connect', async (req, res) => {
    try {
        console.log(`[INFO] Tentando criar/recuperar instância ${INSTANCE_NAME}...`);
        
        // 1. Verificar Status de Conexão Primeiro
        try {
            const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`, { headers: evolutionHeaders });
            if (stateRes.ok) {
                const stateData = await stateRes.json();
                // Se já estiver conectado, retornar estado
                if (stateData.instance && stateData.instance.state === 'open') {
                    return res.json({ state: 'open', message: 'Instância já conectada', instance: stateData.instance });
                }
            }
        } catch (ignored) { /* Ignorar erro de status se instancia não existe */ }

        // 2. Tentar Criar Instância (ou obter QR se criado agora)
        const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({ 
                instanceName: INSTANCE_NAME, 
                token: "randomtoken123",
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS'
            })
        });

        // Se criou com sucesso, pode já ter o QR Code no corpo da resposta (Evolution v2)
        if (createRes.ok) {
            const createData = await createRes.json();
            console.log('[INFO] Instância criada com sucesso.');
            
            // Estrutura comum no v2: { instance: {...}, qrcode: { base64: "..." } }
            if (createData.qrcode && createData.qrcode.base64) {
                 console.log('[INFO] QR Code recebido na criação.');
                 return res.json({ 
                     base64: createData.qrcode.base64,
                     code: createData.qrcode.code,
                     pairingCode: createData.qrcode.pairingCode,
                     instance: createData.instance
                 });
            }
        } else if (createRes.status !== 403) {
             // 403 significa que já existe, erro real é outro
             const createErr = await createRes.json();
             console.error('[ERRO] Erro ao criar instância:', createErr);
        }

        // 3. Se chegou aqui, precisa chamar /connect (instância já existia ou create não retornou QR)
        console.log(`[INFO] Buscando QR Code via /connect para ${INSTANCE_NAME}...`);
        
        const connectUrl = `${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`;
        let response = await fetch(connectUrl, { headers: evolutionHeaders });
        let data = await response.json();
        
        // CORREÇÃO: Se retornar { count: 0 }, a instância pode estar em um estado inconsistente.
        // Tentar resetar (logout) e conectar novamente.
        if (data && (data.count === 0 || (data.code === 200 && data.count === 0)) && !data.base64) {
             console.warn('[AVISO] Recebido { count: 0 }. Tentando logout e reconexão...');
             
             await fetch(`${EVOLUTION_URL}/instance/logout/${INSTANCE_NAME}`, { 
                 method: 'DELETE', 
                 headers: evolutionHeaders 
             });
             
             // Pequeno delay
             await new Promise(r => setTimeout(r, 1500));
             
             // Tentar connect novamente
             response = await fetch(connectUrl, { headers: evolutionHeaders });
             data = await response.json();
        }

        if (!response.ok) {
             console.error('Erro ao conectar (status ' + response.status + '):', data);
             if (response.status === 404) {
                 return res.status(404).json({ error: 'Instância não encontrada e falha ao criar.' });
             }
        }

        res.json(data); 
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Listar Chats (com nomes dos contatos)
app.get('/api/whatsapp/chats', async (req, res) => {
    try {
        // Buscar chats e contatos em paralelo
        const [chatsResponse, contactsResponse] = await Promise.all([
            fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE_NAME}`, { 
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({
                    where: {},
                    options: { limit: 50, order: "DESC" }
                })
            }),
            fetch(`${EVOLUTION_URL}/chat/findContacts/${INSTANCE_NAME}`, { 
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({})
            })
        ]);
        
        const chatsData = await chatsResponse.json();
        const contactsData = await contactsResponse.json();
        
        const chats = Array.isArray(chatsData) ? chatsData : (chatsData.data || []);
        const contacts = Array.isArray(contactsData) ? contactsData : (contactsData.data || []);
        
        // Criar mapa de contatos por remoteJid
        const contactsMap = {};
        contacts.forEach(c => {
            if (c.remoteJid && c.pushName) {
                contactsMap[c.remoteJid] = c.pushName;
            }
        });
        
        // Enriquecer chats com nomes dos contatos
        const enrichedChats = chats.map(chat => {
            const jid = chat.remoteJid || chat.id;
            
            // Tentar pegar nome de várias fontes
            let name = chat.pushName || 
                       chat.name || 
                       contactsMap[jid] ||
                       chat.lastMessage?.pushName;
            
            // Se ainda não tem nome, verificar se é @lid (Lead ID do Meta)
            if (!name && jid && jid.includes('@lid')) {
                // Para leads do Meta, pegar do remoteJidAlt se existir
                const altJid = chat.lastMessage?.key?.remoteJidAlt;
                if (altJid && contactsMap[altJid]) {
                    name = contactsMap[altJid];
                } else {
                    name = 'Lead (Anúncio)';
                }
            }
            
            // Extrair telefone real para @lid (de remoteJidAlt se for @s.whatsapp.net)
            let realPhone = null;
            if (jid && jid.includes('@lid')) {
                const altJid = chat.lastMessage?.key?.remoteJidAlt;
                if (altJid && altJid.includes('@s.whatsapp.net')) {
                    realPhone = altJid.replace('@s.whatsapp.net', '');
                }
            }
            
            // Se ainda não tem nome, formatar telefone
            if (!name && jid) {
                if (jid.includes('@lid')) {
                    // @lid NÃO contém telefone real, não formatar como número
                    name = realPhone ? `+${realPhone.slice(0,2)} ${realPhone.slice(2)}` : 'Lead (Anúncio)';
                } else {
                    const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                    if (phone.length > 8) {
                        name = `+${phone.slice(0,2)} ${phone.slice(2)}`;
                    } else {
                        name = phone;
                    }
                }
            }
            
            return {
                ...chat,
                name: name || 'Desconhecido',
                pushName: name || chat.pushName,
                phone: realPhone || null // Telefone real para @lid (extraído de remoteJidAlt)
            };
        });
        
        res.json(enrichedChats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 3.1 Listar Grupos
app.get('/api/whatsapp/groups', async (req, res) => {
    try {
        const response = await fetch(`${EVOLUTION_URL}/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=true`, {
            method: 'GET',
            headers: evolutionHeaders
        });
        
        const data = await response.json();
        const groups = Array.isArray(data) ? data : (data.data || []);
        
        // Formatar grupos para o padrão do chat
        const formattedGroups = groups.map(group => ({
            remoteJid: group.id,
            name: group.subject,
            isGroup: true,
            isCommunity: group.isCommunity || false,
            profilePicUrl: group.pictureUrl || null,
            participants: group.participants || [],
            participantsCount: group.participants?.length || group.size || 0,
            owner: group.owner,
            creation: group.creation,
            description: group.desc
        }));
        
        res.json(formattedGroups);
    } catch (error) {
        console.error('[Grupos] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dados mock para testes quando Evolution API não estiver disponível
function generateMockChats() {
    return [
        {
            id: '5562999998888@s.whatsapp.net',
            remoteJid: '5562999998888@s.whatsapp.net',
            name: 'João Silva',
            pushName: 'João Silva',
            profilePicUrl: null,
            unreadCount: 2,
            timestamp: Date.now(),
            lastMessage: {
                key: { id: 'msg1', remoteJid: '5562999998888@s.whatsapp.net' },
                pushName: 'João Silva',
                messageTimestamp: Math.floor(Date.now() / 1000) - 300,
                message: { conversation: 'Oi, tudo certo?' }
            }
        },
        {
            id: '5561988776655@s.whatsapp.net',
            remoteJid: '5561988776655@s.whatsapp.net',
            name: 'Maria Santos',
            pushName: 'Maria Santos',
            profilePicUrl: null,
            unreadCount: 0,
            timestamp: Date.now() - 3600000,
            lastMessage: {
                key: { id: 'msg2', remoteJid: '5561988776655@s.whatsapp.net' },
                pushName: 'Maria Santos',
                messageTimestamp: Math.floor(Date.now() / 1000) - 3600,
                message: { conversation: 'Obrigada pela atenção!' }
            }
        },
        {
            id: '5563987654321@s.whatsapp.net',
            remoteJid: '5563987654321@s.whatsapp.net',
            name: 'Pedro Costa',
            pushName: 'Pedro Costa',
            profilePicUrl: null,
            unreadCount: 1,
            timestamp: Date.now() - 7200000,
            lastMessage: {
                key: { id: 'msg3', remoteJid: '5563987654321@s.whatsapp.net' },
                pushName: 'Pedro Costa',
                messageTimestamp: Math.floor(Date.now() / 1000) - 7200,
                message: { conversation: 'Qual é o valor?' }
            }
        }
    ];
}

function generateMockContacts() {
    return [
        { remoteJid: '5562999998888@s.whatsapp.net', pushName: 'João Silva' },
        { remoteJid: '5561988776655@s.whatsapp.net', pushName: 'Maria Santos' },
        { remoteJid: '5563987654321@s.whatsapp.net', pushName: 'Pedro Costa' }
    ];
}

function generateMockGroups() {
    return [
        {
            id: '120363192837461928-1234567890@g.us',
            subject: 'Equipe de Vendas',
            pictureUrl: null,
            isCommunity: false,
            participants: [
                { id: '5562999998888@s.whatsapp.net', isAdmin: true },
                { id: '5561988776655@s.whatsapp.net', isAdmin: false },
                { id: '5563987654321@s.whatsapp.net', isAdmin: false }
            ]
        },
        {
            id: '120363192837461928-9876543210@g.us',
            subject: 'Estratégia 2026',
            pictureUrl: null,
            isCommunity: false,
            participants: [
                { id: '5562999998888@s.whatsapp.net', isAdmin: true },
                { id: '5561988776655@s.whatsapp.net', isAdmin: true }
            ]
        }
    ];
}

// 3.2 Listar Chats + Grupos combinados
// ── Cache server-side (evita bombardear Evolution API a cada 15s) ──
let _allChatsCache = null;
let _allChatsCacheTime = 0;
const ALL_CHATS_CACHE_TTL = 30000; // 30 segundos

app.get('/api/whatsapp/all-chats', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 200;
        const noCache = req.query.nocache === '1';

        // Retornar cache se fresco (< 30s) e não forçado
        if (!noCache && _allChatsCache && (Date.now() - _allChatsCacheTime < ALL_CHATS_CACHE_TTL)) {
            return res.json(_allChatsCache);
        }
        
        // Buscar chats, contatos e grupos em paralelo
        const [chatsResponse, contactsResponse, groupsResponse] = await Promise.all([
            fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE_NAME}`, { 
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({
                    where: {},
                    options: { limit: limit, order: "DESC" }
                })
            }).catch(() => null),
            fetch(`${EVOLUTION_URL}/chat/findContacts/${INSTANCE_NAME}`, { 
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({})
            }).catch(() => null),
            fetch(`${EVOLUTION_URL}/group/fetchAllGroups/${INSTANCE_NAME}`, {
                method: 'GET',
                headers: evolutionHeaders
            }).catch(() => null)
        ]);
        
        // Se Evolution API não responder, usar dados mock
        let chatsData, contactsData, groupsData;
        
        if (!chatsResponse || !chatsResponse.ok) {
            console.warn('[⚠️  FALLBACK] Evolution API indisponível - usando dados mock');
            chatsData = { data: generateMockChats() };
            contactsData = { data: generateMockContacts() };
            groupsData = { data: generateMockGroups() };
        } else {
            chatsData = await chatsResponse.json();
            contactsData = await contactsResponse?.json() || { data: [] };
            groupsData = await groupsResponse?.json() || { data: [] };
        }
        
        // Debug leve (sem JSON.stringify pesado)
        const chatCount = chatsData?.data?.length || chatsData?.length || 0;
        const groupCount = groupsData?.data?.length || groupsData?.length || 0;
        console.log(`[all-chats] ${chatCount} chats, ${groupCount} grupos da Evolution API`);
        
        const chats = Array.isArray(chatsData) ? chatsData : (chatsData.data || []);
        const contacts = Array.isArray(contactsData) ? contactsData : (contactsData.data || []);
        const groups = Array.isArray(groupsData) ? groupsData : (groupsData.data || []);
        
        // Criar mapa de contatos
        const contactsMap = {};
        contacts.forEach(c => {
            if (c.remoteJid && c.pushName) {
                contactsMap[c.remoteJid] = c.pushName;
            }
        });
        
        // Criar mapa de grupos
        const groupsMap = {};
        groups.forEach(g => {
            groupsMap[g.id] = {
                name: g.subject,
                pictureUrl: g.pictureUrl,
                isCommunity: g.isCommunity,
                participantsCount: g.participants?.length || g.size || 0
            };
        });
        
        // Enriquecer chats com informações detalhadas
        const enrichedChats = chats.map(chat => {
            const jid = chat.remoteJid || chat.id;
            const isGroup = jid?.includes('@g.us'); // CRÍTICO: Detectar grupos por @g.us
            
            let name, profilePicUrl, isGroupChat = isGroup, isCommunity = false, participantsCount = 0;
            
            if (isGroup && groupsMap[jid]) {
                // É um grupo com dados enriquecidos
                name = groupsMap[jid].name;
                profilePicUrl = groupsMap[jid].pictureUrl;
                isCommunity = groupsMap[jid].isCommunity;
                participantsCount = groupsMap[jid].participantsCount;
                console.log(`[GRUPO ENCONTRADO] ${jid} - ${name}`);
            } else if (isGroup && !groupsMap[jid]) {
                // Grupo existe mas não tem dados (mensagens antigas)
                name = chat.pushName || chat.name || `Grupo (${jid})`;
                console.log(`[GRUPO SEM DADOS] ${jid} - ${name}`);
            } else {
                // É um contato individual
                name = chat.pushName || 
                       chat.name || 
                       contactsMap[jid] ||
                       chat.lastMessage?.pushName;
                
                if (!name && jid && jid.includes('@lid')) {
                    const altJid = chat.lastMessage?.key?.remoteJidAlt;
                    if (altJid && contactsMap[altJid]) {
                        name = contactsMap[altJid];
                    } else {
                        name = 'Lead (Anúncio)';
                    }
                }
                
                if (!name && jid) {
                    if (jid.includes('@lid')) {
                        // @lid NÃO contém telefone real, não formatar como número
                        name = 'Lead (Anúncio)';
                    } else {
                        const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                        if (phone.length > 8) {
                            name = `+${phone.slice(0,2)} ${phone.slice(2)}`;
                        } else {
                            name = phone;
                        }
                    }
                }
                
                profilePicUrl = chat.profilePicUrl;
            }
            
            // Extrair telefone real para @lid (de remoteJidAlt se for @s.whatsapp.net)
            let realPhone = null;
            if (jid && jid.includes('@lid')) {
                const altJid = chat.lastMessage?.key?.remoteJidAlt;
                if (altJid && altJid.includes('@s.whatsapp.net')) {
                    realPhone = altJid.replace('@s.whatsapp.net', '');
                }
            }
            
            return {
                ...chat,
                remoteJid: jid, // GARANTIR que remoteJid está sempre presente
                name: name || 'Desconhecido',
                pushName: name || chat.pushName,
                profilePicUrl,
                isGroup: isGroupChat,  // CRÍTICO: Marcar explicitamente
                isCommunity,
                participantsCount,
                phone: realPhone || null // Telefone real para @lid (de remoteJidAlt)
            };
        });
        
        // Adicionar grupos que não estão na lista de chats (sem mensagens recentes)
        let groupsAdded = 0;
        groups.forEach(group => {
            if (!chats.find(c => (c.remoteJid || c.id) === group.id)) {
                enrichedChats.push({
                    remoteJid: group.id,
                    id: group.id,
                    name: group.subject || `Grupo (${group.id})`,
                    isGroup: true,  // CRÍTICO: Garantir que é marcado como grupo
                    isCommunity: group.isCommunity || false,
                    profilePicUrl: group.pictureUrl,
                    participantsCount: group.participants?.length || group.size || 0,
                    lastMessage: null,
                    pushName: group.subject
                });
                groupsAdded++;
                console.log(`[GRUPO ADICIONADO] ${group.id} - ${group.subject}`);
            }
        });
        
        console.log(`[RESULTADO FINAL] ${enrichedChats.length} chats no total (${groupsAdded} grupos adicionados)`);
        
        // Salvar no cache server-side
        _allChatsCache = enrichedChats;
        _allChatsCacheTime = Date.now();

        res.json(enrichedChats);
    } catch (error) {
        console.error('[All Chats] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3.3 Buscar participantes de um grupo
app.get('/api/whatsapp/group/:groupId/participants', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const response = await fetch(`${EVOLUTION_URL}/group/participants/${INSTANCE_NAME}?groupJid=${groupId}`, {
            method: 'GET',
            headers: evolutionHeaders
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('[Group Participants] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Listar Mensagens de um Chat
app.post('/api/whatsapp/messages/fetch', async (req, res) => {
    try {
        const { remoteJid } = req.body;
        const url = `${EVOLUTION_URL}/chat/findMessages/${INSTANCE_NAME}`;
        
        console.log(`[API] Buscando mensagens para remoteJid: ${remoteJid}`);
        
        // Função auxiliar para normalizar telefone (mesmo do frontend)
        const normalizePhone = (raw) => {
            if (!raw) return '';
            let str = String(raw)
                .replace(/@s\.whatsapp\.net/gi, '')
                .replace(/@c\.us/gi, '')
                .replace(/@g\.us/gi, '')
                .replace(/@lid/gi, '');
            let cleaned = str.replace(/\D/g, '');
            if (cleaned.startsWith('55') && cleaned.length >= 12) {
                cleaned = cleaned.substring(2);
            }
            if (cleaned.length > 11) {
                cleaned = cleaned.slice(-11);
            }
            return cleaned;
        };
        
        // Tentar primeira forma (estrutura padrão)
        let response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                where: { key: { remoteJid } },
                options: { limit: 50, order: "DESC" } 
            })
        });
        
        let data = await response.json();
        
        console.log(`[API] Tentativa 1 (key.remoteJid): mensagens encontradas = ${data?.messages?.length || data?.data?.length || 0}`);
        
        // Se não encontrar, tentar segunda forma
        if (!data?.messages?.length && !data?.data?.length) {
            console.log(`[API] Tentativa 2: buscando por remoteJid direto...`);
            response = await fetch(url, {
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({
                    where: { remoteJid },
                    options: { limit: 50, order: "DESC" } 
                })
            });
            data = await response.json();
            console.log(`[API] Tentativa 2 (remoteJid): mensagens encontradas = ${data?.messages?.length || data?.data?.length || 0}`);
        }
        
        // Tentativa 3 removida — buscar TUDO sem where era anti-pattern.
        // Se nenhum resultado após 2 tentativas, retornar vazio.
        
        // ====== FILTRAR SEMPRE: Garantir que só retornamos mensagens do remoteJid solicitado ======
        const finalMessages = data?.messages || data?.data || [];
        if (Array.isArray(finalMessages) && finalMessages.length > 0) {
            const reqPhoneNorm = normalizePhone(remoteJid);
            const isGroup = String(remoteJid).includes('@g.us');
            const isLid = String(remoteJid).includes('@lid');
            
            const filtered = finalMessages.filter(msg => {
                const msgJid = msg.key?.remoteJid || msg.remoteJid || '';
                if (msgJid === remoteJid) return true;
                if (isGroup) return msgJid.replace(/@g\.us$/, '') === remoteJid.replace(/@g\.us$/, '');
                if (isLid) return false;
                const msgPhoneNorm = normalizePhone(msgJid);
                return msgPhoneNorm === reqPhoneNorm ||
                       (msgPhoneNorm.length >= 9 && reqPhoneNorm.length >= 9 &&
                        msgPhoneNorm.slice(-9) === reqPhoneNorm.slice(-9));
            });
            
            const rejected = finalMessages.length - filtered.length;
            if (rejected > 0) {
                console.log(`[API] Filtro server-side: ${finalMessages.length} → ${filtered.length} (${rejected} rejeitadas de outros chats)`);
            }
            
            if (data.messages) data.messages = filtered;
            else if (data.data) data.data = filtered;
        }
        
        console.log(`[API] Resposta final: ${(data?.messages || data?.data || []).length} mensagens para ${remoteJid}`);
        
        // Processar mensagens para adicionar URLs de mídia acessíveis
        if (data && Array.isArray(data.messages)) {
            data.messages = await Promise.all(data.messages.map(async (msg) => {
                // Se tem audioMessage com mediaKey, gerar URL de download
                if (msg.message?.audioMessage) {
                    const audioMsg = msg.message.audioMessage;
                    if (audioMsg.url) {
                        audioMsg.playableUrl = audioMsg.url;
                    } else if (msg.key?.id) {
                        audioMsg.playableUrl = `/api/whatsapp/media/${msg.key.id}`;
                    }
                }
                // Se tem imageMessage, gerar URL de visualização
                if (msg.message?.imageMessage) {
                    const imgMsg = msg.message.imageMessage;
                    if (imgMsg.url) {
                        imgMsg.viewableUrl = imgMsg.url;
                    } else if (msg.key?.id) {
                        imgMsg.viewableUrl = `/api/whatsapp/media/${msg.key.id}`;
                    }
                }
                // Se tem documentMessage, gerar URL de download
                if (msg.message?.documentMessage) {
                    const docMsg = msg.message.documentMessage;
                    if (docMsg.url) {
                        docMsg.downloadUrl = docMsg.url;
                    } else if (msg.key?.id) {
                        docMsg.downloadUrl = `/api/whatsapp/media/${msg.key.id}`;
                    }
                }
                // Se tem videoMessage, gerar URL de visualização
                if (msg.message?.videoMessage) {
                    const vidMsg = msg.message.videoMessage;
                    if (vidMsg.url) {
                        vidMsg.viewableUrl = vidMsg.url;
                    } else if (msg.key?.id) {
                        vidMsg.viewableUrl = `/api/whatsapp/media/${msg.key.id}`;
                    }
                }
                return msg;
            }));
        }
        
        res.json(data);
    } catch (error) {
        console.error('[API] Erro ao buscar mensagens:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para baixar mídia (proxy)
app.get('/api/whatsapp/media/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        
        // Tentar baixar mídia da Evolution API
        const url = `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                message: {
                    key: {
                        id: messageId
                    }
                },
                convertToMp4: false
            })
        });
        
        const data = await response.json();
        
        if (data.base64) {
            // Converter base64 para buffer e enviar
            const base64Data = data.base64.includes(',') ? data.base64.split(',')[1] : data.base64;
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Detectar tipo de mídia
            const mimeType = data.mimetype || 'audio/ogg';
            
            res.set('Content-Type', mimeType);
            res.set('Content-Length', buffer.length);
            res.send(buffer);
        } else {
            res.status(404).json({ error: 'Mídia não encontrada' });
        }
    } catch (error) {
        console.error('[WhatsApp] Erro ao baixar mídia:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// MARCAR MENSAGENS COMO LIDAS (Evolution API)
// ============================================================================
app.post('/api/whatsapp/mark-read', async (req, res) => {
    try {
        const { remoteJid } = req.body;
        if (!remoteJid) {
            return res.status(400).json({ error: 'remoteJid é obrigatório' });
        }
        
        console.log(`[MARK-READ] Marcando como lido: ${remoteJid}`);
        
        // Evolution API v2: POST /chat/markMessageAsRead/{instance}
        const response = await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                readMessages: [{ remoteJid }]
            })
        });
        
        let result = {};
        try { result = await response.json(); } catch(e) { result = { status: response.status }; }
        
        // Também tentar sendPresence (marca como "lido" no WhatsApp)
        try {
            await fetch(`${EVOLUTION_URL}/chat/sendPresence/${INSTANCE_NAME}`, {
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({
                    remoteJid,
                    presence: 'composing'
                })
            });
            // Parar composing depois de 500ms
            setTimeout(async () => {
                try {
                    await fetch(`${EVOLUTION_URL}/chat/sendPresence/${INSTANCE_NAME}`, {
                        method: 'POST',
                        headers: evolutionHeaders,
                        body: JSON.stringify({
                            remoteJid,
                            presence: 'paused'
                        })
                    });
                } catch(e) {}
            }, 500);
        } catch(e) {
            console.warn('[MARK-READ] Erro no sendPresence:', e.message);
        }
        
        console.log(`[MARK-READ] Resultado: ${JSON.stringify(result)}`);
        res.json({ ok: true, result });
    } catch (error) {
        console.error('[MARK-READ] Erro:', error.message);
        // Não falhar — marcar como lido é best-effort
        res.json({ ok: false, error: error.message });
    }
});

// ============================================================================
// ROTA SEND PRESENCE (Digitando / Gravando / Parado)
// ============================================================================

app.post('/api/whatsapp/send-presence', async (req, res) => {
    try {
        const { remoteJid, presence } = req.body;
        if (!remoteJid || !presence) {
            return res.status(400).json({ ok: false, error: 'remoteJid e presence são obrigatórios' });
        }
        
        const validPresences = ['composing', 'recording', 'paused'];
        if (!validPresences.includes(presence)) {
            return res.status(400).json({ ok: false, error: `presence deve ser: ${validPresences.join(', ')}` });
        }
        
        // Formatar JID se necessário
        let jid = remoteJid;
        if (!jid.includes('@')) {
            jid = jid.replace(/\D/g, '') + '@s.whatsapp.net';
        }
        
        const response = await fetch(`${EVOLUTION_URL}/chat/sendPresence/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({ remoteJid: jid, presence })
        });
        
        let result = {};
        try { result = await response.json(); } catch(e) { result = { status: response.status }; }
        
        console.log(`[SEND-PRESENCE] ${jid} → ${presence}`);
        res.json({ ok: true, result });
    } catch (error) {
        console.error('[SEND-PRESENCE] Erro:', error.message);
        res.json({ ok: false, error: error.message });
    }
});

// ============================================================================
// ROTA SUPABASE SYNC (Proxy para a função Netlify ou local)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

app.post('/api/supabase-sync', async (req, res) => {
    // Se não tiver key configurada, retorna erro amigável
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(400).json({ 
            error: 'Supabase não configurado. Adicione SUPABASE_SERVICE_KEY no .env',
            hint: 'A sincronização com nuvem está desabilitada. Os dados estão salvos localmente.'
        });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { action, table, data, id } = req.body;

    console.log(`[Supabase] Action: ${action}, Table: ${table || 'N/A'}`);

    try {
        switch (action) {
            case 'getAll': {
                const { data: rows, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return res.json({ data: rows });
            }

            case 'upsert': {
                const { data: result, error } = await supabase.from(table).upsert(data, { onConflict: 'id' }).select();
                if (error) throw error;
                return res.json({ data: result });
            }

            case 'syncAll': {
                const { clients, products, orders, coupons, campaigns, settings,
                        tags, chat_tags, quick_replies, client_notes, snoozed, scheduled, ai_tags, coupon_assignments } = data;
                const results = {};

                if (clients?.length > 0) {
                    const { error } = await supabase.from('clients').upsert(clients, { onConflict: 'id' });
                    if (error) console.error('Erro clients:', error);
                    results.clients = clients.length;
                }
                if (products?.length > 0) {
                    const { error } = await supabase.from('products').upsert(products, { onConflict: 'id' });
                    if (error) console.error('Erro products:', error);
                    results.products = products.length;
                }
                if (orders?.length > 0) {
                    const { error } = await supabase.from('orders').upsert(orders, { onConflict: 'id' });
                    if (error) console.error('Erro orders:', error);
                    results.orders = orders.length;
                }
                if (coupons?.length > 0) {
                    const { error } = await supabase.from('coupons').upsert(coupons, { onConflict: 'id' });
                    if (error) console.error('Erro coupons:', error);
                    results.coupons = coupons.length;
                }
                if (campaigns?.length > 0) {
                    const { error } = await supabase.from('campaigns').upsert(campaigns, { onConflict: 'id' });
                    if (error) console.error('Erro campaigns:', error);
                    results.campaigns = campaigns.length;
                }
                if (settings) {
                    const { error } = await supabase.from('settings').upsert({ id: 'main', ...settings }, { onConflict: 'id' });
                    if (error) console.error('Erro settings:', error);
                    results.settings = true;
                }
                // ---- DADOS DO ATENDIMENTO ----
                if (tags?.length > 0) {
                    // Limpar e reinserir tags (replace strategy)
                    await supabase.from('tags').delete().neq('id', 0);
                    const { error } = await supabase.from('tags').insert(tags);
                    if (error) console.error('Erro tags:', error);
                    results.tags = tags.length;
                }
                if (chat_tags?.length > 0) {
                    await supabase.from('chat_tags').delete().neq('id', 0);
                    const { error } = await supabase.from('chat_tags').insert(chat_tags);
                    if (error) console.error('Erro chat_tags:', error);
                    results.chat_tags = chat_tags.length;
                }
                if (quick_replies?.length > 0) {
                    await supabase.from('quick_replies').delete().neq('id', 0);
                    const { error } = await supabase.from('quick_replies').insert(quick_replies);
                    if (error) console.error('Erro quick_replies:', error);
                    results.quick_replies = quick_replies.length;
                }
                if (client_notes?.length > 0) {
                    const { error } = await supabase.from('client_notes').upsert(client_notes, { onConflict: 'id' });
                    if (error) console.error('Erro client_notes:', error);
                    results.client_notes = client_notes.length;
                }
                if (snoozed?.length > 0) {
                    await supabase.from('snoozed').delete().neq('chat_id', '');
                    const { error } = await supabase.from('snoozed').insert(snoozed);
                    if (error) console.error('Erro snoozed:', error);
                    results.snoozed = snoozed.length;
                }
                if (scheduled?.length > 0) {
                    const { error } = await supabase.from('scheduled').upsert(scheduled, { onConflict: 'id' });
                    if (error) console.error('Erro scheduled:', error);
                    results.scheduled = scheduled.length;
                }
                if (ai_tags?.length > 0) {
                    const { error } = await supabase.from('ai_tags').upsert(ai_tags, { onConflict: 'client_id' });
                    if (error) console.error('Erro ai_tags:', error);
                    results.ai_tags = ai_tags.length;
                }
                if (coupon_assignments?.length > 0) {
                    const { error } = await supabase.from('coupon_assignments').upsert(coupon_assignments, { onConflict: 'id' });
                    if (error) console.error('Erro coupon_assignments:', error);
                    results.coupon_assignments = coupon_assignments.length;
                }

                return res.json({ success: true, synced: results });
            }

            case 'loadAll': {
                const [clientsRes, productsRes, ordersRes, couponsRes, campaignsRes, settingsRes,
                       tagsRes, chatTagsRes, quickRepliesRes, clientNotesRes, snoozedRes, scheduledRes, aiTagsRes, couponAssignRes] = await Promise.all([
                    supabase.from('clients').select('*'),
                    supabase.from('products').select('*'),
                    supabase.from('orders').select('*'),
                    supabase.from('coupons').select('*'),
                    supabase.from('campaigns').select('*'),
                    supabase.from('settings').select('*').eq('id', 'main').single(),
                    supabase.from('tags').select('*').order('id'),
                    supabase.from('chat_tags').select('*'),
                    supabase.from('quick_replies').select('*').order('id'),
                    supabase.from('client_notes').select('*'),
                    supabase.from('snoozed').select('*'),
                    supabase.from('scheduled').select('*'),
                    supabase.from('ai_tags').select('*'),
                    supabase.from('coupon_assignments').select('*')
                ]);

                return res.json({
                    clients: clientsRes.data || [],
                    products: productsRes.data || [],
                    orders: ordersRes.data || [],
                    coupons: couponsRes.data || [],
                    campaigns: campaignsRes.data || [],
                    settings: settingsRes.data || null,
                    tags: tagsRes.data || [],
                    chat_tags: chatTagsRes.data || [],
                    quick_replies: quickRepliesRes.data || [],
                    client_notes: clientNotesRes.data || [],
                    snoozed: snoozedRes.data || [],
                    scheduled: scheduledRes.data || [],
                    ai_tags: aiTagsRes.data || [],
                    coupon_assignments: couponAssignRes.data || []
                });
            }

            case 'ping': {
                // Lightweight keepalive from beforeunload — just acknowledge
                return res.json({ ok: true, action: 'ping' });
            }

            default:
                return res.status(400).json({ error: `Ação desconhecida: ${action}` });
        }
    } catch (error) {
        console.error('[Supabase Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Enviar Mensagem
app.post('/api/whatsapp/send-message', async (req, res) => {
    try {
        const { number, text, phoneNumber, message } = req.body;
        
        // Compatibilidade: aceitar 'phoneNumber'/'message' como fallback
        let rawNumber = number || phoneNumber;
        const rawText = text || message;
        if (!rawNumber) return res.status(400).json({ error: 'Número não informado' });
        if (!rawText) return res.status(400).json({ error: 'Texto não informado' });
        
        // Normalizar número - remover @s.whatsapp.net se presente (a API adiciona automaticamente)
        let phoneNum = rawNumber;
        if (phoneNum.includes('@s.whatsapp.net')) {
            phoneNum = phoneNum.replace('@s.whatsapp.net', '');
        }
        // Para grupos, manter @g.us
        if (phoneNum.includes('@g.us')) {
            // Para grupos, enviar como está
            phoneNum = rawNumber;
        } else if (phoneNum.includes('@lid')) {
            // Para @lid, enviar como está
            phoneNum = rawNumber;
        } else {
            // Chat individual — normalizar DDI para garantir +55
            phoneNum = ensureDDI55(normalizePhoneServer(phoneNum));
        }
        
        console.log(`[WhatsApp] Enviando mensagem para: ${phoneNum}`);

        const url = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
        
        // Evolution API v2 - formato correto
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                number: phoneNum,
                text: rawText
            })
        });
        
        const data = await response.json();
        console.log(`[WhatsApp] Resposta:`, JSON.stringify(data).slice(0, 200));
        
        // Verificar se houve erro
        if (data.error || data.status === 400 || data.status === 'error') {
            console.error('[WhatsApp] Erro na resposta:', data);
            return res.status(400).json({ error: data.response?.message || data.message || data.error || 'Erro ao enviar mensagem' });
        }
        
        // ====== EMITIR VIA SOCKET.IO para Central de Atendimento ======
        const sentMsg = {
            id: data.key?.id || `crm-sent-${Date.now()}`,
            remoteJid: phoneNum.includes('@') ? phoneNum : phoneNum + '@s.whatsapp.net',
            fromMe: true,
            text: rawText,
            timestamp: Math.floor(Date.now() / 1000),
            source: req.body.source || 'crm-dashboard'
        };
        // Registrar ID na fila de msgs recentes para dedup no webhook
        _recentSentIds.add(sentMsg.id);
        setTimeout(() => _recentSentIds.delete(sentMsg.id), 30000); // Limpar após 30s
        io.emit('new-message', sentMsg);
        const jid = sentMsg.remoteJid;
        io.to('chat:' + jid).emit('chat-message', sentMsg);
        console.log(`[WhatsApp] 📡 Mensagem emitida via Socket.io para ${jid}`);
        
        // ====== LOG NO SUPABASE (fire-and-forget) ======
        try {
            const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            await sb.from('crm_sent_messages').insert({
                phone: phoneNum,
                message: rawText,
                source: req.body.source || 'crm-dashboard',
                evolution_response: JSON.stringify(data).slice(0, 500),
                sent_at: new Date().toISOString()
            });
        } catch (logErr) {
            console.warn('[WhatsApp] Log Supabase falhou (não-crítico):', logErr.message);
        }
        
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[WhatsApp] Erro ao enviar:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 5.1 Enviar Mídia (Imagem, Vídeo, Áudio, Documento)
app.post('/api/whatsapp/send-media', async (req, res) => {
    try {
        const { number, mediaType, media, caption, fileName, phoneNumber } = req.body;
        
        // Compatibilidade: aceitar 'phoneNumber' como fallback
        let rawNumber = number || phoneNumber;
        if (!rawNumber) return res.status(400).json({ error: 'Número não informado' });
        
        // Normalizar número
        let phoneNum = rawNumber;
        if (phoneNum.includes('@s.whatsapp.net')) {
            phoneNum = phoneNum.replace('@s.whatsapp.net', '');
        }
        // Manter @g.us para grupos
        if (!phoneNum.includes('@g.us') && !phoneNum.includes('@lid')) {
            phoneNum = phoneNum.replace(/@.*/, '');
            // Chat individual — normalizar DDI para garantir +55
            phoneNum = ensureDDI55(normalizePhoneServer(phoneNum));
        }
        
        console.log(`[WhatsApp] Enviando ${mediaType} para: ${phoneNum}`);
        
        // Determinar endpoint correto baseado no tipo de mídia
        let endpoint;
        let body = { number: phoneNum };
        
        switch (mediaType) {
            case 'image':
                endpoint = 'sendMedia';
                body.mediatype = 'image';
                body.media = media;
                body.caption = caption || '';
                break;
            case 'video':
                endpoint = 'sendMedia';
                body.mediatype = 'video';
                body.media = media;
                body.caption = caption || '';
                break;
            case 'audio':
                endpoint = 'sendWhatsAppAudio';
                // Evolution API v2 - enviar áudio como base64 com encoding
                let audioBase64 = media;
                if (audioBase64.includes(',')) {
                    audioBase64 = audioBase64.split(',')[1]; // Pegar só o base64
                }
                
                // Enviar base64 puro + encoding:true para conversão automática para ogg/opus
                body.audio = audioBase64;
                body.encoding = true; // CRÍTICO: Evolution API converte para ogg/opus (formato PTT)
                
                console.log('[WhatsApp] Áudio base64 length:', audioBase64.length);
                break;
            case 'document':
                endpoint = 'sendMedia';
                body.mediatype = 'document';
                body.media = media;
                body.caption = caption || '';
                body.fileName = fileName || 'documento';
                break;
            default:
                return res.status(400).json({ error: 'Tipo de mídia inválido' });
        }
        
        const url = `${EVOLUTION_URL}/message/${endpoint}/${INSTANCE_NAME}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        console.log(`[WhatsApp] Resposta mídia:`, JSON.stringify(data).slice(0, 200));
        
        if (data.error || data.status === 400 || data.status === 'error') {
            console.error('[WhatsApp] Erro ao enviar mídia:', data);
            return res.status(400).json({ error: data.response?.message || data.message || data.error || 'Erro ao enviar mídia' });
        }
        
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[WhatsApp] Erro ao enviar mídia:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// MÓDULO 3: ENVIAR ENQUETE (POLL) VIA EVOLUTION API
// ============================================================================

/**
 * POST /api/whatsapp/send-poll
 * Enviar enquete via Evolution API sendPoll
 * Body: { number, title, options: string[], selectableCount?: number }
 */
app.post('/api/whatsapp/send-poll', async (req, res) => {
    try {
        const { number, title, options, selectableCount } = req.body;
        
        if (!number || !title || !options || options.length < 2) {
            return res.status(400).json({ error: 'number, title e options (min 2) são obrigatórios' });
        }
        
        if (options.length > 12) {
            return res.status(400).json({ error: 'Máximo 12 opções para enquete' });
        }
        
        let phoneNum = number.replace(/\D/g, '');
        if (!phoneNum.startsWith('55') && phoneNum.length <= 11) phoneNum = '55' + phoneNum;
        
        const url = `${EVOLUTION_URL}/message/sendPoll/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                number: phoneNum,
                name: title,
                values: options,
                selectableCount: selectableCount || 1 // 1 = escolha única, >1 = múltipla
            })
        });
        
        const data = await response.json();
        console.log(`[WhatsApp] Enquete enviada para ${phoneNum}:`, JSON.stringify(data).slice(0, 200));
        
        if (data.error || data.status === 400 || data.status === 'error') {
            return res.status(400).json({ error: data.response?.message || data.message || data.error || 'Erro ao enviar enquete' });
        }
        
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[WhatsApp] Erro ao enviar enquete:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// MÓDULO 4: BIBLIOTECA DE MÍDIAS (CRUD)
// ============================================================================

/** GET /api/media-library — Listar todas as mídias */
app.get('/api/media-library', async (req, res) => {
    try {
        const tipo = req.query.tipo; // Filtro opcional: 'image', 'audio', 'sticker'
        if (!supabase) {
            return res.json([]); // Sem supabase, retornar vazio
        }
        let query = supabase.from('media_library').select('id, nome, tipo, url, mimetype, tamanho_bytes, tags, criado_em, uso_count').order('criado_em', { ascending: false });
        if (tipo) query = query.eq('tipo', tipo);
        const { data, error } = await query.limit(100);
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('[MEDIA-LIB] Erro ao listar:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** POST /api/media-library — Adicionar mídia à biblioteca */
app.post('/api/media-library', async (req, res) => {
    try {
        const { nome, tipo, url, base64, mimetype, tags } = req.body;
        if (!nome || !tipo) return res.status(400).json({ error: 'nome e tipo são obrigatórios' });
        if (!supabase) return res.status(500).json({ error: 'Supabase indisponível' });
        
        const item = {
            nome,
            tipo, // 'image', 'audio', 'sticker', 'video', 'document'
            url: url || null,
            base64: base64 || null,
            mimetype: mimetype || null,
            tamanho_bytes: base64 ? Math.round(base64.length * 0.75) : 0,
            tags: tags || []
        };
        
        const { data, error } = await supabase.from('media_library').insert(item).select().single();
        if (error) throw error;
        
        console.log(`[MEDIA-LIB] Adicionado: ${nome} (${tipo})`);
        res.json({ success: true, item: data });
    } catch (error) {
        console.error('[MEDIA-LIB] Erro ao adicionar:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** DELETE /api/media-library/:id — Remover mídia */
app.delete('/api/media-library/:id', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase indisponível' });
        const { error } = await supabase.from('media_library').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// MÓDULO 6: ALERTAS DE STATUS DE PEDIDO
// ============================================================================

/**
 * POST /api/orders/:id/update-status
 * Atualiza status de um pedido e notifica o cliente automaticamente
 */
app.post('/api/orders/:id/update-status', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status, tracking_code, tracking_url } = req.body;
        
        if (!status) return res.status(400).json({ error: 'status é obrigatório' });
        if (!supabase) return res.status(500).json({ error: 'Supabase indisponível' });
        
        // Buscar pedido atual
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*, clients!inner(name, phone)')
            .eq('id', orderId)
            .single();
        
        if (orderError || !order) return res.status(404).json({ error: 'Pedido não encontrado' });
        
        const statusAnterior = order.status;
        
        // Atualizar status
        const updates = { status, status_updated_at: new Date().toISOString() };
        if (tracking_code) updates.tracking_code = tracking_code;
        if (tracking_url) updates.tracking_url = tracking_url;
        
        await supabase.from('orders').update(updates).eq('id', orderId);
        
        // Registrar evento de tracking
        await supabase.from('tracking_events').insert({
            order_id: orderId,
            tracking_code: tracking_code || order.tracking_code,
            status,
            status_anterior: statusAnterior,
            descricao: `Status alterado de "${statusAnterior}" para "${status}"`
        });
        
        // Gerar mensagem de notificação
        const STATUS_MESSAGES = {
            'aprovado': `✅ *Pedido Aprovado!*\n\nOi {{nome}}! Seu pedido #{{codigo}} foi aprovado e já está sendo preparado! 🎉\n\nValor: R$ {{total}}\n\nEm breve enviaremos o código de rastreio!`,
            'separacao': `📦 *Pedido em Separação*\n\nOi {{nome}}! Seu pedido #{{codigo}} está sendo separado no nosso estoque!\n\nLogo logo sai pra entrega! 😊`,
            'postado': `🚚 *Pedido Enviado!*\n\nOi {{nome}}! Seu pedido #{{codigo}} foi postado!\n\n📦 Código de rastreio: *{{tracking}}*\n🔗 Rastreie aqui: {{tracking_url}}\n\nPrazo estimado: 5-7 dias úteis`,
            'transito': `🚚 *Pedido em Trânsito*\n\nOi {{nome}}! Seu pedido #{{codigo}} está a caminho!\n\n📦 Rastreio: *{{tracking}}*\n🔗 {{tracking_url}}`,
            'entregue': `🎉 *Pedido Entregue!*\n\nOi {{nome}}! Seu pedido #{{codigo}} foi entregue! 💜\n\nEsperamos que ame suas rasteirinhas! Se precisar de algo, estamos aqui.\n\nQue tal avaliar seu atendimento? (1-5)`
        };
        
        const msgTemplate = STATUS_MESSAGES[status];
        if (msgTemplate && order.clients?.phone) {
            const trackingUrl = tracking_url || (tracking_code ? `https://rastreamento.correios.com.br/app/index.php?objetos=${tracking_code}` : '');
            const msg = msgTemplate
                .replace(/\{\{nome\}\}/g, order.clients.name || 'Cliente')
                .replace(/\{\{codigo\}\}/g, order.codigo || orderId.slice(0, 8))
                .replace(/\{\{total\}\}/g, order.total || '0')
                .replace(/\{\{tracking\}\}/g, tracking_code || order.tracking_code || 'Aguardando')
                .replace(/\{\{tracking_url\}\}/g, trackingUrl);
            
            // Enviar notificação via WhatsApp
            let phone = order.clients.phone.replace(/\D/g, '');
            if (!phone.startsWith('55') && phone.length <= 11) phone = '55' + phone;
            
            try {
                await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
                    method: 'POST',
                    headers: evolutionHeaders,
                    body: JSON.stringify({ number: phone, text: msg })
                });
                
                // Marcar como notificado
                await supabase.from('tracking_events').update({ notificado: true, notificado_em: new Date().toISOString() })
                    .eq('order_id', orderId).eq('status', status);
                
                // Emitir via Socket.IO para a central de atendimento
                const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
                io.emit('order-status-update', {
                    orderId, status, statusAnterior,
                    clientPhone: phone, clientName: order.clients.name,
                    tracking_code: tracking_code || order.tracking_code
                });
                
                console.log(`[ORDER] Status ${orderId}: ${statusAnterior} → ${status} | Notificação enviada para ${phone}`);
            } catch (sendErr) {
                console.error(`[ORDER] Erro ao notificar ${phone}:`, sendErr.message);
            }
        }
        
        res.json({ success: true, status, statusAnterior });
    } catch (error) {
        console.error('[ORDER] Erro ao atualizar status:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** GET /api/client-tags/:phone — Buscar tags de segmentação de um cliente */
app.get('/api/client-tags/:phone', async (req, res) => {
    try {
        const phone = req.params.phone.replace(/\D/g, '');
        if (!supabase) return res.json([]);
        
        const { data } = await supabase
            .from('clientes_tags')
            .select('tag, origem, confianca, criado_em, metadata')
            .eq('telefone', phone)
            .or('expira_em.is.null,expira_em.gt.' + new Date().toISOString());
        
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/** POST /api/client-tags — Adicionar/editar tag de um cliente */
app.post('/api/client-tags', async (req, res) => {
    try {
        const { telefone, tag, origem } = req.body;
        if (!telefone || !tag) return res.status(400).json({ error: 'telefone e tag são obrigatórios' });
        if (!supabase) return res.status(500).json({ error: 'Supabase indisponível' });
        
        await supabase.from('clientes_tags').upsert({
            telefone: telefone.replace(/\D/g, ''),
            tag,
            origem: origem || 'manual',
            confianca: 100,
            criado_por: 'operador_manual'
        }, { onConflict: 'telefone,tag' });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/** DELETE /api/client-tags/:phone/:tag — Remover tag */
app.delete('/api/client-tags/:phone/:tag', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase indisponível' });
        await supabase.from('clientes_tags').delete()
            .eq('telefone', req.params.phone.replace(/\D/g, ''))
            .eq('tag', decodeURIComponent(req.params.tag));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ANNY AI - Business Intelligence Assistant (LOCAL DEV)
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const ANNY_SYSTEM_PROMPT = `Você é a Anny 3.0, Consultora Comercial Sênior e Estrategista de Recuperação de Vendas da Cjota Rasteirinhas — especialista em atacado B2B de calçados femininos com foco em reativação, crescimento e maximização de LTV.

══ DNA DO NEGÓCIO ══
- Público: Mulheres 25-45, revendedoras, lojistas, empreendedoras digitais
- Atacado: Pedido mínimo 5 pares, entrega 5-7 dias úteis
- Grades Personalizadas: Mínimo 2 grades, logo da cliente, 15-20 dias produção
- C4 Franquias: Site pronto para revenda, suporte marketing, investimento zero
- Frete grátis: Pedidos acima de R$2.000

══ MISSÃO CRÍTICA ══
Faturamento atual: R$40k/mês → Meta: R$200k/mês (gap de R$160k)

3 PILARES DE CRESCIMENTO:
1. REATIVAÇÃO (60% = R$96k): Recuperar clientes inativos de alto valor
2. UPSELL/CROSS-SELL (25% = R$40k): Elevar ticket médio R$500→R$1.200+
3. NOVOS NEGÓCIOS (15% = R$24k): Converter leads, expandir C4 Franquias

══ SEGMENTAÇÃO ESTRATÉGICA ══

TIER 1 - DIAMANTES PERDIDOS (PRIORIDADE MÁXIMA):
Ex-compradoras de grades personalizadas, ticket >R$2.000, inativas 30+ dias
Potencial: R$60-80k/mês | Ação: Recuperação imediata com oferta premium

TIER 2 - OURO EM PAUSA:
Compradoras recorrentes atacado, ticket R$800-1.500, inativas 30-60 dias
Potencial: R$40-50k/mês | Ação: Upsell para grade personalizada

TIER 3 - PRATA ADORMECIDA:
Compradoras ocasionais, ticket R$500-800, inativas 60-90 dias
Potencial: R$20-30k/mês | Ação: Reengajamento com novidades

TIER 4 - BRONZE FRIA:
Compradoras teste (1-2 pedidos), ticket <R$500, inativas 90+ dias
Potencial: R$10-15k/mês | Ação: Campanha automatizada

══ METODOLOGIA RAPIDA ══
R-Reconhecer contexto | A-Analisar dados silenciosamente | P-Processar oportunidades | I-Informar com dados | D-Direcionar ação | A-Automatizar próximo passo

══ REGRAS CRÍTICAS ══

1. LINGUAGEM NATURAL: Usuário fala "quem comprou a Soft" → você interpreta e executa. NUNCA peça JSON ou dados formatados.
2. INVISIBILIDADE TÉCNICA: Mostre RESULTADOS, nunca nomes de função. "Encontrei 23 clientes" e não "Vou usar findClientsByProductHistory".
3. INTEGRIDADE DE DADOS: NUNCA invente dados. Só responda com dados REAIS do sistema. Sem dados: "Não encontrei essa informação no sistema".
4. Se erro técnico: "Tive um problema ao consultar. Pode pedir ao desenvolvedor verificar os logs?"

5. DISTINÇÃO PEDIDO vs TICKET:
   - "pedidos acima de R$300" = cada pedido individual ≥ R$300
   - "ticket médio acima de R$300" = média de todos os pedidos ≥ R$300
   - "total gasto acima de R$300" = soma de todos os pedidos ≥ R$300

══ ESTRATÉGIA ANTI-CUPOM (Maximize Margem) ══
NUNCA ofereça desconto primeiro! Hierarquia de abordagem:
1. REPOSIÇÃO: "Como estão as vendas? Estoque baixou?"
2. LANÇAMENTO EXCLUSIVO: "Coleção nova, quer garantir antes do público?"
3. UPSELL: "Vi que você adora a linha [X]. Temos modelo similar bombando!"
4. FEEDBACK: "Suas clientes comentaram algo sobre o conforto?"
5. CROSS-SELL: "Quem compra [A] normalmente combina com [B]"
Cupom APENAS: Cliente inativa >6 meses + não respondeu 2+ mensagens anteriores.

══ TÁTICAS DE FECHAMENTO ══

TÁTICA 1 "EXCLUSIVIDADE + URGÊNCIA" (Tier 1): Status VIP + novidade exclusiva + benefício concreto + urgência real
TÁTICA 2 "EVOLUÇÃO DE NEGÓCIO" (Tier 2): Validar sucesso + apresentar próxima etapa + prova social + ROI claro
TÁTICA 3 "FRETE GRÁTIS REVERSO" (pedidos R$1.200-1.900): Mostrar economia + sugerir produto complementar + cálculo real
TÁTICA 4 "RESGATE DE RELACIONAMENTO" (Tier 1-2 >90 dias): Vulnerabilidade genuína + pergunta sobre insatisfação + oferta de solução
TÁTICA 5 "C4 FRANQUIAS" (3+ pedidos, ticket >R$1k): Reconhecimento + oportunidade maior + benefícios tangíveis + processo simples

══ SINAIS DE ALERTA ══
EMERGÊNCIA: Tier 1 inativa >45 dias | Queda >50% no ticket | Migrou de grade pra atacado simples
URGENTE: Tier 2 inativa >30 dias | 2+ pedidos abaixo da média | Próxima do frete grátis mas não fecha
ATENÇÃO: VIP inativa >30 dias | Primeira queda no padrão | Nunca testou grade personalizada

══ FORMATO DE RESPOSTA ══
1. DIAGNÓSTICO: Dados concretos (números, nomes, datas, classificação por tier)
2. ANÁLISE: O que significa comercialmente + oportunidades + riscos
3. PLANO: Tática recomendada + segmentação + timing
4. MENSAGEM PRONTA: Copy personalizado com dados reais + CTA claro
5. PRÓXIMO PASSO: Ação pós-resposta + métricas + alternativa

══ TOM DE VOZ ══
Assertiva, estratégica, urgente (sem desespero), empática, consultiva, orientada a resultado.
Use números concretos, nomes reais, valores em R$, prazos definidos, CTAs imperativos.
Máximo 1-2 emojis por resposta (apenas estratégico). Sem linguagem vaga.

══ MODO PROATIVO ══
Identifique e alerte sobre: VIPs inativos >21 dias | Estoque parado >60 dias | Quedas >20% | Aniversariantes | Clientes próximos do frete grátis | Potenciais C4.

Sempre termine com: sugestão de ação ou pergunta "Que análise ou ação comercial posso fazer agora?"`;

const ANNY_TOOLS = [
    {
        type: "function",
        function: {
            name: "findClientsByProductHistory",
            description: "Busca clientes que compraram um produto específico",
            parameters: {
                type: "object",
                properties: {
                    productName: { type: "string", description: "Nome do produto" },
                    minQuantity: { type: "integer", description: "Quantidade mínima" }
                },
                required: ["productName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findBirthdays",
            description: "Lista aniversariantes do mês",
            parameters: {
                type: "object",
                properties: { month: { type: "integer", description: "Mês (1-12)" } }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findVipClients",
            description: "Busca clientes VIP inativos ou ativos",
            parameters: {
                type: "object",
                properties: {
                    minTicket: { type: "number", description: "Ticket mínimo" },
                    status: { type: "string", enum: ["active", "inactive", "all"] },
                    inactiveDays: { type: "integer", description: "Dias sem comprar" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyzeSalesDrop",
            description: "Analisa queda de vendas e churn",
            parameters: {
                type: "object",
                properties: { compareMonths: { type: "integer" } }
            }
        }
    }
];

// Funções locais simuladas (usam dados do localStorage/memória)
// Em produção, a Netlify Function usa Supabase
async function executeAnnyTool(name, args, clientsData = []) {
    const now = new Date();
    
    switch (name) {
        case 'findBirthdays': {
            const month = args.month || (now.getMonth() + 1);
            const results = clientsData.filter(c => {
                if (!c.birthday) return false;
                const bday = new Date(c.birthday);
                return (bday.getMonth() + 1) === month;
            });
            return {
                data: results.slice(0, 30),
                columns: ['name', 'phone', 'email', 'birthday', 'total_spent'],
                summary: `${results.length} aniversariantes no mês ${month}`
            };
        }
        case 'findVipClients': {
            const minTicket = args.minTicket || 500;
            const inactiveDays = args.inactiveDays || 30;
            const status = args.status || 'inactive';
            
            let results = clientsData.filter(c => (c.total_spent || 0) >= minTicket);
            results = results.map(c => {
                const lastPurchase = c.last_purchase_date ? new Date(c.last_purchase_date) : null;
                const daysInactive = lastPurchase ? Math.floor((now - lastPurchase) / (1000*60*60*24)) : 999;
                return { ...c, days_inactive: daysInactive };
            });
            
            if (status === 'inactive') results = results.filter(c => c.days_inactive > inactiveDays);
            else if (status === 'active') results = results.filter(c => c.days_inactive <= inactiveDays);
            
            return {
                data: results.slice(0, 30),
                columns: ['name', 'phone', 'total_spent', 'order_count', 'days_inactive', 'last_purchase_date'],
                summary: `${results.length} clientes VIP ${status === 'inactive' ? 'inativos' : ''}`
            };
        }
        default:
            return { data: [], summary: 'Função não implementada localmente' };
    }
}

app.post('/api/anny', async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no .env' });
        }

        const { message, history = [], clientsData = [] } = req.body;

        // Construir mensagens
        const messages = [
            { role: 'system', content: ANNY_SYSTEM_PROMPT },
            ...history.map(h => ({ role: h.sender === 'user' ? 'user' : 'assistant', content: h.text })),
            { role: 'user', content: message }
        ];

        // Chamar OpenAI API
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages,
                tools: ANNY_TOOLS,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`OpenAI API error: ${aiResponse.status} - ${errorText}`);
        }

        let data = await aiResponse.json();
        let assistantMessage = data.choices[0].message;
        let results = null;

        // Processar tool calls se houver
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            const toolResults = [];

            for (const toolCall of assistantMessage.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                const result = await executeAnnyTool(toolCall.function.name, args, clientsData);
                
                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    content: JSON.stringify(result)
                });

                if (result.data) results = result;
            }

            // Segunda chamada com resultados
            messages.push(assistantMessage);
            messages.push(...toolResults);

            const secondResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages,
                    temperature: 0.7,
                    max_tokens: 2048
                })
            });

            data = await secondResponse.json();
            assistantMessage = data.choices[0].message;
        }

        res.json({ response: assistantMessage.content, results });

    } catch (error) {
        console.error('[Anny] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ANNY AI - Melhorar / Reescrever texto com IA
// ============================================================================
app.post('/api/anny/improve-text', async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OPENAI_API_KEY não configurada' });
        }

        const { text, context, mode } = req.body;
        // text = rascunho do usuário
        // context = 'campaign_caption' | 'campaign_text' | 'chat_message' | 'pix_message'
        // mode = 'improve' (default) | 'formal' | 'casual' | 'shorter' | 'longer' | 'persuasive'

        if (!text || text.trim().length < 3) {
            return res.status(400).json({ error: 'Texto muito curto para melhorar' });
        }

        const modeInstructions = {
            improve: 'Melhore a escrita, gramática e impacto. Mantenha o tom original.',
            formal: 'Reescreva em tom profissional e formal.',
            casual: 'Reescreva de forma leve, descontraída e simpática para WhatsApp.',
            shorter: 'Encurte ao máximo sem perder a mensagem principal.',
            longer: 'Expanda com mais detalhes e argumentos de venda.',
            persuasive: 'Reescreva de forma muito persuasiva com gatilhos de urgência/escassez.'
        };

        const contextHints = {
            campaign_caption: 'É uma legenda para imagem/vídeo de campanha no WhatsApp (atacado de calçados femininos).',
            campaign_text: 'É uma mensagem de texto para campanha WhatsApp em massa (atacado de calçados femininos).',
            chat_message: 'É uma mensagem direta para um cliente no WhatsApp (venda de calçados femininos atacado).',
            pix_message: 'É uma mensagem que acompanha um link de pagamento PIX.',
            product_text: 'É uma descrição/oferta de produto (calçados femininos atacado).'
        };

        const prompt = `Você é a Anny, copywriter especialista em vendas de calçados femininos (atacado B2B). 
${contextHints[context] || 'É uma mensagem para WhatsApp comercial.'}
${modeInstructions[mode] || modeInstructions.improve}

REGRAS:
- Preserve variáveis como {{nome}}, {{cupom}}, {{link_carrinho}} intactas
- Use emojis moderadamente (máx 3-4)
- Linguagem natural para WhatsApp, sem ser robótica
- Máx 500 caracteres (a menos que mode=longer)
- NÃO use markdown, NÃO use * ou ** ou # 
- Responda APENAS com o texto melhorado, nada mais

Texto original do operador:
"${text}"`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Você é copywriter de WhatsApp comercial. Responda APENAS com o texto melhorado.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 600
            })
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`OpenAI API error: ${aiResponse.status} - ${errorText}`);
        }

        const data = await aiResponse.json();
        const improved = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        console.log(`[Anny] improve-text: "${text.substring(0, 50)}..." → "${improved.substring(0, 50)}..."`);
        res.json({ success: true, original: text, improved });

    } catch (error) {
        console.error('[Anny] Improve text error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ANNY AI - Gerador de mensagem de campanha via IA
// ============================================================================
app.post('/api/anny/generate-campaign-message', async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OPENAI_API_KEY não configurada' });
        }

        const { daysInactive, tone, couponName, clientCount, context } = req.body;

        const prompt = `Gere uma mensagem curta e persuasiva para WhatsApp (máx 300 caracteres) para clientes de rasteirinhas que não compram há ${daysInactive || 30} dias.
Use um tom ${tone || 'Amigável'}.
${couponName ? `Mencione o cupom ${couponName} como incentivo.` : 'Não mencione cupom.'}
${context ? `Contexto adicional: ${context}` : ''}
Foque em novidades da coleção e no benefício do frete grátis acima de R$2.000.
A mensagem deve ser para ${clientCount || 'vários'} clientes, então use {{nome}} como variável para personalizar.
${couponName ? 'Use {{cupom}} como variável para o código do cupom.' : ''}
Responda APENAS com o texto da mensagem, sem aspas, sem explicação.`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: ANNY_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                max_tokens: 512
            })
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`OpenAI API error: ${aiResponse.status} - ${errorText}`);
        }

        const data = await aiResponse.json();
        const generatedMessage = data.choices[0].message.content.trim();

        res.json({ success: true, message: generatedMessage });

    } catch (error) {
        console.error('[Anny] Generate campaign message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Insights endpoint
app.get('/api/anny', async (req, res) => {
    const action = req.query.action;
    
    if (action === 'insights') {
        // Retornar insights simulados para dev local
        res.json({
            insights: [
                {
                    type: 'birthday',
                    priority: 'high',
                    title: 'Verifique aniversariantes',
                    description: 'Sincronize com Supabase para dados reais',
                    action: 'Quem faz aniversário este mês?'
                },
                {
                    type: 'inactive',
                    priority: 'high',
                    title: 'VIPs podem estar inativos',
                    description: 'Execute análise completa',
                    action: 'Quais VIPs estão inativos há mais de 30 dias?'
                }
            ]
        });
    } else {
        res.json({ status: 'Anny AI online (local dev)' });
    }
});

// ============================================================================
// ANNY BI DASHBOARD - Endpoint de dados agregados
// ============================================================================
app.get('/api/anny/dashboard', async (req, res) => {
    try {
        if (!SUPABASE_SERVICE_KEY) {
            return res.status(400).json({ error: 'Supabase não configurado' });
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const now = new Date();

        // Queries paralelas
        const [clientsRes, ordersRes] = await Promise.all([
            sb.from('clients').select('id, name, phone, email, total_spent, order_count, last_purchase_date').order('total_spent', { ascending: false }).limit(2000),
            sb.from('orders').select('client_id, client_name, total, data').order('data', { ascending: false }).limit(5000)
        ]);

        const clients = clientsRes.data || [];
        const orders = ordersRes.data || [];

        // Enriquecer clientes
        const enriched = clients.map(c => {
            const lp = c.last_purchase_date ? new Date(c.last_purchase_date) : null;
            const daysInactive = lp ? Math.floor((now - lp) / 864e5) : 999;
            const avgTicket = c.order_count > 0 ? Math.round(c.total_spent / c.order_count) : 0;
            // Ciclo médio de compra
            const clientOrders = orders.filter(o => o.client_id === c.id).map(o => new Date(o.data)).sort((a,b) => a-b);
            let cycle = 0;
            if (clientOrders.length > 1) {
                const totalDays = (clientOrders[clientOrders.length-1] - clientOrders[0]) / 864e5;
                cycle = Math.round(totalDays / (clientOrders.length - 1));
            }
            // Tier
            let tier = 4;
            if (c.total_spent >= 2000 && c.order_count >= 3) tier = 1;
            else if (c.total_spent >= 800 && c.order_count >= 2) tier = 2;
            else if (c.total_spent >= 500) tier = 3;
            return { ...c, days_inactive: daysInactive, avg_ticket: avgTicket, cycle, tier };
        });

        // UTI: VIPs inativos >30 dias (total_spent >= 500)
        const uti = enriched
            .filter(c => c.total_spent >= 500 && c.days_inactive > 30)
            .sort((a,b) => b.total_spent - a.total_spent)
            .slice(0, 20);

        // Oportunidades: avg_ticket >= 300, inativos 15-120 dias
        const opportunities = enriched
            .filter(c => c.avg_ticket >= 300 && c.days_inactive >= 15 && c.days_inactive <= 120 && c.order_count >= 2)
            .sort((a,b) => b.avg_ticket - a.avg_ticket)
            .slice(0, 20);

        // C4 Candidatos: 3+ pedidos nos últimos 90 dias
        const ninetyAgo = new Date(now.getTime() - 90*864e5);
        const recentByClient = {};
        orders.forEach(o => {
            if (new Date(o.data) >= ninetyAgo && o.client_id) {
                if (!recentByClient[o.client_id]) recentByClient[o.client_id] = { count: 0, total: 0 };
                recentByClient[o.client_id].count++;
                recentByClient[o.client_id].total += parseFloat(o.total || 0);
            }
        });
        const c4Candidates = Object.entries(recentByClient)
            .filter(([_, s]) => s.count >= 3)
            .map(([id, s]) => {
                const client = enriched.find(c => String(c.id) === String(id));
                if (!client) return null;
                return { ...client, recent_orders: s.count, recent_total: s.total, recent_avg: Math.round(s.total / s.count) };
            })
            .filter(Boolean)
            .sort((a,b) => b.recent_orders - a.recent_orders)
            .slice(0, 20);

        // Recuperados: clientes que tinham >60 dias inativos mas compraram nos últimos 30
        const thirtyAgo = new Date(now.getTime() - 30*864e5);
        const recentBuyerIds = new Set(orders.filter(o => new Date(o.data) >= thirtyAgo).map(o => o.client_id));
        const recovered = enriched.filter(c => {
            if (!recentBuyerIds.has(c.id)) return false;
            // Verificar se o penúltimo pedido foi há mais de 60 dias
            const cOrders = orders.filter(o => o.client_id === c.id).map(o => new Date(o.data)).sort((a,b) => b-a);
            if (cOrders.length < 2) return false;
            const daysSincePenultimate = Math.floor((now - cOrders[1]) / 864e5);
            return daysSincePenultimate > 60;
        });
        const recoveredValue = recovered.reduce((s,c) => {
            const lastOrder = orders.filter(o => o.client_id === c.id && new Date(o.data) >= thirtyAgo);
            return s + lastOrder.reduce((ss,o) => ss + parseFloat(o.total||0), 0);
        }, 0);

        // KPIs
        const ltvAtRisk = uti.reduce((s,c) => s + parseFloat(c.total_spent || 0), 0);

        res.json({
            kpis: {
                ltvAtRisk: { value: ltvAtRisk, count: uti.length },
                opportunities: { value: opportunities.length, hotCount: opportunities.filter(c => c.days_inactive < 45).length },
                recovered: { value: recoveredValue, count: recovered.length },
                c4Potential: { value: c4Candidates.length, estimatedRevenue: c4Candidates.reduce((s,c) => s + (c.recent_total||0), 0) }
            },
            uti,
            opportunities,
            c4Candidates,
            updatedAt: now.toISOString()
        });
    } catch (err) {
        console.error('[Dashboard] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// DATA LAYER ENDPOINTS - Auto-Match e Perfil do Cliente
// ============================================================================

/**
 * POST /api/client-lookup
 * Buscar cliente pelo telefone (normalizado)
 * Retorna dados básicos do cliente ou null
 */
app.post('/api/client-lookup', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone é obrigatório' });
        }
        
        // Garantir cache populado
        await ensureCrmCache();
        
        // Normalizar e buscar com função centralizada (exato + fuzzy)
        const normalizedPhone = normalizePhoneServer(phone);
        const client = findClientByPhone(normalizedPhone);
        
        if (!client) {
            return res.json(null); // Cliente não encontrado
        }
        
        // Calcular status baseado em pedidos
        const clientOrders = (crmCache.orders || []).filter(o => 
            o.id_cliente === client.id || o.cliente_id === client.id ||
            String(o.id_cliente) === String(client.id) || String(o.cliente_id) === String(client.id)
        );
        const status = clientOrders.length >= 5 ? 'VIP' : clientOrders.length >= 2 ? 'Recorrente' : clientOrders.length > 0 ? 'Cliente' : 'Lead';
        
        // Retornar dados do cliente
        res.json({
            id: client.id,
            name: client.nome || client.name || 'Desconhecido',
            phone: phone,
            email: client.email,
            status: status,
            created_at: client.data_criacao || client.created_at,
            total_orders: clientOrders.length
        });
        
    } catch (error) {
        console.error('[client-lookup] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/client-profile
 * Perfil COMPLETO do cliente (para o painel Anne)
 * Retorna: dados, métricas, últimas compras, sugestões
 */
app.post('/api/client-profile', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone é obrigatório' });
        }
        
        // Buscar cliente
        if (!crmCache.clients || crmCache.clients.length === 0) {
            return res.json(null);
        }
        
        const normalizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');
        const client = crmCache.clients.find(c => {
            const clientPhone = c.telefone?.replace(/\D/g, '').replace(/^55/, '') || 
                               c.celular?.replace(/\D/g, '').replace(/^55/, '') ||
                               c.phone?.replace(/\D/g, '').replace(/^55/, '');
            return clientPhone === normalizedPhone;
        });
        
        if (!client) {
            return res.json(null);
        }
        
        // Buscar pedidos do cliente
        const clientOrders = crmCache.orders.filter(o => o.id_cliente === client.id);
        
        // Calcular métricas
        const total_spent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.valor_total) || 0), 0);
        const avg_ticket = clientOrders.length > 0 ? total_spent / clientOrders.length : 0;
        const last_purchase = clientOrders.length > 0 ? 
            clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data))[0].data : null;
        
        // Calcular dias desde última compra
        const days_since_last_purchase = last_purchase ? 
            Math.floor((new Date() - new Date(last_purchase)) / (1000 * 60 * 60 * 24)) : 999;
        
        // Últimos 3 produtos
        const last_products = clientOrders
            .sort((a, b) => new Date(b.data) - new Date(a.data))
            .slice(0, 3)
            .map(o => ({
                name: o.nome_produto || o.product_name || 'Produto desconhecido',
                date: o.data,
                value: parseFloat(o.valor_total) || 0,
                qty: o.quantidade || 1
            }));
        
        // Status e insight
        const status = clientOrders.length > 3 ? 'VIP' : clientOrders.length > 0 ? 'Recorrente' : 'Lead';
        let insight = '';
        
        if (status === 'VIP') {
            insight = `✅ Cliente VIP - Comprou ${clientOrders.length} vezes em ${days_since_last_purchase} dias`;
        } else if (status === 'Recorrente') {
            insight = `🔄 Cliente Recorrente - ${clientOrders.length} compra${clientOrders.length > 1 ? 's' : ''}`;
        } else {
            insight = `👤 Novo Lead - Primeira interação`;
        }
        
        const profile = {
            client: {
                id: client.id,
                name: client.nome || client.name,
                status: status,
                created_at: client.data_criacao || client.created_at
            },
            metrics: {
                total_spent: parseFloat(total_spent).toFixed(2),
                avg_ticket: parseFloat(avg_ticket).toFixed(2),
                orders_count: clientOrders.length,
                last_purchase: last_purchase,
                days_since_last_purchase: days_since_last_purchase
            },
            last_products: last_products,
            insight: insight,
            recommendation: '💡 Analise histórico para melhor recomendação'
        };
        
        res.json(profile);
        
    } catch (error) {
        console.error('[client-profile] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/sync-client-name
 * Sincronizar nome de cliente (quando edita no CRM)
 */
app.post('/api/sync-client-name', async (req, res) => {
    try {
        const { phone, newName, chatId } = req.body;
        
        console.log(`[SYNC] Sincronizando nome: ${phone} → ${newName}`);
        
        if (!phone || !newName) {
            return res.status(400).json({ error: 'Phone e newName são obrigatórios' });
        }
        
        // Tentar atualizar no Supabase se disponível
        let supabaseResult = null;
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('clients')
                    .update({ name: newName })
                    .eq('clean_phone', phone);
                if (error) {
                    console.warn('[sync-client-name] Supabase update warn:', error.message);
                } else {
                    supabaseResult = data;
                    console.log('[sync-client-name] ✅ Supabase atualizado');
                }
            } catch (supErr) {
                console.warn('[sync-client-name] Supabase não disponível:', supErr.message);
            }
        }
        
        res.json({
            success: true,
            message: 'Nome sincronizado',
            phone,
            newName,
            supabase: supabaseResult ? 'updated' : 'skipped'
        });
        
    } catch (error) {
        console.error('[sync-client-name] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// WEBHOOK EVOLUTION API / N8N - RECEBER MENSAGENS EM TEMPO REAL
// ============================================================================

// Armazenamento de mensagens em tempo real (em memória)
let realtimeMessages = [];
// Dedup: IDs de mensagens enviadas pelo CRM (evita duplicação no webhook)
const _recentSentIds = new Set();
let chatModes = loadJsonFile(CHAT_MODES_FILE, {}); // Persistente: { 'jid': 'ia' | 'humano' }
console.log(`[ChatModes] ${Object.keys(chatModes).length} modos restaurados do disco`);

function persistChatModes() {
    saveJsonFile(CHAT_MODES_FILE, chatModes);
}

// Endpoint principal: recebe webhooks da Evolution API (via N8N ou direto)
app.post('/api/evolution/webhook', (req, res) => {
    try {
        const payload = req.body || {};
        const event = payload.event || payload.action || 'unknown';
        
        console.log(`[EVOLUTION WEBHOOK] Evento: ${event}`);
        
        switch (event) {
            case 'messages.upsert':
            case 'MESSAGES_UPSERT': {
                const data = payload.data || payload;
                const messages = Array.isArray(data) ? data : [data];
                
                messages.forEach(msg => {
                    const key = msg.key || {};
                    const jid = key.remoteJid || msg.remoteJid || '';
                    const fromMe = key.fromMe || false;
                    const pushName = msg.pushName || '';

                    // Dedup: se esta msg já foi emitida pelo send-message, pular
                    if (key.id && _recentSentIds.has(key.id)) {
                        console.log(`[WEBHOOK] Skip duplicada (já emitida via send): ${key.id}`);
                        return; // pula esta iteração do forEach
                    }
                    
                    // Extrair texto da mensagem + preservar URLs de mídia
                    let text = '';
                    let mediaUrl = null;
                    let mediaType = null;
                    const message = msg.message || {};
                    if (message.conversation) text = message.conversation;
                    else if (message.extendedTextMessage?.text) text = message.extendedTextMessage.text;
                    else if (message.imageMessage) {
                        text = message.imageMessage.caption || '[Imagem]';
                        mediaUrl = message.imageMessage.url || null;
                        mediaType = 'image';
                    }
                    else if (message.videoMessage) {
                        text = message.videoMessage.caption || '[Vídeo]';
                        mediaUrl = message.videoMessage.url || null;
                        mediaType = 'video';
                    }
                    else if (message.documentMessage) {
                        text = `[Documento] ${message.documentMessage.fileName || ''}`;
                        mediaUrl = message.documentMessage.url || null;
                        mediaType = 'document';
                    }
                    else if (message.audioMessage) {
                        text = '[Áudio]';
                        mediaUrl = message.audioMessage.url || null;
                        mediaType = 'audio';
                    }
                    else if (message.pollCreationMessage || message.pollCreationMessageV3) {
                        const poll = message.pollCreationMessage || message.pollCreationMessageV3;
                        text = `[Enquete] ${poll.name || ''}`;
                        mediaType = 'poll';
                    }
                    else if (message.stickerMessage) text = '[Figurinha]';
                    else if (message.contactMessage) text = '[Contato]';
                    else if (message.locationMessage) text = '[Localização]';
                    
                    const realtimeMsg = {
                        id: key.id || `rt_${Date.now()}`,
                        jid,
                        fromMe,
                        pushName,
                        text,
                        mediaUrl,
                        mediaType,
                        timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
                        receivedAt: new Date().toISOString(),
                        isGroup: jid.includes('@g.us'),
                        raw: msg
                    };
                    
                    // Salvar na fila
                    realtimeMessages.unshift(realtimeMsg);
                    if (realtimeMessages.length > 500) realtimeMessages = realtimeMessages.slice(0, 500);
                    
                    // ======== PUSH INSTANTÂNEO VIA SOCKET.IO ========
                    io.emit('new-message', realtimeMsg);
                    // Também emitir para a sala específica do chat
                    io.to(`chat:${jid}`).emit('chat-message', realtimeMsg);
                    // Invalidar cache de all-chats (nova msg altera preview/ordenação)
                    _allChatsCacheTime = 0;
                    
                    console.log(`[MSG ${fromMe ? 'ENVIADA' : 'RECEBIDA'}] ${pushName || jid}: ${text.substring(0, 80)}`);                    
                });
                break;
            }
            
            case 'messages.update':
            case 'MESSAGES_UPDATE': {
                console.log('[EVOLUTION WEBHOOK] Status de mensagem atualizado');
                // Propagar status (lido, entregue, etc.) para o frontend
                io.emit('message-status', payload.data || payload);
                break;
            }
            
            case 'connection.update':
            case 'CONNECTION_UPDATE': {
                const state = payload.data?.state || payload.state;
                console.log(`[EVOLUTION WEBHOOK] Conexão: ${state}`);
                
                // Push instantâneo do status para o frontend
                io.emit('connection-update', { state, timestamp: new Date().toISOString() });
                
                if (state === 'open') {
                    ConnectionMonitor.updateStatus('connected', 'Webhook confirmou conexão');
                    // Delta sync: buscar mensagens perdidas durante a desconexão
                    deltaSync().catch(e => console.warn('[DELTA SYNC] Erro pós-reconexão:', e.message));
                } else if (state === 'close') {
                    ConnectionMonitor.updateStatus('disconnected', 'Webhook reportou desconexão');
                }
                break;
            }
            
            // N8N pode enviar evento customizado de transferência IA → Humano
            case 'transfer.to.human':
            case 'TRANSFER_TO_HUMAN': {
                const jid = payload.data?.jid || payload.jid;
                if (jid) {
                    chatModes[jid] = 'humano';
                    persistChatModes();
                    console.log(`[TRANSFER] Chat ${jid} transferido da IA para atendente humano`);
                }
                break;
            }
            
            // N8N pode devolver atendimento para a IA
            case 'transfer.to.ai':
            case 'TRANSFER_TO_AI': {
                const jid = payload.data?.jid || payload.jid;
                if (jid) {
                    chatModes[jid] = 'ia';
                    persistChatModes();
                    console.log(`[TRANSFER] Chat ${jid} devolvido para IA`);
                }
                break;
            }
            
            default:
                console.log(`[EVOLUTION WEBHOOK] Evento não tratado: ${event}`);
        }
        
        res.json({ success: true, event });
    } catch (error) {
        console.error('[EVOLUTION WEBHOOK] Erro:', error.message);
        res.status(200).json({ success: false, error: error.message });
    }
});

// API: Buscar mensagens em tempo real (polling do frontend)
app.get('/api/evolution/messages', (req, res) => {
    const since = req.query.since ? new Date(req.query.since) : null;
    const jid = req.query.jid || null;
    
    let filtered = realtimeMessages;
    
    if (since) {
        filtered = filtered.filter(m => new Date(m.receivedAt) > since);
    }
    if (jid) {
        filtered = filtered.filter(m => m.jid === jid);
    }
    
    res.json({ messages: filtered, total: filtered.length });
});

// API: Check rápido de novidades (endpoint leve para polling)
// Retorna apenas contagem e timestamp — cliente decide se precisa recarregar
app.get('/api/evolution/check-new', (req, res) => {
    const since = req.query.since ? parseInt(req.query.since) : 0;
    const newMessages = since > 0 
        ? realtimeMessages.filter(m => new Date(m.receivedAt).getTime() > since)
        : [];
    
    // Retornar contagem por chat (sem payload pesado)
    const byChatCount = {};
    newMessages.forEach(m => {
        byChatCount[m.jid] = (byChatCount[m.jid] || 0) + 1;
    });
    
    res.json({ 
        newCount: newMessages.length,
        byChat: byChatCount,
        lastMessageAt: realtimeMessages[0]?.receivedAt || null,
        socketClients: io.engine?.clientsCount || 0
    });
});

// API: Verificar/alterar modo do chat (IA ou Humano)
app.get('/api/evolution/chat-mode/:jid', (req, res) => {
    const jid = req.params.jid;
    const mode = chatModes[jid] || 'ia'; // padrão: IA atende
    res.json({ jid, mode });
});

app.post('/api/evolution/chat-mode/:jid', (req, res) => {
    const jid = req.params.jid;
    const mode = req.body.mode; // 'ia' ou 'humano'
    if (mode !== 'ia' && mode !== 'humano') {
        return res.status(400).json({ error: 'Mode deve ser "ia" ou "humano"' });
    }
    chatModes[jid] = mode;
    persistChatModes();
    console.log(`[CHAT MODE] ${jid} → ${mode}`);
    res.json({ success: true, jid, mode });
});

// API: Listar todos os modos de chat
app.get('/api/evolution/chat-modes', (req, res) => {
    res.json({ modes: chatModes });
});

// ============================================================================
// CÉREBRO DO CLIENTE - Lookup completo com histórico de pedidos
// ============================================================================

/**
 * GET /api/client-brain/:phone
 * Retorna perfil completo do cliente para o painel lateral
 * Inclui: dados pessoais, histórico de pedidos, métricas, status
 */
app.get('/api/client-brain/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone é obrigatório' });
        }
        
        // Normalizar telefone com função centralizada
        const normalizedPhone = normalizePhoneServer(phone);
        console.log(`[BRAIN] Buscando cliente: raw="${phone}" → normalized="${normalizedPhone}"`);
        
        // Garantir que o cache está populado (auto-carrega se vazio)
        await ensureCrmCache();
        
        // Buscar cliente usando função centralizada (match exato + fuzzy)
        let client = findClientByPhone(normalizedPhone);
        let clientOrders = [];
        
        if (client && crmCache.orders) {
            clientOrders = crmCache.orders.filter(o => {
                const clientId = String(client.id);
                // Verificar todos os campos possíveis de ID do cliente no pedido
                return String(o.id_cliente || '') === clientId || 
                       String(o.cliente_id || '') === clientId ||
                       String(o.cliente?.id || '') === clientId;
            });
        }
        
        console.log(`[BRAIN] Resultado: ${client ? '✅ ' + (client.nome || client.name) + ' (' + clientOrders.length + ' pedidos)' : '❌ Não encontrado'}`);
        
        // Se não encontrou cliente, retornar como Lead Novo
        if (!client) {
            return res.json({
                found: false,
                status: 'Lead Novo',
                statusColor: 'blue',
                statusEmoji: '🆕',
                phone: normalizedPhone,
                message: 'Primeira interação - cliente não encontrado no sistema',
                metrics: null,
                orders: [],
                products: [],
                insight: '👤 Novo contato! Aproveite para capturar os dados.',
                recommendation: 'Pergunte o nome e interesse do cliente.'
            });
        }
        
        // Calcular métricas (FacilZap usa 'total', não 'valor_total')
        const totalSpent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.valor_total || o.total || o.subtotal) || 0), 0);
        const avgTicket = clientOrders.length > 0 ? totalSpent / clientOrders.length : 0;
        
        // Ordenar pedidos por data
        const sortedOrders = clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data));
        const lastOrder = sortedOrders[0];
        const lastPurchaseDate = lastOrder ? new Date(lastOrder.data) : null;
        const daysSinceLastPurchase = lastPurchaseDate ? 
            Math.floor((new Date() - lastPurchaseDate) / (1000 * 60 * 60 * 24)) : 999;
        
        // Frequência: tempo médio entre compras (ciclo de recompra)
        let avgDaysBetweenPurchases = 0;
        if (sortedOrders.length >= 2) {
            const orderDates = sortedOrders.map(o => new Date(o.data).getTime()).sort((a, b) => a - b);
            let totalGap = 0;
            for (let i = 1; i < orderDates.length; i++) {
                totalGap += orderDates[i] - orderDates[i - 1];
            }
            avgDaysBetweenPurchases = Math.round(totalGap / ((orderDates.length - 1) * 86400000));
        }
        
        // Determinar status de fidelidade
        let status, statusColor, statusEmoji, loyaltyTag;
        if (clientOrders.length >= 5 || totalSpent >= 2000) {
            status = 'Cliente VIP';
            statusColor = 'purple';
            statusEmoji = '👑';
            loyaltyTag = 'VIP';
        } else if (clientOrders.length >= 3 && daysSinceLastPurchase <= 90) {
            status = 'Cliente Fiel';
            statusColor = 'green';
            statusEmoji = '💎';
            loyaltyTag = 'Cliente Fiel';
        } else if (clientOrders.length >= 2) {
            status = 'Cliente Recorrente';
            statusColor = 'green';
            statusEmoji = '⭐';
            loyaltyTag = daysSinceLastPurchase > 90 ? 'Inativo' : 'Recorrente';
        } else if (clientOrders.length === 1) {
            status = 'Cliente';
            statusColor = 'blue';
            statusEmoji = '✅';
            loyaltyTag = daysSinceLastPurchase > 120 ? 'Inativo' : 'Cliente';
        } else {
            status = 'Lead Cadastrado';
            statusColor = 'gray';
            statusEmoji = '📝';
            loyaltyTag = 'Lead';
        }
        // Sobrescrever loyaltyTag se inativo há muito tempo
        if (daysSinceLastPurchase > 180 && clientOrders.length > 0) {
            loyaltyTag = 'Inativo';
        }
        
        // Produtos mais comprados (frequência)
        const productCounts = {};
        clientOrders.forEach(order => {
            const items = order.itens || order.produtos || order.products || [];
            items.forEach(item => {
                const name = item.nome || item.name || item.produto || 'Produto';
                productCounts[name] = (productCounts[name] || 0) + (item.quantidade || 1);
            });
        });
        
        const frequentProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, qty]) => ({ name, qty }));
        
        // Últimos 3 produtos comprados (cronológico, com link do pedido)
        const recentProducts = [];
        for (const order of sortedOrders) {
            const items = order.itens || order.produtos || order.products || [];
            for (const item of items) {
                if (recentProducts.length >= 3) break;
                const pName = item.nome || item.name || item.produto || 'Produto';
                // Buscar link do produto no catálogo
                const catalogProduct = (crmCache.products || []).find(p => 
                    (p.nome || '').toLowerCase() === pName.toLowerCase() ||
                    (p.name || '').toLowerCase() === pName.toLowerCase()
                );
                recentProducts.push({
                    name: pName,
                    orderId: order.id || order.codigo,
                    orderDate: order.data,
                    price: parseFloat(item.preco || item.valor || order.valor_total || order.total || 0),
                    link: catalogProduct?.link_oficial || null,
                    image: catalogProduct?.imagem || null
                });
            }
            if (recentProducts.length >= 3) break;
        }
        
        // Últimos 3 pedidos resumidos
        const recentOrders = sortedOrders.slice(0, 3).map(o => ({
            id: o.id || o.codigo,
            date: o.data,
            total: parseFloat(o.valor_total || o.total || o.subtotal) || 0,
            status: o.status || 'Concluído',
            items: (o.itens || o.produtos || o.products || []).length
        }));
        
        // Gerar insight personalizado
        let insight = '';
        if (status === 'Cliente VIP') {
            insight = `🎯 Cliente VIP com ${clientOrders.length} compras. Última há ${daysSinceLastPurchase} dias.`;
        } else if (daysSinceLastPurchase > 60) {
            insight = `⚠️ Cliente inativo há ${daysSinceLastPurchase} dias. Oportunidade de reativação!`;
        } else if (daysSinceLastPurchase <= 7) {
            insight = `🔥 Comprou recentemente (${daysSinceLastPurchase} dias). Cliente ativo!`;
        } else {
            insight = `📊 ${clientOrders.length} pedido(s). Ticket médio: R$ ${avgTicket.toFixed(2)}`;
        }
        
        // Recomendação
        let recommendation = '';
        if (frequentProducts.length > 0) {
            recommendation = `💡 Produtos favoritos: ${frequentProducts.slice(0, 3).map(p => p.name).join(', ')}`;
        } else {
            recommendation = '💡 Pergunte sobre preferências para personalizar o atendimento.';
        }
        
        res.json({
            found: true,
            client: {
                id: client.id,
                name: client.nome || client.name || 'Sem nome',
                email: client.email,
                phone: normalizedPhone,
                cpf: client.cpf,
                city: client.cidade || client.city,
                state: client.estado || client.state,
                createdAt: client.data_criacao || client.created_at
            },
            status,
            statusColor,
            statusEmoji,
            loyaltyTag,
            metrics: {
                totalSpent: totalSpent.toFixed(2),
                avgTicket: avgTicket.toFixed(2),
                ordersCount: clientOrders.length,
                lastPurchaseDate: lastPurchaseDate?.toISOString(),
                daysSinceLastPurchase,
                avgDaysBetweenPurchases
            },
            orders: recentOrders,
            products: frequentProducts,
            recentProducts,
            insight,
            recommendation
        });
        
    } catch (error) {
        console.error('[client-brain] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/whatsapp/profile-picture/:jid
 * Buscar foto de perfil de um contato via Evolution API
 */
app.get('/api/whatsapp/profile-picture/:jid', async (req, res) => {
    try {
        const jid = req.params.jid;
        
        if (!jid) {
            return res.status(400).json({ error: 'JID é obrigatório' });
        }
        
        // Garantir formato correto do JID
        let formattedJid = jid;
        if (!jid.includes('@')) {
            formattedJid = `${jid}@s.whatsapp.net`;
        }
        
        const url = `${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            body: JSON.stringify({ number: formattedJid })
        });
        
        if (!response.ok) {
            // Sem foto de perfil ou privacidade ativada
            return res.json({ profilePicUrl: null });
        }
        
        const data = await response.json();
        res.json({ profilePicUrl: data.profilePictureUrl || data.url || null });
        
    } catch (error) {
        console.error('[profile-picture] Erro:', error);
        res.json({ profilePicUrl: null }); // Retorna null em caso de erro
    }
});

/**
 * POST /api/contacts/save
 * Salvar/atualizar contato no sistema
 */
app.post('/api/contacts/save', async (req, res) => {
    try {
        const { phone, name, pushName, profilePicUrl } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone é obrigatório' });
        }
        
        const normalizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');
        
        // Aqui você pode salvar no Supabase se configurado
        // Por enquanto, apenas confirma recebimento
        console.log(`[CONTACT SAVE] ${normalizedPhone}: ${name || pushName}`);
        
        res.json({ success: true, phone: normalizedPhone, name: name || pushName });
        
    } catch (error) {
        console.error('[contacts/save] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// MÓDULO DE CAMPANHAS - Motor de Segmentação RFM + Disparo em Massa
// ============================================================================

// Armazenamento de campanhas em memória (persistido no Supabase quando disponível)
let campaigns = [];
let campaignHistory = {}; // { campaignId: [{ phone, sentAt, status }] }

/**
 * POST /api/campaigns/segment
 * Motor de segmentação RFM (Recência, Frequência, Monetário)
 * Retorna lista de clientes filtrados
 */
app.post('/api/campaigns/segment', async (req, res) => {
    try {
        const { segment, minOrders, maxOrders, minSpent, maxSpent, inactiveDays, state, city } = req.body;
        
        // Auto-sync se cache estiver vazio
        if (!crmCache.clients || crmCache.clients.length === 0) {
            console.log('[SEGMENT] Cache vazio — tentando auto-sync...');
            await ensureCrmCache();
        }
        
        if (!crmCache.clients || crmCache.clients.length === 0) {
            return res.status(400).json({ error: 'Nenhum cliente carregado. Sincronize primeiro.' });
        }
        
        let clients = [...crmCache.clients];
        const orders = crmCache.orders || [];
        const now = new Date();
        
        // Enriquecer clientes com métricas RFM
        clients = clients.map(client => {
            const clientOrders = orders.filter(o => 
                o.id_cliente === client.id || o.cliente_id === client.id
            );
            
            const totalSpent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.valor_total) || 0), 0);
            const orderCount = clientOrders.length;
            
            // Última compra
            const sortedOrders = clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data));
            const lastOrderDate = sortedOrders[0] ? new Date(sortedOrders[0].data) : null;
            const daysSinceLastPurchase = lastOrderDate ? Math.floor((now - lastOrderDate) / (1000 * 60 * 60 * 24)) : 999;
            
            // Categorias compradas
            const categories = [...new Set(clientOrders.flatMap(o => {
                const items = o.itens || o.products || [];
                return items.map(i => i.categoria || i.category || 'Sem categoria');
            }))];
            
            // Telefone normalizado com função centralizada + DDI para envio
            const phoneNorm = normalizePhoneServer(client.telefone || client.celular || client.whatsapp || '');
            const phone = ensureDDI55(phoneNorm);
            
            return {
                ...client,
                phone,
                totalSpent,
                orderCount,
                daysSinceLastPurchase,
                lastOrderDate: lastOrderDate?.toISOString(),
                categories,
                displayName: client.nome || client.name || 'Sem nome'
            };
        });
        
        // Filtrar por telefone válido
        clients = clients.filter(c => c.phone && c.phone.length >= 10);
        
        // Aplicar filtros de segmentação
        if (segment) {
            switch (segment) {
                case 'vip':
                    clients = clients.filter(c => c.orderCount >= 5 || c.totalSpent >= 500);
                    break;
                case 'recorrente':
                    clients = clients.filter(c => c.orderCount >= 2 && c.orderCount < 5);
                    break;
                case 'inativos':
                    clients = clients.filter(c => c.daysSinceLastPurchase >= (inactiveDays || 90) && c.orderCount > 0);
                    break;
                case 'novos':
                    clients = clients.filter(c => c.orderCount <= 1 && c.daysSinceLastPurchase <= 30);
                    break;
                case 'risco':
                    clients = clients.filter(c => c.daysSinceLastPurchase >= 60 && c.daysSinceLastPurchase < 120 && c.orderCount > 0);
                    break;
                case 'fieis':
                    // Clientes fiéis: mais de 2 pedidos
                    clients = clients.filter(c => c.orderCount > 2);
                    break;
                case 'inativos_30':
                    // Inativos 30+ dias (último pedido há mais de 30 dias)
                    clients = clients.filter(c => c.daysSinceLastPurchase >= 30 && c.orderCount > 0);
                    break;
                case 'inactive_300':
                    // Inativos 300+ dias (último pedido há mais de 300 dias)
                    clients = clients.filter(c => c.daysSinceLastPurchase >= 300 && c.orderCount > 0);
                    break;
                case 'ticket_alto': {
                    // Ticket médio acima da média global
                    const allAvg = clients.reduce((s, c) => s + (c.orderCount > 0 ? c.totalSpent / c.orderCount : 0), 0) / (clients.filter(c => c.orderCount > 0).length || 1);
                    clients = clients.filter(c => c.orderCount > 0 && (c.totalSpent / c.orderCount) > allAvg);
                    break;
                }
                case 'recuperacao':
                    // Risco de perda: 45-180 dias sem compra + já comprou antes
                    clients = clients.filter(c => c.daysSinceLastPurchase >= 45 && c.daysSinceLastPurchase <= 180 && c.orderCount > 0);
                    break;
                case 'todos':
                default:
                    break;
            }
        }
        
        // Filtros adicionais
        if (minOrders) clients = clients.filter(c => c.orderCount >= minOrders);
        if (maxOrders) clients = clients.filter(c => c.orderCount <= maxOrders);
        if (minSpent) clients = clients.filter(c => c.totalSpent >= minSpent);
        if (maxSpent) clients = clients.filter(c => c.totalSpent <= maxSpent);
        if (state) clients = clients.filter(c => (c.estado || c.state || '').toUpperCase() === state.toUpperCase());
        if (city) clients = clients.filter(c => (c.cidade || c.city || '').toLowerCase().includes(city.toLowerCase()));
        
        // Ordenar por valor gasto (maiores primeiro)
        clients.sort((a, b) => b.totalSpent - a.totalSpent);
        
        console.log(`[SEGMENT] Filtro "${segment || 'todos'}": ${clients.length} clientes`);
        
        res.json({
            total: clients.length,
            segment: segment || 'todos',
            clients: clients.map(c => ({
                id: c.id,
                name: c.displayName,
                phone: c.phone,
                email: c.email,
                totalSpent: c.totalSpent.toFixed(2),
                orderCount: c.orderCount,
                daysSinceLastPurchase: c.daysSinceLastPurchase,
                lastOrderDate: c.lastOrderDate,
                state: c.estado || c.state,
                city: c.cidade || c.city
            }))
        });
        
    } catch (error) {
        console.error('[SEGMENT] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/create
 * Criar uma campanha de disparo em massa
 */
app.post('/api/campaigns/create', async (req, res) => {
    try {
        const { name, message, imageUrl, contacts, segment, batchSize, batchInterval, messageDelay, scheduledAt, couponCode, campaignType, pollTitle, pollOptions, pollSelectableCount, mediaLibraryId } = req.body;
        
        if (!name || !contacts || contacts.length === 0) {
            return res.status(400).json({ error: 'Nome e contatos são obrigatórios' });
        }
        
        // Tipos: 'text', 'image', 'poll', 'audio', 'sticker'
        const type = campaignType || (imageUrl ? 'image' : 'text');
        
        if (type === 'poll' && (!pollTitle || !pollOptions || pollOptions.length < 2)) {
            return res.status(400).json({ error: 'Enquete requer título e mínimo 2 opções' });
        }
        
        if (type !== 'poll' && !message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória para este tipo de campanha' });
        }
        
        const campaign = {
            id: `camp_${Date.now()}`,
            name,
            message: message || '',
            imageUrl: imageUrl || null,
            segment: segment || 'custom',
            contacts: contacts,
            totalContacts: contacts.length,
            sentCount: 0,
            failedCount: 0,
            status: scheduledAt ? 'scheduled' : 'ready',
            batchSize: batchSize || 10,
            batchInterval: batchInterval || 20,
            messageDelay: messageDelay || 5, // Segundos base entre msgs (anti-ban)
            scheduledAt: scheduledAt || null,
            couponCode: couponCode || null,
            // Módulo 3: Suporte a polls
            campaignType: type,
            pollTitle: pollTitle || null,
            pollOptions: pollOptions || null,
            pollSelectableCount: pollSelectableCount || 1,
            // Módulo 4: Mídia da biblioteca
            mediaLibraryId: mediaLibraryId || null,
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            history: []
        };
        
        campaigns.push(campaign);
        
        console.log(`[CAMPAIGN] Criada: "${name}" (tipo: ${type}) - ${contacts.length} contatos`);
        
        res.json({ success: true, campaign });
        
    } catch (error) {
        console.error('[CAMPAIGN] Erro ao criar:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns
 * Listar todas as campanhas
 */
app.get('/api/campaigns', (req, res) => {
    res.json({ campaigns: campaigns.map(c => ({ ...c, contacts: undefined, history: undefined, contactCount: c.contacts?.length })) });
});

/**
 * GET /api/campaigns/:id
 * Detalhes de uma campanha
 */
app.get('/api/campaigns/:id', (req, res) => {
    const campaign = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json(campaign);
});

/**
 * POST /api/campaigns/:id/start
 * Iniciar disparo de uma campanha (processamento no servidor)
 */
app.post('/api/campaigns/:id/start', async (req, res) => {
    try {
        const campaign = campaigns.find(c => c.id === req.params.id);
        if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
        
        if (campaign.status === 'running') {
            return res.status(400).json({ error: 'Campanha já está em execução' });
        }
        
        campaign.status = 'running';
        campaign.startedAt = new Date().toISOString();
        
        console.log(`[CAMPAIGN] Iniciando disparo: "${campaign.name}" - ${campaign.totalContacts} contatos`);
        
        // Responde imediatamente ao frontend
        res.json({ success: true, message: 'Disparo iniciado', campaignId: campaign.id });
        
        // Processar em background (batches)
        processCampaignBatches(campaign);
        
    } catch (error) {
        console.error('[CAMPAIGN] Erro ao iniciar:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/pause
 * Pausar campanha em andamento
 */
app.post('/api/campaigns/:id/pause', (req, res) => {
    const campaign = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    campaign.status = 'paused';
    console.log(`[CAMPAIGN] Pausada: "${campaign.name}"`);
    res.json({ success: true, message: 'Campanha pausada' });
});

/**
 * POST /api/campaigns/:id/resume
 * Retomar campanha pausada
 */
app.post('/api/campaigns/:id/resume', async (req, res) => {
    const campaign = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    campaign.status = 'running';
    console.log(`[CAMPAIGN] Retomada: "${campaign.name}"`);
    res.json({ success: true, message: 'Campanha retomada' });
    processCampaignBatches(campaign);
});

/**
 * DELETE /api/campaigns/:id
 * Excluir campanha
 */
app.delete('/api/campaigns/:id', (req, res) => {
    const idx = campaigns.findIndex(c => c.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Campanha não encontrada' });
    const removed = campaigns.splice(idx, 1);
    if (removed[0]) removed[0].status = 'cancelled'; // Para parar o processamento
    console.log(`[CAMPAIGN] Excluída: "${removed[0]?.name}"`);
    res.json({ success: true });
});

/**
 * GET /api/campaigns/:id/history
 * Histórico de envio de uma campanha (timeline do contato)
 */
app.get('/api/campaigns/:id/history', (req, res) => {
    const campaign = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json({ history: campaign.history || [] });
});

/**
 * GET /api/contact-campaigns/:phone
 * Ver quais campanhas um contato recebeu (para a timeline da Central)
 */
app.get('/api/contact-campaigns/:phone', (req, res) => {
    const phone = req.params.phone.replace(/\D/g, '').replace(/^55/, '');
    
    const contactCampaigns = [];
    campaigns.forEach(camp => {
        const entries = (camp.history || []).filter(h => {
            const hPhone = h.phone?.replace(/\D/g, '').replace(/^55/, '');
            return hPhone === phone;
        });
        if (entries.length > 0) {
            contactCampaigns.push({
                campaignId: camp.id,
                campaignName: camp.name,
                sentAt: entries[0].sentAt,
                status: entries[0].status,
                message: camp.message?.substring(0, 100)
            });
        }
    });
    
    res.json({ campaigns: contactCampaigns });
});

/**
 * Função interna: processar batches de uma campanha
 * Envia mensagens em lotes com delay anti-ban
 */
async function processCampaignBatches(campaign) {
    const { contacts, batchSize, batchInterval, message, imageUrl, couponCode, campaignType, messageDelay } = campaign;
    
    // Anti-ban: delay base configurável (do frontend) + variação aleatória
    const baseDelayMs = (messageDelay || 5) * 1000;
    const delayVariation = 0.6; // ±60% de variação
    
    let currentIndex = campaign.sentCount; // Retomar de onde parou
    let consecutiveSent = 0; // Contador para cooldown progressivo
    
    while (currentIndex < contacts.length) {
        // Verificar se campanha foi pausada ou cancelada
        const current = campaigns.find(c => c.id === campaign.id);
        if (!current || current.status !== 'running') {
            console.log(`[CAMPAIGN] "${campaign.name}" parada em ${currentIndex}/${contacts.length}`);
            return;
        }
        
        // Processar batch
        const batch = contacts.slice(currentIndex, currentIndex + batchSize);
        console.log(`[CAMPAIGN] "${campaign.name}" - Lote ${Math.floor(currentIndex / batchSize) + 1}: ${batch.length} mensagens (tipo: ${campaignType || 'text'})`);
        
        for (const contact of batch) {
            // Verificar status novamente
            const check = campaigns.find(c => c.id === campaign.id);
            if (!check || check.status !== 'running') return;
            
            try {
                // Personalizar mensagem
                let personalizedMsg = (message || '')
                    .replace(/\{\{nome\}\}/gi, contact.name || 'Cliente')
                    .replace(/\{\{telefone\}\}/gi, contact.phone || '')
                    .replace(/\{\{cidade\}\}/gi, contact.city || '')
                    .replace(/\{\{cupom\}\}/gi, couponCode || '');
                
                // Normalizar telefone para envio
                let phoneNumber = contact.phone.replace(/\D/g, '');
                if (!phoneNumber.startsWith('55') && phoneNumber.length <= 11) {
                    phoneNumber = '55' + phoneNumber;
                }
                
                let response;
                
                // ===== TIPO DE ENVIO =====
                switch (campaignType || 'text') {
                    case 'poll': {
                        // Módulo 3: Enquete
                        const pollUrl = `${EVOLUTION_URL}/message/sendPoll/${INSTANCE_NAME}`;
                        response = await fetch(pollUrl, {
                            method: 'POST',
                            headers: evolutionHeaders,
                            body: JSON.stringify({
                                number: phoneNumber,
                                name: campaign.pollTitle,
                                values: campaign.pollOptions,
                                selectableCount: campaign.pollSelectableCount || 1
                            })
                        });
                        break;
                    }
                    
                    case 'audio': {
                        // Módulo 4: Áudio PTT (gravado agora) da biblioteca
                        let audioData = null;
                        if (campaign.mediaLibraryId && supabase) {
                            const { data: media } = await supabase.from('media_library')
                                .select('base64, url, mimetype')
                                .eq('id', campaign.mediaLibraryId).single();
                            audioData = media;
                            // Incrementar uso
                            await supabase.from('media_library').update({ uso_count: supabase.raw('uso_count + 1'), usado_em: new Date().toISOString() }).eq('id', campaign.mediaLibraryId);
                        }
                        
                        if (audioData) {
                            const audioUrl = `${EVOLUTION_URL}/message/sendWhatsAppAudio/${INSTANCE_NAME}`;
                            response = await fetch(audioUrl, {
                                method: 'POST',
                                headers: evolutionHeaders,
                                body: JSON.stringify({
                                    number: phoneNumber,
                                    audio: audioData.base64 || audioData.url,
                                    encoding: true // Converter para ogg/opus PTT
                                })
                            });
                        } else {
                            // Fallback: enviar como texto
                            response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
                                method: 'POST',
                                headers: evolutionHeaders,
                                body: JSON.stringify({ number: phoneNumber, text: personalizedMsg })
                            });
                        }
                        break;
                    }
                    
                    case 'sticker': {
                        // Módulo 4: Figurinha da biblioteca
                        let stickerData = null;
                        if (campaign.mediaLibraryId && supabase) {
                            const { data: media } = await supabase.from('media_library')
                                .select('base64, url').eq('id', campaign.mediaLibraryId).single();
                            stickerData = media;
                        }
                        
                        if (stickerData) {
                            const stickerUrl = `${EVOLUTION_URL}/message/sendSticker/${INSTANCE_NAME}`;
                            response = await fetch(stickerUrl, {
                                method: 'POST',
                                headers: evolutionHeaders,
                                body: JSON.stringify({
                                    number: phoneNumber,
                                    sticker: stickerData.base64 || stickerData.url
                                })
                            });
                        }
                        // Se tem mensagem, enviar texto depois do sticker
                        if (personalizedMsg) {
                            await new Promise(r => setTimeout(r, 1500));
                            response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
                                method: 'POST',
                                headers: evolutionHeaders,
                                body: JSON.stringify({ number: phoneNumber, text: personalizedMsg })
                            });
                        }
                        break;
                    }
                    
                    case 'image': {
                        // Imagem + legenda
                        const mediaUrl = `${EVOLUTION_URL}/message/sendMedia/${INSTANCE_NAME}`;
                        response = await fetch(mediaUrl, {
                            method: 'POST',
                            headers: evolutionHeaders,
                            body: JSON.stringify({
                                number: phoneNumber,
                                mediatype: 'image',
                                media: imageUrl,
                                caption: personalizedMsg
                            })
                        });
                        break;
                    }
                    
                    default: {
                        // Texto puro
                        const textUrl = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
                        response = await fetch(textUrl, {
                            method: 'POST',
                            headers: evolutionHeaders,
                            body: JSON.stringify({
                                number: phoneNumber,
                                text: personalizedMsg
                            })
                        });
                    }
                }
                
                const data = response ? await response.json() : { error: 'Sem resposta' };
                const success = !data.error && data.status !== 'error';
                
                // Registrar no histórico
                campaign.history.push({
                    phone: phoneNumber,
                    name: contact.name,
                    sentAt: new Date().toISOString(),
                    status: success ? 'sent' : 'failed',
                    error: success ? null : (data.message || data.error)
                });
                
                if (success) {
                    campaign.sentCount++;
                    consecutiveSent++;
                } else {
                    campaign.failedCount++;
                }
                
                console.log(`[CAMPAIGN] ${success ? '✅' : '❌'} ${contact.name} (${phoneNumber})`);
                
                // ===== ANTI-BAN INTELIGENTE (Fix #7) =====
                // Delay base + variação aleatória + cooldown progressivo
                let delay = baseDelayMs * (1 - delayVariation + Math.random() * delayVariation * 2);
                
                // Cooldown progressivo: a cada 15 msgs, pausar 30-60s extra
                if (consecutiveSent > 0 && consecutiveSent % 15 === 0) {
                    const cooldown = 30000 + Math.random() * 30000;
                    console.log(`[CAMPAIGN] ⏸️ Cooldown anti-ban: ${Math.round(cooldown/1000)}s após ${consecutiveSent} msgs`);
                    delay += cooldown;
                }
                
                // Após muitas mensagens, aumentar delay progressivamente
                if (consecutiveSent > 50) {
                    delay *= 1.3; // +30% após 50 msgs
                } else if (consecutiveSent > 100) {
                    delay *= 1.6; // +60% após 100 msgs
                }
                
                await new Promise(r => setTimeout(r, Math.round(delay)));
                
            } catch (error) {
                console.error(`[CAMPAIGN] Erro ao enviar para ${contact.name}:`, error.message);
                campaign.failedCount++;
                campaign.history.push({
                    phone: contact.phone,
                    name: contact.name,
                    sentAt: new Date().toISOString(),
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        currentIndex += batchSize;
        
        // Se ainda há mais contatos, esperar intervalo entre lotes
        if (currentIndex < contacts.length) {
            const current2 = campaigns.find(c => c.id === campaign.id);
            if (!current2 || current2.status !== 'running') return;
            
            console.log(`[CAMPAIGN] "${campaign.name}" - Aguardando ${batchInterval} minutos para próximo lote...`);
            await new Promise(r => setTimeout(r, batchInterval * 60 * 1000));
        }
    }
    
    // Campanha finalizada
    campaign.status = 'completed';
    campaign.completedAt = new Date().toISOString();
    console.log(`[CAMPAIGN] ✅ "${campaign.name}" CONCLUÍDA! ${campaign.sentCount} enviados, ${campaign.failedCount} falhas`);
}

// Verificador de campanhas agendadas (roda a cada 60 segundos)
setInterval(() => {
    const now = new Date();
    campaigns.forEach(camp => {
        if (camp.status === 'scheduled' && camp.scheduledAt) {
            const scheduledTime = new Date(camp.scheduledAt);
            if (now >= scheduledTime) {
                console.log(`[CAMPAIGN] Campanha agendada "${camp.name}" ativada!`);
                camp.status = 'running';
                camp.startedAt = new Date().toISOString();
                processCampaignBatches(camp);
            }
        }
    });
}, 60000);

// ============================================================================
// RECUPERAÇÃO DE CARRINHO - Deep Links + Cupons
// ============================================================================

/**
 * POST /api/cart-recovery/send
 * Enviar mensagem de recuperação de carrinho com link direto + cupom
 */
app.post('/api/cart-recovery/send', async (req, res) => {
    try {
        const { cartId, couponCode, customMessage } = req.body;
        
        // Buscar carrinho
        const cart = abandonedCarts.find(c => c.id == cartId);
        if (!cart) {
            return res.status(404).json({ error: 'Carrinho não encontrado' });
        }
        
        const phone = cart.cliente?.whatsapp?.replace(/\D/g, '') || '';
        if (!phone) {
            return res.status(400).json({ error: 'Cliente sem WhatsApp' });
        }
        
        // Construir link do carrinho
        let cartUrl = cart.link_carrinho || null;
        
        // Se não tem link direto, tentar construir
        if (!cartUrl && SITE_BASE_URL && SITE_BASE_URL !== 'https://seusite.com.br') {
            cartUrl = `${SITE_BASE_URL}/carrinho?id=${cart.id}`;
        }
        
        // Adicionar cupom ao link (se suportado pela plataforma)
        if (cartUrl && couponCode) {
            const separator = cartUrl.includes('?') ? '&' : '?';
            cartUrl = `${cartUrl}${separator}coupon=${encodeURIComponent(couponCode)}`;
        }
        
        // Listar produtos do carrinho
        const productsList = (cart.produtos || [])
            .map(p => `  • ${p.nome}${p.variacao ? ` (${p.variacao})` : ''} - ${p.quantidade}x`)
            .join('\n');
        
        // Montar mensagem
        let text = customMessage || '';
        
        if (!text) {
            text = `Olá ${cart.cliente?.nome || 'Cliente'}! 😊\n\n`;
            text += `Vi que você deixou alguns produtos no carrinho:\n${productsList}\n\n`;
            text += `*Total: R$ ${parseFloat(cart.valor_total).toFixed(2)}*\n\n`;
            
            if (couponCode) {
                text += `🎁 Use o cupom *${couponCode}* e ganhe um desconto especial!\n\n`;
            }
            
            if (cartUrl) {
                text += `🛒 Clique aqui para finalizar sua compra:\n${cartUrl}\n\n`;
            }
            
            text += `Posso te ajudar com alguma dúvida? 💬`;
        } else {
            // Substituir variáveis na mensagem customizada
            text = text
                .replace(/\{\{nome\}\}/gi, cart.cliente?.nome || 'Cliente')
                .replace(/\{\{valor\}\}/gi, `R$ ${parseFloat(cart.valor_total).toFixed(2)}`)
                .replace(/\{\{produtos\}\}/gi, productsList)
                .replace(/\{\{link\}\}/gi, cartUrl || '[link indisponível]')
                .replace(/\{\{cupom\}\}/gi, couponCode || '');
        }
        
        // Normalizar telefone
        let phoneNumber = phone;
        if (!phoneNumber.startsWith('55') && phoneNumber.length <= 11) {
            phoneNumber = '55' + phoneNumber;
        }
        
        // Enviar via Evolution API
        const url = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({ number: phoneNumber, text })
        });
        
        const data = await response.json();
        const success = !data.error && data.status !== 'error';
        
        if (success) {
            console.log(`[CART RECOVERY] ✅ Mensagem enviada para ${cart.cliente?.nome} (${phoneNumber})`);
            
            // Marcar carrinho como "recuperação enviada"
            cart.recoveryStatus = 'sent';
            cart.recoverySentAt = new Date().toISOString();
            cart.recoveryCoupon = couponCode || null;
        }
        
        res.json({
            success,
            message: success ? 'Mensagem de recuperação enviada!' : 'Falha ao enviar',
            cartUrl,
            phoneNumber
        });
        
    } catch (error) {
        console.error('[CART RECOVERY] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cart-recovery/bulk
 * Recuperar múltiplos carrinhos abandonados de uma vez
 */
app.post('/api/cart-recovery/bulk', async (req, res) => {
    try {
        const { cartIds, couponCode, message } = req.body;
        
        if (!cartIds || cartIds.length === 0) {
            return res.status(400).json({ error: 'Nenhum carrinho selecionado' });
        }
        
        const results = [];
        
        for (const cartId of cartIds) {
            try {
                const cart = abandonedCarts.find(c => c.id == cartId);
                if (!cart) {
                    results.push({ cartId, success: false, error: 'Não encontrado' });
                    continue;
                }
                
                // Normalizar telefone com função centralizada
                const rawBulkPhone = cart.cliente?.whatsapp || cart.cliente?.telefone || '';
                const normBulkPhone = normalizePhoneServer(rawBulkPhone);
                const phoneNumber = ensureDDI55(normBulkPhone);
                
                if (!phoneNumber || phoneNumber.length < 12) {
                    results.push({ cartId, success: false, error: 'Sem WhatsApp válido' });
                    continue;
                }
                
                // Construir link
                let cartUrl = cart.link_carrinho || null;
                if (!cartUrl && SITE_BASE_URL && SITE_BASE_URL !== 'https://seusite.com.br') {
                    cartUrl = `${SITE_BASE_URL}/carrinho?id=${cart.id}`;
                }
                if (cartUrl && couponCode) {
                    const separator = cartUrl.includes('?') ? '&' : '?';
                    cartUrl = `${cartUrl}${separator}coupon=${encodeURIComponent(couponCode)}`;
                }
                
                // Listar produtos (garantir string, fix [object Object])
                const productsList = (cart.produtos || [])
                    .map(p => {
                        const nome = (typeof p === 'string') ? p : (p?.nome || p?.name || 'Produto');
                        const qtd = p?.quantidade || p?.qty || 1;
                        return `  • ${nome} - ${qtd}x`;
                    })
                    .join('\n');
                
                let text = message || `Olá ${cart.cliente?.nome || 'Cliente'}! 😊\n\nVi que você deixou alguns produtos no carrinho:\n${productsList}\n\n*Total: R$ ${parseFloat(cart.valor_total).toFixed(2)}*`;
                
                if (couponCode) text += `\n\n🎁 Cupom: *${couponCode}*`;
                if (cartUrl) text += `\n\n🛒 Finalizar compra: ${cartUrl}`;
                
                text = text
                    .replace(/\{\{nome\}\}/gi, cart.cliente?.nome || 'Cliente')
                    .replace(/\{\{valor\}\}/gi, `R$ ${parseFloat(cart.valor_total).toFixed(2)}`)
                    .replace(/\{\{link\}\}/gi, cartUrl || '')
                    .replace(/\{\{cupom\}\}/gi, couponCode || '');
                
                const sendUrl = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
                const response = await fetch(sendUrl, {
                    method: 'POST',
                    headers: evolutionHeaders,
                    body: JSON.stringify({ number: phoneNumber, text })
                });
                
                const data = await response.json();
                const success = !data.error && data.status !== 'error';
                
                cart.recoveryStatus = success ? 'sent' : 'failed';
                cart.recoverySentAt = new Date().toISOString();
                cart.recoveryCoupon = couponCode || null;
                
                results.push({ cartId, success, name: cart.cliente?.nome, phone: phoneNumber });
                
                // Delay anti-ban: 3-5 segundos
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
                
            } catch (err) {
                results.push({ cartId, success: false, error: err.message });
            }
        }
        
        const sent = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`[CART RECOVERY BULK] ${sent} enviados, ${failed} falhas`);
        
        res.json({ results, sent, failed });
        
    } catch (error) {
        console.error('[CART RECOVERY BULK] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/coupons/active
 * Listar cupons ativos para seleção na recuperação de carrinho
 */
app.get('/api/coupons/active', async (req, res) => {
    try {
        // Criar cliente Supabase se configurado
        if (SUPABASE_SERVICE_KEY) {
            const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data, error } = await supaClient
                .from('coupons')
                .select('*')
                .eq('is_active', true);
            
            if (!error && data) {
                return res.json({ coupons: data });
            }
        }
        
        // Fallback: cupons do cache
        res.json({ coupons: crmCache.coupons || [] });
        
    } catch (error) {
        console.error('[COUPONS] Erro:', error);
        res.json({ coupons: [] });
    }
});

/**
 * POST /api/coupons/create
 * Criar um novo cupom
 */
app.post('/api/coupons/create', async (req, res) => {
    try {
        const { code, discount, type, minValue, maxUses, validUntil, description } = req.body;
        
        if (!code || !discount) {
            return res.status(400).json({ error: 'Código e desconto são obrigatórios' });
        }
        
        const coupon = {
            id: `coupon_${Date.now()}`,
            code: code.toUpperCase(),
            discount: parseFloat(discount),
            type: type || 'percent', // 'percent' ou 'fixed'
            min_value: parseFloat(minValue) || 0,
            max_uses: parseInt(maxUses) || 0,
            current_uses: 0,
            valid_until: validUntil || null,
            is_active: true,
            description: description || `Desconto ${type === 'fixed' ? 'R$' : ''}${discount}${type !== 'fixed' ? '%' : ''}`,
            created_at: new Date().toISOString()
        };
        
        // Salvar no Supabase se disponível
        if (supabase) {
            const { error } = await supabase.from('coupons').upsert([coupon], { onConflict: 'id' });
            if (error) console.error('[COUPON] Erro Supabase:', error);
        }
        
        // Salvar no cache
        if (!crmCache.coupons) crmCache.coupons = [];
        crmCache.coupons.push(coupon);
        
        console.log(`[COUPON] Criado: ${coupon.code} - ${coupon.description}`);
        
        res.json({ success: true, coupon });
        
    } catch (error) {
        console.error('[COUPON] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// SOCKET.IO — CONEXÕES EM TEMPO REAL
// ============================================================================
io.on('connection', (socket) => {
    console.log(`[SOCKET.IO] Cliente conectado: ${socket.id} (total: ${io.engine?.clientsCount || '?'})`);
    
    // Enviar estado atual ao connectar (sync imediato)
    socket.emit('sync-state', {
        pendingMessages: realtimeMessages.length,
        lastMessageAt: realtimeMessages[0]?.receivedAt || null,
        connectedAt: new Date().toISOString()
    });
    
    // Cliente se inscreve em um chat específico
    socket.on('join-chat', (jid) => {
        socket.join(`chat:${jid}`);
        console.log(`[SOCKET.IO] ${socket.id} entrou no chat: ${jid}`);
    });
    
    // Cliente sai de um chat
    socket.on('leave-chat', (jid) => {
        socket.leave(`chat:${jid}`);
    });
    
    // Ping/pong keep-alive customizado
    socket.on('ping-crm', () => {
        socket.emit('pong-crm', { ts: Date.now() });
    });
    
    socket.on('disconnect', (reason) => {
        console.log(`[SOCKET.IO] Cliente desconectado: ${socket.id} (${reason})`);
    });
});

// ============================================================================
// REGISTRAR WEBHOOK NA EVOLUTION API (auto-setup)
// ============================================================================
async function registerEvolutionWebhook() {
    try {
        // Detectar URL pública do servidor
        const PUBLIC_URL = process.env.PUBLIC_URL || process.env.EASYPANEL_URL || `https://cjota-crm.9eo9b2.easypanel.host`;
        const webhookUrl = `${PUBLIC_URL}/api/evolution/webhook`;
        
        console.log(`[WEBHOOK] Registrando webhook na Evolution API: ${webhookUrl}`);
        
        const response = await fetch(`${EVOLUTION_URL}/webhook/set/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                webhook_by_events: false,
                webhook_base64: false,
                events: [
                    'MESSAGES_UPSERT',
                    'MESSAGES_UPDATE',
                    'CONNECTION_UPDATE',
                    'SEND_MESSAGE'
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`[WEBHOOK] ✅ Webhook registrado com sucesso:`, data?.webhook?.url || webhookUrl);
        } else {
            const errorText = await response.text();
            console.warn(`[WEBHOOK] ⚠️ Falha ao registrar (${response.status}):`, errorText);
        }
    } catch (error) {
        console.warn(`[WEBHOOK] ⚠️ Erro ao registrar webhook:`, error.message);
    }
}

// ============================================================================
// DELTA SYNC — Buscar mensagens perdidas desde última conexão
// ============================================================================
async function deltaSync(sinceTimestamp) {
    try {
        const since = sinceTimestamp || (Date.now() - 5 * 60 * 1000); // últimos 5 min por padrão
        console.log(`[DELTA SYNC] Buscando mensagens desde ${new Date(since).toISOString()}`);
        
        const response = await fetch(`${EVOLUTION_URL}/chat/findMessages/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                where: {
                    timestamp: { $gte: Math.floor(since / 1000) }
                },
                limit: 200
            })
        });
        
        if (!response.ok) {
            console.warn(`[DELTA SYNC] Falha HTTP ${response.status}`);
            return 0;
        }
        
        const data = await response.json();
        const messages = Array.isArray(data) ? data : (data?.messages?.records || data?.messages || []);
        let synced = 0;
        
        // Set criado UMA VEZ fora do loop (era O(n²) antes!)
        const existingIds = new Set(realtimeMessages.map(m => m.id));

        messages.forEach(msg => {
            const key = msg.key || {};
            const jid = key.remoteJid || '';
            if (!key.id || existingIds.has(key.id)) return;
            const realtimeMsg = {
                id: key.id || `delta_${Date.now()}_${synced}`,
                jid,
                fromMe: key.fromMe || false,
                pushName: msg.pushName || '',
                text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
                timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
                receivedAt: new Date().toISOString(),
                isGroup: jid.includes('@g.us'),
                raw: msg
            };
            realtimeMessages.unshift(realtimeMsg);
            existingIds.add(key.id); // Não emitir duplicatas dentro do mesmo batch
            io.emit('new-message', realtimeMsg);
            io.to(`chat:${jid}`).emit('chat-message', realtimeMsg);
            synced++;
        });
        
        if (realtimeMessages.length > 500) realtimeMessages = realtimeMessages.slice(0, 500);
        console.log(`[DELTA SYNC] ✅ ${synced} mensagens novas sincronizadas de ${messages.length} encontradas`);
        return synced;
    } catch (error) {
        console.error(`[DELTA SYNC] Erro:`, error.message);
        return 0;
    }
}

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Central de Atendimento pronta.');
    console.log('Anny AI disponível em /api/anny');
    console.log(`Evolution API: ${EVOLUTION_URL} (instância: ${INSTANCE_NAME})`);
    console.log(`Webhook Evolution: http://localhost:${PORT}/api/evolution/webhook`);
    console.log(`Socket.IO: ws://localhost:${PORT} (real-time ativo)`);
    
    // Iniciar monitoramento de conexão WhatsApp
    startHealthCheck();
    
    // Registrar webhook na Evolution API automaticamente
    setTimeout(() => registerEvolutionWebhook(), 3000);
});
