// ============================================================================
// CRM FacilZap - Sistema Completo com Armazenamento Local
// ============================================================================

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe || '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check-circle text-green-500' : type === 'error' ? 'times-circle text-red-500' : 'info-circle text-blue-500'} mr-3"></i>
            <span>${message}</span>
        </div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        return new Date(dateStr).toLocaleDateString('pt-BR');
    } catch {
        return 'N/A';
    }
}

function formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ============================================================================
// ARMAZENAMENTO LOCAL (LocalStorage)
// ============================================================================

const Storage = {
    KEYS: {
        CLIENTS: 'crm_clients',
        PRODUCTS: 'crm_products',
        ORDERS: 'crm_orders',
        SETTINGS: 'crm_settings',
        LAST_SYNC: 'crm_last_sync'
    },

    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Erro ao salvar no localStorage:', e);
            return false;
        }
    },

    load(key, defaultValue = []) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('Erro ao carregar do localStorage:', e);
            return defaultValue;
        }
    },

    getClients() {
        return this.load(this.KEYS.CLIENTS, []);
    },

    saveClients(clients) {
        return this.save(this.KEYS.CLIENTS, clients);
    },

    getProducts() {
        return this.load(this.KEYS.PRODUCTS, []);
    },

    saveProducts(products) {
        return this.save(this.KEYS.PRODUCTS, products);
    },

    getOrders() {
        return this.load(this.KEYS.ORDERS, []);
    },

    saveOrders(orders) {
        return this.save(this.KEYS.ORDERS, orders);
    },

    getSettings() {
        return this.load(this.KEYS.SETTINGS, {
            activeDays: 30,
            riskDays: 60,
            geminiApiKey: ''
        });
    },

    saveSettings(settings) {
        return this.save(this.KEYS.SETTINGS, settings);
    },

    getLastSync() {
        return this.load(this.KEYS.LAST_SYNC, null);
    },

    saveLastSync(date) {
        return this.save(this.KEYS.LAST_SYNC, date);
    },

    clearAll() {
        Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
    }
};

// ============================================================================
// INTEGRAÇÃO COM IA (Google Gemini - GRATUITO)
// ============================================================================

const AIAssistant = {
    async generateStrategy(segmentData) {
        const settings = Storage.getSettings();
        if (!settings.geminiApiKey) {
            throw new Error('API Key do Gemini não configurada. Vá em Configurações.');
        }

        const prompt = `Você é um especialista em Growth e CRM para e-commerce. Analise os dados abaixo e me dê:
1. Uma análise breve do cenário (2-3 frases)
2. Uma estratégia de ação específica
3. Três opções de copy (texto) para mensagem de WhatsApp

DADOS DO SEGMENTO:
${JSON.stringify(segmentData, null, 2)}

Responda em JSON com o formato:
{
  "analise": "texto da análise",
  "estrategia": "texto da estratégia",
  "copies": [
    {"titulo": "Título 1", "mensagem": "Mensagem completa 1"},
    {"titulo": "Título 2", "mensagem": "Mensagem completa 2"},
    {"titulo": "Título 3", "mensagem": "Mensagem completa 3"}
  ]
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1500
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Erro na API do Gemini');
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Tentar parsear JSON da resposta
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Erro ao parsear resposta da IA:', e);
        }
        
        return { analise: content, estrategia: '', copies: [] };
    },

    async generatePersonalizedMessage(client, context = '') {
        const settings = Storage.getSettings();
        if (!settings.geminiApiKey) {
            throw new Error('API Key do Gemini não configurada. Vá em Configurações.');
        }

        const clientInfo = {
            nome: client.name.split(' ')[0], // Primeiro nome
            diasSemComprar: getDaysSinceLastPurchase(client),
            totalGasto: client.totalSpent,
            numeroPedidos: client.orderCount,
            produtosComprados: client.products?.slice(0, 5).map(p => p.name) || [],
            estado: getClientState(client).uf
        };

        const prompt = `Crie uma mensagem curta e personalizada de WhatsApp para reativar este cliente:

CLIENTE:
- Nome: ${clientInfo.nome}
- Dias sem comprar: ${clientInfo.diasSemComprar}
- Total já gasto: R$ ${clientInfo.totalGasto.toFixed(2)}
- Produtos que já comprou: ${clientInfo.produtosComprados.join(', ') || 'Não identificado'}
- Estado: ${clientInfo.estado}
${context ? `\nCONTEXTO ADICIONAL: ${context}` : ''}

REGRAS:
- Máximo 300 caracteres
- Tom amigável e pessoal
- Mencione um produto que ele já comprou se possível
- Inclua um benefício ou promoção fictícia
- Use emojis com moderação

Responda APENAS com a mensagem, sem explicações.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 200
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Erro na API do Gemini');
        }

        const data = await response.json();
        return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    },

    // Gerar mensagem sem IA (template básico)
    generateBasicMessage(client) {
        const firstName = client.name.split(' ')[0];
        const days = getDaysSinceLastPurchase(client);
        const product = client.products?.[0]?.name || 'nossos produtos';
        
        const templates = [
            `Oi ${firstName}! 😊 Faz ${days} dias que não te vemos por aqui. Sentimos sua falta! Que tal conferir as novidades? Temos condições especiais para você! 🎁`,
            `${firstName}, tudo bem? Vi que faz um tempinho que você não compra ${product}. Chegou reposição e separei um cupom especial pra você! 💝`,
            `Olá ${firstName}! 👋 Lembrei de você hoje! Temos novidades incríveis e um desconto exclusivo esperando por você. Vem conferir! ✨`
        ];
        
        return templates[Math.floor(Math.random() * templates.length)];
    },

    // IA sugere parâmetros ideais de classificação
    async suggestClassificationParams() {
        const settings = Storage.getSettings();
        if (!settings.geminiApiKey) {
            throw new Error('API Key do Gemini não configurada. Vá em Configurações.');
        }

        const clients = Storage.getClients();
        const orders = Storage.getOrders();
        
        // Calcular estatísticas dos dados
        const clientsWithOrders = clients.filter(c => c.orderCount > 0);
        const daysSinceLastPurchase = clientsWithOrders.map(c => {
            if (!c.lastPurchaseDate) return 999;
            const days = Math.ceil((new Date() - new Date(c.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
            return days;
        }).sort((a, b) => a - b);
        
        const totalSpentValues = clientsWithOrders.map(c => c.totalSpent).sort((a, b) => a - b);
        const orderCounts = clientsWithOrders.map(c => c.orderCount).sort((a, b) => a - b);
        
        // Calcular percentis
        const percentile = (arr, p) => arr[Math.floor(arr.length * p)] || 0;
        
        const stats = {
            totalClientes: clients.length,
            clientesComPedidos: clientsWithOrders.length,
            diasSemComprar: {
                minimo: daysSinceLastPurchase[0] || 0,
                percentil25: percentile(daysSinceLastPurchase, 0.25),
                mediana: percentile(daysSinceLastPurchase, 0.5),
                percentil75: percentile(daysSinceLastPurchase, 0.75),
                maximo: daysSinceLastPurchase[daysSinceLastPurchase.length - 1] || 0
            },
            valorGasto: {
                minimo: totalSpentValues[0] || 0,
                percentil25: percentile(totalSpentValues, 0.25),
                mediana: percentile(totalSpentValues, 0.5),
                percentil75: percentile(totalSpentValues, 0.75),
                percentil90: percentile(totalSpentValues, 0.9),
                maximo: totalSpentValues[totalSpentValues.length - 1] || 0
            },
            pedidos: {
                media: clientsWithOrders.reduce((s, c) => s + c.orderCount, 0) / clientsWithOrders.length || 0,
                mediana: percentile(orderCounts, 0.5),
                percentil75: percentile(orderCounts, 0.75)
            },
            totalPedidos: orders.length,
            ticketMedioGeral: orders.reduce((s, o) => s + o.total, 0) / orders.length || 0
        };

        const prompt = `Você é um especialista em CRM e análise de dados de e-commerce. 
Analise as estatísticas abaixo da base de clientes e sugira os PARÂMETROS IDEAIS para classificação.

ESTATÍSTICAS DA BASE:
${JSON.stringify(stats, null, 2)}

Com base nesses dados, sugira:

1. **TERMÔMETRO DE CLIENTES** (dias sem comprar):
   - Até quantos dias = Cliente QUENTE (engajado, recente)
   - Até quantos dias = Cliente MORNO (precisa de atenção)
   - Acima de quantos dias = Cliente FRIO (risco de churn)

2. **CLASSIFICAÇÃO VIP**:
   - A partir de quanto gasto total = VIP
   - A partir de quanto gasto = SUPER VIP
   - OU: a partir de quantos pedidos = Cliente Fiel

3. **ANÁLISE E RECOMENDAÇÕES**:
   - O que você observa nessa base?
   - Qual o maior risco/oportunidade?
   - Uma ação prioritária sugerida

Responda em JSON:
{
  "termometro": {
    "quente_ate_dias": número,
    "morno_ate_dias": número,
    "justificativa": "explicação"
  },
  "vip": {
    "vip_valor_minimo": número,
    "super_vip_valor_minimo": número,
    "fiel_pedidos_minimo": número,
    "justificativa": "explicação"
  },
  "analise": {
    "observacoes": "texto",
    "maior_risco": "texto",
    "maior_oportunidade": "texto",
    "acao_prioritaria": "texto"
  }
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.5,
                    maxOutputTokens: 1500
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Erro na API do Gemini');
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Erro ao parsear resposta da IA:', e);
        }
        
        return { error: 'Não foi possível processar a resposta', raw: content };
    }
};

// ============================================================================
// ELEMENTOS DO DOM
// ============================================================================

let clientCardsContainer, productCardsContainer, orderListContainer;
let searchInput, productSearchInput, orderSearchInput;
let filterStatusSelect, filterTagSelect, sortClientsSelect;
let filterStockSelect, filterActiveSelect;
let clientCountDisplay, productCountDisplay, orderCountDisplay;
let noClientsMessage, noProductsMessage, noOrdersMessage;
let syncButton, addClientButton, openSettingsButton;
let clientModal, detailsModal, settingsModal, confirmModal;
let clientForm, settingsForm;
let modalTitle, detailsModalTitle, detailsModalContent;
let statusAtivoDaysInput, statusRiscoDaysInput;

function initDOMReferences() {
    // Containers
    clientCardsContainer = document.getElementById('client-cards-container');
    productCardsContainer = document.getElementById('product-cards-container');
    orderListContainer = document.getElementById('order-list-container');

    // Search inputs
    searchInput = document.getElementById('search-input');
    productSearchInput = document.getElementById('product-search-input');
    orderSearchInput = document.getElementById('order-search-input');

    // Filters
    filterStatusSelect = document.getElementById('filter-status');
    filterTagSelect = document.getElementById('filter-tag');
    sortClientsSelect = document.getElementById('sort-clients');
    filterStockSelect = document.getElementById('filter-stock');
    filterActiveSelect = document.getElementById('filter-active');

    // Counters
    clientCountDisplay = document.getElementById('client-count-display');
    productCountDisplay = document.getElementById('product-count-display');
    orderCountDisplay = document.getElementById('order-count-display');

    // No data messages
    noClientsMessage = document.getElementById('no-clients-message');
    noProductsMessage = document.getElementById('no-products-message');
    noOrdersMessage = document.getElementById('no-orders-message');

    // Buttons
    syncButton = document.getElementById('sync-button');
    addClientButton = document.getElementById('add-client-button');
    openSettingsButton = document.getElementById('open-settings-button');

    // Modals
    clientModal = document.getElementById('client-modal');
    detailsModal = document.getElementById('details-modal');
    settingsModal = document.getElementById('settings-modal');
    confirmModal = document.getElementById('confirm-modal');

    // Forms
    clientForm = document.getElementById('client-form');
    settingsForm = document.getElementById('settings-form');

    // Modal elements
    modalTitle = document.getElementById('modal-title');
    detailsModalTitle = document.getElementById('details-modal-title');
    detailsModalContent = document.getElementById('details-modal-content');
    statusAtivoDaysInput = document.getElementById('status-ativo-days');
    statusRiscoDaysInput = document.getElementById('status-risco-days');
}

// ============================================================================
// NAVEGAÇÃO
// ============================================================================

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.id === 'sync-button' || link.id === 'open-settings-button') return;
            
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            pages.forEach(p => p.classList.add('hidden'));
            
            const pageId = link.id.replace('nav-', '') + '-page';
            const page = document.getElementById(pageId);
            if (page) {
                page.classList.remove('hidden');
                page.classList.add('flex');
            }
        });
    });
}

// ============================================================================
// MODALS
// ============================================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function setupModals() {
    // Modal de cliente
    document.getElementById('cancel-button')?.addEventListener('click', () => closeModal('client-modal'));
    document.getElementById('close-details-button')?.addEventListener('click', () => closeModal('details-modal'));
    document.getElementById('cancel-settings-button')?.addEventListener('click', () => closeModal('settings-modal'));
    document.getElementById('cancel-delete-button')?.addEventListener('click', () => closeModal('confirm-modal'));

    // Fechar ao clicar no background
    document.querySelectorAll('.modal-bg').forEach(bg => {
        bg.addEventListener('click', () => {
            closeModal('client-modal');
            closeModal('details-modal');
            closeModal('settings-modal');
            closeModal('confirm-modal');
        });
    });

    // Adicionar cliente
    addClientButton?.addEventListener('click', () => {
        clientForm.reset();
        document.getElementById('client-id').value = '';
        modalTitle.textContent = 'Adicionar Novo Cliente';
        openModal('client-modal');
    });

    // Configurações
    openSettingsButton?.addEventListener('click', () => {
        const settings = Storage.getSettings();
        statusAtivoDaysInput.value = settings.activeDays;
        statusRiscoDaysInput.value = settings.riskDays;
        const geminiKeyInput = document.getElementById('gemini-api-key');
        if (geminiKeyInput) {
            geminiKeyInput.value = settings.geminiApiKey || '';
        }
        openModal('settings-modal');
    });
}

// ============================================================================
// SINCRONIZAÇÃO COM API
// ============================================================================

// Funções auxiliares para processamento de produtos (baseado na documentação FácilZap)
function extrairPreco(produto) {
    // Prioridade: preco direto > valor > catalogo > variação
    if (typeof produto.preco === 'number' && produto.preco > 0) return produto.preco;
    if (typeof produto.preco === 'string' && parseFloat(produto.preco) > 0) return parseFloat(produto.preco);
    
    // Campo "valor" também é comum
    if (typeof produto.valor === 'number' && produto.valor > 0) return produto.valor;
    if (typeof produto.valor === 'string' && parseFloat(produto.valor) > 0) return parseFloat(produto.valor);
    
    // Tentar pegar do catálogo
    if (produto.catalogos && produto.catalogos.length > 0) {
        const catalogo = produto.catalogos[0];
        const precoCatalogo = catalogo.precos?.preco || catalogo.preco || catalogo.valor;
        if (precoCatalogo) return Number(precoCatalogo);
    }
    
    // Tentar pegar da primeira variação
    if (produto.variacoes && produto.variacoes.length > 0) {
        const precoVariacao = produto.variacoes[0].preco || produto.variacoes[0].valor;
        if (precoVariacao) return Number(precoVariacao);
    }
    
    return 0;
}

function extrairEstoqueVariacao(variacao) {
    if (!variacao) return 0;
    const est = variacao.estoque;
    
    if (typeof est === 'number') return est;
    if (typeof est === 'string') return parseInt(est) || 0;
    if (typeof est === 'object' && est !== null) {
        return Number(est.estoque ?? est.disponivel ?? est.quantidade ?? 0);
    }
    return 0;
}

function extrairEstoqueProduto(produto) {
    const est = produto.estoque;
    
    if (typeof est === 'number') return est;
    if (typeof est === 'string') return parseInt(est) || 0;
    if (typeof est === 'object' && est !== null) {
        return Number(est.disponivel ?? est.estoque ?? est.quantidade ?? 0);
    }
    return 0;
}

function calcularEstoqueTotal(produto) {
    // Se tem variações, somar o estoque de todas
    if (Array.isArray(produto.variacoes) && produto.variacoes.length > 0) {
        return produto.variacoes.reduce((total, variacao) => {
            return total + extrairEstoqueVariacao(variacao);
        }, 0);
    }
    // Produto sem variações - estoque direto
    return extrairEstoqueProduto(produto);
}

function extrairImagemPrincipal(produto) {
    const imagens = produto.imagens || produto.fotos || produto.images || [];
    if (imagens.length === 0) return null;
    
    const primeira = imagens[0];
    
    if (typeof primeira === 'string') return primeira;
    if (typeof primeira === 'object' && primeira !== null) {
        // Tentar várias propriedades possíveis
        const url = primeira.url || primeira.path || primeira.src || 
                   primeira.link || primeira.arquivo || primeira.file ||
                   primeira.imagem || primeira.foto || primeira.image ||
                   primeira.thumbnail || primeira.thumb;
        return url || null;
    }
    return null;
}

function extrairTodasImagens(produto) {
    const imagens = produto.imagens || produto.fotos || produto.images || [];
    return imagens.map(img => {
        if (typeof img === 'string') return img;
        if (typeof img === 'object' && img !== null) {
            return img.url || img.path || img.src || 
                   img.link || img.arquivo || img.file ||
                   img.imagem || img.foto || img.image ||
                   img.thumbnail || img.thumb || null;
        }
        return null;
    }).filter(Boolean);
}

function extrairCodigoBarras(produto) {
    const codBarras = produto.cod_barras;
    if (Array.isArray(codBarras) && codBarras.length > 0) {
        const primeiro = codBarras[0];
        if (typeof primeiro === 'string') return primeiro;
        if (primeiro?.numero) return String(primeiro.numero);
    }
    if (typeof codBarras === 'string') return codBarras;
    return null;
}

function processarVariacoes(produto) {
    const variacoes = produto.variacoes || [];
    return variacoes.map(v => ({
        id: String(v.id ?? v.codigo ?? ''),
        sku: v.sku ?? v.codigo ?? null,
        nome: v.nome ?? v.name ?? null,
        preco: Number(v.preco ?? 0),
        estoque: extrairEstoqueVariacao(v),
        ativo: Boolean(v.ativada ?? v.ativo ?? true)
    }));
}

function processarProdutoAPI(p) {
    const variacoes = processarVariacoes(p);
    return {
        id: String(p.id ?? p.codigo),
        codigo: p.codigo || p.id,
        name: p.nome ?? 'Sem nome',
        description: p.descricao || '',
        sku: p.sku || p.codigo || '',
        price: extrairPreco(p),
        stock: calcularEstoqueTotal(p),
        isActive: Boolean(p.ativado ?? p.ativo ?? true),
        managesStock: Boolean(p.estoque?.controlar_estoque),
        image: extrairImagemPrincipal(p),
        images: extrairTodasImagens(p),
        barcode: extrairCodigoBarras(p),
        variacoes: variacoes,
        hasVariacoes: variacoes.length > 0
    };
}

async function syncData() {
    showToast('Buscando dados na FacilZap... Isso pode levar um momento.', 'info');
    syncButton.disabled = true;
    syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center animate-spin"></i><span class="ml-4">Sincronizando...</span>';

    try {
        const response = await fetch('/api/facilzap-proxy');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `Erro HTTP ${response.status}`);
        }

        const { clients: apiClients, orders: apiOrders, products: apiProducts } = data;
        
        console.log('[DEBUG] Dados recebidos da API:', {
            clients: apiClients?.length || 0,
            orders: apiOrders?.length || 0,
            products: apiProducts?.length || 0
        });
        
        if (!apiClients || !apiProducts) {
            throw new Error("Resposta da API inválida.");
        }
        
        // Se orders não veio, usar array vazio
        const ordersToProcess = apiOrders || [];

        // Processar e salvar produtos com funções melhoradas
        const productsMap = new Map();
        const processedProducts = apiProducts.map(p => {
            const product = processarProdutoAPI(p);
            productsMap.set(product.id, product);
            return product;
        });
        Storage.saveProducts(processedProducts);
        console.log(`[INFO] ${processedProducts.length} produtos processados`);

        // Processar clientes
        const clientsMap = new Map();
        apiClients.forEach(c => {
            if (!c || !c.id) return;
            clientsMap.set(String(c.id), {
                id: String(c.id),
                name: c.nome || 'Cliente sem nome',
                email: c.email || '',
                phone: c.whatsapp || '',
                birthday: c.data_nascimento || null,
                cpf: c.cpf_cnpj || '',
                address: '',
                address_number: '',
                address_complement: '',
                address_neighborhood: '',
                city: '',
                state: '',
                zip_code: '',
                origin: c.origem || '',
                lastPurchaseDate: c.ultima_compra || null,
                totalSpent: 0,
                orderCount: 0,
                products: new Map(), // Map de produto_id -> {name, quantity, price, lastPurchase}
                orderIds: [] // Lista de IDs dos pedidos
            });
        });

        // Processar pedidos e relacionar com clientes
        const processedOrders = [];
        console.log('[DEBUG] Processando pedidos:', ordersToProcess.length);
        ordersToProcess.forEach(order => {
            if (!order || !order.id) return;
            
            const clientId = order.cliente?.id ? String(order.cliente.id) : null;
            const orderDate = order.data ? new Date(order.data) : new Date();
            const orderTotal = parseFloat(order.total) || 0;

            // Extrair produtos do pedido
            const orderProducts = [];
            const productList = order.produtos || order.itens || order.products || order.items || [];
            
            productList.forEach(item => {
                if (!item) return;
                const productId = String(item.produto_id || item.id || item.codigo || '');
                const productName = item.nome || item.name || 'Produto';
                const quantity = parseInt(item.quantidade || item.qty || 1) || 1;
                const itemTotal = parseFloat(item.subtotal || item.valor || item.total || 0);
                const unitPrice = quantity > 0 ? itemTotal / quantity : 0;

                orderProducts.push({
                    productId,
                    productName,
                    quantity,
                    unitPrice,
                    total: itemTotal
                });

                // Atualizar histórico de produtos do cliente
                if (clientId && clientsMap.has(clientId)) {
                    const client = clientsMap.get(clientId);
                    if (client.products.has(productId)) {
                        const existing = client.products.get(productId);
                        existing.quantity += quantity;
                        existing.totalSpent += itemTotal;
                        if (orderDate > new Date(existing.lastPurchase)) {
                            existing.lastPurchase = orderDate.toISOString();
                        }
                    } else {
                        client.products.set(productId, {
                            productId,
                            name: productName,
                            quantity,
                            unitPrice,
                            totalSpent: itemTotal,
                            lastPurchase: orderDate.toISOString()
                        });
                    }
                }
            });

            // Criar registro do pedido
            const processedOrder = {
                id: String(order.id),
                codigo: order.codigo || order.id,
                data: order.data || new Date().toISOString(),
                clientId,
                clientName: order.cliente?.nome || 'Cliente não identificado',
                clientPhone: order.cliente?.whatsapp || '',
                total: orderTotal,
                status: order.status || order.status_pedido || '',
                products: orderProducts,
                origin: order.origem || ''
            };
            processedOrders.push(processedOrder);

            // Atualizar estatísticas do cliente
            if (clientId && clientsMap.has(clientId)) {
                const client = clientsMap.get(clientId);
                client.totalSpent += orderTotal;
                client.orderCount++;
                client.orderIds.push(processedOrder.id);
                
                if (!client.lastPurchaseDate || orderDate > new Date(client.lastPurchaseDate)) {
                    client.lastPurchaseDate = orderDate.toISOString().split('T')[0];
                }
            }
        });

        // Converter Map de produtos de cada cliente para Array
        const processedClients = Array.from(clientsMap.values()).map(client => ({
            ...client,
            products: Array.from(client.products.values())
        }));

        // Salvar no LocalStorage
        Storage.saveClients(processedClients);
        Storage.saveOrders(processedOrders);
        Storage.saveLastSync(new Date().toISOString());

        showToast(`Sincronização concluída! ${processedClients.length} clientes, ${processedOrders.length} pedidos e ${processedProducts.length} produtos.`, 'success');
        
        // Renderizar dados
        renderAll();

    } catch (error) {
        console.error('Erro na sincronização:', error);
        showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
    } finally {
        syncButton.disabled = false;
        syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
    }
}

// ============================================================================
// LÓGICA DE CRM - STATUS DE CLIENTES
// ============================================================================

function getClientStatus(client) {
    const settings = Storage.getSettings();
    
    if (!client.lastPurchaseDate) {
        return { text: 'Sem Histórico', class: 'status-sem-historico' };
    }

    const lastPurchase = new Date(client.lastPurchaseDate);
    const today = new Date();
    const diffTime = Math.abs(today - lastPurchase);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= settings.activeDays) {
        return { text: 'Ativo', class: 'status-ativo', days: diffDays };
    } else if (diffDays <= settings.riskDays) {
        return { text: 'Em Risco', class: 'status-risco', days: diffDays };
    } else {
        return { text: 'Inativo', class: 'status-inativo', days: diffDays };
    }
}

// ============================================================================
// MOTOR DE CLASSIFICAÇÃO AUTOMÁTICA (TERMÔMETRO)
// ============================================================================

/**
 * Classificação por Temperatura (estilo ZUP/Salesforce)
 * Usa parâmetros customizáveis (podem ser sugeridos pela IA)
 */
function getClientTemperature(client) {
    const days = getDaysSinceLastPurchase(client);
    const params = classificationParams || { hotDays: 30, warmDays: 90 };
    
    if (days === Infinity) {
        return { temp: 'sem-dados', label: 'Sem Dados', emoji: '❓', color: 'gray', days: null };
    }
    if (days <= params.hotDays) {
        return { temp: 'quente', label: 'Quente', emoji: '🔥', color: 'red', days };
    }
    if (days <= params.warmDays) {
        return { temp: 'morno', label: 'Morno', emoji: '🌡️', color: 'yellow', days };
    }
    return { temp: 'frio', label: 'Frio', emoji: '❄️', color: 'blue', days };
}

/**
 * Classificação VIP - Usa parâmetros customizáveis
 */
function getClientVIPStatus(client, allClients) {
    const params = classificationParams || { vipMinValue: 500, loyalMinOrders: 5 };
    
    const ticketMedio = client.orderCount > 0 ? client.totalSpent / client.orderCount : 0;
    
    // Super VIP: 3x o valor mínimo VIP
    const isSuperVIP = client.totalSpent > params.vipMinValue * 3;
    // VIP: acima do valor mínimo
    const isVIP = client.totalSpent > params.vipMinValue;
    
    if (isSuperVIP) {
        return { vip: 'super-vip', label: 'Super VIP', emoji: '💎', ticketMedio };
    }
    if (isVIP) {
        return { vip: 'vip', label: 'VIP', emoji: '⭐', ticketMedio };
    }
    return { vip: 'regular', label: 'Regular', emoji: '', ticketMedio };
    
    if (isSuperVIP) {
        return { vip: 'super-vip', label: 'Super VIP', emoji: '💎', ticketMedio };
    }
    if (isVIP) {
        return { vip: 'vip', label: 'VIP', emoji: '⭐', ticketMedio };
    }
    return { vip: 'regular', label: 'Regular', emoji: '', ticketMedio };
}

/**
 * Extrair Estado (UF) do telefone ou endereço
 */
function getClientState(client) {
    // Tentar extrair do DDD do telefone
    const phone = (client.phone || '').replace(/\D/g, '');
    if (phone.length >= 10) {
        const ddd = phone.substring(0, 2);
        const dddToState = {
            '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
            '21': 'RJ', '22': 'RJ', '24': 'RJ',
            '27': 'ES', '28': 'ES',
            '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
            '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
            '47': 'SC', '48': 'SC', '49': 'SC',
            '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
            '61': 'DF',
            '62': 'GO', '64': 'GO',
            '63': 'TO',
            '65': 'MT', '66': 'MT',
            '67': 'MS',
            '68': 'AC',
            '69': 'RO',
            '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
            '79': 'SE',
            '81': 'PE', '87': 'PE',
            '82': 'AL',
            '83': 'PB',
            '84': 'RN',
            '85': 'CE', '88': 'CE',
            '86': 'PI', '89': 'PI',
            '91': 'PA', '93': 'PA', '94': 'PA',
            '92': 'AM', '97': 'AM',
            '95': 'RR',
            '96': 'AP',
            '98': 'MA', '99': 'MA'
        };
        if (dddToState[ddd]) {
            return { uf: dddToState[ddd], source: 'ddd' };
        }
    }
    
    // Tentar do endereço
    if (client.state) {
        return { uf: client.state.toUpperCase(), source: 'address' };
    }
    
    return { uf: 'N/A', source: 'unknown' };
}

/**
 * Gerar todas as tags de um cliente
 */
function getClientTags(client, allClients) {
    const temperature = getClientTemperature(client);
    const vipStatus = getClientVIPStatus(client, allClients);
    const state = getClientState(client);
    
    const tags = [];
    
    // Tag de temperatura
    tags.push({
        type: 'temperature',
        value: temperature.temp,
        label: temperature.label,
        emoji: temperature.emoji,
        color: temperature.color
    });
    
    // Tag VIP
    if (vipStatus.vip !== 'regular') {
        tags.push({
            type: 'vip',
            value: vipStatus.vip,
            label: vipStatus.label,
            emoji: vipStatus.emoji
        });
    }
    
    // Tag de fidelidade
    if (client.orderCount >= 10) {
        tags.push({ type: 'loyalty', value: 'super-fiel', label: 'Super Fiel', emoji: '🏆' });
    } else if (client.orderCount >= 5) {
        tags.push({ type: 'loyalty', value: 'fiel', label: 'Fiel', emoji: '🌟' });
    }
    
    // Tag de geografia
    if (state.uf !== 'N/A') {
        tags.push({
            type: 'geography',
            value: state.uf,
            label: state.uf,
            emoji: '📍'
        });
    }
    
    return {
        tags,
        temperature,
        vipStatus,
        state,
        ticketMedio: vipStatus.ticketMedio
    };
}

/**
 * Gerar análise de segmentos para a IA
 */
function generateSegmentAnalysis() {
    const clients = Storage.getClients();
    const orders = Storage.getOrders();
    const products = Storage.getProducts();
    
    // Classificar todos os clientes
    const clientsWithTags = clients.map(c => ({
        ...c,
        ...getClientTags(c, clients)
    }));
    
    // Agrupar por temperatura
    const byTemperature = {
        quente: clientsWithTags.filter(c => c.temperature.temp === 'quente'),
        morno: clientsWithTags.filter(c => c.temperature.temp === 'morno'),
        frio: clientsWithTags.filter(c => c.temperature.temp === 'frio'),
        semDados: clientsWithTags.filter(c => c.temperature.temp === 'sem-dados')
    };
    
    // Agrupar por estado
    const byState = {};
    clientsWithTags.forEach(c => {
        const uf = c.state.uf;
        if (!byState[uf]) byState[uf] = [];
        byState[uf].push(c);
    });
    
    // Agrupar VIPs
    const vips = clientsWithTags.filter(c => c.vipStatus.vip !== 'regular');
    
    // Clientes em risco (frios com alto LTV)
    const churnRisk = byTemperature.frio.filter(c => c.totalSpent > 500);
    
    // Produtos mais vendidos
    const productSales = {};
    orders.forEach(order => {
        (order.products || []).forEach(p => {
            if (!productSales[p.productName]) {
                productSales[p.productName] = { name: p.productName, quantity: 0, revenue: 0 };
            }
            productSales[p.productName].quantity += p.quantity;
            productSales[p.productName].revenue += p.total;
        });
    });
    const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    
    return {
        totalClients: clients.length,
        totalOrders: orders.length,
        totalProducts: products.length,
        totalRevenue: clients.reduce((sum, c) => sum + c.totalSpent, 0),
        byTemperature: {
            quente: { count: byTemperature.quente.length, clients: byTemperature.quente },
            morno: { count: byTemperature.morno.length, clients: byTemperature.morno },
            frio: { count: byTemperature.frio.length, clients: byTemperature.frio },
            semDados: { count: byTemperature.semDados.length, clients: byTemperature.semDados }
        },
        byState,
        vips: { count: vips.length, clients: vips },
        churnRisk: { count: churnRisk.length, clients: churnRisk },
        topProducts
    };
}

function getDaysSinceLastPurchase(client) {
    if (!client.lastPurchaseDate) return Infinity;
    const lastPurchase = new Date(client.lastPurchaseDate);
    const today = new Date();
    return Math.ceil(Math.abs(today - lastPurchase) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// RENDERIZAÇÃO DE CLIENTES
// ============================================================================

function renderClients() {
    const clients = Storage.getClients();
    clientCardsContainer.innerHTML = '';

    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const statusFilter = filterStatusSelect?.value || 'todos';
    const tagFilter = filterTagSelect?.value || 'todos';
    const sortOption = sortClientsSelect?.value || 'default';

    // Filtrar clientes
    let filteredClients = clients.filter(client => {
        const status = getClientStatus(client).text.toLowerCase().replace(' ', '-');
        const tag = (client.orderCount >= 7) ? 'cliente-fiel' : 'sem-tag';
        
        const matchesStatus = statusFilter === 'todos' || status === statusFilter;
        const matchesTag = tagFilter === 'todos' || tag === tagFilter;
        const matchesSearch = !searchTerm ||
            (client.name && client.name.toLowerCase().includes(searchTerm)) ||
            (client.email && client.email.toLowerCase().includes(searchTerm)) ||
            (client.phone && client.phone.includes(searchTerm));

        return matchesStatus && matchesTag && matchesSearch;
    });

    // Ordenar clientes
    switch (sortOption) {
        case 'most-orders':
            filteredClients.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
            break;
        case 'least-orders':
            filteredClients.sort((a, b) => (a.orderCount || 0) - (b.orderCount || 0));
            break;
        case 'highest-spent':
            filteredClients.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
            break;
        case 'lowest-spent':
            filteredClients.sort((a, b) => (a.totalSpent || 0) - (b.totalSpent || 0));
            break;
        case 'most-inactive':
            filteredClients.sort((a, b) => getDaysSinceLastPurchase(b) - getDaysSinceLastPurchase(a));
            break;
        case 'least-inactive':
            filteredClients.sort((a, b) => getDaysSinceLastPurchase(a) - getDaysSinceLastPurchase(b));
            break;
        default:
            // Ordenação padrão: por nome
            filteredClients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    clientCountDisplay.textContent = `Exibindo ${filteredClients.length} de ${clients.length} clientes`;
    noClientsMessage?.classList.toggle('hidden', filteredClients.length > 0);

    filteredClients.forEach(client => {
        const status = getClientStatus(client);
        const daysSince = getDaysSinceLastPurchase(client);
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md p-5 flex flex-col justify-between hover:shadow-lg transition-shadow';

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-800 text-lg truncate" title="${escapeHtml(client.name)}">${escapeHtml(client.name || 'Cliente sem nome')}</h3>
                    <span class="status-badge ${status.class} whitespace-nowrap ml-2">${status.text}</span>
                </div>
                <p class="text-sm text-gray-500 mb-1 truncate">${escapeHtml(client.email || 'Sem e-mail')}</p>
                <p class="text-sm text-gray-500 mb-4 truncate">${escapeHtml(client.phone || 'Sem telefone')}</p>
                <div class="text-sm space-y-2 mb-4">
                    <p><i class="fas fa-shopping-basket fa-fw text-gray-400 mr-2"></i>Pedidos: <span class="font-semibold">${client.orderCount || 0}</span></p>
                    <p><i class="fas fa-dollar-sign fa-fw text-gray-400 mr-2"></i>Total Gasto: <span class="font-semibold">${formatCurrency(client.totalSpent)}</span></p>
                    <p><i class="fas fa-calendar-alt fa-fw text-gray-400 mr-2"></i>Última Compra: <span class="font-semibold">${client.lastPurchaseDate ? formatDate(client.lastPurchaseDate) : 'N/A'}</span></p>
                    ${daysSince !== Infinity ? `<p><i class="fas fa-clock fa-fw text-gray-400 mr-2"></i>Dias sem comprar: <span class="font-semibold ${daysSince > 60 ? 'text-red-600' : daysSince > 30 ? 'text-yellow-600' : 'text-green-600'}">${daysSince}</span></p>` : ''}
                </div>
                ${(client.orderCount >= 7) ? `<div class="mb-4"><span class="tag-badge tag-fiel">🌟 Cliente Fiel</span></div>` : ''}
            </div>
            <div class="border-t pt-4 flex justify-end space-x-2">
                <button class="text-gray-500 hover:text-indigo-600 view-details-button p-2" data-id="${client.id}" title="Ver Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="text-gray-500 hover:text-green-600 whatsapp-button p-2" data-phone="${escapeHtml(client.phone)}" title="WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </button>
                <button class="text-gray-500 hover:text-blue-600 edit-client-button p-2" data-id="${client.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-gray-500 hover:text-red-600 delete-client-button p-2" data-id="${client.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        clientCardsContainer.appendChild(card);
    });

    // Adicionar event listeners
    setupClientCardListeners();
}

function setupClientCardListeners() {
    // Ver detalhes
    document.querySelectorAll('.view-details-button').forEach(btn => {
        btn.addEventListener('click', () => viewClientDetails(btn.dataset.id));
    });

    // WhatsApp
    document.querySelectorAll('.whatsapp-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const phone = btn.dataset.phone?.replace(/\D/g, '');
            if (phone) {
                window.open(`https://wa.me/55${phone}`, '_blank');
            } else {
                showToast('Cliente não possui telefone cadastrado.', 'error');
            }
        });
    });

    // Editar
    document.querySelectorAll('.edit-client-button').forEach(btn => {
        btn.addEventListener('click', () => editClient(btn.dataset.id));
    });

    // Excluir
    document.querySelectorAll('.delete-client-button').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteClient(btn.dataset.id));
    });
}

// ============================================================================
// DETALHES DO CLIENTE (com histórico de compras)
// ============================================================================

function viewClientDetails(clientId) {
    const clients = Storage.getClients();
    const orders = Storage.getOrders();
    const products = Storage.getProducts();
    const client = clients.find(c => c.id === clientId);

    if (!client) {
        showToast('Cliente não encontrado.', 'error');
        return;
    }

    const status = getClientStatus(client);
    const daysSince = getDaysSinceLastPurchase(client);

    // Buscar pedidos do cliente
    const clientOrders = orders.filter(o => o.clientId === clientId)
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    // Criar mapa de produtos para lookup rápido
    const productsMap = new Map(products.map(p => [p.id, p]));

    // Gerar HTML do histórico de produtos
    let productsHtml = '<p class="text-sm text-gray-500">Nenhum produto comprado.</p>';
    if (client.products && client.products.length > 0) {
        const sortedProducts = [...client.products].sort((a, b) => b.quantity - a.quantity);
        productsHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd Total</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Un.</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Última Compra</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${sortedProducts.map(p => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-2 whitespace-nowrap">${escapeHtml(p.name)}</td>
                                <td class="px-4 py-2 text-center font-semibold">${p.quantity}</td>
                                <td class="px-4 py-2 text-right">${formatCurrency(p.unitPrice)}</td>
                                <td class="px-4 py-2 text-right font-medium">${formatCurrency(p.totalSpent)}</td>
                                <td class="px-4 py-2 text-center text-sm text-gray-500">${formatDate(p.lastPurchase)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Gerar HTML do histórico de pedidos
    let ordersHtml = '<p class="text-sm text-gray-500">Nenhum pedido encontrado.</p>';
    if (clientOrders.length > 0) {
        ordersHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Data</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${clientOrders.slice(0, 10).map(order => `
                            <tr class="hover:bg-gray-50 cursor-pointer" onclick="viewOrderDetails('${order.id}')">
                                <td class="px-4 py-2 font-mono text-sm">#${escapeHtml(order.codigo)}</td>
                                <td class="px-4 py-2 text-center">${formatDate(order.data)}</td>
                                <td class="px-4 py-2 text-right font-semibold">${formatCurrency(order.total)}</td>
                                <td class="px-4 py-2 text-center">${order.products?.length || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${clientOrders.length > 10 ? `<p class="text-sm text-gray-500 mt-2 text-center">...e mais ${clientOrders.length - 10} pedidos</p>` : ''}
            </div>
        `;
    }

    detailsModalTitle.textContent = `Detalhes de ${escapeHtml(client.name)}`;
    detailsModalContent.innerHTML = `
        <!-- Status e Estatísticas -->
        <div class="bg-gray-50 rounded-lg p-4 mb-6">
            <div class="flex items-center justify-between mb-4">
                <span class="status-badge ${status.class} text-base px-4 py-2">${status.text}</span>
                ${daysSince !== Infinity ? `
                    <span class="text-sm text-gray-600">
                        <i class="fas fa-clock mr-1"></i> ${daysSince} dias sem comprar
                    </span>
                ` : ''}
            </div>
            <div class="grid grid-cols-3 gap-4 text-center">
                <div class="bg-white rounded-lg p-3 shadow-sm">
                    <div class="text-2xl font-bold text-indigo-600">${client.orderCount || 0}</div>
                    <div class="text-xs text-gray-500 uppercase">Pedidos</div>
                </div>
                <div class="bg-white rounded-lg p-3 shadow-sm">
                    <div class="text-2xl font-bold text-green-600">${formatCurrency(client.totalSpent)}</div>
                    <div class="text-xs text-gray-500 uppercase">Total Gasto</div>
                </div>
                <div class="bg-white rounded-lg p-3 shadow-sm">
                    <div class="text-2xl font-bold text-purple-600">${client.products?.length || 0}</div>
                    <div class="text-xs text-gray-500 uppercase">Produtos</div>
                </div>
            </div>
        </div>

        <!-- Informações de Contato -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm mb-6 pb-4 border-b">
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-envelope fa-fw mr-2 text-gray-400"></i>E-mail:</strong>
                ${escapeHtml(client.email || 'N/A')}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-phone fa-fw mr-2 text-gray-400"></i>Telefone:</strong>
                ${escapeHtml(client.phone || 'N/A')}
                ${client.phone ? `<a href="https://wa.me/55${client.phone.replace(/\D/g, '')}" target="_blank" class="ml-2 text-green-600 hover:text-green-700"><i class="fab fa-whatsapp"></i></a>` : ''}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-id-card fa-fw mr-2 text-gray-400"></i>CPF/CNPJ:</strong>
                ${escapeHtml(client.cpf || 'N/A')}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-gift fa-fw mr-2 text-gray-400"></i>Aniversário:</strong>
                ${client.birthday ? formatDate(client.birthday) : 'N/A'}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-calendar-check fa-fw mr-2 text-gray-400"></i>Última Compra:</strong>
                ${client.lastPurchaseDate ? formatDate(client.lastPurchaseDate) : 'N/A'}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-tag fa-fw mr-2 text-gray-400"></i>Origem:</strong>
                ${escapeHtml(client.origin || 'N/A')}
            </div>
        </div>

        <!-- Histórico de Produtos -->
        <div class="mb-6">
            <h3 class="text-lg font-semibold mb-3 flex items-center">
                <i class="fas fa-box-open mr-2 text-indigo-500"></i>
                Produtos Comprados
            </h3>
            ${productsHtml}
        </div>

        <!-- Histórico de Pedidos -->
        <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center">
                <i class="fas fa-receipt mr-2 text-green-500"></i>
                Últimos Pedidos
            </h3>
            ${ordersHtml}
        </div>
    `;

    openModal('details-modal');
}

// ============================================================================
// GESTÃO DE CLIENTES (CRUD)
// ============================================================================

function editClient(clientId) {
    const clients = Storage.getClients();
    const client = clients.find(c => c.id === clientId);

    if (!client) {
        showToast('Cliente não encontrado.', 'error');
        return;
    }

    document.getElementById('client-id').value = client.id;
    document.getElementById('name').value = client.name || '';
    document.getElementById('email').value = client.email || '';
    document.getElementById('phone').value = client.phone || '';
    document.getElementById('birthday').value = client.birthday || '';

    modalTitle.textContent = 'Editar Cliente';
    openModal('client-modal');
}

let clientToDelete = null;

function confirmDeleteClient(clientId) {
    clientToDelete = clientId;
    openModal('confirm-modal');
}

function deleteClient() {
    if (!clientToDelete) return;

    let clients = Storage.getClients();
    clients = clients.filter(c => c.id !== clientToDelete);
    Storage.saveClients(clients);

    showToast('Cliente excluído com sucesso.', 'success');
    clientToDelete = null;
    closeModal('confirm-modal');
    renderClients();
}

function saveClient(e) {
    e.preventDefault();

    const clientId = document.getElementById('client-id').value;
    const clientData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        birthday: document.getElementById('birthday').value || null
    };

    let clients = Storage.getClients();

    if (clientId) {
        // Editar existente
        const index = clients.findIndex(c => c.id === clientId);
        if (index !== -1) {
            clients[index] = { ...clients[index], ...clientData };
        }
        showToast('Cliente atualizado com sucesso.', 'success');
    } else {
        // Novo cliente
        const newClient = {
            id: 'local_' + Date.now(),
            ...clientData,
            totalSpent: 0,
            orderCount: 0,
            products: [],
            orderIds: [],
            lastPurchaseDate: null,
            origin: 'manual'
        };
        clients.push(newClient);
        showToast('Cliente adicionado com sucesso.', 'success');
    }

    Storage.saveClients(clients);
    closeModal('client-modal');
    renderClients();
}

// ============================================================================
// RENDERIZAÇÃO DE PRODUTOS
// ============================================================================

function renderProducts() {
    const products = Storage.getProducts();
    productCardsContainer.innerHTML = '';

    const searchTerm = productSearchInput?.value?.toLowerCase() || '';
    const stockFilter = filterStockSelect?.value || 'todos';
    const activeFilter = filterActiveSelect?.value || 'todos';

    let filteredProducts = products.filter(product => {
        const matchesSearch = !searchTerm ||
            (product.name && product.name.toLowerCase().includes(searchTerm)) ||
            (product.sku && product.sku.toLowerCase().includes(searchTerm)) ||
            (product.barcode && product.barcode.includes(searchTerm));

        const matchesStock = stockFilter === 'todos' ||
            (stockFilter === 'gerenciado' && product.managesStock) ||
            (stockFilter === 'nao-gerenciado' && !product.managesStock) ||
            (stockFilter === 'em-estoque' && product.managesStock && product.stock > 0) ||
            (stockFilter === 'sem-estoque' && product.managesStock && product.stock <= 0) ||
            (stockFilter === 'com-variacoes' && product.hasVariacoes);

        const matchesActive = activeFilter === 'todos' ||
            (activeFilter === 'ativado' && product.isActive) ||
            (activeFilter === 'desativado' && !product.isActive);

        return matchesSearch && matchesStock && matchesActive;
    });

    // Ordenar por nome
    filteredProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    productCountDisplay.textContent = `Exibindo ${filteredProducts.length} de ${products.length} produtos`;
    noProductsMessage?.classList.toggle('hidden', filteredProducts.length > 0);

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow';

        // Usar URL direta da imagem (sem proxy)
        const imageUrl = product.image || 
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="12">Sem Imagem</text></svg>';

        // Determinar classe de estoque
        const stockClass = product.managesStock 
            ? (product.stock > 0 ? 'stock-in' : 'stock-out')
            : 'stock-unmanaged';
        const stockLabel = product.managesStock 
            ? (product.stock > 0 ? `${product.stock} un.` : 'Sem estoque')
            : 'Sem controle';

        card.innerHTML = `
            <div class="aspect-square bg-gray-100 relative">
                <img src="${imageUrl}" alt="${escapeHtml(product.name)}" class="w-full h-full object-cover" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2212%22>Sem Imagem</text></svg>'">
                <span class="absolute top-2 right-2 stock-badge ${product.isActive ? 'stock-in' : 'stock-out'}">
                    ${product.isActive ? 'Ativo' : 'Inativo'}
                </span>
                ${product.hasVariacoes ? `
                    <span class="absolute top-2 left-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                        ${product.variacoes.length} variações
                    </span>
                ` : ''}
            </div>
            <div class="p-4">
                <h3 class="font-semibold text-gray-800 truncate" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
                <p class="text-sm text-gray-500 mb-1">SKU: ${escapeHtml(product.sku || 'N/A')}</p>
                ${product.barcode ? `<p class="text-sm text-gray-400 mb-1"><i class="fas fa-barcode mr-1"></i>${escapeHtml(product.barcode)}</p>` : ''}
                
                <div class="flex justify-between items-center mt-3 mb-2">
                    <span class="text-lg font-bold text-green-600">${formatCurrency(product.price)}</span>
                    <span class="stock-badge ${stockClass}">${stockLabel}</span>
                </div>
                
                ${product.hasVariacoes ? `
                    <div class="mt-2 pt-2 border-t">
                        <p class="text-xs text-gray-500 mb-1">Variações:</p>
                        <div class="flex flex-wrap gap-1">
                            ${product.variacoes.slice(0, 3).map(v => `
                                <span class="text-xs bg-gray-100 px-2 py-1 rounded">${escapeHtml(v.nome || v.sku || 'Var')}</span>
                            `).join('')}
                            ${product.variacoes.length > 3 ? `<span class="text-xs text-gray-400">+${product.variacoes.length - 3}</span>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        productCardsContainer.appendChild(card);
    });
}

// ============================================================================
// RENDERIZAÇÃO DE PEDIDOS
// ============================================================================

function renderOrders() {
    const orders = Storage.getOrders();
    console.log('[DEBUG renderOrders] Total de pedidos no Storage:', orders.length);
    
    orderListContainer.innerHTML = '';

    const searchTerm = orderSearchInput?.value?.toLowerCase() || '';

    let filteredOrders = orders.filter(order => {
        return !searchTerm ||
            (order.codigo && order.codigo.toLowerCase().includes(searchTerm)) ||
            (order.clientName && order.clientName.toLowerCase().includes(searchTerm));
    }).sort((a, b) => new Date(b.data) - new Date(a.data));

    orderCountDisplay.textContent = `Exibindo ${filteredOrders.length} de ${orders.length} pedidos`;
    noOrdersMessage?.classList.toggle('hidden', filteredOrders.length > 0);

    filteredOrders.forEach(order => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap font-mono text-sm">#${escapeHtml(order.codigo)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${escapeHtml(order.clientName)}</div>
                ${order.clientPhone ? `<div class="text-sm text-gray-500">${escapeHtml(order.clientPhone)}</div>` : ''}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(order.data)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">${formatCurrency(order.total)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button class="text-indigo-600 hover:text-indigo-900 view-order-button" data-id="${order.id}">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </td>
        `;

        orderListContainer.appendChild(row);
    });

    // Event listeners para ver detalhes do pedido
    document.querySelectorAll('.view-order-button').forEach(btn => {
        btn.addEventListener('click', () => viewOrderDetails(btn.dataset.id));
    });
}

function viewOrderDetails(orderId) {
    const orders = Storage.getOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
        showToast('Pedido não encontrado.', 'error');
        return;
    }

    let productsHtml = '<p class="text-sm text-gray-500">Nenhum produto neste pedido.</p>';
    if (order.products && order.products.length > 0) {
        productsHtml = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                        <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd</th>
                        <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Un.</th>
                        <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${order.products.map(p => `
                        <tr>
                            <td class="px-4 py-2">${escapeHtml(p.productName)}</td>
                            <td class="px-4 py-2 text-center">${p.quantity}</td>
                            <td class="px-4 py-2 text-right">${formatCurrency(p.unitPrice)}</td>
                            <td class="px-4 py-2 text-right font-medium">${formatCurrency(p.total)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    detailsModalTitle.textContent = `Pedido #${escapeHtml(order.codigo)}`;
    detailsModalContent.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <strong class="text-gray-600">Cliente:</strong>
                    <p>${escapeHtml(order.clientName)}</p>
                </div>
                <div>
                    <strong class="text-gray-600">Data:</strong>
                    <p>${formatDate(order.data)}</p>
                </div>
                <div>
                    <strong class="text-gray-600">Status:</strong>
                    <p>${escapeHtml(order.status || 'N/A')}</p>
                </div>
                <div>
                    <strong class="text-gray-600">Total:</strong>
                    <p class="text-lg font-bold text-green-600">${formatCurrency(order.total)}</p>
                </div>
            </div>
            
            <div class="border-t pt-4">
                <h4 class="font-semibold mb-3">Produtos do Pedido</h4>
                ${productsHtml}
            </div>
        </div>
    `;

    openModal('details-modal');
}

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

function saveSettings(e) {
    e.preventDefault();

    const geminiKeyInput = document.getElementById('gemini-api-key');
    const settings = {
        activeDays: parseInt(statusAtivoDaysInput.value) || 30,
        riskDays: parseInt(statusRiscoDaysInput.value) || 60,
        geminiApiKey: geminiKeyInput?.value || ''
    };

    if (settings.riskDays <= settings.activeDays) {
        showToast('O período "Em Risco" deve ser maior que o período "Ativo".', 'error');
        return;
    }

    Storage.saveSettings(settings);
    showToast('Configurações salvas com sucesso.', 'success');
    closeModal('settings-modal');
    renderClients();
}

// ============================================================================
// GROWTH DASHBOARD - ANÁLISE ESTRATÉGICA
// ============================================================================

let selectedSegment = null;
let selectedClients = [];

function renderGrowthDashboard() {
    const analysis = generateSegmentAnalysis();
    
    // Atualizar contadores do termômetro
    document.getElementById('count-quente').textContent = analysis.byTemperature.quente.count;
    document.getElementById('count-morno').textContent = analysis.byTemperature.morno.count;
    document.getElementById('count-frio').textContent = analysis.byTemperature.frio.count;
    
    // KPIs
    const kpisContainer = document.getElementById('growth-kpis');
    kpisContainer.innerHTML = `
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Total de Clientes</p>
            <p class="text-2xl font-bold text-gray-800">${analysis.totalClients}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Receita Total</p>
            <p class="text-2xl font-bold text-green-600">${formatCurrency(analysis.totalRevenue)}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Pedidos</p>
            <p class="text-2xl font-bold text-indigo-600">${analysis.totalOrders}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Risco de Churn</p>
            <p class="text-2xl font-bold text-red-600">${analysis.churnRisk.count}</p>
            <p class="text-xs text-gray-400">Clientes frios com alto LTV</p>
        </div>
    `;
    
    // Lista de VIPs
    const vipList = document.getElementById('vip-list');
    if (analysis.vips.count > 0) {
        vipList.innerHTML = analysis.vips.clients.slice(0, 10).map(c => `
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-medium text-gray-800">${escapeHtml(c.name)}</p>
                    <p class="text-xs text-gray-500">${c.orderCount} pedidos • ${formatCurrency(c.totalSpent)}</p>
                </div>
                <div class="flex gap-2">
                    <span class="text-sm">${c.vipStatus.emoji}</span>
                    <button onclick="openWhatsAppModal('${c.id}')" class="text-green-600 hover:text-green-800">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } else {
        vipList.innerHTML = '<p class="text-sm text-gray-500">Nenhum cliente VIP encontrado</p>';
    }
    
    // Distribuição por estado
    const stateContainer = document.getElementById('state-distribution');
    const sortedStates = Object.entries(analysis.byState)
        .filter(([uf]) => uf !== 'N/A')
        .sort((a, b) => b[1].length - a[1].length);
    
    if (sortedStates.length > 0) {
        stateContainer.innerHTML = sortedStates.map(([uf, clients]) => `
            <div class="bg-gray-50 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-100 transition-colors"
                 onclick="showSegmentClients('state', '${uf}')">
                <p class="text-lg font-bold text-indigo-600">${clients.length}</p>
                <p class="text-xs text-gray-500">${uf}</p>
            </div>
        `).join('');
    } else {
        stateContainer.innerHTML = '<p class="text-sm text-gray-500 col-span-3">Sem dados de localização</p>';
    }
}

function showSegmentClients(type, value) {
    const analysis = generateSegmentAnalysis();
    let clients = [];
    let title = '';
    
    switch(type) {
        case 'quente':
            clients = analysis.byTemperature.quente.clients;
            title = '🔥 Clientes Quentes';
            break;
        case 'morno':
            clients = analysis.byTemperature.morno.clients;
            title = '🌡️ Clientes Mornos';
            break;
        case 'frio':
            clients = analysis.byTemperature.frio.clients;
            title = '❄️ Clientes Frios (Risco de Churn)';
            break;
        case 'state':
            clients = analysis.byState[value] || [];
            title = `📍 Clientes de ${value}`;
            break;
        case 'vip':
            clients = analysis.vips.clients;
            title = '⭐ Clientes VIP';
            break;
        case 'churn':
            clients = analysis.churnRisk.clients;
            title = '⚠️ Alto Risco de Churn';
            break;
    }
    
    selectedSegment = { type, value, title };
    selectedClients = clients;
    
    const container = document.getElementById('segment-clients');
    const titleEl = document.getElementById('segment-title');
    const listEl = document.getElementById('segment-client-list');
    
    titleEl.textContent = `${title} (${clients.length} clientes)`;
    
    listEl.innerHTML = clients.map(c => {
        const temp = c.temperature || getClientTemperature(c);
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-800">${escapeHtml(c.name)}</span>
                        <span class="text-sm">${temp.emoji}</span>
                        ${c.vipStatus?.emoji ? `<span class="text-sm">${c.vipStatus.emoji}</span>` : ''}
                    </div>
                    <p class="text-xs text-gray-500">
                        ${c.phone || 'Sem telefone'} • ${c.orderCount} pedidos • ${formatCurrency(c.totalSpent)}
                        ${temp.days ? ` • ${temp.days} dias` : ''}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button onclick="openWhatsAppModal('${c.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                        <i class="fab fa-whatsapp mr-1"></i> Mensagem
                    </button>
                    <button onclick="viewClientDetails('${c.id}')" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700">
                        <i class="fas fa-eye mr-1"></i> Ver
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    container.classList.remove('hidden');
}

// ============================================================================
// MÓDULO DE WHATSAPP
// ============================================================================

let currentWhatsAppClient = null;

function openWhatsAppModal(clientId) {
    const clients = Storage.getClients();
    const client = clients.find(c => c.id === clientId);
    
    if (!client) {
        showToast('Cliente não encontrado', 'error');
        return;
    }
    
    currentWhatsAppClient = client;
    
    document.getElementById('whatsapp-client-name').textContent = client.name;
    document.getElementById('whatsapp-client-phone').textContent = client.phone || 'Sem telefone cadastrado';
    document.getElementById('whatsapp-message').value = '';
    
    openModal('whatsapp-modal');
}

async function generateAIMessage() {
    if (!currentWhatsAppClient) return;
    
    const messageInput = document.getElementById('whatsapp-message');
    const settings = Storage.getSettings();
    
    if (!settings.geminiApiKey) {
        showToast('Configure sua API Key do Gemini nas Configurações', 'error');
        return;
    }
    
    messageInput.value = 'Gerando mensagem com IA...';
    messageInput.disabled = true;
    
    try {
        const message = await AIAssistant.generatePersonalizedMessage(currentWhatsAppClient);
        messageInput.value = message;
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
        messageInput.value = '';
    } finally {
        messageInput.disabled = false;
    }
}

function generateBasicMessage() {
    if (!currentWhatsAppClient) return;
    
    const message = AIAssistant.generateBasicMessage(currentWhatsAppClient);
    document.getElementById('whatsapp-message').value = message;
}

function sendWhatsApp() {
    if (!currentWhatsAppClient) return;
    
    const phone = (currentWhatsAppClient.phone || '').replace(/\D/g, '');
    const message = document.getElementById('whatsapp-message').value;
    
    if (!phone) {
        showToast('Cliente não possui telefone cadastrado', 'error');
        return;
    }
    
    if (!message) {
        showToast('Digite uma mensagem', 'error');
        return;
    }
    
    // Formatar número para WhatsApp (adicionar 55 se necessário)
    let formattedPhone = phone;
    if (phone.length === 10 || phone.length === 11) {
        formattedPhone = '55' + phone;
    }
    
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    closeModal('whatsapp-modal');
    showToast('Abrindo WhatsApp...', 'success');
}

// ============================================================================
// ESTRATÉGIAS COM IA
// ============================================================================

async function generateReactivationStrategy() {
    const settings = Storage.getSettings();
    
    if (!settings.geminiApiKey) {
        showToast('Configure sua API Key do Gemini nas Configurações', 'error');
        return;
    }
    
    if (!selectedClients || selectedClients.length === 0) {
        showToast('Selecione um segmento primeiro (clique em Quentes, Mornos ou Frios)', 'error');
        return;
    }
    
    const responseDiv = document.getElementById('ai-response');
    responseDiv.classList.remove('hidden');
    responseDiv.innerHTML = '<p class="text-white"><i class="fas fa-spinner fa-spin mr-2"></i> Analisando dados e gerando estratégia...</p>';
    
    // Preparar dados anonimizados do segmento
    const segmentData = {
        segmento: selectedSegment?.title || 'Clientes selecionados',
        totalClientes: selectedClients.length,
        estatisticas: {
            receitaTotal: selectedClients.reduce((sum, c) => sum + c.totalSpent, 0),
            mediaPedidos: selectedClients.reduce((sum, c) => sum + c.orderCount, 0) / selectedClients.length,
            ticketMedio: selectedClients.reduce((sum, c) => sum + (c.totalSpent / (c.orderCount || 1)), 0) / selectedClients.length
        },
        estados: [...new Set(selectedClients.map(c => c.state?.uf).filter(Boolean))],
        produtosMaisComprados: getTopProductsFromClients(selectedClients).slice(0, 5)
    };
    
    try {
        const result = await AIAssistant.generateStrategy(segmentData);
        
        responseDiv.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold text-white mb-2">📊 Análise</h4>
                    <p class="text-white/90">${escapeHtml(result.analise)}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-white mb-2">🎯 Estratégia Recomendada</h4>
                    <p class="text-white/90">${escapeHtml(result.estrategia)}</p>
                </div>
                ${result.copies && result.copies.length > 0 ? `
                    <div>
                        <h4 class="font-semibold text-white mb-2">📝 Sugestões de Copy</h4>
                        <div class="space-y-2">
                            ${result.copies.map((copy, i) => `
                                <div class="bg-white/10 rounded p-3">
                                    <p class="font-medium text-white text-sm">${i + 1}. ${escapeHtml(copy.titulo)}</p>
                                    <p class="text-white/80 text-sm mt-1">${escapeHtml(copy.mensagem)}</p>
                                    <button onclick="copyToClipboard('${escapeHtml(copy.mensagem).replace(/'/g, "\\'")}')" class="text-xs text-indigo-200 hover:text-white mt-2">
                                        <i class="fas fa-copy mr-1"></i> Copiar
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    } catch (error) {
        responseDiv.innerHTML = `<p class="text-red-200"><i class="fas fa-exclamation-circle mr-2"></i> Erro: ${escapeHtml(error.message)}</p>`;
    }
}

function getTopProductsFromClients(clients) {
    const productMap = {};
    clients.forEach(c => {
        (c.products || []).forEach(p => {
            if (!productMap[p.name]) {
                productMap[p.name] = { name: p.name, quantity: 0 };
            }
            productMap[p.name].quantity += p.quantity;
        });
    });
    return Object.values(productMap).sort((a, b) => b.quantity - a.quantity);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Texto copiado!', 'success');
    }).catch(() => {
        showToast('Erro ao copiar', 'error');
    });
}

// ============================================================================
// IA SUGERE PARÂMETROS DE CLASSIFICAÇÃO
// ============================================================================

async function aiSuggestParameters() {
    const settings = Storage.getSettings();
    
    if (!settings.geminiApiKey) {
        showToast('Configure sua API Key do Gemini nas Configurações', 'error');
        return;
    }
    
    const responseDiv = document.getElementById('ai-response');
    responseDiv.classList.remove('hidden');
    responseDiv.innerHTML = '<p class="text-white"><i class="fas fa-spinner fa-spin mr-2"></i> Analisando sua base de dados... A IA está calculando os parâmetros ideais...</p>';
    
    try {
        const result = await AIAssistant.suggestClassificationParams();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        responseDiv.innerHTML = `
            <div class="space-y-6">
                <!-- Termômetro -->
                <div class="bg-white/20 rounded-lg p-4">
                    <h4 class="font-bold text-white text-lg mb-3">🌡️ Termômetro de Clientes - Parâmetros Sugeridos</h4>
                    <div class="grid grid-cols-3 gap-4 mb-3">
                        <div class="text-center">
                            <span class="text-3xl">🔥</span>
                            <p class="font-bold text-xl text-yellow-300">${result.termometro?.quente_ate_dias || 30} dias</p>
                            <p class="text-sm text-white/80">QUENTE</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">🌡️</span>
                            <p class="font-bold text-xl text-yellow-300">${result.termometro?.morno_ate_dias || 90} dias</p>
                            <p class="text-sm text-white/80">MORNO</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">❄️</span>
                            <p class="font-bold text-xl text-yellow-300">+${result.termometro?.morno_ate_dias || 90} dias</p>
                            <p class="text-sm text-white/80">FRIO</p>
                        </div>
                    </div>
                    <p class="text-sm text-white/90 italic">${escapeHtml(result.termometro?.justificativa || '')}</p>
                </div>
                
                <!-- VIP -->
                <div class="bg-white/20 rounded-lg p-4">
                    <h4 class="font-bold text-white text-lg mb-3">⭐ Classificação VIP - Parâmetros Sugeridos</h4>
                    <div class="grid grid-cols-3 gap-4 mb-3">
                        <div class="text-center">
                            <span class="text-3xl">⭐</span>
                            <p class="font-bold text-xl text-yellow-300">${formatCurrency(result.vip?.vip_valor_minimo || 500)}</p>
                            <p class="text-sm text-white/80">VIP</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">💎</span>
                            <p class="font-bold text-xl text-yellow-300">${formatCurrency(result.vip?.super_vip_valor_minimo || 1500)}</p>
                            <p class="text-sm text-white/80">SUPER VIP</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">🏆</span>
                            <p class="font-bold text-xl text-yellow-300">${result.vip?.fiel_pedidos_minimo || 5} pedidos</p>
                            <p class="text-sm text-white/80">CLIENTE FIEL</p>
                        </div>
                    </div>
                    <p class="text-sm text-white/90 italic">${escapeHtml(result.vip?.justificativa || '')}</p>
                </div>
                
                <!-- Análise -->
                <div class="bg-white/20 rounded-lg p-4">
                    <h4 class="font-bold text-white text-lg mb-3">📊 Análise da IA</h4>
                    <div class="space-y-3">
                        <div>
                            <p class="text-sm text-white/70 uppercase">Observações:</p>
                            <p class="text-white">${escapeHtml(result.analise?.observacoes || '')}</p>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-red-500/30 rounded p-3">
                                <p class="text-sm text-white/70 uppercase">⚠️ Maior Risco:</p>
                                <p class="text-white text-sm">${escapeHtml(result.analise?.maior_risco || '')}</p>
                            </div>
                            <div class="bg-green-500/30 rounded p-3">
                                <p class="text-sm text-white/70 uppercase">💡 Maior Oportunidade:</p>
                                <p class="text-white text-sm">${escapeHtml(result.analise?.maior_oportunidade || '')}</p>
                            </div>
                        </div>
                        <div class="bg-yellow-500/30 rounded p-3">
                            <p class="text-sm text-white/70 uppercase">🎯 Ação Prioritária Recomendada:</p>
                            <p class="text-white font-medium">${escapeHtml(result.analise?.acao_prioritaria || '')}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Botão Aplicar -->
                <div class="flex justify-center gap-4">
                    <button onclick="applyAISuggestedParams(${result.termometro?.quente_ate_dias || 30}, ${result.termometro?.morno_ate_dias || 90}, ${result.vip?.vip_valor_minimo || 500}, ${result.vip?.fiel_pedidos_minimo || 5})" 
                            class="bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-bold hover:bg-yellow-300 transition-colors">
                        <i class="fas fa-check mr-2"></i> Aplicar Esses Parâmetros
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        responseDiv.innerHTML = `<p class="text-red-200"><i class="fas fa-exclamation-circle mr-2"></i> Erro: ${escapeHtml(error.message)}</p>`;
    }
}

// Variáveis globais para parâmetros customizáveis
let classificationParams = {
    hotDays: 30,
    warmDays: 90,
    vipMinValue: 500,
    loyalMinOrders: 5
};

function applyAISuggestedParams(hotDays, warmDays, vipMinValue, loyalMinOrders) {
    classificationParams = { hotDays, warmDays, vipMinValue, loyalMinOrders };
    
    // Salvar nas configurações
    const settings = Storage.getSettings();
    settings.classificationParams = classificationParams;
    Storage.saveSettings(settings);
    
    showToast('Parâmetros aplicados com sucesso! Atualizando dashboard...', 'success');
    
    // Recarregar dashboard
    renderGrowthDashboard();
}

// Carregar parâmetros salvos
function loadClassificationParams() {
    const settings = Storage.getSettings();
    if (settings.classificationParams) {
        classificationParams = settings.classificationParams;
    }
}

function setupGrowthEvents() {
    // Cliques nos cards de temperatura
    document.getElementById('temp-quente')?.addEventListener('click', () => showSegmentClients('quente'));
    document.getElementById('temp-morno')?.addEventListener('click', () => showSegmentClients('morno'));
    document.getElementById('temp-frio')?.addEventListener('click', () => showSegmentClients('frio'));
    
    // Botão atualizar análise
    document.getElementById('refresh-analysis-btn')?.addEventListener('click', renderGrowthDashboard);
    
    // Botões de IA
    document.getElementById('ai-suggest-params-btn')?.addEventListener('click', aiSuggestParameters);
    document.getElementById('ai-reactivation-btn')?.addEventListener('click', generateReactivationStrategy);
    document.getElementById('ai-vip-btn')?.addEventListener('click', () => {
        showSegmentClients('vip');
        generateReactivationStrategy();
    });
    
    // Modal WhatsApp
    document.getElementById('close-whatsapp-modal')?.addEventListener('click', () => closeModal('whatsapp-modal'));
    document.getElementById('cancel-whatsapp-btn')?.addEventListener('click', () => closeModal('whatsapp-modal'));
    document.getElementById('generate-ai-message')?.addEventListener('click', generateAIMessage);
    document.getElementById('generate-basic-message')?.addEventListener('click', generateBasicMessage);
    document.getElementById('send-whatsapp-btn')?.addEventListener('click', sendWhatsApp);
}

// ============================================================================
// RENDERIZAÇÃO GERAL
// ============================================================================

function renderAll() {
    renderClients();
    renderProducts();
    renderOrders();
    renderGrowthDashboard();
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

function setupEventListeners() {
    // Sincronização
    syncButton?.addEventListener('click', (e) => {
        e.preventDefault();
        syncData();
    });

    // Formulários
    clientForm?.addEventListener('submit', saveClient);
    settingsForm?.addEventListener('submit', saveSettings);

    // Confirmar exclusão
    document.getElementById('confirm-delete-button')?.addEventListener('click', deleteClient);

    // Filtros de clientes
    searchInput?.addEventListener('input', renderClients);
    filterStatusSelect?.addEventListener('change', renderClients);
    filterTagSelect?.addEventListener('change', renderClients);
    sortClientsSelect?.addEventListener('change', renderClients);

    // Filtros de produtos
    productSearchInput?.addEventListener('input', renderProducts);
    filterStockSelect?.addEventListener('change', renderProducts);
    filterActiveSelect?.addEventListener('change', renderProducts);

    // Filtros de pedidos
    orderSearchInput?.addEventListener('input', renderOrders);
    
    // Setup Growth Dashboard
    setupGrowthEvents();
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    console.log('CRM FacilZap - Inicializando...');
    
    initDOMReferences();
    setupNavigation();
    setupModals();
    setupEventListeners();
    
    // Carregar parâmetros de classificação salvos
    loadClassificationParams();
    
    // Carregar API Key nas configurações
    const settings = Storage.getSettings();
    const geminiKeyInput = document.getElementById('gemini-api-key');
    if (geminiKeyInput && settings.geminiApiKey) {
        geminiKeyInput.value = settings.geminiApiKey;
    }
    
    // Verificar última sincronização
    const lastSync = Storage.getLastSync();
    if (lastSync) {
        console.log('Última sincronização:', new Date(lastSync).toLocaleString('pt-BR'));
    }
    
    // Renderizar dados existentes
    renderAll();
    
    console.log('CRM FacilZap - Pronto!');
});

// Expor funções para uso global (para onclick no HTML)
window.viewOrderDetails = viewOrderDetails;
window.viewClientDetails = viewClientDetails;
window.openWhatsAppModal = openWhatsAppModal;
window.showSegmentClients = showSegmentClients;
window.copyToClipboard = copyToClipboard;
window.applyAISuggestedParams = applyAISuggestedParams;
