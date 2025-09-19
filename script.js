document.addEventListener('DOMContentLoaded', () => {
    const dbName = 'CRMDatabase_FacilZap'; // Novo nome para evitar conflitos
    let db;

    const addClientButton = document.getElementById('add-client-button');
    const clientModal = document.getElementById('client-modal');
    const clientForm = document.getElementById('client-form');
    const cancelButton = document.getElementById('cancel-button');
    const clientTableBody = document.getElementById('client-table-body');
    const modalTitle = document.getElementById('modal-title');
    const clientIdInput = document.getElementById('client-id');
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const noClientsMessage = document.getElementById('no-clients-message');
    
    // Details Modal
    const detailsModal = document.getElementById('details-modal');
    const closeDetailsButton = document.getElementById('close-details-button');
    const detailsModalTitle = document.getElementById('details-modal-title');
    const detailsModalContent = document.getElementById('details-modal-content');

    // Settings Modal
    const openSettingsButton = document.getElementById('open-settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const settingsForm = document.getElementById('settings-form');
    const cancelSettingsButton = document.getElementById('cancel-settings-button');
    const statusAtivoDaysInput = document.getElementById('status-ativo-days');
    const statusRiscoDaysInput = document.getElementById('status-risco-days');
    
    // Sync Button
    const syncButton = document.getElementById('sync-button');

    let currentSettings = {
        statusAtivoDays: 30,
        statusRiscoDays: 90,
    };

    // --- Database Initialization ---
    function initDB() {
        const request = indexedDB.open(dbName, 1);

        request.onerror = (event) => {
            console.error('Erro ao abrir o IndexedDB:', event.target.errorCode);
            showToast('Erro crítico ao carregar o banco de dados.', 'error');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            loadSettingsAndRender();
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('clients')) {
                const clientStore = db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
                clientStore.createIndex('name', 'name', { unique: false });
                clientStore.createIndex('email', 'email', { unique: true });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
        };
    }

    // --- Toast Notifications ---
    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast-notification ${'toast-' + type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                container.removeChild(toast);
            }, 300);
        }, duration);
    }
    
    // --- Settings Management ---
    function saveSettings() {
        if (!db) return;
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        currentSettings.statusAtivoDays = parseInt(statusAtivoDaysInput.value, 10) || 30;
        currentSettings.statusRiscoDays = parseInt(statusRiscoDaysInput.value, 10) || 90;
        store.put({ id: 'config', ...currentSettings });
        
        transaction.oncomplete = () => {
            showToast('Configurações salvas com sucesso!', 'success');
            settingsModal.classList.add('hidden');
            renderClients();
        };
    }

    function loadSettingsAndRender() {
        if (!db) return;
        const transaction = db.transaction('settings', 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('config');

        request.onsuccess = (event) => {
            const savedSettings = event.target.result;
            if (savedSettings) {
                currentSettings = { ...currentSettings, ...savedSettings };
            }
            statusAtivoDaysInput.value = currentSettings.statusAtivoDays;
            statusRiscoDaysInput.value = currentSettings.statusRiscoDays;
            
            renderClients();
        };
    }

    // --- Client Data Management ---
    function getClientStatus(client) {
        if (!client.lastPurchaseDate) {
            return { text: 'Sem Histórico', class: 'status-sem-historico' };
        }
        const lastPurchase = new Date(client.lastPurchaseDate);
        const today = new Date();
        const diffTime = Math.abs(today - lastPurchase);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= currentSettings.statusAtivoDays) {
            return { text: 'Ativo', class: 'status-ativo' };
        } else if (diffDays <= currentSettings.statusRiscoDays) {
            return { text: 'Em Risco', class: 'status-risco' };
        } else {
            return { text: 'Inativo', class: 'status-inativo' };
        }
    }

    function renderClients() {
        if (!db) return;
        const transaction = db.transaction('clients', 'readonly');
        const store = transaction.objectStore('clients');
        const request = store.getAll();

        request.onsuccess = (event) => {
            const clients = event.target.result;
            clientTableBody.innerHTML = '';

            const searchTerm = searchInput.value.toLowerCase();
            const filterValue = filterSelect.value;

            const filteredClients = clients.filter(client => {
                const status = getClientStatus(client).text.toLowerCase().replace(' ', '-');
                const matchesFilter = filterValue === 'todos' || status === filterValue;
                const matchesSearch = !searchTerm ||
                    (client.name && client.name.toLowerCase().includes(searchTerm)) ||
                    (client.email && client.email.toLowerCase().includes(searchTerm)) ||
                    (client.phone && client.phone.toLowerCase().includes(searchTerm));
                return matchesFilter && matchesSearch;
            });

            if (filteredClients.length > 0) {
                 noClientsMessage.classList.add('hidden');
                filteredClients.forEach(client => {
                    const status = getClientStatus(client);
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="flex items-center">
                                <div class="text-sm font-medium text-gray-900">${client.name}</div>
                            </div>
                            <div class="text-sm text-gray-500">${client.email || 'N/A'}</div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="status-badge ${status.class}">${status.text}</span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${client.lastPurchaseDate ? new Date(client.lastPurchaseDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                            ${client.totalSpent ? `R$ ${client.totalSpent.toFixed(2)}` : 'R$ 0,00'}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            <button class="text-indigo-600 hover:text-indigo-900 mr-3 view-details-button" data-id="${client.id}"><i class="fas fa-eye"></i></button>
                            <button class="text-blue-600 hover:text-blue-900 mr-3 edit-client-button" data-id="${client.id}"><i class="fas fa-edit"></i></button>
                            <button class="text-red-600 hover:text-red-900 delete-client-button" data-id="${client.id}"><i class="fas fa-trash"></i></button>
                        </td>
                    `;
                    clientTableBody.appendChild(row);
                });
            } else {
                 noClientsMessage.classList.remove('hidden');
            }
        };
    }

    function handleFormSubmit(event) {
        event.preventDefault();
        const id = parseInt(clientIdInput.value);
        const clientData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            birthday: document.getElementById('birthday').value,
        };

        const transaction = db.transaction('clients', 'readwrite');
        const store = transaction.objectStore('clients');

        if (id) {
            const request = store.get(id);
            request.onsuccess = () => {
                const existingClient = request.result;
                const updatedClient = { ...existingClient, ...clientData, id: id };
                store.put(updatedClient);
            };
        } else {
            store.add(clientData);
        }

        transaction.oncomplete = () => {
            renderClients();
            closeModal();
            showToast(`Cliente ${id ? 'atualizado' : 'adicionado'} com sucesso!`, 'success');
        };

        transaction.onerror = (event) => {
            console.error('Erro na transação:', event.target.error);
             showToast('Erro ao salvar cliente. O e-mail já pode existir.', 'error');
        };
    }

    function editClient(id) {
        const transaction = db.transaction('clients', 'readonly');
        const store = transaction.objectStore('clients');
        const request = store.get(id);

        request.onsuccess = (event) => {
            const client = event.target.result;
            modalTitle.textContent = 'Editar Cliente';
            clientIdInput.value = client.id;
            document.getElementById('name').value = client.name;
            document.getElementById('email').value = client.email;
            document.getElementById('phone').value = client.phone;
            document.getElementById('birthday').value = client.birthday;
            openModal();
        };
    }
    
    function viewClientDetails(id) {
        const transaction = db.transaction('clients', 'readonly');
        const store = transaction.objectStore('clients');
        const request = store.get(id);

        request.onsuccess = (event) => {
            const client = event.target.result;
            detailsModalTitle.textContent = `Detalhes de ${client.name}`;
            
            let productsHtml = '<p class="text-sm text-gray-500">Nenhum produto registrado.</p>';
            if (client.products && client.products.length > 0) {
                 productsHtml = `
                    <ul class="divide-y divide-gray-200">
                        ${client.products.map(p => `
                            <li class="py-2 flex justify-between items-center">
                                <span>${p.name} (Qtd: ${p.quantity})</span>
                                <span class="font-semibold">R$ ${(p.price * p.quantity).toFixed(2)}</span>
                            </li>
                        `).join('')}
                    </ul>
                `;
            }

            detailsModalContent.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><strong class="text-gray-600">E-mail:</strong> ${client.email || 'N/A'}</div>
                    <div><strong class="text-gray-600">Telefone:</strong> ${client.phone || 'N/A'}</div>
                    <div><strong class="text-gray-600">Aniversário:</strong> ${client.birthday ? new Date(client.birthday).toLocaleDateString() : 'N/A'}</div>
                    <div><strong class="text-gray-600">Total Gasto:</strong> R$ ${client.totalSpent ? client.totalSpent.toFixed(2) : '0,00'}</div>
                </div>
                 <div class="mt-6">
                    <h3 class="text-lg font-semibold mb-2 border-t pt-4">Produtos Comprados</h3>
                    ${productsHtml}
                </div>
            `;
            detailsModal.classList.remove('hidden');
        };
    }


    function deleteClient(id) {
        if (confirm('Tem certeza que deseja excluir este cliente?')) {
            const transaction = db.transaction('clients', 'readwrite');
            const store = transaction.objectStore('clients');
            store.delete(id);

            transaction.oncomplete = () => {
                renderClients();
                showToast('Cliente excluído com sucesso!', 'success');
            };
        }
    }

    function openModal() {
        clientForm.reset();
        clientIdInput.value = '';
        modalTitle.textContent = 'Adicionar Novo Cliente';
        clientModal.classList.remove('hidden');
    }

    function closeModal() {
        clientModal.classList.add('hidden');
    }
    
    // --- Data Synchronization (FACILZAP) ---
    async function syncData() {
        showToast('Iniciando sincronização com FacilZap...', 'info');
        syncButton.disabled = true;
        syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center animate-spin"></i><span class="ml-4">Sincronizando...</span>';

        try {
            // A chamada agora aponta para o novo proxy da FacilZap
            const response = await fetch('/api/facilzap-proxy');
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro HTTP ${response.status}`);
            }

            const apiResponse = await response.json();
            const orders = apiResponse.data; // Ajustado para a estrutura da FacilZap
            
            if (!orders) {
                 throw new Error("Resposta da API da FacilZap inválida ou sem dados.");
            }

            const transaction = db.transaction('clients', 'readwrite');
            const store = transaction.objectStore('clients');
            const emailIndex = store.index('email');
            let updatedCount = 0;
            let newCount = 0;

            const promises = orders.map(order => {
                // Adaptação para a estrutura de dados da FacilZap (hipotética)
                const clientEmail = order.cliente_email;
                if (!clientEmail) return Promise.resolve();

                return new Promise((resolve) => {
                    const request = emailIndex.get(clientEmail);
                    request.onsuccess = () => {
                        let client = request.result || {};

                        client.name = client.name || order.cliente_nome;
                        client.email = clientEmail;
                        client.phone = client.phone || order.cliente_telefone;
                        
                        const orderDate = new Date(order.data_pedido);
                        if (!client.lastPurchaseDate || new Date(client.lastPurchaseDate) < orderDate) {
                            client.lastPurchaseDate = orderDate.toISOString().split('T')[0];
                        }
                        
                        client.totalSpent = (client.totalSpent || 0) + parseFloat(order.valor_total);
                        
                        client.products = client.products || [];
                        order.itens.forEach(item => {
                            const existingProduct = client.products.find(p => p.sku === item.sku);
                            if (existingProduct) {
                                existingProduct.quantity += parseInt(item.quantidade, 10);
                            } else {
                                client.products.push({
                                    sku: item.sku,
                                    name: item.nome_produto,
                                    quantity: parseInt(item.quantidade, 10),
                                    price: parseFloat(item.valor_unitario)
                                });
                            }
                        });

                        if (client.id) {
                            updatedCount++;
                        } else {
                            newCount++;
                        }
                        
                        store.put(client);
                        resolve();
                    };
                     request.onerror = (e) => {
                        console.error("Erro ao buscar cliente por e-mail:", e);
                        resolve();
                    };
                });
            });

            await Promise.all(promises);
            
            transaction.oncomplete = () => {
                showToast(`Sincronização concluída! ${newCount} novos, ${updatedCount} atualizados.`, 'success');
                renderClients();
            };

        } catch (error) {
            console.error('Erro na sincronização:', error);
            showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
        } finally {
            syncButton.disabled = false;
            syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
        }
    }


    // --- Event Listeners ---
    addClientButton.addEventListener('click', openModal);
    cancelButton.addEventListener('click', closeModal);
    clientForm.addEventListener('submit', handleFormSubmit);
    
    clientTableBody.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;
        
        const id = parseInt(target.dataset.id);
        if (target.classList.contains('edit-client-button')) {
            editClient(id);
        } else if (target.classList.contains('delete-client-button')) {
            deleteClient(id);
        } else if (target.classList.contains('view-details-button')) {
            viewClientDetails(id);
        }
    });
    
    closeDetailsButton.addEventListener('click', () => detailsModal.classList.add('hidden'));

    searchInput.addEventListener('input', renderClients);
    filterSelect.addEventListener('change', renderClients);
    
    openSettingsButton.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    cancelSettingsButton.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings();
    });
    
    syncButton.addEventListener('click', syncData);

    // --- Initial Load ---
    initDB();
});

