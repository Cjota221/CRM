const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const fetch = require('node-fetch');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// ============================================================================
// SISTEMA DE AUTENTICAÇÃO
// ============================================================================
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas

// Armazena sessões ativas em memória { token: { user, createdAt } }
const activeSessions = new Map();

function generateSessionToken() {
    return crypto.randomBytes(48).toString('hex');
}

function cleanExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of activeSessions) {
        if (now - session.createdAt > SESSION_MAX_AGE) {
            activeSessions.delete(token);
        }
    }
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
    checkInterval: 5 * 60 * 1000, // 5 minutos
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
    if (!raw) return '';
    let cleaned = String(raw).replace(/\D/g, '');
    // Remover DDI 55 apenas se o número tiver 12+ dígitos (DDI + DDD + número)
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
        cleaned = cleaned.substring(2);
    }
    // Se ainda ficou com mais de 11, pegar últimos 11
    if (cleaned.length > 11) {
        cleaned = cleaned.slice(-11);
    }
    return cleaned;
}

/**
 * Garantir que o número tenha DDI 55 (Brasil) para envio via Evolution API
 * Recebe número normalizado (sem DDI) e retorna com DDI
 */
function ensureDDI55(phone) {
    if (!phone) return '';
    const cleaned = String(phone).replace(/\D/g, '');
    // Se já começa com 55 e tem 12+ dígitos, já tem DDI
    if (cleaned.startsWith('55') && cleaned.length >= 12) return cleaned;
    // Se tem 10-11 dígitos (DDD + número), adicionar 55
    if (cleaned.length >= 10 && cleaned.length <= 11) return '55' + cleaned;
    // Se tem 12-13 dígitos e começa com 55, já é válido
    if (cleaned.length >= 12) return cleaned;
    // Fallback: adicionar 55
    return '55' + cleaned;
}

/**
 * Buscar cliente por telefone no cache com lógica fuzzy
 * Verifica TODOS os campos de telefone (não short-circuit)
 * Faz match exato + fuzzy (últimos 9 dígitos)
 */
function findClientByPhone(normalizedPhone) {
    if (!crmCache.clients || crmCache.clients.length === 0) return null;
    if (!normalizedPhone || normalizedPhone.length < 8) return null;
    
    const last9 = normalizedPhone.slice(-9);
    
    // Primeiro: match exato em qualquer campo
    let client = crmCache.clients.find(c => {
        const phones = [
            normalizePhoneServer(c.telefone),
            normalizePhoneServer(c.celular),
            normalizePhoneServer(c.phone),
            normalizePhoneServer(c.whatsapp)
        ].filter(p => p.length >= 8);
        return phones.some(p => p === normalizedPhone);
    });
    
    // Segundo: fuzzy match (últimos 9 dígitos) caso exato falhe
    if (!client) {
        client = crmCache.clients.find(c => {
            const phones = [
                normalizePhoneServer(c.telefone),
                normalizePhoneServer(c.celular),
                normalizePhoneServer(c.phone),
                normalizePhoneServer(c.whatsapp)
            ].filter(p => p.length >= 8);
            return phones.some(p => p.slice(-9) === last9);
        });
    }
    
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
    
    if (!FACILZAP_TOKEN) return false;
    
    try {
        crmCacheLoading = true;
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
        crmCache = { clients, orders, products: productsEnriched, lastUpdate: new Date() };
        console.log(`[CACHE] ✅ Auto-carregado: ${clients.length} clientes, ${orders.length} pedidos, ${productsEnriched.length} produtos`);
        return true;
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

        const preco = parseFloat(p.preco_promocional || p.preco_venda || p.preco || p.valor || 0) || 0;

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

        // Estoque: verificar múltiplos campos possíveis
        const estoque = parseInt(
            p.estoque ?? p.estoque_atual ?? p.quantidade_estoque ?? p.stock ?? p.qty ?? -1
        );

        // Referência / SKU
        const referencia = p.referencia || p.codigo || p.sku || p.ref || '';

        return {
            ...p,
            preco,
            imagem: imagem || 'https://via.placeholder.com/300x300?text=Sem+Foto',
            link_oficial: `${SITE_BASE_URL}/produto/${slug}`,
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
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;

// Configuração Evolution API (WhatsApp) - VPS Hostinger/Easypanel
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api.cjota.site'; 
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'EB6B5AB56A35-43C4-B590-1188166D4E7A';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'Cjota';
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://seusite.com.br'; // Para gerar links de produtos

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1000mb' })); // Aumenta limite de JSON para sincronização grande

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
        if (!SUPA_KEY) {
            // Fallback: env vars
            const envUser = process.env.CRM_USER || 'admin';
            const envPass = process.env.CRM_PASS || 'admin';
            if (username === envUser && password === envPass) {
                const token = generateSessionToken();
                activeSessions.set(token, { user: username, createdAt: Date.now() });
                res.setHeader('Set-Cookie', `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax`);
                return res.json({ success: true, message: 'Login realizado com sucesso' });
            }
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
        if (!isAuthenticated(req)) return res.redirect('/login.html');
        return next();
    }

    // Proteger páginas HTML
    if (reqPath.endsWith('.html') && reqPath !== '/login.html') {
        if (!isAuthenticated(req)) return res.redirect('/login.html');
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

        res.json({ clients, orders, products: productsEnriched });
        
        // Salvar em cache para uso em endpoints de lookup
        crmCache = {
            clients,
            orders,
            products: productsEnriched,
            lastUpdate: new Date()
        };
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
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
                
                // Salvar carrinho abandonado
                const existingCartIndex = abandonedCarts.findIndex(c => c.id === dados.id);
                if (existingCartIndex >= 0) {
                    abandonedCarts[existingCartIndex] = processedData;
                } else {
                    abandonedCarts.unshift(processedData);
                }
                // Manter apenas os últimos 100
                abandonedCarts = abandonedCarts.slice(0, 100);
                
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
    
    console.log('[HEALTH CHECK] Iniciando monitoramento de conexão (intervalo: 5min)');
    
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
            
            // Se ainda não tem nome, formatar telefone
            if (!name && jid) {
                const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
                if (phone.length > 8) {
                    name = `+${phone.slice(0,2)} ${phone.slice(2)}`;
                } else {
                    name = phone;
                }
            }
            
            return {
                ...chat,
                name: name || 'Desconhecido',
                pushName: name || chat.pushName
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
app.get('/api/whatsapp/all-chats', async (req, res) => {
    try {
        // Buscar chats, contatos e grupos em paralelo
        const [chatsResponse, contactsResponse, groupsResponse] = await Promise.all([
            fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE_NAME}`, { 
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({
                    where: {},
                    options: { limit: 100, order: "DESC" }
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
        
        console.log('=== DEBUG BACKEND ===');
        console.log('Total chats recebidos:', chatsData?.data?.length || chatsData?.length || 0);
        console.log('Total grupos recebidos:', groupsData?.data?.length || groupsData?.length || 0);
        if (chatsData?.data?.[0]) {
            console.log('Exemplo de chat (data[0]):', JSON.stringify(chatsData.data[0], null, 2));
        } else if (chatsData?.[0]) {
            console.log('Exemplo de chat ([0]):', JSON.stringify(chatsData[0], null, 2));
        }
        if (groupsData?.data?.[0]) {
            console.log('Exemplo de grupo (data[0]):', JSON.stringify(groupsData.data[0], null, 2));
        } else if (groupsData?.[0]) {
            console.log('Exemplo de grupo ([0]):', JSON.stringify(groupsData[0], null, 2));
        }
        
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
                    const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
                    if (phone.length > 8) {
                        name = `+${phone.slice(0,2)} ${phone.slice(2)}`;
                    } else {
                        name = phone;
                    }
                }
                
                profilePicUrl = chat.profilePicUrl;
            }
            
            return {
                ...chat,
                name: name || 'Desconhecido',
                pushName: name || chat.pushName,
                profilePicUrl,
                isGroup: isGroupChat,  // CRÍTICO: Marcar explicitamente
                isCommunity,
                participantsCount
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
        
        // Se ainda não encontrar, tentar terceira forma (sem where)
        // APENAS para @s.whatsapp.net — @lid exige match exato, não faz sentido buscar tudo
        const isLidJid = String(remoteJid).includes('@lid');
        if (!data?.messages?.length && !data?.data?.length && !isLidJid) {
            console.log(`[API] Tentativa 3: buscando mensagens recentes e filtrando...`);
            response = await fetch(url, {
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({
                    options: { limit: 50, order: "DESC" } 
                })
            });
            data = await response.json();
            
            // Filtrar manualmente com normalização de telefone
            const requestPhoneNormalized = normalizePhone(remoteJid);
            const isGroupRequest = String(remoteJid).includes('@g.us');
            
            if (data?.messages && Array.isArray(data.messages)) {
                data.messages = data.messages.filter(msg => {
                    const msgRemoteJid = msg.key?.remoteJid || msg.remoteJid || '';
                    
                    // Se for grupo, comparar JID completo
                    if (isGroupRequest) {
                        return msgRemoteJid === remoteJid || 
                               msgRemoteJid.replace(/@g\.us$/, '') === remoteJid.replace(/@g\.us$/, '');
                    }
                    
                    // Para contatos, comparar JID exato primeiro
                    if (msgRemoteJid === remoteJid) return true;
                    
                    // Fallback: normalização de telefone
                    const msgPhoneNormalized = normalizePhone(msgRemoteJid);
                    return msgPhoneNormalized === requestPhoneNormalized ||
                           (msgPhoneNormalized.length >= 9 && requestPhoneNormalized.length >= 9 &&
                            msgPhoneNormalized.slice(-9) === requestPhoneNormalized.slice(-9));
                });
            }
            console.log(`[API] Tentativa 3 (todas + filtro): mensagens encontradas = ${data?.messages?.length || 0}`);
        }
        
        console.log(`[API] Resposta final:`, JSON.stringify(data).substring(0, 300));
        
        // Processar mensagens para adicionar URLs de mídia acessíveis
        if (data && Array.isArray(data.messages)) {
            data.messages = await Promise.all(data.messages.map(async (msg) => {
                // Se tem audioMessage com mediaKey, gerar URL de download
                if (msg.message?.audioMessage) {
                    const audioMsg = msg.message.audioMessage;
                    if (audioMsg.url) {
                        // URL direta da Evolution API (já acessível)
                        audioMsg.playableUrl = audioMsg.url;
                    } else if (msg.key?.id) {
                        // Criar URL de proxy local para baixar o áudio
                        audioMsg.playableUrl = `/api/whatsapp/media/${msg.key.id}`;
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
                    await supabase.from('crm_tags').delete().neq('id', 0);
                    const { error } = await supabase.from('crm_tags').insert(tags);
                    if (error) console.error('Erro tags:', error);
                    results.tags = tags.length;
                }
                if (chat_tags?.length > 0) {
                    await supabase.from('crm_chat_tags').delete().neq('id', 0);
                    const { error } = await supabase.from('crm_chat_tags').insert(chat_tags);
                    if (error) console.error('Erro chat_tags:', error);
                    results.chat_tags = chat_tags.length;
                }
                if (quick_replies?.length > 0) {
                    await supabase.from('crm_quick_replies').delete().neq('id', 0);
                    const { error } = await supabase.from('crm_quick_replies').insert(quick_replies);
                    if (error) console.error('Erro quick_replies:', error);
                    results.quick_replies = quick_replies.length;
                }
                if (client_notes?.length > 0) {
                    const { error } = await supabase.from('crm_client_notes').upsert(client_notes, { onConflict: 'id' });
                    if (error) console.error('Erro client_notes:', error);
                    results.client_notes = client_notes.length;
                }
                if (snoozed?.length > 0) {
                    await supabase.from('crm_snoozed').delete().neq('chat_id', '');
                    const { error } = await supabase.from('crm_snoozed').insert(snoozed);
                    if (error) console.error('Erro snoozed:', error);
                    results.snoozed = snoozed.length;
                }
                if (scheduled?.length > 0) {
                    const { error } = await supabase.from('crm_scheduled').upsert(scheduled, { onConflict: 'id' });
                    if (error) console.error('Erro scheduled:', error);
                    results.scheduled = scheduled.length;
                }
                if (ai_tags?.length > 0) {
                    const { error } = await supabase.from('crm_ai_tags').upsert(ai_tags, { onConflict: 'client_id' });
                    if (error) console.error('Erro ai_tags:', error);
                    results.ai_tags = ai_tags.length;
                }
                if (coupon_assignments?.length > 0) {
                    const { error } = await supabase.from('crm_coupon_assignments').upsert(coupon_assignments, { onConflict: 'id' });
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
                    supabase.from('crm_tags').select('*').order('id'),
                    supabase.from('crm_chat_tags').select('*'),
                    supabase.from('crm_quick_replies').select('*').order('id'),
                    supabase.from('crm_client_notes').select('*'),
                    supabase.from('crm_snoozed').select('*'),
                    supabase.from('crm_scheduled').select('*'),
                    supabase.from('crm_ai_tags').select('*'),
                    supabase.from('crm_coupon_assignments').select('*')
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
        const { number, text } = req.body; 
        
        // Normalizar número - remover @s.whatsapp.net se presente (a API adiciona automaticamente)
        let phoneNumber = number;
        if (phoneNumber.includes('@s.whatsapp.net')) {
            phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
        }
        // Para grupos, manter @g.us
        if (phoneNumber.includes('@g.us')) {
            // Para grupos, enviar como está
            phoneNumber = number;
        }
        // Manter @lid se for lead do Meta
        if (phoneNumber.includes('@lid')) {
            // Para @lid, enviar como está
            phoneNumber = number;
        }
        
        console.log(`[WhatsApp] Enviando mensagem para: ${phoneNumber}`);

        const url = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
        
        // Evolution API v2 - formato correto
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                number: phoneNumber,
                text: text
            })
        });
        
        const data = await response.json();
        console.log(`[WhatsApp] Resposta:`, JSON.stringify(data).slice(0, 200));
        
        // Verificar se houve erro
        if (data.error || data.status === 400 || data.status === 'error') {
            console.error('[WhatsApp] Erro na resposta:', data);
            return res.status(400).json({ error: data.response?.message || data.message || data.error || 'Erro ao enviar mensagem' });
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
        const { number, mediaType, media, caption, fileName } = req.body;
        
        // Normalizar número
        let phoneNumber = number;
        if (phoneNumber.includes('@s.whatsapp.net')) {
            phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
        }
        // Manter @g.us para grupos
        if (!phoneNumber.includes('@g.us') && !phoneNumber.includes('@lid')) {
            phoneNumber = phoneNumber.replace(/@.*/, '');
        }
        
        console.log(`[WhatsApp] Enviando ${mediaType} para: ${phoneNumber}`);
        
        // Determinar endpoint correto baseado no tipo de mídia
        let endpoint;
        let body = { number: phoneNumber };
        
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
                // Evolution API v2 - converter base64 em buffer direto
                let audioBase64 = media;
                if (audioBase64.includes(',')) {
                    audioBase64 = audioBase64.split(',')[1]; // Pegar só o base64
                }
                
                // Tentar enviar como base64 puro (sem data URI)
                body.audio = audioBase64;
                
                console.log('[WhatsApp] Áudio base64 length:', audioBase64.length);
                console.log('[WhatsApp] Body sendo enviado:', JSON.stringify({...body, audio: 'BASE64_OMITIDO'}).slice(0, 100));
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
// ANNY AI - Business Intelligence Assistant (LOCAL DEV)
// ============================================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const ANNY_SYSTEM_PROMPT = `Você é a Anny, a estrategista de vendas da CJOTA Rasteirinhas, uma fábrica atacadista de calçados femininos.

NOSSO NEGÓCIO:
- Focamos em mulheres (25-45 anos), revendedoras e lojistas
- Temos pedido mínimo de 5 peças (atacado)
- Fabricamos grades personalizadas com logo (mínimo 2 grades, 15-20 dias de produção)
- Temos o projeto 'C4 Franquias' (site pronto para revendedoras)
- Frete grátis acima de R$ 2.000

SUA MISSÃO:
- Ajudar a empresa a recuperar o faturamento de R$ 200k/mês (atualmente em R$ 40k)
- Identificar oportunidades na base de clientes inativos
- Sugerir ações de venda agressivas mas empáticas

REGRAS DE ANÁLISE:
- Considere o padrão de compra atacado
- Se alguém comprava muito (grades fechadas) e parou, é prioridade máxima
- Use o frete grátis (acima de R$ 2k) como argumento de fechamento
- Clientes com ticket médio > R$ 500 são VIPs
- Clientes inativos há mais de 30 dias precisam de atenção

FORMATO DE RESPOSTA:
- Seja direta e profissional
- Use dados concretos quando disponíveis
- Sugira ações específicas
- Não use emojis excessivos`;

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
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'GROQ_API_KEY não configurada no .env' });
        }

        const { message, history = [], clientsData = [] } = req.body;

        // Construir mensagens
        const messages = [
            { role: 'system', content: ANNY_SYSTEM_PROMPT },
            ...history.map(h => ({ role: h.sender === 'user' ? 'user' : 'assistant', content: h.text })),
            { role: 'user', content: message }
        ];

        // Chamar Groq API
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages,
                tools: ANNY_TOOLS,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            throw new Error(`Groq API error: ${groqResponse.status} - ${errorText}`);
        }

        let data = await groqResponse.json();
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

            const secondResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
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
        
        // Se tiver integração com Supabase, descomentar:
        // const { data } = await supabase
        //     .from('clients')
        //     .update({ name: newName })
        //     .eq('clean_phone', phone);
        
        res.json({
            success: true,
            message: 'Nome sincronizado',
            phone,
            newName
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
let chatModes = {}; // { 'jid': 'ia' | 'humano' } - controle de quem atende

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
                    
                    // Extrair texto da mensagem
                    let text = '';
                    const message = msg.message || {};
                    if (message.conversation) text = message.conversation;
                    else if (message.extendedTextMessage?.text) text = message.extendedTextMessage.text;
                    else if (message.imageMessage?.caption) text = message.imageMessage.caption;
                    else if (message.videoMessage?.caption) text = message.videoMessage.caption;
                    else if (message.documentMessage) text = '[Documento]';
                    else if (message.audioMessage) text = '[Áudio]';
                    else if (message.stickerMessage) text = '[Figurinha]';
                    else if (message.contactMessage) text = '[Contato]';
                    else if (message.locationMessage) text = '[Localização]';
                    
                    const realtimeMsg = {
                        id: key.id || `rt_${Date.now()}`,
                        jid,
                        fromMe,
                        pushName,
                        text,
                        timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
                        receivedAt: new Date().toISOString(),
                        isGroup: jid.includes('@g.us'),
                        raw: msg
                    };
                    
                    // Salvar na fila
                    realtimeMessages.unshift(realtimeMsg);
                    if (realtimeMessages.length > 500) realtimeMessages = realtimeMessages.slice(0, 500);
                    
                    console.log(`[MSG ${fromMe ? 'ENVIADA' : 'RECEBIDA'}] ${pushName || jid}: ${text.substring(0, 80)}`);
                });
                break;
            }
            
            case 'messages.update':
            case 'MESSAGES_UPDATE': {
                console.log('[EVOLUTION WEBHOOK] Status de mensagem atualizado');
                break;
            }
            
            case 'connection.update':
            case 'CONNECTION_UPDATE': {
                const state = payload.data?.state || payload.state;
                console.log(`[EVOLUTION WEBHOOK] Conexão: ${state}`);
                if (state === 'open') {
                    ConnectionMonitor.updateStatus('connected', 'Webhook confirmou conexão');
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
            clientOrders = crmCache.orders.filter(o => 
                o.id_cliente === client.id || 
                o.cliente_id === client.id ||
                String(o.id_cliente) === String(client.id) ||
                String(o.cliente_id) === String(client.id)
            );
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
        
        // Calcular métricas
        const totalSpent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.valor_total) || 0), 0);
        const avgTicket = clientOrders.length > 0 ? totalSpent / clientOrders.length : 0;
        
        // Ordenar pedidos por data
        const sortedOrders = clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data));
        const lastOrder = sortedOrders[0];
        const lastPurchaseDate = lastOrder ? new Date(lastOrder.data) : null;
        const daysSinceLastPurchase = lastPurchaseDate ? 
            Math.floor((new Date() - lastPurchaseDate) / (1000 * 60 * 60 * 24)) : 999;
        
        // Determinar status
        let status, statusColor, statusEmoji;
        if (clientOrders.length >= 5) {
            status = 'Cliente VIP';
            statusColor = 'purple';
            statusEmoji = '👑';
        } else if (clientOrders.length >= 2) {
            status = 'Cliente Recorrente';
            statusColor = 'green';
            statusEmoji = '⭐';
        } else if (clientOrders.length === 1) {
            status = 'Cliente';
            statusColor = 'blue';
            statusEmoji = '✅';
        } else {
            status = 'Lead Cadastrado';
            statusColor = 'gray';
            statusEmoji = '📝';
        }
        
        // Produtos mais comprados (frequência)
        const productCounts = {};
        clientOrders.forEach(order => {
            const items = order.itens || order.products || [];
            items.forEach(item => {
                const name = item.nome || item.name || item.produto || 'Produto';
                productCounts[name] = (productCounts[name] || 0) + (item.quantidade || 1);
            });
        });
        
        const frequentProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, qty]) => ({ name, qty }));
        
        // Últimos 3 pedidos resumidos
        const recentOrders = sortedOrders.slice(0, 3).map(o => ({
            id: o.id || o.codigo,
            date: o.data,
            total: parseFloat(o.valor_total) || 0,
            status: o.status || 'Concluído',
            items: (o.itens || o.products || []).length
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
            metrics: {
                totalSpent: totalSpent.toFixed(2),
                avgTicket: avgTicket.toFixed(2),
                ordersCount: clientOrders.length,
                lastPurchaseDate: lastPurchaseDate?.toISOString(),
                daysSinceLastPurchase
            },
            orders: recentOrders,
            products: frequentProducts,
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
        const { name, message, imageUrl, contacts, segment, batchSize, batchInterval, scheduledAt, couponCode } = req.body;
        
        if (!name || !message || !contacts || contacts.length === 0) {
            return res.status(400).json({ error: 'Nome, mensagem e contatos são obrigatórios' });
        }
        
        const campaign = {
            id: `camp_${Date.now()}`,
            name,
            message,
            imageUrl: imageUrl || null,
            segment: segment || 'custom',
            contacts: contacts, // [{ id, name, phone }]
            totalContacts: contacts.length,
            sentCount: 0,
            failedCount: 0,
            status: scheduledAt ? 'scheduled' : 'ready',
            batchSize: batchSize || 10,
            batchInterval: batchInterval || 20, // minutos
            scheduledAt: scheduledAt || null,
            couponCode: couponCode || null,
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            history: [] // Log de envios
        };
        
        campaigns.push(campaign);
        
        console.log(`[CAMPAIGN] Criada: "${name}" - ${contacts.length} contatos`);
        
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
    const { contacts, batchSize, batchInterval, message, imageUrl, couponCode } = campaign;
    
    let currentIndex = campaign.sentCount; // Retomar de onde parou
    
    while (currentIndex < contacts.length) {
        // Verificar se campanha foi pausada ou cancelada
        const current = campaigns.find(c => c.id === campaign.id);
        if (!current || current.status !== 'running') {
            console.log(`[CAMPAIGN] "${campaign.name}" parada em ${currentIndex}/${contacts.length}`);
            return;
        }
        
        // Processar batch
        const batch = contacts.slice(currentIndex, currentIndex + batchSize);
        console.log(`[CAMPAIGN] "${campaign.name}" - Lote ${Math.floor(currentIndex / batchSize) + 1}: ${batch.length} mensagens`);
        
        for (const contact of batch) {
            // Verificar status novamente
            const check = campaigns.find(c => c.id === campaign.id);
            if (!check || check.status !== 'running') return;
            
            try {
                // Personalizar mensagem
                let personalizedMsg = message
                    .replace(/\{\{nome\}\}/gi, contact.name || 'Cliente')
                    .replace(/\{\{telefone\}\}/gi, contact.phone || '')
                    .replace(/\{\{cidade\}\}/gi, contact.city || '')
                    .replace(/\{\{cupom\}\}/gi, couponCode || '');
                
                // Normalizar telefone para envio
                let phoneNumber = contact.phone.replace(/\D/g, '');
                if (!phoneNumber.startsWith('55') && phoneNumber.length <= 11) {
                    phoneNumber = '55' + phoneNumber;
                }
                
                // Enviar via Evolution API
                const url = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: evolutionHeaders,
                    body: JSON.stringify({
                        number: phoneNumber,
                        text: personalizedMsg
                    })
                });
                
                const data = await response.json();
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
                } else {
                    campaign.failedCount++;
                }
                
                console.log(`[CAMPAIGN] ${success ? '✅' : '❌'} ${contact.name} (${phoneNumber})`);
                
                // Delay anti-ban: 3-7 segundos entre mensagens
                const delay = 3000 + Math.random() * 4000;
                await new Promise(r => setTimeout(r, delay));
                
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
        // Tentar buscar do Supabase
        if (supabase) {
            const { data, error } = await supabase
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

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Central de Atendimento pronta.');
    console.log('Anny AI disponível em /api/anny');
    console.log(`Evolution API: ${EVOLUTION_URL} (instância: ${INSTANCE_NAME})`);
    console.log(`Webhook Evolution: http://localhost:${PORT}/api/evolution/webhook`);
    
    // Iniciar monitoramento de conexão WhatsApp
    startHealthCheck();
});
