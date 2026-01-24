// Variáveis de Estado
let currentChatId = null;
let currentClient = null;
let currentChatData = null; // Dados completos do chat atual
let allClients = [];
let allProducts = [];
let allOrders = [];
let allChats = []; // Armazena todos os chats para filtro
let currentFilter = 'all'; // 'all', 'chats', 'groups', 'vacuum', 'snoozed'
let currentTagFilter = null;
let chatRefreshInterval = null;

// Sistema de Tags
let allTags = JSON.parse(localStorage.getItem('crm_tags') || '[]');
let chatTags = JSON.parse(localStorage.getItem('crm_chat_tags') || '{}'); // { chatId: [tagId, tagId] }

// Sistema de Mensagens Rápidas
let quickReplies = JSON.parse(localStorage.getItem('crm_quick_replies') || '[]');
let editingQuickReplyId = null;

// Sistema de Snooze
let snoozedChats = JSON.parse(localStorage.getItem('crm_snoozed') || '{}'); // { chatId: timestamp }

// Gravação de Áudio
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;

const API_BASE = 'http://localhost:3000/api';

// Inicializar tags padrão se não existirem
if (allTags.length === 0) {
    allTags = [
        { id: 1, name: 'Urgente', color: '#ef4444', trigger: null },
        { id: 2, name: 'Lead Quente', color: '#f97316', trigger: 'status:lead_quente' },
        { id: 3, name: 'Atacado', color: '#22c55e', trigger: 'status:atacado' },
        { id: 4, name: 'Franqueada', color: '#8b5cf6', trigger: 'type:franqueada' },
        { id: 5, name: 'Pendente Pagamento', color: '#eab308', trigger: null },
        { id: 6, name: 'Aguardando Resposta', color: '#3b82f6', trigger: null }
    ];
    localStorage.setItem('crm_tags', JSON.stringify(allTags));
}

// Inicializar mensagens rápidas padrão
if (quickReplies.length === 0) {
    quickReplies = [
        { id: 1, shortcut: 'ola', message: 'Olá {{nome}}! Tudo bem? 😊\nAqui é da Cjota Rasteirinhas. Como posso te ajudar hoje?' },
        { id: 2, shortcut: 'catalogo', message: 'Oi {{nome}}! Aqui está nosso catálogo atualizado com todos os modelos disponíveis:\nhttps://cjotarasteirinhas.com.br/c/atacado/produtos' },
        { id: 3, shortcut: 'frete', message: 'Oi {{nome}}! Nosso frete é GRÁTIS para compras acima de R$ 2.000! 🚚\nPedido mínimo: 5 peças.' },
        { id: 4, shortcut: 'pix', message: 'Oi {{nome}}! Nosso PIX é:\n\n📱 CNPJ: XX.XXX.XXX/0001-XX\n\nApós o pagamento, me envia o comprovante aqui!' },
        { id: 5, shortcut: 'prazo', message: 'Oi {{nome}}! Nossos prazos são:\n\n• Pronta-entrega: 3-7 dias úteis\n• Fabricação personalizada: 15-20 dias úteis' }
    ];
    localStorage.setItem('crm_quick_replies', JSON.stringify(quickReplies));
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar conexão WhatsApp
    await checkConnection();

    // 2. Carregar dados do CRM (Clientes/Produtos/Pedidos)
    loadCRMData();

    // 3. Carregar Conversas
    loadChats();

    // 4. Processar snoozes (verificar se algum deve "acordar")
    processSnoozedChats();

    // Setup de inputs
    const inputMsg = document.getElementById('inputMessage');
    inputMsg.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Detectar atalho / para mensagens rápidas
    inputMsg.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value.startsWith('/')) {
            const shortcut = value.slice(1).toLowerCase();
            if (shortcut.length >= 2) {
                const match = quickReplies.find(qr => qr.shortcut.toLowerCase().startsWith(shortcut));
                if (match) {
                    showQuickReplyHint(match);
                }
            }
        } else {
            hideQuickReplyHint();
        }
    });
    
    // Tab para auto-completar
    inputMsg.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const hint = document.getElementById('quickReplyHint');
            if (hint && !hint.classList.contains('hidden')) {
                e.preventDefault();
                const qrId = hint.dataset.qrId;
                const qr = quickReplies.find(q => q.id == qrId);
                if (qr) {
                    inputMsg.value = processQuickReplyVariables(qr.message);
                    hideQuickReplyHint();
                }
            }
        }
    });
});

// ============================================================================
// CONEXÃO & SETUP
// ============================================================================
async function checkConnection() {
    const statusEl = document.getElementById('connectionStatus');
    try {
        const res = await fetch(`${API_BASE}/whatsapp/status`);
        const data = await res.json();
        
        // Evolution retorna { instance: { state: 'open' } } ou similar
        const isConnected = data.instance?.state === 'open';
        
        if (isConnected) {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado';
        } else if (data.state === 'NOT_CREATED') {
             statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Instância não criada';
             // Tentar conectar/criar
             connectWhatsapp();
        } else {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500"></span> ' + (data.instance?.state || 'Desconectado');
        }
    } catch (e) {
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-500"></span> Erro de Conexão';
    }
}

// DESCONECTAR WHATSAPP (para trocar de número)
async function disconnectWhatsapp() {
    const confirm = window.confirm('⚠️ ATENÇÃO!\n\nIsso vai DESCONECTAR o WhatsApp atual.\nVocê precisará escanear o QR Code novamente.\n\nDeseja continuar?');
    if (!confirm) return;
    
    const statusEl = document.getElementById('connectionStatus');
    statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span> Desconectando...';
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/logout`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-500"></span> Desconectado';
            // Limpar lista de chats
            document.getElementById('chatsList').innerHTML = '<p class="text-center text-slate-400 py-8">WhatsApp desconectado</p>';
            document.getElementById('messagesContainer').innerHTML = '';
            alert('✅ WhatsApp desconectado!\n\nAgora clique em "Conectar" para escanear o QR Code com o novo número.');
        } else {
            alert('Erro ao desconectar: ' + (data.error || 'Erro desconhecido'));
            checkConnection();
        }
    } catch (e) {
        console.error('Erro ao desconectar:', e);
        alert('Erro ao desconectar. Verifique o console.');
        checkConnection();
    }
}

async function connectWhatsapp() {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span> Buscando QR...';
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/connect`);
        const data = await res.json();
        
        if (data.base64) {
            // Mostrar QR Code
            const qrContainer = document.getElementById('qrContainer');
            // Garantir prefixo
            let b64 = data.base64;
            if (!b64.startsWith('data:image')) {
                b64 = 'data:image/png;base64,' + b64;
            }
            qrContainer.innerHTML = `<img src="${b64}" class="w-full h-full object-contain" alt="QR Code WhatsApp">`;
            document.getElementById('qrModal').classList.remove('hidden');
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500"></span> Escaneie o QR';

            // Polling de conexão
            const poolInterval = setInterval(async () => {
                try {
                    const s = await fetch(`${API_BASE}/whatsapp/status`);
                    const d = await s.json();
                    if (d.instance?.state === 'open') {
                        clearInterval(poolInterval);
                        document.getElementById('qrModal').classList.add('hidden');
                        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado';
                        loadChats();
                    }
                } catch(e) {}
            }, 2000);

        } else if (data.instance?.state === 'open' || data.state === 'open') {
             statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado';
             loadChats(); // Recarregar chats se já estiver conectado
             // alert('Já está conectado!'); // Remover alert intrusivo
        } else {
            alert('Status da conexão: ' + JSON.stringify(data));
            checkConnection(); // Reverte p/ status real
        }
    } catch (e) {
        console.error(e);
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Erro';
        alert('Erro ao tentar conectar WhatsApp');
    }
}

async function loadCRMData() {
    try {
        // Usa o endpoint existente que retorna tudo
        const res = await fetch(`${API_BASE}/facilzap-proxy`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        allClients = data.clients || [];
        allOrders = data.orders || [];
        allProducts = data.products || [];
        
        console.log(`CRM Carregado: ${allClients.length} clientes, ${allOrders.length} pedidos, ${allProducts.length} produtos.`);
    } catch (e) {
        console.error('Erro ao carregar CRM:', e);
        document.getElementById('crmDataContainer').innerHTML = `<p class="text-red-500 text-sm">Erro ao carregar dados do CRM. Verifique se o servidor está rodando.</p>`;
    }
}

// ============================================================================
// LISTAGEM DE CHATS
// ============================================================================

// Função de filtro das abas
function filterChats(filter) {
    currentFilter = filter;
    
    // Limpar filtro de tag se mudar de filtro principal
    if (['all', 'chats', 'groups'].includes(filter)) {
        currentTagFilter = null;
    }
    
    // Atualizar visual das abas principais
    const tabs = ['filterAll', 'filterChats', 'filterGroups'];
    tabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            if ((filter === 'all' && tabId === 'filterAll') ||
                (filter === 'chats' && tabId === 'filterChats') ||
                (filter === 'groups' && tabId === 'filterGroups')) {
                tab.classList.add('filter-tab-active');
                tab.classList.remove('text-slate-500');
            } else {
                tab.classList.remove('filter-tab-active');
                tab.classList.add('text-slate-500');
            }
        }
    });
    
    // Atualizar visual dos filtros especiais
    const specialFilters = ['filterVacuum', 'filterSnoozed'];
    specialFilters.forEach(filterId => {
        const btn = document.getElementById(filterId);
        if (btn) {
            if ((filter === 'vacuum' && filterId === 'filterVacuum') ||
                (filter === 'snoozed' && filterId === 'filterSnoozed')) {
                btn.classList.add('ring-2', 'ring-offset-1');
            } else {
                btn.classList.remove('ring-2', 'ring-offset-1');
            }
        }
    });
    
    // Re-renderizar lista filtrada
    renderChatsList(allChats);
    lucide.createIcons();
}

async function loadChats() {
    const listEl = document.getElementById('chatsList');
    try {
        // Usar endpoint que inclui grupos
        const res = await fetch(`${API_BASE}/whatsapp/all-chats`);
        const chats = await res.json();
        
        // Armazenar para filtros
        allChats = Array.isArray(chats) ? chats : [];
        
        renderChatsList(allChats);
        lucide.createIcons();

    } catch (e) {
        listEl.innerHTML = '<p class="text-center text-red-400 text-sm p-4">Erro ao listar chats.</p>';
        console.error(e);
    }
}

function renderChatsList(chats) {
    const listEl = document.getElementById('chatsList');
    listEl.innerHTML = '';
    
    if (!Array.isArray(chats) || chats.length === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-400 text-sm p-4">Nenhuma conversa encontrada.</p>';
        return;
    }
    
    // Aplicar filtros
    let filteredChats = chats;
    
    // Filtro de tipo (all, chats, groups)
    if (currentFilter === 'chats') {
        filteredChats = filteredChats.filter(c => !c.isGroup);
    } else if (currentFilter === 'groups') {
        filteredChats = filteredChats.filter(c => c.isGroup);
    } else if (currentFilter === 'vacuum') {
        // Filtro Vácuo: última mensagem é do cliente e sem resposta há > 4h
        const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
        filteredChats = filteredChats.filter(c => {
            const lastMsg = c.lastMessage;
            if (!lastMsg) return false;
            const msgTime = (lastMsg.messageTimestamp || 0) * 1000;
            const isFromClient = !lastMsg.key?.fromMe;
            return isFromClient && msgTime < fourHoursAgo;
        });
    } else if (currentFilter === 'snoozed') {
        // Mostrar apenas chats adiados
        filteredChats = filteredChats.filter(c => {
            const chatId = c.id || c.remoteJid;
            return snoozedChats[chatId];
        });
    }
    
    // Remover chats que estão em snooze (exceto se filtro for 'snoozed')
    if (currentFilter !== 'snoozed') {
        filteredChats = filteredChats.filter(c => {
            const chatId = c.id || c.remoteJid;
            return !snoozedChats[chatId];
        });
    }
    
    // Filtro por tag
    if (currentTagFilter) {
        filteredChats = filteredChats.filter(c => {
            const chatId = c.id || c.remoteJid;
            const tags = chatTags[chatId] || [];
            return tags.includes(currentTagFilter);
        });
    }
    
    if (filteredChats.length === 0) {
        let msg = 'Nenhuma conversa encontrada.';
        if (currentFilter === 'groups') msg = 'Nenhum grupo encontrado.';
        if (currentFilter === 'vacuum') msg = 'Nenhuma conversa no vácuo. Parabéns!';
        if (currentFilter === 'snoozed') msg = 'Nenhuma conversa adiada.';
        if (currentTagFilter) msg = 'Nenhuma conversa com esta etiqueta.';
        listEl.innerHTML = `<p class="text-center text-gray-400 text-sm p-4">${msg}</p>`;
        return;
    }
    
    filteredChats.forEach(chat => {
        const chatId = chat.id || chat.remoteJid;
        const name = chat.name || chat.pushName || formatPhone(chatId);
        const isGroup = chat.isGroup || chatId?.includes('@g.us');
        const isCommunity = chat.isCommunity;
        
        // Última mensagem
        const lastMsg = chat.lastMessage?.message?.conversation || 
                       chat.lastMessage?.message?.extendedTextMessage?.text || 
                       (chat.lastMessage?.message?.imageMessage ? '📷 Imagem' : 
                       chat.lastMessage?.message?.audioMessage ? '🎵 Áudio' : 
                       chat.lastMessage?.message?.videoMessage ? '🎬 Vídeo' : 
                       chat.lastMessage?.message?.documentMessage ? '📄 Documento' : 
                       chat.lastMessage?.message?.stickerMessage ? '✨ Figurinha' :
                       chat.lastMessage?.message?.contactMessage ? '👤 Contato' :
                       chat.lastMessage?.message?.locationMessage ? '📍 Localização' :
                       (chat.lastMessage ? 'Mídia' : ''));
        
        // Formatar hora
        const timestamp = chat.lastMessage?.messageTimestamp || chat.updatedAt;
        let time = '';
        if (timestamp) {
            const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            time = isToday ? date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : 
                             date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        }
        
        // Avatar - diferencia grupo de contato
        let avatarHtml;
        if (isGroup) {
            const iconClass = isCommunity ? 'community-icon' : 'group-icon';
            const iconName = isCommunity ? 'building-2' : 'users';
            if (chat.profilePicUrl) {
                avatarHtml = `<img src="${chat.profilePicUrl}" alt="${name}" class="w-10 h-10 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-10 h-10 rounded-full ${iconClass} flex items-center justify-center\\'><i data-lucide=\\'${iconName}\\' class=\\'w-5 h-5 text-white\\'></i></div>'">`;
            } else {
                avatarHtml = `<div class="w-10 h-10 rounded-full ${iconClass} flex items-center justify-center"><i data-lucide="${iconName}" class="w-5 h-5 text-white"></i></div>`;
            }
        } else {
            const profilePic = chat.profilePicUrl;
            avatarHtml = profilePic 
                ? `<img src="${profilePic}" alt="${name}" class="w-10 h-10 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center font-bold text-gray-600\\'>${name.charAt(0).toUpperCase()}</div>'">`
                : `<div class="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center font-bold text-gray-600">${name.charAt(0).toUpperCase()}</div>`;
        }
        
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 p-3 border-b hover:bg-gray-100 cursor-pointer transition-colors';
        chat.id = chatId;
        div.onclick = () => openChat(chat);
        
        // Indicador de mensagem não lida
        const unreadBadge = chat.unreadCount > 0 
            ? `<span class="bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${chat.unreadCount}</span>` 
            : '';
        
        // Indicador de participantes para grupos
        const participantsInfo = isGroup && chat.participantsCount 
            ? `<span class="text-xs text-slate-400">${chat.participantsCount} participantes</span>` 
            : '';
        
        // Tags do chat
        const cTags = chatTags[chatId] || [];
        const tagsHtml = cTags.slice(0, 2).map(tagId => {
            const tag = allTags.find(t => t.id === tagId);
            if (!tag) return '';
            return `<span class="w-2 h-2 rounded-full" style="background-color: ${tag.color}" title="${tag.name}"></span>`;
        }).join('');
        
        // Indicador de snooze
        const isSnoozed = snoozedChats[chatId];
        const snoozeIcon = isSnoozed ? '<i data-lucide="alarm-clock" class="w-3 h-3 text-amber-500"></i>' : '';
        
        div.innerHTML = `
            ${avatarHtml}
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-baseline">
                    <h4 class="font-medium text-gray-800 truncate text-sm flex items-center gap-1">
                        ${name}
                        ${isCommunity ? '<span class="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">Comunidade</span>' : ''}
                        ${tagsHtml ? `<span class="flex gap-0.5 ml-1">${tagsHtml}</span>` : ''}
                    </h4>
                    <span class="text-xs text-gray-400 flex items-center gap-1">${snoozeIcon}${time}</span>
                </div>
                <div class="flex justify-between items-center">
                    <p class="text-xs text-gray-500 truncate flex-1">${lastMsg || participantsInfo}</p>
                    ${unreadBadge}
                </div>
            </div>
        `;
        listEl.appendChild(div);
    });
}

// ============================================================================
// CHAT ATIVO
// ============================================================================
async function openChat(chat) {
    currentChatId = chat.id; // remoteJid
    currentChatData = chat; // Salvar dados completos
    const isGroup = chat.isGroup || chat.id?.includes('@g.us');
    const isCommunity = chat.isCommunity;
    
    // UI Update
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');
    document.getElementById('messagesContainer').innerHTML = '<div class="text-center p-4 text-gray-500"><i class="fas fa-spinner fa-spin"></i> Carregando mensagens...</div>';
    
    // Renderizar tags do chat
    renderChatTags();
    
    // Header Info
    const name = chat.name || chat.pushName || formatPhone(chat.id);
    document.getElementById('headerName').innerText = name;
    
    // Subtítulo: número ou info do grupo
    const headerNumber = document.getElementById('headerNumber');
    if (isGroup) {
        const participantsText = chat.participantsCount ? `${chat.participantsCount} participantes` : 'Grupo';
        headerNumber.innerText = isCommunity ? `Comunidade • ${participantsText}` : participantsText;
    } else {
        headerNumber.innerText = formatPhone(chat.id);
    }
    
    // Avatar no header
    const headerAvatar = document.getElementById('headerAvatar');
    const headerInitials = document.getElementById('headerInitials');
    
    if (isGroup) {
        // Avatar de grupo
        if (chat.profilePicUrl) {
            if (headerAvatar) {
                headerAvatar.src = chat.profilePicUrl;
                headerAvatar.classList.remove('hidden');
            }
            if (headerInitials) headerInitials.classList.add('hidden');
        } else {
            // Ícone de grupo
            if (headerAvatar) headerAvatar.classList.add('hidden');
            if (headerInitials) {
                headerInitials.classList.remove('hidden');
                headerInitials.innerHTML = isCommunity ? '🏢' : '👥';
            }
        }
    } else {
        // Avatar de contato individual
        if (chat.profilePicUrl) {
            if (headerAvatar) {
                headerAvatar.src = chat.profilePicUrl;
                headerAvatar.classList.remove('hidden');
            }
            if (headerInitials) headerInitials.classList.add('hidden');
        } else {
            if (headerAvatar) headerAvatar.classList.add('hidden');
            if (headerInitials) {
                headerInitials.classList.remove('hidden');
                headerInitials.innerText = name.charAt(0).toUpperCase();
            }
        }
    }
    
    // Carregar Mensagens
    await loadMessages(currentChatId);
    
    // Buscar Dados CRM (só para contatos individuais)
    if (!isGroup) {
        findAndRenderClientCRM(chat.id);
    } else {
        // Mostrar info do grupo no painel lateral
        renderGroupInfo(chat);
    }
    
    // Auto refresh (simples - polling a cada 5s)
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => loadMessages(currentChatId, true), 10000);
}

// Renderizar info do grupo no painel lateral
function renderGroupInfo(group) {
    const crmContainer = document.getElementById('crmDataContainer');
    if (!crmContainer) return;
    
    const participantsHtml = group.participantsCount 
        ? `<p class="text-sm text-slate-600"><strong>Participantes:</strong> ${group.participantsCount}</p>` 
        : '';
    
    const descHtml = group.description 
        ? `<p class="text-sm text-slate-600 mt-2"><strong>Descrição:</strong><br>${group.description}</p>` 
        : '';
    
    crmContainer.innerHTML = `
        <div class="space-y-3">
            <div class="flex items-center gap-2">
                <i data-lucide="users" class="w-5 h-5 text-emerald-500"></i>
                <h3 class="font-semibold text-slate-800">${group.isCommunity ? 'Comunidade' : 'Grupo'}</h3>
            </div>
            <p class="text-sm text-slate-700 font-medium">${group.name}</p>
            ${participantsHtml}
            ${descHtml}
            <div class="pt-3 border-t border-slate-200">
                <p class="text-xs text-slate-400">Grupos não possuem dados no CRM</p>
            </div>
        </div>
    `;
    lucide.createIcons();
}

async function loadMessages(remoteJid, isUpdate = false) {
    if (!remoteJid) return;
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/messages/fetch`, {
            method: 'POST',
            body: JSON.stringify({ remoteJid }),
            headers: {'Content-Type': 'application/json'}
        });
        const data = await res.json();
        console.log('Mensagens recebidas:', data);
        
        let messages = [];
        if (Array.isArray(data)) {
            messages = data;
        } else if (data && Array.isArray(data.messages)) {
            messages = data.messages;
        } else if (data && data.messages && Array.isArray(data.messages.records)) {
            // Suporte a paginação do Evolution v2
            messages = data.messages.records;
        } else if (data && Array.isArray(data.data)) {
            messages = data.data;
        }
        
        const container = document.getElementById('messagesContainer');
        
        // Se não tiver mensagens ou formato inválido, limpar e sair
        if (!messages || !Array.isArray(messages)) {
             container.innerHTML = '<div class="text-center p-4 text-gray-500">Nenhuma mensagem encontrada.</div>';
             return;
        }

        container.innerHTML = '';
        
        // Inverter ordem para aparecer de baixo para cima (histórico)
        // A API geralmente retorna as ultimas primeiro.
        const sortedMsgs = messages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
        
        sortedMsgs.forEach(msg => {
            const isMe = msg.key.fromMe;
            
            // Extrair conteúdo da mensagem
            let content = '';
            const m = msg.message;
            
            if (m?.conversation) {
                content = m.conversation;
            } else if (m?.extendedTextMessage?.text) {
                content = m.extendedTextMessage.text;
            } else if (m?.imageMessage) {
                const caption = m.imageMessage.caption || '';
                content = `<div class="flex items-center gap-2"><span class="text-lg">📷</span> <span>Imagem${caption ? ': ' + caption : ''}</span></div>`;
            } else if (m?.videoMessage) {
                const caption = m.videoMessage.caption || '';
                content = `<div class="flex items-center gap-2"><span class="text-lg">🎬</span> <span>Vídeo${caption ? ': ' + caption : ''}</span></div>`;
            } else if (m?.audioMessage) {
                content = `<div class="flex items-center gap-2"><span class="text-lg">🎵</span> <span>Áudio</span></div>`;
            } else if (m?.documentMessage) {
                const fileName = m.documentMessage.fileName || 'Documento';
                content = `<div class="flex items-center gap-2"><span class="text-lg">📄</span> <span>${fileName}</span></div>`;
            } else if (m?.stickerMessage) {
                content = `<div class="flex items-center gap-2"><span class="text-lg">✨</span> <span>Figurinha</span></div>`;
            } else if (m?.contactMessage) {
                const name = m.contactMessage.displayName || 'Contato';
                content = `<div class="flex items-center gap-2"><span class="text-lg">👤</span> <span>${name}</span></div>`;
            } else if (m?.locationMessage) {
                content = `<div class="flex items-center gap-2"><span class="text-lg">📍</span> <span>Localização</span></div>`;
            } else {
                content = '<span class="text-slate-400 italic">Mensagem não suportada</span>';
            }
            
            // Converter links em clicáveis
            if (typeof content === 'string' && !content.includes('<')) {
                content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline">$1</a>');
            }
            
            const div = document.createElement('div');
            div.className = `p-3 max-w-[70%] text-sm shadow-sm ${isMe ? 'msg-out' : 'msg-in'}`;
            div.innerHTML = `<p>${content}</p>`;
            
            // Container flex para alinhamento
            const wrap = document.createElement('div');
            wrap.className = `w-full flex ${isMe ? 'justify-end' : 'justify-start'}`;
            wrap.appendChild(div);
            
            container.appendChild(wrap);
        });
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
        
    } catch (e) {
        console.error('Erro ao carregar msgs', e);
    }
}

async function sendMessage() {
    const input = document.getElementById('inputMessage');
    const text = input.value.trim();
    
    // Verificar se há arquivo selecionado
    if (selectedFile) {
        await sendMedia();
        return;
    }
    
    if (!text || !currentChatId) return;
    
    // UI otimista
    input.value = '';
    const container = document.getElementById('messagesContainer');
    const wrap = document.createElement('div');
    wrap.className = 'w-full flex justify-end opacity-50'; // Opacity indica enviando
    wrap.innerHTML = `<div class="p-3 max-w-[70%] text-sm shadow-sm msg-out"><p>${text}</p></div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    try {
        await fetch(`${API_BASE}/whatsapp/send-message`, {
            method: 'POST',
            body: JSON.stringify({ number: currentChatId, text: text }),
            headers: {'Content-Type': 'application/json'}
        });
        // Atualiza chat real após delay pequeno
        setTimeout(() => loadMessages(currentChatId), 1000);
    } catch (e) {
        alert('Erro ao enviar');
        wrap.remove();
    }
}

// ============================================================================
// ENVIO DE MÍDIA
// ============================================================================
let selectedFile = null;
let selectedMediaType = null;

function toggleAttachMenu() {
    const menu = document.getElementById('attachMenu');
    menu.classList.toggle('hidden');
}

function selectFile(type) {
    const fileInput = document.getElementById('fileInput');
    selectedMediaType = type;
    
    // Configurar aceita
    switch (type) {
        case 'image':
            fileInput.accept = 'image/*';
            break;
        case 'video':
            fileInput.accept = 'video/*';
            break;
        case 'audio':
            fileInput.accept = 'audio/*';
            break;
        case 'document':
            fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
            break;
    }
    
    fileInput.click();
    toggleAttachMenu();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    selectedFile = file;
    
    // Mostrar preview
    const preview = document.getElementById('filePreview');
    const thumb = document.getElementById('filePreviewThumb');
    const name = document.getElementById('filePreviewName');
    const size = document.getElementById('filePreviewSize');
    
    name.textContent = file.name;
    size.textContent = formatFileSize(file.size);
    
    // Preview de imagem
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            thumb.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        thumb.innerHTML = '<i data-lucide="video" class="w-6 h-6 text-blue-500"></i>';
    } else if (file.type.startsWith('audio/')) {
        thumb.innerHTML = '<i data-lucide="music" class="w-6 h-6 text-purple-500"></i>';
    } else {
        thumb.innerHTML = '<i data-lucide="file-text" class="w-6 h-6 text-orange-500"></i>';
    }
    
    preview.classList.remove('hidden');
    lucide.createIcons();
}

function clearFilePreview() {
    selectedFile = null;
    selectedMediaType = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.add('hidden');
    document.getElementById('fileCaption').value = '';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function sendMedia() {
    if (!selectedFile || !currentChatId) return;
    
    const caption = document.getElementById('fileCaption')?.value || '';
    const container = document.getElementById('messagesContainer');
    
    // UI otimista
    const wrap = document.createElement('div');
    wrap.className = 'w-full flex justify-end opacity-50';
    wrap.innerHTML = `
        <div class="p-3 max-w-[70%] text-sm shadow-sm msg-out">
            <div class="flex items-center gap-2">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Enviando ${selectedFile.name}...</span>
            </div>
        </div>
    `;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    
    try {
        // Converter arquivo para base64
        const base64 = await fileToBase64(selectedFile);
        
        const response = await fetch(`${API_BASE}/whatsapp/send-media`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                number: currentChatId,
                mediaType: selectedMediaType,
                media: base64,
                caption: caption,
                fileName: selectedFile.name
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Limpar preview e recarregar mensagens
        clearFilePreview();
        setTimeout(() => loadMessages(currentChatId), 1000);
        
    } catch (e) {
        console.error('Erro ao enviar mídia:', e);
        alert('Erro ao enviar arquivo: ' + e.message);
        wrap.remove();
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ============================================================================
// LÓGICA CRM (LADO DIREITO)
// ============================================================================
function findAndRenderClientCRM(chatId) {
    // chatId vem como "5511999999999@s.whatsapp.net"
    // CRM phones podem ser "(11) 99999-9999" ou "551199999..."
    
    const panel = document.getElementById('crmDataContainer');
    const cleanPhone = chatId.replace('@s.whatsapp.net', '').replace(/\D/g, ''); // 5511...
    
    // Tentar casar (usar includes para ser flexível com o +55)
    // Se o cliente tá salvo sem 55, ou com 55.
    
    // Estratégia: pegar os ultimos 8 digitos do telefone e tentar achar
    const lastDigits = cleanPhone.slice(-8); 
    
    const client = allClients.find(c => {
        const p = (c.telefone || c.celular || c.whatsapp || '').replace(/\D/g, '');
        return p.includes(lastDigits);
    });
    
    if (!client) {
        panel.innerHTML = `
            <div class="bg-yellow-50 p-4 rounded text-center">
                <i class="fas fa-user-slash text-yellow-500 text-2xl mb-2"></i>
                <p class="text-sm text-gray-600">Cliente não identificado no CRM.</p>
                <p class="text-xs text-gray-400 mt-1">Telefone: ${cleanPhone}</p>
                <button class="mt-3 text-blue-600 text-xs hover:underline">Cadastrar Novo</button>
            </div>
        `;
        currentClient = null;
        return;
    }
    
    currentClient = client;
    
    // Calcular estatísticas básicas
    const clientOrders = allOrders.filter(o => o.cliente_id == client.id);
    const totalGasto = clientOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
    const qtdPedidos = clientOrders.length;
    const ticketMedio = qtdPedidos > 0 ? totalGasto / qtdPedidos : 0;
    
    // Calcular dias desde ultima compra
    let daysSince = 'N/A';
    if (clientOrders.length > 0) {
        const lastDate = new Date(Math.max(...clientOrders.map(o => new Date(o.data))));
        const diff = new Date() - lastDate;
        daysSince = Math.floor(diff / (1000 * 60 * 60 * 24)) + ' dias';
    } else {
        daysSince = 'Nunca comprou';
    }

    panel.innerHTML = `
        <div class="text-center mb-4">
            <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xl font-bold mx-auto mb-2">
                ${client.nome.charAt(0)}
            </div>
            <h3 class="font-bold text-gray-800">${client.nome}</h3>
            <p class="text-xs text-gray-500">${client.email || 'Sem email'}</p>
        </div>
        
        <div class="grid grid-cols-2 gap-2 mb-4">
            <div class="bg-gray-50 p-2 rounded text-center">
                <span class="block text-xs text-gray-500">Recência</span>
                <span class="font-bold text-gray-800">${daysSince}</span>
            </div>
            <div class="bg-gray-50 p-2 rounded text-center">
                <span class="block text-xs text-gray-500">Pedidos</span>
                <span class="font-bold text-gray-800">${qtdPedidos}</span>
            </div>
            <div class="bg-gray-50 p-2 rounded text-center col-span-2">
                <span class="block text-xs text-gray-500">Ticket Médio</span>
                <span class="font-bold text-green-600">R$ ${ticketMedio.toFixed(2)}</span>
            </div>
        </div>
        
        <h4 class="font-bold text-xs text-gray-700 mb-2 uppercase border-b pb-1">Últimos Pedidos</h4>
        <div class="flex flex-col gap-2 max-h-40 overflow-y-auto mb-4">
            ${clientOrders.slice(0, 3).map(o => `
                <div class="text-xs border p-2 rounded hover:bg-gray-50">
                    <div class="flex justify-between font-bold">
                        <span>#${o.id}</span>
                        <span>R$ ${parseFloat(o.total).toFixed(2)}</span>
                    </div>
                    <div class="text-gray-500">${new Date(o.data).toLocaleDateString()}</div>
                </div>
            `).join('') || '<p class="text-xs text-gray-400">Nenhum pedido recente</p>'}
        </div>
        
        <div class="flex flex-col gap-2 mt-auto">
            <button class="w-full bg-indigo-50 text-indigo-700 py-2 rounded text-sm font-medium hover:bg-indigo-100">
                <i class="fas fa-ticket-alt mr-2"></i> Gerar Cupom
            </button>
            <button class="w-full border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50">
                Ver Histórico Completo
            </button>
        </div>
    `;
}

// ============================================================================
// SISTEMA DE ETIQUETAS (TAGS)
// ============================================================================
function openTagsModal() {
    if (!currentChatId) return alert('Selecione um chat primeiro');
    renderTagsList();
    document.getElementById('tagsModal').classList.remove('hidden');
    lucide.createIcons();
}

function closeTagsModal() {
    document.getElementById('tagsModal').classList.add('hidden');
}

function renderTagsList() {
    const container = document.getElementById('tagsList');
    const currentTags = chatTags[currentChatId] || [];
    
    container.innerHTML = allTags.map(tag => {
        const isActive = currentTags.includes(tag.id);
        return `
            <div class="flex items-center justify-between p-2 rounded-lg border ${isActive ? 'border-slate-400 bg-slate-50' : 'border-slate-200'} hover:bg-slate-50">
                <label class="flex items-center gap-2 cursor-pointer flex-1">
                    <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleTag(${tag.id})" class="w-4 h-4 rounded">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${tag.color}"></span>
                    <span class="text-sm font-medium">${tag.name}</span>
                </label>
                <button onclick="deleteTag(${tag.id})" class="text-slate-400 hover:text-red-500 p-1">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
    }).join('');
}

function toggleTag(tagId) {
    if (!currentChatId) return;
    
    if (!chatTags[currentChatId]) chatTags[currentChatId] = [];
    
    const idx = chatTags[currentChatId].indexOf(tagId);
    if (idx > -1) {
        chatTags[currentChatId].splice(idx, 1);
    } else {
        chatTags[currentChatId].push(tagId);
        
        // Executar trigger da tag
        const tag = allTags.find(t => t.id === tagId);
        if (tag?.trigger) {
            executeTagTrigger(tag.trigger);
        }
    }
    
    localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
    renderChatTags();
    renderTagsList();
}

function executeTagTrigger(trigger) {
    // Triggers automáticos quando tag é aplicada
    const [action, value] = trigger.split(':');
    
    if (action === 'status' && currentClient) {
        console.log(`[Tag Trigger] Atualizando status do cliente para: ${value}`);
        currentClient.status = value;
        // Aqui você salvaria no CRM
    }
    
    if (action === 'type' && currentClient) {
        console.log(`[Tag Trigger] Marcando cliente como: ${value}`);
        currentClient.tipo = value;
    }
}

function createTag() {
    const nameInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    
    const name = nameInput.value.trim();
    if (!name) return alert('Digite um nome para a etiqueta');
    
    const newTag = {
        id: Date.now(),
        name: name,
        color: colorInput.value,
        trigger: null
    };
    
    allTags.push(newTag);
    localStorage.setItem('crm_tags', JSON.stringify(allTags));
    
    nameInput.value = '';
    renderTagsList();
}

function deleteTag(tagId) {
    if (!confirm('Excluir esta etiqueta?')) return;
    
    allTags = allTags.filter(t => t.id !== tagId);
    localStorage.setItem('crm_tags', JSON.stringify(allTags));
    
    // Remover tag de todos os chats
    Object.keys(chatTags).forEach(chatId => {
        chatTags[chatId] = chatTags[chatId].filter(id => id !== tagId);
    });
    localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
    
    renderTagsList();
    renderChatTags();
}

function renderChatTags() {
    const container = document.getElementById('chatTags');
    if (!container || !currentChatId) return;
    
    const tags = chatTags[currentChatId] || [];
    container.innerHTML = tags.map(tagId => {
        const tag = allTags.find(t => t.id === tagId);
        if (!tag) return '';
        return `<span class="px-2 py-0.5 rounded-full text-xs text-white" style="background-color: ${tag.color}">${tag.name}</span>`;
    }).join('');
}

function openTagFilterModal() {
    // Dropdown simples para filtrar por tag
    const existing = document.getElementById('tagFilterDropdown');
    if (existing) {
        existing.remove();
        return;
    }
    
    const btn = document.getElementById('filterByTag');
    const dropdown = document.createElement('div');
    dropdown.id = 'tagFilterDropdown';
    dropdown.className = 'absolute z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-2 min-w-[150px]';
    dropdown.style.top = btn.offsetTop + btn.offsetHeight + 5 + 'px';
    dropdown.style.left = btn.offsetLeft + 'px';
    
    dropdown.innerHTML = `
        <button onclick="filterByTag(null)" class="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${!currentTagFilter ? 'bg-slate-100' : ''}">Todas</button>
        ${allTags.map(tag => `
            <button onclick="filterByTag(${tag.id})" class="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 ${currentTagFilter === tag.id ? 'bg-slate-100' : ''}">
                <span class="w-2 h-2 rounded-full" style="background-color: ${tag.color}"></span>
                ${tag.name}
            </button>
        `).join('')}
    `;
    
    btn.parentElement.appendChild(dropdown);
    
    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== btn) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 100);
}

function filterByTag(tagId) {
    currentTagFilter = tagId;
    document.getElementById('tagFilterDropdown')?.remove();
    renderChatsList(allChats);
    lucide.createIcons();
}

// ============================================================================
// SISTEMA DE MENSAGENS RÁPIDAS (QUICK REPLIES)
// ============================================================================
function openQuickReplies() {
    renderQuickRepliesList();
    document.getElementById('quickRepliesModal').classList.remove('hidden');
    lucide.createIcons();
}

function closeQuickReplies() {
    document.getElementById('quickRepliesModal').classList.add('hidden');
}

function renderQuickRepliesList(filter = '') {
    const container = document.getElementById('quickRepliesList');
    const filtered = quickReplies.filter(qr => 
        qr.shortcut.toLowerCase().includes(filter.toLowerCase()) ||
        qr.message.toLowerCase().includes(filter.toLowerCase())
    );
    
    container.innerHTML = filtered.map(qr => `
        <div class="p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-all" onclick="useQuickReply(${qr.id})">
            <div class="flex justify-between items-start mb-2">
                <span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">/${qr.shortcut}</span>
                <div class="flex gap-1">
                    <button onclick="event.stopPropagation(); editQuickReply(${qr.id})" class="text-slate-400 hover:text-blue-500 p-1">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteQuickReply(${qr.id})" class="text-slate-400 hover:text-red-500 p-1">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
            <p class="text-sm text-slate-600 whitespace-pre-line line-clamp-3">${qr.message}</p>
        </div>
    `).join('') || '<p class="text-center text-slate-400 text-sm py-4">Nenhuma mensagem rápida encontrada</p>';
}

function filterQuickReplies(query) {
    renderQuickRepliesList(query);
    lucide.createIcons();
}

function useQuickReply(id) {
    const qr = quickReplies.find(q => q.id === id);
    if (!qr) return;
    
    const processed = processQuickReplyVariables(qr.message);
    document.getElementById('inputMessage').value = processed;
    closeQuickReplies();
    document.getElementById('inputMessage').focus();
}

function processQuickReplyVariables(text) {
    let result = text;
    
    // Substituir variáveis
    const name = currentChatData?.name || currentClient?.nome || 'Cliente';
    result = result.replace(/\{\{nome\}\}/gi, name);
    
    if (currentClient) {
        result = result.replace(/\{\{telefone\}\}/gi, currentClient.telefone || '');
        result = result.replace(/\{\{email\}\}/gi, currentClient.email || '');
        
        // Último pedido
        const lastOrder = allOrders.filter(o => o.cliente_id == currentClient.id).sort((a, b) => new Date(b.data) - new Date(a.data))[0];
        if (lastOrder) {
            result = result.replace(/\{\{ultimo_pedido\}\}/gi, `#${lastOrder.id} - R$ ${parseFloat(lastOrder.total).toFixed(2)}`);
            result = result.replace(/\{\{rastreio\}\}/gi, lastOrder.rastreio || 'Não informado');
        } else {
            result = result.replace(/\{\{ultimo_pedido\}\}/gi, 'Nenhum pedido');
            result = result.replace(/\{\{rastreio\}\}/gi, 'N/A');
        }
    }
    
    return result;
}

function openNewQuickReply() {
    editingQuickReplyId = null;
    document.getElementById('editQuickReplyTitle').textContent = 'Nova Mensagem Rápida';
    document.getElementById('qrShortcut').value = '';
    document.getElementById('qrMessage').value = '';
    closeQuickReplies();
    document.getElementById('editQuickReplyModal').classList.remove('hidden');
}

function editQuickReply(id) {
    const qr = quickReplies.find(q => q.id === id);
    if (!qr) return;
    
    editingQuickReplyId = id;
    document.getElementById('editQuickReplyTitle').textContent = 'Editar Mensagem Rápida';
    document.getElementById('qrShortcut').value = qr.shortcut;
    document.getElementById('qrMessage').value = qr.message;
    closeQuickReplies();
    document.getElementById('editQuickReplyModal').classList.remove('hidden');
}

function closeEditQuickReply() {
    document.getElementById('editQuickReplyModal').classList.add('hidden');
    editingQuickReplyId = null;
}

function saveQuickReply() {
    const shortcut = document.getElementById('qrShortcut').value.trim().toLowerCase().replace(/\s/g, '_');
    const message = document.getElementById('qrMessage').value.trim();
    
    if (!shortcut || !message) return alert('Preencha todos os campos');
    
    if (editingQuickReplyId) {
        const qr = quickReplies.find(q => q.id === editingQuickReplyId);
        if (qr) {
            qr.shortcut = shortcut;
            qr.message = message;
        }
    } else {
        quickReplies.push({
            id: Date.now(),
            shortcut: shortcut,
            message: message
        });
    }
    
    localStorage.setItem('crm_quick_replies', JSON.stringify(quickReplies));
    closeEditQuickReply();
    openQuickReplies();
}

function deleteQuickReply(id) {
    if (!confirm('Excluir esta mensagem rápida?')) return;
    quickReplies = quickReplies.filter(q => q.id !== id);
    localStorage.setItem('crm_quick_replies', JSON.stringify(quickReplies));
    renderQuickRepliesList();
    lucide.createIcons();
}

function insertVariable(varName) {
    const textarea = document.getElementById('qrMessage');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.slice(0, start) + `{{${varName}}}` + text.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + varName.length + 4;
}

function showQuickReplyHint(qr) {
    let hint = document.getElementById('quickReplyHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'quickReplyHint';
        hint.className = 'absolute bottom-full left-0 mb-2 p-2 bg-white rounded-lg shadow-lg border border-slate-200 text-sm max-w-[300px]';
        document.getElementById('inputMessage').parentElement.style.position = 'relative';
        document.getElementById('inputMessage').parentElement.appendChild(hint);
    }
    
    hint.dataset.qrId = qr.id;
    hint.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">/${qr.shortcut}</span>
            <span class="text-xs text-slate-400">Tab para usar</span>
        </div>
        <p class="text-slate-600 line-clamp-2">${qr.message.substring(0, 100)}...</p>
    `;
    hint.classList.remove('hidden');
}

function hideQuickReplyHint() {
    const hint = document.getElementById('quickReplyHint');
    if (hint) hint.classList.add('hidden');
}

// ============================================================================
// SISTEMA DE SNOOZE (SONECA)
// ============================================================================
function openSnoozeModal() {
    if (!currentChatId) return alert('Selecione um chat primeiro');
    document.getElementById('snoozeModal').classList.remove('hidden');
    lucide.createIcons();
}

function closeSnoozeModal() {
    document.getElementById('snoozeModal').classList.add('hidden');
}

function snoozeChat(days) {
    if (!currentChatId) return;
    
    const wakeTime = new Date();
    wakeTime.setDate(wakeTime.getDate() + days);
    wakeTime.setHours(9, 0, 0, 0); // 09:00
    
    snoozedChats[currentChatId] = wakeTime.getTime();
    localStorage.setItem('crm_snoozed', JSON.stringify(snoozedChats));
    
    closeSnoozeModal();
    alert(`Conversa adiada! Reaparecerá em ${days} dia(s) às 09:00.`);
    
    // Remover da lista atual
    loadChats();
}

function snoozeCustom() {
    const dateInput = document.getElementById('customSnoozeDate');
    if (!dateInput.value) return;
    
    const wakeTime = new Date(dateInput.value + 'T09:00:00');
    if (wakeTime < new Date()) return alert('Selecione uma data futura');
    
    snoozedChats[currentChatId] = wakeTime.getTime();
    localStorage.setItem('crm_snoozed', JSON.stringify(snoozedChats));
    
    closeSnoozeModal();
    alert(`Conversa adiada até ${wakeTime.toLocaleDateString('pt-BR')} às 09:00.`);
    loadChats();
}

function processSnoozedChats() {
    const now = Date.now();
    let changed = false;
    
    Object.keys(snoozedChats).forEach(chatId => {
        if (snoozedChats[chatId] <= now) {
            delete snoozedChats[chatId];
            changed = true;
            console.log(`[Snooze] Chat ${chatId} acordou!`);
        }
    });
    
    if (changed) {
        localStorage.setItem('crm_snoozed', JSON.stringify(snoozedChats));
    }
}

// ============================================================================
// GRAVAÇÃO DE ÁUDIO (PTT)
// ============================================================================
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Mostrar indicador
        document.getElementById('recordingIndicator').classList.remove('hidden');
        document.getElementById('recordingIndicator').classList.add('flex');
        document.getElementById('btnRecordAudio').classList.add('text-red-500', 'bg-red-50');
        
        // Atualizar tempo
        recordingInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const min = Math.floor(elapsed / 60);
            const sec = elapsed % 60;
            document.getElementById('recordingTime').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        }, 100);
        
    } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
}

async function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    
    clearInterval(recordingInterval);
    document.getElementById('recordingIndicator').classList.add('hidden');
    document.getElementById('recordingIndicator').classList.remove('flex');
    document.getElementById('btnRecordAudio').classList.remove('text-red-500', 'bg-red-50');
    
    // Se gravou menos de 1 segundo, cancelar
    if (Date.now() - recordingStartTime < 1000) {
        mediaRecorder.stop();
        return;
    }
    
    mediaRecorder.stop();
    
    // Aguardar dados
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    await sendAudioMessage(audioBlob);
}

function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    clearInterval(recordingInterval);
    document.getElementById('recordingIndicator').classList.add('hidden');
    document.getElementById('recordingIndicator').classList.remove('flex');
    document.getElementById('btnRecordAudio').classList.remove('text-red-500', 'bg-red-50');
    audioChunks = [];
}

async function sendAudioMessage(audioBlob) {
    if (!currentChatId) return;
    
    const container = document.getElementById('messagesContainer');
    const wrap = document.createElement('div');
    wrap.className = 'w-full flex justify-end opacity-50';
    wrap.innerHTML = `
        <div class="p-3 max-w-[70%] text-sm shadow-sm msg-out">
            <div class="flex items-center gap-2">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Enviando áudio...</span>
            </div>
        </div>
    `;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    
    try {
        // Converter para base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(audioBlob);
        });
        const base64 = await base64Promise;
        
        const response = await fetch(`${API_BASE}/whatsapp/send-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number: currentChatId,
                mediaType: 'audio',
                media: base64
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        setTimeout(() => loadMessages(currentChatId), 1000);
        
    } catch (e) {
        console.error('Erro ao enviar áudio:', e);
        alert('Erro ao enviar áudio: ' + e.message);
        wrap.remove();
    }
}

// ============================================================================
// FILTROS AVANÇADOS
// ============================================================================
// Atualizar a função filterChats existente para suportar novos filtros

// ============================================================================
// MODAL DE PRODUTOS
// ============================================================================
function openProductModal() {
    document.getElementById('productModal').classList.remove('hidden');
    renderProductList(allProducts); // Renderiza todos inicialmente
}

function closeProductModal() {
    document.getElementById('productModal').classList.add('hidden');
}

function searchProducts(query) {
    const term = query.toLowerCase();
    const filtered = allProducts.filter(p => 
        (p.nome || '').toLowerCase().includes(term) || 
        (p.codigo || '').toLowerCase().includes(term)
    );
    renderProductList(filtered);
}

function renderProductList(products) {
    const container = document.getElementById('productsListModal');
    if (products.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Nenhum produto encontrado.</p>';
        return;
    }
    
    container.innerHTML = products.slice(0, 50).map(p => `
        <div class="flex items-center gap-3 p-2 border rounded hover:bg-gray-50">
            <img src="${p.imagem || 'https://via.placeholder.com/40'}" class="w-10 h-10 object-cover rounded">
            <div class="flex-1 min-w-0">
                <h5 class="font-medium text-sm truncate">${p.nome}</h5>
                <p class="text-xs text-gray-500">R$ ${parseFloat(p.preco || 0).toFixed(2)}</p>
            </div>
            <button onclick="sendProductLink('${escapeHtml(p.nome)}', '${p.link_oficial || '#'}')" 
                    class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">
                Enviar
            </button>
        </div>
    `).join('');
}

async function sendProductLink(name, link) {
    // Monta a mensagem
    const message = `Olha esse produto: ${name} – ${link}`;
    
    // Insere no input ou envia direto? O usuario pediu "Enviar"
    // Vamos enviar direito
    
    // Fechar modal
    closeProductModal();
    
    // Usar função de envio
    const input = document.getElementById('inputMessage');
    const originalText = input.value;
    input.value = message;
    await sendMessage();
    
    // Restaurar input se tivesse algo (ou não, comportamento de escolha)
    if (originalText) input.value = originalText; 
}

// Helpers
function formatPhone(jid) {
    if (!jid) return 'Desconhecido';
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}
