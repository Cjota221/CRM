document.addEventListener('DOMContentLoaded', () => {
    const dbName = 'CRMDatabase_FacilZap_v3';
    let db;

    // --- Elementos Comuns da UI ---
    const syncButton = document.getElementById('sync-button');
    const openSettingsButton = document.getElementById('open-settings-button');

    // --- Navegação ---
    const navClients = document.getElementById('nav-clients');
    const navProducts = document.getElementById('nav-products');
    const navOrders = document.getElementById('nav-orders');

    // --- Páginas ---
    const clientsPage = document.getElementById('clients-page');
    const productsPage = document.getElementById('products-page');
    const ordersPage = document.getElementById('orders-page');

    // --- Elementos da Página de Clientes ---
    const addClientButton = document.getElementById('add-client-button');
    const clientCardsContainer = document.getElementById('client-cards-container');
    const noClientsMessage = document.getElementById('no-clients-message');
    const searchInput = document.getElementById('search-input');
    const filterStatusSelect = document.getElementById('filter-status');
    const filterTagSelect = document.getElementById('filter-tag');
    const sortClientsSelect = document.getElementById('sort-clients');
    const clientCountDisplay = document.getElementById('client-count-display');

    // --- Elementos da Página de Produtos ---
    const productCardsContainer = document.getElementById('product-cards-container');
    const noProductsMessage = document.getElementById('no-products-message');
    const productSearchInput = document.getElementById('product-search-input');
    const filterStockSelect = document.getElementById('filter-stock');
    const filterActiveSelect = document.getElementById('filter-active');
    const productCountDisplay = document.getElementById('product-count-display');

    // --- Elementos da Página de Pedidos ---
    const orderListContainer = document.getElementById('order-list-container');
    const noOrdersMessage = document.getElementById('no-orders-message');
    const orderSearchInput = document.getElementById('order-search-input');
    const orderCountDisplay = document.getElementById('order-count-display');

    // --- Modais ---
    const clientModal = document.getElementById('client-modal');
    const clientForm = document.getElementById('client-form');
    const cancelButton = document.getElementById('cancel-button');
    const modalTitle = document.getElementById('modal-title');
    const clientIdInput = document.getElementById('client-id');
    const detailsModal = document.getElementById('details-modal');
    const closeDetailsButton = document.getElementById('close-details-button');
    const detailsModalTitle = document.getElementById('details-modal-title');
    const detailsModalContent = document.getElementById('details-modal-content');
    const settingsModal = document.getElementById('settings-modal');
    const settingsForm = document.getElementById('settings-form');
    const cancelSettingsButton = document.getElementById('cancel-settings-button');
    const statusAtivoDaysInput = document.getElementById('status-ativo-days');
    const statusRiscoDaysInput = document.getElementById('status-risco-days');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmDeleteButton = document.getElementById('confirm-delete-button');
    const cancelDeleteButton = document.getElementById('cancel-delete-button');

    let currentSettings = { statusAtivoDays: 30, statusRiscoDays: 90 };
    let clientIdToDelete = null;

    function initDB() {
        const request = indexedDB.open(dbName, 4);
        request.onerror = (e) => console.error('Erro no DB:', e.target.errorCode);
        request.onsuccess = (e) => {
            db = e.target.result;
            loadSettingsAndRenderAll();
        };
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('clients')) {
                db.createObjectStore('clients', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('products')) {
                const productStore = db.createObjectStore('products', { keyPath: 'id' });
                productStore.createIndex('name', 'name', { unique: false });
                productStore.createIndex('sku', 'sku', { unique: false });
            }
            if (!db.objectStoreNames.contains('orders')) {
                const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
                orderStore.createIndex('codigo', 'codigo', { unique: false });
                orderStore.createIndex('clientName', 'clientName', { unique: false });
            }
        };
    }

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast-notification ${'toast-' + type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => container.removeChild(toast), 300);
        }, duration);
    }

    function loadSettingsAndRenderAll() {
        if (!db) return;
        const request = db.transaction('settings', 'readonly').objectStore('settings').get('config');
        request.onsuccess = (event) => {
            const savedSettings = event.target.result;
            if (savedSettings) currentSettings = { ...currentSettings, ...savedSettings };
            statusAtivoDaysInput.value = currentSettings.statusAtivoDays;
            statusRiscoDaysInput.value = currentSettings.statusRiscoDays;
            renderClients();
            renderProducts();
            renderOrders();
        };
        request.onerror = () => {
            renderClients();
            renderProducts();
            renderOrders();
        };
    }

    function showPage(pageId) {
        document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
        document.getElementById(pageId).classList.remove('hidden');

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById(`nav-${pageId.split('-')[0]}`).classList.add('active');
    }

    function getClientStatus(client) {
        if (!client.lastPurchaseDate) return { text: 'Sem Histórico', class: 'status-sem-historico' };
        const diffDays = Math.ceil((new Date() - new Date(client.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
        if (diffDays <= currentSettings.statusAtivoDays) return { text: 'Ativo', class: 'status-ativo' };
        if (diffDays <= currentSettings.statusRiscoDays) return { text: 'Em Risco', class: 'status-risco' };
        return { text: 'Inativo', class: 'status-inativo' };
    }

    function renderClients() {
        if (!db) return;
        const request = db.transaction('clients', 'readonly').objectStore('clients').getAll();

        request.onerror = (e) => console.error("Erro ao ler clientes do DB:", e.target.error);
        request.onsuccess = (e) => {
            const clients = e.target.result;
            clientCardsContainer.innerHTML = '';
            
            const searchTerm = searchInput.value.toLowerCase();
            const statusFilter = filterStatusSelect.value;
            const tagFilter = filterTagSelect.value;
            const sortOption = sortClientsSelect.value;

            let filteredClients = clients.filter(client => {
                const status = getClientStatus(client).text.toLowerCase().replace(' ', '-');
                const tag = (client.orderCount >= 7) ? 'cliente-fiel' : 'sem-tag';
                const matchesStatus = statusFilter === 'todos' || status === statusFilter;
                const matchesTag = tagFilter === 'todos' || tag === tagFilter;
                const matchesSearch = !searchTerm ||
                    (client.name && client.name.toLowerCase().includes(searchTerm)) ||
                    (client.email && client.email.toLowerCase().includes(searchTerm));
                return matchesStatus && matchesTag && matchesSearch;
            });
            
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
            }

            clientCountDisplay.textContent = `Exibindo ${filteredClients.length} de ${clients.length} clientes`;
            noClientsMessage.classList.toggle('hidden', filteredClients.length > 0);
            filteredClients.forEach(client => {
                const status = getClientStatus(client);
                const card = document.createElement('div');
                card.className = 'bg-white rounded-lg shadow-md p-5 flex flex-col justify-between';
                card.innerHTML = `
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-gray-800 text-lg">${client.name || 'Cliente sem nome'}</h3>
                            <span class="status-badge ${status.class}">${status.text}</span>
                        </div>
                        <p class="text-sm text-gray-500 mb-4 truncate">${client.email || 'Sem e-mail'}</p>
                        <div class="text-sm space-y-2 mb-4">
                            <p><i class="fas fa-shopping-basket fa-fw text-gray-400 mr-2"></i>Pedidos: <span class="font-semibold">${client.orderCount || 0}</span></p>
                            <p><i class="fas fa-dollar-sign fa-fw text-gray-400 mr-2"></i>Total Gasto: <span class="font-semibold">R$ ${client.totalSpent ? client.totalSpent.toFixed(2) : '0.00'}</span></p>
                            <p><i class="fas fa-calendar-alt fa-fw text-gray-400 mr-2"></i>Última Compra: <span class="font-semibold">${client.lastPurchaseDate ? new Date(client.lastPurchaseDate).toLocaleDateString() : 'N/A'}</span></p>
                        </div>
                        ${(client.orderCount >= 7) ? `<div class="mb-4"><span class="tag-badge tag-fiel">Cliente Fiel</span></div>` : ''}
                    </div>
                    <div class="border-t pt-4 flex justify-end space-x-2">
                        <button class="text-gray-500 hover:text-indigo-600 view-details-button" data-id="${client.id}" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                        <button class="text-gray-500 hover:text-blue-600 edit-client-button" data-id="${client.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="text-gray-500 hover:text-red-600 delete-client-button" data-id="${client.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                clientCardsContainer.appendChild(card);
            });
        };
    }

    function renderProducts() {
        if (!db) return;
        const request = db.transaction('products', 'readonly').objectStore('products').getAll();

        request.onerror = (e) => console.error("Erro ao ler produtos do DB:", e.target.error);
        request.onsuccess = (e) => {
            const products = e.target.result;
            productCardsContainer.innerHTML = '';

            const searchTerm = productSearchInput.value.toLowerCase();
            const stockFilter = filterStockSelect.value;
            const activeFilter = filterActiveSelect.value;

            const filteredProducts = products.filter(p => {
                const matchesSearch = !searchTerm || 
                    (p.name && p.name.toLowerCase().includes(searchTerm)) ||
                    (p.sku && p.sku.toLowerCase().includes(searchTerm));
                const stockStatus = p.managesStock ? 'gerenciado' : 'nao-gerenciado';
                const matchesStock = stockFilter === 'todos' || stockFilter === stockStatus;
                const activeStatus = p.isActive ? 'ativado' : 'desativado';
                const matchesActive = activeFilter === 'todos' || activeFilter === activeStatus;
                return matchesSearch && matchesStock && matchesActive;
            });

            productCountDisplay.textContent = `Exibindo ${filteredProducts.length} de ${products.length} produtos`;
            noProductsMessage.classList.toggle('hidden', filteredProducts.length > 0);

            filteredProducts.forEach(product => {
                const stock = product.managesStock 
                    ? { text: 'Gerenciado', class: 'stock-in' } 
                    : { text: 'Não Gerenciado', class: 'stock-unmanaged' };
                const active = product.isActive
                    ? { text: 'Ativado', class: 'status-ativo' }
                    : { text: 'Desativado', class: 'status-inativo' };
                
                const imageUrl = product.image 
                    ? `/facilzap-images/${encodeURIComponent(product.image)}`
                    : 'https://placehold.co/400x400/f3f4f6/cbd5e0?text=Sem+Imagem';

                const card = document.createElement('div');
                card.className = 'bg-white rounded-lg shadow-md p-5 flex flex-col justify-between';
                card.innerHTML = `
                    <div class="flex-1">
                        <div class="relative mb-4" style="padding-bottom: 100%;">
                            <img src="${imageUrl}" class="absolute h-full w-full object-cover rounded-md" onerror="this.onerror=null;this.src='https://placehold.co/400x400/f3f4f6/cbd5e0?text=Erro';">
                        </div>
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-gray-800 text-md leading-tight">${product.name || 'Produto sem nome'}</h3>
                            <span class="status-badge ${active.class}">${active.text}</span>
                        </div>
                        <p class="text-sm text-gray-500 mb-4">SKU: ${product.sku || 'N/A'}</p>
                    </div>
                    <div>
                        <span class="stock-badge ${stock.class}">${stock.text}</span>
                    </div>
                `;
                productCardsContainer.appendChild(card);
            });
        };
    }

    function renderOrders() {
        if (!db) return;
        const request = db.transaction('orders', 'readonly').objectStore('orders').getAll();

        request.onerror = (e) => console.error("Erro ao ler pedidos do DB:", e.target.error);
        request.onsuccess = (e) => {
            const orders = e.target.result;
            console.log('Pedidos carregados do DB:', orders); // Debug
            orderListContainer.innerHTML = '';

            const searchTerm = orderSearchInput.value.toLowerCase();

            const filteredOrders = orders.filter(order => {
                return !searchTerm ||
                    (order.codigo && order.codigo.toLowerCase().includes(searchTerm)) ||
                    (order.clientName && order.clientName.toLowerCase().includes(searchTerm));
            });

            orderCountDisplay.textContent = `Exibindo ${filteredOrders.length} de ${orders.length} pedidos`;
            noOrdersMessage.classList.toggle('hidden', filteredOrders.length > 0);

            // Ordenar por data (mais recentes primeiro)
            filteredOrders.sort((a, b) => new Date(b.data) - new Date(a.data));

            filteredOrders.forEach(order => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${order.codigo || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.clientName || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.data ? new Date(order.data).toLocaleDateString('pt-BR') : 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-right font-semibold">R$ ${(order.total || 0).toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <button class="text-indigo-600 hover:text-indigo-900 view-client-from-order" data-client-id="${order.clientId}" title="Ver Cliente" ${!order.clientId ? 'disabled' : ''}>
                            <i class="fas fa-user ${!order.clientId ? 'text-gray-300' : ''}"></i>
                        </button>
                    </td>
                `;
                orderListContainer.appendChild(row);
            });
        };
    }

    async function syncData() {
        showToast('Buscando dados na FacilZap... Isso pode levar um momento.', 'info');
        syncButton.disabled = true;
        syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center animate-spin"></i><span class="ml-4">Sincronizando...</span>';

        try {
            const response = await fetch('/api/facilzap-proxy');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro HTTP ${response.status}`);
            }

            const { clients: apiClients, orders: apiOrders, products: apiProducts } = await response.json();
            console.log('Dados recebidos da API:', { 
                clientsCount: apiClients?.length, 
                ordersCount: apiOrders?.length, 
                productsCount: apiProducts?.length,
                sampleOrder: apiOrders?.[0] // Debug - mostrar estrutura de um pedido
            });
            
            if (!apiClients || !apiOrders || !apiProducts) {
                throw new Error("Resposta da API inválida.");
            }
            
            // Mapear clientes
            const clientsData = new Map();
            apiClients.forEach(c => {
                if (!c || !c.id) return;
                clientsData.set(String(c.id), {
                    id: String(c.id), 
                    name: c.nome, 
                    email: c.email, 
                    phone: c.whatsapp,
                    birthday: c.data_nascimento, 
                    cpf: c.cpf, 
                    address: c.endereco,
                    address_number: c.numero, 
                    address_complement: c.complemento,
                    address_neighborhood: c.bairro, 
                    city: c.cidade, 
                    state: c.estado,
                    zip_code: c.cep, 
                    lastPurchaseDate: null,
                    totalSpent: 0, 
                    orderCount: 0, 
                    products: new Map()
                });
            });
            
            console.log('Clientes mapeados:', clientsData.size);
            
            // Processar pedidos
            const ordersToSave = [];
            let processedOrders = 0;
            let ordersWithClient = 0;
            let ordersWithoutClient = 0;

            apiOrders.forEach((order, index) => {
                console.log(`Processando pedido ${index + 1}:`, order); // Debug detalhado
                
                // Validar se o pedido tem ID
                if (!order.id) {
                    console.warn('Pedido sem ID ignorado:', order);
                    return;
                }

                // Buscar ID do cliente de várias formas possíveis
                let clientId = null;
                if (order.cliente?.id) {
                    clientId = String(order.cliente.id);
                } else if (order.cliente_id) {
                    clientId = String(order.cliente_id);
                } else if (order.clienteId) {
                    clientId = String(order.clienteId);
                }

                // Buscar nome do cliente
                let clientName = null;
                if (order.cliente?.nome) {
                    clientName = order.cliente.nome;
                } else if (order.cliente_nome) {
                    clientName = order.cliente_nome;
                } else if (order.clienteName) {
                    clientName = order.clienteName;
                }

                console.log(`Pedido ${order.id}: clientId=${clientId}, clientName=${clientName}`);

                // Sempre salvar o pedido, mesmo sem cliente
                const orderToSave = {
                    id: String(order.id),
                    codigo: order.codigo || order.number || String(order.id),
                    data: order.data || order.created_at || order.date || new Date().toISOString(),
                    total: parseFloat(order.total || order.valor_total || order.amount || 0),
                    clientId: clientId,
                    clientName: clientName
                };

                ordersToSave.push(orderToSave);
                processedOrders++;

                // Se tem cliente, processar dados do cliente
                if (clientId && clientsData.has(clientId)) {
                    ordersWithClient++;
                    const client = clientsData.get(clientId);
                    client.totalSpent += orderToSave.total;
                    client.orderCount++;
                    
                    const orderDate = new Date(orderToSave.data);
                    if (!client.lastPurchaseDate || client.lastPurchaseDate < orderDate) {
                        client.lastPurchaseDate = orderDate;
                    }
                    
                    // Processar produtos do pedido
                    const productList = order.produtos || order.itens || order.products || order.items || [];
                    productList.forEach(item => {
                        if (!item.codigo && !item.sku && !item.id) return;
                        
                        const productCode = item.codigo || item.sku || String(item.id);
                        const quantity = parseInt(item.quantidade || item.quantity || 1);
                        const itemTotal = parseFloat(item.subtotal || item.valor || item.total || 0);
                        const price = quantity > 0 ? (itemTotal / quantity) : 0;

                        const productMap = client.products;
                        if (productMap.has(productCode)) {
                            productMap.get(productCode).quantity += quantity;
                        } else {
                            productMap.set(productCode, { 
                                name: item.nome || item.name || productCode, 
                                quantity: quantity, 
                                price: price 
                            });
                        }
                    });
                } else {
                    ordersWithoutClient++;
                    if (clientId) {
                        console.warn(`Cliente ID ${clientId} não encontrado na lista de clientes`);
                    }
                }
            });

            console.log(`Resumo do processamento:
                - Pedidos processados: ${processedOrders}
                - Pedidos com cliente: ${ordersWithClient}
                - Pedidos sem cliente: ${ordersWithoutClient}
                - Total a salvar: ${ordersToSave.length}`);

            // Salvar no IndexedDB com promises para aguardar conclusão
            const clientTxPromise = new Promise((resolve, reject) => {
                const clientTx = db.transaction('clients', 'readwrite');
                clientTx.oncomplete = resolve;
                clientTx.onerror = reject;
                
                const clientStore = clientTx.objectStore('clients');
                clientStore.clear();
                
                Array.from(clientsData.values()).forEach(client => {
                    const finalClient = { 
                        ...client, 
                        products: Array.from(client.products.values()), 
                        lastPurchaseDate: client.lastPurchaseDate?.toISOString().split('T')[0] || null 
                    };
                    clientStore.put(finalClient);
                });
            });

            const productTxPromise = new Promise((resolve, reject) => {
                const productTx = db.transaction('products', 'readwrite');
                productTx.oncomplete = resolve;
                productTx.onerror = reject;
                
                const productStore = productTx.objectStore('products');
                productStore.clear();
                
                apiProducts.forEach(p => {
                    productStore.put({
                        id: String(p.id), 
                        name: p.nome || p.name, 
                        sku: p.sku,
                        image: p.imagens?.[0] || p.image || null,
                        isActive: p.ativado !== false,
                        managesStock: p.estoque?.controlar_estoque || false
                    });
                });
            });

            const orderTxPromise = new Promise((resolve, reject) => {
                const orderTx = db.transaction('orders', 'readwrite');
                orderTx.oncomplete = () => {
                    console.log('Transação de pedidos concluída');
                    resolve();
                };
                orderTx.onerror = (e) => {
                    console.error('Erro na transação de pedidos:', e);
                    reject(e);
                };
                
                const orderStore = orderTx.objectStore('orders');
                orderStore.clear();
                
                console.log(`Salvando ${ordersToSave.length} pedidos no IndexedDB`);
                ordersToSave.forEach((order, index) => {
                    console.log(`Salvando pedido ${index + 1}:`, order);
                    const request = orderStore.put(order);
                    request.onerror = (e) => console.error(`Erro ao salvar pedido ${order.id}:`, e);
                });
            });

            await Promise.all([clientTxPromise, productTxPromise, orderTxPromise]);

            showToast(`Sincronização concluída! ${processedOrders} pedidos importados.`, 'success');
            loadSettingsAndRenderAll();

        } catch (error) {
            console.error('Erro na sincronização:', error);
            showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
        } finally {
            syncButton.disabled = false;
            syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
        }
    }
    
    function openModal(modalId) { 
        if (modalId === 'client-modal') { 
            clientForm.reset(); 
            clientIdInput.value = ''; 
            modalTitle.textContent = 'Adicionar Novo Cliente'; 
        } 
        document.getElementById(modalId).classList.remove('hidden'); 
    }
    
    function closeModal(modalId) { 
        document.getElementById(modalId).classList.add('hidden'); 
    }
    
    function saveSettings() { 
        if (!db) return; 
        const tx = db.transaction('settings', 'readwrite'); 
        tx.objectStore('settings').put({ 
            id: 'config', 
            statusAtivoDays: parseInt(statusAtivoDaysInput.value, 10) || 30, 
            statusRiscoDays: parseInt(statusRiscoDaysInput.value, 10) || 90 
        }); 
        tx.oncomplete = () => { 
            showToast('Configurações salvas!', 'success'); 
            closeModal('settings-modal'); 
            loadSettingsAndRenderAll(); 
        }; 
    }
    
    function handleFormSubmit(e) { 
        e.preventDefault(); 
        const id = clientIdInput.value; 
        const data = { 
            name: document.getElementById('name').value, 
            email: document.getElementById('email').value, 
            phone: document.getElementById('phone').value, 
            birthday: document.getElementById('birthday').value 
        }; 
        const tx = db.transaction('clients', 'readwrite'); 
        if (id) { 
            const req = tx.objectStore('clients').get(id); 
            req.onsuccess = () => { 
                tx.objectStore('clients').put({ ...req.result, ...data, id: id }); 
            }; 
        } else { 
            tx.objectStore('clients').add({ ...data, id: `manual_${Date.now()}` }); 
        } 
        tx.oncomplete = () => { 
            renderClients(); 
            closeModal('client-modal'); 
            showToast(`Cliente ${id ? 'atualizado' : 'adicionado'}!`, 'success'); 
        }; 
    }
    
    function editClient(id) { 
        const req = db.transaction('clients', 'readonly').objectStore('clients').get(id); 
        req.onerror = () => showToast('Erro ao buscar cliente para edição.', 'error'); 
        req.onsuccess = (e) => { 
            const client = e.target.result; 
            if (client) { 
                modalTitle.textContent = 'Editar Cliente'; 
                clientIdInput.value = client.id; 
                document.getElementById('name').value = client.name || ''; 
                document.getElementById('email').value = client.email || ''; 
                document.getElementById('phone').value = client.phone || ''; 
                document.getElementById('birthday').value = client.birthday || ''; 
                openModal('client-modal'); 
            } else { 
                showToast('Cliente não encontrado. Sincronize os dados.', 'error'); 
            } 
        }; 
    }
    
    function viewClientDetails(id) { 
        const req = db.transaction('clients', 'readonly').objectStore('clients').get(id); 
        req.onerror = () => showToast('Erro ao buscar detalhes do cliente.', 'error'); 
        req.onsuccess = (e) => { 
            const c = e.target.result; 
            if (!c) { 
                showToast('Não foi possível carregar os detalhes. Sincronize os dados.', 'error'); 
                return; 
            } 
            detailsModalTitle.textContent = `Detalhes de ${c.name}`; 
            let phtml = '<p class="text-sm text-gray-500">Nenhum produto comprado.</p>'; 
            if (c.products && c.products.length > 0) { 
                phtml = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th><th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd</th><th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Un.</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">${c.products.map(p=>`<tr><td class="px-4 py-2 whitespace-nowrap">${p.name}</td><td class="px-4 py-2 text-center">${p.quantity}</td><td class="px-4 py-2 text-right font-medium">R$ ${p.price.toFixed(2)}</td></tr>`).join('')}</tbody></table>`; 
            } 
            const addr = [c.address, c.address_number, c.address_complement].filter(Boolean).join(', ') + (c.address_neighborhood ? ` - ${c.address_neighborhood}` : '') + (c.city ? `<br>${c.city}` : '') + (c.state ? `/${c.state}` : '') + (c.zip_code ? ` - CEP: ${c.zip_code}` : ''); 
            detailsModalContent.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm mb-6 pb-4 border-b"><div><strong class="text-gray-600 block"><i class="fas fa-envelope fa-fw mr-2 text-gray-400"></i>E-mail:</strong> ${c.email||'N/A'}</div><div><strong class="text-gray-600 block"><i class="fas fa-phone fa-fw mr-2 text-gray-400"></i>Telefone:</strong> ${c.phone||'N/A'}</div><div><strong class="text-gray-600 block"><i class="fas fa-id-card fa-fw mr-2 text-gray-400"></i>CPF:</strong> ${c.cpf||'N/A'}</div><div><strong class="text-gray-600 block"><i class="fas fa-gift fa-fw mr-2 text-gray-400"></i>Aniversário:</strong> ${c.birthday?new Date(c.birthday).toLocaleDateString():'N/A'}</div><div class="md:col-span-2"><strong class="text-gray-600 block"><i class="fas fa-map-marker-alt fa-fw mr-2 text-gray-400"></i>Endereço:</strong> ${addr||'N/A'}</div></div><div class="mt-4"><h3 class="text-lg font-semibold mb-2">Histórico de Compras</h3>${phtml}</div>`; 
            openModal('details-modal'); 
        }; 
    }
    
    function confirmDeletion() { 
        if (!clientIdToDelete) return; 
        const tx = db.transaction('clients', 'readwrite'); 
        tx.objectStore('clients').delete(clientIdToDelete).onsuccess = () => { 
            renderClients(); 
            showToast('Cliente excluído.', 'success'); 
        }; 
        closeModal('confirm-modal'); 
        clientIdToDelete = null; 
    }
    
    function setupEventListeners() {
        navClients.addEventListener('click', (e) => { e.preventDefault(); showPage('clients-page'); });
        navProducts.addEventListener('click', (e) => { e.preventDefault(); showPage('products-page'); });
        navOrders.addEventListener('click', (e) => { e.preventDefault(); showPage('orders-page'); });
        
        addClientButton.addEventListener('click', () => openModal('client-modal'));
        cancelButton.addEventListener('click', () => closeModal('client-modal'));
        clientForm.addEventListener('submit', handleFormSubmit);
        
        clientCardsContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            const id = button.dataset.id;
            if (button.classList.contains('view-details-button')) viewClientDetails(id);
            else if (button.classList.contains('edit-client-button')) editClient(id);
            else if (button.classList.contains('delete-client-button')) { clientIdToDelete = id; openModal('confirm-modal'); }
        });

        orderListContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button.view-client-from-order');
            if (button) {
                const clientId = button.dataset.clientId;
                if (clientId && clientId !== 'null') {
                    // Mudar para a página de clientes e mostrar detalhes
                    showPage('clients-page');
                    setTimeout(() => viewClientDetails(clientId), 100);
                }
            }
        });

        closeDetailsButton.addEventListener('click', () => closeModal('details-modal'));
        openSettingsButton.addEventListener('click', () => openModal('settings-modal'));
        settingsForm.addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
        cancelSettingsButton.addEventListener('click', () => closeModal('settings-modal'));
        confirmDeleteButton.addEventListener('click', confirmDeletion);
        cancelDeleteButton.addEventListener('click', () => closeModal('confirm-modal'));
        
        searchInput.addEventListener('input', renderClients);
        filterStatusSelect.addEventListener('change', renderClients);
        filterTagSelect.addEventListener('change', renderClients);
        sortClientsSelect.addEventListener('change', renderClients);
        productSearchInput.addEventListener('input', renderProducts);
        filterStockSelect.addEventListener('change', renderProducts);
        filterActiveSelect.addEventListener('change', renderProducts);
        orderSearchInput.addEventListener('input', renderOrders);
        
        syncButton.addEventListener('click', syncData);
    }

    initDB();
    setupEventListeners();
    showPage('clients-page');
});
