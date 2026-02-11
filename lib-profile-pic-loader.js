// ============================================================================
// PROFILE PIC LOADER - SISTEMA OTIMIZADO DE CARREGAMENTO DE FOTOS
// Implementa Correção #5 do Prompt 300%
// ============================================================================

class ProfilePicLoader {
    constructor() {
        // === CONFIGURAÇÃO ===
        this.maxConcurrent = 3; // Máximo 3 requests simultâneos
        this.requestDelay = 300; // 300ms entre cada request
        this.retryAttempts = 2; // Máximo 2 retries por foto
        this.timeout = 10000; // 10 segundos timeout
        
        // === ESTADO ===
        this.queue = []; // Fila de jobs
        this.active = 0; // Requests ativos
        this.processing = false; // Flag de processamento
        this.aborted = false; // Flag de abortar
        
        // === CACHE ===
        this.cache = new Map(); // URL → { url, timestamp }
        this.cacheTTL = 24 * 60 * 60 * 1000; // 24 horas
        
        // === MÉTRICAS ===
        this.metrics = {
            total: 0,
            loaded: 0,
            cached: 0,
            failed: 0,
            aborted: 0
        };
    }
    
    /**
     * Carregar fotos de uma lista de chats
     * @param {Array} chats - Lista de chats
     * @returns {Promise}
     */
    async loadBatch(chats) {
        if (!Array.isArray(chats) || chats.length === 0) {
            return;
        }
        
        console.log('[ProfilePicLoader] 📸 Carregando fotos de', chats.length, 'chats');
        
        this.metrics.total = chats.length;
        this.aborted = false;
        
        // Criar jobs
        const jobs = chats.map(chat => ({
            chat: chat,
            remoteJid: chat.remoteJid,
            retries: 0
        }));
        
        // Adicionar à fila
        this.queue.push(...jobs);
        
        // Processar
        await this.processQueue();
        
        console.log('[ProfilePicLoader] ✅ Concluído:', this.metrics);
        
        return this.metrics;
    }
    
    /**
     * Processar fila
     */
    async processQueue() {
        if (this.processing) {
            return;
        }
        
        this.processing = true;
        
        while (this.queue.length > 0 && !this.aborted) {
            // Aguardar se já atingiu limite de concorrência
            while (this.active >= this.maxConcurrent) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const job = this.queue.shift();
            if (!job) continue;
            
            // Processar job (não bloquear)
            this.processJob(job);
            
            // Delay entre jobs
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }
        
        // Aguardar jobs ativos finalizarem
        while (this.active > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.processing = false;
    }
    
    /**
     * Processar job individual
     */
    async processJob(job) {
        this.active++;
        
        try {
            const { chat, remoteJid, retries } = job;
            
            // Verificar cache primeiro
            const cached = this.getFromCache(remoteJid);
            if (cached) {
                chat.profilePicUrl = cached;
                this.metrics.cached++;
                return;
            }
            
            // Buscar foto
            const url = await this.fetchProfilePic(remoteJid);
            
            if (url) {
                chat.profilePicUrl = url;
                this.saveToCache(remoteJid, url);
                this.metrics.loaded++;
                
                // Atualizar DOM se chat já estiver renderizado
                this.updateChatPic(remoteJid, url);
            } else {
                // Falhou, tentar novamente?
                if (retries < this.retryAttempts) {
                    console.log('[ProfilePicLoader] 🔄 Retry:', remoteJid, 'tentativa', retries + 1);
                    
                    job.retries++;
                    this.queue.push(job); // Re-enfileirar
                } else {
                    this.metrics.failed++;
                }
            }
            
        } catch (error) {
            console.error('[ProfilePicLoader] ❌ Erro ao processar job:', error);
            this.metrics.failed++;
            
        } finally {
            this.active--;
        }
    }
    
    /**
     * Buscar foto de perfil via API
     */
    async fetchProfilePic(remoteJid) {
        try {
            // Extrair número limpo
            const phone = remoteJid.split('@')[0];
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(
                `/api/whatsapp/profile-pic/${encodeURIComponent(remoteJid)}`,
                {
                    method: 'GET',
                    signal: controller.signal
                }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 404) {
                    // Sem foto de perfil
                    return null;
                }
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return data.profilePictureUrl || null;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('[ProfilePicLoader] ⚠️ Timeout:', remoteJid);
            } else {
                console.error('[ProfilePicLoader] ❌ Erro ao buscar foto:', error);
            }
            return null;
        }
    }
    
    /**
     * Obter do cache
     */
    getFromCache(remoteJid) {
        const cached = this.cache.get(remoteJid);
        if (!cached) return null;
        
        // Verificar expiração
        if (Date.now() - cached.timestamp > this.cacheTTL) {
            this.cache.delete(remoteJid);
            return null;
        }
        
        return cached.url;
    }
    
    /**
     * Salvar no cache
     */
    saveToCache(remoteJid, url) {
        this.cache.set(remoteJid, {
            url: url,
            timestamp: Date.now()
        });
        
        // Limitar tamanho do cache
        if (this.cache.size > 1000) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }
    
    /**
     * Atualizar foto no DOM
     */
    updateChatPic(remoteJid, url) {
        try {
            const chatElement = document.querySelector(`[data-chat-jid="${remoteJid}"]`);
            if (!chatElement) return;
            
            const imgElement = chatElement.querySelector('.chat-avatar img');
            if (imgElement) {
                imgElement.src = url;
            }
            
        } catch (error) {
            console.error('[ProfilePicLoader] ❌ Erro ao atualizar DOM:', error);
        }
    }
    
    /**
     * Abortar carregamento
     */
    abort() {
        console.log('[ProfilePicLoader] 🛑 Abortando carregamento');
        
        this.aborted = true;
        this.queue.length = 0; // Limpar fila
        this.metrics.aborted = this.queue.length + this.active;
    }
    
    /**
     * Limpar cache
     */
    clearCache() {
        this.cache.clear();
        console.log('[ProfilePicLoader] 🧹 Cache limpo');
    }
    
    /**
     * Resetar métricas
     */
    resetMetrics() {
        this.metrics = {
            total: 0,
            loaded: 0,
            cached: 0,
            failed: 0,
            aborted: 0
        };
    }
}

// ============================================================================
// INSTÂNCIA GLOBAL (para uso no navegador)
// ============================================================================

if (typeof window !== 'undefined') {
    window.ProfilePicLoader = new ProfilePicLoader();
}

// ============================================================================
// EXPORTS (para Node.js)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfilePicLoader;
}
