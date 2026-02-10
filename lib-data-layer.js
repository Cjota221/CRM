// ============================================================================
// DATA LAYER - NORMALIZAÇÃO E CRUZAMENTO DE DADOS
// ============================================================================
// Este arquivo centraliza TODA a lógica de dados. Nenhum componente deve
// trabalhar com dados brutos. Tudo passa por aqui.

/**
 * NORMALIZAR TELEFONE - A função mais importante do sistema
 * @param {string} raw - Número bruto ("+55 62 99999-8888" ou "556299998888@s.whatsapp.net")
 * @returns {string} - Número limpo (ex: "62999998888")
 */
function normalizePhone(raw) {
    if (!raw) return '';
    
    // 1. Converter para string
    let str = String(raw);
    
    // 2. Remover sufixos de JID do WhatsApp primeiro
    str = str
        .replace(/@s\.whatsapp\.net/gi, '')
        .replace(/@c\.us/gi, '')
        .replace(/@g\.us/gi, '')
        .replace(/@lid/gi, '');
    
    // 3. Remover tudo que não é dígito
    let cleaned = str.replace(/\D/g, '');
    
    // 4. Se começar com 55 (DDI do Brasil) e tiver 12+ dígitos, remover DDI
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
        cleaned = cleaned.substring(2);
    }
    
    // 5. Se ficou com mais de 11 dígitos, pegar últimos 11 (número principal)
    if (cleaned.length > 11) {
        cleaned = cleaned.slice(-11);
    }
    
    // 6. Retornar número limpo - sempre retornar, mesmo se curto
    return cleaned;
}

/**
 * COMPARAR TELEFONES IGNORANDO O 9º DÍGITO (Brasil)
 * Resolve divergência: DB salva com 9 (629822237075) vs API envia sem 9 (5562822237075)
 * @param {string} phoneA - Telefone normalizado A
 * @param {string} phoneB - Telefone normalizado B
 * @returns {boolean}
 */
function phonesMatch(phoneA, phoneB) {
    if (!phoneA || !phoneB) return false;
    const a = normalizePhone(phoneA);
    const b = normalizePhone(phoneB);
    
    // Match exato
    if (a === b) return true;
    
    // Match por últimos 8 dígitos (ignora DDI + DDD + 9ºdígito)
    if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8)) {
        // Confirmar que o DDD é compatível (primeiros 2 dígitos sem DDI)
        const dddA = a.length >= 10 ? a.substring(0, 2) : '';
        const dddB = b.length >= 10 ? b.substring(0, 2) : '';
        if (!dddA || !dddB || dddA === dddB) return true;
    }
    
    // Match por últimos 9 dígitos (caso um tenha 9ºdígito e outro não DDD diferente)
    if (a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9)) return true;
    
    return false;
}

/**
 * Gerar variações do telefone para busca no banco (com/sem 9º dígito)
 * @param {string} phone - Telefone normalizado
 * @returns {string[]} - Array de variações possíveis
 */
function phoneVariations(phone) {
    if (!phone) return [];
    const norm = normalizePhone(phone);
    const variations = [norm];
    
    // Se tem 11 dígitos (DDD + 9 + 8 dígitos) → gerar versão sem 9
    if (norm.length === 11 && norm.charAt(2) === '9') {
        variations.push(norm.substring(0, 2) + norm.substring(3)); // Remove 9º dígito
    }
    
    // Se tem 10 dígitos (DDD + 8 dígitos) → gerar versão com 9
    if (norm.length === 10) {
        variations.push(norm.substring(0, 2) + '9' + norm.substring(2)); // Adiciona 9º dígito
    }
    
    // Versão com DDI 55
    variations.push('55' + norm);
    
    return [...new Set(variations)];
}

/**
 * Extrair número puro de um JID (remoteJid da Evolution API)
 * @param {string} jid - "556299998888@s.whatsapp.net" ou "1234567890@g.us"
 * @returns {string} - "62999998888"
 */
function extractPhoneFromJid(jid) {
    if (!jid) return '';
    
    // Usar normalizePhone que já lida com todos os sufixos
    return normalizePhone(jid);
}

/**
 * Detectar se é grupo
 * @param {string} jid - remoteJid ou chat.id
 * @returns {boolean}
 */
function isGroupJid(jid) {
    if (!jid) return false;
    return String(jid).includes('@g.us');
}

/**
 * Criar um "key" único para um chat (usado para cache/lookup)
 * @param {string} jid - remoteJid
 * @returns {string}
 */
function createChatKey(jid) {
    if (isGroupJid(jid)) {
        return `GROUP:${jid}`; // Grupos usam JID completo
    }
    const phone = normalizePhone(jid);
    return `CONTACT:${phone}`; // Contatos usam telefone normalizado
}

// ============================================================================
// AUTO-MATCH: Cruzar telefone com dados de cliente no Supabase
// ============================================================================

class DataLayer {
    constructor() {
        this.clientCache = new Map(); // Cache de clientes { phone -> clientData }
        this.chatCache = new Map();   // Cache de chats enriquecidos
        this.clientLookupInProgress = new Set(); // Evitar requisições duplicadas
    }
    
    /**
     * Buscar cliente no Supabase pelo telefone (com normalização do 9º dígito)
     * @param {string} phone - Número normalizado (ex: "62999998888")
     * @returns {Promise<Object|null>}
     */
    async fetchClientByPhone(phone) {
        if (!phone) return null;
        
        // Checar cache: tentar phone exato + variações com/sem 9ºdígito
        if (this.clientCache.has(phone)) {
            return this.clientCache.get(phone);
        }
        // Checar variações no cache local
        const variations = typeof phoneVariations === 'function' ? phoneVariations(phone) : [phone];
        for (const v of variations) {
            if (this.clientCache.has(v)) {
                const cached = this.clientCache.get(v);
                this.clientCache.set(phone, cached); // Alias
                return cached;
            }
        }
        
        // Se já está buscando, não fazer requisição duplicada
        if (this.clientLookupInProgress.has(phone)) {
            // Aguardar a requisição em progresso (implementar com Promise)
            let attempts = 0;
            while (this.clientLookupInProgress.has(phone) && attempts < 50) {
                await new Promise(r => setTimeout(r, 10));
                attempts++;
            }
            return this.clientCache.get(phone) || null;
        }
        
        try {
            this.clientLookupInProgress.add(phone);
            
            // Buscar no Supabase (usar RPC para performance)
            const response = await fetch('/api/client-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            
            if (!response.ok) {
                console.warn(`[DataLayer] Erro ao buscar cliente ${phone}:`, response.status);
                return null;
            }
            
            const client = await response.json();
            
            // Guardar em cache (com todas as variações de telefone)
            if (client && client.id) {
                this.clientCache.set(phone, client);
                // Cachear todas as variações de telefone deste cliente
                if (typeof phoneVariations === 'function') {
                    phoneVariations(phone).forEach(v => this.clientCache.set(v, client));
                }
                console.log(`[DataLayer] ✅ Cliente encontrado: ${phone} → ${client.name}`);
                return client;
            }
            
            return null;
            
        } catch (error) {
            console.error(`[DataLayer] Erro ao buscar cliente ${phone}:`, error);
            return null;
        } finally {
            this.clientLookupInProgress.delete(phone);
        }
    }
    
    /**
     * Enriquecer um chat com dados do cliente
     * Isso transforma um chat bruto em um chat "inteligente"
     */
    async enrichChat(rawChat) {
        const chatKey = createChatKey(rawChat.remoteJid || rawChat.id);
        
        // Se já foi enriquecido e está em cache, retornar
        if (this.chatCache.has(chatKey)) {
            return this.chatCache.get(chatKey);
        }
        
        const enrichedChat = {
            ...rawChat,
            isGroup: isGroupJid(rawChat.remoteJid || rawChat.id),
            cleanPhone: extractPhoneFromJid(rawChat.remoteJid || rawChat.id),
            client: null,
            displayName: rawChat.pushName || rawChat.name || 'Desconhecido',
            isKnownClient: false,
            clientStatus: null,
        };
        
        // Se não é grupo, tentar encontrar cliente
        if (!enrichedChat.isGroup && enrichedChat.cleanPhone) {
            const client = await this.fetchClientByPhone(enrichedChat.cleanPhone);
            
            if (client) {
                enrichedChat.client = client;
                // Usar nome do CRM em vez do pushName
                enrichedChat.displayName = client.name || rawChat.pushName || rawChat.name || 'Desconhecido';
                enrichedChat.isKnownClient = true;
                enrichedChat.clientStatus = client.status || 'Cliente';
            } else {
                enrichedChat.clientStatus = 'Lead Novo';
            }
        }
        
        // Guardar em cache
        this.chatCache.set(chatKey, enrichedChat);
        
        return enrichedChat;
    }
    
    /**
     * Enriquecer múltiplos chats com controle de concorrência
     * Processa em lotes para não sobrecarregar o navegador
     */
    async enrichChats(rawChats) {
        console.log(`[DataLayer] Enriquecendo ${rawChats.length} chats...`);
        const start = performance.now();
        
        // Configuração de batching - limite de requisições simultâneas
        const BATCH_SIZE = 20; // Máximo de requisições paralelas por vez
        const BATCH_DELAY = 50; // Delay entre lotes (ms)
        
        const enrichedChats = [];
        
        // Processar em lotes
        for (let i = 0; i < rawChats.length; i += BATCH_SIZE) {
            const batch = rawChats.slice(i, i + BATCH_SIZE);
            
            // Processar lote atual em paralelo
            const batchResults = await Promise.all(
                batch.map(chat => this.enrichChat(chat))
            );
            
            enrichedChats.push(...batchResults);
            
            // Log de progresso a cada 10 lotes
            if ((i / BATCH_SIZE) % 10 === 0 && i > 0) {
                console.log(`[DataLayer] Progresso: ${Math.min(i + BATCH_SIZE, rawChats.length)}/${rawChats.length} chats`);
            }
            
            // Pequeno delay entre lotes para não sobrecarregar
            if (i + BATCH_SIZE < rawChats.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
        
        const elapsed = performance.now() - start;
        console.log(`[DataLayer] ✅ Enriquecimento completo em ${elapsed.toFixed(0)}ms`);
        
        return enrichedChats;
    }
    
    /**
     * Buscar perfil completo do cliente (para o painel Anne)
     */
    async fetchClientProfile(phone) {
        try {
            const response = await fetch('/api/client-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            
            if (!response.ok) return null;
            
            return await response.json();
        } catch (error) {
            console.error('[DataLayer] Erro ao buscar perfil:', error);
            return null;
        }
    }
    
    /**
     * Limpar caches (útil ao recarregar)
     */
    clearCache() {
        this.clientCache.clear();
        this.chatCache.clear();
        console.log('[DataLayer] Cache limpo');
    }
}

// Instância global
const dataLayer = new DataLayer();

// ============================================================================
// FORMATO PARA EXIBIÇÃO
// ============================================================================

/**
 * Formatar telefone para exibição
 * @param {string} phone - "62999998888" ou JID completo
 * @returns {string} "+55 (62) 99999-8888"
 */
function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    
    const normalized = normalizePhone(phone);
    
    if (!normalized || normalized.length < 8) {
        // Se for muito curto, retornar como está
        return phone;
    }
    
    if (normalized.length === 11) {
        // Celular: (XX) 9XXXX-XXXX
        return `+55 (${normalized.substring(0, 2)}) ${normalized.substring(2, 7)}-${normalized.substring(7)}`;
    } else if (normalized.length === 10) {
        // Fixo: (XX) XXXX-XXXX
        return `+55 (${normalized.substring(0, 2)}) ${normalized.substring(2, 6)}-${normalized.substring(6)}`;
    } else if (normalized.length === 9) {
        // Celular sem DDD: 9XXXX-XXXX
        return `${normalized.substring(0, 5)}-${normalized.substring(5)}`;
    } else if (normalized.length === 8) {
        // Fixo sem DDD: XXXX-XXXX
        return `${normalized.substring(0, 4)}-${normalized.substring(4)}`;
    }
    
    // Formato desconhecido, retornar com prefixo
    return `+55 ${normalized}`;
}

/**
 * Status visual do cliente
 */
function getClientStatusBadge(status) {
    const badges = {
        'VIP': { text: '👑 VIP', color: 'bg-yellow-100 text-yellow-800' },
        'Recorrente': { text: '🔄 Recorrente', color: 'bg-blue-100 text-blue-800' },
        'Cliente': { text: '✓ Cliente', color: 'bg-green-100 text-green-800' },
        'Lead Novo': { text: '✨ Lead Novo', color: 'bg-gray-100 text-gray-800' },
    };
    return badges[status] || badges['Lead Novo'];
}

// Exportar para uso global
window.normalizePhone = normalizePhone;
window.phonesMatch = phonesMatch;
window.phoneVariations = phoneVariations;
window.extractPhoneFromJid = extractPhoneFromJid;
window.isGroupJid = isGroupJid;
window.createChatKey = createChatKey;
window.dataLayer = dataLayer;
window.formatPhoneForDisplay = formatPhoneForDisplay;
window.getClientStatusBadge = getClientStatusBadge;
