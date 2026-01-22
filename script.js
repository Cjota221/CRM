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
            riskDays: 60
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
        openModal('settings-modal');
    });
}

// ============================================================================
// SINCRONIZAÇÃO COM API
// ============================================================================

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
        
        if (!apiClients || !apiOrders || !apiProducts) {
            throw new Error("Resposta da API inválida.");
        }

        // Processar e salvar produtos
        const productsMap = new Map();
        const processedProducts = apiProducts.map(p => {
            const product = {
                id: String(p.id),
                name: p.nome || 'Produto sem nome',
                description: p.descricao || '',
                sku: p.sku || '',
                image: p.imagens?.[0] || null,
                isActive: p.ativado || false,
                managesStock: p.estoque?.controlar_estoque || false,
                price: 0 // Será atualizado dos pedidos
            };
            productsMap.set(product.id, product);
            return product;
        });
        Storage.saveProducts(processedProducts);

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
        apiOrders.forEach(order => {
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
            (product.sku && product.sku.toLowerCase().includes(searchTerm));

        const matchesStock = stockFilter === 'todos' ||
            (stockFilter === 'gerenciado' && product.managesStock) ||
            (stockFilter === 'nao-gerenciado' && !product.managesStock);

        const matchesActive = activeFilter === 'todos' ||
            (activeFilter === 'ativado' && product.isActive) ||
            (activeFilter === 'desativado' && !product.isActive);

        return matchesSearch && matchesStock && matchesActive;
    });

    productCountDisplay.textContent = `Exibindo ${filteredProducts.length} de ${products.length} produtos`;
    noProductsMessage?.classList.toggle('hidden', filteredProducts.length > 0);

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow';

        const imageUrl = product.image ? 
            `/api/image-proxy?url=${encodeURIComponent(product.image)}` : 
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="12">Sem Imagem</text></svg>';

        card.innerHTML = `
            <div class="aspect-square bg-gray-100 relative">
                <img src="${imageUrl}" alt="${escapeHtml(product.name)}" class="w-full h-full object-cover" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2212%22>Sem Imagem</text></svg>'">
                <span class="absolute top-2 right-2 stock-badge ${product.isActive ? 'stock-in' : 'stock-out'}">
                    ${product.isActive ? 'Ativo' : 'Inativo'}
                </span>
            </div>
            <div class="p-4">
                <h3 class="font-semibold text-gray-800 truncate" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
                <p class="text-sm text-gray-500 mb-2">SKU: ${escapeHtml(product.sku || 'N/A')}</p>
                <span class="stock-badge ${product.managesStock ? 'stock-in' : 'stock-unmanaged'}">
                    ${product.managesStock ? 'Estoque Gerenciado' : 'Sem Controle'}
                </span>
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

    const settings = {
        activeDays: parseInt(statusAtivoDaysInput.value) || 30,
        riskDays: parseInt(statusRiscoDaysInput.value) || 60
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
// RENDERIZAÇÃO GERAL
// ============================================================================

function renderAll() {
    renderClients();
    renderProducts();
    renderOrders();
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
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    console.log('CRM FacilZap - Inicializando...');
    
    initDOMReferences();
    setupNavigation();
    setupModals();
    setupEventListeners();
    
    // Verificar última sincronização
    const lastSync = Storage.getLastSync();
    if (lastSync) {
        console.log('Última sincronização:', new Date(lastSync).toLocaleString('pt-BR'));
    }
    
    // Renderizar dados existentes
    renderAll();
    
    console.log('CRM FacilZap - Pronto!');
});

// Expor função para uso global (para onclick no HTML)
window.viewOrderDetails = viewOrderDetails;
