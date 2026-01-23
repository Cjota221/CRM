const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env
const fetch = require('node-fetch');
const path = require('path');
const https = require('https'); 

const app = express();
const PORT = 3000;

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
// Token da FacilZap
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;

// Configuração Evolution API (WhatsApp)
// Preencha com os dados da sua instância Evolution
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080'; 
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'SUA_API_KEY_GLOBAL_EVOLUTION';
const INSTANCE_NAME = 'crm_atendimento';
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://seusite.com.br'; // Para gerar links de produtos

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1000mb' })); // Aumenta limite de JSON para sincronização grande
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

        // Enriquecer produtos com Link Oficial
        const productsEnriched = products.map(p => {
             const slug = p.slug || p.url_amigavel || p.id;
             return {
                 ...p,
                 link_oficial: `${SITE_BASE_URL}/produto/${slug}` 
             };
        });

        res.json({ clients, orders, products: productsEnriched });
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
                processedData = {
                    tipo: 'carrinho_abandonado',
                    id: dados.id,
                    cliente: {
                        id: dados.cliente?.id,
                        nome: dados.cliente?.nome,
                        whatsapp: dados.cliente?.whatsapp,
                        email: dados.cliente?.email
                    },
                    valor_total: dados.valor_total,
                    quantidade_produtos: dados.quantidade_produtos,
                    produtos: dados.produtos?.map(p => ({
                        nome: p.nome,
                        variacao: p.variacao?.nome,
                        quantidade: p.quantidade,
                        preco: p.preco
                    })),
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
// ROTAS WHATSAPP (EVOLUTION API)
// ============================================================================
const evolutionHeaders = {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
};

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

// 3. Listar Chats
app.get('/api/whatsapp/chats', async (req, res) => {
    try {
        const url = `${EVOLUTION_URL}/chat/findChats/${INSTANCE_NAME}`;
        // Evolution v2 usa POST para findChats
        const response = await fetch(url, { 
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                where: {},
                options: { 
                    limit: 50,
                    order: "DESC"
                }
            })
        });
        const data = await response.json();
        // Garantir que seja array
        res.json(Array.isArray(data) ? data : (data.data || []));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Listar Mensagens de um Chat
app.post('/api/whatsapp/messages/fetch', async (req, res) => {
    try {
        const { remoteJid } = req.body;
        const url = `${EVOLUTION_URL}/chat/findMessages/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                where: { key: { remoteJid } },
                options: { limit: 50, order: "DESC" } 
            })
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
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
                const { clients, products, orders, coupons, campaigns, settings } = data;
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

                return res.json({ success: true, synced: results });
            }

            case 'loadAll': {
                const [clientsRes, productsRes, ordersRes, couponsRes, campaignsRes, settingsRes] = await Promise.all([
                    supabase.from('clients').select('*'),
                    supabase.from('products').select('*'),
                    supabase.from('orders').select('*'),
                    supabase.from('coupons').select('*'),
                    supabase.from('campaigns').select('*'),
                    supabase.from('settings').select('*').eq('id', 'main').single()
                ]);

                return res.json({
                    clients: clientsRes.data || [],
                    products: productsRes.data || [],
                    orders: ordersRes.data || [],
                    coupons: couponsRes.data || [],
                    campaigns: campaignsRes.data || [],
                    settings: settingsRes.data || null
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
        
        // Normalizar número
        let remoteJid = number;
        if (!remoteJid.includes('@')) {
            remoteJid = remoteJid + '@s.whatsapp.net';
        }

        const url = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({
                number: remoteJid,
                options: { delay: 1200, presence: 'composing' },
                textMessage: { text: text }
            })
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Central de Atendimento pronta.');
});
