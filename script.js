document.addEventListener('DOMContentLoaded', () => {
    const dbName = 'CRMDatabase_FacilZap_v2';
    let db;

    // --- Elementos Comuns da UI ---
    const syncButton = document.getElementById('sync-button');
    const openSettingsButton = document.getElementById('open-settings-button');
    
    // --- Navegação ---
    const navClients = document.getElementById('nav-clients');
    const navProducts = document.getElementById('nav-products');
    const clientsPage = document.getElementById('clients-page');
    const productsPage = document.getElementById('products-page');

    // --- Elementos da Página de Clientes ---
    const addClientButton = document.getElementById('add-client-button');
    const clientCardsContainer = document.getElementById('client-cards-container');
    const noClientsMessage = document.getElementById('no-clients-message');
    const searchInput = document.getElementById('search-input');
    const filterStatusSelect = document.getElementById('filter-status');
    const filterTagSelect = document.getElementById('filter-tag');
    const clientCountDisplay = document.getElementById('client-count-display');

    // --- Elementos da Página de Produtos ---
    const productCardsContainer = document.getElementById('product-cards-container');
    const noProductsMessage = document.getElementById('no-products-message');
    const productSearchInput = document.getElementById('product-search-input');
    const filterStockSelect = document.getElementById('filter-stock');
    const filterActiveSelect = document.getElementById('filter-active');
    const productCountDisplay = document.getElementById('product-count-display');

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
        const request = indexedDB.open(dbName, 3); // Versão incrementada para 3
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
        const transaction = db.transaction('settings', 'readonly');
        const request = transaction.objectStore('settings').get('config');
        request.onsuccess = (event) => {
            const savedSettings = event.target.result;
            if (savedSettings) currentSettings = { ...currentSettings, ...savedSettings };
            statusAtivoDaysInput.value = currentSettings.statusAtivoDays;
            statusRiscoDaysInput.value = currentSettings.statusRiscoDays;
            renderClients();
            renderProducts();
        };
        request.onerror = () => {
            renderClients();
            renderProducts();
        };
    }

    function showPage(pageId) {
        document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
        document.getElementById(pageId).classList.remove('hidden');

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        if (pageId === 'clients-page') {
            navClients.classList.add('active');
        } else if (pageId === 'products-page') {
            navProducts.classList.add('active');
        }
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
        const tx = db.transaction('clients', 'readonly');
        const store = tx.objectStore('clients');
        const request = store.getAll();

        request.onerror = (e) => console.error("Erro ao ler clientes do DB:", e.target.error);
        request.onsuccess = (e) => {
            const clients = e.target.result;
            clientCardsContainer.innerHTML = '';
            
            const searchTerm = searchInput.value.toLowerCase();
            const statusFilter = filterStatusSelect.value;
            const tagFilter = filterTagSelect.value;

            const filteredClients = clients.filter(client => {
                const status = getClientStatus(client).text.toLowerCase().replace(' ', '-');
                const tag = (client.orderCount >= 7) ? 'cliente-fiel' : 'sem-tag';
                const matchesStatus = statusFilter === 'todos' || status === statusFilter;
                const matchesTag = tagFilter === 'todos' || tag === tagFilter;
                const matchesSearch = !searchTerm ||
                    (client.name && client.name.toLowerCase().includes(searchTerm)) ||
                    (client.email && client.email.toLowerCase().includes(searchTerm));
                return matchesStatus && matchesTag && matchesSearch;
            });
            
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
        const tx = db.transaction('products', 'readonly');
        const store = tx.objectStore('products');
        const request = store.getAll();

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
                
                // Lógica para usar o proxy de imagem
                const imageUrl = product.image 
                    ? `/api/image-proxy?url=${encodeURIComponent(product.image)}`
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

    async function syncData() {
        showToast('Buscando dados na FacilZap... Isso pode levar um momento.', 'info');
        syncButton.disabled = true;
        syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center animate-spin"></i><span class="ml-4">Sincronizando...</span>';

        try {
            const response = await fetch('/api/facilzap-proxy');
            if (!response.ok) throw new Error((await response.json()).error || `Erro HTTP ${response.status}`);

            const { clients: apiClients, orders: apiOrders, products: apiProducts } = await response.json(); 
            if (!apiClients || !apiOrders || !apiProducts) throw new Error("Resposta da API inválida.");
            
            const clientsData = new Map();
            apiClients.forEach(c => {
                if (!c || !c.id) return;
                clientsData.set(c.id, {
                    id: c.id, name: c.nome, email: c.email, phone: c.whatsapp,
                    birthday: c.data_nascimento, cpf: c.cpf, address: c.endereco,
                    address_number: c.numero, address_complement: c.complemento,
                    address_neighborhood: c.bairro, city: c.cidade, state: c.estado,
                    zip_code: c.cep, lastPurchaseDate: c.ultima_compra ? new Date(c.ultima_compra) : null,
                    totalSpent: 0, orderCount: 0, products: new Map()
                });
            });
            apiOrders.forEach(order => {
                const clientId = order.cliente?.id;
                if (!clientId || !clientsData.has(clientId)) return;
                const client = clientsData.get(clientId);
                client.totalSpent += parseFloat(order.total || 0);
                client.orderCount++;
                const orderDate = order.data ? new Date(order.data) : null;
                if (orderDate && (!client.lastPurchaseDate || client.lastPurchaseDate < orderDate)) client.lastPurchaseDate = orderDate;
                (order.produtos || order.itens)?.forEach(item => {
                    const productMap = client.products;
                    if (!item.codigo || !item.nome) return;
                    if (productMap.has(item.codigo)) productMap.get(item.codigo).quantity += (parseInt(item.quantidade) || 1);
                    else productMap.set(item.codigo, { name: item.nome, quantity: (parseInt(item.quantidade) || 1), price: (parseFloat(item.subtotal || item.valor || 0) / (parseInt(item.quantidade) || 1)) });
                });
            });

            const clientTx = db.transaction('clients', 'readwrite');
            await Promise.all(Array.from(clientsData.values()).map(client => {
                const finalClient = { ...client, products: Array.from(client.products.values()), lastPurchaseDate: client.lastPurchaseDate?.toISOString().split('T')[0] || null };
                return new Promise((res, rej) => {
                    const req = clientTx.objectStore('clients').put(finalClient);
                    req.onsuccess = res; req.onerror = rej;
                });
            }));
            
            const productTx = db.transaction('products', 'readwrite');
            await Promise.all(apiProducts.map(p => {
                const productData = {
                    id: p.id, name: p.nome, sku: p.sku,
                    image: p.imagens?.[0] || null,
                    isActive: p.ativado,
                    managesStock: p.estoque?.controlar_estoque || false
                };
                return new Promise((res, rej) => {
                    const req = productTx.objectStore('products').put(productData);
                    req.onsuccess = res; req.onerror = rej;
                });
            }));

            showToast(`Sincronização concluída!`, 'success');
            renderClients();
            renderProducts();

        } catch (error) {
            console.error('Erro na sincronização:', error);
            showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
        } finally {
            syncButton.disabled = false;
            syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
        }
    }
    
    function setupEventListeners() {
        navClients.addEventListener('click', (e) => { e.preventDefault(); showPage('clients-page'); });
        navProducts.addEventListener('click', (e) => { e.preventDefault(); showPage('products-page'); });
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
        closeDetailsButton.addEventListener('click', () => closeModal('details-modal'));
        openSettingsButton.addEventListener('click', () => openModal('settings-modal'));
        settingsForm.addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
        cancelSettingsButton.addEventListener('click', () => closeModal('settings-modal'));
        confirmDeleteButton.addEventListener('click', confirmDeletion);
        cancelDeleteButton.addEventListener('click', () => closeModal('confirm-modal'));
        searchInput.addEventListener('input', renderClients);
        filterStatusSelect.addEventListener('change', renderClients);
        filterTagSelect.addEventListener('change', renderClients);
        productSearchInput.addEventListener('input', renderProducts);
        filterStockSelect.addEventListener('change', renderProducts);
        filterActiveSelect.addEventListener('change', renderProducts);
        syncButton.addEventListener('click', syncData);
    }
    
    function saveSettings() { if (!db) return; const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ id: 'config', statusAtivoDays: parseInt(statusAtivoDaysInput.value,10)||30, statusRiscoDays: parseInt(statusRiscoDaysInput.value,10)||90 }); tx.oncomplete = () => { showToast('Configurações salvas!', 'success'); closeModal('settings-modal'); loadSettingsAndRenderAll(); }; }
    function handleFormSubmit(e) { e.preventDefault(); const id = clientIdInput.value; const data={ name: name.value, email: email.value, phone: phone.value, birthday: birthday.value }; const tx = db.transaction('clients', 'readwrite'); if (id) { const req = tx.objectStore('clients').get(id); req.onsuccess = () => tx.objectStore('clients').put({ ...req.result, ...data, id: id }); } else { tx.objectStore('clients').add({ ...data, id: `manual_${Date.now()}` }); } tx.oncomplete = () => { renderClients(); closeModal('client-modal'); showToast(`Cliente ${id ? 'atualizado' : 'adicionado'}!`, 'success'); }; }
    function editClient(id) { const req = db.transaction('clients', 'readonly').objectStore('clients').get(id); req.onsuccess = (e) => { const c = e.target.result; modalTitle.textContent = 'Editar Cliente'; clientIdInput.value = c.id; name.value = c.name; email.value = c.email; phone.value = c.phone; birthday.value = c.birthday; openModal('client-modal'); }; }
    function viewClientDetails(id) { const req = db.transaction('clients', 'readonly').objectStore('clients').get(id); req.onsuccess = (e) => { const c = e.target.result; detailsModalTitle.textContent = `Detalhes de ${c.name}`; let phtml='<p class="text-sm text-gray-500">Nenhum produto comprado.</p>'; if(c.products&&c.products.length>0){phtml=`<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th><th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd</th><th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">${c.products.map(p=>`<tr><td class="px-4 py-2 whitespace-nowrap">${p.name}</td><td class="px-4 py-2 text-center">${p.quantity}</td><td class="px-4 py-2 text-right font-medium">R$ ${(p.price*p.quantity).toFixed(2)}</td></tr>`).join('')}</tbody></table>`;} const addr=[c.address,c.address_number,c.address_complement].filter(Boolean).join(', ')+(c.address_neighborhood?` - ${c.address_neighborhood}`:'')+(c.city?`<br>${c.city}`:'')+(c.state?`/${c.state}`:'')+(c.zip_code?` - CEP: ${c.zip_code}`:''); detailsModalContent.innerHTML=`<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm mb-6 pb-4 border-b"><div><strong class="text-gray-600 block"><i class="fas fa-envelope fa-fw mr-2 text-gray-400"></i>E-mail:</strong> ${c.email||'N/A'}</div><div><strong class="text-gray-600 block"><i class="fas fa-phone fa-fw mr-2 text-gray-400"></i>Telefone:</strong> ${c.phone||'N/A'}</div><div><strong class="text-gray-600 block"><i class="fas fa-id-card fa-fw mr-2 text-gray-400"></i>CPF:</strong> ${c.cpf||'N/A'}</div><div><strong class="text-gray-600 block"><i class="fas fa-gift fa-fw mr-2 text-gray-400"></i>Aniversário:</strong> ${c.birthday?new Date(c.birthday).toLocaleDateString():'N/A'}</div><div class="md:col-span-2"><strong class="text-gray-600 block"><i class="fas fa-map-marker-alt fa-fw mr-2 text-gray-400"></i>Endereço:</strong> ${addr||'N/A'}</div></div><div class="mt-4"><h3 class="text-lg font-semibold mb-2">Histórico de Compras</h3>${phtml}</div>`; openModal('details-modal'); }; }
    function confirmDeletion() { if (!clientIdToDelete) return; const tx = db.transaction('clients', 'readwrite'); tx.objectStore('clients').delete(clientIdToDelete).onsuccess=()=>{renderClients();showToast('Cliente excluído.', 'success');}; closeModal('confirm-modal'); clientIdToDelete=null; }
    function openModal(modalId) { if(modalId==='client-modal'){clientForm.reset();clientIdInput.value='';modalTitle.textContent='Adicionar Novo Cliente';} document.getElementById(modalId).classList.remove('hidden'); }
    function closeModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

    initDB();
    setupEventListeners();
});

