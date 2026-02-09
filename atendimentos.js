// ============================================================================
// INICIALIZAÇÃO DO SISTEMA - Nova Arquitetura Profissional
// ============================================================================

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
let allClients = [];
let allProducts = [];
let allOrders = [];
let allChats = []; // Armazena todos os chats para filtro
let currentFilter = 'all'; // 'all', 'unread', 'waiting', 'groups', 'sales', 'vacuum', 'snoozed'
let currentTagFilter = null;
let chatRefreshInterval = null;
let connectionCheckInterval = null;

// Sistema de Tags
let allTags = JSON.parse(localStorage.getItem('crm_tags') || '[]');
let chatTags = JSON.parse(localStorage.getItem('crm_chat_tags') || '{}'); // { chatId: [tagId, tagId] }

// Sistema de Mensagens Rápidas
let quickReplies = JSON.parse(localStorage.getItem('crm_quick_replies') || '[]');
let editingQuickReplyId = null;

// Sistema de Snooze
let snoozedChats = JSON.parse(localStorage.getItem('crm_snoozed') || '{}'); // { chatId: timestamp }

// Sistema de Notas dos Clientes
let clientNotes = JSON.parse(localStorage.getItem('crm_client_notes') || '{}'); // { chatId: { text, history: [] } }

// Sistema de Agendamento
let scheduledMessages = JSON.parse(localStorage.getItem('crm_scheduled') || '[]');

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

const API_BASE = '/api';

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

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Escutar evento de dados carregados do Supabase para atualizar variáveis
    window.addEventListener('crm-cloud-loaded', () => {
        console.log('[Atendimento] Recarregando dados do Supabase...');
        allTags = JSON.parse(localStorage.getItem('crm_tags') || '[]');
        chatTags = JSON.parse(localStorage.getItem('crm_chat_tags') || '{}');
        quickReplies = JSON.parse(localStorage.getItem('crm_quick_replies') || '[]');
        snoozedChats = JSON.parse(localStorage.getItem('crm_snoozed') || '{}');
        clientNotes = JSON.parse(localStorage.getItem('crm_client_notes') || '{}');
        scheduledMessages = JSON.parse(localStorage.getItem('crm_scheduled') || '[]');
        loadCRMData();
    });

    // 1. Verificar conexão WhatsApp
    await checkConnection();

    // 2. Carregar dados do CRM (Clientes/Produtos/Pedidos)
    loadCRMData();

    // 3. Inicializar novo sistema de chats
    await initializeApp();

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
        
        renderChatsList(allChats);
        updateFilterCounts(); // Atualizar contadores das abas
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
    
    // Filtro de tipo (all, unread, waiting, groups, sales, vacuum, snoozed)
    if (currentFilter === 'chats') {
        filteredChats = filteredChats.filter(c => !c.isGroup);
    } else if (currentFilter === 'unread') {
        // Não Lidos: unreadCount > 0
        filteredChats = filteredChats.filter(c => c.unreadCount > 0);
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
    
    // Extrair e normalizar o remoteJid para este chat
    const remoteJidParam = chat.remoteJid || chat.id;
    currentRemoteJid = remoteJidParam; // GUARDAR para validação depois
    const cleanPhone = extractPhoneFromJid(remoteJidParam);
    
    console.log('Telefone extraído:', cleanPhone);
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
        const formattedPhone = cleanPhone ? formatPhone(cleanPhone) : 'Número desconhecido';
        headerNumber.innerText = formattedPhone;
        console.log('Telefone formatado no header:', formattedPhone);
        
        if (headerWhatsAppLink && cleanPhone) {
            headerWhatsAppLink.href = `https://wa.me/55${cleanPhone}`;
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
    
    // Auto refresh (simples - polling a cada 5s)
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => loadMessages(currentRemoteJid, true), 10000);
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
    console.log('\n🔥🔥🔥 FUNÇÃO loadMessages CHAMADA! 🔥🔥🔥');
    console.log('remoteJid:', remoteJid);
    console.log('isUpdate:', isUpdate);
    
    if (!remoteJid) {
        console.error('[❌ ERRO] RemoteJid inválido:', remoteJid);
        return;
    }
    
    console.log('\n📨 INICIANDO CARREGAMENTO DE MENSAGENS');
    console.log('RemoteJid solicitado:', remoteJid);
    console.log('RemoteJid atual no state:', currentRemoteJid);
    
    // VALIDAÇÃO CRÍTICA: Garantir que esse carregamento é para o chat atual
    if (currentRemoteJid !== remoteJid) {
        console.warn('[⚠️ AVISO] RemoteJid diferente do esperado!');
        console.warn('Esperado:', currentRemoteJid);
        console.warn('Recebido:', remoteJid);
        // Atualizar para o correto
        currentRemoteJid = remoteJid;
    }
    
    try {
        console.log('📡 Fazendo fetch para:', `${API_BASE}/whatsapp/messages/fetch`);
        const res = await fetch(`${API_BASE}/whatsapp/messages/fetch`, {
            method: 'POST',
            body: JSON.stringify({ remoteJid }),
            headers: {'Content-Type': 'application/json'}
        });
        
        console.log('📡 Response status:', res.status);
        console.log('📡 Response ok:', res.ok);
        
        if (!res.ok) {
            console.error('❌ ERRO HTTP:', res.status, res.statusText);
            const errorText = await res.text();
            console.error('Corpo do erro:', errorText);
            return;
        }
        
        const data = await res.json();
        
        console.log('📦 Resposta da API recebida');
        console.log('Tipo:', typeof data);
        console.log('É array?', Array.isArray(data));
        console.log('Tem property "messages"?', !!data?.messages);
        
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
        
        console.log(`📊 Total de mensagens recebidas: ${messages.length}`);
        
        const container = document.getElementById('messagesContainer');
        if (!container) {
            console.error('[❌ ERRO] Container de mensagens não encontrado!');
            return;
        }
        
        // ====== VALIDAÇÃO CRÍTICA: FILTRAR MENSAGENS POR REMOTEJID ======
        // Isso garante que NÃO haja mistura de conversas
        const beforeFilterCount = messages.length;
        
        // Extrair número do remoteJid solicitado para comparação
        const requestPhoneNormalized = extractPhoneFromJid(remoteJid);
        const isGroupRequest = String(remoteJid).includes('@g.us');
        const isLidRequest = String(remoteJid).includes('@lid');
        
        messages = messages.filter(msg => {
            const msgRemoteJid = msg.key?.remoteJid || msg.remoteJid || '';
            
            // Match exato de JID (funciona para @lid, @s.whatsapp.net, @g.us)
            if (msgRemoteJid === remoteJid) return true;
            
            // Se for grupo, comparar sem sufixo
            if (isGroupRequest) {
                return msgRemoteJid.replace(/@g\.us$/, '') === remoteJid.replace(/@g\.us$/, '');
            }
            
            // @lid: exigir match exato (já testado acima) — não tentar normalizar como telefone
            if (isLidRequest) return false;
            
            // Para contatos @s.whatsapp.net, usar normalização de telefone
            const msgPhoneNormalized = extractPhoneFromJid(msgRemoteJid);
            
            const matches = msgPhoneNormalized === requestPhoneNormalized ||
                           (msgPhoneNormalized.length >= 9 && requestPhoneNormalized.length >= 9 &&
                            msgPhoneNormalized.slice(-9) === requestPhoneNormalized.slice(-9));
            
            if (!matches && msgRemoteJid) {
                console.warn(`[⚠️ REJEITADO] msg=${msgRemoteJid} expected=${remoteJid}`);
            }
            
            return matches;
        });
        
        console.log(`🔍 Filtrado: ${beforeFilterCount} → ${messages.length} mensagens válidas`);
        
        // Se não tiver mensagens ou formato inválido, mostrar mensagem vazia
        if (!messages || !Array.isArray(messages)) {
            console.log('❌ Sem mensagens ou formato inválido');
            container.innerHTML = '<div class="text-center p-4 text-gray-500">Nenhuma mensagem nesta conversa.</div>';
            return;
        }
        
        // ====== OTIMIZAÇÃO: Pular re-render se mensagens não mudaram ======
        if (isUpdate && messages.length > 0) {
            const newHash = messages.map(m => m.key?.id || m.messageTimestamp).join(',');
            if (window._lastMsgHash === newHash) {
                // Sem mudanças — não re-renderizar
                return;
            }
            window._lastMsgHash = newHash;
        } else if (messages.length > 0) {
            window._lastMsgHash = messages.map(m => m.key?.id || m.messageTimestamp).join(',');
        }

        // Pausar todos os áudios antes de limpar o container
        pauseAllAudios();

        // LIMPAR COMPLETAMENTE o container anterior
        container.innerHTML = '';
        
        if (messages.length === 0) {
            console.log('ℹ️ Sem mensagens para exibir');
            container.innerHTML = '<div class="text-center p-4 text-gray-500">Nenhuma mensagem nesta conversa.</div>';
            return;
        }
        
        // Ordenar por timestamp (ascendente = mais antigo para mais novo)
        const sortedMsgs = messages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
        
        console.log(`📝 Renderizando ${sortedMsgs.length} mensagens...`);
        
        sortedMsgs.forEach((msg, index) => {
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
        
        console.log('✅ Mensagens carregadas com sucesso');
        console.log('════════════════════════════════\n');
        
    } catch (e) {
        console.error('❌ Erro ao carregar mensagens:', e);
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.innerHTML = '<div class="text-center p-4 text-red-500">Erro ao carregar mensagens</div>';
        }
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
    // chatId vem como "5594984121802@s.whatsapp.net" ou "556282237075@s.whatsapp.net"
    const panel = document.getElementById('crmDataContainer');
    
    // Usar normalizePhone centralizado (lib-data-layer.js)
    // Remove @s.whatsapp.net, DDI 55, e limpa caracteres
    const whatsappPhone = chatId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const normalizedPhone = (typeof normalizePhone === 'function') ? normalizePhone(chatId) : whatsappPhone;
    
    console.log(`[CRM Brain] Buscando: raw="${chatId}" → whatsapp="${whatsappPhone}" → normalized="${normalizedPhone}"`);
    
    // Nome do perfil WhatsApp (pushname)
    const whatsappName = currentChatData?.pushName || currentChatData?.name || 'Contato';
    
    // Mostrar loading
    panel.innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
    `;
    
    // Chamar API do "Cérebro" — enviar o telefone completo COM DDI
    // O servidor agora faz normalização e fuzzy match internamente
    fetch(`${API_BASE}/client-brain/${whatsappPhone}`)
        .then(res => res.json())
        .then(data => {
            console.log('[CRM Brain] Resposta:', data.found ? `✅ ${data.client?.name}` : '❌ Lead Novo');
            
            if (!data.found) {
                // Tentar fallback local antes de declarar Lead Novo
                const localResult = tryLocalClientMatch(normalizedPhone);
                if (localResult) {
                    console.log('[CRM Brain] Fallback local encontrou:', localResult.nome || localResult.name);
                    currentClient = localResult;
                    renderLocalClientPanel(localResult, whatsappPhone);
                } else {
                    renderNewLeadPanelBrain(whatsappPhone, whatsappName, data);
                }
            } else {
                // Cliente encontrado - atualizar nome no header se disponível
                currentClient = data.client;
                if (data.client?.name) {
                    const headerName = document.getElementById('headerName');
                    if (headerName) headerName.innerText = data.client.name;
                }
                renderClientPanelBrain(data, whatsappPhone);
            }
        })
        .catch(err => {
            console.error('[CRM Brain] Erro:', err);
            // Fallback: usar busca local
            fallbackLocalClientSearch(chatId, whatsappPhone, normalizedPhone, whatsappName);
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
        String(o.id_cliente) === String(client.id) || String(o.cliente_id) === String(client.id)
    );
    
    const totalSpent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.valor_total) || 0), 0);
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
                <span class="font-bold text-emerald-600 text-sm">R$ ${parseFloat(o.valor_total || 0).toFixed(2)}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs text-slate-500">${o.data ? new Date(o.data).toLocaleDateString('pt-BR') : '-'}</span>
                <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${(o.itens || o.products || []).length} itens</span>
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
    
    // Produtos frequentes HTML
    const productsHtml = brainData.products && brainData.products.length > 0 
        ? brainData.products.map(p => `
            <div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-sm text-slate-700 truncate flex-1">${escapeHtml(p.name)}</span>
                <span class="text-xs text-slate-400 ml-2">${p.qty}x</span>
            </div>
        `).join('')
        : '<p class="text-xs text-slate-400 text-center py-2">Sem histórico de produtos</p>';
    
    // Últimos pedidos HTML
    const ordersHtml = brainData.orders && brainData.orders.length > 0
        ? brainData.orders.map(o => `
            <div class="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
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
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold backdrop-blur">
                        ${client.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-lg truncate">${escapeHtml(client.name)}</h3>
                        <p class="text-sm opacity-90">${brainData.statusEmoji} ${brainData.status}</p>
                    </div>
                </div>
                <p class="text-sm opacity-90">${brainData.insight}</p>
            </div>
            
            <!-- KPIs -->
            <div class="grid grid-cols-3 gap-2">
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Pedidos</p>
                    <p class="text-xl font-bold text-slate-800">${metrics.ordersCount}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Ticket</p>
                    <p class="text-lg font-bold text-emerald-600">R$ ${parseInt(metrics.avgTicket)}</p>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl text-center">
                    <p class="text-xs text-slate-500 mb-1">Total</p>
                    <p class="text-lg font-bold text-blue-600">R$ ${parseInt(metrics.totalSpent)}</p>
                </div>
            </div>
            
            <!-- Última Compra -->
            ${metrics.lastPurchaseDate ? `
                <div class="bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-xl flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <i data-lucide="calendar" class="w-5 h-5 text-slate-500"></i>
                    </div>
                    <div>
                        <p class="text-xs text-slate-500">Última compra</p>
                        <p class="font-semibold text-slate-800">${new Date(metrics.lastPurchaseDate).toLocaleDateString('pt-BR')} <span class="text-slate-400 font-normal">(${metrics.daysSinceLastPurchase}d)</span></p>
                    </div>
                </div>
            ` : ''}
            
            <!-- Produtos Frequentes -->
            <div class="border border-slate-200 rounded-xl p-3">
                <h4 class="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">
                    <i data-lucide="star" class="w-4 h-4 text-amber-500"></i>
                    Produtos Favoritos
                </h4>
                <div class="max-h-32 overflow-y-auto">
                    ${productsHtml}
                </div>
            </div>
            
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
                <button onclick="generateCoupon('${client.id}')" class="w-full btn btn-secondary text-sm">
                    <i data-lucide="ticket" class="w-4 h-4"></i>
                    Gerar Cupom Exclusivo
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
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
    
    // Atualizar nome no header imediatamente se este é o chat atual
    if (currentRemoteJid === chatId || currentChatId === chatId) {
        const headerNameEl = document.getElementById('headerName');
        if (headerNameEl) {
            headerNameEl.innerText = newName;
            console.log('[SYNC] ✅ Header atualizado');
        }
    }
    
    // Atualizar na lista de chats (sidebar)
    const chatElement = document.querySelector(`[data-chat-id="${chatId}"]`);
    if (chatElement) {
        const nameElement = chatElement.querySelector('.chat-name');
        if (nameElement) {
            nameElement.innerText = newName;
            console.log('[SYNC] ✅ Lista de chats atualizada');
        }
    }
    
    // Atualizar no array em memória
    const chatIndex = allChats.findIndex(c => c.id === chatId || c.remoteJid === chatId);
    if (chatIndex !== -1) {
        allChats[chatIndex].name = newName;
        allChats[chatIndex].pushName = newName;
        console.log('[SYNC] ✅ Array allChats atualizado');
    }
    
    // Sincronizar com backend se tiver integração com Supabase/CRM
    try {
        const phone = extractPhoneFromJid(chatId);
        if (phone) {
            const res = await fetch(`${API_BASE}/sync-client-name`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    phone: phone,
                    newName: newName,
                    chatId: chatId
                })
            });
            const result = await res.json();
            console.log('[SYNC] Backend respondeu:', result);
        }
    } catch (e) {
        console.warn('[SYNC] Não conseguiu sincronizar com backend:', e);
        // Isso não é crítico - o frontend já está atualizado
    }
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
            scheduleCloudSave();
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
    container.innerHTML = products.slice(0, 60).map((p, idx) => {
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
    container.innerHTML = '<div class="grid grid-cols-3 gap-3">' + products.slice(0, 60).map((p, idx) => {
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
    
    // Template profissional
    const caption = `${greeting}Olha que linda essa opção! ✨\n\n*${nome}*\nPor apenas *R$ ${preco.toFixed(2)}*\n\nVeja mais detalhes e feche seu pedido aqui:\n${link}`;
    
    try {
        const remoteJid = currentChatData?.remoteJid || currentChatId;
        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        
        // Tentar enviar com imagem primeiro
        if (imagem && !imagem.includes('placeholder')) {
            const response = await fetch(`${API_BASE}/whatsapp/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber,
                    media: imagem,
                    mediaType: 'image',
                    caption: caption
                })
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);
        } else {
            // Sem imagem: enviar como texto
            const response = await fetch(`${API_BASE}/whatsapp/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber,
                    message: caption
                })
            });
            const result = await response.json();
            if (result.error) throw new Error(result.error);
        }
        
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
        const caption = `Olha que linda essa opção! ✨\n\n*${name}*\nPor apenas *R$ ${parseFloat(preco).toFixed(2)}*\n\nVeja mais detalhes e feche seu pedido aqui:\n${link}`;
        const phoneNumber = (currentChatData?.remoteJid || currentChatId).replace('@s.whatsapp.net', '').replace('@g.us', '');
        const response = await fetch(`${API_BASE}/whatsapp/send-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber, media: imageUrl, mediaType: 'image', caption })
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
    input.value = `Olha esse produto: ${name} – ${link}`;
    await sendMessage();
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
    scheduleCloudSave();
}

function openImportFromGroup() {
    alert('Funcionalidade em desenvolvimento: Importar contatos de grupos do WhatsApp');
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
        console.warn('[updateConnectionUI] Elementos de conexão não encontrados no DOM');
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
    // Verificar imediatamente
    checkConnectionStatus();
    
    // Verificar a cada 30 segundos
    if (connectionCheckInterval) clearInterval(connectionCheckInterval);
    connectionCheckInterval = setInterval(checkConnectionStatus, 30000);
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
        unread: allChats.filter(c => c.unreadCount > 0).length,
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
    console.log('✅ Funções expostas globalmente: openChat, loadChats');
});
