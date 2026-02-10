// ============================================================================
// CHAT LOADING SYSTEM - Delta Sync com IndexedDB
// ============================================================================
// Fluxo:
//   1. Renderiza instantaneamente do IndexedDB (0ms first paint)
//   2. Fetch da API em background
//   3. Diff: identifica apenas chats que mudaram
//   4. Enriquece SOMENTE os chats alterados
//   5. Merge no IndexedDB e re-renderiza
// ============================================================================

class ChatLoadingSystem {
    constructor() {
        this.allChats = [];
        this.filteredChats = [];
        this.currentFilter = 'all'; // 'all', 'contacts', 'groups'
        this.isLoading = false;
        this.lastLoadTime = 0;
        this.loadingCache = null; // Para evitar multiple requests
        
        // Throttle para fotos de perfil (evitar ERR_INSUFFICIENT_RESOURCES)
        this._picQueue = [];       // Fila de {chat, cleanPhone, resolve}
        this._picActive = 0;       // Requests ativos
        this._picMax = 5;          // Máximo simultâneo
        this._picCache = new Set(); // JIDs já buscados nesta sessão
        
        // Cache persistente de URLs de fotos (localStorage)
        this._picUrlCache = this._loadPicCache();
        
        // Cache de mensagens em memória (hot-cache sobre o IndexedDB)
        this._messagesCache = new Map(); // remoteJid -> { messages, timestamp, hash }
        this._MSG_CACHE_TTL = 60000; // 60s (IDB é persistente, memory cache é atalho)
    }
    
    /**
     * Buscar mensagens do cache (memória → IDB fallback)
     * Retorna do cache instantaneamente se disponível e válido
     */
    getCachedMessages(remoteJid) {
        const cached = this._messagesCache.get(remoteJid);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this._MSG_CACHE_TTL) return null;
        return cached.messages;
    }
    
    /**
     * Buscar mensagens do IndexedDB (async — para carregamento inicial)
     */
    async getCachedMessagesAsync(remoteJid) {
        // 1. Tentar memória primeiro (sync)
        const memCached = this.getCachedMessages(remoteJid);
        if (memCached) return memCached;
        
        // 2. Tentar IndexedDB
        if (window.ChatDB) {
            try {
                const idbMessages = await window.ChatDB.getMessages(remoteJid);
                if (idbMessages && idbMessages.length > 0) {
                    // Promover para memory cache
                    this.setCachedMessages(remoteJid, idbMessages);
                    return idbMessages;
                }
            } catch (e) {
                console.warn('[ChatLoader] Erro ao ler IDB messages:', e);
            }
        }
        return null;
    }
    
    setCachedMessages(remoteJid, messages, hash) {
        this._messagesCache.set(remoteJid, {
            messages,
            timestamp: Date.now(),
            hash: hash || ''
        });
        // Limitar memory cache a 30 chats
        if (this._messagesCache.size > 30) {
            const oldest = this._messagesCache.keys().next().value;
            this._messagesCache.delete(oldest);
        }
        
        // Persistir no IndexedDB em background (fire-and-forget)
        if (window.ChatDB && messages.length > 0) {
            window.ChatDB.saveMessages(remoteJid, messages).catch(() => {});
        }
    }
    
    /**
     * Carregar TODOS os chats — Delta Sync com IndexedDB
     * 
     * FLUXO:
     *   Passo 1: Renderizar instantaneamente do IndexedDB (cached paint)
     *   Passo 2: Fetch 100 chats mais recentes da API
     *   Passo 3: Diff — quais mudaram vs IDB?
     *   Passo 4: Enriquecer SOMENTE os chats alterados
     *   Passo 5: Merge no IDB + re-renderizar
     */
    async loadAllChats(forceRefresh = false) {
        // Evitar reload muito rápido (mínimo 5s entre refreshes, a menos que forçado)
        const now = Date.now();
        const MIN_INTERVAL = forceRefresh ? 1000 : 5000;
        if (!forceRefresh && this.lastLoadTime && (now - this.lastLoadTime) < MIN_INTERVAL) {
            return this.allChats;
        }
        
        if (this.isLoading) {
            console.log('[ChatLoader] Já está carregando...');
            return this.loadingCache || [];
        }
        
        this.isLoading = true;
        let renderedFromCache = false;
        
        // ======== PASSO 1: Renderizar do IndexedDB instantaneamente ========
        let idbChats = [];
        try {
            if (window.ChatDB) {
                idbChats = await window.ChatDB.getChats();
                if (idbChats.length > 0 && !forceRefresh) {
                    console.log(`[ChatLoader] ⚡ IDB hit! ${idbChats.length} chats do IndexedDB`);
                    this.allChats = idbChats;
                    this.loadingCache = this.allChats;
                    this.applyFilter(this.currentFilter);
                    this.renderChatsList();
                    renderedFromCache = true;
                }
            }
        } catch (e) {
            console.warn('[ChatLoader] IDB read falhou:', e.message);
        }
        
        // Fallback: tentar sessionStorage se IDB vazio
        if (!renderedFromCache) {
            try {
                const cached = sessionStorage.getItem('crm_chats_cache');
                if (cached && !forceRefresh) {
                    const parsed = JSON.parse(cached);
                    if (parsed.chats?.length > 0 && (now - parsed.timestamp) < 300000) {
                        console.log(`[ChatLoader] ⚡ Session hit! ${parsed.chats.length} chats`);
                        this.allChats = parsed.chats;
                        this.loadingCache = this.allChats;
                        this.applyFilter(this.currentFilter);
                        this.renderChatsList();
                        renderedFromCache = true;
                    }
                }
            } catch (e) {}
        }
        
        if (!renderedFromCache) {
            this.showLoadingIndicator(true);
        }
        
        try {
            console.log('[ChatLoader] 🔄 Buscando chats frescos da API...');
            const t0 = performance.now();
            
            // ======== PASSO 2: Fetch chats brutos da API ========
            const rawChats = await this.fetchRawChats();
            console.log(`[ChatLoader] Recebidos ${rawChats.length} chats brutos (${(performance.now()-t0).toFixed(0)}ms)`);
            
            // Separar grupos de contatos
            const isGroup = window.isGroupJid || ((jid) => jid && String(jid).includes('@g.us'));
            const groups = rawChats.filter(c => isGroup(c.remoteJid || c.id));
            const contacts = rawChats.filter(c => !isGroup(c.remoteJid || c.id));
            
            // ======== PASSO 3: Delta Sync — identifying changes ========
            let enrichedContacts, enrichedGroups;
            const dl = window.dataLayer || dataLayer;
            
            if (idbChats.length > 0 && !forceRefresh && window.ChatDB) {
                // DELTA: Só enriquecer chats que mudaram
                const { changed: changedContacts, unchanged: unchangedContacts } = window.ChatDB.diffChats(idbChats.filter(c => !c.isGroup), contacts);
                const { changed: changedGroups, unchanged: unchangedGroups } = window.ChatDB.diffChats(idbChats.filter(c => c.isGroup), groups);
                
                console.log(`[ChatLoader] 🔍 Delta: ${changedContacts.length} contatos mudaram, ${unchangedContacts.length} inalterados`);
                console.log(`[ChatLoader] 🔍 Delta: ${changedGroups.length} grupos mudaram, ${unchangedGroups.length} inalterados`);
                
                // ======== PASSO 4: Enriquecer SOMENTE os chats alterados ========
                const t1 = performance.now();
                const newlyEnriched = changedContacts.length > 0 ? await dl.enrichChats(changedContacts) : [];
                const newlyEnrichedGroups = changedGroups.length > 0 ? await dl.enrichChats(changedGroups) : [];
                
                enrichedContacts = [...newlyEnriched, ...unchangedContacts];
                enrichedGroups = [...newlyEnrichedGroups, ...unchangedGroups];
                
                const enrichTime = performance.now() - t1;
                console.log(`[ChatLoader] ⚡ Delta enrich: ${changedContacts.length + changedGroups.length} chats em ${enrichTime.toFixed(0)}ms (poupados: ${unchangedContacts.length + unchangedGroups.length})`);
            } else {
                // FULL: Primeira vez ou forceRefresh — enriquecer tudo
                console.log(`[ChatLoader] 🔄 Full enrich: ${contacts.length} contatos, ${groups.length} grupos`);
                enrichedContacts = await dl.enrichChats(contacts);
                enrichedGroups = await dl.enrichChats(groups);
            }
            
            // ======== PASSO 5: Merge, salvar IDB, re-renderizar ========
            this.allChats = [
                ...enrichedContacts,
                ...enrichedGroups
            ].sort((a, b) => {
                const timeA = (a.lastMessage?.messageTimestamp || 0) * 1000;
                const timeB = (b.lastMessage?.messageTimestamp || 0) * 1000;
                return timeB - timeA;
            });
            
            this.loadingCache = this.allChats;
            this.lastLoadTime = now;
            
            // Salvar no IndexedDB (persistente)
            if (window.ChatDB) {
                window.ChatDB.saveChats(this.allChats).catch(e => console.warn('[ChatLoader] IDB save err:', e));
                window.ChatDB.setLastSyncTimestamp(now).catch(() => {});
            }
            
            // Salvar no sessionStorage (fallback rápido)
            try {
                sessionStorage.setItem('crm_chats_cache', JSON.stringify({
                    chats: this.allChats,
                    timestamp: now
                }));
            } catch (e) {}
            
            const totalTime = performance.now() - t0;
            console.log(`[ChatLoader] ✅ ${this.allChats.length} chats carregados em ${totalTime.toFixed(0)}ms`);
            
            // Re-renderizar com dados frescos
            this.applyFilter(this.currentFilter);
            this.renderChatsList();
            
            // Limpeza periódica de mensagens antigas (fire-and-forget)
            if (window.ChatDB && Math.random() < 0.1) { // 10% das vezes
                window.ChatDB.pruneOldMessages(30).catch(() => {});
            }
            
            return this.allChats;
            
        } catch (error) {
            console.error('[ChatLoader] Erro:', error);
            if (!renderedFromCache) {
                this.showLoadingError(error.message);
            }
            return this.allChats; // Retornar cache se disponível
        } finally {
            this.isLoading = false;
            this.showLoadingIndicator(false);
        }
    }
    
    /**
     * Buscar chats brutos da API (sem enriquecimento)
     */
    async fetchRawChats() {
        const response = await fetch('/api/whatsapp/all-chats');
        if (!response.ok) {
            throw new Error(`Erro ao buscar chats: ${response.status}`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }
    
    /**
     * Filtrar chats por tipo
     */
    applyFilter(filterType) {
        this.currentFilter = filterType;
        
        switch (filterType) {
            case 'contacts':
                this.filteredChats = this.allChats.filter(c => !c.isGroup);
                break;
            case 'groups':
                this.filteredChats = this.allChats.filter(c => c.isGroup);
                break;
            default: // 'all'
                this.filteredChats = [...this.allChats];
        }
        
        console.log(`[ChatLoader] Filtro "${filterType}": ${this.filteredChats.length} chats`);
        return this.filteredChats;
    }
    
    /**
     * Renderizar lista de chats na tela (paginados - 20 por vez)
     */
    renderChatsList() {
        const container = document.getElementById('chatsList');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Se vazio, mostrar mensagem
        if (this.filteredChats.length === 0) {
            container.innerHTML = this.getEmptyStateHTML();
            return;
        }
        
        // Delegar para a função global renderChatsList que tem paginação
        if (typeof window.renderChatsList === 'function') {
            // Sincronizar allChats global para o filtro funcionar
            if (typeof window.allChats !== 'undefined') {
                window.allChats = this.allChats;
                // Aplicar estados de leitura local (preservar o que o usuário já leu)
                if (typeof window.applyLocalReadStates === 'function') {
                    window.applyLocalReadStates(window.allChats);
                }
            }
            window.renderChatsList(this.filteredChats);
            return;
        }
        
        // Fallback: renderizar com paginação local
        const PAGE = 20;
        const fragment = document.createDocumentFragment();
        const toRender = this.filteredChats.slice(0, PAGE);
        
        toRender.forEach(chat => {
            const element = this.createChatElement(chat);
            fragment.appendChild(element);
        });
        
        container.appendChild(fragment);
        
        // Re-inicializar ícones (lucide)
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
    
    /**
     * Criar elemento HTML para um chat
     */
    createChatElement(chat) {
        const div = document.createElement('div');
        const chatKey = createChatKey(chat.remoteJid || chat.id);
        
        // Extrair última mensagem
        const lastMsg = chat.lastMessage;
        let lastMsgPreview = 'Nenhuma mensagem';
        if (lastMsg?.message?.conversation) {
            lastMsgPreview = lastMsg.message.conversation.substring(0, 50);
        } else if (lastMsg?.message?.extendedTextMessage?.text) {
            lastMsgPreview = lastMsg.message.extendedTextMessage.text.substring(0, 50);
        } else if (lastMsg) {
            lastMsgPreview = '📎 Arquivo';
        }
        
        // Tempo decorrido
        const timeAgo = this.formatTimeAgo((lastMsg?.messageTimestamp || 0) * 1000);
        
        // Badge de status
        const statusBadge = getClientStatusBadge(chat.clientStatus);
        
        div.className = `chat-item p-3 border-b hover:bg-gray-50 cursor-pointer transition select-none`;
        div.setAttribute('data-chat-key', chatKey);
        
        // CRÍTICO: Garantir que remoteJid existe
        if (!chat.remoteJid) {
            chat.remoteJid = chat.id;
        }
        if (!chat.id) {
            chat.id = chat.remoteJid;
        }
        
        div.onclick = () => {
            console.log('========== CLICK em lib-chat-loader ==========');
            console.log('Chat clicado:', chat.displayName);
            console.log('Chat ID:', chat.id);
            console.log('Chat remoteJid:', chat.remoteJid);
            
            // Chamar openChat diretamente (função global do atendimentos.js)
            if (typeof window.openChat === 'function') {
                console.log('Chamando window.openChat...');
                window.openChat(chat);
            } else if (typeof openChat === 'function') {
                console.log('Chamando openChat...');
                openChat(chat);
            } else {
                console.error('❌ Função openChat não encontrada!');
                // Fallback: disparar evento
                window.dispatchEvent(new CustomEvent('chatSelected', { 
                    detail: { chat, chatKey } 
                }));
            }
        };
        
        // Gerar avatar (foto ou inicial)
        const avatarHTML = this.generateAvatarHTML(chat);
        
        div.innerHTML = `
            <div class="flex gap-3">
                <!-- Avatar -->
                <div class="flex-shrink-0 relative">
                    ${avatarHTML}
                    ${chat.isKnownClient ? '<div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" title="Cliente cadastrado"></div>' : ''}
                </div>
                
                <!-- Conteúdo -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-semibold text-gray-900 truncate">${chat.displayName}</span>
                        ${chat.isGroup ? '<span class="text-xs text-blue-600 font-medium">👥 ' + (chat.participantsCount || 0) + '</span>' : ''}
                        <span class="text-xs bg-${statusBadge.color} px-2 py-1 rounded">${statusBadge.text}</span>
                    </div>
                    
                    <div class="text-sm text-gray-600 truncate">${lastMsgPreview}</div>
                    
                    ${!chat.isGroup ? `<div class="text-xs text-gray-400 mt-1">${formatPhoneForDisplay(chat.cleanPhone)}</div>` : ''}
                </div>
                
                <!-- Tempo -->
                <div class="flex-shrink-0 text-xs text-gray-500 whitespace-nowrap">
                    ${timeAgo}
                </div>
            </div>
        `;
        
        return div;
    }
    
    /**
     * Gerar HTML do avatar (foto ou inicial colorida)
     */
    generateAvatarHTML(chat) {
        const initial = (chat.displayName || '?').charAt(0).toUpperCase();
        const gradient = this.getAvatarGradient(initial); // Pre-compute
        
        // Grupo: emoji de grupo
        if (chat.isGroup) {
            if (chat.profilePicUrl) {
                return `<img src="${chat.profilePicUrl}" alt="${chat.displayName}" class="w-12 h-12 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg\\'>👥</div>'">`;
            }
            return '<div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg">👥</div>';
        }
        
        // Contato: foto se disponível, senão inicial
        if (chat.profilePicUrl) {
            return `<img src="${chat.profilePicUrl}" alt="${chat.displayName}" class="w-12 h-12 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-full ${gradient} flex items-center justify-center text-white font-bold\\'>${initial}</div>'">`;
        }
        
        // Sem foto: tentar buscar do servidor (lazy load)
        const cleanPhone = chat.cleanPhone || extractPhoneFromJid(chat.remoteJid || chat.id);
        if (cleanPhone && !chat.isGroup) {
            this.lazyLoadProfilePic(chat, cleanPhone);
        }
        
        return `<div class="w-12 h-12 rounded-full ${gradient} flex items-center justify-center text-white font-bold" data-phone="${cleanPhone}">${initial}</div>`;
    }
    
    /**
     * Buscar foto de perfil do servidor e atualizar na lista (COM THROTTLING)
     * Usa fila interna para limitar a 5 requests simultâneos
     */
    async lazyLoadProfilePic(chat, cleanPhone) {
        // Ignorar @lid (Linked IDs não têm foto buscável por telefone)
        const jid = (chat.remoteJid || chat.id || '');
        if (jid.includes('@lid')) return;
        
        const targetJid = cleanPhone.startsWith('55') ? `${cleanPhone}@s.whatsapp.net` : `55${cleanPhone}@s.whatsapp.net`;
        
        // Verificar cache persistente primeiro (evita fetch da API)
        const cached = this._picUrlCache[targetJid];
        if (cached && cached.url && (Date.now() - cached.ts < 24 * 60 * 60 * 1000)) {
            chat.profilePicUrl = cached.url;
            this._updateAvatarInDOM(chat, cached.url);
            this._picCache.add(targetJid);
            return;
        }
        
        // Deduplicar: não buscar o mesmo JID duas vezes
        if (this._picCache.has(targetJid)) return;
        this._picCache.add(targetJid);
        
        // Enfileirar e processar
        return new Promise(resolve => {
            this._picQueue.push({ chat, targetJid, resolve });
            this._processPickQueue();
        });
    }
    
    /**
     * Processar fila de fotos de perfil respeitando o limite
     */
    async _processPickQueue() {
        while (this._picQueue.length > 0 && this._picActive < this._picMax) {
            const item = this._picQueue.shift();
            this._picActive++;
            this._fetchProfilePic(item).finally(() => {
                this._picActive--;
                this._processPickQueue();
            });
        }
    }
    
    async _fetchProfilePic({ chat, targetJid, resolve }) {
        try {
            const res = await fetch(`/api/whatsapp/profile-picture/${targetJid}`);
            if (!res.ok) { resolve(); return; }
            const data = await res.json();
            
            if (data.profilePicUrl) {
                chat.profilePicUrl = data.profilePicUrl;
                this._updateAvatarInDOM(chat, data.profilePicUrl);
                // Salvar no cache persistente
                this._picUrlCache[targetJid] = { url: data.profilePicUrl, ts: Date.now() };
                this._savePicCache();
            }
        } catch (e) {
            // Silenciar erro - foto é opcional
        }
        resolve();
    }
    
    /** Atualizar avatar no DOM */
    _updateAvatarInDOM(chat, picUrl) {
        const chatKey = createChatKey(chat.remoteJid || chat.id);
        const chatEl = document.querySelector(`[data-chat-key="${chatKey}"]`);
        if (chatEl) {
            const avatarContainer = chatEl.querySelector('.flex-shrink-0');
            if (avatarContainer) {
                const initial = (chat.displayName || '?').charAt(0).toUpperCase();
                const gradient = this.getAvatarGradient(initial);
                avatarContainer.innerHTML = `<img src="${picUrl}" class="w-12 h-12 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-full ${gradient} flex items-center justify-center text-white font-bold\\'>${initial}</div>'">`;
            }
        }
    }
    
    /** Carregar cache de fotos do localStorage */
    _loadPicCache() {
        try {
            const raw = localStorage.getItem('crm_profile_pics');
            if (raw) {
                const parsed = JSON.parse(raw);
                // Limpar entradas expiradas (>24h)
                const now = Date.now();
                const cleaned = {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (v.ts && (now - v.ts < 24 * 60 * 60 * 1000)) cleaned[k] = v;
                }
                return cleaned;
            }
        } catch(e) {}
        return {};
    }
    
    /** Salvar cache de fotos (debounced) */
    _savePicCache() {
        if (this._picSaveTimer) clearTimeout(this._picSaveTimer);
        this._picSaveTimer = setTimeout(() => {
            try {
                localStorage.setItem('crm_profile_pics', JSON.stringify(this._picUrlCache));
            } catch(e) {}
        }, 2000);
    }
    
    /**
     * Obter gradiente baseado na inicial (cores variadas)
     */
    getAvatarGradient(initial) {
        const colors = [
            'bg-gradient-to-br from-green-400 to-green-600',
            'bg-gradient-to-br from-blue-400 to-blue-600',
            'bg-gradient-to-br from-purple-400 to-purple-600',
            'bg-gradient-to-br from-pink-400 to-pink-600',
            'bg-gradient-to-br from-orange-400 to-orange-600',
            'bg-gradient-to-br from-teal-400 to-teal-600',
            'bg-gradient-to-br from-indigo-400 to-indigo-600',
            'bg-gradient-to-br from-red-400 to-red-600'
        ];
        const index = initial.charCodeAt(0) % colors.length;
        return colors[index];
    }
    
    /**
     * Estado vazio
     */
    getEmptyStateHTML() {
        const filterText = {
            'all': 'Nenhuma conversa encontrada',
            'contacts': 'Nenhum contato encontrado',
            'groups': 'Nenhum grupo encontrado'
        }[this.currentFilter] || 'Nenhuma conversa';
        
        return `
            <div class="p-8 text-center">
                <div class="text-4xl mb-3">📭</div>
                <p class="text-gray-600">${filterText}</p>
                <p class="text-gray-400 text-sm mt-2">Espere novas mensagens chegarem</p>
            </div>
        `;
    }
    
    /**
     * Skeleton loading (enquanto carrega)
     */
    renderSkeletonLoading() {
        const container = document.getElementById('chatsList');
        if (!container) return;
        
        container.innerHTML = `
            ${Array(5).fill(0).map((_, i) => `
                <div class="animate-pulse p-3 border-b flex gap-3">
                    <div class="flex-shrink-0 w-12 h-12 bg-gray-200 rounded-full"></div>
                    <div class="flex-1">
                        <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div class="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                    <div class="h-3 bg-gray-200 rounded w-12"></div>
                </div>
            `).join('')}
        `;
    }
    
    /**
     * Mostrar/esconder indicador de carregamento
     */
    showLoadingIndicator(show) {
        if (show) {
            this.renderSkeletonLoading();
        }
    }
    
    /**
     * Mostrar erro
     */
    showLoadingError(message) {
        const container = document.getElementById('chatsList');
        if (!container) return;
        
        container.innerHTML = `
            <div class="p-4 bg-red-50 text-red-700 rounded-lg m-3">
                <strong>❌ Erro ao carregar chats</strong>
                <p class="text-sm mt-1">${message}</p>
            </div>
        `;
    }
    
    /**
     * Formatar tempo decorrido
     */
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const now = Date.now();
        const elapsed = now - timestamp;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) return 'agora';
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        if (days < 7) return `${days}d`;
        
        // Data formatada
        const date = new Date(timestamp);
        return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
    }
}

// Instância global
const chatLoader = new ChatLoadingSystem();

// Exportar
window.chatLoader = chatLoader;
