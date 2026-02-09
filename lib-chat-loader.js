// ============================================================================
// CHAT LOADING SYSTEM - Carregamento profissional de chats com groups
// ============================================================================

class ChatLoadingSystem {
    constructor() {
        this.allChats = [];
        this.filteredChats = [];
        this.currentFilter = 'all'; // 'all', 'contacts', 'groups'
        this.isLoading = false;
        this.lastLoadTime = 0;
        this.loadingCache = null; // Para evitar multiple requests
    }
    
    /**
     * Carregar TODOS os chats (incluindo grupos)
     * Executa o auto-match em paralelo
     */
    async loadAllChats(forceRefresh = false) {
        // Evitar reload muito rápido
        const now = Date.now();
        if (!forceRefresh && this.lastLoadTime && (now - this.lastLoadTime) < 2000) {
            console.log('[ChatLoader] Reload muito rápido, usando cache');
            return this.allChats;
        }
        
        if (this.isLoading) {
            console.log('[ChatLoader] Já está carregando...');
            return this.loadingCache || [];
        }
        
        this.isLoading = true;
        this.showLoadingIndicator(true);
        
        try {
            console.log('[ChatLoader] Iniciando carregamento de chats...');
            
            // 1. Buscar chats brutos da API
            const rawChats = await this.fetchRawChats();
            console.log(`[ChatLoader] Recebidos ${rawChats.length} chats brutos`);
            
            // 2. Separar grupos de contatos (usando window.isGroupJid)
            const isGroup = window.isGroupJid || ((jid) => jid && String(jid).includes('@g.us'));
            const groups = rawChats.filter(c => isGroup(c.remoteJid || c.id));
            const contacts = rawChats.filter(c => !isGroup(c.remoteJid || c.id));
            
            console.log(`[ChatLoader] ${contacts.length} contatos, ${groups.length} grupos`);
            
            // 3. Enriquecer em paralelo (dados + auto-match)
            const dl = window.dataLayer || dataLayer;
            const enrichedContacts = await dl.enrichChats(contacts);
            const enrichedGroups = await dl.enrichChats(groups);
            
            // 4. Mesclar e ordenar por última mensagem
            this.allChats = [
                ...enrichedContacts,
                ...enrichedGroups
            ].sort((a, b) => {
                const timeA = (a.lastMessage?.messageTimestamp || 0) * 1000;
                const timeB = (b.lastMessage?.messageTimestamp || 0) * 1000;
                return timeB - timeA; // Mais recentes primeiro
            });
            
            this.loadingCache = this.allChats;
            this.lastLoadTime = now;
            
            console.log(`[ChatLoader] ✅ ${this.allChats.length} chats carregados e enriquecidos`);
            
            return this.allChats;
            
        } catch (error) {
            console.error('[ChatLoader] Erro:', error);
            this.showLoadingError(error.message);
            return [];
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
     * Renderizar lista de chats na tela
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
        
        // Renderizar cada chat
        this.filteredChats.forEach(chat => {
            const element = this.createChatElement(chat);
            container.appendChild(element);
        });
        
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
        
        // Grupo: emoji de grupo
        if (chat.isGroup) {
            if (chat.profilePicUrl) {
                return `<img src="${chat.profilePicUrl}" alt="${chat.displayName}" class="w-12 h-12 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg\\'>👥</div>'">`;
            }
            return '<div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg">👥</div>';
        }
        
        // Contato: foto se disponível, senão inicial
        if (chat.profilePicUrl) {
            return `<img src="${chat.profilePicUrl}" alt="${chat.displayName}" class="w-12 h-12 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-full ${this.getAvatarGradient(initial)} flex items-center justify-center text-white font-bold\\'>${initial}</div>'">`;
        }
        
        return `<div class="w-12 h-12 rounded-full ${this.getAvatarGradient(initial)} flex items-center justify-center text-white font-bold">${initial}</div>`;
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
