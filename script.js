document.addEventListener('DOMContentLoaded', () => {
    const dbName = 'CRMDatabase_FacilZap_v2';
    let db;

    // Elementos da UI
    const syncButton = document.getElementById('sync-button');
    const openSettingsButton = document.getElementById('open-settings-button');
    const addClientButton = document.getElementById('add-client-button');
    const clientCardsContainer = document.getElementById('client-cards-container');
    const noClientsMessage = document.getElementById('no-clients-message');
    const searchInput = document.getElementById('search-input');
    const filterStatusSelect = document.getElementById('filter-status');
    const filterTagSelect = document.getElementById('filter-tag');
    const clientCountDisplay = document.getElementById('client-count-display');

    // Modais
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
    
    let currentSettings = {
        statusAtivoDays: 30,
        statusRiscoDays: 90,
    };

    function initDB() {
        const request = indexedDB.open(dbName, 2); // Versão 2 para garantir a atualização
        request.onerror = (e) => console.error('Erro no DB:', e.target.errorCode);
        request.onsuccess = (e) => {
            db = e.target.result;
            loadSettingsAndRender();
        };
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            let store;
            if (!db.objectStoreNames.contains('clients')) {
                store = db.createObjectStore('clients', { keyPath: 'id' });
            } else {
                store = e.target.transaction.objectStore('clients');
            }

            if (store.indexNames.contains('email')) {
                store.deleteIndex('email');
            }
            store.createIndex('email', 'email', { unique: false });
            
            if (store.indexNames.contains('tag')) {
                store.deleteIndex('tag');
            }
            store.createIndex('tag', 'tag', { unique: false });
            
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
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
    
    function saveSettings() {
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        currentSettings.statusAtivoDays = parseInt(statusAtivoDaysInput.value, 10) || 30;
        currentSettings.statusRiscoDays = parseInt(statusRiscoDaysInput.value, 10) || 90;
        store.put({ id: 'config', ...currentSettings });
        transaction.oncomplete = () => {
            showToast('Configurações salvas!', 'success');
            settingsModal.classList.add('hidden');
            renderClients();
        };
    }

    function loadSettingsAndRender() {
        if (!db) return;
        const transaction = db.transaction('settings', 'readonly');
        const request = transaction.objectStore('settings').get('config');
        request.onsuccess = (event) => {
            const savedSettings = event.target.result;
            if (savedSettings) currentSettings = { ...currentSettings, ...savedSettings };
            statusAtivoDaysInput.value = currentSettings.statusAtivoDays;
            statusRiscoDaysInput.value = currentSettings.statusRiscoDays;
            renderClients();
        };
    }

    function getClientStatus(client) {
        if (!client.lastPurchaseDate) return { text: 'Sem Histórico', class: 'status-sem-historico' };
        const diffDays = Math.ceil((new Date() - new Date(client.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
        if (diffDays <= currentSettings.statusAtivoDays) return { text: 'Ativo', class: 'status-ativo' };
        if (diffDays <= currentSettings.statusRiscoDays) return { text: 'Em Risco', class: 'status-risco' };
        return { text: 'Inativo', class: 'status-inativo' };
    }

    function getClientTag(client) {
        if (client.orderCount >= 7) return { text: 'Cliente Fiel', class: 'tag-fiel' };
        return null;
    }

    function renderClients() {
        if (!db) return;
        const transaction = db.transaction('clients', 'readonly');
        const request = transaction.objectStore('clients').getAll();

        request.onsuccess = (event) => {
            const clients = event.target.result;
            clientCardsContainer.innerHTML = '';
            
            const searchTerm = searchInput.value.toLowerCase();
            const statusFilter = filterStatusSelect.value;
            const tagFilter = filterTagSelect.value;

            const filteredClients = clients.filter(client => {
                const status = getClientStatus(client).text.toLowerCase().replace(' ', '-');
                const tag = getClientTag(client)?.text.toLowerCase().replace(' ', '-') || 'sem-tag';
                
                const matchesStatus = statusFilter === 'todos' || status === statusFilter;
                const matchesTag = tagFilter === 'todos' || tag === tagFilter;
                const matchesSearch = !searchTerm ||
                    (client.name && client.name.toLowerCase().includes(searchTerm)) ||
                    (client.email && client.email.toLowerCase().includes(searchTerm));
                
                return matchesStatus && matchesTag && matchesSearch;
            });
            
            // Atualiza o contador de clientes
            clientCountDisplay.textContent = `Exibindo ${filteredClients.length} de ${clients.length} clientes`;

            noClientsMessage.classList.toggle('hidden', filteredClients.length > 0);
            clientCardsContainer.classList.toggle('hidden', filteredClients.length === 0);

            filteredClients.forEach(client => {
                const status = getClientStatus(client);
                const tag = getClientTag(client);
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
                            <p><i class="fas fa-shopping-basket fa-fw text-gray-400 mr-2"></i>Pedidos: <span class="font-semibold">${client.orderCount || 0}</span></p>
                            <p><i class="fas fa-calendar-alt fa-fw text-gray-400 mr-2"></i>Última Compra: <span class="font-semibold">${client.lastPurchaseDate ? new Date(client.lastPurchaseDate).toLocaleDateString() : 'N/A'}</span></p>
                        </div>
                        ${tag ? `<div class="mb-4"><span class="tag-badge ${tag.class}">${tag.text}</span></div>` : ''}
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

    function handleFormSubmit(e) {
        e.preventDefault();
        const id = clientIdInput.value; 
        const clientData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            birthday: document.getElementById('birthday').value,
        };

        const tx = db.transaction('clients', 'readwrite');
        const store = tx.objectStore('clients');
        
        if (id) {
            const req = store.get(id);
            req.onsuccess = () => {
                store.put({ ...req.result, ...clientData, id: id });
            };
        } else {
            store.add({ ...clientData, id: `manual_${Date.now()}` });
        }

        tx.oncomplete = () => {
            renderClients();
            closeModal('client-modal');
            showToast(`Cliente ${id ? 'atualizado' : 'adicionado'}!`, 'success');
        };
        tx.onerror = () => showToast('Erro ao salvar cliente.', 'error');
    }

    function editClient(id) {
        const req = db.transaction('clients', 'readonly').objectStore('clients').get(id);
        req.onsuccess = (e) => {
            const client = e.target.result;
            modalTitle.textContent = 'Editar Cliente';
            clientIdInput.value = client.id;
            document.getElementById('name').value = client.name;
            document.getElementById('email').value = client.email;
            document.getElementById('phone').value = client.phone;
            document.getElementById('birthday').value = client.birthday;
            openModal('client-modal');
        };
    }
    
    function viewClientDetails(id) {
        const req = db.transaction('clients', 'readonly').objectStore('clients').get(id);
        req.onsuccess = (e) => {
            const client = e.target.result;
            detailsModalTitle.textContent = `Detalhes de ${client.name}`;
            
            let productsHtml = '<p class="text-sm text-gray-500">Nenhum produto comprado.</p>';
            if (client.products && client.products.length > 0) {
                 productsHtml = `
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead class="bg-gray-50"><tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                        <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd</th>
                        <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr></thead>
                      <tbody class="bg-white divide-y divide-gray-200">
                        ${client.products.map(p => `
                            <tr>
                                <td class="px-4 py-2 whitespace-nowrap">${p.name}</td>
                                <td class="px-4 py-2 text-center">${p.quantity}</td>
                                <td class="px-4 py-2 text-right font-medium">R$ ${(p.price * p.quantity).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                      </tbody>
                    </table>`;
            }

            detailsModalContent.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div><strong class="text-gray-600 block">E-mail:</strong> ${client.email || 'N/A'}</div>
                    <div><strong class="text-gray-600 block">Telefone:</strong> ${client.phone || 'N/A'}</div>
                    <div><strong class="text-gray-600 block">Aniversário:</strong> ${client.birthday ? new Date(client.birthday).toLocaleDateString() : 'N/A'}</div>
                    <div><strong class="text-gray-600 block">Pedidos:</strong> ${client.orderCount || 0}</div>
                </div>
                 <div class="mt-6">
                    <h3 class="text-lg font-semibold mb-2 border-t pt-4">Histórico de Compras</h3>
                    ${productsHtml}
                </div>
            `;
            openModal('details-modal');
        };
    }

    function deleteClient(id) {
        if (!confirm('Tem certeza? Esta ação é irreversível.')) return;
        const tx = db.transaction('clients', 'readwrite');
        tx.objectStore('clients').delete(id);
        tx.oncomplete = () => {
            renderClients();
            showToast('Cliente excluído.', 'success');
        };
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

            const { clients: apiClients, orders: apiOrders } = await response.json(); 
            
            if (!apiClients || !apiOrders) {
                 throw new Error("Resposta da API inválida. Faltam clientes ou pedidos.");
            }
            
            const clientsData = new Map();

            apiClients.forEach(c => {
                if (!c || !c.id) {
                    console.warn("Cliente da API ignorado por não ter um ID:", c);
                    return;
                }
                clientsData.set(c.id, {
                    id: c.id,
                    name: c.nome,
                    email: c.email,
                    phone: c.whatsapp,
                    birthday: c.data_nascimento,
                    lastPurchaseDate: c.ultima_compra ? new Date(c.ultima_compra) : null,
                    totalSpent: 0,
                    orderCount: 0,
                    products: new Map()
                });
            });

            apiOrders.forEach(order => {
                const clientId = order.cliente?.id;
                if (!clientId || !clientsData.has(clientId)) return; 

                const client = clientsData.get(clientId);
                client.totalSpent += parseFloat(order.total || 0);
                client.orderCount++;
                
                const orderDate = order.data ? new Date(order.data) : null;
                if (orderDate && (!client.lastPurchaseDate || client.lastPurchaseDate < orderDate)) {
                    client.lastPurchaseDate = orderDate;
                }
                
                (order.produtos || order.itens)?.forEach(item => {
                    const productMap = client.products;
                    const itemPrice = parseFloat(item.subtotal || item.valor || 0); // Adicionado 'valor' como fallback
                    const itemQuantity = parseInt(item.quantidade || 1, 10);
                    const itemCode = item.codigo || item.sku;
                    const itemName = item.nome || item.produto_nome; // Adicionado 'produto_nome'

                    if (!itemCode || !itemName) return;

                    if (productMap.has(itemCode)) {
                        productMap.get(itemCode).quantity += itemQuantity;
                    } else {
                        productMap.set(itemCode, {
                            name: itemName,
                            quantity: itemQuantity,
                            price: itemQuantity > 0 ? itemPrice / itemQuantity : 0
                        });
                    }
                });
            });

            const tx = db.transaction('clients', 'readwrite');
            const store = tx.objectStore('clients');
            let updatedCount = 0;
            let newCount = 0;
            
            const promises = Array.from(clientsData.values()).map(processedClient => {
                 return new Promise((resolve) => {
                    const request = store.get(processedClient.id);
                    request.onsuccess = () => {
                        const existingClient = request.result;
                        
                        const validDate = processedClient.lastPurchaseDate && !isNaN(processedClient.lastPurchaseDate);
                        const lastPurchaseDateISO = validDate ? processedClient.lastPurchaseDate.toISOString().split('T')[0] : null;

                        const finalClientData = {
                            ...existingClient,
                            ...processedClient,
                            products: Array.from(processedClient.products.values()),
                            lastPurchaseDate: lastPurchaseDateISO
                        };
                        
                        store.put(finalClientData);
                        existingClient ? updatedCount++ : newCount++;
                        resolve();
                    };
                    request.onerror = (e) => {
                        console.error("Erro ao buscar cliente no DB:", e);
                        resolve();
                    };
                });
            });

            await Promise.all(promises);
            
            tx.oncomplete = () => {
                showToast(`Sincronização concluída! ${newCount} clientes novos, ${updatedCount} atualizados.`, 'success');
                renderClients();
            };
            tx.onerror = (e) => {
                const error = e.target.error;
                console.error("Erro na transação final:", error);
                let userMessage = "Erro ao salvar os dados no banco de dados local.";
                if (error.name === 'ConstraintError') {
                    userMessage = "Erro: A base de dados local encontrou um problema de chave duplicada. Tente limpar os dados do site no navegador e sincronizar novamente.";
                } else if (error.name === 'QuotaExceededError') {
                    userMessage = "Erro: Espaço de armazenamento local insuficiente.";
                }
                showToast(userMessage, "error");
            }

        } catch (error) {
            console.error('Erro na sincronização:', error);
            showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
        } finally {
            syncButton.disabled = false;
            syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
        }
    }

    // --- Event Listeners ---
    addClientButton.addEventListener('click', () => openModal('client-modal'));
    cancelButton.addEventListener('click', () => closeModal('client-modal'));
    clientForm.addEventListener('submit', handleFormSubmit);
    
    // CORREÇÃO: Listener de eventos centralizado para os botões dos cards
    clientCardsContainer.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const id = target.dataset.id;
        if (!id) return;

        if (target.classList.contains('view-details-button')) {
            viewClientDetails(id);
        } else if (target.classList.contains('edit-client-button')) {
            editClient(id);
        } else if (target.classList.contains('delete-client-button')) {
            deleteClient(id);
        }
    });
    
    closeDetailsButton.addEventListener('click', () => closeModal('details-modal'));
    openSettingsButton.addEventListener('click', () => openModal('settings-modal'));
    cancelSettingsButton.addEventListener('click', () => closeModal('settings-modal'));
    settingsForm.addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
    
    searchInput.addEventListener('input', renderClients);
    filterStatusSelect.addEventListener('change', renderClients);
    filterTagSelect.addEventListener('change', renderClients);
    
    syncButton.addEventListener('click', syncData);

    initDB();
});

