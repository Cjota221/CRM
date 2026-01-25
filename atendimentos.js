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

// Gravação de Áudio - NOVA VERSÃO
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let recordedAudioBlob = null;
let recordedAudioUrl = null;
let audioElement = null;

const API_BASE = 'http://localhost:3000/api';

// ============================================================================
// FUNÇÃO GLOBAL: FORMATAÇÃO DE TELEFONE
// ============================================================================
function cleanPhoneNumber(rawNumber) {
    if (!rawNumber) return '';
    
    // Remover TUDO que não é dígito: @s.whatsapp.net, @c.us, @g.us, :, etc
    let cleaned = String(rawNumber).replace(/\D/g, '');
    
    // Remover DDI 55 (Brasil) se tiver
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
        cleaned = cleaned.substring(2);
    }
    
    // Se tiver mais de 11 dígitos, pegar apenas os últimos 11 (número principal)
    // Isso trata casos onde há dígitos extras ou múltiplos números concatenados
    if (cleaned.length > 11) {
        cleaned = cleaned.slice(-11);
    }
    
    return cleaned;
}

function formatPhone(rawNumber) {
    if (!rawNumber) return 'Sem número';
    
    const cleaned = cleanPhoneNumber(rawNumber);
    
    if (!cleaned || cleaned.length < 8) return rawNumber;
    
    // Garantir que temos exatamente 10 ou 11 dígitos
    let normalized = cleaned;
    if (normalized.length > 11) {
        normalized = normalized.slice(-11); // Pegar últimos 11
    } else if (normalized.length < 10) {
        // Número muito pequeno, retornar como está
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
        // Formato básico com hífen (para números com 8-9 dígitos)
        return `+55 ${normalized.substring(0, normalized.length - 4)}-${normalized.substring(normalized.length - 4)}`;
    }
    
    return `+55 ${normalized}`;
}

// Função para extrair apenas números do telefone (para busca no banco)
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
    
    // Links clicáveis
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-blue-500 underline hover:text-blue-600">$1</a>');
    
    return formatted;
}

// Função para extrair nome de contato (prioridade: CRM > WhatsApp > Telefone)
function getContactDisplayName(chatData) {
    if (!chatData) return 'Desconhecido';
    
    const jid = chatData.id || chatData.remoteJid;
    
    // NUNCA retornar "Você" para conversas
    if (!jid) return 'Desconhecido';
    
    // Se for grupo
    if (jid.includes('@g.us')) {
        return chatData.name || chatData.subject || 'Grupo';
    }
    
    // Extrair número limpo do JID
    const cleanPhone = cleanPhoneNumber(jid);
    
    // 1. PRIORIDADE 1: Nome do CRM
    if (cleanPhone && allClients && allClients.length > 0) {
        const lastDigits = cleanPhone.slice(-9);
        const lastDigits8 = cleanPhone.slice(-8);
        
        const client = allClients.find(c => {
            const p = cleanPhoneNumber(c.telefone || c.celular || c.whatsapp || '');
            if (!p) return false;
            return p.includes(lastDigits) || p.includes(lastDigits8) || 
                   lastDigits.includes(p.slice(-8)) || lastDigits8.includes(p.slice(-8));
        });
        
        if (client && client.nome && client.nome.trim()) {
            return client.nome.trim();
        }
    }
    
    // 2. PRIORIDADE 2: PushName do WhatsApp (mas NUNCA "Você" ou "Desconhecido")
    if (chatData.pushName && chatData.pushName.trim() && 
        chatData.pushName !== 'undefined' && chatData.pushName !== 'Você' &&
        chatData.pushName !== 'Desconhecido' && chatData.pushName !== cleanPhone) {
        return chatData.pushName.trim();
    }
    
    if (chatData.name && chatData.name.trim() && 
        chatData.name !== 'undefined' && chatData.name !== 'Você' &&
        chatData.name !== 'Desconhecido' && chatData.name !== cleanPhone) {
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
    
    const cleanedPhone = cleanPhoneNumber(currentJid);
    navigator.clipboard.writeText(cleanedPhone).then(() => {
        alert('Número copiado: ' + phoneEl.innerText);
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
        const hasUnread = chat.unreadCount > 0;
        div.className = `flex items-center gap-3 p-3 border-b hover:bg-slate-50 cursor-pointer transition-colors ${hasUnread ? 'bg-green-50/30' : ''}`;
        chat.id = chatId;
        div.onclick = () => openChat(chat);
        
        // Indicador de mensagem não lida com bolinha verde
        const unreadBadge = hasUnread
            ? `<div class="flex flex-col items-center gap-1">
                 <span class="bg-emerald-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">${chat.unreadCount}</span>
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
        listEl.appendChild(div);
    });
}

// ============================================================================
// CHAT ATIVO
// ============================================================================
async function openChat(chat) {
    currentChatId = chat.id; // remoteJid
    currentChatData = chat; // Salvar dados completos
    
    // DEBUG: Ver o que está vindo
    console.log('=== DEBUG CHAT ===');
    console.log('chat.id:', chat.id);
    console.log('chat.remoteJid:', chat.remoteJid);
    console.log('chat.name:', chat.name);
    console.log('chat.pushName:', chat.pushName);
    console.log('chat completo:', chat);
    
    const isGroup = chat.isGroup || chat.id?.includes('@g.us');
    const isCommunity = chat.isCommunity;
    
    // UI Update
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');
    document.getElementById('messagesContainer').innerHTML = '<div class="text-center p-4 text-gray-500"><i class="fas fa-spinner fa-spin"></i> Carregando mensagens...</div>';
    
    // Renderizar tags do chat
    renderChatTags();
    
    // Header Info - Usar nome consistente
    const name = getContactDisplayName(chat);
    document.getElementById('headerName').innerText = name;
    
    // Subtítulo: número ou info do grupo
    const headerNumber = document.getElementById('headerNumber');
    const headerWhatsAppLink = document.getElementById('headerWhatsAppLink');
    
    if (isGroup) {
        const participantsText = chat.participantsCount ? `${chat.participantsCount} participantes` : 'Grupo';
        headerNumber.innerText = isCommunity ? `Comunidade • ${participantsText}` : participantsText;
        if (headerWhatsAppLink) headerWhatsAppLink.classList.add('hidden');
    } else {
        const jid = chat.remoteJid || chat.id;
        const cleanPhone = cleanPhoneNumber(jid);
        const formattedPhone = cleanPhone ? formatPhone(jid) : 'Número desconhecido';
        headerNumber.innerText = formattedPhone;
        
        // Link do WhatsApp Web/App
        if (headerWhatsAppLink && cleanPhone) {
            const whatsappUrl = `https://wa.me/55${cleanPhone}`;
            headerWhatsAppLink.href = whatsappUrl;
            headerWhatsAppLink.classList.remove('hidden');
        }
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
    
    // Carregar Mensagens usando remoteJid (NÃO currentChatId que é UUID)
    const remoteJidToLoad = chat.remoteJid || chat.id;
    await loadMessages(remoteJidToLoad);
    
    // Buscar Dados CRM (só para contatos individuais)
    if (!isGroup) {
        const jid = chat.remoteJid || chat.id;
        findAndRenderClientCRM(jid);
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

        // Pausar todos os áudios antes de limpar o container
        pauseAllAudios();

        container.innerHTML = '';
        
        // Inverter ordem para aparecer de baixo para cima (histórico)
        // A API geralmente retorna as ultimas primeiro.
        const sortedMsgs = messages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
        
        sortedMsgs.forEach(msg => {
            const isMe = msg.key.fromMe;
            
            // Extrair conteúdo da mensagem
            let content = '';
            let isTextMessage = false;
            const m = msg.message;
            
            if (m?.conversation) {
                content = formatWhatsAppText(m.conversation);
                isTextMessage = true;
            } else if (m?.extendedTextMessage?.text) {
                content = formatWhatsAppText(m.extendedTextMessage.text);
                isTextMessage = true;
            } else if (m?.imageMessage) {
                const caption = m.imageMessage.caption || '';
                const captionHtml = caption ? '<br>' + formatWhatsAppText(caption) : '';
                content = `<div class="flex items-center gap-2"><span class="text-lg">📷</span> <span>Imagem${captionHtml}</span></div>`;
            } else if (m?.videoMessage) {
                const caption = m.videoMessage.caption || '';
                const captionHtml = caption ? '<br>' + formatWhatsAppText(caption) : '';
                content = `<div class="flex items-center gap-2"><span class="text-lg">🎬</span> <span>Vídeo${captionHtml}</span></div>`;
            } else if (m?.audioMessage) {
                // Player de áudio estilo WhatsApp
                const audioUrl = m.audioMessage.playableUrl || m.audioMessage.url || '';
                const duration = m.audioMessage.seconds || 0;
                const audioId = `audio-${msg.key.id}`;
                
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
            
            // Renderizar balão de mensagem
            const div = document.createElement('div');
            div.className = `p-3 max-w-[70%] text-sm shadow-sm rounded-lg ${isMe ? 'msg-out' : 'msg-in'}`;
            div.innerHTML = content;
            
            // Container flex para alinhamento
            const wrap = document.createElement('div');
            wrap.className = `w-full flex mb-2 ${isMe ? 'justify-end' : 'justify-start'}`;
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

// Mapa de notas dos clientes
let clientNotes = JSON.parse(localStorage.getItem('crm_client_notes') || '{}');

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
    // chatId vem como "5511999999999@s.whatsapp.net" ou "556282237075@s.whatsapp.net"
    const panel = document.getElementById('crmDataContainer');
    
    // Limpar o JID para extrair apenas dígitos
    const whatsappPhone = chatId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    
    // Remover o DDI "55" do início se presente para comparação com números armazenados
    let phoneWithoutDDI = whatsappPhone;
    if (whatsappPhone.startsWith('55') && whatsappPhone.length > 11) {
        phoneWithoutDDI = whatsappPhone.substring(2); // Remove "55"
    }
    
    console.log('[CRM] Buscando cliente para phone:', {
        original: chatId,
        whatsappPhone,
        phoneWithoutDDI,
        clientCount: allClients.length
    });
    
    // Estratégia de Match melhorada:
    // 1. Tentar match exato (com ou sem DDI)
    // 2. Tentar match pelo último 9 dígitos
    // 3. Tentar match pelo último 8 dígitos
    let client = null;
    
    client = allClients.find(c => {
        const storedPhone = (c.telefone || c.celular || c.whatsapp || '').replace(/\D/g, '');
        if (!storedPhone) return false;
        
        // Match 1: Exato
        if (storedPhone === whatsappPhone) {
            console.log('[CRM] Match EXATO encontrado:', { stored: storedPhone, whatsapp: whatsappPhone });
            return true;
        }
        
        // Match 2: Exato sem DDI
        if (storedPhone === phoneWithoutDDI) {
            console.log('[CRM] Match EXATO (sem DDI) encontrado:', { stored: storedPhone, whatsapp: phoneWithoutDDI });
            return true;
        }
        
        // Match 3: Últimos 9 dígitos
        const last9stored = storedPhone.slice(-9);
        const last9whatsapp = phoneWithoutDDI.slice(-9);
        if (last9stored && last9whatsapp && last9stored === last9whatsapp) {
            console.log('[CRM] Match ÚLTIMOS 9 DÍGITOS encontrado:', { stored: last9stored, whatsapp: last9whatsapp });
            return true;
        }
        
        // Match 4: Últimos 8 dígitos
        const last8stored = storedPhone.slice(-8);
        const last8whatsapp = phoneWithoutDDI.slice(-8);
        if (last8stored && last8whatsapp && last8stored === last8whatsapp) {
            console.log('[CRM] Match ÚLTIMOS 8 DÍGITOS encontrado:', { stored: last8stored, whatsapp: last8whatsapp });
            return true;
        }
        
        return false;
    });
    
    // Nome do perfil WhatsApp (pushname)
    const whatsappName = currentChatData?.pushName || currentChatData?.name || 'Contato';
    
    if (!client) {
        console.log('[CRM] Cliente NÃO encontrado. Exibindo Lead Novo.');
        // CENÁRIO B: Cliente não encontrado - Lead Novo
        // Passar o número completo com DDI para renderização
        const displayPhone = whatsappPhone.startsWith('55') ? whatsappPhone : '55' + whatsappPhone;
        renderNewLeadPanel(displayPhone, whatsappName);
        currentClient = null;
        
        // Adicionar tag "Lead Novo" automaticamente
        if (!chatTags[chatId]) chatTags[chatId] = [];
        const leadTag = allTags.find(t => t.name.toLowerCase().includes('lead'));
        if (leadTag && !chatTags[chatId].includes(leadTag.id)) {
            chatTags[chatId].push(leadTag.id);
            localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
            renderChatTags();
        }
        return;
    }
    
    console.log('[CRM] Cliente ENCONTRADO:', client.nome, client.telefone || client.celular || client.whatsapp);
    
    // CENÁRIO A: Cliente encontrado
    currentClient = client;
    renderClientPanel(client, whatsappPhone);
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

async function saveNewClient() {
    const name = document.getElementById('newClientName').value.trim();
    const email = document.getElementById('newClientEmail').value.trim();
    const state = document.getElementById('newClientState').value;
    const phone = document.getElementById('newClientPhone').value;
    
    if (!name) return alert('Nome é obrigatório');
    
    // Criar novo cliente (simular API - em produção, enviar para backend)
    const newClient = {
        id: Date.now(),
        nome: name,
        email: email,
        estado: state,
        telefone: phone,
        celular: phone,
        data_cadastro: new Date().toISOString()
    };
    
    // Adicionar à lista local
    allClients.push(newClient);
    
    // Atualizar painel
    currentClient = newClient;
    renderClientPanel(newClient, phone);
    
    // Remover tag de Lead Novo
    if (currentChatId && chatTags[currentChatId]) {
        const leadTag = allTags.find(t => t.name.toLowerCase().includes('lead'));
        if (leadTag) {
            chatTags[currentChatId] = chatTags[currentChatId].filter(id => id !== leadTag.id);
            localStorage.setItem('crm_chat_tags', JSON.stringify(chatTags));
            renderChatTags();
        }
    }
    
    alert('Cliente cadastrado com sucesso!');
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
                number: currentChatId,
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
        
        setTimeout(() => loadMessages(currentChatId), 1000);
        
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
    
    container.innerHTML = products.slice(0, 50).map(p => {
        const preco = parseFloat(p.preco || 0);
        const imagem = p.imagem || 'https://via.placeholder.com/60x60?text=Sem+Foto';
        const nome = p.nome || 'Produto sem nome';
        const link = p.link_oficial || '#';
        
        return `
        <div class="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 transition">
            <img src="${imagem}" 
                 onerror="this.src='https://via.placeholder.com/60x60?text=Sem+Foto'" 
                 class="w-16 h-16 object-cover rounded-lg border border-slate-200 flex-shrink-0" 
                 alt="${escapeHtml(nome)}">
            <div class="flex-1 min-w-0">
                <h5 class="font-semibold text-sm text-slate-800 truncate">${escapeHtml(nome)}</h5>
                <p class="text-lg font-bold text-emerald-600 mt-1">R$ ${preco.toFixed(2)}</p>
            </div>
            <button onclick="sendProductMessage('${escapeHtml(nome)}', ${preco}, '${imagem}', '${link}')" 
                    class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-2 flex-shrink-0">
                <i data-lucide="send" class="w-4 h-4"></i>
                Enviar
            </button>
        </div>
    `}).join('');
    
    lucide.createIcons();
}

async function sendProductMessage(name, preco, imageUrl, link) {
    if (!currentChatId) {
        alert('Nenhuma conversa selecionada');
        return;
    }
    
    closeProductModal();
    
    try {
        // Montar mensagem formatada
        const caption = `*${name}*\n\n💰 Apenas *R$ ${preco.toFixed(2)}*\n\n👇 Compre aqui:\n${link}`;
        
        // Enviar imagem com legenda
        const phoneNumber = currentChatId.replace('@s.whatsapp.net', '').replace('@g.us', '');
        
        const response = await fetch(`${API_BASE}/whatsapp/send-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber,
                media: imageUrl,
                mediaType: 'image',
                caption: caption
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        // Recarregar mensagens
        setTimeout(() => loadMessages(currentChatId), 1000);
        
    } catch (error) {
        console.error('Erro ao enviar produto:', error);
        alert('Erro ao enviar produto: ' + error.message);
    }
}

// Manter função antiga por compatibilidade (se existir em outros lugares)
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
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

// ============================================================================
// PLAYER DE ÁUDIO ESTILO WHATSAPP
// ============================================================================

const audioPlayers = {}; // Armazena instâncias de áudio ativas

function pauseAllAudios() {
    // Pausar todos os áudios ativos e limpar referências
    Object.keys(audioPlayers).forEach(id => {
        if (audioPlayers[id] && !audioPlayers[id].paused) {
            try {
                audioPlayers[id].pause();
            } catch (e) {
                // Ignorar erros se o elemento já foi removido
            }
        }
        delete audioPlayers[id];
    });
}

function toggleAudioPlay(audioId, audioUrl) {
    const audioEl = document.getElementById(audioId);
    const playerDiv = document.querySelector(`[data-audio-id="${audioId}"]`);
    const playIcon = playerDiv.querySelector('.play-icon');
    const pauseIcon = playerDiv.querySelector('.pause-icon');
    
    if (!audioEl) return;
    
    // Pausar todos os outros áudios
    Object.keys(audioPlayers).forEach(id => {
        if (id !== audioId && audioPlayers[id] && !audioPlayers[id].paused) {
            audioPlayers[id].pause();
            const otherPlayer = document.querySelector(`[data-audio-id="${id}"]`);
            if (otherPlayer) {
                otherPlayer.querySelector('.play-icon')?.classList.remove('hidden');
                otherPlayer.querySelector('.pause-icon')?.classList.add('hidden');
            }
        }
    });
    
    // Toggle play/pause
    if (audioEl.paused) {
        // Usar promise do play() para capturar erros
        const playPromise = audioEl.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
                
                // Armazenar referência
                audioPlayers[audioId] = audioEl;
                
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
                console.log('Erro ao reproduzir áudio:', error.message);
                // Não mostrar erro ao usuário se foi abortado
            });
        }
    } else {
        audioEl.pause();
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
let allCampaigns = JSON.parse(localStorage.getItem('crm_campaigns') || '[]');
let selectedAudience = null;
let campaignImageBase64 = null;
let currentCampaignFilter = 'all';

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
        const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        const inactive = allClients.filter(c => {
            const clientOrders = allOrders.filter(o => o.cliente_id == c.id).sort((a,b) => new Date(b.data) - new Date(a.data));
            if (clientOrders.length === 0) return true;
            return new Date(clientOrders[0].data).getTime() < ninetyDaysAgo;
        });
        document.getElementById('countInactive').textContent = `${inactive.length} contatos`;
        
        // VIPs (ticket médio > 500)
        const vips = allClients.filter(c => {
            const clientOrders = allOrders.filter(o => o.cliente_id == c.id);
            const total = clientOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
            const avg = clientOrders.length > 0 ? total / clientOrders.length : 0;
            return avg >= 500;
        });
        document.getElementById('countVip').textContent = `${vips.length} contatos`;
        
        // Carregar grupos no seletor
        const groups = allChats.filter(c => c.remoteJid.includes('@g.us'));
        const select = document.getElementById('targetGroup');
        if (select) {
            select.innerHTML = '<option value="">Selecione um grupo...</option>' +
                groups.map(g => `<option value="${g.remoteJid}">${g.name || formatPhone(g.remoteJid)} (${g.participantsCount || '?'} participantes)</option>`).join('');
        }
    } catch (e) {
        console.error('Erro ao carregar dados para campanhas:', e);
    }
}

function selectAudience(type) {
    selectedAudience = type;
    
    document.querySelectorAll('.audience-btn').forEach(btn => {
        btn.classList.remove('border-primary-500', 'bg-primary-50');
        btn.classList.add('border-slate-200');
    });
    
    const selected = document.querySelector(`[data-audience="${type}"]`);
    if (selected) {
        selected.classList.add('border-primary-500', 'bg-primary-50');
        selected.classList.remove('border-slate-200');
    }
    
    document.getElementById('groupSelector').classList.toggle('hidden', type !== 'group');
    updateCampaignSummary();
}

function toggleSchedule() {
    const enabled = document.getElementById('scheduleEnabled').checked;
    document.getElementById('scheduleOptions').classList.toggle('hidden', !enabled);
}

function insertCampaignVar(varName) {
    const textarea = document.getElementById('campaignMessage');
    const start = textarea.selectionStart;
    const text = textarea.value;
    textarea.value = text.slice(0, start) + `{{${varName}}}` + text.slice(start);
    textarea.focus();
}

function previewCampaignImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        campaignImageBase64 = e.target.result;
        document.getElementById('campaignImageThumb').src = e.target.result;
        document.getElementById('campaignImagePreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeCampaignImage() {
    campaignImageBase64 = null;
    document.getElementById('campaignImage').value = '';
    document.getElementById('campaignImagePreview').classList.add('hidden');
}

function updateCampaignSummary() {
    if (!selectedAudience) return;
    
    let count = 0;
    if (selectedAudience === 'all') count = allClients.length;
    else if (selectedAudience === 'group') count = '?';
    else {
        const el = document.getElementById(`count${selectedAudience.charAt(0).toUpperCase() + selectedAudience.slice(1)}`);
        count = el ? parseInt(el.textContent) || 0 : 0;
    }
    
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const interval = parseInt(document.getElementById('batchInterval').value);
    
    const batches = Math.ceil(count / batchSize);
    const totalMinutes = batches * interval;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    
    document.getElementById('campaignSummary').textContent = 
        `${count} contatos • ${batches} lotes • ~${hours}h${mins}min para completar`;
}

function openNewCampaign() {
    document.getElementById('newCampaignModal').classList.remove('hidden');
    loadCampaignData();
    lucide.createIcons();
}

function closeNewCampaign() {
    document.getElementById('newCampaignModal').classList.add('hidden');
    document.getElementById('campaignName').value = '';
    document.getElementById('campaignMessage').value = '';
    selectedAudience = null;
    campaignImageBase64 = null;
    document.querySelectorAll('.audience-btn').forEach(btn => {
        btn.classList.remove('border-primary-500', 'bg-primary-50');
        btn.classList.add('border-slate-200');
    });
}

async function saveCampaign() {
    const name = document.getElementById('campaignName').value.trim();
    const message = document.getElementById('campaignMessage').value.trim();
    
    if (!name || !message || !selectedAudience) {
        return alert('Preencha todos os campos obrigatórios');
    }
    
    const scheduled = document.getElementById('scheduleEnabled').checked;
    let scheduleTime = null;
    
    if (scheduled) {
        const date = document.getElementById('scheduleDate').value;
        const time = document.getElementById('scheduleTime').value;
        if (!date || !time) return alert('Selecione data e hora para agendamento');
        scheduleTime = new Date(`${date}T${time}`).getTime();
    }
    
    // Construir lista de contatos baseado no público
    let contacts = [];
    if (selectedAudience === 'all') {
        contacts = allClients.map(c => ({ id: c.id, name: c.nome, phone: c.telefone || c.celular }));
    } else if (selectedAudience === 'inactive') {
        const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        contacts = allClients.filter(c => {
            const clientOrders = allOrders.filter(o => o.cliente_id == c.id).sort((a,b) => new Date(b.data) - new Date(a.data));
            if (clientOrders.length === 0) return true;
            return new Date(clientOrders[0].data).getTime() < ninetyDaysAgo;
        }).map(c => ({ id: c.id, name: c.nome, phone: c.telefone || c.celular }));
    } else if (selectedAudience === 'vip') {
        contacts = allClients.filter(c => {
            const clientOrders = allOrders.filter(o => o.cliente_id == c.id);
            const total = clientOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
            const avg = clientOrders.length > 0 ? total / clientOrders.length : 0;
            return avg >= 500;
        }).map(c => ({ id: c.id, name: c.nome, phone: c.telefone || c.celular }));
    }
    
    const campaign = {
        id: Date.now(),
        name,
        message,
        image: campaignImageBase64,
        audience: selectedAudience,
        targetGroup: selectedAudience === 'group' ? document.getElementById('targetGroup').value : null,
        batchSize: parseInt(document.getElementById('batchSize').value),
        batchInterval: parseInt(document.getElementById('batchInterval').value),
        scheduledFor: scheduleTime,
        status: scheduled ? 'scheduled' : 'running',
        createdAt: Date.now(),
        sent: 0,
        failed: 0,
        total: contacts.length,
        contacts: contacts,
        currentBatch: 0,
        lastBatchAt: null
    };
    
    allCampaigns.push(campaign);
    saveCampaigns();
    
    closeNewCampaign();
    renderCampaigns();
    updateCampaignStats();
    
    if (!scheduled) {
        startCampaign(campaign.id);
    }
    
    alert(scheduled ? 'Campanha agendada com sucesso!' : 'Campanha iniciada!');
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
                    <i data-lucide="plus" class="w-4 h-4"></i>
                    Nova Campanha
                </button>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    container.innerHTML = filtered.map(c => {
        const progress = c.total > 0 ? (c.sent / c.total * 100).toFixed(0) : 0;
        const statusColors = {
            scheduled: 'bg-amber-100 text-amber-700',
            running: 'bg-blue-100 text-blue-700',
            completed: 'bg-emerald-100 text-emerald-700',
            paused: 'bg-slate-100 text-slate-700'
        };
        const statusLabels = {
            scheduled: 'Agendada',
            running: 'Em Andamento',
            completed: 'Concluída',
            paused: 'Pausada'
        };
        
        return `
            <div class="card p-5">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-semibold text-slate-800">${escapeHtml(c.name)}</h3>
                        <p class="text-xs text-slate-500 mt-1">Criada em ${new Date(c.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span class="badge ${statusColors[c.status]}">${statusLabels[c.status]}</span>
                </div>
                
                <p class="text-sm text-slate-600 mb-4 line-clamp-2">${escapeHtml(c.message)}</p>
                
                <div class="flex items-center gap-4 mb-4">
                    <div class="flex-1">
                        <div class="flex justify-between text-xs text-slate-500 mb-1">
                            <span>${c.sent}/${c.total} enviadas</span>
                            <span>${progress}%</span>
                        </div>
                        <div class="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    ${c.failed > 0 ? `<span class="text-xs text-red-500">${c.failed} falhas</span>` : ''}
                </div>
                
                <div class="flex justify-between items-center">
                    ${c.scheduledFor ? `<span class="text-xs text-slate-500"><i data-lucide="clock" class="w-3 h-3 inline mr-1"></i>${new Date(c.scheduledFor).toLocaleString('pt-BR')}</span>` : '<span></span>'}
                    <div class="flex gap-2">
                        ${c.status === 'running' ? `
                            <button onclick="pauseCampaign(${c.id})" class="btn btn-secondary text-xs py-1.5 px-3">
                                <i data-lucide="pause" class="w-3 h-3"></i> Pausar
                            </button>
                        ` : ''}
                        ${c.status === 'paused' ? `
                            <button onclick="resumeCampaign(${c.id})" class="btn btn-success text-xs py-1.5 px-3">
                                <i data-lucide="play" class="w-3 h-3"></i> Retomar
                            </button>
                        ` : ''}
                        ${c.status === 'scheduled' ? `
                            <button onclick="startCampaign(${c.id})" class="btn btn-success text-xs py-1.5 px-3">
                                <i data-lucide="play" class="w-3 h-3"></i> Iniciar
                            </button>
                        ` : ''}
                        <button onclick="deleteCampaign(${c.id})" class="btn btn-danger text-xs py-1.5 px-3">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

function updateCampaignStats() {
    const today = new Date().toDateString();
    const sentToday = allCampaigns
        .filter(c => c.status === 'completed' && new Date(c.createdAt).toDateString() === today)
        .reduce((sum, c) => sum + c.sent, 0);
    
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
        
        const filterName = id.replace('campFilter', '').toLowerCase();
        if (filterName === filter || (filter === 'all' && id === 'campFilterAll')) {
            btn.classList.add('bg-slate-100', 'text-slate-700');
            btn.classList.remove('text-slate-500');
        } else {
            btn.classList.remove('bg-slate-100', 'text-slate-700');
            btn.classList.add('text-slate-500');
        }
    });
    
    renderCampaigns();
}

function searchCampaigns(query) {
    // Implementar se necessário
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

async function processCampaignBatch(id) {
    const campaign = allCampaigns.find(c => c.id === id);
    if (!campaign || campaign.status !== 'running') return;
    
    const startIdx = campaign.sent;
    const endIdx = Math.min(startIdx + campaign.batchSize, campaign.total);
    const batch = campaign.contacts.slice(startIdx, endIdx);
    
    for (const contact of batch) {
        if (!contact.phone) {
            campaign.failed++;
            continue;
        }
        
        try {
            let text = campaign.message.replace(/\{\{nome\}\}/gi, contact.name || 'Cliente');
            
            const phone = contact.phone.replace(/\D/g, '');
            
            await fetch(`${API_BASE}/whatsapp/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: phone, text })
            });
            
            campaign.sent++;
            
            // Delay entre mensagens (2-5 segundos)
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
            
        } catch (e) {
            console.error('Erro ao enviar:', e);
            campaign.failed++;
        }
    }
    
    campaign.currentBatch++;
    campaign.lastBatchAt = Date.now();
    
    if (campaign.sent >= campaign.total) {
        campaign.status = 'completed';
    }
    
    saveCampaigns();
    renderCampaigns();
    updateCampaignStats();
    
    if (campaign.status === 'running') {
        setTimeout(() => processCampaignBatch(id), campaign.batchInterval * 60 * 1000);
    }
}

function pauseCampaign(id) {
    const campaign = allCampaigns.find(c => c.id === id);
    if (campaign) {
        campaign.status = 'paused';
        saveCampaigns();
        renderCampaigns();
        updateCampaignStats();
    }
}

function resumeCampaign(id) {
    startCampaign(id);
}

function deleteCampaign(id) {
    if (!confirm('Excluir esta campanha?')) return;
    allCampaigns = allCampaigns.filter(c => c.id !== id);
    saveCampaigns();
    renderCampaigns();
    updateCampaignStats();
}

function saveCampaigns() {
    localStorage.setItem('crm_campaigns', JSON.stringify(allCampaigns));
}

function openImportFromGroup() {
    alert('Funcionalidade em desenvolvimento: Importar contatos de grupos do WhatsApp');
}
