// Variáveis de Estado
let currentChatId = null;
let currentClient = null;
let allClients = [];
let allProducts = [];
let allOrders = [];
let chatRefreshInterval = null;

const API_BASE = 'http://localhost:3000/api';

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar conexão WhatsApp
    await checkConnection();

    // 2. Carregar dados do CRM (Clientes/Produtos/Pedidos)
    loadCRMData();

    // 3. Carregar Conversas
    loadChats();

    // Setup de inputs
    const inputMsg = document.getElementById('inputMessage');
    inputMsg.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
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
async function loadChats() {
    const listEl = document.getElementById('chatsList');
    try {
        const res = await fetch(`${API_BASE}/whatsapp/chats`);
        const chats = await res.json();
        
        listEl.innerHTML = '';
        
        if (!Array.isArray(chats) || chats.length === 0) {
            listEl.innerHTML = '<p class="text-center text-gray-400 text-sm p-4">Nenhuma conversa encontrada.</p>';
            return;
        }

        // Ordenar por data (assumindo campo date ou conversationTimestamp)
        // Adjuste conforme retorno exato da sua versão da Evolution
        
        chats.forEach(chat => {
            // Formatação básica: Usa remoteJid se id estiver vazio
            const chatId = chat.id || chat.remoteJid;
            const name = chat.name || chat.pushName || formatPhone(chatId);
            const lastMsg = chat.lastMessage?.message?.conversation || 
                           chat.lastMessage?.message?.extendedTextMessage?.text || 
                           'Imagem/Audio';
            // Converter timestamp se existir
            const time = ''; // Implementar formatação de hora
            
            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 p-3 border-b hover:bg-gray-100 cursor-pointer transition-colors';
            // Passa o objeto chat, mas garante que ele tenha ID para o click
            chat.id = chatId; 
            div.onclick = () => openChat(chat);
            
            div.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center font-bold text-gray-600">
                    ${name.charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline">
                        <h4 class="font-medium text-gray-800 truncate text-sm">${name}</h4>
                        <span class="text-xs text-gray-400">${time}</span>
                    </div>
                    <p class="text-xs text-gray-500 truncate h-4">${lastMsg}</p>
                </div>
            `;
            listEl.appendChild(div);
        });

    } catch (e) {
        listEl.innerHTML = '<p class="text-center text-red-400 text-sm p-4">Erro ao listar chats.</p>';
        console.error(e);
    }
}

// ============================================================================
// CHAT ATIVO
// ============================================================================
async function openChat(chat) {
    currentChatId = chat.id; // remoteJid
    
    // UI Update
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');
    document.getElementById('messagesContainer').innerHTML = '<div class="text-center p-4 text-gray-500"><i class="fas fa-spinner fa-spin"></i> Carregando mensagens...</div>';
    
    // Header Info
    const name = chat.name || chat.pushName || formatPhone(chat.id);
    document.getElementById('headerName').innerText = name;
    document.getElementById('headerInitials').innerText = name.charAt(0).toUpperCase();
    document.getElementById('headerNumber').innerText = formatPhone(chat.id);
    
    // Carregar Mensagens
    await loadMessages(currentChatId);
    
    // Buscar Dados CRM
    findAndRenderClientCRM(chat.id);
    
    // Auto refresh (simples - polling a cada 5s)
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => loadMessages(currentChatId, true), 10000);
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
            const content = msg.message?.conversation || 
                          msg.message?.extendedTextMessage?.text || 
                          (msg.message?.imageMessage ? '[Imagem]' : '[Mídia/Outro]');
            
            const div = document.createElement('div');
            div.className = `p-3 max-w-[70%] text-sm shadow-sm ${isMe ? 'msg-out bg-green-100' : 'msg-in bg-white'}`;
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
    if (!text || !currentChatId) return;
    
    // UI otimista
    input.value = '';
    const container = document.getElementById('messagesContainer');
    const wrap = document.createElement('div');
    wrap.className = 'w-full flex justify-end opacity-50'; // Opacity indica enviando
    wrap.innerHTML = `<div class="p-3 max-w-[70%] text-sm shadow-sm msg-out bg-green-50"><p>${text}</p></div>`;
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
