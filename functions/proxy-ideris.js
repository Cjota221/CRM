document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURAÇÕES E ESTADO GLOBAL ---
    const DB_NAME = 'CRMDatabase';
    const DB_VERSION = 1;
    const CLIENTS_STORE = 'clients';
    const CONFIG_STORE = 'config';

    let db;
    let state = {
        clients: [],
        filteredClients: [],
        currentPage: 1,
        itemsPerPage: 100,
        config: {
            statusIntervals: {
                ativo: 30,
                emRisco: 90
            },
            // O token fornecido foi adicionado aqui.
            iderisApiKey: '18984dHlW0vVsqerYdimTHX1HEqQEKnUsjl5NZATPBlYgqORuLFIXIX1Z0yx2dvrT2g9ORETzWCuEM14pAxqG'
        },
        importHistory: [],
        isInitialImport: true,
        selection: new Set()
    };

    // --- ELEMENTOS DO DOM ---
    const ui = {
        app: document.getElementById('app'),
        initialView: document.getElementById('initial-view'),
        dataView: document.getElementById('data-view'),
        tableBody: document.getElementById('clients-table-body'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingMessage: document.getElementById('loading-message'),
        importInitialBtn: document.getElementById('import-initial-btn'),
        addDataBtn: document.getElementById('add-data-btn'),
        iderisSyncBtn: document.getElementById('ideris-sync-btn'),
        clearDbBtn: document.getElementById('clear-db-btn'),
        dashboard: {
            totalClients: document.getElementById('total-clients'),
            lastImport: document.getElementById('last-import'),
            duplicatesResolved: document.getElementById('duplicates-resolved')
        },
        pagination: {
            container: document.getElementById('pagination'),
            pageInfo: document.getElementById('page-info'),
            prevBtn: document.getElementById('prev-page-btn'),
            nextBtn: document.getElementById('next-page-btn')
        },
        filters: {
            search: document.getElementById('search'),
            status: document.getElementById('status-filter')
        },
        conflictModal: {
            container: document.getElementById('conflict-modal'),
            similarity: document.getElementById('conflict-similarity'),
            details: document.getElementById('conflict-details'),
            count: document.getElementById('conflict-count'),
            applyAll: document.getElementById('apply-all-conflicts'),
            skipBtn: document.getElementById('skip-conflict-btn'),
            keepBothBtn: document.getElementById('keep-both-btn'),
            mergeSmartBtn: document.getElementById('merge-smart-btn')
        },
        clientModal: {
            container: document.getElementById('client-details-modal'),
            header: document.getElementById('client-modal-header'),
            body: document.getElementById('client-modal-body'),
            closeBtn: document.getElementById('close-client-modal-btn')
        },
        settingsModal: {
            container: document.getElementById('settings-modal'),
            ativoDays: document.getElementById('status-ativo-days'),
            riscoDays: document.getElementById('status-risco-days'),
            apiKey: document.getElementById('ideris-api-key'),
            saveBtn: document.getElementById('save-settings-btn'),
            cancelBtn: document.getElementById('cancel-settings-btn')
        },
        settingsBtn: document.getElementById('settings-btn'),
        selectAllPage: document.getElementById('select-all-page'),
        selectionCount: document.getElementById('selection-count'),
        exportBtn: document.getElementById('export-btn'),
        copyPhonesBtn: document.getElementById('copy-phones-btn'),
        toastContainer: document.getElementById('toast-container'),
    };

    let fileToImport = null;
    let importMapping = {};
    let conflictsQueue = [];
    let conflictResolutionStrategy = null;

    const CRM_FIELDS = {
        nome: 'Nome',
        telefone: 'Telefone',
        email: 'Email',
        data_ultima_compra: 'Data da Última Compra',
        valor_total: 'Valor Total',
        produtos: 'Produtos',
        cidade: 'Cidade',
        estado: 'Estado',
        cep: 'CEP',
        endereco: 'Endereço',
        razao_social: 'Razão Social',
        observacoes: 'Observações',
        origem: 'Origem',
    };

    const FIELD_ALIASES = {
        nome: ['nome', 'name', 'cliente', 'razao_social', 'razao social'],
        telefone: ['telefone', 'phone', 'whatsapp', 'whats', 'fone', 'celular', 'numero'],
        email: ['email', 'e-mail', 'mail', 'email_contato'],
        data_ultima_compra: ['data', 'date', 'compra', 'interacao'],
        valor_total: ['valor', 'total', 'value', 'monetario'],
        produtos: ['produtos', 'products'],
        cidade: ['cidade', 'city'],
        estado: ['estado', 'state', 'uf'],
        cep: ['cep', 'zip'],
        endereco: ['endereco', 'address', 'rua'],
        observacoes: ['observacoes', 'obs', 'notes'],
        origem: ['origem', 'source', 'source', 'lead']
    };

    // --- INICIALIZAÇÃO ---
    function init() {
        initDB().then(() => {
            attachEventListeners();
            loadInitialData();
        });
    }
    
    async function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                showToast('Erro ao inicializar o banco de dados.', 'error');
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains(CLIENTS_STORE)) {
                    const clientStore = dbInstance.createObjectStore(CLIENTS_STORE, { keyPath: 'id' });
                    clientStore.createIndex('telefone', 'telefone', { unique: false });
                }
                if (!dbInstance.objectStoreNames.contains(CONFIG_STORE)) {
                    dbInstance.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
                }
            };
        });
    }

    async function loadInitialData() {
        setLoading(true, 'Carregando dados...');
        try {
            const configData = await getConfigFromDB();
            if (configData) {
                // Mescla a configuração salva com a padrão para garantir que novas chaves sejam adicionadas
                state.config = { ...state.config, ...configData.config };
                state.importHistory = configData.importHistory || [];
            }

            state.clients = await getAllClientsFromDB();
            state.isInitialImport = state.clients.length === 0;

            updateUIBasedOnState();
            applyFiltersAndRender();
        } catch (error) {
            showToast('Erro ao carregar dados iniciais.', 'error');
        } finally {
            setLoading(false);
        }
    }

    function updateUIBasedOnState() {
         if (state.isInitialImport) {
            ui.initialView.classList.remove('hidden');
            ui.dataView.classList.add('hidden');
            ui.importInitialBtn.disabled = false;
            ui.addDataBtn.disabled = true;
        } else {
            ui.initialView.classList.add('hidden');
            ui.dataView.classList.remove('hidden');
            ui.importInitialBtn.disabled = true;
            ui.addDataBtn.disabled = false;
        }
        updateDashboard();
    }

    function attachEventListeners() {
        ui.importInitialBtn.addEventListener('click', () => triggerFileInput(true));
        ui.addDataBtn.addEventListener('click', () => triggerFileInput(false));
        ui.iderisSyncBtn.addEventListener('click', syncFromIderis);
        ui.clearDbBtn.addEventListener('click', confirmClearDB);
        ui.settingsBtn.addEventListener('click', openSettingsModal);

        // Drag & Drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            ui.app.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            ui.app.addEventListener(eventName, () => ui.app.classList.add('drag-over'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            ui.app.addEventListener(eventName, () => ui.app.classList.remove('drag-over'), false);
        });
        ui.app.addEventListener('drop', handleDrop, false);

        // Filtros e Paginação
        ui.filters.search.addEventListener('input', debounce(applyFiltersAndRender, 300));
        ui.filters.status.addEventListener('change', applyFiltersAndRender);
        ui.pagination.prevBtn.addEventListener('click', () => changePage(-1));
        ui.pagination.nextBtn.addEventListener('click', () => changePage(1));
        
        // Modais
        ui.conflictModal.skipBtn.addEventListener('click', () => resolveConflict('skip'));
        ui.conflictModal.keepBothBtn.addEventListener('click', () => resolveConflict('keep_both'));
        ui.conflictModal.mergeSmartBtn.addEventListener('click', () => resolveConflict('merge_smart'));
        ui.clientModal.closeBtn.addEventListener('click', () => hideModal(ui.clientModal.container));
        ui.settingsModal.saveBtn.addEventListener('click', saveSettings);
        ui.settingsModal.cancelBtn.addEventListener('click', () => hideModal(ui.settingsModal.container));

        // Ações em lote
        ui.selectAllPage.addEventListener('change', handleSelectAllPage);
        ui.exportBtn.addEventListener('click', exportSelected);
        ui.copyPhonesBtn.addEventListener('click', copySelectedPhones);
    }

    // --- LÓGICA DE IMPORTAÇÃO DE ARQUIVO ---
    
    function triggerFileInput(isInitial) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv, .xlsx, .xls';
        input.multiple = true;
        input.onchange = (e) => handleFileSelect(e.target.files, isInitial);
        input.click();
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFileSelect(files, state.isInitialImport);
    }

    function handleFileSelect(files, isInitial) {
        if (files.length === 0) return;
        setLoading(true, 'Lendo arquivo...');
        
        const file = files[0]; 
        
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates:true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (jsonData.length < 2) {
                    showToast('A planilha está vazia ou em formato inválido.', 'error');
                    setLoading(false);
                    return;
                }
                
                const headers = jsonData[0].map(h => String(h || ''));
                const records = jsonData.slice(1);
                
                fileToImport = {
                    name: file.name,
                    headers,
                    records,
                    sourceType: 'file'
                };

                importMapping = autoMapColumns(headers);

                if (!importMapping.telefone) {
                    showToast('Não foi possível identificar a coluna de Telefone, que é obrigatória.', 'error');
                    setLoading(false);
                    return;
                }

                processData(records, 'file');
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            showToast(`Erro ao ler o arquivo: ${error.message}`, 'error');
            setLoading(false);
        }
    }
    
    function autoMapColumns(headers) {
        const mapping = {};
        const normalizedHeaders = headers.map(h => 
            h.toLowerCase()
             .normalize("NFD")
             .replace(/[\u0300-\u036f]/g, "")
             .replace(/[\s_]+/g, '')
        );

        for (const crmField in FIELD_ALIASES) {
            const aliases = FIELD_ALIASES[crmField];
            let foundIndex = -1;

            for (const alias of aliases) {
                const normalizedAlias = alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_]+/g, '');
                foundIndex = normalizedHeaders.findIndex(header => header.includes(normalizedAlias));
                if (foundIndex !== -1) break;
            }

            if (foundIndex !== -1) {
                if (!Object.values(mapping).includes(foundIndex)) {
                    mapping[crmField] = foundIndex;
                }
            }
        }
        return mapping;
    }

    // --- LÓGICA DE SINCRONIZAÇÃO COM IDERIS ---
    async function syncFromIderis() {
        if (!state.config.iderisApiKey) {
            showToast('API Key da Ideris é obrigatória. Verifique as Configurações.', 'error');
            openSettingsModal();
            return;
        }

        setLoading(true, 'Sincronizando com Ideris...');
        try {
            // A Ideris usa o endpoint "Pedido" para buscar as vendas.
            const response = await callApi('Pedido');
            if (!response || !Array.isArray(response.result)) {
                throw new Error('Resposta da API inválida. Esperado um array em `result`.');
            }
            
            const orders = response.result;
            showToast(`${orders.length} pedidos encontrados. Processando...`, 'info');

            fileToImport = { name: `Ideris Sync - ${new Date().toLocaleDateString()}` };
            await processData(orders, 'api');

        } catch(error) {
            showToast(`Erro na sincronização: ${error.message}`, 'error');
            setLoading(false);
        }
    }
    
    async function callApi(endpoint) {
        // Usa um caminho relativo para o proxy. O Netlify irá redirecionar automaticamente.
        const url = `/api/proxy-ideris?endpoint=${endpoint}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // A API Key será adicionada pelo proxy, não aqui.
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.Message || `Erro HTTP ${response.status}`);
        }

        return response.json();
    }

    // --- PROCESSAMENTO DE DADOS UNIFICADO (ARQUIVO E API) ---
    async function processData(records, source) {
        setLoading(true, 'Processando dados...');
        
        const normalizedRecords = records.map(record => {
            if (source === 'api') {
                return normalizeIderisOrder(record);
            }
            // Mapeamento para arquivo
            const fileRecord = {};
            for (const key in importMapping) {
                fileRecord[key] = record[importMapping[key]];
            }
            return normalizeRecord(fileRecord);
        });

        conflictsQueue = [];
        const recordsToAdd = [];

        const existingClients = await getAllClientsFromDB();
        const existingPhones = new Map(existingClients.map(c => [c.telefone, c]));

        for (let i = 0; i < normalizedRecords.length; i++) {
            setLoading(true, `Analisando registro ${i + 1} de ${normalizedRecords.length}...`);
            const newRecord = normalizedRecords[i];
            
            if (!newRecord || !newRecord.telefone) continue;

            const existingClient = existingPhones.get(newRecord.telefone);

            if (existingClient) {
                conflictsQueue.push({ existing: existingClient, new: newRecord, similarity: 100 });
            } else {
                recordsToAdd.push(createNewClient(newRecord, fileToImport.name));
            }
        }
        
        // Remove duplicatas dos novos registros antes de adicionar
        const uniqueRecordsToAdd = recordsToAdd.reduce((acc, current) => {
            if (!acc.some(item => item.telefone === current.telefone)) {
                acc.push(current);
            }
            return acc;
        }, []);

        if (uniqueRecordsToAdd.length > 0) {
            await addClientsToDB(uniqueRecordsToAdd);
        }

        if (conflictsQueue.length > 0) {
            // Para a API, vamos assumir a mesclagem automática
            if(source === 'api') {
                setLoading(true, `Atualizando ${conflictsQueue.length} clientes...`);
                const updates = conflictsQueue.map(c => smartMerge(c.existing, c.new));
                for(const client of updates) await updateClientInDB(client);
                conflictsQueue = [];
                finishImport();
            } else {
                processNextConflict();
            }
        } else {
            finishImport();
        }
    }
    
    function processNextConflict() {
        if (conflictsQueue.length === 0) {
            finishImport();
            return;
        }
        
        const conflict = conflictsQueue[0];
        ui.conflictModal.similarity.textContent = conflict.similarity;
        ui.conflictModal.count.textContent = conflictsQueue.length;
        
        let detailsHtml = `<div class="overflow-x-auto"><table class="w-full min-w-max"><thead><tr>
            <th class="p-2 text-left text-xs font-medium text-gray-500">Campo</th>
            <th class="p-2 text-left text-xs font-medium text-gray-500">Base Atual</th>
            <th class="p-2 text-left text-xs font-medium text-gray-500">Novo Registro</th>
        </tr></thead><tbody>`;

        const allKeys = new Set([...Object.keys(conflict.existing), ...Object.keys(conflict.new)]);
        
        for (const key of allKeys) {
            if (['id', 'sources', 'status', 'dias_desde_ultima_compra', 'created_at', 'updated_at'].includes(key)) continue;

            const existingValue = conflict.existing[key] || '(vazio)';
            const newValue = conflict.new[key] || '(vazio)';
            const fieldName = CRM_FIELDS[key] || key;
            
            if (String(existingValue) !== String(newValue)) {
                 detailsHtml += `<tr>
                    <td class="p-2 border-t border-gray-200 font-medium">${fieldName}</td>
                    <td class="p-2 border-t border-gray-200">${existingValue}</td>
                    <td class="p-2 border-t border-gray-200 bg-blue-50">${newValue}</td>
                </tr>`;
            }
        }
        detailsHtml += '</tbody></table></div>';
        
        ui.conflictModal.details.innerHTML = detailsHtml;
        showModal(ui.conflictModal.container);
    }

    async function resolveConflict(strategy) {
        if (ui.conflictModal.applyAll.checked && !conflictResolutionStrategy) {
            conflictResolutionStrategy = strategy;
        }

        const currentConflict = conflictsQueue.shift();

        if (strategy === 'skip') {
            // Não faz nada com o registro
        } else if (strategy === 'keep_both') {
            await addClientsToDB([createNewClient(currentConflict.new, fileToImport.name)]);
        } else if (strategy === 'merge_smart') {
            const mergedClient = smartMerge(currentConflict.existing, currentConflict.new);
            await updateClientInDB(mergedClient);
        }
        
        if (conflictResolutionStrategy) {
            setLoading(true, `Aplicando estratégia para ${conflictsQueue.length} conflitos...`);
            const updates = [];
            const additions = [];
            
            for (const conflict of conflictsQueue) {
                if (conflictResolutionStrategy === 'keep_both') {
                    additions.push(createNewClient(conflict.new, fileToImport.name));
                } else if (conflictResolutionStrategy === 'merge_smart') {
                    updates.push(smartMerge(conflict.existing, conflict.new));
                }
            }

            if (additions.length > 0) await addClientsToDB(additions);
            if (updates.length > 0) {
                for (const client of updates) await updateClientInDB(client);
            }

            conflictsQueue = []; // Limpa a fila
            conflictResolutionStrategy = null;
            ui.conflictModal.applyAll.checked = false;
        }

        hideModal(ui.conflictModal.container);
        processNextConflict();
    }

    async function finishImport() {
        state.importHistory.push({
            name: fileToImport.name,
            date: new Date().toISOString()
        });
        await saveConfigToDB({ config: state.config, importHistory: state.importHistory });
        
        fileToImport = null;
        importMapping = {};
        
        showToast('Sincronização/Importação concluída!', 'success');
        await loadInitialData();
    }

    // --- LÓGICA DE DADOS (NORMALIZAÇÃO, MERGE, ETC) ---

    function normalizeIderisOrder(order) {
        if (!order || !order.comprador) return null;

        const comprador = order.comprador;
        const telefone = comprador.celular || comprador.telefone;

        return normalizeRecord({
            nome: comprador.nome,
            telefone: telefone,
            email: comprador.email,
            data_ultima_compra: order.data_pedido,
            valor_total: order.valor_total_pedido,
            produtos: order.item ? order.item.map(i => `${i.quantidade}x ${i.nome_produto}`).join('; ') : '',
            cidade: comprador.cidade,
            estado: comprador.estado,
            cep: comprador.cep,
            endereco: `${comprador.endereco}, ${comprador.numero} - ${comprador.bairro}`,
        });
    }

    function normalizeRecord(record) {
        const normalized = {};
        for (const key in record) {
            const value = record[key];
            if (value === null || typeof value === 'undefined') continue;
            
            let processedValue = value;
            if (key === 'telefone') {
                processedValue = normalizePhone(String(value));
            } else if (key.includes('data')) {
                processedValue = normalizeDate(value);
            } else if (key.includes('valor')) {
                processedValue = normalizeValue(String(value));
            } else if (typeof value === 'string') {
                processedValue = value.trim();
            }
            
            if (processedValue !== '' && processedValue !== null) {
                normalized[key] = processedValue;
            }
        }
        return normalized;
    }

    function normalizePhone(phone) {
        if (!phone) return null;
        let p = String(phone).split(',')[0].replace(/\D/g, '');
        if (p.startsWith('55') && p.length > 11) {
            // Já está no formato internacional correto
        } else if (p.length >= 10 && p.length <= 11) {
            p = '55' + p;
        } else {
            return null; // Telefone inválido
        }
        return p;
    }
    
    function normalizeDate(date) {
        if (!date) return null;
        try {
            if (date instanceof Date) {
                return date.toISOString().split('T')[0];
            }
            const d = new Date(date);
            if (isNaN(d.getTime())) return null;
            return d.toISOString().split('T')[0];
        } catch (e) {
            return null;
        }
    }
    
    function normalizeValue(value) {
        if (typeof value === 'number') return value;
        if (!value) return 0;
        const s = String(value).replace('R$', '').trim().replace('.', '').replace(',', '.');
        return parseFloat(s) || 0;
    }

    function createNewClient(record, sourceName) {
        const now = new Date().toISOString();
        const client = {
            id: crypto.randomUUID(),
            ...record,
            created_at: now,
            updated_at: now,
            sources: [{ name: sourceName, date: now }]
        };
        return calculateClientStatus(client);
    }

    function calculateClientStatus(client) {
        if (!client.data_ultima_compra) {
            client.status = 'sem_historico';
            client.dias_desde_ultima_compra = null;
            return client;
        }
        
        const hoje = new Date();
        const ultimaCompra = new Date(client.data_ultima_compra);
        const diffTime = Math.abs(hoje - ultimaCompra);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        client.dias_desde_ultima_compra = diffDays;

        if (diffDays <= state.config.statusIntervals.ativo) {
            client.status = 'ativo';
        } else if (diffDays <= state.config.statusIntervals.emRisco) {
            client.status = 'em_risco';
        } else {
            client.status = 'inativo';
        }
        return client;
    }

    function calculateSimilarity(clientA, clientB) {
        let score = 0;
        if (clientA.telefone && clientB.telefone && clientA.telefone === clientB.telefone) return 100;
        
        if (clientA.nome && clientB.nome) {
            const nameA = String(clientA.nome);
            const nameB = String(clientB.nome);
            const nameSimilarity = 1 - (levenshtein(nameA.toLowerCase(), nameB.toLowerCase()) / Math.max(nameA.length, nameB.length));
            score += nameSimilarity * 80;
        }
        
        if (clientA.email && clientB.email && String(clientA.email).toLowerCase() === String(clientB.email).toLowerCase()) {
            score += 20;
        }

        return Math.min(100, Math.round(score));
    }

    function levenshtein(s1, s2) {
        if (!s1) return s2 ? s2.length : 0;
        if (!s2) return s1.length;
        const m = s1.length, n = s2.length;
        const d = Array.from(Array(m + 1), () => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) d[i][0] = i;
        for (let j = 0; j <= n; j++) d[0][j] = j;
        for (let j = 1; j <= n; j++) {
            for (let i = 1; i <= m; i++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            }
        }
        return d[m][n];
    }

    function smartMerge(existing, newData) {
        const merged = { ...existing };
        
        for (const key in newData) {
            if(key === 'id') continue;
            if (key === 'valor_total') {
                merged[key] = (merged[key] || 0) + (newData[key] || 0);
            } else if (key === 'data_ultima_compra') {
                if (!merged[key] || new Date(newData[key]) > new Date(merged[key])) {
                    merged[key] = newData[key];
                }
            } else if (key === 'produtos') {
                const existingProducts = new Set((merged.produtos || '').split('; ').filter(Boolean));
                const newProducts = (newData.produtos || '').split('; ').filter(Boolean);
                newProducts.forEach(p => existingProducts.add(p));
                merged.produtos = Array.from(existingProducts).join('; ');
            } else if (typeof newData[key] === 'string' && newData[key].length > (merged[key] || '').length) {
                merged[key] = newData[key]; // Prioriza dados mais completos
            } else if (!merged[key] && newData[key]) {
                merged[key] = newData[key]; // Adiciona dados novos
            }
        }
        
        merged.updated_at = new Date().toISOString();
        
        // Adiciona a nova fonte apenas se for diferente da última
        const lastSource = merged.sources[merged.sources.length - 1];
        if (!lastSource || !lastSource.name.startsWith('Ideris Sync')) {
            merged.sources.push({ name: fileToImport.name, date: new Date().toISOString() });
        }
        
        return calculateClientStatus(merged);
    }

    // --- LÓGICA DE UI E RENDERIZAÇÃO ---
    
    function applyFiltersAndRender() {
        const searchTerm = ui.filters.search.value.toLowerCase();
        const statusFilter = ui.filters.status.value;

        state.filteredClients = state.clients.filter(client => {
            const matchesSearch = searchTerm === '' || 
                (client.nome && client.nome.toLowerCase().includes(searchTerm)) ||
                (client.telefone && client.telefone.includes(searchTerm)) ||
                (client.email && client.email.toLowerCase().includes(searchTerm));

            const matchesStatus = statusFilter === 'all' || client.status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        state.currentPage = 1;
        renderTable();
        renderPagination();
    }

    function renderTable() {
        ui.tableBody.innerHTML = '';
        
        const start = (state.currentPage - 1) * state.itemsPerPage;
        const end = start + state.itemsPerPage;
        const pageClients = state.filteredClients.slice(start, end);
        
        if (pageClients.length === 0 && state.clients.length > 0) {
             ui.tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-gray-500">Nenhum cliente encontrado com os filtros atuais.</td></tr>`;
             return;
        }

        pageClients.forEach(client => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 cursor-pointer';
            row.dataset.clientId = client.id;
            
            const statusInfo = getStatusInfo(client.status);

            row.innerHTML = `
                <td class="p-4"><input type="checkbox" data-client-id="${client.id}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 client-checkbox"></td>
                <td class="p-4 font-medium text-gray-900">${client.nome || 'N/A'}</td>
                <td class="p-4 text-gray-500">${formatPhone(client.telefone)}</td>
                <td class="p-4"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusInfo.bg} ${statusInfo.text}">${statusInfo.label}</span></td>
                <td class="p-4 text-gray-500">${formatDate(client.data_ultima_compra)}</td>
                <td class="p-4 text-gray-500">${formatCurrency(client.valor_total)}</td>
                <td class="p-4 text-center"><span class="inline-block bg-gray-200 text-gray-700 text-xs font-bold px-2 py-1 rounded-full">${client.sources.length}</span></td>
            `;
            row.querySelector('.client-checkbox').addEventListener('click', e => e.stopPropagation());
            row.querySelector('.client-checkbox').addEventListener('change', (e) => handleSelection(e.target.dataset.clientId));
            row.addEventListener('click', () => openClientDetailsModal(client.id));
            ui.tableBody.appendChild(row);
        });
        updateSelectionUI();
    }
    
    function renderPagination() {
        const totalPages = Math.ceil(state.filteredClients.length / state.itemsPerPage);
        
        if (totalPages <= 1) {
            ui.pagination.container.classList.add('hidden');
            return;
        }
        
        ui.pagination.container.classList.remove('hidden');
        ui.pagination.pageInfo.textContent = `Página ${state.currentPage} de ${totalPages}`;
        ui.pagination.prevBtn.disabled = state.currentPage === 1;
        ui.pagination.nextBtn.disabled = state.currentPage === totalPages;
    }
    
    function updateDashboard() {
        ui.dashboard.totalClients.textContent = state.clients.length;
        if(state.importHistory.length > 0) {
            const lastImport = state.importHistory[state.importHistory.length - 1];
            ui.dashboard.lastImport.textContent = `${lastImport.name} (${new Date(lastImport.date).toLocaleDateString()})`;
        } else {
            ui.dashboard.lastImport.textContent = 'N/A';
        }
    }
    
    function openClientDetailsModal(clientId) {
        const client = state.clients.find(c => c.id === clientId);
        if (!client) return;
        
        const statusInfo = getStatusInfo(client.status);

        ui.clientModal.header.innerHTML = `
            <h3 class="text-xl font-bold leading-6 text-gray-900">${client.nome}</h3>
            <div class="mt-2 flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                <span>ID: ${client.id.substring(0,8)}</span>
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusInfo.bg} ${statusInfo.text}">${statusInfo.label}</span>
                <span>${client.dias_desde_ultima_compra !== null ? `${client.dias_desde_ultima_compra} dias desde a última compra` : 'Sem histórico'}</span>
            </div>`;
        
        let bodyHtml = `<h4 class="text-md font-semibold text-gray-800 mb-4">Informações Consolidadas</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><strong>Telefone:</strong> ${formatPhone(client.telefone)}</div>
                <div><strong>Email:</strong> ${client.email || 'N/A'}</div>
                <div><strong>Valor Total Gasto:</strong> ${formatCurrency(client.valor_total)}</div>
                <div><strong>Última Compra:</strong> ${formatDate(client.data_ultima_compra)}</div>
                <div><strong>Endereço:</strong> ${client.endereco || 'N/A'}, ${client.cidade || ''} - ${client.estado || ''}</div>
                <div><strong>Observações:</strong> ${client.observacoes || 'N/A'}</div>
            </div>`;

        if (client.produtos) {
            bodyHtml += `<hr class="my-6">
            <h4 class="text-md font-semibold text-gray-800 mb-4">Produtos Comprados</h4>
            <ul class="space-y-2 text-sm list-disc list-inside">`;
            client.produtos.split('; ').forEach(p => {
                bodyHtml += `<li>${p}</li>`;
            });
            bodyHtml += `</ul>`;
        }

        bodyHtml += `<hr class="my-6">
            <h4 class="text-md font-semibold text-gray-800 mb-4">Histórico de Fontes (${client.sources.length})</h4>
            <ul class="space-y-3">
        `;
        
        client.sources.slice().reverse().forEach(source => {
            bodyHtml += `<li class="text-sm">
                <span class="font-semibold text-gray-700">${source.name}</span>
                <span class="text-gray-500"> - ${new Date(source.date).toLocaleString('pt-BR')}</span>
            </li>`;
        });

        bodyHtml += '</ul>';
        ui.clientModal.body.innerHTML = bodyHtml;
        
        showModal(ui.clientModal.container);
    }

    function openSettingsModal() {
        ui.settingsModal.ativoDays.value = state.config.statusIntervals.ativo;
        ui.settingsModal.riscoDays.value = state.config.statusIntervals.emRisco;
        ui.settingsModal.apiKey.value = state.config.iderisApiKey;
        showModal(ui.settingsModal.container);
    }

    // --- AÇÕES DO USUÁRIO ---
    
    async function saveSettings() {
        const ativo = parseInt(ui.settingsModal.ativoDays.value, 10);
        const risco = parseInt(ui.settingsModal.riscoDays.value, 10);
        const apiKey = ui.settingsModal.apiKey.value.trim();

        if (isNaN(ativo) || isNaN(risco) || ativo <= 0 || risco <= ativo) {
            showToast('Valores de status inválidos. "Em Risco" deve ser maior que "Ativo".', 'error');
            return;
        }
        if (!apiKey) {
            showToast('A API Key da Ideris é obrigatória.', 'error');
            return;
        }
        
        state.config.statusIntervals.ativo = ativo;
        state.config.statusIntervals.emRisco = risco;
        state.config.iderisApiKey = apiKey;
        
        await saveConfigToDB({ config: state.config, importHistory: state.importHistory });
        
        setLoading(true, 'Recalculando status dos clientes...');
        state.clients = state.clients.map(calculateClientStatus);
        for (const client of state.clients) {
            await updateClientInDB(client);
        }
        
        hideModal(ui.settingsModal.container);
        showToast('Configurações salvas com sucesso!', 'success');
        
        applyFiltersAndRender();
        setLoading(false);
    }
    
    async function confirmClearDB() {
        if (confirm('Você tem certeza que deseja apagar TODOS os dados? Esta ação é irreversível.')) {
            if (confirm('Confirmação final: Todos os clientes e históricos de importação serão perdidos. Continuar?')) {
                setLoading(true, 'Limpando banco de dados...');
                try {
                    const tx = db.transaction([CLIENTS_STORE, CONFIG_STORE], 'readwrite');
                    await tx.objectStore(CLIENTS_STORE).clear();
                    await tx.objectStore(CONFIG_STORE).clear();
                    
                    state.clients = [];
                    state.filteredClients = [];
                    state.importHistory = [];
                    state.isInitialImport = true;
                    
                    updateUIBasedOnState();
                    showToast('Base de dados limpa com sucesso.', 'success');
                } catch (e) {
                    showToast('Erro ao limpar a base de dados.', 'error');
                } finally {
                    setLoading(false);
                }
            }
        }
    }
    
    function changePage(direction) {
        const totalPages = Math.ceil(state.filteredClients.length / state.itemsPerPage);
        const newPage = state.currentPage + direction;
        if (newPage >= 1 && newPage <= totalPages) {
            state.currentPage = newPage;
            renderTable();
            renderPagination();
        }
    }

    function handleSelection(clientId) {
        if(state.selection.has(clientId)) {
            state.selection.delete(clientId);
        } else {
            state.selection.add(clientId);
        }
        updateSelectionUI();
    }

    function handleSelectAllPage(event) {
        const isChecked = event.target.checked;
        const start = (state.currentPage - 1) * state.itemsPerPage;
        const end = start + state.itemsPerPage;
        const pageClients = state.filteredClients.slice(start, end);

        pageClients.forEach(client => {
            if (isChecked) {
                state.selection.add(client.id);
            } else {
                state.selection.delete(client.id);
            }
        });
        updateSelectionUI();
    }
    
    function updateSelectionUI() {
        const checkboxes = document.querySelectorAll('.client-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = state.selection.has(cb.dataset.clientId);
        });
        
        const selectionSize = state.selection.size;
        if (selectionSize > 0) {
            ui.selectionCount.textContent = `${selectionSize} selecionado(s)`;
            ui.exportBtn.disabled = false;
            ui.copyPhonesBtn.disabled = false;
        } else {
            ui.selectionCount.textContent = '';
            ui.exportBtn.disabled = true;
            ui.copyPhonesBtn.disabled = true;
        }
    }
    
    function getSelectedClients() {
        return state.clients.filter(c => state.selection.has(c.id));
    }

    function exportSelected() {
        const selectedClients = getSelectedClients();
        if (selectedClients.length === 0) return;
        
        const dataToExport = selectedClients.map(c => ({
            Nome: c.nome,
            Telefone: c.telefone,
            Email: c.email,
            Status: c.status,
            'Última Compra': c.data_ultima_compra,
            'Valor Total': c.valor_total,
            Produtos: c.produtos,
            Endereço: c.endereco,
            Cidade: c.cidade,
            Estado: c.estado,
            CEP: c.cep
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
        
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/octet-stream' });
        
        const filename = `crm_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        saveAs(data, filename);
    }

    function copySelectedPhones() {
        const selectedClients = getSelectedClients();
        if (selectedClients.length === 0) return;

        const phones = selectedClients.map(c => c.telefone).join('\n');
        navigator.clipboard.writeText(phones).then(() => {
            showToast(`${selectedClients.length} telefones copiados!`, 'success');
        }, () => {
            showToast('Falha ao copiar telefones.', 'error');
        });
    }

    // --- HELPERS E UTILITÁRIOS ---

    function setLoading(isLoading, message = 'Processando...') {
        if (isLoading) {
            ui.loadingMessage.textContent = message;
            ui.loadingOverlay.classList.remove('hidden');
        } else {
            ui.loadingOverlay.classList.add('hidden');
        }
    }
    
    function showModal(modalElement) {
        modalElement.classList.remove('hidden');
    }

    function hideModal(modalElement) {
        modalElement.classList.add('hidden');
    }
    
    function showToast(message, type = 'info') {
        const colors = {
            info: 'bg-blue-500',
            success: 'bg-green-500',
            warning: 'bg-yellow-500',
            error: 'bg-red-500'
        };
        const toast = document.createElement('div');
        toast.className = `p-4 rounded-lg shadow-lg text-white ${colors[type]}`;
        toast.textContent = message;
        ui.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }
    
    function getStatusInfo(status) {
        switch(status) {
            case 'ativo': return { label: 'Ativo', bg: 'bg-green-100', text: 'text-green-800' };
            case 'em_risco': return { label: 'Em Risco', bg: 'bg-yellow-100', text: 'text-yellow-800' };
            case 'inativo': return { label: 'Inativo', bg: 'bg-red-100', text: 'text-red-800' };
            default: return { label: 'Sem Histórico', bg: 'bg-gray-100', text: 'text-gray-800' };
        }
    }
    
    function formatPhone(phone) {
        if (!phone) return 'N/A';
        const p = phone.replace(/\D/g, '');
        if (p.length === 13) { // 55 11 988887777
            return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,9)}-${p.slice(9)}`;
        }
        return phone;
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            return new Date(dateString + 'T00:00:00Z').toLocaleDateString('pt-BR');
        } catch (e) {
            return dateString;
        }
    }

    function formatCurrency(value) {
        if (typeof value !== 'number') return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }


    // --- INTERAÇÕES COM INDEXEDDB ---

    function getObjectStore(storeName, mode) {
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    async function getAllClientsFromDB() {
        return new Promise((resolve, reject) => {
            const store = getObjectStore(CLIENTS_STORE, 'readonly');
            const request = store.getAll();
            request.onsuccess = e => resolve(e.target.result.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)));
            request.onerror = e => reject(e.target.error);
        });
    }
    
    async function addClientsToDB(clients) {
        return new Promise((resolve, reject) => {
            const store = getObjectStore(CLIENTS_STORE, 'readwrite');
            clients.forEach(client => store.add(client));
            store.transaction.oncomplete = () => resolve();
            store.transaction.onerror = e => reject(e.target.error);
        });
    }
    
    async function updateClientInDB(client) {
         return new Promise((resolve, reject) => {
            const store = getObjectStore(CLIENTS_STORE, 'readwrite');
            const request = store.put(client);
            request.onsuccess = () => resolve();
            request.onerror = e => reject(e.target.error);
        });
    }
    
    async function saveConfigToDB(data) {
         return new Promise((resolve, reject) => {
            const store = getObjectStore(CONFIG_STORE, 'readwrite');
            const request = store.put({ key: 'appData', ...data });
            request.onsuccess = () => resolve();
            request.onerror = e => reject(e.target.error);
        });
    }

    async function getConfigFromDB() {
         return new Promise((resolve, reject) => {
            const store = getObjectStore(CONFIG_STORE, 'readonly');
            const request = store.get('appData');
            request.onsuccess = e => resolve(e.target.result);
            request.onerror = e => reject(e.target.error);
        });
    }


    // --- INICIAR A APLICAÇÃO ---
    init();
});

