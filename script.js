// Adicione esta função de escape para prevenir XSS
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Modifique a função syncData para corrigir a transação
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
        
        const ordersToSave = [];
        
        apiOrders.forEach(order => {
            const clientId = order.cliente?.id ? String(order.cliente.id) : null;
            
            ordersToSave.push({
                id: order.id,
                codigo: order.codigo,
                data: order.data,
                total: parseFloat(order.total || 0),
                clientId: clientId,
                clientName: order.cliente?.nome || 'Cliente não identificado'
            });

            if (clientId && clientsData.has(clientId)) {
                const client = clientsData.get(clientId);
                client.totalSpent += parseFloat(order.total || 0);
                client.orderCount++;
                const orderDate = order.data ? new Date(order.data) : null;
                if (orderDate && (!client.lastPurchaseDate || client.lastPurchaseDate < orderDate)) {
                    client.lastPurchaseDate = orderDate;
                }
                
                const productList = order.produtos || order.itens || order.products || order.items || [];
                productList.forEach(item => {
                    const productMap = client.products;
                    if (!item.codigo || !item.nome) return;
                    const quantity = parseInt(item.quantidade) || 1;
                    const price = (parseFloat(item.subtotal || item.valor || 0) / quantity);

                    if (productMap.has(item.codigo)) {
                        productMap.get(item.codigo).quantity += quantity;
                    } else {
                        productMap.set(item.codigo, { 
                            name: item.nome, 
                            quantity: quantity, 
                            price: price 
                        });
                    }
                });
            }
        });

        // Use uma única transação para todas as operações
        const tx = db.transaction(['clients', 'products', 'orders'], 'readwrite');
        
        // Limpar e adicionar clientes
        const clientsStore = tx.objectStore('clients');
        await clientsStore.clear();
        Array.from(clientsData.values()).forEach(client => {
            const finalClient = { 
                ...client, 
                products: Array.from(client.products.values()), 
                lastPurchaseDate: client.lastPurchaseDate?.toISOString().split('T')[0] || null 
            };
            clientsStore.put(finalClient);
        });

        // Limpar e adicionar produtos
        const productsStore = tx.objectStore('products');
        await productsStore.clear();
        apiProducts.forEach(p => {
            productsStore.put({
                id: p.id, 
                name: p.nome, 
                sku: p.sku,
                image: p.imagens?.[0] || null,
                isActive: p.ativado,
                managesStock: p.estoque?.controlar_estoque || false
            });
        });

        // Limpar e adicionar pedidos
        const ordersStore = tx.objectStore('orders');
        await ordersStore.clear();
        ordersToSave.forEach(order => ordersStore.put(order));

        // Aguardar a transação ser concluída
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        showToast(`Sincronização concluída! ${ordersToSave.length} pedidos foram importados.`, 'success');
        loadSettingsAndRenderAll();

    } catch (error) {
        console.error('Erro na sincronização:', error);
        showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
    } finally {
        syncButton.disabled = false;
        syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
    }
}

// Modifique a renderização de clientes para usar escapeHtml
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
        
        // ... restante do código de ordenação

        clientCountDisplay.textContent = `Exibindo ${filteredClients.length} de ${clients.length} clientes`;
        noClientsMessage.classList.toggle('hidden', filteredClients.length > 0);
        
        filteredClients.forEach(client => {
            const status = getClientStatus(client);
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md p-5 flex flex-col justify-between';
            
            // Use escapeHtml para prevenir XSS
            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-gray-800 text-lg">${escapeHtml(client.name || 'Cliente sem nome')}</h3>
                        <span class="status-badge ${status.class}">${status.text}</span>
                    </div>
                    <p class="text-sm text-gray-500 mb-4 truncate">${escapeHtml(client.email || 'Sem e-mail')}</p>
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

// Aplique escapeHtml também na viewClientDetails
function viewClientDetails(id) {
    const req = db.transaction('clients', 'readonly').objectStore('clients').get(id);
    req.onerror = () => showToast('Erro ao buscar detalhes do cliente.', 'error');
    req.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) {
            showToast('Não foi possível carregar os detalhes. Sincronize os dados.', 'error');
            return;
        }
        
        detailsModalTitle.textContent = `Detalhes de ${escapeHtml(c.name)}`;
        
        // Use escapeHtml em todos os campos dinâmicos
        let phtml = '<p class="text-sm text-gray-500">Nenhum produto comprado.</p>';
        if (c.products && c.products.length > 0) {
            phtml = `<table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                        <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd</th>
                        <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Un.</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${c.products.map(p => `
                        <tr>
                            <td class="px-4 py-2 whitespace-nowrap">${escapeHtml(p.name)}</td>
                            <td class="px-4 py-2 text-center">${p.quantity}</td>
                            <td class="px-4 py-2 text-right font-medium">R$ ${p.price.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        }
        
        const addr = [
            c.address, 
            c.address_number, 
            c.address_complement
        ].filter(Boolean).join(', ') + 
        (c.address_neighborhood ? ` - ${escapeHtml(c.address_neighborhood)}` : '') + 
        (c.city ? `<br>${escapeHtml(c.city)}` : '') + 
        (c.state ? `/${escapeHtml(c.state)}` : '') + 
        (c.zip_code ? ` - CEP: ${escapeHtml(c.zip_code)}` : '');
        
        detailsModalContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm mb-6 pb-4 border-b">
                <div>
                    <strong class="text-gray-600 block"><i class="fas fa-envelope fa-fw mr-2 text-gray-400"></i>E-mail:</strong> 
                    ${escapeHtml(c.email||'N/A')}
                </div>
                <div>
                    <strong class="text-gray-600 block"><i class="fas fa-phone fa-fw mr-2 text-gray-400"></i>Telefone:</strong> 
                    ${escapeHtml(c.phone||'N/A')}
                </div>
                <div>
                    <strong class="text-gray-600 block"><i class="fas fa-id-card fa-fw mr-2 text-gray-400"></i>CPF:</strong> 
                    ${escapeHtml(c.cpf||'N/A')}
                </div>
                <div>
                    <strong class="text-gray-600 block"><i class="fas fa-gift fa-fw mr-2 text-gray-400"></i>Aniversário:</strong> 
                    ${c.birthday ? new Date(c.birthday).toLocaleDateString() : 'N/A'}
                </div>
                <div class="md:col-span-2">
                    <strong class="text-gray-600 block"><i class="fas fa-map-marker-alt fa-fw mr-2 text-gray-400"></i>Endereço:</strong> 
                    ${addr || 'N/A'}
                </div>
            </div>
            <div class="mt-4">
                <h3 class="text-lg font-semibold mb-2">Histórico de Compras</h3>
                ${phtml}
            </div>
        `;
        
        openModal('details-modal');
    };
}
