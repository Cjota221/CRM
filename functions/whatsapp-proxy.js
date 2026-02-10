// ============================================================================
// WHATSAPP PROXY - Netlify Function
// Replica as rotas /api/whatsapp/* do server.js para ambiente Netlify
// ============================================================================

const fetch = require('node-fetch');

// Config Evolution API
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api.cjota.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'EB6B5AB56A35-43C4-B590-1188166D4E7A';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'Cjota';
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;

const evolutionHeaders = {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
};

// ============================================================================
// HELPERS
// ============================================================================
function normalizePhoneServer(raw) {
    if (!raw) return '';
    let cleaned = String(raw).replace(/\D/g, '');
    if (cleaned.startsWith('55') && cleaned.length >= 12) cleaned = cleaned.substring(2);
    if (cleaned.length > 11) cleaned = cleaned.slice(-11);
    return cleaned;
}

// Mini CRM cache (in-memory por invocação — cold start carrega novamente)
let crmCache = { clients: [], orders: [], products: [], lastUpdate: null };
let crmCacheLoading = false;

async function fetchAPI(url, token) {
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

async function fetchAllPages(endpoint, token, extraParams = '') {
    let allData = [], page = 1, hasMore = true;
    while (hasMore && page <= 20) {
        try {
            const data = await fetchAPI(`${endpoint}?page=${page}&length=100${extraParams}`, token);
            const items = data.data || [];
            if (items.length > 0) { allData = allData.concat(items); page++; }
            else hasMore = false;
        } catch { hasMore = false; }
    }
    return allData;
}

function findClientByPhone(normalizedPhone) {
    if (!crmCache.clients?.length || !normalizedPhone || normalizedPhone.length < 8) return null;
    const last9 = normalizedPhone.slice(-9);
    let client = crmCache.clients.find(c => {
        const phones = [c.telefone, c.celular, c.phone, c.whatsapp].map(p => normalizePhoneServer(p)).filter(p => p.length >= 8);
        return phones.some(p => p === normalizedPhone);
    });
    if (!client) {
        client = crmCache.clients.find(c => {
            const phones = [c.telefone, c.celular, c.phone, c.whatsapp].map(p => normalizePhoneServer(p)).filter(p => p.length >= 8);
            return phones.some(p => p.slice(-9) === last9);
        });
    }
    return client;
}

async function ensureCrmCache() {
    if (crmCache.clients?.length > 0) return true;
    if (crmCacheLoading || !FACILZAP_TOKEN) return false;
    try {
        crmCacheLoading = true;
        const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const di = twoYearsAgo.toISOString().split('T')[0];
        const df = new Date().toISOString().split('T')[0];
        const [clients, orders] = await Promise.all([
            fetchAllPages('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN),
            fetchAllPages('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN, `&filtros[data_inicial]=${di}&filtros[data_final]=${df}`)
        ]);
        crmCache = { clients, orders, products: [], lastUpdate: new Date() };
        return true;
    } catch { return false; }
    finally { crmCacheLoading = false; }
}

// ============================================================================
// MOCK DATA (fallback quando Evolution API offline)
// ============================================================================
function generateMockChats() {
    return [
        { id:'5562999998888@s.whatsapp.net', remoteJid:'5562999998888@s.whatsapp.net', name:'João Silva', pushName:'João Silva', profilePicUrl:null, unreadCount:2, timestamp:Date.now(), lastMessage:{ key:{id:'m1',remoteJid:'5562999998888@s.whatsapp.net'}, pushName:'João Silva', messageTimestamp:Math.floor(Date.now()/1000)-300, message:{conversation:'Oi, tudo certo?'} } },
        { id:'5561988776655@s.whatsapp.net', remoteJid:'5561988776655@s.whatsapp.net', name:'Maria Santos', pushName:'Maria Santos', profilePicUrl:null, unreadCount:0, timestamp:Date.now()-3600000, lastMessage:{ key:{id:'m2',remoteJid:'5561988776655@s.whatsapp.net'}, pushName:'Maria Santos', messageTimestamp:Math.floor(Date.now()/1000)-3600, message:{conversation:'Obrigada pela atenção!'} } },
        { id:'5563987654321@s.whatsapp.net', remoteJid:'5563987654321@s.whatsapp.net', name:'Pedro Costa', pushName:'Pedro Costa', profilePicUrl:null, unreadCount:1, timestamp:Date.now()-7200000, lastMessage:{ key:{id:'m3',remoteJid:'5563987654321@s.whatsapp.net'}, pushName:'Pedro Costa', messageTimestamp:Math.floor(Date.now()/1000)-7200, message:{conversation:'Qual é o valor?'} } }
    ];
}
function generateMockContacts() {
    return [
        { remoteJid:'5562999998888@s.whatsapp.net', pushName:'João Silva' },
        { remoteJid:'5561988776655@s.whatsapp.net', pushName:'Maria Santos' },
        { remoteJid:'5563987654321@s.whatsapp.net', pushName:'Pedro Costa' }
    ];
}
function generateMockGroups() {
    return [
        { id:'120363192837461928-1234@g.us', subject:'Equipe de Vendas', pictureUrl:null, isCommunity:false, participants:[{id:'5562999998888@s.whatsapp.net',isAdmin:true}] },
        { id:'120363192837461928-9876@g.us', subject:'Estratégia 2026', pictureUrl:null, isCommunity:false, participants:[{id:'5562999998888@s.whatsapp.net',isAdmin:true}] }
    ];
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function handleStatus() {
    try {
        const url = `${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`;
        const response = await fetch(url, { headers: evolutionHeaders });
        if (response.status === 404) return { statusCode: 200, body: JSON.stringify({ state: 'NOT_CREATED' }) };
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao conectar Evolution API: ' + error.message }) };
    }
}

async function handleConnectionStatus() {
    try {
        const url = `${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`;
        const response = await fetch(url, { headers: evolutionHeaders });
        let state = 'unknown', connected = false;
        if (response.status === 404) {
            state = 'NOT_CREATED';
        } else {
            const data = await response.json();
            state = data.instance?.state || data.state || 'unknown';
            connected = state === 'open';
        }
        return { statusCode: 200, body: JSON.stringify({
            status: connected ? 'connected' : 'disconnected',
            liveCheck: { connected, state }
        })};
    } catch (error) {
        return { statusCode: 200, body: JSON.stringify({ status: 'error', liveCheck: { connected: false, state: 'ERROR', reason: error.message } }) };
    }
}

async function handleConnect() {
    try {
        // 1. Check if already connected
        try {
            const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`, { headers: evolutionHeaders });
            if (stateRes.ok) {
                const stateData = await stateRes.json();
                if (stateData.instance?.state === 'open') {
                    return { statusCode: 200, body: JSON.stringify({ state: 'open', message: 'Instância já conectada', instance: stateData.instance }) };
                }
            }
        } catch (e) {}

        // 2. Try to create instance
        const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
            method: 'POST', headers: evolutionHeaders,
            body: JSON.stringify({ instanceName: INSTANCE_NAME, token: 'randomtoken123', qrcode: true, integration: 'WHATSAPP-BAILEYS' })
        });
        if (createRes.ok) {
            const createData = await createRes.json();
            if (createData.qrcode?.base64) {
                return { statusCode: 200, body: JSON.stringify({ base64: createData.qrcode.base64, code: createData.qrcode.code, pairingCode: createData.qrcode.pairingCode, instance: createData.instance }) };
            }
        }

        // 3. Call /connect
        const connectUrl = `${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`;
        let response = await fetch(connectUrl, { headers: evolutionHeaders });
        let data = await response.json();

        if (data && (data.count === 0 || (data.code === 200 && data.count === 0)) && !data.base64) {
            await fetch(`${EVOLUTION_URL}/instance/logout/${INSTANCE_NAME}`, { method: 'DELETE', headers: evolutionHeaders });
            await new Promise(r => setTimeout(r, 1500));
            response = await fetch(connectUrl, { headers: evolutionHeaders });
            data = await response.json();
        }

        return { statusCode: response.ok ? 200 : response.status, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleLogout(params) {
    try {
        const logoutRes = await fetch(`${EVOLUTION_URL}/instance/logout/${INSTANCE_NAME}`, { method: 'DELETE', headers: evolutionHeaders });
        const logoutData = await logoutRes.json();
        if (params.deleteInstance === 'true') {
            await fetch(`${EVOLUTION_URL}/instance/delete/${INSTANCE_NAME}`, { method: 'DELETE', headers: evolutionHeaders });
        }
        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'WhatsApp desconectado!', data: logoutData }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleForceReconnect() {
    try {
        await fetch(`${EVOLUTION_URL}/instance/restart/${INSTANCE_NAME}`, { method: 'PUT', headers: evolutionHeaders });
        await new Promise(r => setTimeout(r, 5000));
        const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`, { headers: evolutionHeaders });
        const stateData = await stateRes.json();
        let connected = stateData.instance?.state === 'open';
        if (!connected) {
            await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`, { headers: evolutionHeaders });
            await new Promise(r => setTimeout(r, 3000));
            const finalRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`, { headers: evolutionHeaders });
            const finalData = await finalRes.json();
            connected = finalData.instance?.state === 'open';
        }
        return { statusCode: 200, body: JSON.stringify({ success: connected, message: connected ? 'Reconectado com sucesso' : 'Falha na reconexão' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
    }
}

async function handleResetReconnect() {
    return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Contador de reconexão resetado' }) };
}

async function handleAllChats() {
    try {
        const [chatsResponse, contactsResponse, groupsResponse] = await Promise.all([
            fetch(`${EVOLUTION_URL}/chat/findChats/${INSTANCE_NAME}`, {
                method: 'POST', headers: evolutionHeaders,
                body: JSON.stringify({ where: {}, options: { limit: 100, order: 'DESC' } })
            }).catch(() => null),
            fetch(`${EVOLUTION_URL}/chat/findContacts/${INSTANCE_NAME}`, {
                method: 'POST', headers: evolutionHeaders,
                body: JSON.stringify({})
            }).catch(() => null),
            fetch(`${EVOLUTION_URL}/group/fetchAllGroups/${INSTANCE_NAME}`, {
                method: 'GET', headers: evolutionHeaders
            }).catch(() => null)
        ]);

        let chatsData, contactsData, groupsData;
        if (!chatsResponse || !chatsResponse.ok) {
            chatsData = { data: generateMockChats() };
            contactsData = { data: generateMockContacts() };
            groupsData = { data: generateMockGroups() };
        } else {
            chatsData = await chatsResponse.json();
            contactsData = await contactsResponse?.json() || { data: [] };
            groupsData = await groupsResponse?.json() || { data: [] };
        }

        const chats = Array.isArray(chatsData) ? chatsData : (chatsData.data || []);
        const contacts = Array.isArray(contactsData) ? contactsData : (contactsData.data || []);
        const groups = Array.isArray(groupsData) ? groupsData : (groupsData.data || []);

        const contactsMap = {};
        contacts.forEach(c => { if (c.remoteJid && c.pushName) contactsMap[c.remoteJid] = c.pushName; });

        const groupsMap = {};
        groups.forEach(g => {
            groupsMap[g.id] = { name: g.subject, pictureUrl: g.pictureUrl, isCommunity: g.isCommunity, participantsCount: g.participants?.length || g.size || 0 };
        });

        const enrichedChats = chats.map(chat => {
            const jid = chat.remoteJid || chat.id;
            const isGroup = jid?.includes('@g.us');
            let name, profilePicUrl, isGroupChat = isGroup, isCommunity = false, participantsCount = 0;

            if (isGroup && groupsMap[jid]) {
                name = groupsMap[jid].name; profilePicUrl = groupsMap[jid].pictureUrl;
                isCommunity = groupsMap[jid].isCommunity; participantsCount = groupsMap[jid].participantsCount;
            } else if (isGroup) {
                name = chat.pushName || chat.name || `Grupo (${jid})`;
            } else {
                name = chat.pushName || chat.name || contactsMap[jid] || chat.lastMessage?.pushName;
                if (!name && jid?.includes('@lid')) {
                    const altJid = chat.lastMessage?.key?.remoteJidAlt;
                    name = (altJid && contactsMap[altJid]) ? contactsMap[altJid] : 'Lead (Anúncio)';
                }
                if (!name && jid) {
                    const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
                    name = phone.length > 8 ? `+${phone.slice(0,2)} ${phone.slice(2)}` : phone;
                }
                profilePicUrl = chat.profilePicUrl;
            }

            return { ...chat, name: name || 'Desconhecido', pushName: name || chat.pushName, profilePicUrl, isGroup: isGroupChat, isCommunity, participantsCount };
        });

        groups.forEach(group => {
            if (!chats.find(c => (c.remoteJid || c.id) === group.id)) {
                enrichedChats.push({
                    remoteJid: group.id, id: group.id, name: group.subject || `Grupo (${group.id})`,
                    isGroup: true, isCommunity: group.isCommunity || false, profilePicUrl: group.pictureUrl,
                    participantsCount: group.participants?.length || group.size || 0, lastMessage: null, pushName: group.subject
                });
            }
        });

        return { statusCode: 200, body: JSON.stringify(enrichedChats) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleMessagesFetch(body) {
    try {
        const { remoteJid } = body;
        const url = `${EVOLUTION_URL}/chat/findMessages/${INSTANCE_NAME}`;

        // Attempt 1: by key.remoteJid
        let response = await fetch(url, {
            method: 'POST', headers: evolutionHeaders,
            body: JSON.stringify({ where: { key: { remoteJid } }, options: { limit: 50, order: 'DESC' } })
        });
        let data = await response.json();

        // Attempt 2: by remoteJid directly
        if (!data?.messages?.length && !data?.data?.length) {
            response = await fetch(url, {
                method: 'POST', headers: evolutionHeaders,
                body: JSON.stringify({ where: { remoteJid }, options: { limit: 50, order: 'DESC' } })
            });
            data = await response.json();
        }

        // Attempt 3: fetch all and filter
        const isLid = String(remoteJid).includes('@lid');
        if (!data?.messages?.length && !data?.data?.length && !isLid) {
            response = await fetch(url, {
                method: 'POST', headers: evolutionHeaders,
                body: JSON.stringify({ options: { limit: 50, order: 'DESC' } })
            });
            data = await response.json();
            const reqNorm = normalizePhoneServer(remoteJid);
            const isGroupReq = String(remoteJid).includes('@g.us');
            if (data?.messages && Array.isArray(data.messages)) {
                data.messages = data.messages.filter(msg => {
                    const mjid = msg.key?.remoteJid || msg.remoteJid || '';
                    if (isGroupReq) return mjid === remoteJid || mjid.replace(/@g\.us$/, '') === remoteJid.replace(/@g\.us$/, '');
                    if (mjid === remoteJid) return true;
                    const mn = normalizePhoneServer(mjid);
                    return mn === reqNorm || (mn.length >= 9 && reqNorm.length >= 9 && mn.slice(-9) === reqNorm.slice(-9));
                });
            }
        }

        // Process audio URLs
        if (data && Array.isArray(data.messages)) {
            data.messages = data.messages.map(msg => {
                if (msg.message?.audioMessage) {
                    const a = msg.message.audioMessage;
                    if (a.url) a.playableUrl = a.url;
                    else if (msg.key?.id) a.playableUrl = `/api/whatsapp/media/${msg.key.id}`;
                }
                return msg;
            });
        }

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleSendMessage(body) {
    try {
        const { number, text } = body;
        let phoneNumber = number;
        if (phoneNumber.includes('@s.whatsapp.net')) phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
        // Keep @g.us and @lid as-is

        const url = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST', headers: evolutionHeaders,
            body: JSON.stringify({ number: phoneNumber, text })
        });
        const data = await response.json();
        if (data.error || data.status === 400 || data.status === 'error') {
            return { statusCode: 400, body: JSON.stringify({ error: data.response?.message || data.message || data.error || 'Erro ao enviar' }) };
        }
        return { statusCode: 200, body: JSON.stringify({ success: true, ...data }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleSendMedia(body) {
    try {
        const { number, mediaType, media, caption, fileName } = body;
        let phoneNumber = number;
        if (phoneNumber.includes('@s.whatsapp.net')) phoneNumber = phoneNumber.replace('@s.whatsapp.net', '');
        if (!phoneNumber.includes('@g.us') && !phoneNumber.includes('@lid')) phoneNumber = phoneNumber.replace(/@.*/, '');

        let endpoint, reqBody = { number: phoneNumber };
        switch (mediaType) {
            case 'image': endpoint = 'sendMedia'; reqBody.mediatype = 'image'; reqBody.media = media; reqBody.caption = caption || ''; break;
            case 'video': endpoint = 'sendMedia'; reqBody.mediatype = 'video'; reqBody.media = media; reqBody.caption = caption || ''; break;
            case 'audio':
                endpoint = 'sendWhatsAppAudio';
                reqBody.audio = media.includes(',') ? media.split(',')[1] : media;
                break;
            case 'document': endpoint = 'sendMedia'; reqBody.mediatype = 'document'; reqBody.media = media; reqBody.caption = caption || ''; reqBody.fileName = fileName || 'documento'; break;
            default: return { statusCode: 400, body: JSON.stringify({ error: 'Tipo de mídia inválido' }) };
        }

        const url = `${EVOLUTION_URL}/message/${endpoint}/${INSTANCE_NAME}`;
        const response = await fetch(url, { method: 'POST', headers: evolutionHeaders, body: JSON.stringify(reqBody) });
        const data = await response.json();
        if (data.error || data.status === 400 || data.status === 'error') {
            return { statusCode: 400, body: JSON.stringify({ error: data.response?.message || data.message || data.error || 'Erro ao enviar mídia' }) };
        }
        return { statusCode: 200, body: JSON.stringify({ success: true, ...data }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleMedia(messageId) {
    try {
        const url = `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST', headers: evolutionHeaders,
            body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false })
        });
        const data = await response.json();
        if (data.base64) {
            const base64Data = data.base64.includes(',') ? data.base64.split(',')[1] : data.base64;
            return {
                statusCode: 200,
                headers: { 'Content-Type': data.mimetype || 'audio/ogg' },
                body: base64Data,
                isBase64Encoded: true
            };
        }
        return { statusCode: 404, body: JSON.stringify({ error: 'Mídia não encontrada' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleProfilePicture(jid) {
    try {
        let formattedJid = jid;
        if (!jid.includes('@')) formattedJid = `${jid}@s.whatsapp.net`;
        const url = `${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${INSTANCE_NAME}`;
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
            body: JSON.stringify({ number: formattedJid })
        });
        if (!response.ok) return { statusCode: 200, body: JSON.stringify({ profilePicUrl: null }) };
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify({ profilePicUrl: data.profilePictureUrl || data.url || null }) };
    } catch {
        return { statusCode: 200, body: JSON.stringify({ profilePicUrl: null }) };
    }
}

async function handleGroupParticipants(groupId) {
    try {
        const response = await fetch(`${EVOLUTION_URL}/group/participants/${INSTANCE_NAME}?groupJid=${groupId}`, { method: 'GET', headers: evolutionHeaders });
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleClientBrain(phone) {
    try {
        if (!phone) return { statusCode: 400, body: JSON.stringify({ error: 'Phone é obrigatório' }) };
        const normalizedPhone = normalizePhoneServer(phone);
        await ensureCrmCache();
        let client = findClientByPhone(normalizedPhone);
        let clientOrders = [];
        if (client && crmCache.orders) {
            clientOrders = crmCache.orders.filter(o =>
                o.id_cliente === client.id || o.cliente_id === client.id ||
                String(o.id_cliente) === String(client.id) || String(o.cliente_id) === String(client.id)
            );
        }
        if (!client) {
            return { statusCode: 200, body: JSON.stringify({
                found: false, status: 'Lead Novo', statusColor: 'blue', statusEmoji: '🆕',
                phone: normalizedPhone, message: 'Primeira interação', metrics: null, orders: [], products: [],
                insight: '👤 Novo contato!', recommendation: 'Pergunte o nome e interesse do cliente.'
            })};
        }
        const totalSpent = clientOrders.reduce((s, o) => s + (parseFloat(o.valor_total) || 0), 0);
        const avgTicket = clientOrders.length > 0 ? totalSpent / clientOrders.length : 0;
        const sorted = clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data));
        const lastDate = sorted[0] ? new Date(sorted[0].data) : null;
        const daysSince = lastDate ? Math.floor((new Date() - lastDate) / 864e5) : 999;
        let status, statusColor, statusEmoji;
        if (clientOrders.length >= 5) { status = 'Cliente VIP'; statusColor = 'purple'; statusEmoji = '👑'; }
        else if (clientOrders.length >= 2) { status = 'Cliente Recorrente'; statusColor = 'green'; statusEmoji = '⭐'; }
        else if (clientOrders.length === 1) { status = 'Cliente'; statusColor = 'blue'; statusEmoji = '✅'; }
        else { status = 'Lead Cadastrado'; statusColor = 'gray'; statusEmoji = '📝'; }
        const productCounts = {};
        clientOrders.forEach(o => { (o.itens || o.products || []).forEach(it => { const n = it.nome || it.name || 'Produto'; productCounts[n] = (productCounts[n] || 0) + (it.quantidade || 1); }); });
        const frequentProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
        const recentOrders = sorted.slice(0, 3).map(o => ({ id: o.id || o.codigo, date: o.data, total: parseFloat(o.valor_total) || 0, status: o.status || 'Concluído', items: (o.itens || o.products || []).length }));
        let insight = daysSince > 60 ? `⚠️ Inativa há ${daysSince} dias. Oportunidade!` : daysSince <= 7 ? `🔥 Comprou recentemente!` : `📊 ${clientOrders.length} pedido(s). Ticket: R$ ${avgTicket.toFixed(2)}`;
        if (status === 'Cliente VIP') insight = `🎯 VIP com ${clientOrders.length} compras. Última há ${daysSince}d.`;
        return { statusCode: 200, body: JSON.stringify({
            found: true,
            client: { id: client.id, name: client.nome || client.name || 'Sem nome', email: client.email, phone: normalizedPhone, cpf: client.cpf, city: client.cidade, state: client.estado, createdAt: client.data_criacao },
            status, statusColor, statusEmoji,
            metrics: { totalSpent: totalSpent.toFixed(2), avgTicket: avgTicket.toFixed(2), ordersCount: clientOrders.length, lastPurchaseDate: lastDate?.toISOString(), daysSinceLastPurchase: daysSince },
            orders: recentOrders, products: frequentProducts, insight,
            recommendation: frequentProducts.length > 0 ? `💡 Favoritos: ${frequentProducts.slice(0, 3).map(p => p.name).join(', ')}` : '💡 Pergunte sobre preferências.'
        })};
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleClientProfile(body) {
    try {
        const { phone } = body;
        if (!phone) return { statusCode: 400, body: JSON.stringify({ error: 'Phone é obrigatório' }) };
        if (!crmCache.clients?.length) return { statusCode: 200, body: JSON.stringify(null) };
        const normalizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');
        const client = crmCache.clients.find(c => {
            const cp = (c.telefone || c.celular || c.phone || '').replace(/\D/g, '').replace(/^55/, '');
            return cp === normalizedPhone;
        });
        if (!client) return { statusCode: 200, body: JSON.stringify(null) };
        const clientOrders = crmCache.orders.filter(o => o.id_cliente === client.id);
        const total_spent = clientOrders.reduce((s, o) => s + (parseFloat(o.valor_total) || 0), 0);
        const avg_ticket = clientOrders.length > 0 ? total_spent / clientOrders.length : 0;
        const last_purchase = clientOrders.length > 0 ? clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data))[0].data : null;
        const days = last_purchase ? Math.floor((new Date() - new Date(last_purchase)) / 864e5) : 999;
        const status = clientOrders.length > 3 ? 'VIP' : clientOrders.length > 0 ? 'Recorrente' : 'Lead';
        return { statusCode: 200, body: JSON.stringify({
            client: { id: client.id, name: client.nome || client.name, status, created_at: client.data_criacao },
            metrics: { total_spent: total_spent.toFixed(2), avg_ticket: avg_ticket.toFixed(2), orders_count: clientOrders.length, last_purchase, days_since_last_purchase: days },
            last_products: clientOrders.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 3).map(o => ({ name: o.nome_produto || 'Produto', date: o.data, value: parseFloat(o.valor_total) || 0 })),
            insight: status === 'VIP' ? `✅ VIP - ${clientOrders.length} compras` : status === 'Recorrente' ? `🔄 Recorrente - ${clientOrders.length} compras` : '👤 Novo Lead',
            recommendation: '💡 Analise histórico para melhor recomendação'
        })};
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

async function handleSyncClientName(body) {
    return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Nome sincronizado', phone: body.phone, newName: body.newName }) };
}

async function handleClientLookup(body) {
    try {
        const { phone } = body;
        if (!phone) return { statusCode: 400, body: JSON.stringify({ error: 'Phone é obrigatório' }) };
        await ensureCrmCache();
        const normalizedPhone = normalizePhoneServer(phone);
        const client = findClientByPhone(normalizedPhone);
        if (!client) return { statusCode: 200, body: JSON.stringify(null) };
        const clientOrders = (crmCache.orders || []).filter(o =>
            o.id_cliente === client.id || o.cliente_id === client.id ||
            String(o.id_cliente) === String(client.id) || String(o.cliente_id) === String(client.id)
        );
        const status = clientOrders.length >= 5 ? 'VIP' : clientOrders.length >= 2 ? 'Recorrente' : clientOrders.length > 0 ? 'Cliente' : 'Lead';
        return { statusCode: 200, body: JSON.stringify({ id: client.id, name: client.nome || client.name || 'Desconhecido', phone, email: client.email, status, total_orders: clientOrders.length }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Parse route from path
    // Path format: /.netlify/functions/whatsapp-proxy/whatsapp/status
    // or via redirect: /api/whatsapp/status → /.netlify/functions/whatsapp-proxy?route=whatsapp/status
    let route = '';
    const qRoute = event.queryStringParameters?.route;
    if (qRoute) {
        route = qRoute;
    } else {
        // Fallback 1: Extract from path after whatsapp-proxy
        const pathParts = event.path.split('whatsapp-proxy');
        if (pathParts[1]) {
            route = pathParts[1].replace(/^\//, '');
        } else {
            // Fallback 2: Extract from original path /api/xxx → xxx
            const apiMatch = event.path.match(/\/api\/(.+)/);
            route = apiMatch ? apiMatch[1] : '';
        }
    }

    console.log('[WhatsApp Proxy] Route:', route, '| Path:', event.path, '| QRoute:', qRoute);

    let body = {};
    try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { body = {}; }
    const params = event.queryStringParameters || {};

    let result;

    try {
        // WhatsApp routes
        if (route === 'whatsapp/status') result = await handleStatus();
        else if (route === 'whatsapp/connection-status') result = await handleConnectionStatus();
        else if (route === 'whatsapp/connect') result = await handleConnect();
        else if (route === 'whatsapp/logout') result = await handleLogout(params);
        else if (route === 'whatsapp/force-reconnect') result = await handleForceReconnect();
        else if (route === 'whatsapp/reset-reconnect') result = await handleResetReconnect();
        else if (route === 'whatsapp/all-chats') result = await handleAllChats();
        else if (route === 'whatsapp/messages/fetch') result = await handleMessagesFetch(body);
        else if (route === 'whatsapp/send-message' || route === 'whatsapp/send-text') result = await handleSendMessage(body);
        else if (route === 'whatsapp/send-media') result = await handleSendMedia(body);
        else if (route.startsWith('whatsapp/media/')) result = await handleMedia(route.replace('whatsapp/media/', ''));
        else if (route.startsWith('whatsapp/profile-picture/')) result = await handleProfilePicture(route.replace('whatsapp/profile-picture/', ''));
        else if (route.startsWith('whatsapp/group/') && route.endsWith('/participants')) {
            const groupId = route.replace('whatsapp/group/', '').replace('/participants', '');
            result = await handleGroupParticipants(groupId);
        }
        // CRM routes
        else if (route.startsWith('client-brain/')) result = await handleClientBrain(route.replace('client-brain/', ''));
        else if (route === 'client-profile') result = await handleClientProfile(body);
        else if (route === 'client-lookup') result = await handleClientLookup(body);
        else if (route === 'sync-client-name') result = await handleSyncClientName(body);
        // Unknown
        else result = { statusCode: 404, body: JSON.stringify({ error: `Rota não encontrada: ${route}` }) };
    } catch (error) {
        result = { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
        ...result,
        headers: { ...headers, ...(result.headers || {}) }
    };
};
