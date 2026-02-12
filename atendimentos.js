// ============================================================================
// INICIALIZAÇÃO DO SISTEMA - Nova Arquitetura Profissional
// ============================================================================

// ============================================================================
// CRM_MediaViewer — Lightbox inline para imagens + download de documentos
// Substitui TODOS os window.open() de mídia por experiência inline
// ============================================================================
const CRM_MediaViewer = {
    _overlay: null,

    /** Abrir imagem em lightbox fullscreen */
    open(url) {
        if (!url) return;
        this._ensureOverlay();
        this._overlay.innerHTML = `
            <div style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out" onclick="CRM_MediaViewer.close()">
                <img src="${url}" style="max-width:92vw;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5)" onclick="event.stopPropagation()" />
                <button style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:24px;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)" onclick="CRM_MediaViewer.close()">✕</button>
                <a href="${url}" download style="position:absolute;bottom:20px;right:20px;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:14px;padding:8px 16px;border-radius:8px;cursor:pointer;text-decoration:none;backdrop-filter:blur(4px)" onclick="event.stopPropagation()">⬇ Baixar</a>
            </div>`;
        this._overlay.style.display = 'block';
        document.addEventListener('keydown', this._escHandler);
    },

    /** Download direto de documento */
    download(url, filename) {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url; a.download = filename || 'documento'; a.target = '_blank';
        a.rel = 'noopener'; document.body.appendChild(a); a.click();
        setTimeout(() => a.remove(), 100);
    },

    close() {
        if (CRM_MediaViewer._overlay) CRM_MediaViewer._overlay.style.display = 'none';
        document.removeEventListener('keydown', CRM_MediaViewer._escHandler);
    },

    _escHandler(e) { if (e.key === 'Escape') CRM_MediaViewer.close(); },

    _ensureOverlay() {
        if (!this._overlay) {
            this._overlay = document.createElement('div');
            this._overlay.id = 'crm-media-overlay';
            this._overlay.style.display = 'none';
            document.body.appendChild(this._overlay);
        }
    }
};
window.CRM_MediaViewer = CRM_MediaViewer;

// ============================================================================
// INTERCEPTOR: Bloqueia window.open residual (segurança)
// ============================================================================
(function() {
    const _origOpen = window.open;
    window.open = function(url, target, features) {
        // Se for URL de mídia (imagem/documento), redirecionar para lightbox
        if (url && typeof url === 'string') {
            const ext = url.split('?')[0].split('.').pop().toLowerCase();
            if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) {
                console.warn('⚠️ window.open interceptado → CRM_MediaViewer.open', url);
                CRM_MediaViewer.open(url);
                return null;
            }
        }
        // Permitir outros usos legítimos (login OAuth, etc.)
        console.warn('⚠️ window.open chamado:', url);
        return _origOpen.call(window, url, target, features);
    };
})();

// Debounced cloud save — salva no Supabase 3s após última alteração
let _cloudSaveTimer = null;
function scheduleCloudSave() {
    if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
    _cloudSaveTimer = setTimeout(() => {
        if (window.CRMAutoSync && typeof window.CRMAutoSync.saveToCloud === 'function') {
            window.CRMAutoSync.saveToCloud();
        }
    }, 3000);
}

/**
 * Inicializar o sistema de chats com a nova arquitetura
 * Chama: Data Layer → Chat Loader → Anne Panel
 */
async function initializeApp() {
    console.log('🚀 Inicializando Central de Atendimento v2...');
    
    try {
        // 1. Carregar todos os chats (com auto-match + grupos)
        const allChatsData = await chatLoader.loadAllChats();
        
        // 2. Aplicar filtro inicial
        chatLoader.applyFilter('all');
        
        // 3. Renderizar lista
        chatLoader.renderChatsList();
        
        console.log('✅ Sistema inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar:', error);
    }
}

/**
 * Filtrar chats por tipo (contatos, grupos, etc)
 */
function filterChatsBy(type) {
    chatLoader.applyFilter(type);
    chatLoader.renderChatsList();
}

/**
 * Chamar quando clicar em um chat
 */
function selectChat(chat, chatKey) {
    console.log('[selectChat] Selecionado:', chat.displayName);
    
    // Atualizar UI
    document.querySelectorAll('.chat-item').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelector(`[data-chat-key="${chatKey}"]`)?.classList.add('active');
    
    // Disparar evento global (Anne panel escuta isso)
    window.dispatchEvent(new CustomEvent('chatSelected', { 
        detail: { chat, chatKey } 
    }));
}

// Variáveis de Estado
let currentChatId = null;
let currentClient = null;
let currentChatData = null; // Dados completos do chat atual
let currentRemoteJid = null; // CRÍTICO: Rastreia qual remoteJid está sendo exibido para validação
const _lidPhoneCache = {}; // Cache local: @lid JID → telefone real resolvido
let allClients = JSON.parse(localStorage.getItem('crm_all_clients') || '[]'); // Restaura clientes salvos localmente
let allProducts = [];
let allOrders = [];
let allChats = []; // Armazena todos os chats para filtro
let currentFilter = 'all'; // 'all', 'unread', 'waiting', 'groups', 'sales', 'vacuum', 'snoozed'
let currentTagFilter = null;
let chatRefreshInterval = null;
let connectionCheckInterval = null;
let _previousChatJid = null; // Para leave-chat do Socket.io

// Sistema de Tags
let allTags = JSON.parse(localStorage.getItem('crm_tags') || '[]');
let chatTags = JSON.parse(localStorage.getItem('crm_chat_tags') || '{}'); // { chatId: [tagId, tagId] }

// Sistema de Mensagens Rápidas
let quickReplies = JSON.parse(localStorage.getItem('crm_quick_replies') || '[]');
let editingQuickReplyId = null;

// Sistema de Snooze
let snoozedChats = JSON.parse(localStorage.getItem('crm_snoozed') || '{}'); // { chatId: timestamp }

// Sistema de Nomes Customizados (persistente)
// Quando o usuário edita/salva um nome no CRM, ele fica aqui
// { chatId: "Nome editado" }
let customContactNames = JSON.parse(localStorage.getItem('crm_custom_names') || '{}');

// Sistema de Notas dos Clientes
let clientNotes = JSON.parse(localStorage.getItem('crm_client_notes') || '{}'); // { chatId: { text, history: [] } }

// Sistema de Agendamento
let scheduledMessages = JSON.parse(localStorage.getItem('crm_scheduled') || '[]');

// ============================================================================
// SISTEMA DE MENSAGENS NÃO LIDAS (Tracking Local)
// ============================================================================
// Armazena timestamp de quando cada chat foi lido pela última vez
// { chatId: { readAt: timestamp, unreadCountOverride: 0|null } }
let _readTimestamps = JSON.parse(localStorage.getItem('crm_read_timestamps') || '{}');
// Contadores locais de não-lidas (incrementados via socket, resetados ao abrir)
let _localUnreadCounts = {};

/**
 * Obter contagem real de não-lidas para um chat.
 * Combina: unreadCount da API + incrementos locais via socket - lidos pelo usuário.
 */
function getEffectiveUnreadCount(chat) {
    const chatId = chat.id || chat.remoteJid;
    if (!chatId) return 0;
    
    // Se há override local (usuário abriu o chat), usar zero
    const readInfo = _readTimestamps[chatId];
    if (readInfo && readInfo.readAt) {
        // Se o último timestamp de leitura é mais recente que a última msg, está lido
        const lastMsgTime = getLastMessageTimestamp(chat);
        if (readInfo.readAt >= lastMsgTime) {
            // Chat lido — mas pode ter msgs novas via socket depois
            return _localUnreadCounts[chatId] || 0;
        }
    }
    
    // Se há contador local (incrementado via socket), priorizar
    if (typeof _localUnreadCounts[chatId] === 'number') {
        return _localUnreadCounts[chatId];
    }
    
    // Fallback: unreadCount original da API
    return chat.unreadCount || 0;
}

/**
 * Extrair timestamp da última mensagem de um chat
 */
function getLastMessageTimestamp(chat) {
    if (!chat) return 0;
    const ts = chat.lastMessage?.messageTimestamp;
    if (!ts) return chat.timestamp || 0;
    return ts > 1e12 ? ts : ts * 1000; // Normalizar para ms
}

/**
 * Marcar um chat como lido (local + API)
 */
function markChatAsRead(chatId) {
    if (!chatId) return;
    
    console.log(`[UNREAD] Marcando como lido: ${chatId}`);
    
    // 1. Salvar timestamp local
    _readTimestamps[chatId] = { readAt: Date.now() };
    localStorage.setItem('crm_read_timestamps', JSON.stringify(_readTimestamps));
    
    // 2. Zerar contador local
    _localUnreadCounts[chatId] = 0;
    
    // 3. Atualizar no array allChats
    const chatInArray = allChats.find(c => (c.id || c.remoteJid) === chatId);
    if (chatInArray) {
        chatInArray.unreadCount = 0;
        chatInArray._markedReadAt = Date.now();
    }
    
    // 4. Remover badge do DOM
    const chatItem = document.querySelector(`[data-chat-id="${chatId}"]`) 
                  || document.querySelector(`[data-chat-key="${chatId}"]`);
    if (chatItem) {
        // Remover badge
        const badges = chatItem.querySelectorAll('.unread-badge, .bg-emerald-500.text-white.text-xs.rounded-full');
        badges.forEach(b => b.remove());
        // Remover fundo verde
        chatItem.classList.remove('bg-green-50/30');
        // Remover negrito do nome
        const nameEl = chatItem.querySelector('.font-bold.text-slate-900');
        if (nameEl) {
            nameEl.classList.remove('font-bold', 'text-slate-900');
            nameEl.classList.add('font-medium', 'text-slate-700');
        }
        // Remover destaque do preview
        const previewEl = chatItem.querySelector('.text-slate-600.font-medium');
        if (previewEl) {
            previewEl.classList.remove('text-slate-600', 'font-medium');
            previewEl.classList.add('text-slate-500');
        }
    }
    
    // 5. Atualizar contadores dos filtros
    updateFilterCounts();
    
    // 6. Chamar API para marcar como lido no WhatsApp (best-effort, não bloqueia)
    fetch(`${API_BASE}/whatsapp/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteJid: chatId })
    }).catch(err => console.warn('[UNREAD] Erro ao marcar como lido na API:', err.message));
}

/**
 * Incrementar contador de não-lidas para um chat (quando chega msg via socket)
 */
function incrementUnreadCount(chatId) {
    if (!chatId) return;
    
    // Incrementar contador local
    _localUnreadCounts[chatId] = (_localUnreadCounts[chatId] || 0) + 1;
    
    // Atualizar no array allChats
    const chatInArray = allChats.find(c => (c.id || c.remoteJid) === chatId);
    if (chatInArray) {
        chatInArray.unreadCount = (chatInArray.unreadCount || 0) + 1;
    }
    
    // Atualizar contadores dos filtros
    updateFilterCounts();
}

/**
 * Ao re-carregar a lista da API, preservar os estados de leitura local.
 * Chamado após loadChats() ou refreshChatListBackground().
 */
function applyLocalReadStates(chats) {
    if (!Array.isArray(chats)) return chats;
    
    const now = Date.now();
    // Limpar leituras antigas (> 24h) para não acumular
    for (const [chatId, info] of Object.entries(_readTimestamps)) {
        if (info.readAt && (now - info.readAt) > 24 * 60 * 60 * 1000) {
            delete _readTimestamps[chatId];
        }
    }
    
    chats.forEach(chat => {
        const chatId = chat.id || chat.remoteJid;
        const readInfo = _readTimestamps[chatId];
        
        if (readInfo && readInfo.readAt) {
            const lastMsgTime = getLastMessageTimestamp(chat);
            
            if (readInfo.readAt >= lastMsgTime) {
                // Chat foi lido após a última mensagem — zerar unread
                chat.unreadCount = _localUnreadCounts[chatId] || 0;
            } else {
                // Chegou msg nova depois da leitura — manter contagem da API
                // mas adicionar incrementos locais se houver
                if (typeof _localUnreadCounts[chatId] === 'number' && _localUnreadCounts[chatId] > (chat.unreadCount || 0)) {
                    chat.unreadCount = _localUnreadCounts[chatId];
                }
            }
        }
    });
    
    localStorage.setItem('crm_read_timestamps', JSON.stringify(_readTimestamps));
    return chats;
}

// Estado da conexão
let connectionState = {
    status: 'unknown',
    lastCheck: null,
    isConnecting: false
};

// Gravação de Áudio - NOVA VERSÃO
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let recordedAudioBlob = null;
let recordedAudioUrl = null;
let audioElement = null;

// ============================================================================
// DETECÇÃO AUTOMÁTICA DE AMBIENTE (localhost vs produção)
// ============================================================================
const CRM_BACKEND_URL = (() => {
    const host = window.location.hostname;
    // Localhost: server.js roda na mesma máquina
    if (host === 'localhost' || host === '127.0.0.1') {
        return ''; // Mesma origem (relative path)
    }
    // Produção no Easypanel: backend na mesma origem
    if (host.includes('easypanel.host') || host.includes('cjota-crm')) {
        return ''; // Mesma origem (servido pelo server.js)
    }
    // Netlify ou outro domínio externo: apontar para VPS
    return 'https://cjota-crm.9eo9b2.easypanel.host';
})();

const API_BASE = CRM_BACKEND_URL ? `${CRM_BACKEND_URL}/api` : '/api';
// Exportar globalmente para libs (lib-data-layer.js, lib-chat-loader.js, etc.)
window.CRM_API_BASE = API_BASE;
console.log(`[CONFIG] Ambiente: ${window.location.hostname} → API_BASE: ${API_BASE}`);

// ============================================================================
// SOCKET.IO — CONEXÃO EM TEMPO REAL COM O SERVIDOR
// ============================================================================
let socket = null;
let _socketReconnectAttempts = 0;
let _lastDisconnectTime = null;

// Controle de refresh periódico da lista de chats
let _chatListRefreshInterval = null;
let _lastChatListRefresh = 0;
const CHAT_LIST_REFRESH_INTERVAL = 15000; // 15 segundos
const CHAT_LIST_REFRESH_ON_RECONNECT_DELAY = 500; // 500ms após reconexão

function initSocket() {
    if (typeof io === 'undefined') {
        console.warn('[SOCKET.IO] Biblioteca não carregada, usando fallback de polling');
        // Sem Socket.IO → polling agressivo como fallback
        startChatListPolling(10000);
        return;
    }
    
    // Socket.IO: conectar ao backend correto
    const socketTarget = CRM_BACKEND_URL || undefined; // undefined = mesma origem
    socket = io(socketTarget, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 15000
    });
    
    socket.on('connect', () => {
        console.log(`[SOCKET.IO] ✅ Conectado: ${socket.id}`);
        _socketReconnectAttempts = 0;
        updateSocketStatusUI(true);
        
        // Re-entrar no chat atual se houver
        if (currentRemoteJid) {
            socket.emit('join-chat', currentRemoteJid);
        }
        
        // Se houve desconexão, recarregar TUDO (lista + chat ativo)
        if (_lastDisconnectTime) {
            const offlineTime = Date.now() - _lastDisconnectTime;
            console.log(`[SOCKET.IO] Reconectado após ${Math.round(offlineTime/1000)}s offline — sincronizando...`);
            
            // Refresh da lista de chats (pega mensagens perdidas)
            setTimeout(() => {
                refreshChatListBackground();
            }, CHAT_LIST_REFRESH_ON_RECONNECT_DELAY);
            
            // Recarregar mensagens do chat ativo
            if (currentRemoteJid) {
                loadMessages(currentRemoteJid, true);
            }
            
            _lastDisconnectTime = null;
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.warn(`[SOCKET.IO] ⚠️ Desconectado: ${reason}`);
        _lastDisconnectTime = Date.now();
        updateSocketStatusUI(false);
    });
    
    socket.on('reconnect_attempt', (attempt) => {
        _socketReconnectAttempts = attempt;
        if (attempt % 3 === 0) {
            console.log(`[SOCKET.IO] Tentativa de reconexão #${attempt}...`);
        }
    });
    
    // ======== MENSAGEM NOVA EM TEMPO REAL ========
    socket.on('new-message', (msg) => {
        console.log(`[SOCKET.IO] Nova mensagem: ${msg.fromMe ? 'ENVIADA' : 'RECEBIDA'} em ${msg.jid}`);
        
        // Atualizar lista de chats (badge, preview, ordenação)
        // Se o chat não existir na lista, adicionar automaticamente
        updateChatListWithNewMessage(msg);
        
        // Se a mensagem é do chat aberto, renderizar instantaneamente
        if (currentRemoteJid && msg.jid === currentRemoteJid) {
            appendRealtimeMessage(msg);
            // Chat ativo — marcar como lido automaticamente
            markChatAsRead(msg.jid);
        } else if (!msg.fromMe) {
            // Mensagem em outro chat — incrementar contador de não-lidas
            incrementUnreadCount(msg.jid);
            // Notificação visual de nova mensagem em outro chat
            showNewMessageNotification(msg);
        }
    });
    
    // ======== STATUS DE CONEXÃO WHATSAPP ========
    socket.on('connection-update', (data) => {
        console.log(`[SOCKET.IO] Conexão WhatsApp: ${data.state}`);
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        if (dot && text) {
            if (data.state === 'open') {
                dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
                text.textContent = 'Conectado';
                text.className = 'text-xs font-medium text-emerald-600';
            } else {
                dot.className = 'w-2.5 h-2.5 rounded-full bg-red-500';
                text.textContent = 'Desconectado';
                text.className = 'text-xs font-medium text-red-600';
            }
        }
    });
    
    // ======== STATUS DE MENSAGEM (lido/entregue) ========
    socket.on('message-status', (data) => {
        updateMessageStatusIcons(data);
    });
    
    // ======== ALERTAS DE STATUS DE PEDIDO (Módulo 6) ========
    socket.on('order-status-update', (data) => {
        console.log(`[SOCKET.IO] Status de pedido atualizado: ${data.orderId} → ${data.status}`);
        
        // Mostrar notificação visual
        const statusLabels = {
            'aprovado': '✅ Pedido Aprovado',
            'separacao': '📦 Em Separação',
            'postado': '🚚 Pedido Enviado',
            'transito': '🚚 Em Trânsito',
            'entregue': '🎉 Entregue'
        };
        
        const label = statusLabels[data.status] || `Status: ${data.status}`;
        const notifDiv = document.createElement('div');
        notifDiv.className = 'fixed top-4 right-4 z-50 bg-white rounded-xl shadow-lg border border-emerald-200 p-4 max-w-sm animate-in';
        notifDiv.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <i data-lucide="package" class="w-5 h-5 text-emerald-600"></i>
                </div>
                <div>
                    <p class="font-semibold text-slate-800 text-sm">${label}</p>
                    <p class="text-xs text-slate-500">${data.clientName || ''} · #${data.orderId?.slice(0, 8) || ''}</p>
                    ${data.tracking_code ? `<p class="text-xs text-emerald-600 mt-1">📦 ${data.tracking_code}</p>` : ''}
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">✕</button>
            </div>
        `;
        document.body.appendChild(notifDiv);
        if (window.lucide) lucide.createIcons();
        setTimeout(() => notifDiv.remove(), 8000);
        
        // Se o chat desse cliente estiver aberto, recarregar mensagens
        if (currentRemoteJid && data.clientPhone) {
            const jid = data.clientPhone.includes('@') ? data.clientPhone : data.clientPhone + '@s.whatsapp.net';
            if (jid === currentRemoteJid) {
                setTimeout(() => loadMessages(currentRemoteJid, true), 2000);
            }
        }
    });
    
    // Keep-alive customizado a cada 25s
    setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('ping-crm');
        }
    }, 25000);
    
    // Iniciar refresh periódico da lista de chats (backup ao socket)
    startChatListPolling(CHAT_LIST_REFRESH_INTERVAL);
}

/**
 * Indicador visual do estado do Socket.IO na UI
 */
function updateSocketStatusUI(connected) {
    const indicator = document.getElementById('socketStatusIndicator');
    if (!indicator) return;
    if (connected) {
        indicator.className = 'w-2 h-2 rounded-full bg-green-500';
        indicator.title = 'Tempo real ativo';
    } else {
        indicator.className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';
        indicator.title = 'Reconectando...';
    }
}

/**
 * Atualizar ícones de status de mensagem (✓, ✓✓, ✓✓ azul)
 */
function updateMessageStatusIcons(data) {
    if (!data || !data.keyId) return;
    const msgEl = document.querySelector(`[data-msg-id="${data.keyId}"]`);
    if (!msgEl) return;
    const statusEl = msgEl.querySelector('.msg-status');
    if (statusEl) {
        if (data.status === 'READ') statusEl.innerHTML = '<span class="text-blue-500">✓✓</span>';
        else if (data.status === 'DELIVERY_ACK') statusEl.textContent = '✓✓';
        else if (data.status === 'SERVER_ACK') statusEl.textContent = '✓';
    }
}

/**
 * Refresh periódico leve da lista de chats (polling de segurança).
 * Roda a cada N ms; quando Socket.IO está ativo, faz refresh leve.
 * Quando desconectado, faz refresh mais agressivo.
 */
function startChatListPolling(intervalMs) {
    if (_chatListRefreshInterval) clearInterval(_chatListRefreshInterval);
    
    _chatListRefreshInterval = setInterval(() => {
        const now = Date.now();
        // Evitar refresh se acabou de fazer um
        if (now - _lastChatListRefresh < 8000) return;
        
        // Socket desconectado: refresh imediato
        if (!socket || !socket.connected) {
            console.log('[POLLING] Socket desconectado — refresh da lista...');
            refreshChatListBackground();
        } else {
            // Com socket ativo, refresh leve a cada 60s (apenas backup, msgs novas já atualizam via new-message)
            if (now - _lastChatListRefresh > 60000) {
                refreshChatListBackground();
            }
        }
    }, intervalMs);
}

/**
 * Refresh da lista de chats em background (sem travar UI)
 * Usa delta sync: compara com a lista atual e só atualiza diferenças
 */
async function refreshChatListBackground() {
    _lastChatListRefresh = Date.now();
    
    try {
        // Usar o chatLoader que já tem delta sync com IndexedDB
        if (window.chatLoader) {
            await window.chatLoader.loadAllChats(false);
        }
    } catch (err) {
        console.warn('[REFRESH] Erro no refresh background:', err.message);
    }
}

/**
 * Renderizar uma mensagem instantaneamente no chat aberto (sem re-fetch completo)
 */
function appendRealtimeMessage(msg) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    // Evitar duplicatas
    if (container.querySelector(`[data-msg-id="${msg.id}"]`)) return;
    
    const isMe = msg.fromMe;
    const time = new Date(msg.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Formatar texto (com suporte a links e formatação WhatsApp)
    let contentHtml = '';
    if (msg.text) {
        contentHtml = typeof formatWhatsAppText === 'function' ? formatWhatsAppText(msg.text) : escapeHtml(msg.text);
    }
    if (msg.mediaType === 'image' && msg.mediaUrl) {
        contentHtml = `<img src="${msg.mediaUrl}" class="rounded-lg max-w-full max-h-[300px] cursor-pointer" onclick="CRM_MediaViewer.open('${msg.mediaUrl}')" loading="lazy" />` + (contentHtml ? `<p class="mt-1 text-sm">${contentHtml}</p>` : '');
    } else if (msg.mediaType === 'audio') {
        const audioUrl = msg.mediaUrl || (msg.raw?.message?.audioMessage?.playableUrl) || (msg.raw?.message?.audioMessage?.url) || '';
        const duration = msg.raw?.message?.audioMessage?.seconds || 0;
        const audioId = `audio-rt-${msg.id || Date.now()}`;
        if (audioUrl) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            contentHtml = `
                <div class="audio-player-whatsapp flex items-center gap-2 p-2 rounded-lg bg-white/50 min-w-[200px]" data-audio-id="${audioId}">
                    <button onclick="toggleAudioPlay('${audioId}', '${audioUrl}')" class="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition shadow-sm">
                        <i data-lucide="play" class="w-4 h-4 play-icon"></i>
                        <i data-lucide="pause" class="w-4 h-4 pause-icon hidden"></i>
                    </button>
                    <div class="flex-1 flex flex-col gap-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden cursor-pointer audio-progress-bar" onclick="seekAudio(event, '${audioId}')">
                                <div class="h-full bg-emerald-500 audio-progress" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-500">
                            <span class="audio-time">0:00</span>
                            <span>/</span>
                            <span>${timeStr}</span>
                            <button onclick="changePlaybackSpeed('${audioId}')" class="ml-auto text-[10px] font-medium text-emerald-600 hover:text-emerald-700 audio-speed">1x</button>
                        </div>
                    </div>
                    <audio class="hidden" id="${audioId}" preload="metadata">
                        <source src="${audioUrl}" type="audio/ogg; codecs=opus">
                        <source src="${audioUrl}" type="audio/mpeg">
                        <source src="${audioUrl}" type="audio/mp4">
                    </audio>
                </div>`;
            // Refresh Lucide icons após inserir no DOM
            setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
        } else {
            contentHtml = `<div class="flex items-center gap-2"><span class="text-lg">🎧</span> <span>Áudio (${duration}s)</span></div>`;
        }
    } else if (msg.mediaType === 'video') {
        contentHtml = `<div class="flex items-center gap-2"><span class="text-lg">🎬</span> <span>${contentHtml || 'Vídeo'}</span></div>`;
    } else if (msg.mediaType === 'document') {
        contentHtml = `<div class="flex items-center gap-2"><span class="text-lg">📄</span> <span>${contentHtml || 'Documento'}</span></div>`;
    }
    
    if (!contentHtml) contentHtml = '<span class="text-slate-400 italic">Mensagem sem conteúdo</span>';
    
    const bubble = document.createElement('div');
    bubble.setAttribute('data-msg-id', msg.id);
    bubble.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-2 msg-animate-in`;
    bubble.innerHTML = `
        <div class="max-w-[75%] ${isMe ? 'bg-emerald-100 rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl' : 'bg-white rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'} px-3 py-2 shadow-sm">
            ${!isMe && msg.pushName ? `<p class="text-xs font-semibold text-emerald-700 mb-0.5">${escapeHtml(msg.pushName)}</p>` : ''}
            <div class="text-sm text-slate-800 break-words">${contentHtml}</div>
            <p class="text-[10px] text-slate-400 text-right mt-0.5">${time}${isMe ? ' ✓✓' : ''}</p>
        </div>
    `;
    
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    
    // Atualizar cache
    if (window.chatLoader && msg.raw) {
        const cached = window.chatLoader.getCachedMessages(currentRemoteJid) || [];
        cached.push(msg.raw);
        window.chatLoader.setCachedMessages(currentRemoteJid, cached);
    }
}

/**
 * Atualizar lista de chats quando uma mensagem nova chega.
 * Se o chat NÃO existe na lista, cria um item temporário e agenda refresh completo.
 */
function updateChatListWithNewMessage(msg) {
    if (!msg || !msg.jid) return;
    
    // Tentar encontrar por data-chat-key (pode usar createChatKey se existir)
    const chatKey = typeof createChatKey === 'function' ? createChatKey(msg.jid) : msg.jid;
    let chatItem = document.querySelector(`[data-chat-key="${chatKey}"]`);
    
    // Se não encontrou, tentar variações do JID (com/sem @s.whatsapp.net)
    if (!chatItem) {
        chatItem = document.querySelector(`[data-chat-key="${msg.jid}"]`);
    }
    
    const chatsList = document.getElementById('chatsList');
    
    if (!chatItem && chatsList) {
        // ======== CHAT NOVO: Criar item temporário na lista ========
        console.log(`[REALTIME] Chat novo detectado: ${msg.pushName || msg.jid}`);
        
        const displayName = msg.pushName || msg.jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        const initial = (displayName || '?').charAt(0).toUpperCase();
        const preview = msg.text ? msg.text.substring(0, 50) : '[Mídia]';
        const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isGroup = msg.isGroup || msg.jid.includes('@g.us');
        
        chatItem = document.createElement('div');
        chatItem.className = 'chat-item p-3 border-b hover:bg-gray-50 cursor-pointer transition select-none chat-new-highlight';
        chatItem.setAttribute('data-chat-key', chatKey);
        chatItem.innerHTML = `
            <div class="flex gap-3">
                <div class="flex-shrink-0">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold">
                        ${isGroup ? '👥' : initial}
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-semibold text-gray-900 truncate">${escapeHtml(displayName)}</span>
                    </div>
                    <div class="chat-preview text-sm text-gray-600 truncate">${escapeHtml(preview)}</div>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-1">
                    <span class="chat-time text-xs text-gray-500">${timeStr}</span>
                    <span class="unread-badge inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-emerald-500 rounded-full">1</span>
                </div>
            </div>
        `;
        
        // Click handler — abrir o chat
        chatItem.onclick = () => {
            const chatObj = {
                remoteJid: msg.jid,
                id: msg.jid,
                displayName: displayName,
                isGroup: isGroup,
                cleanPhone: msg.jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
            };
            if (typeof window.openChat === 'function') {
                window.openChat(chatObj);
            }
        };
        
        // Inserir no TOPO da lista
        chatsList.insertBefore(chatItem, chatsList.firstChild);
        
        // Flash animation para chamar atenção
        chatItem.style.animation = 'chatNewPulse 1s ease-out';
        
        // Agendar refresh completo para enriquecer o chat (foto, dados CRM, etc.)
        clearTimeout(updateChatListWithNewMessage._refreshTimer);
        updateChatListWithNewMessage._refreshTimer = setTimeout(() => {
            refreshChatListBackground();
        }, 3000);
        
        return; // Já tratado - sair
    }
    
    if (!chatItem) return;
    
    // ======== CHAT EXISTENTE: Atualizar in-place ========
    
    // Atualizar preview (buscar variáveis classes possíveis)
    const preview = chatItem.querySelector('.chat-preview') 
                 || chatItem.querySelector('.text-slate-500')
                 || chatItem.querySelector('.text-gray-600.truncate');
    if (preview) {
        preview.textContent = msg.text ? msg.text.substring(0, 50) : '[Mídia]';
    }
    
    // Atualizar horário
    const time = chatItem.querySelector('.chat-time') 
              || chatItem.querySelector('.text-xs.text-slate-400')
              || chatItem.querySelector('.text-xs.text-gray-500');
    if (time) {
        time.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Mover para o topo da lista
    const chatList = chatItem.parentElement;
    if (chatList && chatList.firstChild !== chatItem) {
        chatList.insertBefore(chatItem, chatList.firstChild);
        // Animação sutil ao mover
        chatItem.style.animation = 'none';
        chatItem.offsetHeight; // Force reflow
        chatItem.style.animation = 'chatSlideIn 0.3s ease-out';
    }
    
    // Badge de não-lida se não é o chat ativo
    if (msg.jid !== currentRemoteJid && !msg.fromMe) {
        let badge = chatItem.querySelector('.unread-badge');
        if (badge) {
            const count = parseInt(badge.textContent || '0') + 1;
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            // Criar badge se não existir
            const timeContainer = chatItem.querySelector('.flex-shrink-0.flex.flex-col') 
                               || chatItem.querySelector('.flex-shrink-0:last-child');
            if (timeContainer) {
                const newBadge = document.createElement('span');
                newBadge.className = 'unread-badge inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-emerald-500 rounded-full';
                newBadge.textContent = '1';
                timeContainer.appendChild(newBadge);
            }
        }
    }
}
// Timer para debounce do refresh
updateChatListWithNewMessage._refreshTimer = null;

/**
 * Notificação de nova mensagem (toast + som)
 */
function showNewMessageNotification(msg) {
    const name = msg.pushName || msg.jid.replace('@s.whatsapp.net', '');
    const text = msg.text ? msg.text.substring(0, 60) : '[Mídia]';
    showToast(`💬 ${name}: ${text}`, 'info');
    
    // Som de notificação (se disponível)
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

/**
 * Obter timestamp da última mensagem exibida no container
 * Usado para polling inteligente: só re-buscar se parece haver gap
 */
function getLastDisplayedMessageTime() {
    const container = document.getElementById('messagesContainer');
    if (!container) return null;
    const allMsgs = container.querySelectorAll('[data-msg-id]');
    if (allMsgs.length === 0) return null;
    const lastMsg = allMsgs[allMsgs.length - 1];
    // Tentar pegar do data attribute ou do timestamp no texto
    const timeText = lastMsg.querySelector('.text-\\[10px\\], .text-xs.text-slate-400, .text-xs.text-gray-400');
    if (timeText) {
        // Parsear HH:MM do horário
        const match = timeText.textContent.match(/(\d{2}):(\d{2})/);
        if (match) {
            const now = new Date();
            const msgDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(match[1]), parseInt(match[2]));
            return msgDate.getTime();
        }
    }
    // Fallback: retornar null (vai fazer polling normal)
    return null;
}

// ============================================================================
// INTERCEPTOR DE SESSÃO EXPIRADA (401)
// ============================================================================
// Substitui o fetch nativo para detectar 401 e redirecionar ao login
const _originalFetch = window.fetch;
let _redirectingToLogin = false;
window.fetch = async function(...args) {
    const response = await _originalFetch.apply(this, args);
    if (response.status === 401 && !_redirectingToLogin) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        // Só interceptar chamadas à nossa API, não externas
        if (url.startsWith('/api/') || url.startsWith(API_BASE) || (CRM_BACKEND_URL && url.startsWith(CRM_BACKEND_URL))) {
            _redirectingToLogin = true;
            console.warn('[Auth] Sessão expirada — redirecionando ao login');
            if (typeof showToast === 'function') {
                showToast('Sessão expirada. Fazendo login novamente...', 'warning');
            }
            setTimeout(() => {
                window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
            }, 1500);
        }
    }
    return response;
};

// ============================================================================
// FUNÇÕES DE TELEFONE - Usar lib-data-layer.js (centralizado)
// ============================================================================
// NOTA: As funções principais (normalizePhone, extractPhoneFromJid) estão em lib-data-layer.js
// Aqui criamos apenas aliases para compatibilidade com código legado

// Alias para compatibilidade com código antigo
function cleanPhoneNumber(rawNumber) {
    // Usa normalizePhone do lib-data-layer.js
    if (typeof window.normalizePhone === 'function') {
        return window.normalizePhone(rawNumber);
    }
    // Fallback se lib não carregou
    if (!rawNumber) return '';
    return String(rawNumber).replace(/\D/g, '').slice(-11);
}

// Alias local para extractPhoneFromJid (usa a do lib-data-layer.js)
// NOTA: NÃO redefinir esta função aqui - usar window.extractPhoneFromJid diretamente
// ou a função do lib-data-layer.js que já está exportada
function localExtractPhone(jid) {
    // Usa a função do data-layer se disponível
    if (window.normalizePhone) {
        return window.normalizePhone(jid);
    }
    // Fallback simples
    return cleanPhoneNumber(jid);
}

// Normaliza o remoteJid para comparação (sempre com DDI 55 no início)
function normalizeJid(jid) {
    if (!jid) return '';
    
    // Se for um remoteJid normal, retornar como está
    if (String(jid).includes('@s.whatsapp.net') || String(jid).includes('@c.us')) {
        return jid;
    }
    
    // Se for um número limpo, adicionar DDI e sufixo
    const phone = window.extractPhoneFromJid ? window.extractPhoneFromJid(jid) : jid;
    if (phone && !phone.startsWith('55')) {
        return '55' + phone + '@s.whatsapp.net';
    }
    
    return phone + '@s.whatsapp.net';
}

// Formatar número de telefone para exibição
function formatPhone(rawNumber) {
    if (!rawNumber) return 'Sem número';
    
    // Usar formatPhoneForDisplay do lib-data-layer.js se disponível
    if (window.formatPhoneForDisplay) {
        const formatted = window.formatPhoneForDisplay(rawNumber);
        if (formatted && formatted !== rawNumber) {
            return formatted;
        }
    }
    
    // Fallback: formatação própria
    const cleaned = cleanPhoneNumber(rawNumber);
    
    if (!cleaned || cleaned.length < 8) return rawNumber;
    
    // Garantir que temos exatamente 10 ou 11 dígitos
    let normalized = cleaned;
    if (normalized.length > 11) {
        normalized = normalized.slice(-11);
    } else if (normalized.length < 10) {
        return `+55 ${normalized}`;
    }
    
    // Se tiver 10 ou 11 dígitos, é um número válido de Brasil
    if (normalized.length === 11) {
        // Celular: +55 (XX) XXXXX-XXXX
        return `+55 (${normalized.substring(0, 2)}) ${normalized.substring(2, 7)}-${normalized.substring(7)}`;
    } else if (normalized.length === 10) {
        // Fixo: +55 (XX) XXXX-XXXX
        return `+55 (${normalized.substring(0, 2)}) ${normalized.substring(2, 6)}-${normalized.substring(6)}`;
    } else if (normalized.length > 8) {
        return `+55 ${normalized.substring(0, normalized.length - 4)}-${normalized.substring(normalized.length - 4)}`;
    }
    
    return `+55 ${normalized}`;
}

// Alias para compatibilidade
function cleanPhoneForSearch(rawNumber) {
    return cleanPhoneNumber(rawNumber);
}

// ============================================================================
// FORMATAÇÃO DE TEXTO WHATSAPP
// ============================================================================
function formatWhatsAppText(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Escapar HTML primeiro para evitar XSS
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    // Aplicar formatação WhatsApp
    // *negrito*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // _itálico_
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // ~tachado~
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    
    // Quebras de linha
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Detectar links de pedido (ex: cjotarasteirinhas.com.br/pedido/5230599/mkTzLX)
    // Transformar em links clicáveis que abrem detalhes do pedido no CRM
    formatted = formatted.replace(
        /(https?:\/\/[^\s]*\/pedido\/(\d+)[^\s]*)/g,
        '<a href="$1" target="_blank" class="text-blue-500 underline hover:text-blue-600">$1</a> <button onclick="showOrderDetails(\'$2\')" class="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium hover:bg-purple-200 transition-colors" title="Ver pedido no CRM"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>#$2</button>'
    );
    
    // Links genéricos clicáveis (que não sejam de pedido, já tratados acima)
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)(?!<\/a>)/g, (match) => {
        // Ignorar se já está dentro de um <a> tag
        if (match.includes('</a>') || match.includes('<button')) return match;
        return `<a href="${match}" target="_blank" class="text-blue-500 underline hover:text-blue-600">${match}</a>`;
    });
    
    return formatted;
}

// Função para extrair nome de contato (prioridade: CustomName > CRM > WhatsApp > Telefone)
function getContactDisplayName(chatData) {
    if (!chatData) return 'Desconhecido';
    
    const jid = chatData.id || chatData.remoteJid;
    
    // NUNCA retornar "Você" para conversas
    if (!jid) return 'Desconhecido';
    
    // ★ PRIORIDADE 0: Nome customizado pelo usuário (salvo localmente)
    if (customContactNames[jid] && customContactNames[jid].trim()) {
        return customContactNames[jid].trim();
    }
    
    // Se for grupo
    if (jid.includes('@g.us')) {
        return chatData.name || chatData.subject || 'Grupo';
    }
    
    // Se for lead de anúncio (@lid), usar nome alternativo
    if (jid.includes('@lid')) {
        if (chatData.name && chatData.name !== 'undefined' && !chatData.name.includes('@lid')) {
            return chatData.name;
        }
        if (chatData.pushName && chatData.pushName !== 'undefined') {
            return chatData.pushName;
        }
        return 'Lead (Anúncio)';
    }
    
    // Extrair número limpo do JID
    const cleanPhone = cleanPhoneNumber(jid);
    
    // 1. PRIORIDADE 1: Nome do CRM (usando displayName do enrichChat se disponível)
    if (chatData.isKnownClient && chatData.client?.name) {
        return chatData.client.name;
    }
    if (chatData.displayName && chatData.isKnownClient) {
        return chatData.displayName;
    }
    
    if (cleanPhone && cleanPhone.length >= 8 && allClients && allClients.length > 0) {
        const last9 = cleanPhone.slice(-9);
        
        const client = allClients.find(c => {
            const phones = [c.telefone, c.celular, c.whatsapp, c.phone]
                .filter(Boolean)
                .map(p => cleanPhoneNumber(p))
                .filter(p => p.length >= 8);
            return phones.some(p => p === cleanPhone || p.slice(-9) === last9);
        });
        
        if (client && client.nome && client.nome.trim()) {
            return client.nome.trim();
        }
    }
    
    // 2. PRIORIDADE 2: PushName do WhatsApp (mas NUNCA "Você" ou "Desconhecido")
    if (chatData.pushName && chatData.pushName.trim() && 
        chatData.pushName !== 'undefined' && chatData.pushName !== 'Você' &&
        chatData.pushName !== 'Desconhecido' && chatData.pushName !== cleanPhone &&
        !chatData.pushName.match(/^\d+$/)) { // Não usar se for só números
        return chatData.pushName.trim();
    }
    
    if (chatData.name && chatData.name.trim() && 
        chatData.name !== 'undefined' && chatData.name !== 'Você' &&
        chatData.name !== 'Desconhecido' && chatData.name !== cleanPhone &&
        !chatData.name.match(/^\d+$/)) { // Não usar se for só números
        return chatData.name.trim();
    }
    
    // 3. PRIORIDADE 3: Telefone formatado (se tiver número válido)
    if (cleanPhone && cleanPhone.length >= 8) {
        return formatPhone(jid);
    }
    
    return 'Contato Desconhecido';
}

// ============================================================================
// PAINEL DE CONTATO (tipo WhatsApp Web)
// ============================================================================

// ============================================================================
// GERENCIAMENTO DE CLIENTE (Consolidado)
// ============================================================================

function copyPhone() {
    const currentJid = currentChatData?.remoteJid;
    if (!currentJid) return;
    
    // @lid JIDs não contêm telefone real
    const isLidChat = currentJid.includes('@lid');
    const cleanedPhone = isLidChat 
        ? (currentChatData?.phone ? cleanPhoneNumber(currentChatData.phone) : '')
        : cleanPhoneNumber(currentJid);
    
    if (!cleanedPhone) {
        alert('Este contato não possui número de telefone disponível');
        return;
    }
    navigator.clipboard.writeText(cleanedPhone).then(() => {
        alert('Número copiado: ' + cleanedPhone);
    });
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

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
    scheduleCloudSave();
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
    scheduleCloudSave();
}

// Helper: Carregar clients do IndexedDB (mesma DB crm_storage_v1 usada por script.js / lib-auto-sync.js)
function _loadClientsFromIDB() {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open('crm_storage_v1', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('data')) {
                    db.createObjectStore('data', { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => {
                try {
                    const db = e.target.result;
                    const tx = db.transaction('data', 'readonly');
                    const getReq = tx.objectStore('data').get('crm_clients');
                    getReq.onsuccess = () => resolve(getReq.result?.value || null);
                    getReq.onerror = () => resolve(null);
                } catch { resolve(null); }
            };
            req.onerror = () => resolve(null);
        } catch { resolve(null); }
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Escutar evento de dados carregados do Supabase para atualizar variáveis
    window.addEventListener('crm-cloud-loaded', async () => {
        console.log('[Atendimento] Recarregando dados do Supabase...');
        allTags = JSON.parse(localStorage.getItem('crm_tags') || '[]');
        chatTags = JSON.parse(localStorage.getItem('crm_chat_tags') || '{}');
        quickReplies = JSON.parse(localStorage.getItem('crm_quick_replies') || '[]');
        snoozedChats = JSON.parse(localStorage.getItem('crm_snoozed') || '{}');
        clientNotes = JSON.parse(localStorage.getItem('crm_client_notes') || '{}');
        scheduledMessages = JSON.parse(localStorage.getItem('crm_scheduled') || '[]');
        // Recarregar clientes — tenta localStorage, senão IndexedDB (crm_storage_v1)
        try {
            let freshClients = JSON.parse(localStorage.getItem('crm_clients') || '[]');
            // Se localStorage estiver vazio ou com versão mínima, tentar IndexedDB
            if (freshClients.length === 0 || (freshClients.length > 0 && !freshClients[0].products)) {
                try {
                    const idbClients = await _loadClientsFromIDB();
                    if (idbClients && idbClients.length > freshClients.length) {
                        freshClients = idbClients;
                        console.log(`[Atendimento] Clientes carregados do IndexedDB: ${freshClients.length}`);
                    }
                } catch {}
            }
            if (freshClients.length > 0) {
                allClients = freshClients;
                console.log(`[Atendimento] allClients atualizado: ${allClients.length} clientes`);
            }
        } catch(e) {}
        loadCRMData();
    });

    // 1. Verificar conexão WhatsApp + Inicializar chats EM PARALELO
    const [_, __] = await Promise.all([
        checkConnection(),
        initializeApp()
    ]);

    // 1.5. Iniciar Socket.io para mensagens em tempo real
    initSocket();

    // 2. Carregar dados do CRM (Clientes/Produtos/Pedidos)
    loadCRMData();

    // 3. Processar snoozes (verificar se algum deve "acordar")
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
    const connectBtn = document.querySelector('[onclick="connectWhatsapp()"]');
    const originalBtnContent = connectBtn ? connectBtn.innerHTML : '';
    
    // Estado de loading no botão
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.innerHTML = `
            <svg class="animate-spin h-4 w-4 mr-2 inline" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Conectando...
        `;
    }
    
    statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span> Buscando QR Code...';
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/connect`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Servidor retornou erro ${res.status}`);
        }
        
        const data = await res.json();
        
        if (data.base64) {
            // Mostrar QR Code
            const qrContainer = document.getElementById('qrContainer');
            let b64 = data.base64;
            if (!b64.startsWith('data:image')) {
                b64 = 'data:image/png;base64,' + b64;
            }
            qrContainer.innerHTML = `
                <img src="${b64}" class="w-full h-full object-contain" alt="QR Code WhatsApp">
                <p class="text-sm text-gray-500 mt-2 text-center">Aponte a câmera do WhatsApp para o QR Code</p>
            `;
            document.getElementById('qrModal').classList.remove('hidden');
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span> Escaneie o QR';
            
            // Restaurar botão
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.innerHTML = originalBtnContent;
            }

            // Polling de conexão com timeout
            let attempts = 0;
            const maxAttempts = 60; // 2 minutos máximo
            
            const poolInterval = setInterval(async () => {
                attempts++;
                
                if (attempts >= maxAttempts) {
                    clearInterval(poolInterval);
                    document.getElementById('qrModal').classList.add('hidden');
                    statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> QR Expirado';
                    showToast('⏰ QR Code expirou. Tente conectar novamente.', 'warning');
                    hideConnectionAlert(); // Limpar alerta
                    return;
                }
                
                try {
                    const s = await fetch(`${API_BASE}/whatsapp/status`);
                    const d = await s.json();
                    
                    if (d.instance?.state === 'open' || d.state === 'open') {
                        clearInterval(poolInterval);
                        document.getElementById('qrModal').classList.add('hidden');
                        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado';
                        showToast('✅ WhatsApp conectado com sucesso!', 'success');
                        hideConnectionAlert();
                        loadChats();
                    }
                } catch(e) {
                    console.warn('Polling error:', e);
                }
            }, 2000);

        } else if (data.instance?.state === 'open' || data.state === 'open') {
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado';
            showToast('✅ Já está conectado ao WhatsApp!', 'success');
            hideConnectionAlert();
            loadChats();
            
        } else if (data.error) {
            throw new Error(data.error);
            
        } else {
            // Estado desconhecido - mostra detalhes
            console.warn('Estado de conexão desconhecido:', data);
            statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500"></span> Verificando...';
            showToast('⚠️ Estado de conexão incerto. Verificando...', 'warning');
            checkConnection();
        }
    } catch (e) {
        console.error('Erro ao conectar WhatsApp:', e);
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Erro';
        
        // Mensagens de erro mais amigáveis
        let errorMsg = 'Erro ao conectar WhatsApp';
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            errorMsg = '🔌 Sem conexão com o servidor. Verifique se o servidor está rodando.';
        } else if (e.message.includes('timeout')) {
            errorMsg = '⏱️ Tempo limite excedido. Tente novamente.';
        } else if (e.message.includes('401') || e.message.includes('403')) {
            errorMsg = '🔐 Erro de autenticação com a API Evolution.';
        } else if (e.message.includes('404')) {
            errorMsg = '❓ Instância não encontrada na API Evolution.';
        } else if (e.message.includes('500')) {
            errorMsg = '💥 Erro interno no servidor. Verifique os logs.';
        } else if (e.message) {
            errorMsg = `❌ ${e.message}`;
        }
        
        showToast(errorMsg, 'error');
        showConnectionAlert(`Falha na conexão: ${e.message || 'Erro desconhecido'}`);
    } finally {
        // Sempre restaurar o botão
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = originalBtnContent;
        }
    }
}

// Função para esconder o alerta de conexão
function hideConnectionAlert() {
    const alertBar = document.getElementById('connectionAlert');
    if (alertBar) {
        alertBar.classList.add('hidden');
    }
}

// Função para mostrar o alerta de conexão
function showConnectionAlert(message) {
    const alertBar = document.getElementById('connectionAlert');
    const alertText = document.getElementById('connectionAlertText');
    if (alertBar) {
        if (alertText) {
            alertText.textContent = message || 'Conexão perdida com WhatsApp. Tentando reconectar...';
        }
        alertBar.classList.remove('hidden');
    }
}

async function loadCRMData(retryCount = 0) {
    try {
        // Tentar carregar do cache localStorage primeiro (render rápido)
        const cachedProducts = localStorage.getItem('crm_products');
        if (cachedProducts && allProducts.length === 0) {
            try {
                const parsed = JSON.parse(cachedProducts);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Normalizar campos do localStorage (name->nome, price->preco)
                    allProducts = parsed.map(p => ({
                        ...p,
                        nome: p.nome || p.name || 'Produto',
                        preco: p.preco || p.price || 0,
                        estoque: p.estoque != null ? p.estoque : (p.stock != null ? p.stock : -1),
                        referencia: p.referencia || p.sku || '',
                        imagem: p.imagem || p.image || null,
                        link_oficial: p.link_oficial || p.link || ''
                    }));
                    console.log(`[CRM] ${allProducts.length} produtos do cache local`);
                }
            } catch(e) { /* cache inválido */ }
        }
        
        // Buscar dados frescos da API (FacilZap + Supabase sync)
        const res = await fetch(`${API_BASE}/facilzap-proxy`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        allClients = data.clients || [];
        allOrders = data.orders || [];
        
        // ★ MERGE: Manter clientes criados localmente (que não vieram da API)
        try {
            const localClients = JSON.parse(localStorage.getItem('crm_all_clients') || '[]');
            if (localClients.length > 0) {
                const apiPhones = new Set(allClients.map(c => c.telefone || c.celular || '').filter(Boolean));
                const uniqueLocals = localClients.filter(lc => {
                    const phone = lc.telefone || lc.celular || '';
                    return phone && !apiPhones.has(phone);
                });
                if (uniqueLocals.length > 0) {
                    allClients = [...allClients, ...uniqueLocals];
                    console.log(`[CRM] Merged ${uniqueLocals.length} clientes locais com ${data.clients?.length || 0} da API`);
                }
            }
        } catch(e) { console.warn('[CRM] Falha ao merge clientes locais:', e); }
        
        // Produtos já vem normalizado do proxy agora
        if (data.products && data.products.length > 0) {
            allProducts = data.products;
            // Salvar no localStorage como backup (mesma key que leitura)
            try { localStorage.setItem('crm_products', JSON.stringify(allProducts)); } catch(e) {}
        }
        
        // Salvar clientes e pedidos no localStorage para uso em outros módulos
        try { localStorage.setItem('crm_clients', JSON.stringify(allClients)); } catch(e) {}
        try { localStorage.setItem('crm_orders', JSON.stringify(allOrders)); } catch(e) {}
        
        console.log(`CRM Carregado: ${allClients.length} clientes, ${allOrders.length} pedidos, ${allProducts.length} produtos (fonte: ${data.source || 'facilzap'}).`);
        
        // Tentar enriquecer com dados do Supabase (mais atualizados)
        try {
            const supaRes = await fetch(`${API_BASE}/supabase-products`);
            const supaData = await supaRes.json();
            if (supaData.products && supaData.products.length > 0 && supaData.source === 'supabase') {
                // Merge: Supabase é fonte primária, FacilZap enriquece com slug/link
                const supaMap = new Map(supaData.products.map(p => [String(p.id), p]));
                allProducts = allProducts.map(p => {
                    const supa = supaMap.get(String(p.id));
                    if (supa) {
                        return { ...p, estoque: supa.estoque, preco: supa.preco || p.preco, is_active: supa.is_active };
                    }
                    return p;
                });
                // Adicionar produtos que existem só no Supabase
                supaData.products.forEach(sp => {
                    if (!allProducts.find(p => String(p.id) === String(sp.id))) {
                        allProducts.push(sp);
                    }
                });
                console.log(`[CRM] Produtos enriquecidos com Supabase (${supaData.count} registros)`);
                try { localStorage.setItem('crm_products', JSON.stringify(allProducts)); } catch(e) {}
            }
        } catch(supaErr) {
            console.warn('[CRM] Enriquecimento Supabase falhou (ok):', supaErr.message);
        }
    } catch (e) {
        console.error('Erro ao carregar CRM:', e);
        // Se falhou mas tem cache, não mostrar erro
        if (allProducts.length > 0) {
            console.log('[CRM] Usando dados do cache após erro de rede');
        }
        // Retry automático (até 2x com delay crescente)
        if (retryCount < 2) {
            const delay = (retryCount + 1) * 5000; // 5s, 10s
            console.log(`[CRM] Retry ${retryCount + 1}/2 em ${delay/1000}s...`);
            setTimeout(() => loadCRMData(retryCount + 1), delay);
        }
    }
}

// ============================================================================
// LISTAGEM DE CHATS
// ============================================================================

// Função de filtro das abas
function filterChats(filter) {
    currentFilter = filter;
    
    // Limpar filtro de tag se mudar de filtro principal
    if (['all', 'unread', 'waiting', 'groups', 'sales'].includes(filter)) {
        currentTagFilter = null;
    }
    
    // Atualizar visual das abas inteligentes
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.classList.remove('bg-emerald-500', 'text-white');
        btn.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
    });
    
    // Mapear filtro para ID do botão
    const filterIdMap = {
        'all': 'filterAll',
        'unread': 'filterUnread',
        'waiting': 'filterWaiting',
        'groups': 'filterGroups',
        'sales': 'filterSales'
    };
    
    const activeTabId = filterIdMap[filter];
    if (activeTabId) {
        const activeTab = document.getElementById(activeTabId);
        if (activeTab) {
            activeTab.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
            activeTab.classList.add('bg-emerald-500', 'text-white');
        }
    }
    
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
    
    // Atualizar contadores
    updateFilterCounts();
    
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
        
        // Aplicar estados de leitura local (preservar o que o usuário já leu)
        applyLocalReadStates(allChats);
        
        renderChatsList(allChats);
        updateFilterCounts(); // Atualizar contadores das abas
        lucide.createIcons();

    } catch (e) {
        listEl.innerHTML = '<p class="text-center text-red-400 text-sm p-4">Erro ao listar chats.</p>';
        console.error(e);
    }
}

// Pagination state
const CHATS_PAGE_SIZE = 20;
let _renderedChatsCount = 0;
let _currentFilteredChats = [];
let _scrollListenerAttached = false;

function renderChatsList(chats) {
    const listEl = document.getElementById('chatsList');
    listEl.innerHTML = '';
    _renderedChatsCount = 0;
    
    if (!Array.isArray(chats) || chats.length === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-400 text-sm p-4">Nenhuma conversa encontrada.</p>';
        return;
    }
    
    // Aplicar filtros
    let filteredChats = chats;
    
    // Filtro de tipo (all, unread, waiting, groups, sales, vacuum, snoozed)
    if (currentFilter === 'chats') {
        filteredChats = filteredChats.filter(c => !c.isGroup);
    } else if (currentFilter === 'unread') {
        // Não Lidos: usar contagem efetiva (respeita leitura local)
        filteredChats = filteredChats.filter(c => getEffectiveUnreadCount(c) > 0);
    } else if (currentFilter === 'waiting') {
        // Aguardando Resposta: última msg do cliente há > 4h
        const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
        filteredChats = filteredChats.filter(c => {
            const lastMsg = c.lastMessage;
            if (!lastMsg) return false;
            const msgTime = (lastMsg.messageTimestamp || 0) * 1000;
            const isFromClient = !lastMsg.key?.fromMe;
            return isFromClient && msgTime < fourHoursAgo;
        });
    } else if (currentFilter === 'groups') {
        filteredChats = filteredChats.filter(c => c.isGroup);
    } else if (currentFilter === 'sales') {
        // Vendas: chats com tag relacionada a venda
        filteredChats = filteredChats.filter(c => {
            const chatId = c.id || c.remoteJid;
            const tags = chatTags[chatId] || [];
            return tags.some(tagId => {
                const tag = allTags.find(t => t.id === tagId);
                return tag && (
                    tag.name.toLowerCase().includes('venda') || 
                    tag.name.toLowerCase().includes('pago') ||
                    tag.name.toLowerCase().includes('cliente') ||
                    tag.name.toLowerCase().includes('comprou')
                );
            });
        });
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
        if (currentFilter === 'unread') msg = 'Nenhuma mensagem não lida. 🎉';
        if (currentFilter === 'waiting') msg = 'Nenhuma conversa aguardando. 🎉';
        if (currentFilter === 'groups') msg = 'Nenhum grupo encontrado.';
        if (currentFilter === 'sales') msg = 'Nenhuma venda identificada.';
        if (currentFilter === 'vacuum') msg = 'Nenhuma conversa no vácuo. Parabéns!';
        if (currentFilter === 'snoozed') msg = 'Nenhuma conversa adiada.';
        if (currentTagFilter) msg = 'Nenhuma conversa com esta etiqueta.';
        listEl.innerHTML = `<p class="text-center text-gray-400 text-sm p-4">${msg}</p>`;
        return;
    }
    
    // Guardar lista filtrada para paginação e renderizar primeira página
    _currentFilteredChats = filteredChats;
    _renderedChatsCount = 0;
    _renderNextPage(listEl);
    
    // Attach infinite scroll listener (apenas uma vez)
    if (!_scrollListenerAttached) {
        _scrollListenerAttached = true;
        listEl.addEventListener('scroll', function() {
            if (_renderedChatsCount >= _currentFilteredChats.length) return;
            // Quando chegar a 200px do fundo, carregar mais
            const { scrollTop, scrollHeight, clientHeight } = listEl;
            if (scrollTop + clientHeight >= scrollHeight - 200) {
                _renderNextPage(listEl);
            }
        });
    }
}

/**
 * Renderizar próxima página de chats (CHATS_PAGE_SIZE por vez)
 */
function _renderNextPage(listEl) {
    if (!listEl) listEl = document.getElementById('chatsList');
    if (!listEl) return;
    
    // Remover sentinel anterior (se existir)
    const oldSentinel = listEl.querySelector('.chat-load-more');
    if (oldSentinel) oldSentinel.remove();
    
    const start = _renderedChatsCount;
    const end = Math.min(start + CHATS_PAGE_SIZE, _currentFilteredChats.length);
    
    if (start >= _currentFilteredChats.length) return;
    
    const fragment = document.createDocumentFragment();
    
    for (let i = start; i < end; i++) {
        const chat = _currentFilteredChats[i];
        const chatId = chat.id || chat.remoteJid;
        
        // DEBUG: Ver dados do chat
        if (chat.pushName === '275015463346288' || (chat.name && chat.name.includes('275015463346288'))) {
            console.log('=== CHAT COM PROBLEMA ===');
            console.log('chat.id:', chat.id);
            console.log('chat.remoteJid:', chat.remoteJid);
            console.log('chat.name:', chat.name);
            console.log('chat.pushName:', chat.pushName);
            console.log('chat completo:', chat);
        }
        
        // Usar função getContactDisplayName para nome consistente
        const name = getContactDisplayName(chat);
        
        const isGroup = chat.isGroup || chatId?.includes('@g.us');
        const isCommunity = chat.isCommunity;
        
        // Última mensagem - limitar tamanho e remover formatação
        let lastMsgText = '';
        const lastMsgObj = chat.lastMessage?.message;
        
        if (lastMsgObj?.conversation) {
            lastMsgText = lastMsgObj.conversation;
        } else if (lastMsgObj?.extendedTextMessage?.text) {
            lastMsgText = lastMsgObj.extendedTextMessage.text;
        } else if (lastMsgObj?.imageMessage) {
            lastMsgText = '📷 Imagem';
        } else if (lastMsgObj?.audioMessage) {
            lastMsgText = '🎵 Áudio';
        } else if (lastMsgObj?.videoMessage) {
            lastMsgText = '🎬 Vídeo';
        } else if (lastMsgObj?.documentMessage) {
            lastMsgText = '📄 Documento';
        } else if (lastMsgObj?.stickerMessage) {
            lastMsgText = '✨ Figurinha';
        } else if (lastMsgObj?.contactMessage) {
            lastMsgText = '👤 Contato';
        } else if (lastMsgObj?.locationMessage) {
            lastMsgText = '📍 Localização';
        }
        
        // Remover formatação (*negrito*, etc) e limitar caracteres
        const cleanLastMsg = lastMsgText.replace(/[\*_~]/g, '').substring(0, 50);
        const lastMsg = cleanLastMsg.length < lastMsgText.length ? cleanLastMsg + '...' : cleanLastMsg;
        
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
        const effectiveUnread = getEffectiveUnreadCount(chat);
        const hasUnread = effectiveUnread > 0;
        div.className = `flex items-center gap-3 p-3 border-b hover:bg-slate-50 cursor-pointer transition-colors ${hasUnread ? 'bg-emerald-50/50 border-l-3 border-l-emerald-500' : ''}`;
        
        // CRÍTICO: Garantir que remoteJid e id estejam sempre definidos
        if (!chat.remoteJid) {
            chat.remoteJid = chatId;
        }
        chat.id = chatId;
        
        // DEBUG: Adicionar data attribute para identificar
        div.setAttribute('data-chat-id', chatId);
        div.setAttribute('data-debug', 'chat-item');
        
        div.onclick = function(event) {
            console.log('\n========== DEBUG CLICK ==========');
            console.log('🖱️ CLIQUE DETECTADO!');
            console.log('Event:', event);
            console.log('Event target:', event.target);
            console.log('Chat ID:', chatId);
            console.log('Chat remoteJid:', chat.remoteJid);
            console.log('Chat name:', chat.name || chat.pushName);
            console.log('Chat object:', chat);
            console.log('=================================\n');
            
            try {
                openChat(chat);
            } catch (err) {
                console.error('❌ ERRO ao chamar openChat:', err);
            }
        };
        
        // Indicador de mensagem não lida com bolinha verde
        const unreadBadge = hasUnread
            ? `<div class="flex flex-col items-center gap-1">
                 <span class="unread-badge bg-emerald-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">${effectiveUnread}</span>
               </div>` 
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
        
        // Nome com negrito se não lido
        const nameClass = hasUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700';
        const lastMsgClass = hasUnread ? 'text-slate-600 font-medium' : 'text-slate-500';
        
        div.innerHTML = `
            ${avatarHtml}
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-baseline mb-1">
                    <h4 class="${nameClass} truncate text-sm flex items-center gap-1">
                        ${name}
                        ${isCommunity ? '<span class="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-normal">Comunidade</span>' : ''}
                        ${tagsHtml ? `<span class="flex gap-0.5 ml-1">${tagsHtml}</span>` : ''}
                    </h4>
                    <span class="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0 ml-2">${snoozeIcon}${time}</span>
                </div>
                <div class="flex justify-between items-center gap-2">
                    <p class="text-xs ${lastMsgClass} truncate flex-1">${lastMsg}</p>
                    ${unreadBadge}
                </div>
            </div>
        `;
        fragment.appendChild(div);
    }
    
    listEl.appendChild(fragment);
    _renderedChatsCount = end;
    
    // Se houver mais chats, mostrar indicador
    if (end < _currentFilteredChats.length) {
        const sentinel = document.createElement('div');
        sentinel.className = 'chat-load-more text-center py-3 text-xs text-slate-400';
        sentinel.innerHTML = `<span class="animate-pulse">Rolando... (+${_currentFilteredChats.length - end} conversas)</span>`;
        listEl.appendChild(sentinel);
    }
    
    console.log(`[Pagination] Renderizados ${_renderedChatsCount}/${_currentFilteredChats.length} chats`);
}

// ============================================================================
// CHAT ATIVO
// ============================================================================
async function openChat(chat) {
    console.log('\n🚀🚀🚀 FUNÇÃO openChat CHAMADA! 🚀🚀🚀');
    console.log('Argumento recebido:', chat);
    console.log('Tipo:', typeof chat);
    
    if (!chat || !chat.id) {
        console.error('[ERRO] Chat inválido:', chat);
        console.error('chat:', chat);
        console.error('chat?.id:', chat?.id);
        return;
    }
    
    console.log('\n==================================');
    console.log('🔄 ABRINDO NOVO CHAT');
    console.log('==================================');
    console.log('ID:', chat.id);
    console.log('RemoteJid:', chat.remoteJid);
    console.log('Nome:', chat.name || chat.pushName);
    
    // ====== PASSO 1: RESET ABSOLUTO DO STATE ======
    // CRÍTICO: Zerar TUDO para garantir isolamento
    currentChatId = chat.id;
    currentChatData = chat;
    currentClient = null;
    
    // ★ Limpar painel CRM imediatamente para evitar dados stale
    const _crmPanel = document.getElementById('crmDataContainer');
    if (_crmPanel) _crmPanel.innerHTML = '<div class="flex items-center justify-center p-8 text-slate-400"><div class="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full mr-2"></div>Carregando dados...</div>';
    
    // ====== MARCAR COMO LIDO ======
    const chatIdForRead = chat.id || chat.remoteJid;
    markChatAsRead(chatIdForRead);
    
    // Extrair e normalizar o remoteJid para este chat
    const remoteJidParam = chat.remoteJid || chat.id;
    currentRemoteJid = remoteJidParam; // GUARDAR para validação depois
    
    // @lid JIDs contêm IDs internos do Meta, NÃO telefones reais
    const isLid = remoteJidParam && remoteJidParam.includes('@lid');
    const cleanPhone = isLid 
        ? (chat.phone ? cleanPhoneNumber(chat.phone) : '')  // usar phone real do servidor
        : extractPhoneFromJid(remoteJidParam);
    
    console.log('Telefone extraído:', cleanPhone, isLid ? '(@lid - de remoteJidAlt)' : '');
    console.log('RemoteJid para validação:', currentRemoteJid);
    
    // ====== PASSO 2: MOSTRAR LOADING IMEDIATAMENTE ======
    // Limpar COMPLETAMENTE o container
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('[ERRO] Container de mensagens não encontrado!');
        return;
    }
    
    messagesContainer.innerHTML = '';
    messagesContainer.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>Carregando conversa...</p></div>';
    
    // ====== PASSO 3: ATUALIZAR HEADER ======
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');
    
    const isGroup = chat.isGroup || remoteJidParam.includes('@g.us');
    const isCommunity = chat.isCommunity;
    
    // Nome do chat
    const name = getContactDisplayName(chat);
    document.getElementById('headerName').innerText = name;
    console.log('Nome do header:', name);
    
    // Número ou info do grupo
    const headerNumber = document.getElementById('headerNumber');
    const headerWhatsAppLink = document.getElementById('headerWhatsAppLink');
    
    if (isGroup) {
        const participantsText = chat.participantsCount ? `${chat.participantsCount} participantes` : 'Grupo';
        headerNumber.innerText = isCommunity ? `Comunidade • ${participantsText}` : participantsText;
        if (headerWhatsAppLink) headerWhatsAppLink.classList.add('hidden');
        console.log('Chat é grupo:', participantsText);
    } else {
        const formattedPhone = cleanPhone ? formatPhone(cleanPhone) : (isLid ? 'Lead (Anúncio)' : 'Número desconhecido');
        headerNumber.innerText = formattedPhone;
        console.log('Telefone formatado no header:', formattedPhone);
        
        if (headerWhatsAppLink && cleanPhone) {
            // Envio interno via Evolution API (sem abrir wa.me externo)
            const waPhone = cleanPhone.startsWith('55') && cleanPhone.length >= 12 ? cleanPhone : `55${cleanPhone}`;
            headerWhatsAppLink.onclick = async () => {
                const text = 'Olá! Tudo bem? 😊';
                headerWhatsAppLink.disabled = true;
                headerWhatsAppLink.classList.add('opacity-50');
                try {
                    const res = await fetch(`${API_BASE}/whatsapp/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: waPhone, text, source: 'central-atendimento' })
                    });
                    const data = await res.json();
                    if (res.ok && !data.error) {
                        showToast('✅ Mensagem enviada!', 'success');
                    } else {
                        showToast('❌ Falha ao enviar: ' + (data.error || 'desconhecido'), 'error');
                    }
                } catch (err) {
                    console.error('[WhatsApp] Erro de rede:', err);
                    showToast('❌ Erro de conexão', 'error');
                } finally {
                    headerWhatsAppLink.disabled = false;
                    headerWhatsAppLink.classList.remove('opacity-50');
                }
            };
            headerWhatsAppLink.classList.remove('hidden');
        }
    }
    
    // ====== PASSO 4: AVATAR/FOTO ESPECÍFICA DO CHAT ======
    // IMPORTANTE: Forçar a foto DESTE chat, não da anterior
    const headerAvatar = document.getElementById('headerAvatar');
    const headerInitials = document.getElementById('headerInitials');
    
    if (isGroup) {
        // Avatar de grupo
        if (chat.profilePicUrl) {
            console.log('Foto de grupo:', chat.profilePicUrl);
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
            console.log('Foto do contato:', chat.profilePicUrl);
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
    
    // Renderizar tags
    renderChatTags();
    
    // ====== PASSO 5: CARREGAR MENSAGENS APENAS DESTE CHAT ======
    console.log('📨 Carregando mensagens para:', remoteJidParam);
    await loadMessages(remoteJidParam);
    
    // ====== PASSO 6: CARREGAR DADOS DO CRM OU GRUPO ======
    if (!isGroup) {
        console.log('🔍 Buscando dados do CRM');
        findAndRenderClientCRM(remoteJidParam);
    } else {
        renderGroupInfo(chat);
    }
    
    console.log('✅ Chat aberto com sucesso');
    console.log('==================================\n');
    
    // ======== REAL-TIME: Inscrever no chat via Socket.io ========
    if (socket && socket.connected) {
        // Sair do chat anterior
        if (_previousChatJid && _previousChatJid !== remoteJidParam) {
            socket.emit('leave-chat', _previousChatJid);
        }
        socket.emit('join-chat', remoteJidParam);
    }
    _previousChatJid = remoteJidParam;
    
    // Fallback: polling APENAS quando Socket.IO está desconectado (intervalo 30s)
    // Com socket conectado, confiamos 100% no push real-time (new-message event)
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => {
        if (!currentRemoteJid) return;
        if (!socket || !socket.connected) {
            // Socket desconectado: polling fallback a cada 30s
            loadMessages(currentRemoteJid, true);
        }
        // Socket conectado: NÃO fazer polling — appendRealtimeMessage() já cuida
    }, 30000);
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
    if (!remoteJid) {
        console.error('[loadMessages] RemoteJid inválido:', remoteJid);
        return;
    }
    
    // VALIDAÇÃO: Garantir que esse carregamento é para o chat atual
    if (currentRemoteJid !== remoteJid) {
        currentRemoteJid = remoteJid;
    }
    
    // ======== CACHE DE MENSAGENS (Memória → IDB → API) ========
    if (!isUpdate && window.chatLoader) {
        // 1. Tentar memory cache (sync, ~0ms)
        const memCached = window.chatLoader.getCachedMessages(remoteJid);
        if (memCached && memCached.length > 0) {
            console.log(`[⚡ MemCache] ${memCached.length} mensagens para ${remoteJid}`);
            renderMessagesFromData(remoteJid, memCached, false);
            // Revalidar em background
            fetchAndRenderMessages(remoteJid, true);
            return;
        }
        
        // 2. Tentar IndexedDB (async, ~5-20ms)
        const idbCached = await window.chatLoader.getCachedMessagesAsync(remoteJid);
        if (idbCached && idbCached.length > 0) {
            console.log(`[⚡ IDB] ${idbCached.length} mensagens do IndexedDB para ${remoteJid}`);
            renderMessagesFromData(remoteJid, idbCached, false);
            // Revalidar em background
            fetchAndRenderMessages(remoteJid, true);
            return;
        }
    }
    
    // 3. Sem cache — fetch da API com loading indicator
    await fetchAndRenderMessages(remoteJid, isUpdate);
}

// Lock para evitar fetches concorrentes do mesmo remoteJid
let _fetchingMessages = null;

/**
 * Buscar mensagens da API e renderizar
 */
async function fetchAndRenderMessages(remoteJid, isUpdate = false) {
    // Debounce: se já tem fetch em andamento para este remoteJid, pular
    if (_fetchingMessages === remoteJid && isUpdate) {
        return;
    }
    _fetchingMessages = remoteJid;
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/messages/fetch`, {
            method: 'POST',
            body: JSON.stringify({ remoteJid }),
            headers: {'Content-Type': 'application/json'}
        });
        
        if (!res.ok) {
            console.error('[loadMessages] HTTP error:', res.status);
            return;
        }
        
        const data = await res.json();
        
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
        
        // ====== VALIDAÇÃO CRÍTICA: FILTRAR MENSAGENS POR REMOTEJID ======
        // Isso garante que NÃO haja mistura de conversas
        const beforeFilterCount = messages.length;
        
        // Extrair número do remoteJid solicitado para comparação
        const requestPhoneNormalized = extractPhoneFromJid(remoteJid);
        const isGroupRequest = String(remoteJid).includes('@g.us');
        const isLidRequest = String(remoteJid).includes('@lid');
        
        // Para @lid com telefone embutido, usar o telefone para cross-match
        const lidPhoneNormalized = isLidRequest ? requestPhoneNormalized : '';
        
        messages = messages.filter(msg => {
            const msgRemoteJid = msg.key?.remoteJid || msg.remoteJid || '';
            
            // Match exato de JID (funciona para @lid, @s.whatsapp.net, @g.us)
            if (msgRemoteJid === remoteJid) return true;
            
            // Se for grupo, comparar sem sufixo
            if (isGroupRequest) {
                return msgRemoteJid.replace(/@g\.us$/, '') === remoteJid.replace(/@g\.us$/, '');
            }
            
            // Cross-match @lid ↔ @s.whatsapp.net pelo telefone normalizado
            // Quando o chat é @lid mas as mensagens vêm como @s.whatsapp.net (ou vice-versa)
            const msgPhoneNormalized = extractPhoneFromJid(msgRemoteJid);
            
            // Se é um @lid request: aceitar se o telefone extraído do @lid bater com a msg
            if (isLidRequest) {
                if (!lidPhoneNormalized) return false; // @lid sem telefone embutido — só match exato
                if (!msgPhoneNormalized) return false;
                return lidPhoneNormalized === msgPhoneNormalized ||
                       (lidPhoneNormalized.length >= 9 && msgPhoneNormalized.length >= 9 &&
                        lidPhoneNormalized.slice(-9) === msgPhoneNormalized.slice(-9));
            }
            
            // Se a msg é @lid, tentar extrair telefone dela para comparar com o request
            if (msgRemoteJid.includes('@lid')) {
                if (!msgPhoneNormalized || !requestPhoneNormalized) return false;
                return msgPhoneNormalized === requestPhoneNormalized ||
                       (msgPhoneNormalized.length >= 9 && requestPhoneNormalized.length >= 9 &&
                        msgPhoneNormalized.slice(-9) === requestPhoneNormalized.slice(-9));
            }
            
            // Para contatos @s.whatsapp.net, usar normalização de telefone
            const matches = msgPhoneNormalized === requestPhoneNormalized ||
                           (msgPhoneNormalized.length >= 9 && requestPhoneNormalized.length >= 9 &&
                            msgPhoneNormalized.slice(-9) === requestPhoneNormalized.slice(-9));
            
            return matches;
        });
        
        const rejectedCount = beforeFilterCount - messages.length;
        if (rejectedCount > 0) {
            console.log(`🔍 Filtrado: ${beforeFilterCount} → ${messages.length} mensagens válidas (${rejectedCount} de outros chats)`);
        }
        
        // Salvar no cache de mensagens
        if (window.chatLoader && messages.length > 0) {
            window.chatLoader.setCachedMessages(remoteJid, messages);
        }
        
        // Renderizar usando função compartilhada
        renderMessagesFromData(remoteJid, messages, isUpdate);
        
    } catch (e) {
        console.error('❌ Erro ao carregar mensagens:', e);
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.innerHTML = '<div class="text-center p-4 text-red-500">Erro ao carregar mensagens</div>';
        }
    } finally {
        _fetchingMessages = null;
    }
}

/**
 * Construir elemento DOM de uma mensagem individual (reutilizado por full render e incremental)
 */
function buildMessageBubble(msg) {
    const isMe = msg.key?.fromMe;
    let content = '';
    const m = msg.message;
    const msgId = msg.key?.id || `ts_${msg.messageTimestamp}`;

    if (m?.conversation) {
        content = formatWhatsAppText(m.conversation);
    } else if (m?.extendedTextMessage?.text) {
        content = formatWhatsAppText(m.extendedTextMessage.text);
    } else if (m?.imageMessage) {
        const caption = m.imageMessage.caption || '';
        const captionHtml = caption ? '<p class="mt-1 text-sm">' + formatWhatsAppText(caption) + '</p>' : '';
        const imgUrl = m.imageMessage.viewableUrl || m.imageMessage.url || '';
        if (imgUrl) {
            content = `<div class="image-message-container">
                <img src="${imgUrl}" alt="Imagem" class="rounded-lg max-w-full max-h-[300px] cursor-pointer object-cover" 
                     onclick="window.open('${imgUrl}', '_blank')" 
                     onerror="this.outerHTML='<div class=\\'flex items-center gap-2\\'><span class=\\'text-lg\\'>📷</span> <span>Imagem (indisponível)</span></div>'" 
                     loading="lazy" />
                ${captionHtml}
            </div>`;
        } else {
            content = `<div class="flex items-center gap-2"><span class="text-lg">📷</span> <span>Imagem${caption ? '<br>' + formatWhatsAppText(caption) : ''}</span></div>`;
        }
    } else if (m?.videoMessage) {
        const caption = m.videoMessage.caption || '';
        const captionHtml = caption ? '<br>' + formatWhatsAppText(caption) : '';
        content = `<div class="flex items-center gap-2"><span class="text-lg">🎬</span> <span>Vídeo${captionHtml}</span></div>`;
    } else if (m?.audioMessage) {
        const audioUrl = m.audioMessage.playableUrl || m.audioMessage.url || '';
        const duration = m.audioMessage.seconds || 0;
        const audioId = `audio-${msgId}`;
        if (audioUrl) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            content = `
                <div class="audio-player-whatsapp flex items-center gap-2 p-2 rounded-lg bg-white/50 min-w-[200px]" data-audio-id="${audioId}">
                    <button onclick="toggleAudioPlay('${audioId}', '${audioUrl}')" class="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition shadow-sm">
                        <i data-lucide="play" class="w-4 h-4 play-icon"></i>
                        <i data-lucide="pause" class="w-4 h-4 pause-icon hidden"></i>
                    </button>
                    <div class="flex-1 flex flex-col gap-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden cursor-pointer audio-progress-bar" onclick="seekAudio(event, '${audioId}')">
                                <div class="h-full bg-emerald-500 audio-progress" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-slate-500">
                            <span class="audio-time">0:00</span>
                            <span>/</span>
                            <span>${timeStr}</span>
                            <button onclick="changePlaybackSpeed('${audioId}')" class="ml-auto text-[10px] font-medium text-emerald-600 hover:text-emerald-700 audio-speed">1x</button>
                        </div>
                    </div>
                    <audio class="hidden" id="${audioId}" preload="metadata">
                        <source src="${audioUrl}" type="audio/ogg; codecs=opus">
                        <source src="${audioUrl}" type="audio/mpeg">
                        <source src="${audioUrl}" type="audio/mp4">
                    </audio>
                </div>
            `;
        } else {
            content = `<div class="flex items-center gap-2"><span class="text-lg">🎵</span> <span>Áudio (${duration}s)</span></div>`;
        }
    } else if (m?.documentMessage) {
        const fileName = m.documentMessage.fileName || 'Documento';
        const docUrl = m.documentMessage.downloadUrl || m.documentMessage.url || '';
        if (docUrl) {
            content = `<div class="flex items-center gap-2 cursor-pointer hover:opacity-80" onclick="CRM_MediaViewer.download('${docUrl}', '${fileName}')">
                <span class="text-lg">📄</span>
                <span class="underline text-blue-600">${fileName}</span>
                <span class="text-xs text-slate-400">⬇</span>
            </div>`;
        } else {
            content = `<div class="flex items-center gap-2"><span class="text-lg">📄</span> <span>${fileName}</span></div>`;
        }
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

    const div = document.createElement('div');
    div.className = `p-3 max-w-[70%] text-sm shadow-sm rounded-lg ${isMe ? 'msg-out' : 'msg-in'}`;
    div.innerHTML = content;

    const wrap = document.createElement('div');
    wrap.className = `w-full flex mb-2 ${isMe ? 'justify-end' : 'justify-start'}`;
    wrap.setAttribute('data-msg-id', msgId);
    wrap.appendChild(div);
    return wrap;
}

/**
 * Renderizar mensagens a partir de um array de dados (usado por cache e fetch)
 * Quando isUpdate=true e já existem msgs no DOM, faz APPEND incremental
 * em vez de destruir e recriar tudo (evita flicker, perda de scroll & áudio).
 */
function renderMessagesFromData(remoteJid, messages, isUpdate) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        if (!isUpdate) {
            container.innerHTML = '<div class="text-center p-4 text-gray-500">Nenhuma mensagem nesta conversa.</div>';
        }
        return;
    }
    
    // Hash para detectar se algo mudou
    const newHash = messages.map(m => m.key?.id || m.messageTimestamp).join(',');
    if (isUpdate && window._lastMsgHash === newHash) return; // Nada mudou

    // Ordenar por timestamp
    const sortedMsgs = messages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    // ── INCREMENTAL UPDATE: se isUpdate e já tem msgs no DOM, apenas append novas ──
    if (isUpdate && container.children.length > 0 && container.querySelector('[data-msg-id]')) {
        const existingIds = new Set();
        container.querySelectorAll('[data-msg-id]').forEach(el => existingIds.add(el.getAttribute('data-msg-id')));
        
        let appended = 0;
        sortedMsgs.forEach(msg => {
            const msgId = msg.key?.id || `ts_${msg.messageTimestamp}`;
            if (existingIds.has(msgId)) return; // Já no DOM
            const bubble = buildMessageBubble(msg);
            if (bubble) {
                container.appendChild(bubble);
                appended++;
            }
        });
        
        if (appended > 0) {
            container.scrollTop = container.scrollHeight;
        }
        window._lastMsgHash = newHash;
        return;
    }

    // ── FULL RENDER: primeira carga ou troca de chat ──
    window._lastMsgHash = newHash;
    
    // Pausar áudios e limpar
    if (typeof pauseAllAudios === 'function') pauseAllAudios();
    container.innerHTML = '';
    
    sortedMsgs.forEach((msg) => {
        const bubble = buildMessageBubble(msg);
        if (bubble) container.appendChild(bubble);
    });
    
    container.scrollTop = container.scrollHeight;
    
    // Re-criar ícones lucide nos players de áudio
    if (window.lucide) window.lucide.createIcons();
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
    
    // Usar remoteJid correto (não o ID)
    const remoteJid = currentChatData?.remoteJid || currentChatId;
    
    // UI otimista
    input.value = '';
    const container = document.getElementById('messagesContainer');
    const wrap = document.createElement('div');
    wrap.className = 'w-full flex justify-end opacity-50'; // Opacity indica enviando
    wrap.innerHTML = `<div class="p-3 max-w-[70%] text-sm shadow-sm msg-out"><p>${text}</p></div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    try {
        const response = await fetch(`${API_BASE}/whatsapp/send-message`, {
            method: 'POST',
            body: JSON.stringify({ number: remoteJid, text: text }),
            headers: {'Content-Type': 'application/json'}
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('Erro ao enviar:', data);
            alert('Erro ao enviar: ' + (data.error || 'Desconhecido'));
            wrap.remove();
            return;
        }
        
        // Atualiza chat real após delay pequeno
        setTimeout(() => loadMessages(remoteJid), 1000);
    } catch (e) {
        console.error('Erro:', e);
        alert('Erro ao enviar: ' + e.message);
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
    
    // Usar remoteJid correto
    const remoteJid = currentChatData?.remoteJid || currentChatId;
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
                number: remoteJid,
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
        setTimeout(() => loadMessages(remoteJid), 1000);
        
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
// LÓGICA CRM (LADO DIREITO) - VERSÃO MELHORADA
// ============================================================================

// clientNotes já foi declarada no início do arquivo (linha ~81)

// Função para abrir sidebar ao clicar no header
function openClientSidebar() {
    // Apenas garantir que a sidebar está visível e dar foco
    const sidebar = document.getElementById('crmDataContainer');
    if (sidebar) {
        sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Adicionar um pequeno destaque visual
        sidebar.style.transition = 'background-color 0.3s';
        sidebar.style.backgroundColor = '#f1f5f9';
        setTimeout(() => {
            sidebar.style.backgroundColor = '';
        }, 500);
    }
}

function findAndRenderClientCRM(chatId) {
    // chatId vem como "5594984121802@s.whatsapp.net" ou "556282237075@s.whatsapp.net" ou "5162684936293@lid"
    const panel = document.getElementById('crmDataContainer');
    
    // ====== @lid: Resolver telefone real antes de buscar no CRM ======
    const isLidJid = chatId && chatId.includes('@lid');
    if (isLidJid) {
        // Verificar se já temos o telefone real do chat (enviado pelo servidor)
        const knownPhone = currentChatData?.phone;
        if (knownPhone) {
            console.log(`[CRM Brain] @lid resolvido via chat.phone: ${knownPhone}`);
            return _findAndRenderClientCRM_withPhone(chatId, knownPhone, panel);
        }
        
        // Verificar cache local de resoluções @lid
        const cachedPhone = _lidPhoneCache[chatId];
        if (cachedPhone) {
            console.log(`[CRM Brain] @lid resolvido via cache local: ${cachedPhone}`);
            return _findAndRenderClientCRM_withPhone(chatId, cachedPhone, panel);
        }
        
        // Chamar endpoint de resolução
        panel.innerHTML = `
            <div class="flex items-center justify-center py-8 text-slate-400">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500 mr-2"></div>
                <span class="text-sm">Resolvendo lead (anúncio)...</span>
            </div>
        `;
        
        fetch(`${API_BASE}/whatsapp/resolve-lid/${encodeURIComponent(chatId)}`)
            .then(r => r.json())
            .then(result => {
                // Verificar se ainda estamos no mesmo chat
                if (currentRemoteJid !== chatId) return;
                
                if (result.resolved && result.phone) {
                    console.log(`[CRM Brain] @lid resolvido via API: ${chatId} → ${result.phone}`);
                    _lidPhoneCache[chatId] = result.phone;
                    
                    // Atualizar header com telefone real
                    const headerNumber = document.getElementById('headerNumber');
                    if (headerNumber) headerNumber.innerText = formatPhone(result.phone);
                    
                    _findAndRenderClientCRM_withPhone(chatId, result.phone, panel);
                } else {
                    console.warn(`[CRM Brain] @lid não resolvido: ${chatId}`);
                    panel.innerHTML = `
                        <div class="p-4 text-center text-slate-400 text-sm">
                            <i class="fas fa-ad text-2xl mb-2 text-blue-400"></i>
                            <p class="font-medium text-slate-500">Lead de Anúncio</p>
                            <p class="mt-1">Telefone real não disponível ainda.</p>
                            <p class="mt-1 text-xs">O número será resolvido quando o lead enviar uma nova mensagem.</p>
                        </div>
                    `;
                }
            })
            .catch(err => {
                console.error('[CRM Brain] Erro ao resolver @lid:', err);
                if (currentRemoteJid !== chatId) return;
                panel.innerHTML = `
                    <div class="p-4 text-center text-red-400 text-sm">
                        <i class="fas fa-exclamation-triangle text-xl mb-2"></i>
                        <p>Erro ao resolver lead de anúncio</p>
                    </div>
                `;
            });
        return;
    }
    
    // ====== Fluxo normal (não @lid) ======
    // Usar normalizePhone centralizado (lib-data-layer.js)
    const whatsappPhone = chatId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const normalizedPhone = (typeof normalizePhone === 'function') ? normalizePhone(chatId) : whatsappPhone;
    
    console.log(`[CRM Brain] Buscando: raw="${chatId}" → whatsapp="${whatsappPhone}" → normalized="${normalizedPhone}"`);
    
    // Nome do perfil WhatsApp (pushname)
    const whatsappName = currentChatData?.pushName || currentChatData?.name || 'Contato';

    // ====== SWR: Stale-While-Revalidate via CRMCache ======
    const cache = (typeof CRMCache !== 'undefined') ? CRMCache.get(chatId) : { data: null, status: 'miss' };
    
    if (cache.data && cache.status !== 'miss') {
        // ✅ Cache HIT — renderizar IMEDIATAMENTE sem spinner
        console.log(`[CRM Brain] ⚡ Cache ${cache.status}: renderizando instantâneo`);
        _renderBrainData(cache.data, whatsappPhone, normalizedPhone, whatsappName);
        
        if (cache.status === 'fresh') {
            // Dados frescos (< 30min) — não precisa revalidar
            console.log('[CRM Brain] 🟢 Dados frescos, sem revalidação');
            return;
        }
        
        // Dados stale — revalidar em background (silencioso)
        if (typeof CRMCache !== 'undefined' && CRMCache.isRevalidating(chatId)) {
            console.log('[CRM Brain] 🔄 Revalidação já em andamento, pulando');
            return;
        }
        
        console.log('[CRM Brain] 🔄 Dados stale, revalidando em background...');
        _revalidateInBackground(chatId, whatsappPhone, normalizedPhone, whatsappName, cache.data);
        return;
    }
    
    // ❌ Cache MISS — comportamento original com spinner
    console.log('[CRM Brain] 📡 Cache miss, buscando no servidor...');
    panel.innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
    `;
    
    _fetchAndRenderBrain(chatId, whatsappPhone, normalizedPhone, whatsappName);
}

/** Helper: Após resolver @lid, executar fluxo CRM Brain com o telefone real */
function _findAndRenderClientCRM_withPhone(chatId, realPhone, panel) {
    const whatsappPhone = realPhone.replace(/\D/g, '');
    const normalizedPhone = (typeof normalizePhone === 'function') ? normalizePhone(realPhone) : whatsappPhone;
    const whatsappName = currentChatData?.pushName || currentChatData?.name || 'Lead (Anúncio)';
    
    console.log(`[CRM Brain] @lid → telefone real: "${whatsappPhone}" normalized: "${normalizedPhone}"`);
    
    // Usar SWR normalmente com o telefone real como chave
    const cacheKey = `lid:${chatId}:${whatsappPhone}`;
    const cache = (typeof CRMCache !== 'undefined') ? CRMCache.get(cacheKey) : { data: null, status: 'miss' };
    
    if (cache.data && cache.status !== 'miss') {
        console.log(`[CRM Brain] ⚡ @lid Cache ${cache.status}: renderizando`);
        _renderBrainData(cache.data, whatsappPhone, normalizedPhone, whatsappName);
        if (cache.status === 'stale') {
            _revalidateInBackground(cacheKey, whatsappPhone, normalizedPhone, whatsappName, cache.data);
        }
        return;
    }
    
    // Cache miss — buscar no servidor
    panel.innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
    `;
    _fetchAndRenderBrain(cacheKey, whatsappPhone, normalizedPhone, whatsappName);
}

/** Buscar no servidor e renderizar (usado tanto no miss quanto como fallback) */
function _fetchAndRenderBrain(chatId, whatsappPhone, normalizedPhone, whatsappName) {
    const _requestChatId = currentRemoteJid; // captura no momento do disparo
    fetch(`${API_BASE}/client-brain/${whatsappPhone}`)
        .then(res => res.json())
        .then(data => {
            console.log('[CRM Brain] Resposta:', data.found ? `✅ ${data.client?.name}` : '❌ Lead Novo');
            
            // Salvar no cache (tanto encontrado quanto lead novo)
            if (typeof CRMCache !== 'undefined') {
                CRMCache.set(chatId, data);
            }
            
            // ★ GUARD: Só renderizar se o usuário ainda está no mesmo chat
            if (currentRemoteJid !== _requestChatId) {
                console.log('[CRM Brain] ⏩ Chat mudou, descartando renderização de', chatId);
                return;
            }
            _renderBrainData(data, whatsappPhone, normalizedPhone, whatsappName);
        })
        .catch(err => {
            console.error('[CRM Brain] Erro:', err);
            if (currentRemoteJid !== _requestChatId) return;
            fallbackLocalClientSearch(chatId, whatsappPhone, normalizedPhone, whatsappName);
        });
}

/** Renderizar brainData no painel (reutiliza lógica existente) */
function _renderBrainData(data, whatsappPhone, normalizedPhone, whatsappName) {
    // ★ GUARD: Verificar se o telefone ainda corresponde ao chat ativo
    // Para @lid, não comparar dígitos (são IDs internos, não telefones)
    const isLidActive = currentRemoteJid && currentRemoteJid.includes('@lid');
    if (!isLidActive) {
        const activePhone = currentRemoteJid ? currentRemoteJid.replace('@s.whatsapp.net','').replace(/\D/g,'') : '';
        if (activePhone && whatsappPhone && !activePhone.includes(whatsappPhone.slice(-9)) && !whatsappPhone.includes(activePhone.slice(-9))) {
            console.warn('[CRM Brain] ⚠️ Telefone diverge do chat ativo, abortando render', { whatsappPhone, activePhone });
            return;
        }
    }
    if (!data.found) {
        const localResult = tryLocalClientMatch(normalizedPhone);
        if (localResult) {
            console.log('[CRM Brain] Fallback local encontrou:', localResult.nome || localResult.name);
            currentClient = localResult;
            renderLocalClientPanel(localResult, whatsappPhone);
        } else {
            renderNewLeadPanelBrain(whatsappPhone, whatsappName, data);
        }
    } else {
        currentClient = data.client;
        if (data.client?.name) {
            const headerName = document.getElementById('headerName');
            if (headerName) headerName.innerText = data.client.name;
        }
        renderClientPanelBrain(data, whatsappPhone);
    }
}

/** Revalidar em background — busca silenciosa, atualiza painel só se dados mudaram */
function _revalidateInBackground(chatId, whatsappPhone, normalizedPhone, whatsappName, oldData) {
    if (typeof CRMCache !== 'undefined') {
        CRMCache.setRevalidating(chatId, true);
    }
    
    fetch(`${API_BASE}/client-brain/${whatsappPhone}`)
        .then(res => res.json())
        .then(newData => {
            // Salvar no cache independente de mudança
            if (typeof CRMCache !== 'undefined') {
                CRMCache.set(chatId, newData);
                CRMCache.setRevalidating(chatId, false);
            }
            
            // Só re-renderizar se dados realmente mudaram
            const changed = (typeof CRMCache !== 'undefined') ? CRMCache.hasChanged(oldData, newData) : true;
            if (changed) {
                console.log('[CRM Brain] 🔄 Dados atualizados — re-renderizando painel');
                // Só atualizar se ainda estamos no mesmo chat
                if (currentRemoteJid === chatId || currentRemoteJid === whatsappPhone + '@s.whatsapp.net') {
                    _renderBrainData(newData, whatsappPhone, normalizedPhone, whatsappName);
                }
            } else {
                console.log('[CRM Brain] ✅ Dados iguais — sem atualização visual');
            }
        })
        .catch(err => {
            console.warn('[CRM Brain] Revalidação falhou (mantendo cache):', err.message);
            if (typeof CRMCache !== 'undefined') {
                CRMCache.setRevalidating(chatId, false);
            }
        });
}

// Busca local rápida em allClients (dados já carregados via facilzap-proxy)
function tryLocalClientMatch(normalizedPhone) {
    if (!allClients || allClients.length === 0) return null;
    const last9 = normalizedPhone.slice(-9);
    
    return allClients.find(c => {
        const phones = [c.telefone, c.celular, c.phone, c.whatsapp]
            .filter(Boolean)
            .map(p => String(p).replace(/\D/g, ''))
            .map(p => (p.startsWith('55') && p.length >= 12) ? p.substring(2) : p)
            .filter(p => p.length >= 8);
        
        return phones.some(p => p === normalizedPhone || p.slice(-9) === last9);
    }) || null;
}

// Renderizar painel com dados locais (quando o client-brain falha mas temos dados locais)
function renderLocalClientPanel(client, phone) {
    const panel = document.getElementById('crmDataContainer');
    const clientOrders = allOrders.filter(o => 
        o.id_cliente === client.id || o.cliente_id === client.id ||
        String(o.id_cliente) === String(client.id) || String(o.cliente_id) === String(client.id) ||
        String(o.cliente?.id || '') === String(client.id)
    );
    
    const totalSpent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.valor_total || o.total) || 0), 0);
    const avgTicket = clientOrders.length > 0 ? totalSpent / clientOrders.length : 0;
    const name = client.nome || client.name || 'Cliente';
    
    // Determinar status
    let status = 'Cliente', statusColor = 'from-blue-500 to-blue-600', statusEmoji = '✅';
    if (clientOrders.length >= 5 || totalSpent >= 500) {
        status = 'Cliente VIP'; statusColor = 'from-purple-500 to-purple-600'; statusEmoji = '👑';
    } else if (clientOrders.length >= 2) {
        status = 'Recorrente'; statusColor = 'from-emerald-500 to-emerald-600'; statusEmoji = '⭐';
    }
    
    // Produtos comprados (agregar)
    const productMap = {};
    clientOrders.forEach(o => {
        const items = o.itens || o.products || o.produtos || [];
        items.forEach(item => {
            const pName = item.nome || item.name || item.produto || 'Produto';
            const qty = parseInt(item.quantidade || item.qty || 1);
            productMap[pName] = (productMap[pName] || 0) + qty;
        });
    });
    const productsHtml = Object.keys(productMap).length > 0
        ? Object.entries(productMap).sort((a,b) => b[1] - a[1]).map(([name, qty]) =>
            `<div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-sm text-slate-700 truncate flex-1">${escapeHtml(name)}</span>
                <span class="text-xs text-slate-400 ml-2">${qty}x</span>
            </div>`
        ).join('')
        : '<p class="text-xs text-slate-400 text-center py-2">Sem histórico</p>';
    
    const ordersHtml = clientOrders.sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0, 5).map(o =>
        `<div class="p-3 border border-slate-200 rounded-lg">
            <div class="flex justify-between items-start mb-1">
                <span class="font-medium text-slate-800 text-sm">#${o.id}</span>
                <span class="font-bold text-emerald-600 text-sm">R$ ${parseFloat(o.valor_total || o.total || 0).toFixed(2)}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-slate-500">${o.data ? new Date(o.data).toLocaleDateString('pt-BR') : '-'}</span>
                <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${(o.itens || o.produtos || o.products || []).length} itens</span>
            </div>
        </div>`
    ).join('') || '<p class="text-xs text-slate-400 text-center py-3">Nenhum pedido</p>';
    
    panel.innerHTML = `
        <div class="space-y-4">
            <div class="bg-gradient-to-br ${statusColor} rounded-xl p-4 text-white">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold backdrop-blur">
                        ${name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-lg truncate">${escapeHtml(name)}</h3>
                        <p class="text-sm opacity-90">${statusEmoji} ${status}</p>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Pedidos</p>
                    <p class="text-xl font-bold text-slate-800">${clientOrders.length}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Ticket</p>
                    <p class="text-lg font-bold text-emerald-600">R$ ${parseInt(avgTicket)}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Total</p>
                    <p class="text-lg font-bold text-blue-600">R$ ${parseInt(totalSpent)}</p>
                </div>
            </div>
            <div class="border border-slate-200 rounded-xl p-3">
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="star" class="w-4 h-4 text-amber-500"></i>Produtos Comprados
                </h4>
                <div class="max-h-32 overflow-y-auto">${productsHtml}</div>
            </div>
            <div>
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="receipt" class="w-4 h-4"></i>Últimos Pedidos
                </h4>
                <div class="space-y-2">${ordersHtml}</div>
            </div>
            <div class="bg-slate-50 rounded-xl p-3 text-sm">
                <p class="text-slate-600"><strong>Email:</strong> ${client.email || 'N/A'}</p>
                <p class="text-slate-600"><strong>Telefone:</strong> ${formatPhone(phone)}</p>
                ${client.cidade || client.city ? `<p class="text-slate-600"><strong>Cidade:</strong> ${client.cidade || client.city}</p>` : ''}
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Fallback para busca local (quando API falha)
function fallbackLocalClientSearch(chatId, whatsappPhone, phoneWithoutDDI, whatsappName) {
    const localClient = tryLocalClientMatch(phoneWithoutDDI);
    
    if (!localClient) {
        const displayPhone = whatsappPhone.startsWith('55') ? whatsappPhone : '55' + whatsappPhone;
        renderNewLeadPanel(displayPhone, whatsappName);
        currentClient = null;
    } else {
        currentClient = localClient;
        renderLocalClientPanel(localClient, whatsappPhone);
    }
}

// Painel de Lead Novo (versão Brain)
function renderNewLeadPanelBrain(phone, whatsappName, brainData) {
    const panel = document.getElementById('crmDataContainer');
    
    panel.innerHTML = `
        <div class="space-y-4">
            <!-- Badge Lead Novo com insight -->
            <div class="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl">
                        ${brainData.statusEmoji || '🆕'}
                    </div>
                    <div>
                        <p class="font-bold text-blue-800 text-lg">${brainData.status || 'Lead Novo'}</p>
                        <p class="text-xs text-blue-600">Primeira interação</p>
                    </div>
                </div>
                <p class="text-sm text-blue-700 mt-2">${brainData.insight || 'Cliente não encontrado no sistema de pedidos.'}</p>
            </div>
            
            <!-- Info do WhatsApp -->
            <div class="bg-slate-50 rounded-xl p-4">
                <p class="text-xs text-slate-500 mb-1">Nome no WhatsApp</p>
                <p class="font-semibold text-slate-800">${escapeHtml(whatsappName)}</p>
                <p class="text-xs text-slate-400 mt-2">Telefone: ${formatPhone(phone)}</p>
            </div>
            
            <!-- Dica -->
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p class="text-sm text-amber-700">
                    <strong>💡 Dica:</strong> ${brainData.recommendation || 'Pergunte o nome e interesse do cliente.'}
                </p>
            </div>
            
            <!-- Formulário de Cadastro Rápido -->
            <div class="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 class="font-semibold text-slate-800 flex items-center gap-2">
                    <i data-lucide="user-plus" class="w-4 h-4"></i>
                    Cadastrar Cliente
                </h4>
                
                <div>
                    <label class="block text-xs text-slate-500 mb-1">Nome *</label>
                    <input type="text" id="newClientName" value="${escapeHtml(whatsappName)}" class="input text-sm">
                </div>
                
                <div>
                    <label class="block text-xs text-slate-500 mb-1">Email</label>
                    <input type="email" id="newClientEmail" placeholder="email@exemplo.com" class="input text-sm">
                </div>
                
                <input type="hidden" id="newClientPhone" value="${phone}">
                
                <button onclick="saveNewClient()" class="w-full btn btn-primary">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    Salvar Cadastro
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Painel de Cliente (versão Brain com histórico completo)
function renderClientPanelBrain(brainData, phone) {
    const panel = document.getElementById('crmDataContainer');
    const client = brainData.client;
    const metrics = brainData.metrics;
    
    // Cor do status
    const statusColors = {
        'purple': 'from-purple-500 to-purple-600',
        'green': 'from-emerald-500 to-emerald-600',
        'blue': 'from-blue-500 to-blue-600',
        'gray': 'from-slate-400 to-slate-500'
    };
    const gradientColor = statusColors[brainData.statusColor] || 'from-emerald-500 to-emerald-600';
    
    // Badge de fidelidade
    const loyaltyTag = brainData.loyaltyTag || brainData.status;
    const loyaltyBadges = {
        'VIP': { bg: 'bg-purple-100 text-purple-700', icon: '👑' },
        'Cliente Fiel': { bg: 'bg-emerald-100 text-emerald-700', icon: '💎' },
        'Recorrente': { bg: 'bg-blue-100 text-blue-700', icon: '⭐' },
        'Cliente': { bg: 'bg-green-100 text-green-700', icon: '✅' },
        'Inativo': { bg: 'bg-red-100 text-red-700', icon: '⚠️' },
        'Lead': { bg: 'bg-slate-100 text-slate-600', icon: '📝' }
    };
    const loyaltyBadge = loyaltyBadges[loyaltyTag] || loyaltyBadges['Cliente'];
    
    // Frequência / Ciclo de recompra
    const avgCycle = metrics.avgDaysBetweenPurchases || 0;
    const frequencyText = avgCycle > 0 ? `A cada ~${avgCycle} dias` : 'Sem dados suficientes';
    
    // Últimos 3 produtos comprados (cronológico, com links)
    const recentProductsHtml = brainData.recentProducts && brainData.recentProducts.length > 0 
        ? brainData.recentProducts.map(p => `
            <div class="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                ${p.image ? `<img src="${p.image}" class="w-8 h-8 rounded object-cover flex-shrink-0" onerror="this.style.display='none'">` : '<div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center flex-shrink-0"><i data-lucide="package" class="w-4 h-4 text-slate-400"></i></div>'}
                <div class="flex-1 min-w-0">
                    <p class="text-sm text-slate-700 truncate font-medium">${escapeHtml(p.name)}</p>
                    <p class="text-xs text-slate-400">${p.orderDate ? new Date(p.orderDate).toLocaleDateString('pt-BR') : ''} · R$ ${parseFloat(p.price || 0).toFixed(2)}</p>
                </div>
                ${p.link ? `<a href="${p.link}" target="_blank" class="text-emerald-500 hover:text-emerald-700 flex-shrink-0" title="Ver produto"><i data-lucide="external-link" class="w-3.5 h-3.5"></i></a>` : ''}
                ${p.orderId ? `<button onclick="showOrderDetails('${p.orderId}')" class="text-purple-500 hover:text-purple-700 flex-shrink-0" title="Ver pedido #${p.orderId}"><i data-lucide="receipt" class="w-3.5 h-3.5"></i></button>` : ''}
            </div>
        `).join('')
        : '<p class="text-xs text-slate-400 text-center py-2">Sem histórico de compras</p>';
    
    // Produtos frequentes (agregado)   
    const productsHtml = brainData.products && brainData.products.length > 0 
        ? brainData.products.map(p => `
            <div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-sm text-slate-700 truncate flex-1">${escapeHtml(p.name)}</span>
                <span class="text-xs text-slate-400 ml-2">${p.qty}x</span>
            </div>
        `).join('')
        : '';
    
    // Últimos pedidos HTML
    const ordersHtml = brainData.orders && brainData.orders.length > 0
        ? brainData.orders.map(o => `
            <div class="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer" onclick="showOrderDetails('${o.id}')">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-medium text-slate-800 text-sm">#${o.id}</span>
                    <span class="font-bold text-emerald-600 text-sm">R$ ${parseFloat(o.total).toFixed(2)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-xs text-slate-500">${new Date(o.date).toLocaleDateString('pt-BR')}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${o.items} itens</span>
                </div>
            </div>
        `).join('')
        : '<p class="text-xs text-slate-400 text-center py-3">Nenhum pedido encontrado</p>';

    panel.innerHTML = `
        <div class="space-y-4">
            <!-- Header do Cliente com Status -->
            <div class="bg-gradient-to-br ${gradientColor} rounded-xl p-4 text-white">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold backdrop-blur">
                        ${client.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-lg truncate">${escapeHtml(client.name)}</h3>
                        <p class="text-sm opacity-90">${brainData.statusEmoji} ${brainData.status}</p>
                    </div>
                </div>
                <!-- Tag de Fidelidade -->
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/25 backdrop-blur">${loyaltyBadge.icon} ${loyaltyTag}</span>
                    ${metrics.daysSinceLastPurchase > 90 && metrics.ordersCount > 0 ? '<span class="px-2 py-1 rounded-full text-xs font-medium bg-red-400/30">⏰ Reativar!</span>' : ''}
                </div>
                <!-- Tags de Segmentação IA (Módulo 1) -->
                <div id="crmClientTags" class="flex flex-wrap gap-1 mt-2"></div>
                <p class="text-sm opacity-80 mt-2">${brainData.insight}</p>
            </div>
            
            <!-- Mini CRM: KPIs Grid -->
            <div class="grid grid-cols-2 gap-2">
                <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 rounded-xl">
                    <p class="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold mb-1">LTV (Total Gasto)</p>
                    <p class="text-xl font-bold text-emerald-700">R$ ${parseInt(metrics.totalSpent).toLocaleString('pt-BR')}</p>
                </div>
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-xl">
                    <p class="text-[10px] uppercase tracking-wider text-blue-600 font-semibold mb-1">Ticket Médio</p>
                    <p class="text-xl font-bold text-blue-700">R$ ${parseInt(metrics.avgTicket).toLocaleString('pt-BR')}</p>
                </div>
                <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-xl">
                    <p class="text-[10px] uppercase tracking-wider text-purple-600 font-semibold mb-1">Frequência</p>
                    <p class="text-lg font-bold text-purple-700">${metrics.ordersCount} pedidos</p>
                    <p class="text-[10px] text-purple-500">${frequencyText}</p>
                </div>
                <div class="bg-gradient-to-br from-amber-50 to-amber-100 p-3 rounded-xl">
                    <p class="text-[10px] uppercase tracking-wider text-amber-600 font-semibold mb-1">Última Compra</p>
                    <p class="text-lg font-bold text-amber-700">${metrics.lastPurchaseDate ? metrics.daysSinceLastPurchase + 'd' : '—'}</p>
                    <p class="text-[10px] text-amber-500">${metrics.lastPurchaseDate ? new Date(metrics.lastPurchaseDate).toLocaleDateString('pt-BR') : 'Nunca comprou'}</p>
                </div>
            </div>
            
            <!-- Histórico Recente: Últimos 3 Produtos -->
            <div class="border border-slate-200 rounded-xl p-3">
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="clock" class="w-4 h-4 text-blue-500"></i>
                    Últimas Compras
                </h4>
                <div class="max-h-40 overflow-y-auto">
                    ${recentProductsHtml}
                </div>
            </div>
            
            ${productsHtml ? `
            <!-- Produtos Favoritos (frequência) -->
            <div class="border border-slate-200 rounded-xl p-3">
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="star" class="w-4 h-4 text-amber-500"></i>
                    Produtos Favoritos
                </h4>
                <div class="max-h-28 overflow-y-auto">
                    ${productsHtml}
                </div>
            </div>
            ` : ''}
            
            <!-- Últimos Pedidos -->
            <div>
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="receipt" class="w-4 h-4"></i>
                    Últimos Pedidos
                </h4>
                <div class="space-y-2">
                    ${ordersHtml}
                </div>
            </div>
            
            <!-- Recomendação -->
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p class="text-sm text-amber-700">${brainData.recommendation}</p>
            </div>
            
            <!-- Dados de Contato -->
            <div class="bg-slate-50 rounded-xl p-3 text-sm">
                <p class="text-slate-600"><strong>Email:</strong> ${client.email || 'Não informado'}</p>
                <p class="text-slate-600"><strong>Telefone:</strong> ${formatPhone(phone)}</p>
                ${client.city ? `<p class="text-slate-600"><strong>Cidade:</strong> ${client.city}${client.state ? ' - ' + client.state : ''}</p>` : ''}
            </div>
            
            <!-- Ações -->
            <div class="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <button onclick="openProductModal()" class="w-full btn btn-primary text-sm">
                    <i data-lucide="package" class="w-4 h-4"></i>
                    Enviar Produto
                </button>
                <button onclick="generateCoupon('${client.id}')" class="w-full btn btn-secondary text-sm">
                    <i data-lucide="ticket" class="w-4 h-4"></i>
                    Gerar Cupom Exclusivo
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
    
    // Carregar tags de segmentação IA do Supabase (Módulo 1)
    loadClientSegmentTags(phone);
}

/**
 * Carregar e renderizar tags de segmentação IA (clientes_tags) do servidor
 */
async function loadClientSegmentTags(phone) {
    const container = document.getElementById('crmClientTags');
    if (!container || !phone) return;
    
    try {
        const cleanPhone = phone.replace(/\D/g, '');
        const res = await fetch(`${API_BASE}/client-tags/${cleanPhone}`);
        if (!res.ok) return;
        
        const tags = await res.json();
        if (!tags || tags.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        const TAG_COLORS = {
            'anuncio': 'bg-blue-400/30 text-blue-100',
            'bio_link': 'bg-cyan-400/30 text-cyan-100',
            'ia': 'bg-purple-400/30 text-purple-100',
            'manual': 'bg-amber-400/30 text-amber-100',
            'organico': 'bg-green-400/30 text-green-100',
            'webhook': 'bg-teal-400/30 text-teal-100',
            'campanha': 'bg-pink-400/30 text-pink-100'
        };
        
        container.innerHTML = tags.map(t => {
            const colorClass = TAG_COLORS[t.origem] || 'bg-white/20 text-white/90';
            return `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${colorClass}" title="Origem: ${t.origem} | Confiança: ${t.confianca}%">${t.tag}</span>`;
        }).join('');
    } catch (err) {
        console.warn('[TAGS] Erro ao carregar tags:', err.message);
    }
}

function renderNewLeadPanel(phone, whatsappName) {
    const panel = document.getElementById('crmDataContainer');
    
    panel.innerHTML = `
        <div class="space-y-4">
            <!-- Badge Lead Novo -->
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <i data-lucide="user-plus" class="w-5 h-5 text-amber-600"></i>
                </div>
                <div>
                    <p class="font-semibold text-amber-800">Lead Novo</p>
                    <p class="text-xs text-amber-600">Cliente não cadastrado no CRM</p>
                </div>
            </div>
            
            <!-- Info do WhatsApp -->
            <div class="bg-slate-50 rounded-xl p-4">
                <p class="text-xs text-slate-500 mb-1">Nome no WhatsApp</p>
                <p class="font-semibold text-slate-800">${escapeHtml(whatsappName)}</p>
                <p class="text-xs text-slate-400 mt-2">Telefone: ${formatPhone(phone)}</p>
            </div>
            
            <!-- Formulário de Cadastro Rápido -->
            <div class="border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 class="font-semibold text-slate-800 flex items-center gap-2">
                    <i data-lucide="user-plus" class="w-4 h-4"></i>
                    Cadastrar Cliente
                </h4>
                
                <div>
                    <label class="block text-xs text-slate-500 mb-1">Nome *</label>
                    <input type="text" id="newClientName" value="${escapeHtml(whatsappName)}" class="input text-sm">
                </div>
                
                <div>
                    <label class="block text-xs text-slate-500 mb-1">Email</label>
                    <input type="email" id="newClientEmail" placeholder="email@exemplo.com" class="input text-sm">
                </div>
                
                <div>
                    <label class="block text-xs text-slate-500 mb-1">Estado</label>
                    <select id="newClientState" class="input text-sm">
                        <option value="">Selecione...</option>
                        <option value="AC">AC</option><option value="AL">AL</option><option value="AP">AP</option>
                        <option value="AM">AM</option><option value="BA">BA</option><option value="CE">CE</option>
                        <option value="DF">DF</option><option value="ES">ES</option><option value="GO">GO</option>
                        <option value="MA">MA</option><option value="MT">MT</option><option value="MS">MS</option>
                        <option value="MG">MG</option><option value="PA">PA</option><option value="PB">PB</option>
                        <option value="PR">PR</option><option value="PE">PE</option><option value="PI">PI</option>
                        <option value="RJ">RJ</option><option value="RN">RN</option><option value="RS">RS</option>
                        <option value="RO">RO</option><option value="RR">RR</option><option value="SC">SC</option>
                        <option value="SP">SP</option><option value="SE">SE</option><option value="TO">TO</option>
                    </select>
                </div>
                
                <input type="hidden" id="newClientPhone" value="${phone}">
                
                <button onclick="saveNewClient()" class="w-full btn btn-primary">
                    <i data-lucide="save" class="w-4 h-4"></i>
                    Salvar Cadastro
                </button>
            </div>
            
            <!-- Botão Vincular Existente -->
            <button onclick="openSearchClientModal()" class="w-full btn btn-secondary text-sm">
                <i data-lucide="link" class="w-4 h-4"></i>
                Vincular a Cliente Existente
            </button>
        </div>
    `;
    lucide.createIcons();
}

function renderClientPanel(client, phone) {
    const panel = document.getElementById('crmDataContainer');
    
    // Calcular estatísticas
    const clientOrders = allOrders.filter(o => o.cliente_id == client.id).sort((a,b) => new Date(b.data) - new Date(a.data));
    const totalGasto = clientOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
    const qtdPedidos = clientOrders.length;
    const ticketMedio = qtdPedidos > 0 ? totalGasto / qtdPedidos : 0;
    
    // Dias desde última compra
    let daysSince = null;
    let lastOrderDate = null;
    if (clientOrders.length > 0) {
        lastOrderDate = new Date(clientOrders[0].data);
        const diff = new Date() - lastOrderDate;
        daysSince = Math.floor(diff / (1000 * 60 * 60 * 24));
    }
    
    // Determinar badges
    let badges = [];
    if (ticketMedio >= 500) badges.push({ text: 'VIP', color: 'bg-purple-100 text-purple-700', icon: 'crown' });
    if (daysSince !== null && daysSince > 90) badges.push({ text: `Inativo ${daysSince}d`, color: 'bg-red-100 text-red-700', icon: 'alert-triangle' });
    if (qtdPedidos >= 10) badges.push({ text: 'Fiel', color: 'bg-emerald-100 text-emerald-700', icon: 'heart' });
    if (qtdPedidos === 0) badges.push({ text: 'Nunca Comprou', color: 'bg-amber-100 text-amber-700', icon: 'shopping-cart' });
    
    // Notas do cliente
    const notes = clientNotes[client.id] || '';
    
    // Status badges HTML
    const badgesHtml = badges.map(b => `
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${b.color}">
            <i data-lucide="${b.icon}" class="w-3 h-3"></i>
            ${b.text}
        </span>
    `).join('');
    
    // Mini-timeline de pedidos
    const ordersHtml = clientOrders.slice(0, 3).map(o => {
        const statusColors = {
            'entregue': 'bg-emerald-100 text-emerald-700',
            'enviado': 'bg-blue-100 text-blue-700',
            'pendente': 'bg-amber-100 text-amber-700',
            'cancelado': 'bg-red-100 text-red-700'
        };
        const status = (o.status || 'pendente').toLowerCase();
        const statusColor = statusColors[status] || 'bg-slate-100 text-slate-700';
        
        // Buscar produtos deste pedido
        const orderItems = allOrders.filter(item => item.id === o.id && item.produto_id);
        const productsText = orderItems.length > 0 
            ? orderItems.map(item => {
                const product = allProducts.find(p => p.id == item.produto_id);
                return product ? `${product.nome}` : 'Produto desconhecido';
            }).join(', ')
            : 'Sem produtos';
        
        return `
            <div class="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors" onclick="showOrderDetails(${o.id})">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-semibold text-slate-800 text-sm">#${o.id}</span>
                    <span class="font-bold text-emerald-600 text-sm">R$ ${parseFloat(o.total || 0).toFixed(2)}</span>
                </div>
                <div class="mb-2">
                    <p class="text-xs text-slate-600 line-clamp-2">${productsText}</p>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-xs text-slate-500">${new Date(o.data).toLocaleDateString('pt-BR')}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs ${statusColor}">${o.status || 'Pendente'}</span>
                </div>
            </div>
        `;
    }).join('') || '<p class="text-xs text-slate-400 text-center py-3">Nenhum pedido encontrado</p>';

    panel.innerHTML = `
        <div class="space-y-4">
            <!-- Header do Cliente -->
            <div class="text-center">
                <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold mx-auto mb-2 shadow-lg">
                    ${client.nome.charAt(0).toUpperCase()}
                </div>
                <h3 class="font-bold text-slate-800 text-lg">${escapeHtml(client.nome)}</h3>
                <p class="text-xs text-slate-500">${client.email || 'Sem email'}</p>
                <p class="text-xs text-slate-400">${client.cidade || ''} ${client.estado ? '- ' + client.estado : ''}</p>
                
                <!-- Badges de Status -->
                <div class="flex flex-wrap justify-center gap-1 mt-2">
                    ${badgesHtml}
                </div>
            </div>
            
            <!-- KPIs -->
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Pedidos</p>
                    <p class="text-lg font-bold text-slate-800">${qtdPedidos}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Ticket Médio</p>
                    <p class="text-lg font-bold text-emerald-600">R$ ${ticketMedio.toFixed(0)}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Total</p>
                    <p class="text-lg font-bold text-blue-600">R$ ${totalGasto.toFixed(0)}</p>
                </div>
            </div>
            
            <!-- Última Compra -->
            ${lastOrderDate ? `
                <div class="bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-xl flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <i data-lucide="calendar" class="w-5 h-5 text-slate-500"></i>
                    </div>
                    <div>
                        <p class="text-xs text-slate-500">Última compra</p>
                        <p class="font-semibold text-slate-800">${lastOrderDate.toLocaleDateString('pt-BR')} <span class="text-slate-400 font-normal">(${daysSince} dias atrás)</span></p>
                    </div>
                </div>
            ` : ''}
            
            <!-- Mini-Timeline de Pedidos -->
            <div>
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2">
                        <i data-lucide="receipt" class="w-4 h-4"></i>
                        Últimos Pedidos
                    </h4>
                    <button onclick="showAllOrders(${client.id})" class="text-xs text-blue-600 hover:underline">Ver todos</button>
                </div>
                <div class="space-y-2">
                    ${ordersHtml}
                </div>
            </div>
            
            <!-- Anotações -->
            <div>
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="sticky-note" class="w-4 h-4"></i>
                    Anotações Internas
                </h4>
                <textarea 
                    id="clientNotes" 
                    class="input text-sm resize-none" 
                    rows="3" 
                    placeholder="Ex: Cliente prefere contato de manhã..."
                    oninput="saveClientNotes(${client.id}, this.value)"
                >${escapeHtml(notes)}</textarea>
                <p class="text-xs text-slate-400 mt-1">Salva automaticamente</p>
            </div>
            
            <!-- Ações -->
            <div class="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <button onclick="generateCoupon(${client.id})" class="w-full btn btn-secondary text-sm">
                    <i data-lucide="ticket" class="w-4 h-4"></i>
                    Gerar Cupom Exclusivo
                </button>
                <button onclick="editClient(${client.id})" class="w-full btn btn-secondary text-sm">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                    Editar Cadastro
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

function saveClientNotes(clientId, notes) {
    clientNotes[clientId] = notes;
    localStorage.setItem('crm_client_notes', JSON.stringify(clientNotes));
    scheduleCloudSave();
}

function showAllOrders(clientId) {
    const client = allClients.find(c => c.id == clientId);
    if (!client) return;
    
    const clientOrders = allOrders
        .filter(o => o.cliente_id == clientId)
        .sort((a, b) => new Date(b.data) - new Date(a.data));
    
    // Criar HTML com todos os pedidos
    const ordersHtml = clientOrders.map(o => {
        const statusColors = {
            'entregue': 'bg-emerald-100 text-emerald-700',
            'enviado': 'bg-blue-100 text-blue-700',
            'pendente': 'bg-amber-100 text-amber-700',
            'cancelado': 'bg-red-100 text-red-700'
        };
        const status = (o.status || 'pendente').toLowerCase();
        const statusColor = statusColors[status] || 'bg-slate-100 text-slate-700';
        
        // Buscar itens do pedido
        const orderItems = allOrders.filter(item => item.id === o.id && item.produto_id);
        const productsHtml = orderItems.map(item => {
            const product = allProducts.find(p => p.id == item.produto_id);
            return `
                <div class="p-2 bg-slate-50 rounded flex items-center gap-2 text-xs">
                    ${product?.imagem ? `<img src="${product.imagem}" alt="${product?.nome}" class="w-8 h-8 rounded object-cover">` : '<div class="w-8 h-8 rounded bg-slate-200"></div>'}
                    <div class="flex-1">
                        <p class="font-medium text-slate-800">${product?.nome || 'Produto'}</p>
                        <p class="text-slate-500">R$ ${product?.preco || '0.00'}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="border border-slate-200 rounded-xl p-4 mb-3">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <p class="font-bold text-slate-800">Pedido #${o.id}</p>
                        <p class="text-xs text-slate-500">${new Date(o.data).toLocaleDateString('pt-BR')} às ${new Date(o.data).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-medium ${statusColor}">${o.status || 'Pendente'}</span>
                </div>
                
                <div class="mb-3">
                    <p class="text-xs text-slate-500 mb-2">Produtos:</p>
                    ${productsHtml}
                </div>
                
                <div class="flex justify-between items-center pt-3 border-t border-slate-100">
                    <span class="text-slate-600">Total:</span>
                    <span class="font-bold text-lg text-emerald-600">R$ ${parseFloat(o.total || 0).toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Mostrar em alert ou modal
    alert(`${clientOrders.length} pedidos encontrados para ${client.nome}`);
}

// ============================================================================
// SINCRONIZAÇÃO DE DADOS: Quando editado no CRM, atualizar também no header
// ============================================================================
async function syncClientNameToUI(chatId, newName) {
    console.log(`[SYNC] Atualizando nome de ${chatId} para: ${newName}`);
    
    if (!chatId || !newName || !newName.trim()) {
        console.warn('[SYNC] chatId ou newName inválido');
        return;
    }
    
    const trimmedName = newName.trim();
    
    // ★ 1. PERSISTIR em localStorage (fonte de verdade para nomes customizados)
    customContactNames[chatId] = trimmedName;
    localStorage.setItem('crm_custom_names', JSON.stringify(customContactNames));
    console.log('[SYNC] ✅ Nome salvo em localStorage');
    
    // 2. Atualizar nome no header imediatamente se este é o chat atual
    if (currentRemoteJid === chatId || currentChatId === chatId) {
        const headerNameEl = document.getElementById('headerName');
        if (headerNameEl) {
            headerNameEl.innerText = trimmedName;
            console.log('[SYNC] ✅ Header atualizado');
        }
    }
    
    // 3. Atualizar na lista de chats (sidebar) — buscar h4 dentro do chat-item
    const chatElement = document.querySelector(`[data-chat-id="${chatId}"]`)
                     || document.querySelector(`[data-chat-key="${chatId}"]`);
    if (chatElement) {
        // O nome está no <h4> dentro do item
        const nameElement = chatElement.querySelector('h4.truncate')
                         || chatElement.querySelector('.font-bold.truncate')
                         || chatElement.querySelector('.font-medium.truncate')
                         || chatElement.querySelector('.font-semibold.truncate');
        if (nameElement) {
            // Preservar badges/tags que estão como children do h4
            const existingBadges = nameElement.querySelectorAll('span');
            let badgesHtml = '';
            existingBadges.forEach(b => badgesHtml += b.outerHTML);
            nameElement.innerHTML = escapeHtml(trimmedName) + badgesHtml;
            console.log('[SYNC] ✅ Lista de chats atualizada');
        } else {
            console.warn('[SYNC] Elemento de nome não encontrado no chat item');
        }
    }
    
    // 4. Atualizar no array em memória
    const chatIndex = allChats.findIndex(c => c.id === chatId || c.remoteJid === chatId);
    if (chatIndex !== -1) {
        allChats[chatIndex].name = trimmedName;
        allChats[chatIndex].pushName = trimmedName;
        allChats[chatIndex]._customName = trimmedName;
        console.log('[SYNC] ✅ Array allChats atualizado');
    }
    
    // 5. Atualizar no allClients se existir
    if (currentClient) {
        currentClient.nome = trimmedName;
        currentClient.name = trimmedName;
    }
    
    // 6. Sincronizar com backend (Supabase/CRM) — best-effort
    try {
        const phone = extractPhoneFromJid(chatId);
        if (phone) {
            const res = await fetch(`${API_BASE}/sync-client-name`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    phone: phone,
                    newName: trimmedName,
                    chatId: chatId
                })
            });
            const result = await res.json();
            console.log('[SYNC] Backend respondeu:', result);
        }
    } catch (e) {
        console.warn('[SYNC] Não conseguiu sincronizar com backend:', e);
    }
    
    // 7. Limpar cache CRM para forçar refresh na próxima abertura
    if (typeof CRMCache !== 'undefined') {
        CRMCache.invalidate(chatId);
    }
    
    showToast(`✅ Nome atualizado: ${trimmedName}`, 'success');
}

// Chamar essa função quando editar o nome do cliente no painel
function onClientNameChanged(newName) {
    if (!currentRemoteJid && !currentChatId) {
        console.warn('[SYNC] Nenhum chat selecionado');
        return;
    }
    
    const chatId = currentRemoteJid || currentChatId;
    syncClientNameToUI(chatId, newName);
}

async function saveNewClient() {
    const name = document.getElementById('newClientName').value.trim();
    const email = document.getElementById('newClientEmail').value.trim();
    const stateEl = document.getElementById('newClientState');
    const state = stateEl ? stateEl.value : '';
    const phone = document.getElementById('newClientPhone').value;
    
    if (!name) return alert('Nome é obrigatório');
    
    // Criar novo cliente
    const newClient = {
        id: Date.now(),
        nome: name,
        name: name,
        email: email,
        estado: state,
        telefone: phone,
        celular: phone,
        data_cadastro: new Date().toISOString()
    };
    
    // Adicionar à lista local
    allClients.push(newClient);
    
    // ★ PERSISTIR allClients em localStorage para sobreviver a reloads
    try {
        localStorage.setItem('crm_all_clients', JSON.stringify(allClients));
        console.log('[saveNewClient] ✅ allClients persistido em localStorage');
    } catch (e) {
        console.warn('[saveNewClient] Falha ao salvar allClients:', e);
    }
    
    // Atualizar painel
    currentClient = newClient;
    renderClientPanel(newClient, phone);
    
    // ★ SINCRONIZAR nome na sidebar + localStorage customContactNames
    const chatId = currentRemoteJid || currentChatId;
    if (chatId) {
        await syncClientNameToUI(chatId, name);
    }
    
    // Remover tag de Lead Novo
    if (currentChatId && chatTags[currentChatId]) {
        const leadTag = allTags.find(t => t.name.toLowerCase().includes('lead'));
        if (leadTag) {
            chatTags[currentChatId] = chatTags[currentChatId].filter(id => id !== leadTag.id);
            localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
            scheduleCloudSave();
            renderChatTags();
        }
    }
    
    showToast('✅ Cliente cadastrado com sucesso!', 'success');
}

function openSearchClientModal() {
    document.getElementById('searchClientModal').classList.remove('hidden');
    document.getElementById('searchClientInput').value = '';
    document.getElementById('searchClientResults').innerHTML = '<p class="text-center text-slate-400 text-sm py-4">Digite para buscar clientes...</p>';
    document.getElementById('searchClientInput').focus();
    lucide.createIcons();
}

function closeSearchClientModal() {
    document.getElementById('searchClientModal').classList.add('hidden');
}

function searchClientByName(query) {
    const container = document.getElementById('searchClientResults');
    
    if (query.length < 2) {
        container.innerHTML = '<p class="text-center text-slate-400 text-sm py-4">Digite pelo menos 2 caracteres...</p>';
        return;
    }
    
    const results = allClients.filter(c => 
        c.nome.toLowerCase().includes(query.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 10);
    
    if (results.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 text-sm py-4">Nenhum cliente encontrado</p>';
        return;
    }
    
    container.innerHTML = results.map(c => `
        <div onclick="linkClientToChat(${c.id})" class="p-3 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                    ${c.nome.charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-slate-800 truncate">${escapeHtml(c.nome)}</p>
                    <p class="text-xs text-slate-500">${c.email || c.telefone || 'Sem contato'}</p>
                </div>
                <i data-lucide="link" class="w-4 h-4 text-blue-500"></i>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function linkClientToChat(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client || !currentChatId) return;
    
    // Atualizar telefone do cliente com o novo número
    const newPhone = currentChatId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    client.telefone = newPhone;
    client.celular = newPhone;
    
    // Renderizar painel com dados do cliente
    currentClient = client;
    renderClientPanel(client, newPhone);
    
    // Fechar modal
    closeSearchClientModal();
    
    // Remover tag de Lead
    if (chatTags[currentChatId]) {
        const leadTag = allTags.find(t => t.name.toLowerCase().includes('lead'));
        if (leadTag) {
            chatTags[currentChatId] = chatTags[currentChatId].filter(id => id !== leadTag.id);
            localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
            scheduleCloudSave();
            renderChatTags();
        }
    }
    
    alert(`Cliente "${client.nome}" vinculado a este número!`);
}

function showOrderDetails(orderId) {
    const order = allOrders.find(o => o.id == orderId);
    if (!order) return;
    alert(`Pedido #${order.id}\\nData: ${new Date(order.data).toLocaleDateString('pt-BR')}\\nTotal: R$ ${parseFloat(order.total).toFixed(2)}\\nStatus: ${order.status || 'Pendente'}`);
}

function showAllOrders(clientId) {
    const orders = allOrders.filter(o => o.cliente_id == clientId);
    alert(`Total de ${orders.length} pedidos para este cliente.\\n\\nFuncionalidade completa em desenvolvimento.`);
}

function generateCoupon(clientId) {
    const code = 'CJOTA' + Math.random().toString(36).substring(2, 8).toUpperCase();
    alert(`Cupom gerado: ${code}\\n\\n10% de desconto exclusivo para este cliente!`);
}

function editClient(clientId) {
    alert('Funcionalidade de edição em desenvolvimento.');
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
    scheduleCloudSave();
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
    scheduleCloudSave();
    
    nameInput.value = '';
    renderTagsList();
}

function deleteTag(tagId) {
    if (!confirm('Excluir esta etiqueta?')) return;
    
    allTags = allTags.filter(t => t.id !== tagId);
    localStorage.setItem('crm_tags', JSON.stringify(allTags));
    scheduleCloudSave();
    
    // Remover tag de todos os chats
    Object.keys(chatTags).forEach(chatId => {
        chatTags[chatId] = chatTags[chatId].filter(id => id !== tagId);
    });
    localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
    scheduleCloudSave();
    
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
    const filtered = quickReplies.filter(qr => {
        const searchText = filter.toLowerCase();
        const matchShortcut = qr.shortcut.toLowerCase().includes(searchText);
        const matchMessage = (qr.message || '').toLowerCase().includes(searchText);
        // Também buscar no texto dos blocos
        const matchBlocks = (qr.blocks || []).some(b => 
            (b.config?.text || '').toLowerCase().includes(searchText) ||
            (b.config?.caption || '').toLowerCase().includes(searchText)
        );
        return matchShortcut || matchMessage || matchBlocks;
    });
    
    container.innerHTML = filtered.map(qr => {
        // Montar preview dos blocos
        const blocks = qr.blocks || [];
        const blockIcons = { text: '💬', image: '🖼️', video: '🎥', audio: '🎵', poll: '📊', sticker: '✨', delay: '⏱️', presence: '👁️' };
        let previewHtml = '';
        
        if (blocks.length > 0) {
            const blockBadges = blocks.map(b => `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px] text-slate-600">${blockIcons[b.type] || '📎'} ${b.type}</span>`).join('');
            const firstText = blocks.find(b => b.type === 'text')?.config?.text || blocks.find(b => b.config?.caption)?.config?.caption || '';
            previewHtml = `<div class="flex flex-wrap gap-1 mb-1">${blockBadges}</div>` +
                (firstText ? `<p class="text-sm text-slate-600 line-clamp-2">${firstText.substring(0, 120)}</p>` : '');
        } else {
            // Legado: mensagem simples
            previewHtml = `<p class="text-sm text-slate-600 whitespace-pre-line line-clamp-3">${qr.message || ''}</p>`;
        }
        
        return `<div class="p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-all" onclick="useQuickReply(${qr.id})">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">/${qr.shortcut}</span>
                    ${blocks.length > 1 ? `<span class="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-medium">${blocks.length} blocos</span>` : ''}
                </div>
                <div class="flex gap-1">
                    <button onclick="event.stopPropagation(); editQuickReply(${qr.id})" class="text-slate-400 hover:text-blue-500 p-1">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteQuickReply(${qr.id})" class="text-slate-400 hover:text-red-500 p-1">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
            ${previewHtml}
        </div>`;
    }).join('') || '<p class="text-center text-slate-400 text-sm py-4">Nenhuma mensagem rápida encontrada</p>';
}

function filterQuickReplies(query) {
    renderQuickRepliesList(query);
    lucide.createIcons();
}

function useQuickReply(id) {
    const qr = quickReplies.find(q => q.id === id);
    if (!qr) return;
    
    const blocks = qr.blocks || [];
    
    // Se tem blocos, executar sequência completa
    if (blocks.length > 0) {
        closeQuickReplies();
        executeQuickReplyBlocks(qr);
        return;
    }
    
    // Legado: mensagem simples de texto
    const processed = processQuickReplyVariables(qr.message);
    document.getElementById('inputMessage').value = processed;
    closeQuickReplies();
    document.getElementById('inputMessage').focus();
}

/** Executar sequência de blocos de uma mensagem rápida */
async function executeQuickReplyBlocks(qr) {
    if (!currentChatId || !currentChatData) return alert('Selecione um chat primeiro');
    
    const remoteJid = currentChatData?.remoteJid || currentChatId;
    const isLidQR = remoteJid && remoteJid.includes('@lid');
    const phone = isLidQR 
        ? (currentChatData?.phone || _lidPhoneCache[remoteJid] || '')
        : remoteJid.replace('@s.whatsapp.net', '');
    const blocks = qr.blocks || [];
    
    // Variáveis de substituição
    const clientName = currentChatData?.name || currentClient?.nome || 'Cliente';
    const variables = {
        nome: clientName,
        telefone: currentClient?.telefone || phone,
        email: currentClient?.email || '',
        ultimo_pedido: '',
        rastreio: ''
    };
    if (currentClient) {
        const lastOrder = (window.allOrders || []).filter(o => o.cliente_id == currentClient.id).sort((a, b) => new Date(b.data) - new Date(a.data))[0];
        if (lastOrder) {
            variables.ultimo_pedido = `#${lastOrder.id} - R$ ${parseFloat(lastOrder.total).toFixed(2)}`;
            variables.rastreio = lastOrder.rastreio || 'Não informado';
        }
    }
    
    // Notificação de início
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3 text-sm';
    toast.id = 'qrSendingToast';
    toast.innerHTML = `<div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div><span>Enviando sequência <b>/${qr.shortcut}</b> (0/${blocks.length})...</span>`;
    document.body.appendChild(toast);
    
    // Usar MessageSequenceBuilder se disponível
    if (window.MessageSequenceBuilder) {
        const builder = MessageSequenceBuilder.create('qrBlocksContainer');
        builder.load(blocks);
        
        const result = await builder.execute(phone, variables, (idx, total, status) => {
            const toastEl = document.getElementById('qrSendingToast');
            if (toastEl) {
                const icon = status === 'error' ? '❌' : status === 'done' ? '✅' : '📤';
                toastEl.querySelector('span').innerHTML = `${icon} Enviando <b>/${qr.shortcut}</b> (${idx + 1}/${total})...`;
            }
        });
        
        // Resultado
        const toastEl = document.getElementById('qrSendingToast');
        if (toastEl) {
            toastEl.className = result.failed === 0 
                ? 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm'
                : 'fixed bottom-4 right-4 bg-amber-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm';
            toastEl.innerHTML = result.failed === 0
                ? `✅ Sequência <b>/${qr.shortcut}</b> enviada! (${result.sent} msgs)`
                : `⚠️ Enviado ${result.sent}, falhou ${result.failed}`;
            setTimeout(() => toastEl.remove(), 4000);
        }
    } else {
        // Fallback sem builder: enviar apenas blocos de texto
        for (const block of blocks) {
            if (block.type === 'text' && block.config?.text) {
                const msg = processQuickReplyVariables(block.config.text);
                try {
                    await fetch(`${API_BASE}/whatsapp/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone, message: msg })
                    });
                } catch (e) { console.error('Erro envio bloco:', e); }
            }
            if (block.type === 'delay') await new Promise(r => setTimeout(r, (block.config?.seconds || 3) * 1000));
        }
        toast.innerHTML = `✅ Sequência enviada!`;
        toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm';
        setTimeout(() => toast.remove(), 3000);
    }
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

// Estado do editor de blocos de mensagem rápida
let _qrBlocks = [];

function openNewQuickReply() {
    editingQuickReplyId = null;
    _qrBlocks = [];
    document.getElementById('editQuickReplyTitle').textContent = 'Nova Mensagem Rápida';
    document.getElementById('qrShortcut').value = '';
    renderQRBlocks();
    closeQuickReplies();
    document.getElementById('editQuickReplyModal').classList.remove('hidden');
    lucide.createIcons();
}

function editQuickReply(id) {
    const qr = quickReplies.find(q => q.id === id);
    if (!qr) return;
    
    editingQuickReplyId = id;
    document.getElementById('editQuickReplyTitle').textContent = 'Editar Mensagem Rápida';
    document.getElementById('qrShortcut').value = qr.shortcut;
    
    // Carregar blocos (ou converter legado para bloco de texto)
    if (qr.blocks && qr.blocks.length > 0) {
        _qrBlocks = JSON.parse(JSON.stringify(qr.blocks)); // deep clone
    } else if (qr.message) {
        _qrBlocks = [{ id: Date.now(), type: 'text', config: { text: qr.message } }];
    } else {
        _qrBlocks = [];
    }
    
    renderQRBlocks();
    closeQuickReplies();
    document.getElementById('editQuickReplyModal').classList.remove('hidden');
    lucide.createIcons();
}

function closeEditQuickReply() {
    document.getElementById('editQuickReplyModal').classList.add('hidden');
    editingQuickReplyId = null;
    _qrBlocks = [];
}

function saveQuickReply() {
    const shortcut = document.getElementById('qrShortcut').value.trim().toLowerCase().replace(/\s/g, '_');
    
    if (!shortcut) return alert('Preencha o atalho');
    if (_qrBlocks.length === 0) return alert('Adicione pelo menos um bloco');
    
    // Extrair texto legado para compatibilidade com atalho / no chat
    const firstText = _qrBlocks.find(b => b.type === 'text')?.config?.text || 
                      _qrBlocks.map(b => b.config?.text || b.config?.caption || `[${b.type}]`).join(' | ');
    
    if (editingQuickReplyId) {
        const qr = quickReplies.find(q => q.id === editingQuickReplyId);
        if (qr) {
            qr.shortcut = shortcut;
            qr.message = firstText;
            qr.blocks = JSON.parse(JSON.stringify(_qrBlocks));
        }
    } else {
        quickReplies.push({
            id: Date.now(),
            shortcut: shortcut,
            message: firstText,
            blocks: JSON.parse(JSON.stringify(_qrBlocks))
        });
    }
    
    localStorage.setItem('crm_quick_replies', JSON.stringify(quickReplies));
    scheduleCloudSave();
    closeEditQuickReply();
    openQuickReplies();
}

function deleteQuickReply(id) {
    if (!confirm('Excluir esta mensagem rápida?')) return;
    quickReplies = quickReplies.filter(q => q.id !== id);
    localStorage.setItem('crm_quick_replies', JSON.stringify(quickReplies));
    scheduleCloudSave();
    renderQuickRepliesList();
    lucide.createIcons();
}

function insertVariable(varName) {
    // Tentar inserir no bloco de texto focado
    const focused = document.activeElement;
    if (focused && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT') && focused.id?.startsWith('qrblock_')) {
        const s = focused.selectionStart || focused.value.length;
        focused.value = focused.value.slice(0, s) + `{{${varName}}}` + focused.value.slice(s);
        focused.focus();
        focused.selectionStart = focused.selectionEnd = s + varName.length + 4;
        // Atualizar bloco correspondente
        const blockIdx = parseInt(focused.dataset.blockIdx);
        const field = focused.dataset.field || 'text';
        if (!isNaN(blockIdx) && _qrBlocks[blockIdx]) {
            _qrBlocks[blockIdx].config[field] = focused.value;
        }
        return;
    }
}

// ============================================================================
// MOTOR DE BLOCOS PARA MENSAGENS RÁPIDAS
// ============================================================================
function toggleQRBlockMenu() {
    document.getElementById('qrAddBlockMenu').classList.toggle('hidden');
}

function addQRBlock(type) {
    const defaults = {
        text: { text: '' },
        image: { base64: null, caption: '', preview: null },
        video: { base64: null, caption: '', preview: null },
        audio: { base64: null, fileName: '' },
        poll: { title: '', options: ['', ''], selectableCount: 1 },
        sticker: { base64: null, preview: null },
        delay: { seconds: 5 },
        presence: { presenceType: 'composing', seconds: 3 }
    };
    _qrBlocks.push({ id: Date.now() + Math.random(), type, config: { ...(defaults[type] || {}) } });
    document.getElementById('qrAddBlockMenu').classList.add('hidden');
    renderQRBlocks();
}

function removeQRBlock(idx) {
    _qrBlocks.splice(idx, 1);
    renderQRBlocks();
}

function moveQRBlock(idx, dir) {
    const n = idx + dir;
    if (n < 0 || n >= _qrBlocks.length) return;
    [_qrBlocks[idx], _qrBlocks[n]] = [_qrBlocks[n], _qrBlocks[idx]];
    renderQRBlocks();
}

function updateQRBlockConfig(idx, key, val) {
    if (_qrBlocks[idx]) _qrBlocks[idx].config[key] = val;
}

function handleQRBlockImage(idx, ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (e) => { _qrBlocks[idx].config.base64 = e.target.result; _qrBlocks[idx].config.preview = e.target.result; renderQRBlocks(); };
    r.readAsDataURL(f);
}

function handleQRBlockAudio(idx, ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (e) => { _qrBlocks[idx].config.base64 = e.target.result; _qrBlocks[idx].config.fileName = f.name; renderQRBlocks(); };
    r.readAsDataURL(f);
}

function handleQRBlockSticker(idx, ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (e) => { _qrBlocks[idx].config.base64 = e.target.result; _qrBlocks[idx].config.preview = e.target.result; renderQRBlocks(); };
    r.readAsDataURL(f);
}

function handleQRBlockVideo(idx, ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (e) => { _qrBlocks[idx].config.base64 = e.target.result; _qrBlocks[idx].config.preview = f.name; renderQRBlocks(); };
    r.readAsDataURL(f);
}

function addQRPollOption(idx) {
    if (!_qrBlocks[idx] || _qrBlocks[idx].config.options.length >= 12) return;
    _qrBlocks[idx].config.options.push(''); renderQRBlocks();
}

function removeQRPollOption(idx, optIdx) {
    if (!_qrBlocks[idx] || _qrBlocks[idx].config.options.length <= 2) return;
    _qrBlocks[idx].config.options.splice(optIdx, 1); renderQRBlocks();
}

function updateQRPollOption(idx, optIdx, val) {
    if (_qrBlocks[idx]) _qrBlocks[idx].config.options[optIdx] = val;
}

function insertQRBlockVar(idx, varName) {
    const block = _qrBlocks[idx]; if (!block) return;
    const field = block.type === 'image' || block.type === 'video' ? 'caption' : 'text';
    const ta = document.getElementById(`qrblock_${block.id}`);
    if (ta) {
        const s = ta.selectionStart || ta.value.length;
        ta.value = ta.value.slice(0, s) + `{{${varName}}}` + ta.value.slice(s);
        block.config[field] = ta.value;
        ta.focus();
    } else {
        block.config[field] = (block.config[field] || '') + `{{${varName}}}`;
        renderQRBlocks();
    }
}

function renderQRBlocks() {
    const container = document.getElementById('qrBlocksContainer');
    const countEl = document.getElementById('qrBlockCount');
    if (!container) return;
    
    if (countEl) countEl.textContent = `${_qrBlocks.length} bloco${_qrBlocks.length !== 1 ? 's' : ''}`;
    
    if (_qrBlocks.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
            <i data-lucide="layers" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
            <p class="text-sm">Monte sua sequência de mensagens</p>
            <p class="text-xs mt-1">Adicione blocos: texto, imagem, áudio, enquete...</p>
        </div>`;
        lucide.createIcons();
        return;
    }
    
    container.innerHTML = _qrBlocks.map((block, idx) => renderQRBlockHTML(block, idx)).join('');
    lucide.createIcons();
}

function renderQRBlockHTML(block, idx) {
    const meta = {
        text:     { icon: 'type',        border: 'border-blue-200',    bg: 'bg-blue-50',    ic: 'text-blue-500',    label: 'Texto' },
        image:    { icon: 'image',       border: 'border-green-200',   bg: 'bg-green-50',   ic: 'text-green-500',   label: 'Imagem' },
        video:    { icon: 'video',       border: 'border-indigo-200',  bg: 'bg-indigo-50',  ic: 'text-indigo-500',  label: 'Vídeo' },
        audio:    { icon: 'mic',         border: 'border-emerald-200', bg: 'bg-emerald-50', ic: 'text-emerald-500', label: 'Áudio PTT' },
        poll:     { icon: 'bar-chart-3', border: 'border-purple-200',  bg: 'bg-purple-50',  ic: 'text-purple-500',  label: 'Enquete' },
        sticker:  { icon: 'smile',       border: 'border-amber-200',   bg: 'bg-amber-50',   ic: 'text-amber-500',   label: 'Figurinha' },
        delay:    { icon: 'timer',       border: 'border-orange-200',  bg: 'bg-orange-50',  ic: 'text-orange-500',  label: 'Delay' },
        presence: { icon: 'eye',         border: 'border-cyan-200',    bg: 'bg-cyan-50',    ic: 'text-cyan-500',    label: 'Presença' }
    };
    const m = meta[block.type] || meta.text;
    
    // Toolbar
    const toolbar = `<div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-400">#${idx + 1}</span>
            <i data-lucide="${m.icon}" class="w-4 h-4 ${m.ic}"></i>
            <span class="text-sm font-medium text-slate-700">${m.label}</span>
        </div>
        <div class="flex items-center gap-1">
            ${idx > 0 ? `<button onclick="moveQRBlock(${idx}, -1)" class="p-1 hover:bg-white rounded" title="Mover ↑"><i data-lucide="chevron-up" class="w-3.5 h-3.5 text-slate-400"></i></button>` : ''}
            ${idx < _qrBlocks.length - 1 ? `<button onclick="moveQRBlock(${idx}, 1)" class="p-1 hover:bg-white rounded" title="Mover ↓"><i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i></button>` : ''}
            <button onclick="removeQRBlock(${idx})" class="p-1 hover:bg-red-100 rounded" title="Remover"><i data-lucide="trash-2" class="w-3.5 h-3.5 text-red-400"></i></button>
        </div>
    </div>`;
    
    let content = '';
    switch (block.type) {
        case 'text':
            content = `<textarea id="qrblock_${block.id}" data-block-idx="${idx}" data-field="text" rows="3" class="input resize-none text-sm" placeholder="Mensagem... Use {{nome}} para personalizar" oninput="updateQRBlockConfig(${idx}, 'text', this.value)">${block.config.text || ''}</textarea>
            <div class="flex gap-1 mt-1 flex-wrap">
                <button onclick="insertQRBlockVar(${idx}, 'nome')" class="text-xs px-2 py-0.5 bg-slate-100 rounded hover:bg-slate-200">{{nome}}</button>
                <button onclick="insertQRBlockVar(${idx}, 'telefone')" class="text-xs px-2 py-0.5 bg-slate-100 rounded hover:bg-slate-200">{{telefone}}</button>
                <button onclick="insertQRBlockVar(${idx}, 'ultimo_pedido')" class="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200">{{ultimo_pedido}}</button>
                <button onclick="insertQRBlockVar(${idx}, 'cupom')" class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">{{cupom}}</button>
            </div>`;
            break;
        case 'image':
            content = `<input type="file" accept="image/*" class="input text-sm" onchange="handleQRBlockImage(${idx}, event)">
            ${block.config.preview ? `<img src="${block.config.preview}" class="w-16 h-16 object-cover rounded mt-2">` : ''}
            <textarea id="qrblock_${block.id}" data-block-idx="${idx}" data-field="caption" rows="2" class="input resize-none text-sm mt-2" placeholder="Legenda (opcional)..." oninput="updateQRBlockConfig(${idx}, 'caption', this.value)">${block.config.caption || ''}</textarea>`;
            break;
        case 'video':
            content = `<input type="file" accept="video/*" class="input text-sm" onchange="handleQRBlockVideo(${idx}, event)">
            ${block.config.preview ? `<p class="text-xs text-indigo-600 mt-1">🎥 ${block.config.preview}</p>` : ''}
            <textarea id="qrblock_${block.id}" data-block-idx="${idx}" data-field="caption" rows="2" class="input resize-none text-sm mt-2" placeholder="Legenda (opcional)..." oninput="updateQRBlockConfig(${idx}, 'caption', this.value)">${block.config.caption || ''}</textarea>`;
            break;
        case 'audio':
            content = `<input type="file" accept="audio/ogg,audio/mpeg,audio/mp4,audio/webm" class="input text-sm" onchange="handleQRBlockAudio(${idx}, event)">
            ${block.config.fileName ? `<p class="text-xs text-emerald-600 mt-1">🎵 ${block.config.fileName}</p>` : ''}`;
            break;
        case 'poll':
            const opts = block.config.options || ['', ''];
            content = `<input type="text" class="input text-sm mb-2" placeholder="Pergunta da enquete..." value="${block.config.title || ''}" oninput="updateQRBlockConfig(${idx}, 'title', this.value)">
            <div class="space-y-1">${opts.map((o, i) => `<div class="flex gap-1">
                <input type="text" class="input text-sm flex-1" placeholder="Opção ${i + 1}" value="${o}" oninput="updateQRPollOption(${idx}, ${i}, this.value)">
                ${opts.length > 2 ? `<button onclick="removeQRPollOption(${idx}, ${i})" class="text-red-400 hover:text-red-600 px-1"><i data-lucide="x" class="w-3 h-3"></i></button>` : ''}
            </div>`).join('')}</div>
            ${opts.length < 12 ? `<button onclick="addQRPollOption(${idx})" class="text-xs text-purple-600 mt-1 hover:text-purple-800">+ Opção</button>` : ''}`;
            break;
        case 'sticker':
            content = `<input type="file" accept="image/webp,image/png" class="input text-sm" onchange="handleQRBlockSticker(${idx}, event)">
            ${block.config.preview ? `<img src="${block.config.preview}" class="w-16 h-16 object-contain mt-2">` : ''}`;
            break;
        case 'delay':
            content = `<div class="flex items-center gap-2">
                <input type="number" min="1" max="300" class="input text-sm w-24" value="${block.config.seconds || 5}" oninput="updateQRBlockConfig(${idx}, 'seconds', parseInt(this.value))">
                <span class="text-sm text-slate-500">segundos de espera</span>
            </div>`;
            break;
        case 'presence':
            content = `<div class="flex items-center gap-2">
                <select class="input text-sm w-40" onchange="updateQRBlockConfig(${idx}, 'presenceType', this.value)">
                    <option value="composing" ${(block.config.presenceType || 'composing') === 'composing' ? 'selected' : ''}>Digitando...</option>
                    <option value="recording" ${block.config.presenceType === 'recording' ? 'selected' : ''}>Gravando áudio...</option>
                </select>
                <input type="number" min="1" max="30" class="input text-sm w-20" value="${block.config.seconds || 3}" oninput="updateQRBlockConfig(${idx}, 'seconds', parseInt(this.value))">
                <span class="text-sm text-slate-500">seg</span>
            </div>`;
            break;
    }
    
    return `<div class="p-3 rounded-xl border ${m.border} ${m.bg}">${toolbar}${content}</div>`;
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
    const blocks = qr.blocks || [];
    const blockIcons = { text: '💬', image: '🖼️', video: '🎥', audio: '🎵', poll: '📊', sticker: '✨', delay: '⏱️', presence: '👁️' };
    const previewText = blocks.length > 0 
        ? blocks.map(b => blockIcons[b.type] || '📎').join(' → ') + ` (${blocks.length} blocos)`
        : (qr.message || '').substring(0, 100) + '...';
    
    hint.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">/${qr.shortcut}</span>
            <span class="text-xs text-slate-400">Tab para usar</span>
        </div>
        <p class="text-slate-600 line-clamp-2">${previewText}</p>
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
    scheduleCloudSave();
    
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
    scheduleCloudSave();
    
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
        scheduleCloudSave();
    }
}

// ============================================================================
// GRAVAÇÃO DE ÁUDIO (PTT) - NOVA VERSÃO UX WHATSAPP STYLE
// ============================================================================
async function startAudioRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Tentar usar formato compatível com WhatsApp
        let mimeType = 'audio/webm;codecs=opus';
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
        }
        
        console.log('[Audio] Usando mimeType:', mimeType);
        
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Esconder área de input normal e mostrar área de gravação
        document.getElementById('normalInputArea').classList.add('hidden');
        document.getElementById('recordingArea').classList.remove('hidden');
        
        // Atualizar tempo
        recordingInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const min = Math.floor(elapsed / 60);
            const sec = elapsed % 60;
            document.getElementById('recordingTimer').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        }, 100);
        
        lucide.createIcons();
        
    } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
}

function stopAndPreviewAudio() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    
    clearInterval(recordingInterval);
    
    // Guardar duração
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    const min = Math.floor(duration / 60);
    const sec = duration % 60;
    
    mediaRecorder.stop();
    
    // Aguardar dados e criar preview
    setTimeout(() => {
        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);
        audioElement = new Audio(recordedAudioUrl);
        
        // Esconder área de gravação e mostrar preview
        document.getElementById('recordingArea').classList.add('hidden');
        document.getElementById('audioPreview').classList.remove('hidden');
        document.getElementById('audioDuration').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        
        // Reset progress bar
        document.getElementById('audioProgress').style.width = '0%';
        
        // Atualizar ícone do botão play
        const btnPlay = document.getElementById('btnPlayAudio');
        btnPlay.innerHTML = '<i data-lucide="play" class="w-5 h-5"></i>';
        lucide.createIcons();
        
        // Listener para progresso do áudio
        audioElement.ontimeupdate = () => {
            if (audioElement.duration) {
                const progress = (audioElement.currentTime / audioElement.duration) * 100;
                document.getElementById('audioProgress').style.width = `${progress}%`;
            }
        };
        
        audioElement.onended = () => {
            document.getElementById('audioProgress').style.width = '0%';
            btnPlay.innerHTML = '<i data-lucide="play" class="w-5 h-5"></i>';
            lucide.createIcons();
        };
        
    }, 200);
}

function playRecordedAudio() {
    if (!audioElement) return;
    
    const btnPlay = document.getElementById('btnPlayAudio');
    
    if (audioElement.paused) {
        audioElement.play();
        btnPlay.innerHTML = '<i data-lucide="pause" class="w-5 h-5"></i>';
    } else {
        audioElement.pause();
        btnPlay.innerHTML = '<i data-lucide="play" class="w-5 h-5"></i>';
    }
    lucide.createIcons();
}

function discardAudio() {
    // Limpar áudio gravado
    if (audioElement) {
        audioElement.pause();
        audioElement = null;
    }
    if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        recordedAudioUrl = null;
    }
    recordedAudioBlob = null;
    audioChunks = [];
    
    // Esconder preview e mostrar input normal
    document.getElementById('audioPreview').classList.add('hidden');
    document.getElementById('normalInputArea').classList.remove('hidden');
}

function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    clearInterval(recordingInterval);
    
    // Esconder área de gravação e mostrar input normal
    document.getElementById('recordingArea').classList.add('hidden');
    document.getElementById('normalInputArea').classList.remove('hidden');
    
    audioChunks = [];
}

async function sendRecordedAudio() {
    if (!recordedAudioBlob || !currentChatId) return;
    
    const container = document.getElementById('messagesContainer');
    const wrap = document.createElement('div');
    wrap.className = 'w-full flex justify-end opacity-50';
    wrap.innerHTML = `
        <div class="p-3 max-w-[70%] text-sm shadow-sm msg-out">
            <div class="flex items-center gap-2">
                <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>
                <span>Enviando áudio...</span>
            </div>
        </div>
    `;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
    
    try {
        // Converter para base64 - REMOVER PREFIXO data:...
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => {
                // Remover prefixo "data:audio/webm;base64," para enviar apenas o base64 puro
                const fullBase64 = reader.result;
                resolve(fullBase64); // Enviar completo, o server vai processar
            };
            reader.readAsDataURL(recordedAudioBlob);
        });
        const base64 = await base64Promise;
        
        console.log('[Audio] Enviando áudio, tamanho base64:', base64.length);
        
        const response = await fetch(`${API_BASE}/whatsapp/send-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number: currentRemoteJid || currentChatData?.remoteJid || currentChatId,
                mediaType: 'audio',
                media: base64,
                mimetype: 'audio/ogg; codecs=opus' // Formato PTT do WhatsApp
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Limpar e voltar ao estado normal
        discardAudio();
        
        setTimeout(() => loadMessages(currentRemoteJid || currentChatId), 1000);
        
    } catch (e) {
        console.error('Erro ao enviar áudio:', e);
        alert('Erro ao enviar áudio: ' + e.message);
        wrap.remove();
    }
}

// Manter compatibilidade com funções antigas (caso sejam chamadas)
async function startRecording() { startAudioRecording(); }
async function stopRecording() { stopAndPreviewAudio(); }

async function sendAudioMessage(audioBlob) {
    recordedAudioBlob = audioBlob;
    await sendRecordedAudio();
}

// ============================================================================
// FILTROS AVANÇADOS
// ============================================================================
// Atualizar a função filterChats existente para suportar novos filtros

// ============================================================================
// MODAL DE PRODUTOS (CATÁLOGO COM ESTOQUE + LINKS)
// ============================================================================
let productSearchTerm = '';
let productStockFilter = 'all'; // 'all', 'inStock', 'outOfStock'
let productViewMode = 'list'; // 'list', 'grid'

function openProductModal() {
    document.getElementById('productModal').classList.remove('hidden');
    productSearchTerm = '';
    productStockFilter = 'all';
    const searchInput = document.getElementById('productSearch');
    if (searchInput) searchInput.value = '';
    updateProductCountLabel();
    applyProductFilters();
}

function closeProductModal() {
    document.getElementById('productModal').classList.add('hidden');
}

function updateProductCountLabel() {
    const label = document.getElementById('productCountLabel');
    if (!label) return;
    const total = allProducts.length;
    const inStock = allProducts.filter(p => p.estoque === -1 || p.estoque > 0).length;
    const outStock = allProducts.filter(p => p.estoque === 0).length;
    label.textContent = `${total} produtos${outStock > 0 ? ` · ${outStock} sem estoque` : ''}`;
}

function searchProducts(query) {
    productSearchTerm = query;
    applyProductFilters();
}

function filterProductStock(filter) {
    productStockFilter = filter;
    // Atualizar UI dos botões
    ['All', 'InStock', 'OutOfStock'].forEach(f => {
        const btn = document.getElementById(`stockFilter${f}`);
        if (!btn) return;
        if (f.toLowerCase().replace('of', 'Of') === filter || (f === 'All' && filter === 'all') ||
            (f === 'InStock' && filter === 'inStock') || (f === 'OutOfStock' && filter === 'outOfStock')) {
            btn.className = 'px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 transition hover:bg-emerald-200';
        } else {
            btn.className = 'px-3 py-1.5 rounded-full text-xs font-medium bg-white text-slate-500 border border-slate-200 transition hover:bg-slate-100';
        }
    });
    applyProductFilters();
}

function toggleProductView() {
    productViewMode = productViewMode === 'list' ? 'grid' : 'list';
    const btn = document.getElementById('productViewToggle');
    if (btn) {
        btn.innerHTML = productViewMode === 'list'
            ? '<i data-lucide="layout-grid" class="w-3.5 h-3.5"></i> Grade'
            : '<i data-lucide="list" class="w-3.5 h-3.5"></i> Lista';
    }
    applyProductFilters();
}

function applyProductFilters() {
    let filtered = [...allProducts];
    
    // Filtro de busca
    if (productSearchTerm) {
        const term = productSearchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            (p.nome || '').toLowerCase().includes(term) ||
            (p.referencia || '').toLowerCase().includes(term) ||
            (p.codigo || '').toLowerCase().includes(term) ||
            (p.sku || '').toLowerCase().includes(term)
        );
    }
    
    // Filtro de estoque
    if (productStockFilter === 'inStock') {
        filtered = filtered.filter(p => p.estoque === -1 || p.estoque > 0);
    } else if (productStockFilter === 'outOfStock') {
        filtered = filtered.filter(p => p.estoque === 0);
    }
    
    // Atualizar contador da busca
    const countEl = document.getElementById('productSearchCount');
    if (countEl) {
        countEl.textContent = productSearchTerm ? `${filtered.length} encontrados` : '';
    }
    
    renderProductList(filtered);
}

function renderProductList(products) {
    const container = document.getElementById('productsListModal');
    if (products.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="text-4xl mb-3">📦</div>
                <p class="text-slate-500 font-medium">Nenhum produto encontrado</p>
                <p class="text-sm text-slate-400 mt-1">Tente buscar com outros termos</p>
            </div>`;
        return;
    }
    
    if (productViewMode === 'grid') {
        renderProductGrid(products, container);
    } else {
        renderProductListView(products, container);
    }
    
    if (window.lucide) lucide.createIcons();
}

function renderProductListView(products, container) {
    container.innerHTML = products.map((p, idx) => {
        const preco = parseFloat(p.preco || 0);
        const imagem = p.imagem || 'https://via.placeholder.com/60x60?text=Sem+Foto';
        const nome = p.nome || 'Produto sem nome';
        const link = p.link_oficial || '#';
        const estoque = p.estoque ?? -1;
        const ref = p.referencia || '';
        const isOutOfStock = estoque === 0;
        
        // Badge de estoque
        let stockBadge = '';
        if (estoque === 0) {
            stockBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Sem estoque</span>';
        } else if (estoque > 0 && estoque <= 5) {
            stockBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Últimas ${estoque} un.</span>`;
        } else if (estoque > 5) {
            stockBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">${estoque} em estoque</span>`;
        }
        
        return `
        <div class="flex items-center gap-3 p-3 border rounded-xl ${isOutOfStock ? 'bg-slate-50 opacity-60 border-slate-200' : 'hover:bg-slate-50 border-slate-200 hover:border-emerald-300'} transition group" data-product-idx="${idx}">
            <div class="relative flex-shrink-0">
                <img src="${imagem}"
                     onerror="this.src='https://via.placeholder.com/60x60?text=Sem+Foto'"
                     class="w-16 h-16 object-cover rounded-xl border border-slate-200"
                     alt="${escapeHtml(nome)}">
                ${isOutOfStock ? '<div class="absolute inset-0 bg-white/50 rounded-xl flex items-center justify-center"><span class="text-xs font-bold text-red-500">ESGOTADO</span></div>' : ''}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                    <h5 class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(nome)}</h5>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-base font-bold ${isOutOfStock ? 'text-slate-400 line-through' : 'text-emerald-600'}">R$ ${preco.toFixed(2)}</span>
                    ${stockBadge}
                    ${ref ? `<span class="text-xs text-slate-400">Ref: ${escapeHtml(ref)}</span>` : ''}
                </div>
            </div>
            <div class="flex flex-col gap-1.5 flex-shrink-0">
                ${!isOutOfStock ? `
                    <button onclick="sendProductToChat(${idx})"
                            class="bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-emerald-700 transition flex items-center gap-1.5"
                            title="Enviar com foto + link">
                        <i data-lucide="send" class="w-3.5 h-3.5"></i>
                        Enviar Link
                    </button>
                    <button onclick="copyProductLink(${idx})"
                            class="bg-white text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-100 transition flex items-center gap-1.5"
                            title="Copiar link">
                        <i data-lucide="link" class="w-3 h-3"></i>
                        Copiar
                    </button>
                ` : `
                    <span class="text-xs text-red-400 font-medium text-center py-2">Indisponível</span>
                `}
            </div>
        </div>`;
    }).join('');
}

function renderProductGrid(products, container) {
    container.innerHTML = '<div class="grid grid-cols-3 gap-3">' + products.map((p, idx) => {
        const preco = parseFloat(p.preco || 0);
        const imagem = p.imagem || 'https://via.placeholder.com/150x150?text=Sem+Foto';
        const nome = p.nome || 'Produto sem nome';
        const estoque = p.estoque ?? -1;
        const isOutOfStock = estoque === 0;
        
        return `
        <div class="border rounded-xl overflow-hidden ${isOutOfStock ? 'opacity-50' : 'hover:shadow-md hover:border-emerald-300'} transition group">
            <div class="relative">
                <img src="${imagem}"
                     onerror="this.src='https://via.placeholder.com/150x150?text=Sem+Foto'"
                     class="w-full h-36 object-cover"
                     alt="${escapeHtml(nome)}">
                ${isOutOfStock ? '<div class="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">ESGOTADO</div>' : ''}
                ${!isOutOfStock && estoque > 0 && estoque <= 5 ? `<div class="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">Últimas ${estoque}</div>` : ''}
            </div>
            <div class="p-2.5">
                <h5 class="font-medium text-xs text-slate-800 truncate mb-1">${escapeHtml(nome)}</h5>
                <p class="text-sm font-bold ${isOutOfStock ? 'text-slate-400 line-through' : 'text-emerald-600'} mb-2">R$ ${preco.toFixed(2)}</p>
                ${!isOutOfStock ? `
                    <button onclick="sendProductToChat(${idx})"
                            class="w-full bg-emerald-600 text-white py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 transition flex items-center justify-center gap-1">
                        <i data-lucide="send" class="w-3 h-3"></i>
                        Enviar
                    </button>
                ` : '<p class="text-center text-xs text-red-400 py-1.5">Indisponível</p>'}
            </div>
        </div>`;
    }).join('') + '</div>';
}

/**
 * Enviar produto ao chat com imagem + mensagem formatada
 * @param {number} idx - Índice do produto no array filtrado
 */
async function sendProductToChat(idx) {
    // Pegar produto da lista atualmente filtrada
    let filtered = [...allProducts];
    if (productSearchTerm) {
        const term = productSearchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            (p.nome || '').toLowerCase().includes(term) ||
            (p.referencia || '').toLowerCase().includes(term) ||
            (p.codigo || '').toLowerCase().includes(term) ||
            (p.sku || '').toLowerCase().includes(term)
        );
    }
    if (productStockFilter === 'inStock') {
        filtered = filtered.filter(p => p.estoque === -1 || p.estoque > 0);
    } else if (productStockFilter === 'outOfStock') {
        filtered = filtered.filter(p => p.estoque === 0);
    }
    
    const product = filtered[idx];
    if (!product) { alert('Produto não encontrado'); return; }
    
    if (!currentChatId) {
        alert('Selecione uma conversa primeiro');
        return;
    }
    
    // Verificar estoque
    if (product.estoque === 0) {
        if (!confirm('Este produto está SEM ESTOQUE. Deseja enviar mesmo assim?')) return;
    }
    
    closeProductModal();
    
    const nome = product.nome || 'Produto';
    const preco = parseFloat(product.preco || 0);
    const link = product.link_oficial || '#';
    const imagem = product.imagem || '';
    
    // Nome do cliente para personalizar
    const clientName = currentChatData?.pushName?.split(' ')[0] ||
                       currentClient?.nome?.split(' ')[0] || '';
    const greeting = clientName ? `Oi ${clientName}! ` : '';
    
    // Template profissional — link ISOLADO na última linha para gerar prévia visual do WhatsApp
    const message = `${greeting}Olha que linda essa opção! ✨\n\n*${nome}*\nPor apenas *R$ ${preco.toFixed(2)}*\n\nVeja mais detalhes e feche seu pedido aqui 👇\n\n${link}`;
    
    try {
        const remoteJid = currentChatData?.remoteJid || currentChatId || currentRemoteJid;
        if (!remoteJid) throw new Error('Nenhum chat aberto para enviar o produto');
        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        
        // Enviar como TEXTO puro para que o WhatsApp gere a prévia automática do link
        const response = await fetch(`${API_BASE}/whatsapp/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number: phoneNumber,
                text: message
            })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        
        showToast(`Produto "${nome}" enviado!`, 'success');
        setTimeout(() => loadMessages(currentRemoteJid), 1500);
        
    } catch (error) {
        console.error('Erro ao enviar produto:', error);
        showToast('Erro ao enviar: ' + error.message, 'error');
    }
}

/**
 * Copiar link do produto para a área de transferência
 */
function copyProductLink(idx) {
    let filtered = [...allProducts];
    if (productSearchTerm) {
        const term = productSearchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            (p.nome || '').toLowerCase().includes(term) ||
            (p.referencia || '').toLowerCase().includes(term) ||
            (p.codigo || '').toLowerCase().includes(term) ||
            (p.sku || '').toLowerCase().includes(term)
        );
    }
    if (productStockFilter === 'inStock') {
        filtered = filtered.filter(p => p.estoque === -1 || p.estoque > 0);
    } else if (productStockFilter === 'outOfStock') {
        filtered = filtered.filter(p => p.estoque === 0);
    }
    
    const product = filtered[idx];
    if (!product) return;
    
    const link = product.link_oficial || '#';
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link copiado!', 'success');
    }).catch(() => {
        // Fallback
        const input = document.getElementById('inputMessage');
        if (input) {
            input.value += (input.value ? ' ' : '') + link;
            input.focus();
        }
    });
}

// Compatibilidade com chamadas antigas
async function sendProductMessage(name, preco, imageUrl, link) {
    if (!currentChatId) { alert('Nenhuma conversa selecionada'); return; }
    closeProductModal();
    try {
        // Enviar como TEXTO puro — link isolado na última linha para gerar prévia do WhatsApp
        const message = `Olha que linda essa opção! ✨\n\n*${name}*\nPor apenas *R$ ${parseFloat(preco).toFixed(2)}*\n\nVeja mais detalhes e feche seu pedido aqui 👇\n\n${link}`;
        const phoneNumber = (currentChatData?.remoteJid || currentChatId || currentRemoteJid).replace('@s.whatsapp.net', '').replace('@g.us', '');
        const response = await fetch(`${API_BASE}/whatsapp/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: phoneNumber, text: message })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        showToast(`Produto "${name}" enviado!`, 'success');
        setTimeout(() => loadMessages(currentRemoteJid), 1500);
    } catch (error) {
        console.error('Erro ao enviar produto:', error);
        showToast('Erro ao enviar: ' + error.message, 'error');
    }
}

async function sendProductLink(name, link) {
    closeProductModal();
    const input = document.getElementById('inputMessage');
    const originalText = input.value;
    input.value = `Olha esse produto: *${name}*\n\n${link}`;
    await sendMessage();
    if (originalText) input.value = originalText;
}

// Helpers
function escapeHtml(text) {
    if (text == null) return '';
    return String(text).replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

/**
 * Mostrar detalhes de um pedido no painel lateral do CRM
 * Chamado quando o usuário clica no botão de pedido dentro das mensagens
 */
function showOrderDetails(orderId) {
    const panel = document.getElementById('crmDataContainer');
    if (!panel) return;
    
    // Buscar pedido nos dados locais
    const order = allOrders.find(o => String(o.id) === String(orderId));
    
    if (!order) {
        // Tentar buscar do servidor
        panel.innerHTML = `
            <div class="space-y-4">
                <div class="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 class="font-bold text-purple-800 flex items-center gap-2 mb-2">
                        <i data-lucide="receipt" class="w-5 h-5"></i>
                        Pedido #${escapeHtml(orderId)}
                    </h4>
                    <p class="text-sm text-purple-600">Pedido não encontrado no cache local.</p>
                    <p class="text-xs text-purple-500 mt-1">Tente sincronizar os dados primeiro.</p>
                </div>
                <button onclick="findAndRenderClientCRM(currentRemoteJid)" class="w-full btn btn-secondary text-sm">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>
                    Voltar para dados do cliente
                </button>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    // Dados do pedido
    const items = order.itens || order.products || order.produtos || [];
    const total = parseFloat(order.valor_total || order.total || 0);
    const date = order.data ? new Date(order.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Data desconhecida';
    const status = order.status || order.situacao || 'Desconhecido';
    
    // Status badge
    const statusMap = {
        'Pago': { color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
        'Aprovado': { color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
        'Concluído': { color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
        'Pendente': { color: 'bg-amber-100 text-amber-700', icon: '⏳' },
        'Cancelado': { color: 'bg-red-100 text-red-700', icon: '❌' },
        'Enviado': { color: 'bg-blue-100 text-blue-700', icon: '📦' },
    };
    const statusInfo = statusMap[status] || { color: 'bg-slate-100 text-slate-600', icon: '📋' };
    
    // Itens HTML
    const itemsHtml = items.map(item => {
        const nome = item.nome || item.name || item.produto || 'Produto';
        const qty = parseInt(item.quantidade || item.qty || 1);
        const preco = parseFloat(item.preco || item.preco_unitario || item.valor || 0);
        const variacao = item.variacao || item.variant || '';
        
        return `
            <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <div class="flex-1 min-w-0">
                    <p class="text-sm text-slate-800 truncate">${escapeHtml(nome)}</p>
                    ${variacao ? `<p class="text-xs text-slate-400">${escapeHtml(variacao)}</p>` : ''}
                </div>
                <div class="text-right ml-3">
                    <p class="text-sm font-medium text-slate-700">${qty}x</p>
                    <p class="text-xs text-slate-500">R$ ${preco.toFixed(2)}</p>
                </div>
            </div>
        `;
    }).join('');
    
    // Dados do cliente do pedido
    const clienteNome = order.cliente?.nome || order.cliente_nome || '';
    
    panel.innerHTML = `
        <div class="space-y-4">
            <!-- Header do Pedido -->
            <div class="bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl p-4 text-white">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-lg">Pedido #${escapeHtml(orderId)}</h3>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}">${statusInfo.icon} ${escapeHtml(status)}</span>
                </div>
                <p class="text-sm opacity-90">${date}</p>
                ${clienteNome ? `<p class="text-sm opacity-80 mt-1">${escapeHtml(clienteNome)}</p>` : ''}
            </div>
            
            <!-- Total -->
            <div class="bg-slate-50 rounded-xl p-4 text-center">
                <p class="text-xs text-slate-500 mb-1">Valor Total</p>
                <p class="text-2xl font-bold text-emerald-600">R$ ${total.toFixed(2)}</p>
                <p class="text-xs text-slate-400 mt-1">${items.length} ${items.length === 1 ? 'item' : 'itens'}</p>
            </div>
            
            <!-- Itens -->
            <div class="border border-slate-200 rounded-xl p-3">
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-3">
                    <i data-lucide="package" class="w-4 h-4 text-purple-500"></i>
                    Itens do Pedido
                </h4>
                <div class="max-h-48 overflow-y-auto">
                    ${itemsHtml || '<p class="text-xs text-slate-400 text-center py-2">Sem itens detalhados</p>'}
                </div>
            </div>
            
            <!-- Ações -->
            <div class="flex gap-2">
                <button onclick="findAndRenderClientCRM(currentRemoteJid)" class="flex-1 btn btn-secondary text-xs">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>
                    Voltar ao Cliente
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// ============================================================================
// PLAYER DE ÁUDIO ESTILO WHATSAPP
// ============================================================================

const audioPlayers = {}; // Armazena instâncias de áudio ativas

function pauseAllAudios() {
    // Pausar todos os áudios ativos — aguardando play() pendentes para evitar
    // "The play() request was interrupted by a call to pause()"
    Object.keys(audioPlayers).forEach(id => {
        const audio = audioPlayers[id];
        if (!audio) { delete audioPlayers[id]; return; }
        
        try {
            // Se há uma Promise de play() pendente, aguardar antes de pausar
            if (audio._playPromise) {
                audio._playPromise
                    .then(() => { audio.pause(); })
                    .catch(() => {}); // já foi interrompido, ignorar
                audio._playPromise = null;
            } else if (!audio.paused) {
                audio.pause();
            }
        } catch (e) {
            // Elemento já foi removido do DOM
        }
        delete audioPlayers[id];
    });
    
    // Resetar ícones de todos os players visíveis
    document.querySelectorAll('.audio-player-whatsapp').forEach(player => {
        const playIcon = player.querySelector('.play-icon');
        const pauseIcon = player.querySelector('.pause-icon');
        if (playIcon) playIcon.classList.remove('hidden');
        if (pauseIcon) pauseIcon.classList.add('hidden');
    });
}

function toggleAudioPlay(audioId, audioUrl) {
    const audioEl = document.getElementById(audioId);
    const playerDiv = document.querySelector(`[data-audio-id="${audioId}"]`);
    if (!audioEl || !playerDiv) return;
    
    const playIcon = playerDiv.querySelector('.play-icon');
    const pauseIcon = playerDiv.querySelector('.pause-icon');
    
    // Pausar todos os outros áudios (com proteção contra race condition)
    Object.keys(audioPlayers).forEach(id => {
        if (id !== audioId && audioPlayers[id]) {
            const other = audioPlayers[id];
            if (other._playPromise) {
                other._playPromise
                    .then(() => { other.pause(); })
                    .catch(() => {});
                other._playPromise = null;
            } else if (!other.paused) {
                other.pause();
            }
            const otherPlayer = document.querySelector(`[data-audio-id="${id}"]`);
            if (otherPlayer) {
                otherPlayer.querySelector('.play-icon')?.classList.remove('hidden');
                otherPlayer.querySelector('.pause-icon')?.classList.add('hidden');
            }
        }
    });
    
    // Toggle play/pause
    if (audioEl.paused) {
        // Guardar referência ANTES do play para tracking
        audioPlayers[audioId] = audioEl;
        
        const playPromise = audioEl.play();
        
        if (playPromise !== undefined) {
            // Armazenar promise no próprio elemento para referência futura
            audioEl._playPromise = playPromise;
            
            playPromise.then(() => {
                audioEl._playPromise = null; // Limpar promise resolvida
                
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
                
                // Atualizar progresso
                audioEl.ontimeupdate = () => updateAudioProgress(audioId);
                audioEl.onended = () => {
                    playIcon.classList.remove('hidden');
                    pauseIcon.classList.add('hidden');
                    if (playerDiv.querySelector('.audio-progress')) {
                        playerDiv.querySelector('.audio-progress').style.width = '0%';
                    }
                    if (playerDiv.querySelector('.audio-time')) {
                        playerDiv.querySelector('.audio-time').textContent = '0:00';
                    }
                    delete audioPlayers[audioId];
                };
            }).catch(error => {
                audioEl._playPromise = null;
                // Silenciar "interrupted by pause" — é esperado quando o usuário troca de áudio
                if (error.name !== 'AbortError') {
                    console.warn('[Audio] Erro inesperado:', error.message);
                }
                // Restaurar ícones pro estado "parado"
                playIcon?.classList.remove('hidden');
                pauseIcon?.classList.add('hidden');
            });
        }
    } else {
        // Aguardar play promise pendente antes de pausar
        if (audioEl._playPromise) {
            audioEl._playPromise
                .then(() => { audioEl.pause(); })
                .catch(() => {});
            audioEl._playPromise = null;
        } else {
            audioEl.pause();
        }
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
}

function updateAudioProgress(audioId) {
    const audioEl = document.getElementById(audioId);
    const playerDiv = document.querySelector(`[data-audio-id="${audioId}"]`);
    if (!audioEl || !playerDiv) return;
    
    const progress = (audioEl.currentTime / audioEl.duration) * 100;
    const progressBar = playerDiv.querySelector('.audio-progress');
    const timeDisplay = playerDiv.querySelector('.audio-time');
    
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    if (timeDisplay) {
        const minutes = Math.floor(audioEl.currentTime / 60);
        const seconds = Math.floor(audioEl.currentTime % 60);
        timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

function seekAudio(event, audioId) {
    const audioEl = document.getElementById(audioId);
    const progressBar = event.currentTarget;
    if (!audioEl || !progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    audioEl.currentTime = audioEl.duration * percentage;
}

function changePlaybackSpeed(audioId) {
    const audioEl = document.getElementById(audioId);
    const playerDiv = document.querySelector(`[data-audio-id="${audioId}"]`);
    const speedBtn = playerDiv?.querySelector('.audio-speed');
    
    if (!audioEl || !speedBtn) return;
    
    const speeds = [1, 1.5, 2];
    const currentSpeed = audioEl.playbackRate;
    const currentIndex = speeds.indexOf(currentSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    
    audioEl.playbackRate = nextSpeed;
    speedBtn.textContent = `${nextSpeed}x`;
}

// ============================================================================
// SISTEMA DE CAMPANHAS
// ============================================================================
// ============================================================================
// MOTOR DE DISPAROS VEXX — Blocos de Campanha + Envio Rápido
// ============================================================================

let allCampaigns = JSON.parse(localStorage.getItem('crm_campaigns') || '[]');
let selectedAudience = null;
let currentCampaignFilter = 'all';
let campaignBlocks = []; // Array de blocos de ações
let blockCounter = 0;
let savedScripts = JSON.parse(localStorage.getItem('crm_scripts') || '[]');


// Alternar entre Views
function switchView(view) {
    const viewChats = document.getElementById('viewChats');
    const viewCampaigns = document.getElementById('viewCampaigns');
    const tabChats = document.getElementById('tabChats');
    const tabCampaigns = document.getElementById('tabCampaigns');
    
    if (view === 'chats') {
        viewChats.classList.remove('hidden');
        viewCampaigns.classList.add('hidden');
        tabChats.classList.add('bg-white', 'text-emerald-700', 'shadow-sm');
        tabChats.classList.remove('text-slate-500');
        tabCampaigns.classList.remove('bg-white', 'text-purple-700', 'shadow-sm');
        tabCampaigns.classList.add('text-slate-500');
    } else {
        viewChats.classList.add('hidden');
        viewCampaigns.classList.remove('hidden');
        tabCampaigns.classList.add('bg-white', 'text-purple-700', 'shadow-sm');
        tabCampaigns.classList.remove('text-slate-500');
        tabChats.classList.remove('bg-white', 'text-emerald-700', 'shadow-sm');
        tabChats.classList.add('text-slate-500');
        
        // Carregar dados das campanhas
        loadCampaignData();
        renderCampaigns();
        updateCampaignStats();
        lucide.createIcons();
    }
}

async function loadCampaignData() {
    try {
        // Atualizar contagens
        document.getElementById('countAll').textContent = `${allClients.length} contatos`;
        
        // Calcular inativos (90+ dias)
        try {
            const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
            const inactive = allClients.filter(c => {
                const clientOrders = (allOrders || []).filter(o => o.cliente_id == c.id).sort((a,b) => new Date(b.data) - new Date(a.data));
                if (clientOrders.length === 0) return true;
                return new Date(clientOrders[0].data).getTime() < ninetyDaysAgo;
            });
            document.getElementById('countInactive').textContent = `${inactive.length} contatos`;
        } catch(e) { console.warn('[Campanha] Erro ao calcular inativos:', e); }
        
        // VIPs (ticket médio > 500)
        try {
            const vips = allClients.filter(c => {
                const clientOrders = (allOrders || []).filter(o => o.cliente_id == c.id);
                const total = clientOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
                const avg = clientOrders.length > 0 ? total / clientOrders.length : 0;
                return avg >= 500;
            });
            document.getElementById('countVip').textContent = `${vips.length} contatos`;
        } catch(e) { console.warn('[Campanha] Erro ao calcular VIPs:', e); }
        
        // Carregar grupos no seletor — usar isGroup flag (mais confiável que testar remoteJid)
        const groups = (allChats || []).filter(c => c.isGroup || (c.remoteJid && c.remoteJid.includes('@g.us')) || (c.id && String(c.id).includes('@g.us')));
        console.log(`[Campanha] Grupos encontrados: ${groups.length} de ${allChats.length} chats`);
        
        const checkboxContainer = document.getElementById('groupCheckboxes');
        if (checkboxContainer) {
            if (groups.length === 0) {
                checkboxContainer.innerHTML = '<p class="text-sm text-slate-400">Nenhum grupo encontrado</p>';
            } else {
                checkboxContainer.innerHTML = groups.map(g => {
                    const groupJid = g.remoteJid || g.id || '';
                    const groupName = g.name || g.subject || formatPhone(groupJid);
                    const count = g.participantsCount || g.size || '?';
                    return `<label class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                        <input type="checkbox" class="group-checkbox w-4 h-4 rounded text-emerald-500" value="${groupJid}" data-name="${groupName}" onchange="updateSelectedGroupsCount()">
                        <span class="text-sm text-slate-700 flex-1 truncate">👥 ${groupName}</span>
                        <span class="text-xs text-slate-400">${count} membros</span>
                    </label>`;
                }).join('');
            }
        }

        const countGroupsEl = document.getElementById('countGroups');
        if (countGroupsEl) countGroupsEl.textContent = `${groups.length} grupos disponíveis`;
        
        // Se allChats ainda vazio, tentar carregar do servidor
        if (allChats.length === 0) {
            console.warn('[Campanha] allChats vazio, recarregando...');
            await loadChats();
            // Re-executar após carregar
            const freshGroups = (allChats || []).filter(c => c.isGroup || (c.remoteJid && c.remoteJid.includes('@g.us')));
            if (freshGroups.length > 0 && checkboxContainer) {
                checkboxContainer.innerHTML = freshGroups.map(g => {
                    const groupJid = g.remoteJid || g.id || '';
                    const groupName = g.name || g.subject || formatPhone(groupJid);
                    const count = g.participantsCount || g.size || '?';
                    return `<label class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                        <input type="checkbox" class="group-checkbox w-4 h-4 rounded text-emerald-500" value="${groupJid}" data-name="${groupName}" onchange="updateSelectedGroupsCount()">
                        <span class="text-sm text-slate-700 flex-1 truncate">👥 ${groupName}</span>
                        <span class="text-xs text-slate-400">${count} membros</span>
                    </label>`;
                }).join('');
                console.log(`[Campanha] Grupos após reload: ${freshGroups.length}`);
            }
        }
    } catch (e) {
        console.error('Erro ao carregar dados para campanhas:', e);
    }
}

function selectAudience(type) {
    selectedAudience = type;
    document.getElementById('groupSelector').classList.toggle('hidden', type !== 'group');
    updateCampaignSummary();
    previewAudienceSegment(type);
}

function selectAudienceFromSelect(type) {
    selectAudience(type);
    if (type) loadCampaignData();
}

// ============================================================================
// NORMALIZAÇÃO DE TELEFONES BR (55 + DDD + nono dígito)
// ============================================================================

function normalizePhoneBR(phone) {
    if (!phone) return null;
    // Grupos: manter como está
    if (phone.includes('@g.us')) return phone;
    
    let digits = phone.replace(/\D/g, '');
    
    // Remover +55 duplicado
    if (digits.startsWith('55') && digits.length >= 12) {
        digits = digits; // Já com DDI
    } else if (digits.length === 11) {
        // DDD + 9 + 8 dígitos (celular com nono dígito)
        digits = '55' + digits;
    } else if (digits.length === 10) {
        // DDD + 8 dígitos (celular sem nono dígito) — adicionar 9
        const ddd = digits.substring(0, 2);
        const number = digits.substring(2);
        digits = '55' + ddd + '9' + number;
    } else if (digits.length === 8 || digits.length === 9) {
        // Sem DDD — impossível normalizar com certeza, retornar com aviso
        return null;
    }
    
    // Validação final: deve ter 12 ou 13 dígitos
    if (digits.length < 12 || digits.length > 13) return null;
    
    return digits;
}

// ============================================================================
// MOTOR DE SEGMENTAÇÃO INTELIGENTE
// ============================================================================

function buildSegmentContacts(segmentType) {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    
    // Pré-calcular dados de pedidos por cliente
    const clientOrderMap = {};
    (allOrders || []).forEach(o => {
        const cid = o.cliente_id || o.client_id;
        if (!cid) return;
        if (!clientOrderMap[cid]) clientOrderMap[cid] = [];
        clientOrderMap[cid].push(o);
    });
    
    // Média global de ticket para segmento "ticket_alto"
    let globalAvgTicket = 0;
    if (allOrders && allOrders.length > 0) {
        const totalRevenue = allOrders.reduce((s, o) => s + parseFloat(o.total || o.valor || 0), 0);
        globalAvgTicket = totalRevenue / allOrders.length;
    }
    
    let filtered = [];
    
    switch (segmentType) {
        case 'all':
            filtered = allClients;
            break;
            
        case 'inactive_300':
            // Clientes cuja última compra foi há mais de 300 dias
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                if (orders.length === 0) return true; // Nunca comprou = inativo
                const lastDate = Math.max(...orders.map(o => new Date(o.data || o.created_at).getTime()));
                return (now - lastDate) > (300 * DAY);
            });
            break;
            
        case 'inactive_90':
        case 'inactive':
            // Inativos entre 90 e 300 dias
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                if (orders.length === 0) return true;
                const lastDate = Math.max(...orders.map(o => new Date(o.data || o.created_at).getTime()));
                const daysSince = (now - lastDate) / DAY;
                return daysSince >= 90 && daysSince <= 300;
            });
            break;
            
        case 'ticket_alto':
            // Clientes cujo ticket médio é acima da média global da loja
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                if (orders.length === 0) return false;
                const totalSpent = orders.reduce((s, o) => s + parseFloat(o.total || o.valor || 0), 0);
                const avgTicket = totalSpent / orders.length;
                return avgTicket > globalAvgTicket;
            });
            break;
            
        case 'risco':
            // Risco de churn: clientes com LTV caindo (última compra menor que a média deles)
            // OU clientes com histórico que não compram há 60-180 dias
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                if (orders.length < 2) return false; // Precisa de histórico
                
                const sorted = [...orders].sort((a, b) => new Date(a.data || a.created_at) - new Date(b.data || b.created_at));
                const lastOrder = sorted[sorted.length - 1];
                const lastDate = new Date(lastOrder.data || lastOrder.created_at).getTime();
                const daysSince = (now - lastDate) / DAY;
                
                // Condição 1: Não compra há 60-180 dias (zona de risco)
                const inRiskWindow = daysSince >= 60 && daysSince <= 180;
                
                // Condição 2: Última compra menor que a média (LTV caindo)
                const totalSpent = orders.reduce((s, o) => s + parseFloat(o.total || o.valor || 0), 0);
                const avgValue = totalSpent / orders.length;
                const lastValue = parseFloat(lastOrder.total || lastOrder.valor || 0);
                const ltvDropping = lastValue < avgValue * 0.7; // 30% abaixo da média
                
                return inRiskWindow || ltvDropping;
            });
            break;
            
        case 'vip':
            // Ticket médio >= R$500
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                if (orders.length === 0) return false;
                const totalSpent = orders.reduce((s, o) => s + parseFloat(o.total || o.valor || 0), 0);
                return (totalSpent / orders.length) >= 500;
            });
            break;
            
        case 'novos':
            // Cadastrados ou primeira compra nos últimos 30 dias
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                if (orders.length === 0) {
                    // Verificar data de cadastro se disponível
                    const createdAt = c.created_at || c.criado_em;
                    return createdAt && (now - new Date(createdAt).getTime()) <= (30 * DAY);
                }
                const firstDate = Math.min(...orders.map(o => new Date(o.data || o.created_at).getTime()));
                return (now - firstDate) <= (30 * DAY);
            });
            break;
            
        case 'recorrentes':
            // 3 ou mais pedidos
            filtered = allClients.filter(c => {
                const orders = clientOrderMap[c.id] || [];
                return orders.length >= 3;
            });
            break;
            
        default:
            filtered = [];
    }
    
    // Converter para formato de contato + normalizar telefone
    const contacts = [];
    const invalidPhones = [];
    
    for (const c of filtered) {
        const rawPhone = c.telefone || c.celular || c.phone || '';
        const normalized = normalizePhoneBR(rawPhone);
        
        if (normalized) {
            contacts.push({
                id: c.id,
                name: c.nome || c.name || 'Cliente',
                phone: normalized,
                rawPhone: rawPhone,
                cidade: c.cidade || c.city || ''
            });
        } else if (rawPhone) {
            invalidPhones.push({ name: c.nome || c.name, phone: rawPhone });
        }
    }
    
    return { contacts, invalidPhones, totalFiltered: filtered.length };
}

// Preview do segmento selecionado
function previewAudienceSegment(segmentType) {
    const previewDiv = document.getElementById('audiencePreview');
    if (!previewDiv || !segmentType || segmentType === 'group') {
        if (previewDiv) previewDiv.classList.add('hidden');
        return;
    }
    
    const segmentLabels = {
        all: 'Todos os Clientes',
        inactive_300: 'Inativos +300 dias',
        inactive_90: 'Inativos 90-300 dias',
        inactive: 'Inativos 90-300 dias',
        ticket_alto: 'Ticket Alto (acima da média)',
        risco: 'Risco de Churn',
        vip: 'VIP (ticket R$500+)',
        novos: 'Novos (últimos 30 dias)',
        recorrentes: 'Recorrentes (3+ pedidos)'
    };
    
    const { contacts, invalidPhones, totalFiltered } = buildSegmentContacts(segmentType);
    
    previewDiv.classList.remove('hidden');
    document.getElementById('audiencePreviewTitle').textContent = segmentLabels[segmentType] || segmentType;
    document.getElementById('audiencePreviewCount').textContent = `${contacts.length} leads válidos`;
    
    const listDiv = document.getElementById('audiencePreviewList');
    if (contacts.length === 0) {
        listDiv.innerHTML = '<p class="text-amber-600">Nenhum lead encontrado neste segmento.</p>';
    } else {
        const sample = contacts.slice(0, 8);
        let html = sample.map(c => 
            `<div class="flex justify-between"><span>${escapeHtml(c.name)}</span><span class="text-slate-400">${c.phone}</span></div>`
        ).join('');
        if (contacts.length > 8) {
            html += `<div class="text-slate-400 font-medium mt-1">... e mais ${contacts.length - 8} leads</div>`;
        }
        if (invalidPhones.length > 0) {
            html += `<div class="text-amber-500 mt-2 font-medium">⚠ ${invalidPhones.length} telefone(s) inválido(s) removido(s)</div>`;
        }
        listDiv.innerHTML = html;
    }
}

// Atalho rápido da sidebar
function quickSegmentCampaign(segmentType) {
    openNewCampaign();
    // Selecionar no combo
    const sel = document.getElementById('campaignAudienceSelect');
    if (sel) {
        sel.value = segmentType;
        selectAudienceFromSelect(segmentType);
    }
}

function toggleAllGroups() {
    const checkboxes = document.querySelectorAll('.group-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateSelectedGroupsCount();
}

function updateSelectedGroupsCount() {
    const checked = document.querySelectorAll('.group-checkbox:checked').length;
    const el = document.getElementById('selectedGroupsCount');
    if (el) el.textContent = `${checked} grupo${checked !== 1 ? 's' : ''} selecionado${checked !== 1 ? 's' : ''}`;
    updateCampaignSummary();
}

function getSelectedGroups() {
    return Array.from(document.querySelectorAll('.group-checkbox:checked')).map(cb => ({
        jid: cb.value,
        name: cb.dataset.name || 'Grupo'
    }));
}

function toggleSchedule() {
    const enabled = document.getElementById('scheduleEnabled').checked;
    document.getElementById('scheduleOptions').classList.toggle('hidden', !enabled);
}

function copyVar(v) {
    navigator.clipboard.writeText(v).then(() => {
        // Brief toast
        const t = document.createElement('div');
        t.className = 'fixed bottom-4 right-4 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg z-[100]';
        t.textContent = `Copiado: ${v}`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1500);
    });
}

function updateCampaignSummary() {
    const el = document.getElementById('campaignSummary');
    if (!el) return;
    const blockCount = campaignBlocks.length;
    if (!selectedAudience || blockCount === 0) {
        el.textContent = 'Monte a sequência e selecione o público';
        return;
    }
    let count = 0;
    if (selectedAudience === 'group') {
        count = getSelectedGroups().length;
    } else {
        const { contacts } = buildSegmentContacts(selectedAudience);
        count = contacts.length;
    }
    const batchSize = parseInt(document.getElementById('batchSize')?.value || '15');
    const interval = parseInt(document.getElementById('batchInterval')?.value || '20');
    const batches = Math.ceil(count / batchSize);
    const totalMin = batches * interval;
    el.textContent = `${blockCount} ações × ${count} destinatários • ~${Math.floor(totalMin/60)}h${totalMin%60}min`;
    const countEl = document.getElementById('blockCount');
    if (countEl) countEl.textContent = `${blockCount} ${blockCount === 1 ? 'ação' : 'ações'}`;
}

// ============================================================================
// BLOCOS DE CAMPANHA — Motor de Ações Empilháveis
// ============================================================================

const BLOCK_TYPES = {
    text:     { icon: 'type',         color: 'blue',   label: 'Texto' },
    image:    { icon: 'image',        color: 'green',  label: 'Imagem' },
    video:    { icon: 'video',        color: 'red',    label: 'Vídeo' },
    audio:    { icon: 'mic',          color: 'orange', label: 'Áudio PTT' },
    document: { icon: 'file-text',    color: 'slate',  label: 'Documento' },
    poll:     { icon: 'bar-chart-3',  color: 'purple', label: 'Enquete' },
    sticker:  { icon: 'smile',        color: 'yellow', label: 'Figurinha' },
    product:  { icon: 'shopping-bag', color: 'pink',   label: 'Produto' },
    pix:      { icon: 'qr-code',      color: 'teal',   label: 'Link PIX' }
};

function toggleBlockMenu() {
    const menu = document.getElementById('blockMenu');
    if (menu) menu.classList.toggle('hidden');
}

function addBlock(type, containerId = 'campaignBlocks') {
    const id = `block_${++blockCounter}`;
    const bt = BLOCK_TYPES[type] || BLOCK_TYPES.text;
    
    const block = { id, type, delay: 3, data: {} };
    
    if (containerId === 'campaignBlocks') {
        campaignBlocks.push(block);
    }
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const div = document.createElement('div');
    div.id = id;
    div.className = `block-item border-2 border-${bt.color}-200 bg-${bt.color}-50 rounded-xl p-3 relative group`;
    div.setAttribute('data-block-type', type);
    div.setAttribute('draggable', 'true');
    div.ondragstart = (e) => e.dataTransfer.setData('text/plain', id);
    div.ondragover = (e) => { e.preventDefault(); div.classList.add('border-indigo-500'); };
    div.ondragleave = () => div.classList.remove('border-indigo-500');
    div.ondrop = (e) => { e.preventDefault(); div.classList.remove('border-indigo-500'); reorderBlock(e.dataTransfer.getData('text/plain'), id, containerId); };
    
    let innerHtml = `
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-${bt.color}-600 bg-${bt.color}-100 px-2 py-0.5 rounded">#${container.children.length + 1}</span>
                <i data-lucide="${bt.icon}" class="w-4 h-4 text-${bt.color}-500"></i>
                <span class="text-sm font-medium text-slate-700">${bt.label}</span>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="moveBlock('${id}','up','${containerId}')" class="p-1 hover:bg-white rounded" title="Mover para cima"><i data-lucide="chevron-up" class="w-3 h-3"></i></button>
                <button onclick="moveBlock('${id}','down','${containerId}')" class="p-1 hover:bg-white rounded" title="Mover para baixo"><i data-lucide="chevron-down" class="w-3 h-3"></i></button>
                <button onclick="removeBlock('${id}','${containerId}')" class="p-1 hover:bg-red-100 rounded text-red-500" title="Remover"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>
        </div>`;
    
    // Conteúdo específico por tipo
    switch (type) {
        case 'text':
            innerHtml += `
                <textarea id="${id}_text" rows="3" placeholder="Digite a mensagem... Use {{nome}}, {{cupom}}, etc." class="input resize-none text-sm w-full" oninput="updateBlockData('${id}','text',this.value)"></textarea>
                <button onclick="aiImproveBlock('${id}','text','campaign_text')" class="ai-improve-btn mt-1 flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition"><i data-lucide="sparkles" class="w-3 h-3"></i> Melhorar com Anny</button>`;
            break;
        case 'image':
            innerHtml += `
                <textarea id="${id}_caption" rows="2" placeholder="Legenda da imagem (opcional)" class="input resize-none text-sm w-full mb-1" oninput="updateBlockData('${id}','caption',this.value)"></textarea>
                <button onclick="aiImproveBlock('${id}','caption','campaign_caption')" class="ai-improve-btn mb-2 flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition"><i data-lucide="sparkles" class="w-3 h-3"></i> Melhorar com Anny</button>
                <input type="file" id="${id}_file" accept="image/*" class="input text-xs" onchange="handleBlockFile('${id}',event,'image')">
                <div id="${id}_preview" class="hidden mt-2"><img class="w-16 h-16 object-cover rounded" id="${id}_thumb"></div>`;
            break;
        case 'video':
            innerHtml += `
                <textarea id="${id}_caption" rows="2" placeholder="Legenda do vídeo (opcional)" class="input resize-none text-sm w-full mb-1" oninput="updateBlockData('${id}','caption',this.value)"></textarea>
                <button onclick="aiImproveBlock('${id}','caption','campaign_caption')" class="ai-improve-btn mb-2 flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition"><i data-lucide="sparkles" class="w-3 h-3"></i> Melhorar com Anny</button>
                <input type="file" id="${id}_file" accept="video/mp4,video/3gpp" class="input text-xs" onchange="handleBlockFile('${id}',event,'video')">`;
            break;
        case 'audio':
            innerHtml += `
                <input type="file" id="${id}_file" accept="audio/ogg,audio/mp3,audio/mpeg,audio/opus" class="input text-xs" onchange="handleBlockFile('${id}',event,'audio')">
                <div id="${id}_preview" class="hidden mt-2"><audio controls class="w-full h-8" id="${id}_audio"></audio></div>
                <p class="text-[10px] text-slate-400 mt-1">Será enviado como PTT (mensagem de voz)</p>`;
            break;
        case 'document':
            innerHtml += `
                <input type="file" id="${id}_file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" class="input text-xs" onchange="handleBlockFile('${id}',event,'document')">
                <input type="text" id="${id}_filename" placeholder="Nome do arquivo (ex: catalogo.pdf)" class="input text-xs mt-2" oninput="updateBlockData('${id}','fileName',this.value)">`;
            break;
        case 'poll':
            innerHtml += `
                <input type="text" id="${id}_title" placeholder="Pergunta da enquete" class="input text-sm w-full mb-2" oninput="updateBlockData('${id}','pollTitle',this.value)">
                <div id="${id}_options" class="space-y-1">
                    <input type="text" class="block-poll-opt input text-xs" data-block="${id}" placeholder="Opção 1">
                    <input type="text" class="block-poll-opt input text-xs" data-block="${id}" placeholder="Opção 2">
                </div>
                <button onclick="addBlockPollOption('${id}')" class="mt-1 text-[10px] text-purple-600 font-medium">+ opção</button>
                <select id="${id}_selectable" class="input text-xs mt-1 w-24" oninput="updateBlockData('${id}','selectableCount',parseInt(this.value))">
                    <option value="1">1 escolha</option><option value="2">2</option><option value="3">3</option><option value="0">Livre</option>
                </select>`;
            break;
        case 'sticker':
            innerHtml += `
                <input type="file" id="${id}_file" accept="image/webp,image/png" class="input text-xs" onchange="handleBlockFile('${id}',event,'sticker')">
                <textarea id="${id}_text" rows="1" placeholder="Texto acompanhando (opcional)" class="input resize-none text-xs w-full mt-2" oninput="updateBlockData('${id}','text',this.value)"></textarea>
                <button onclick="aiImproveBlock('${id}','text','campaign_text')" class="ai-improve-btn mt-1 flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition"><i data-lucide="sparkles" class="w-3 h-3"></i> Melhorar com Anny</button>`;
            break;
        case 'product':
            innerHtml += `
                <select id="${id}_product" class="input text-sm w-full" onchange="selectBlockProduct('${id}',this.value)">
                    <option value="">Selecione um produto...</option>
                    ${(allProducts || []).map(p => `<option value="${p.id}" data-img="${p.imagem||p.image||''}" data-price="${p.preco||p.price||0}">${escapeHtml(p.nome||p.name||'Sem nome')} — R$ ${(p.preco||p.price||0).toFixed(2)}</option>`).join('')}
                </select>
                <div id="${id}_productPreview" class="hidden mt-2 flex items-center gap-3 p-2 bg-white rounded-lg border">
                    <img id="${id}_productImg" class="w-12 h-12 object-cover rounded">
                    <div>
                        <p id="${id}_productName" class="text-sm font-medium text-slate-700"></p>
                        <p id="${id}_productPrice" class="text-xs text-emerald-600"></p>
                    </div>
                </div>
                <textarea id="${id}_text" rows="2" placeholder="Texto complementar (ex: Disponível no atacado!)" class="input resize-none text-xs w-full mt-2" oninput="updateBlockData('${id}','text',this.value)"></textarea>
                <button onclick="aiImproveBlock('${id}','text','product_text')" class="ai-improve-btn mt-1 flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition"><i data-lucide="sparkles" class="w-3 h-3"></i> Melhorar com Anny</button>`;
            break;
        case 'pix':
            innerHtml += `
                <input type="text" id="${id}_text" placeholder="Chave PIX ou link do carrinho" class="input text-sm w-full" oninput="updateBlockData('${id}','text',this.value)">
                <textarea id="${id}_msg" rows="2" placeholder="Mensagem de acompanhamento" class="input resize-none text-xs w-full mt-2" oninput="updateBlockData('${id}','message',this.value)"></textarea>
                <button onclick="aiImproveBlock('${id}','msg','pix_message')" class="ai-improve-btn mt-1 flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition"><i data-lucide="sparkles" class="w-3 h-3"></i> Melhorar com Anny</button>`;
            break;
    }
    
    // Delay entre blocos (configurável)
    innerHtml += `
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-${bt.color}-200">
            <i data-lucide="clock" class="w-3 h-3 text-slate-400"></i>
            <label class="text-[10px] text-slate-500">Esperar</label>
            <input type="number" id="${id}_delay" value="3" min="1" max="120" class="w-14 text-xs text-center border rounded px-1 py-0.5" oninput="updateBlockData('${id}','delay',parseInt(this.value))">
            <label class="text-[10px] text-slate-500">seg antes de enviar</label>
        </div>`;
    
    div.innerHTML = innerHtml;
    container.appendChild(div);
    
    // Fecha menu
    const menu = document.getElementById('blockMenu');
    if (menu) menu.classList.add('hidden');
    
    lucide.createIcons();
    updateCampaignSummary();
    renumberBlocks(containerId);
}

function updateBlockData(blockId, key, value) {
    const block = campaignBlocks.find(b => b.id === blockId);
    if (block) {
        if (key === 'delay') block.delay = value;
        else block.data[key] = value;
    }
}

function handleBlockFile(blockId, event, mediaType) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const block = campaignBlocks.find(b => b.id === blockId);
        if (block) {
            block.data.base64 = e.target.result;
            block.data.mimetype = file.type;
            block.data.fileName = file.name;
        }
        // Preview
        const preview = document.getElementById(`${blockId}_preview`);
        if (mediaType === 'image' && preview) {
            preview.classList.remove('hidden');
            const thumb = document.getElementById(`${blockId}_thumb`);
            if (thumb) thumb.src = e.target.result;
        } else if (mediaType === 'audio' && preview) {
            preview.classList.remove('hidden');
            const audio = document.getElementById(`${blockId}_audio`);
            if (audio) audio.src = e.target.result;
        }
    };
    reader.readAsDataURL(file);
}

function addBlockPollOption(blockId) {
    const container = document.getElementById(`${blockId}_options`);
    if (!container) return;
    const count = container.querySelectorAll('.block-poll-opt').length;
    if (count >= 12) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'block-poll-opt input text-xs';
    input.dataset.block = blockId;
    input.placeholder = `Opção ${count + 1}`;
    container.appendChild(input);
}

function selectBlockProduct(blockId, productId) {
    const product = (allProducts || []).find(p => String(p.id) === String(productId));
    const block = campaignBlocks.find(b => b.id === blockId);
    const preview = document.getElementById(`${blockId}_productPreview`);
    
    if (product && block) {
        block.data.productId = product.id;
        block.data.productName = product.nome || product.name;
        block.data.productPrice = product.preco || product.price;
        block.data.productImage = product.imagem || product.image;
        block.data.productLink = product.link || '';
        
        if (preview) {
            preview.classList.remove('hidden');
            document.getElementById(`${blockId}_productImg`).src = product.imagem || product.image || '';
            document.getElementById(`${blockId}_productName`).textContent = product.nome || product.name;
            document.getElementById(`${blockId}_productPrice`).textContent = `R$ ${(product.preco || product.price || 0).toFixed(2)}`;
        }
    }
}

function moveBlock(blockId, direction, containerId = 'campaignBlocks') {
    const arr = containerId === 'campaignBlocks' ? campaignBlocks : null;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const el = document.getElementById(blockId);
    if (!el) return;
    
    if (direction === 'up' && el.previousElementSibling) {
        container.insertBefore(el, el.previousElementSibling);
        if (arr) {
            const idx = arr.findIndex(b => b.id === blockId);
            if (idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        }
    } else if (direction === 'down' && el.nextElementSibling) {
        container.insertBefore(el.nextElementSibling, el);
        if (arr) {
            const idx = arr.findIndex(b => b.id === blockId);
            if (idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        }
    }
    renumberBlocks(containerId);
}

function reorderBlock(draggedId, targetId, containerId) {
    const container = document.getElementById(containerId);
    const dragged = document.getElementById(draggedId);
    const target = document.getElementById(targetId);
    if (!container || !dragged || !target || draggedId === targetId) return;
    container.insertBefore(dragged, target);
    // Reorder array
    if (containerId === 'campaignBlocks') {
        const oldIdx = campaignBlocks.findIndex(b => b.id === draggedId);
        const [moved] = campaignBlocks.splice(oldIdx, 1);
        const newIdx = campaignBlocks.findIndex(b => b.id === targetId);
        campaignBlocks.splice(newIdx, 0, moved);
    }
    renumberBlocks(containerId);
}

function removeBlock(blockId, containerId = 'campaignBlocks') {
    document.getElementById(blockId)?.remove();
    if (containerId === 'campaignBlocks') {
        campaignBlocks = campaignBlocks.filter(b => b.id !== blockId);
    }
    renumberBlocks(containerId);
    updateCampaignSummary();
}

function renumberBlocks(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    Array.from(container.children).forEach((el, i) => {
        const badge = el.querySelector('span.text-xs.font-bold');
        if (badge) badge.textContent = `#${i + 1}`;
    });
}

// Coletar dados dos blocos do DOM (para poll options que são inputs dinâmicos)
function collectBlocksData(containerId = 'campaignBlocks') {
    const container = document.getElementById(containerId);
    if (!container) return [];
    
    return Array.from(container.children).map(el => {
        const blockId = el.id;
        const type = el.getAttribute('data-block-type');
        const delayInput = document.getElementById(`${blockId}_delay`);
        const delay = delayInput ? parseInt(delayInput.value) || 3 : 3;
        const data = {};
        
        // Coletar texto
        const textEl = document.getElementById(`${blockId}_text`);
        if (textEl) data.text = textEl.value;
        
        // Coletar caption
        const captionEl = document.getElementById(`${blockId}_caption`);
        if (captionEl) data.caption = captionEl.value;
        
        // Coletar base64 do block in-memory
        const memBlock = campaignBlocks.find(b => b.id === blockId);
        if (memBlock?.data?.base64) {
            data.base64 = memBlock.data.base64;
            data.mimetype = memBlock.data.mimetype;
            data.fileName = memBlock.data.fileName;
        }
        
        // Coletar poll
        if (type === 'poll') {
            const titleEl = document.getElementById(`${blockId}_title`);
            data.pollTitle = titleEl ? titleEl.value : '';
            data.pollOptions = Array.from(document.querySelectorAll(`.block-poll-opt[data-block="${blockId}"]`))
                .map(el => el.value.trim()).filter(v => v);
            const selEl = document.getElementById(`${blockId}_selectable`);
            data.selectableCount = selEl ? parseInt(selEl.value) : 1;
        }
        
        // Coletar produto
        if (type === 'product' && memBlock?.data?.productId) {
            Object.assign(data, {
                productId: memBlock.data.productId,
                productName: memBlock.data.productName,
                productPrice: memBlock.data.productPrice,
                productImage: memBlock.data.productImage,
                productLink: memBlock.data.productLink
            });
        }
        
        // PIX msg
        const msgEl = document.getElementById(`${blockId}_msg`);
        if (msgEl) data.message = msgEl.value;
        
        // Filename
        const fnEl = document.getElementById(`${blockId}_filename`);
        if (fnEl) data.fileName = fnEl.value || data.fileName;
        
        return { id: blockId, type, delay, data };
    });
}

// ============================================================================
// SCRIPTS — Salvar / Carregar sequências reutilizáveis
// ============================================================================

function saveAsScript() {
    const blocks = collectBlocksData('campaignBlocks');
    if (blocks.length === 0) return alert('Adicione pelo menos uma ação');
    
    const name = prompt('Nome do script (ex: "Lançamento Rasteirinhas"):');
    if (!name) return;
    
    // Remover base64 dos blocos para não sobrecarregar localStorage
    const lightBlocks = blocks.map(b => {
        const d = { ...b.data };
        delete d.base64; // Muito grande para localStorage
        return { ...b, data: d };
    });
    
    const script = {
        id: Date.now(),
        name,
        blocks: lightBlocks,
        createdAt: Date.now()
    };
    
    savedScripts.push(script);
    localStorage.setItem('crm_scripts', JSON.stringify(savedScripts));
    alert(`Script "${name}" salvo com ${blocks.length} ações!`);
}

function openLoadScript() {
    document.getElementById('loadScriptModal').classList.remove('hidden');
    renderScriptsList();
    lucide.createIcons();
}

function closeLoadScript() {
    document.getElementById('loadScriptModal').classList.add('hidden');
}

function renderScriptsList() {
    const container = document.getElementById('scriptsList');
    if (!container) return;
    
    if (savedScripts.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-400 text-center py-6">Nenhum script salvo</p>';
        return;
    }
    
    container.innerHTML = savedScripts.map(s => `
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <div>
                <p class="text-sm font-medium text-slate-700">${escapeHtml(s.name)}</p>
                <p class="text-xs text-slate-400">${s.blocks.length} ações • ${new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="loadScript(${s.id})" class="text-xs px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium">Carregar</button>
                <button onclick="deleteScript(${s.id})" class="text-xs px-2 py-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function loadScript(scriptId) {
    const script = savedScripts.find(s => s.id === scriptId);
    if (!script) return;
    
    // Limpar blocos atuais
    campaignBlocks = [];
    blockCounter = 0;
    const container = document.getElementById('campaignBlocks');
    if (container) container.innerHTML = '';
    
    // Recriar blocos do script
    script.blocks.forEach(b => {
        addBlock(b.type, 'campaignBlocks');
        const block = campaignBlocks[campaignBlocks.length - 1];
        
        // Restaurar dados
        setTimeout(() => {
            const textEl = document.getElementById(`${block.id}_text`);
            if (textEl && b.data.text) textEl.value = b.data.text;
            
            const captionEl = document.getElementById(`${block.id}_caption`);
            if (captionEl && b.data.caption) captionEl.value = b.data.caption;
            
            const titleEl = document.getElementById(`${block.id}_title`);
            if (titleEl && b.data.pollTitle) titleEl.value = b.data.pollTitle;
            
            const delayEl = document.getElementById(`${block.id}_delay`);
            if (delayEl) delayEl.value = b.delay || 3;
            
            const msgEl = document.getElementById(`${block.id}_msg`);
            if (msgEl && b.data.message) msgEl.value = b.data.message;
            
            // Restaurar opções de poll
            if (b.type === 'poll' && b.data.pollOptions) {
                const optContainer = document.getElementById(`${block.id}_options`);
                if (optContainer) {
                    optContainer.innerHTML = '';
                    b.data.pollOptions.forEach((opt, i) => {
                        const inp = document.createElement('input');
                        inp.type = 'text';
                        inp.className = 'block-poll-opt input text-xs';
                        inp.dataset.block = block.id;
                        inp.placeholder = `Opção ${i + 1}`;
                        inp.value = opt;
                        optContainer.appendChild(inp);
                    });
                }
            }
            
            block.data = { ...b.data };
            block.delay = b.delay || 3;
        }, 50);
    });
    
    closeLoadScript();
    updateCampaignSummary();
}

function deleteScript(scriptId) {
    if (!confirm('Excluir este script?')) return;
    savedScripts = savedScripts.filter(s => s.id !== scriptId);
    localStorage.setItem('crm_scripts', JSON.stringify(savedScripts));
    renderScriptsList();
}

// ============================================================================
// ENVIO RÁPIDO — Sequência para chat individual
// ============================================================================

function openQuickSend() {
    if (!currentRemoteJid) return alert('Abra um chat primeiro');
    
    const modal = document.getElementById('quickSendModal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    // Mostrar destino
    const targetEl = document.getElementById('quickSendTarget');
    if (targetEl) targetEl.textContent = `Para: ${currentChatName || currentRemoteJid}`;
    
    // Renderizar scripts salvos
    const scriptsEl = document.getElementById('quickSendScripts');
    if (scriptsEl) {
        if (savedScripts.length === 0) {
            scriptsEl.innerHTML = '<p class="text-xs text-slate-400">Nenhum script salvo. Crie um em Campanhas.</p>';
        } else {
            scriptsEl.innerHTML = savedScripts.map(s => `
                <button onclick="loadQuickSendScript(${s.id})" class="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 border border-indigo-200 font-medium">
                    ${escapeHtml(s.name)} (${s.blocks.length})
                </button>
            `).join('');
        }
    }
    
    // Limpar blocos
    const blocksEl = document.getElementById('quickSendBlocks');
    if (blocksEl) blocksEl.innerHTML = '';
    
    lucide.createIcons();
}

function closeQuickSend() {
    document.getElementById('quickSendModal')?.classList.add('hidden');
}

function loadQuickSendScript(scriptId) {
    const script = savedScripts.find(s => s.id === scriptId);
    if (!script) return;
    
    const container = document.getElementById('quickSendBlocks');
    if (!container) return;
    container.innerHTML = '';
    
    script.blocks.forEach(b => {
        addBlock(b.type, 'quickSendBlocks');
        // Preencher dados (simples - texto e delays)
        setTimeout(() => {
            const lastEl = container.lastElementChild;
            if (!lastEl) return;
            const bid = lastEl.id;
            const textEl = document.getElementById(`${bid}_text`);
            if (textEl && b.data.text) textEl.value = b.data.text;
            const captionEl = document.getElementById(`${bid}_caption`);
            if (captionEl && b.data.caption) captionEl.value = b.data.caption;
            const titleEl = document.getElementById(`${bid}_title`);
            if (titleEl && b.data.pollTitle) titleEl.value = b.data.pollTitle;
            const msgEl = document.getElementById(`${bid}_msg`);
            if (msgEl && b.data.message) msgEl.value = b.data.message;
            const delayEl = document.getElementById(`${bid}_delay`);
            if (delayEl) delayEl.value = b.delay || 3;
            if (b.type === 'poll' && b.data.pollOptions) {
                const optContainer = document.getElementById(`${bid}_options`);
                if (optContainer) {
                    optContainer.innerHTML = '';
                    b.data.pollOptions.forEach((opt, i) => {
                        const inp = document.createElement('input');
                        inp.type = 'text'; inp.className = 'block-poll-opt input text-xs';
                        inp.dataset.block = bid; inp.placeholder = `Opção ${i + 1}`; inp.value = opt;
                        optContainer.appendChild(inp);
                    });
                }
            }
        }, 50);
    });
}

async function executeQuickSend() {
    const blocks = collectBlocksData('quickSendBlocks');
    if (blocks.length === 0) return alert('Adicione pelo menos uma ação');
    if (!currentRemoteJid) return alert('Nenhum chat aberto');
    
    const simulate = document.getElementById('quickSendSimulate')?.checked;
    const phone = currentRemoteJid;
    
    closeQuickSend();
    
    // Processar blocos em sequência
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const contact = { 
            name: currentChatName || 'Cliente', 
            phone: phone 
        };
        
        try {
            if (simulate) await sendPresence(phone, block.type === 'audio' ? 'recording' : 'composing');
            await new Promise(r => setTimeout(r, (block.delay || 3) * 1000));
            if (simulate) await sendPresence(phone, 'paused');
            
            await executeBlock(block, contact);
            
        } catch(e) {
            console.error(`[QuickSend] Erro no bloco ${i + 1}:`, e);
        }
    }
    
    // Recarregar mensagens
    if (typeof loadMessages === 'function') loadMessages(phone);
}

// ============================================================================
// EXECUTAR BLOCO — Motor unificado de envio
// ============================================================================

function injectVariables(text, contact) {
    if (!text) return text;
    const client = allClients.find(c => {
        const cPhone = (c.telefone || c.celular || '').replace(/\D/g, '');
        const contactPhone = (contact.phone || '').replace(/\D/g, '');
        return cPhone && contactPhone && (cPhone.endsWith(contactPhone.slice(-9)) || contactPhone.endsWith(cPhone.slice(-9)));
    });
    
    const lastOrder = client ? (allOrders || []).filter(o => o.cliente_id == client.id).sort((a,b) => new Date(b.data) - new Date(a.data))[0] : null;
    
    return text
        .replace(/\{\{nome\}\}/gi, contact.name || client?.nome || 'Cliente')
        .replace(/\{\{nome_cliente\}\}/gi, contact.name || client?.nome || 'Cliente')
        .replace(/\{\{cidade\}\}/gi, client?.cidade || client?.city || '')
        .replace(/\{\{telefone\}\}/gi, contact.phone || '')
        .replace(/\{\{cupom\}\}/gi, client?.cupom || 'VEXX10')
        .replace(/\{\{link_carrinho\}\}/gi, client?.link_carrinho || '')
        .replace(/\{\{ultimo_pedido\}\}/gi, lastOrder ? `#${lastOrder.codigo || lastOrder.id} (R$ ${parseFloat(lastOrder.total||0).toFixed(2)})` : 'nenhum');
}

// ============================================================================
// ANNY IA — Melhorar texto com inteligência artificial
// ============================================================================

async function aiImproveText(inputId, context = 'campaign_text', mode = 'improve') {
    const el = document.getElementById(inputId);
    if (!el) return;
    const text = el.value?.trim();
    if (!text || text.length < 3) return alert('Digite algo antes de pedir para a Anny melhorar.');
    
    // Visual feedback
    const originalPlaceholder = el.placeholder;
    el.disabled = true;
    el.placeholder = '✨ Anny está pensando...';
    el.classList.add('opacity-50');
    
    try {
        const res = await fetch(`${API_BASE}/anny/improve-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, context, mode })
        });
        
        const data = await res.json();
        if (data.success && data.improved) {
            el.value = data.improved;
            // Disparar evento de input para atualizar os dados do bloco
            el.dispatchEvent(new Event('input', { bubbles: true }));
            showToast?.('✨ Texto melhorado pela Anny!', 'success');
        } else {
            throw new Error(data.error || 'Erro desconhecido');
        }
    } catch(e) {
        console.error('[AI] Erro:', e);
        alert(`Erro ao melhorar texto: ${e.message}`);
    } finally {
        el.disabled = false;
        el.placeholder = originalPlaceholder;
        el.classList.remove('opacity-50');
    }
}

// Botão nos blocos de campanha — chama aiImproveText com o id do textarea do bloco
function aiImproveBlock(blockId, field, context) {
    aiImproveText(`${blockId}_${field}`, context, 'improve');
}

// Menu IA no chat
function toggleAiMenu() {
    const menu = document.getElementById('aiModeMenu');
    if (menu) menu.classList.toggle('hidden');
}

// Fechar menu ao clicar fora
document.addEventListener('click', (e) => {
    const menu = document.getElementById('aiModeMenu');
    const btn = document.getElementById('btnAiImprove');
    if (menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

async function aiImproveChat(mode = 'improve') {
    // Fechar menu
    const menu = document.getElementById('aiModeMenu');
    if (menu) menu.classList.add('hidden');
    
    await aiImproveText('inputMessage', 'chat_message', mode);
}

async function sendPresence(remoteJid, type = 'composing') {
    try {
        await fetch(`${API_BASE}/whatsapp/send-presence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remoteJid, presence: type })
        });
    } catch(e) {
        console.warn('[Presence]', e.message);
    }
}

async function executeBlock(block, contact) {
    const phone = contact.phone.includes('@') ? contact.phone : contact.phone.replace(/\D/g, '');
    const data = block.data || {};
    
    switch (block.type) {
        case 'text': {
            const text = injectVariables(data.text || '', contact);
            if (!text) return;
            await fetch(`${API_BASE}/whatsapp/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: phone, text })
            });
            break;
        }
        case 'image': {
            const caption = injectVariables(data.caption || '', contact);
            await fetch(`${API_BASE}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    mediaType: 'image',
                    media: data.base64,
                    caption
                })
            });
            break;
        }
        case 'video': {
            const caption = injectVariables(data.caption || '', contact);
            await fetch(`${API_BASE}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    mediaType: 'video',
                    media: data.base64,
                    caption
                })
            });
            break;
        }
        case 'audio': {
            await fetch(`${API_BASE}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    mediaType: 'audio',
                    media: data.base64,
                    encoding: true
                })
            });
            break;
        }
        case 'document': {
            await fetch(`${API_BASE}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    mediaType: 'document',
                    media: data.base64,
                    fileName: data.fileName || 'arquivo'
                })
            });
            break;
        }
        case 'poll': {
            const title = injectVariables(data.pollTitle || '', contact);
            const options = data.pollOptions || [];
            if (options.length < 2) return;
            await fetch(`${API_BASE}/whatsapp/send-poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    title,
                    options,
                    selectableCount: data.selectableCount || 1
                })
            });
            break;
        }
        case 'sticker': {
            await fetch(`${API_BASE}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: phone,
                    mediaType: 'sticker',
                    media: data.base64
                })
            });
            // Texto acompanhando
            if (data.text) {
                await new Promise(r => setTimeout(r, 1500));
                const text = injectVariables(data.text, contact);
                await fetch(`${API_BASE}/whatsapp/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: phone, text })
                });
            }
            break;
        }
        case 'product': {
            // Envia imagem do produto + texto descritivo
            const pName = data.productName || '';
            const pPrice = data.productPrice || 0;
            const pImg = data.productImage || '';
            let text = injectVariables(data.text || '', contact);
            const productMsg = `*${pName}*\nR$ ${parseFloat(pPrice).toFixed(2)}${data.productLink ? '\n' + data.productLink : ''}${text ? '\n\n' + text : ''}`;
            
            if (pImg) {
                await fetch(`${API_BASE}/whatsapp/send-media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        number: phone,
                        mediaType: 'image',
                        media: pImg,
                        caption: productMsg
                    })
                });
            } else {
                await fetch(`${API_BASE}/whatsapp/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: phone, text: productMsg })
                });
            }
            break;
        }
        case 'pix': {
            let msg = injectVariables(data.message || '', contact);
            const pixText = data.text || '';
            const fullMsg = msg ? `${msg}\n\n${pixText}` : pixText;
            if (fullMsg) {
                await fetch(`${API_BASE}/whatsapp/send-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: phone, text: fullMsg })
                });
            }
            break;
        }
    }
}

// ============================================================================
// OPEN / CLOSE / SAVE CAMPAIGN
// ============================================================================

function openNewCampaign() {
    document.getElementById('newCampaignModal').classList.remove('hidden');
    campaignBlocks = [];
    blockCounter = 0;
    const container = document.getElementById('campaignBlocks');
    if (container) container.innerHTML = '';
    loadCampaignData();
    lucide.createIcons();
}

function closeNewCampaign() {
    document.getElementById('newCampaignModal').classList.add('hidden');
    document.getElementById('campaignName').value = '';
    selectedAudience = null;
    const sel = document.getElementById('campaignAudienceSelect');
    if (sel) sel.value = '';
    campaignBlocks = [];
    blockCounter = 0;
    const container = document.getElementById('campaignBlocks');
    if (container) container.innerHTML = '';
    document.getElementById('groupSelector').classList.add('hidden');
    document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);
    updateSelectedGroupsCount();
}

async function saveCampaign() {
    const name = document.getElementById('campaignName')?.value.trim();
    if (!name) return alert('Dê um nome à campanha');
    if (!selectedAudience) return alert('Selecione o público alvo');
    
    const blocks = collectBlocksData('campaignBlocks');
    if (blocks.length === 0) return alert('Adicione pelo menos uma ação na sequência');
    
    // Validar blocos
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type === 'text' && !b.data.text) return alert(`Bloco #${i+1} (Texto): escreva a mensagem`);
        if (b.type === 'poll') {
            if (!b.data.pollTitle) return alert(`Bloco #${i+1} (Enquete): preencha a pergunta`);
            if (!b.data.pollOptions || b.data.pollOptions.length < 2) return alert(`Bloco #${i+1} (Enquete): mínimo 2 opções`);
        }
        if (['image','video','audio','document','sticker'].includes(b.type) && !b.data.base64) {
            return alert(`Bloco #${i+1} (${BLOCK_TYPES[b.type]?.label}): selecione o arquivo`);
        }
    }
    
    const scheduled = document.getElementById('scheduleEnabled')?.checked;
    let scheduleTime = null;
    if (scheduled) {
        const date = document.getElementById('scheduleDate')?.value;
        const time = document.getElementById('scheduleTime')?.value;
        if (!date || !time) return alert('Selecione data e hora');
        scheduleTime = new Date(`${date}T${time}`).getTime();
    }
    
    // Construir lista de contatos usando motor de segmentação
    let contacts = [];
    if (selectedAudience === 'group') {
        const groups = getSelectedGroups();
        if (groups.length === 0) return alert('Selecione pelo menos um grupo');
        contacts = groups.map(g => ({ id: g.jid, name: g.name, phone: g.jid }));
    } else {
        const result = buildSegmentContacts(selectedAudience);
        contacts = result.contacts;
        if (result.invalidPhones.length > 0) {
            console.warn(`[Campaign] ${result.invalidPhones.length} telefones inválidos removidos:`, result.invalidPhones);
        }
    }
    
    if (contacts.length === 0) return alert('Nenhum contato encontrado para este público');
    
    const campaign = {
        id: Date.now(),
        name,
        blocks, // Sequência de ações!
        audience: selectedAudience,
        targetGroups: selectedAudience === 'group' ? getSelectedGroups().map(g => g.jid) : [],
        batchSize: parseInt(document.getElementById('batchSize')?.value || '15'),
        batchInterval: parseInt(document.getElementById('batchInterval')?.value || '20'),
        messageDelay: parseInt(document.getElementById('messageDelay')?.value || '5'),
        simulatePresence: document.getElementById('simulatePresence')?.checked ?? true,
        scheduledFor: scheduleTime,
        status: scheduled ? 'scheduled' : 'running',
        createdAt: Date.now(),
        sent: 0,
        failed: 0,
        total: contacts.length,
        contacts,
        currentBatch: 0,
        lastBatchAt: null
    };
    
    allCampaigns.push(campaign);
    saveCampaigns();
    closeNewCampaign();
    renderCampaigns();
    updateCampaignStats();
    
    if (!scheduled) startCampaign(campaign.id);
    alert(scheduled ? 'Campanha agendada!' : `Campanha iniciada! ${blocks.length} ações × ${contacts.length} destinatários`);
}

function renderCampaigns() {
    const container = document.getElementById('campaignsList');
    if (!container) return;
    
    let filtered = allCampaigns;
    if (currentCampaignFilter !== 'all') {
        filtered = allCampaigns.filter(c => c.status === currentCampaignFilter);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="megaphone" class="w-8 h-8 text-slate-300"></i>
                </div>
                <p class="text-slate-500 font-medium">Nenhuma campanha ${currentCampaignFilter !== 'all' ? 'neste status' : 'criada'}</p>
                <button onclick="openNewCampaign()" class="btn btn-primary mt-4">
                    <i data-lucide="plus" class="w-4 h-4"></i> Nova Campanha
                </button>
            </div>`;
        lucide.createIcons();
        return;
    }
    
    container.innerHTML = filtered.map(c => {
        const progress = c.total > 0 ? (c.sent / c.total * 100).toFixed(0) : 0;
        const statusColors = { scheduled: 'bg-amber-100 text-amber-700', running: 'bg-blue-100 text-blue-700', completed: 'bg-emerald-100 text-emerald-700', paused: 'bg-slate-100 text-slate-700' };
        const statusLabels = { scheduled: 'Agendada', running: 'Em Andamento', completed: 'Concluída', paused: 'Pausada' };
        const blockInfo = c.blocks ? `${c.blocks.length} ações` : (c.campaignType || 'texto');
        
        return `
            <div class="card p-5">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-semibold text-slate-800">${escapeHtml(c.name)}</h3>
                        <p class="text-xs text-slate-500 mt-0.5">${new Date(c.createdAt).toLocaleDateString('pt-BR')} • ${blockInfo}</p>
                    </div>
                    <span class="badge ${statusColors[c.status]}">${statusLabels[c.status]}</span>
                </div>
                <div class="flex items-center gap-4 mb-3">
                    <div class="flex-1">
                        <div class="flex justify-between text-xs text-slate-500 mb-1">
                            <span>${c.sent}/${c.total}</span><span>${progress}%</span>
                        </div>
                        <div class="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    ${c.failed > 0 ? `<span class="text-xs text-red-500">${c.failed} falhas</span>` : ''}
                </div>
                <div class="flex justify-end gap-2">
                    ${c.status === 'running' ? `<button onclick="pauseCampaign(${c.id})" class="btn btn-secondary text-xs py-1.5 px-3"><i data-lucide="pause" class="w-3 h-3"></i> Pausar</button>` : ''}
                    ${c.status === 'paused' ? `<button onclick="resumeCampaign(${c.id})" class="btn btn-primary text-xs py-1.5 px-3"><i data-lucide="play" class="w-3 h-3"></i> Retomar</button>` : ''}
                    ${c.status === 'scheduled' ? `<button onclick="startCampaign(${c.id})" class="btn btn-primary text-xs py-1.5 px-3"><i data-lucide="play" class="w-3 h-3"></i> Iniciar</button>` : ''}
                    <button onclick="deleteCampaign(${c.id})" class="btn btn-danger text-xs py-1.5 px-3"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                </div>
            </div>`;
    }).join('');
    lucide.createIcons();
}

function updateCampaignStats() {
    const today = new Date().toDateString();
    const sentToday = allCampaigns.filter(c => c.status === 'completed' && new Date(c.createdAt).toDateString() === today).reduce((sum, c) => sum + c.sent, 0);
    const el1 = document.getElementById('statSentToday');
    const el2 = document.getElementById('statScheduled');
    const el3 = document.getElementById('statRunning');
    if (el1) el1.textContent = sentToday;
    if (el2) el2.textContent = allCampaigns.filter(c => c.status === 'scheduled').length;
    if (el3) el3.textContent = allCampaigns.filter(c => c.status === 'running').length;
}

function filterCampaigns(filter) {
    currentCampaignFilter = filter;
    ['campFilterAll', 'campFilterScheduled', 'campFilterRunning', 'campFilterCompleted', 'campFilterPaused'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const fn = id.replace('campFilter', '').toLowerCase();
        if (fn === filter || (filter === 'all' && id === 'campFilterAll')) {
            btn.classList.add('bg-slate-100', 'text-slate-700'); btn.classList.remove('text-slate-500');
        } else {
            btn.classList.remove('bg-slate-100', 'text-slate-700'); btn.classList.add('text-slate-500');
        }
    });
    renderCampaigns();
}

async function startCampaign(id) {
    const campaign = allCampaigns.find(c => c.id === id);
    if (!campaign) return;
    campaign.status = 'running';
    campaign.lastBatchAt = Date.now();
    saveCampaigns();
    renderCampaigns();
    updateCampaignStats();
    processCampaignBatch(id);
}

// ============================================================================
// PROCESSADOR DE CAMPANHA — Motor de blocos em sequência
// ============================================================================

async function processCampaignBatch(id) {
    const campaign = allCampaigns.find(c => c.id === id);
    if (!campaign || campaign.status !== 'running') return;
    
    const startIdx = campaign.sent;
    const endIdx = Math.min(startIdx + campaign.batchSize, campaign.total);
    const batch = campaign.contacts.slice(startIdx, endIdx);
    const blocks = campaign.blocks || [];
    const simulate = campaign.simulatePresence !== false;
    
    for (const contact of batch) {
        if (!contact.phone) { campaign.failed++; continue; }
        
        try {
            const phone = contact.phone.includes('@g.us') ? contact.phone : contact.phone.replace(/\D/g, '');
            const contactObj = { ...contact, phone };
            
            // Se tem blocos (nova arquitetura), executar sequência
            if (blocks.length > 0) {
                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i];
                    
                    // Simular presença
                    if (simulate) {
                        const presenceType = block.type === 'audio' ? 'recording' : 'composing';
                        await sendPresence(phone, presenceType);
                    }
                    
                    // Delay entre blocos
                    const blockDelay = (block.delay || 3) * 1000;
                    await new Promise(r => setTimeout(r, blockDelay));
                    
                    if (simulate) await sendPresence(phone, 'paused');
                    
                    // Executar bloco
                    await executeBlock(block, contactObj);
                    
                    // Pequeno intervalo entre blocos da mesma mensagem
                    if (i < blocks.length - 1) {
                        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
                    }
                }
            } else {
                // Fallback: campanha legada (sem blocos) — compatibilidade
                const text = injectVariables(campaign.message || '', contact);
                if (campaign.image) {
                    await fetch(`${API_BASE}/whatsapp/send-media`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: phone, mediaType: 'image', media: campaign.image, caption: text })
                    });
                } else if (text) {
                    await fetch(`${API_BASE}/whatsapp/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: phone, text })
                    });
                }
            }
            
            campaign.sent++;
            
            // Anti-ban inteligente
            const msgIndex = campaign.sent;
            let baseDelay = (campaign.messageDelay || 5) * 1000;
            if (msgIndex > 100) baseDelay *= 1.6;
            else if (msgIndex > 50) baseDelay *= 1.3;
            const jitter = baseDelay * 0.6;
            let delay = baseDelay + (Math.random() * jitter * 2 - jitter);
            if (msgIndex > 0 && msgIndex % 15 === 0) delay += 30000 + Math.random() * 30000;
            await new Promise(r => setTimeout(r, Math.max(delay, 2000)));
            
        } catch (e) {
            console.error('[Campaign] Erro ao enviar:', e);
            campaign.failed++;
        }
    }
    
    campaign.currentBatch++;
    campaign.lastBatchAt = Date.now();
    if (campaign.sent >= campaign.total) campaign.status = 'completed';
    
    saveCampaigns();
    renderCampaigns();
    updateCampaignStats();
    
    if (campaign.status === 'running') {
        setTimeout(() => processCampaignBatch(id), campaign.batchInterval * 60 * 1000);
    }
}

function pauseCampaign(id) {
    const campaign = allCampaigns.find(c => c.id === id);
    if (campaign) { campaign.status = 'paused'; saveCampaigns(); renderCampaigns(); updateCampaignStats(); }
}

function resumeCampaign(id) { startCampaign(id); }

function deleteCampaign(id) {
    if (!confirm('Excluir esta campanha?')) return;
    allCampaigns = allCampaigns.filter(c => c.id !== id);
    saveCampaigns(); renderCampaigns(); updateCampaignStats();
}

function saveCampaigns() {
    // Limpar base64 dos blocos antes de salvar (muito grande para localStorage)
    const cleaned = allCampaigns.map(c => {
        if (!c.blocks) return c;
        return { ...c, blocks: c.blocks.map(b => {
            const d = { ...b.data };
            delete d.base64; // Muito grande
            return { ...b, data: d };
        })};
    });
    try {
        localStorage.setItem('crm_campaigns', JSON.stringify(cleaned));
    } catch(e) {
        console.warn('[Campaign] localStorage cheio, limpando campanhas antigas');
        const recent = cleaned.slice(-5);
        localStorage.setItem('crm_campaigns', JSON.stringify(recent));
    }
    scheduleCloudSave();
}

function openImportFromGroup() {
    alert('Funcionalidade em desenvolvimento');
}

// ============================================================================
// SISTEMA DE MONITORAMENTO DE CONEXÃO (FRONTEND)
// ============================================================================

// Verificar conexão periódicamente
async function checkConnectionStatus() {
    try {
        const res = await fetch(`${API_BASE}/whatsapp/connection-status`);
        const data = await res.json();
        
        connectionState = {
            status: data.status || data.liveCheck?.state || 'unknown',
            lastCheck: data.lastCheck,
            lastConnected: data.lastConnected,
            reconnectAttempts: data.reconnectAttempts || 0,
            isReconnecting: data.isReconnecting || false,
            errors: data.recentErrors || []
        };
        
        updateConnectionUI(connectionState);
        return data;
    } catch (error) {
        console.error('[Connection Check] Erro:', error);
        connectionState.status = 'error';
        updateConnectionUI(connectionState);
        return null;
    }
}

// Atualizar interface de conexão
function updateConnectionUI(state) {
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');
    const subtext = document.getElementById('connectionSubtext');
    const alert = document.getElementById('connectionAlert');
    const alertText = document.getElementById('connectionAlertText');
    const btnConnect = document.getElementById('btnConnect');
    const connectIcon = document.getElementById('connectIcon');
    const connectText = document.getElementById('connectText');
    
    // Verificar se elementos existem antes de manipular
    if (!dot || !text) {
        // Silencioso: elementos podem não existir se a página não é atendimentos.html
        return;
    }
    
    // Resetar classes
    dot.className = 'w-3 h-3 rounded-full';
    
    switch(state.status) {
        case 'connected':
        case 'open':
            dot.classList.add('connection-connected');
            text.textContent = 'Conectado';
            text.className = 'text-sm font-medium text-emerald-600';
            if (alert) alert.classList.add('hidden');
            if (btnConnect) btnConnect.classList.add('hidden');
            break;
            
        case 'connecting':
            dot.classList.add('connection-connecting');
            text.textContent = 'Conectando...';
            text.className = 'text-sm font-medium text-amber-600';
            if (alert) alert.classList.add('hidden');
            break;
            
        case 'disconnected':
        case 'close':
        case 'closed':
            dot.classList.add('connection-disconnected');
            text.textContent = 'Desconectado';
            text.className = 'text-sm font-medium text-red-600';
            if (alert) alert.classList.remove('hidden');
            if (alertText) alertText.textContent = state.isReconnecting 
                ? `Reconectando... (tentativa ${state.reconnectAttempts})` 
                : 'WhatsApp desconectado - Sessão encerrada';
            if (btnConnect) btnConnect.classList.remove('hidden');
            break;
            
        case 'error':
            dot.classList.add('connection-error');
            text.textContent = 'Erro';
            text.className = 'text-sm font-medium text-red-600';
            if (alert) alert.classList.remove('hidden');
            if (alertText) alertText.textContent = 'Erro de conexão - Evolution API pode estar offline';
            if (btnConnect) btnConnect.classList.remove('hidden');
            break;
            
        case 'not_created':
        case 'NOT_CREATED':
            dot.classList.add('connection-disconnected');
            text.textContent = 'Não Configurado';
            text.className = 'text-sm font-medium text-slate-600';
            if (alert) alert.classList.add('hidden');
            if (btnConnect) btnConnect.classList.remove('hidden');
            break;
            
        default:
            dot.classList.add('bg-slate-400');
            text.textContent = 'Verificando...';
            text.className = 'text-sm font-medium text-slate-600';
    }
    
    // Mostrar última verificação
    if (state.lastCheck && subtext) {
        const lastCheck = new Date(state.lastCheck);
        subtext.textContent = `Última verificação: ${lastCheck.toLocaleTimeString('pt-BR')}`;
        subtext.classList.remove('hidden');
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Iniciar monitoramento de conexão
function startConnectionMonitoring() {
    // Aguardar DOM estar pronto antes de verificar
    const dot = document.getElementById('connectionDot');
    if (!dot) {
        // Elementos de conexão não existem nesta página, não monitorar
        return;
    }
    
    // Verificar imediatamente
    checkConnectionStatus();
    
    // Verificar a cada 60 segundos (Socket.io cuida do real-time, isso é fallback)
    if (connectionCheckInterval) clearInterval(connectionCheckInterval);
    connectionCheckInterval = setInterval(checkConnectionStatus, 60000);
}

// Mostrar modal de detalhes de conexão
async function showConnectionDetails() {
    const modal = document.getElementById('connectionDetailsModal');
    modal.classList.remove('hidden');
    
    // Buscar dados atualizados
    const data = await checkConnectionStatus();
    
    if (data) {
        // Atualizar ícone e status
        const icon = document.getElementById('connectionDetailIcon');
        const status = document.getElementById('connectionDetailStatus');
        
        if (data.status === 'connected' || data.liveCheck?.connected) {
            icon.className = 'w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center';
            icon.innerHTML = '<i data-lucide="wifi" class="w-5 h-5 text-emerald-600"></i>';
            status.textContent = 'Conectado e funcionando';
            status.className = 'text-xs text-emerald-600';
        } else {
            icon.className = 'w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center';
            icon.innerHTML = '<i data-lucide="wifi-off" class="w-5 h-5 text-red-600"></i>';
            status.textContent = data.liveCheck?.reason || 'Desconectado';
            status.className = 'text-xs text-red-600';
        }
        
        // Preencher dados
        document.getElementById('connectionLastCheck').textContent = 
            data.lastCheck ? new Date(data.lastCheck).toLocaleString('pt-BR') : '-';
        document.getElementById('connectionLastConnected').textContent = 
            data.lastConnected ? new Date(data.lastConnected).toLocaleString('pt-BR') : '-';
        document.getElementById('connectionAttempts').textContent = data.reconnectAttempts || '0';
        document.getElementById('connectionAutoReconnect').textContent = 
            data.isReconnecting ? 'Reconectando...' : 'Ativo';
        
        // Mostrar erros recentes
        const errorsDiv = document.getElementById('connectionErrors');
        if (data.recentErrors && data.recentErrors.length > 0) {
            errorsDiv.innerHTML = data.recentErrors.map(err => `
                <div class="bg-red-50 p-2 rounded text-xs">
                    <span class="font-semibold text-red-700">${err.type}</span>
                    <span class="text-red-600 ml-2">${err.message}</span>
                    <span class="text-red-400 block mt-1">${new Date(err.timestamp).toLocaleString('pt-BR')}</span>
                </div>
            `).join('');
        } else {
            errorsDiv.innerHTML = '<p class="text-xs text-slate-400 italic">Nenhum erro recente</p>';
        }
    }
    
    lucide.createIcons();
}

function closeConnectionDetails() {
    document.getElementById('connectionDetailsModal').classList.add('hidden');
}

// Forçar reconexão
async function forceReconnect() {
    const btn = document.querySelector('[onclick="forceReconnect()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Reconectando...';
    }
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/force-reconnect`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            showToast('Reconectado com sucesso!', 'success');
        } else {
            showToast('Falha na reconexão. Tente conectar manualmente.', 'error');
        }
        
        await checkConnectionStatus();
    } catch (error) {
        showToast('Erro ao reconectar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="power" class="w-4 h-4"></i> Forçar Reconexão';
            lucide.createIcons();
        }
    }
}

// Resetar contador de reconexão
async function resetReconnectCounter() {
    try {
        await fetch(`${API_BASE}/whatsapp/reset-reconnect`, { method: 'POST' });
        showToast('Contador resetado', 'success');
        showConnectionDetails(); // Atualizar modal
    } catch (error) {
        showToast('Erro: ' + error.message, 'error');
    }
}

// Toast notification simples
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm font-medium transition-all transform translate-y-0 ${
        type === 'success' ? 'bg-emerald-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        type === 'warning' ? 'bg-amber-500 text-white' :
        'bg-slate-700 text-white'
    }`;
    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : type === 'warning' ? 'alert-triangle' : 'info'}" class="w-4 h-4"></i>
        ${message}
    `;
    document.body.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================================
// SISTEMA DE NOTAS DO CLIENTE
// ============================================================================

function toggleNotesPanel() {
    const panel = document.getElementById('notesPanel');
    panel.classList.toggle('open');
    
    if (panel.classList.contains('open') && currentChatId) {
        loadClientNotes();
    }
}

function loadClientNotes() {
    const chatId = currentChatId;
    if (!chatId) return;
    
    const notesData = clientNotes[chatId] || { text: '', history: [] };
    document.getElementById('clientNotes').value = notesData.text || '';
    
    // Atualizar histórico
    const historyDiv = document.getElementById('notesHistory');
    if (notesData.history && notesData.history.length > 0) {
        historyDiv.innerHTML = notesData.history.slice(0, 10).map(h => `
            <div class="bg-yellow-100 p-2 rounded text-xs">
                <span class="text-yellow-600">${new Date(h.date).toLocaleString('pt-BR')}</span>
                <p class="mt-1">${h.text.substring(0, 100)}${h.text.length > 100 ? '...' : ''}</p>
            </div>
        `).join('');
    } else {
        historyDiv.innerHTML = '<p class="text-slate-400 italic">Nenhuma nota anterior</p>';
    }
    
    // Atualizar contador na toolbar
    const countEl = document.getElementById('notesCount');
    if (notesData.text) {
        countEl.textContent = '1';
        countEl.classList.remove('hidden');
    } else {
        countEl.classList.add('hidden');
    }
}

function saveClientNotes() {
    const chatId = currentChatId;
    if (!chatId) return;
    
    const text = document.getElementById('clientNotes').value.trim();
    const existingData = clientNotes[chatId] || { text: '', history: [] };
    
    // Adicionar ao histórico se o texto mudou
    if (existingData.text && existingData.text !== text) {
        existingData.history.unshift({
            date: new Date().toISOString(),
            text: existingData.text
        });
        // Manter apenas últimas 20 notas
        existingData.history = existingData.history.slice(0, 20);
    }
    
    existingData.text = text;
    clientNotes[chatId] = existingData;
    
    localStorage.setItem('crm_client_notes', JSON.stringify(clientNotes));
    scheduleCloudSave();
    showToast('Notas salvas!', 'success');
    loadClientNotes();
}

// ============================================================================
// SISTEMA DE AGENDAMENTO
// ============================================================================

function openScheduleModal() {
    if (!currentChatId) {
        showToast('Selecione uma conversa primeiro', 'error');
        return;
    }
    
    document.getElementById('scheduleModal').classList.remove('hidden');
    
    // Definir data/hora mínima como agora + 5 minutos
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const minDateTime = now.toISOString().slice(0, 16);
    document.getElementById('scheduleDateTime').min = minDateTime;
    document.getElementById('scheduleDateTime').value = minDateTime;
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.add('hidden');
    document.getElementById('scheduleMessage').value = '';
}

function saveScheduledMessage() {
    const dateTime = document.getElementById('scheduleDateTime').value;
    const message = document.getElementById('scheduleMessage').value.trim();
    
    if (!dateTime || !message) {
        showToast('Preencha a data/hora e a mensagem', 'error');
        return;
    }
    
    const scheduled = {
        id: Date.now(),
        chatId: currentChatId,
        remoteJid: currentRemoteJid,
        chatName: document.getElementById('headerName')?.textContent || 'Desconhecido',
        message,
        scheduledFor: new Date(dateTime).toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending'
    };
    
    scheduledMessages.push(scheduled);
    localStorage.setItem('crm_scheduled', JSON.stringify(scheduledMessages));
    scheduleCloudSave();
    
    showToast(`Mensagem agendada para ${new Date(dateTime).toLocaleString('pt-BR')}`, 'success');
    closeScheduleModal();
    
    // Configurar timer para envio
    scheduleMessageTimer(scheduled);
}

function scheduleMessageTimer(scheduled) {
    const now = Date.now();
    const sendTime = new Date(scheduled.scheduledFor).getTime();
    const delay = sendTime - now;
    
    if (delay > 0) {
        setTimeout(async () => {
            await sendScheduledMessage(scheduled.id);
        }, delay);
    }
}

async function sendScheduledMessage(id) {
    const scheduled = scheduledMessages.find(s => s.id === id);
    if (!scheduled || scheduled.status !== 'pending') return;
    
    try {
        const res = await fetch(`${API_BASE}/whatsapp/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                remoteJid: scheduled.remoteJid,
                message: scheduled.message
            })
        });
        
        if (res.ok) {
            scheduled.status = 'sent';
            scheduled.sentAt = new Date().toISOString();
            showToast(`Mensagem agendada enviada para ${scheduled.chatName}`, 'success');
        } else {
            scheduled.status = 'failed';
            scheduled.error = 'Falha no envio';
        }
    } catch (error) {
        scheduled.status = 'failed';
        scheduled.error = error.message;
    }
    
    localStorage.setItem('crm_scheduled', JSON.stringify(scheduledMessages));
    scheduleCloudSave();
}

// Inicializar timers de mensagens agendadas
function initScheduledMessages() {
    scheduledMessages.filter(s => s.status === 'pending').forEach(scheduleMessageTimer);
}

// ============================================================================
// FILTROS INTELIGENTES (ABAS)
// ============================================================================

function updateFilterCounts() {
    const counts = {
        all: allChats.length,
        unread: allChats.filter(c => getEffectiveUnreadCount(c) > 0).length,
        waiting: allChats.filter(c => {
            const lastMsg = c.lastMessage;
            if (!lastMsg) return false;
            const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
            const msgTime = (lastMsg.messageTimestamp || 0) * 1000;
            return !lastMsg.key?.fromMe && msgTime < fourHoursAgo;
        }).length,
        groups: allChats.filter(c => c.isGroup).length,
        sales: allChats.filter(c => {
            const chatId = c.id || c.remoteJid;
            const tags = chatTags[chatId] || [];
            return tags.some(tagId => {
                const tag = allTags.find(t => t.id === tagId);
                return tag && (tag.name.toLowerCase().includes('venda') || tag.name.toLowerCase().includes('pago'));
            });
        }).length,
        vacuum: allChats.filter(c => {
            const lastMsg = c.lastMessage;
            if (!lastMsg) return false;
            const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
            const msgTime = (lastMsg.messageTimestamp || 0) * 1000;
            return !lastMsg.key?.fromMe && msgTime < fourHoursAgo;
        }).length
    };
    
    // Atualizar badges
    document.getElementById('countAll').textContent = counts.all;
    
    const countUnread = document.getElementById('countUnread');
    countUnread.textContent = counts.unread;
    counts.unread > 0 ? countUnread.classList.remove('hidden') : countUnread.classList.add('hidden');
    
    const countWaiting = document.getElementById('countWaiting');
    countWaiting.textContent = counts.waiting;
    counts.waiting > 0 ? countWaiting.classList.remove('hidden') : countWaiting.classList.add('hidden');
    
    const countGroups = document.getElementById('countGroups');
    countGroups.textContent = counts.groups;
    counts.groups > 0 ? countGroups.classList.remove('hidden') : countGroups.classList.add('hidden');
    
    const countSales = document.getElementById('countSales');
    countSales.textContent = counts.sales;
    counts.sales > 0 ? countSales.classList.remove('hidden') : countSales.classList.add('hidden');
    
    const countVacuum = document.getElementById('countVacuum');
    if (countVacuum) {
        countVacuum.textContent = counts.vacuum;
        counts.vacuum > 0 ? countVacuum.classList.remove('hidden') : countVacuum.classList.add('hidden');
    }
}

// Atualizar função filterChats para suportar novos filtros
function filterChatsExtended(type) {
    currentFilter = type;
    currentTagFilter = null;
    
    // Atualizar UI das abas
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.classList.remove('bg-emerald-500', 'text-white');
        btn.classList.add('bg-slate-100', 'text-slate-600');
    });
    
    const activeTab = document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (activeTab) {
        activeTab.classList.remove('bg-slate-100', 'text-slate-600');
        activeTab.classList.add('bg-emerald-500', 'text-white');
    }
    
    renderChatsList(allChats);
}

// Busca de chats
function searchChatsFilter(query) {
    if (!query.trim()) {
        renderChatsList(allChats);
        return;
    }
    
    const q = query.toLowerCase();
    const filtered = allChats.filter(chat => {
        const name = getContactDisplayName(chat).toLowerCase();
        const phone = cleanPhoneNumber(chat.id || chat.remoteJid);
        return name.includes(q) || phone.includes(q);
    });
    
    renderChatsList(filtered);
}

// Marcar como resolvido
function markAsResolved() {
    if (!currentChatId) return;
    
    // Adicionar tag "Resolvido" se não existir
    let resolvedTag = allTags.find(t => t.name === 'Resolvido');
    if (!resolvedTag) {
        resolvedTag = { id: Date.now(), name: 'Resolvido', color: '#10b981' };
        allTags.push(resolvedTag);
        localStorage.setItem('crm_tags', JSON.stringify(allTags));
        scheduleCloudSave();
    }
    
    const currentTags = chatTags[currentChatId] || [];
    if (!currentTags.includes(resolvedTag.id)) {
        currentTags.push(resolvedTag.id);
        chatTags[currentChatId] = currentTags;
        localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
        scheduleCloudSave();
    }
    
    showToast('Conversa marcada como resolvida!', 'success');
    renderChatTags();
    loadChats();
}

// ============================================================================
// INICIALIZAÇÃO ADICIONAL
// ============================================================================

// Chamar no DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Iniciar monitoramento de conexão
    startConnectionMonitoring();
    
    // Inicializar mensagens agendadas
    initScheduledMessages();
    
    // Escutar quando um chat é aberto para mostrar toolbar
    window.addEventListener('chatSelected', function(e) {
        document.getElementById('chatToolbar').classList.remove('hidden');
        loadClientNotes();
        
        // Se o evento tiver chat, chamar openChat
        if (e.detail && e.detail.chat) {
            console.log('[chatSelected event] Chamando openChat via evento');
            openChat(e.detail.chat);
        }
    });
    
    // Expor funções globalmente para o lib-chat-loader.js
    window.openChat = openChat;
    window.loadChats = loadChats;
    window.renderChatsList = renderChatsList;
    window.applyLocalReadStates = applyLocalReadStates;
    window.getEffectiveUnreadCount = getEffectiveUnreadCount;
    window.markChatAsRead = markChatAsRead;
    console.log('✅ Funções expostas globalmente: openChat, loadChats, markChatAsRead');
});
