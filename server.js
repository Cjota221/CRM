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
            }),
            fetch(`${EVOLUTION_URL}/chat/findContacts/${INSTANCE_NAME}`, { 
                method: 'POST',
                headers: evolutionHeaders,
                body: JSON.stringify({})
            }),
            fetch(`${EVOLUTION_URL}/group/fetchAllGroups/${INSTANCE_NAME}`, {
                method: 'GET',
                headers: evolutionHeaders
            })
        ]);
        
        const chatsData = await chatsResponse.json();
        const contactsData = await contactsResponse.json();
        const groupsData = await groupsResponse.json();
        
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
        
        // Enriquecer chats
        const enrichedChats = chats.map(chat => {
            const jid = chat.remoteJid || chat.id;
            const isGroup = jid?.includes('@g.us');
            
            let name, profilePicUrl, isGroupChat = isGroup, isCommunity = false, participantsCount = 0;
            
            if (isGroup && groupsMap[jid]) {
                // É um grupo
                name = groupsMap[jid].name;
                profilePicUrl = groupsMap[jid].pictureUrl;
                isCommunity = groupsMap[jid].isCommunity;
                participantsCount = groupsMap[jid].participantsCount;
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
                isGroup: isGroupChat,
                isCommunity,
                participantsCount
            };
        });
        
        // Adicionar grupos que não estão na lista de chats (sem mensagens recentes)
        groups.forEach(group => {
            if (!chats.find(c => (c.remoteJid || c.id) === group.id)) {
                enrichedChats.push({
                    remoteJid: group.id,
                    name: group.subject,
                    isGroup: true,
                    isCommunity: group.isCommunity || false,
                    profilePicUrl: group.pictureUrl,
                    participantsCount: group.participants?.length || group.size || 0,
                    lastMessage: null
                });
            }
        });
        
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
                // Evolution API v2 - áudio deve ser URL ou base64 válido
                // Remover prefixo data: se existir e recriar no formato correto
                let audioBase64 = media;
                if (audioBase64.includes(',')) {
                    audioBase64 = audioBase64.split(',')[1]; // Pegar só o base64
                }
                // Enviar como data URI
                body.audio = `data:audio/mp4;base64,${audioBase64}`;
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

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Central de Atendimento pronta.');
    console.log('Anny AI disponível em /api/anny');
});
