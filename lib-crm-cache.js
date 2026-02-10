// ============================================================================
// CRM CLIENT CACHE — Stale-While-Revalidate para dados do Mini CRM
// ============================================================================
// Padrão SWR:
//   1. Ao abrir um chat, retorna dados do cache IMEDIATAMENTE (sem spinner)
//   2. Em background, busca dados atualizados no servidor
//   3. Se houve mudança, atualiza o painel silenciosamente
//
// Camadas:
//   - L1: Map em memória (acesso < 1ms)
//   - L2: localStorage (sobrevive refresh/close, acesso ~5ms)
//   - L3: API /client-brain/:phone (fonte da verdade, ~200-500ms)
//
// Chave do cache: normalizePhone(chatId) — sem DDI, sem JID
// TTL fresh:  30 minutos (não precisa revalidar)
// TTL stale:  30min – 24h (serve cacheado, revalida em bg)
// Expirado:   > 24h (busca obrigatório, mostra spinner)
// ============================================================================

(function () {
    'use strict';

    // ======================== CONFIGURAÇÕES ==================================

    const FRESH_TTL    = 30 * 60 * 1000;   // 30 min — dados considerados frescos
    const STALE_TTL    = 24 * 60 * 60 * 1000; // 24h — dados servíveis mas revalidáveis
    const LS_PREFIX    = 'crm_brain_';       // Prefixo no localStorage
    const LS_INDEX_KEY = 'crm_brain__index'; // Lista de phones cacheados (para cleanup)
    const MAX_CACHED   = 200;               // Máximo de clientes no localStorage

    // ======================== MEMÓRIA (L1) ===================================

    /** @type {Map<string, {data: object, ts: number, revalidating: boolean}>} */
    const _mem = new Map();

    // ======================== NORMALIZAÇÃO ===================================

    /**
     * Normaliza qualquer identificador de telefone para chave de cache.
     * Delega para window.normalizePhone (lib-data-layer.js) se disponível,
     * senão faz limpeza básica inline.
     */
    function cacheKey(chatIdOrPhone) {
        if (typeof window.normalizePhone === 'function') {
            return window.normalizePhone(chatIdOrPhone);
        }
        // Fallback: limpeza básica
        let p = String(chatIdOrPhone)
            .replace(/@s\.whatsapp\.net$/i, '')
            .replace(/\D/g, '');
        if (p.startsWith('55') && p.length >= 12) p = p.substring(2);
        return p.slice(-11);
    }

    // ======================== LOCALSTORAGE (L2) ==============================

    function lsGet(phone) {
        try {
            const raw = localStorage.getItem(LS_PREFIX + phone);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    }

    function lsSet(phone, entry) {
        try {
            localStorage.setItem(LS_PREFIX + phone, JSON.stringify(entry));
            // Atualizar índice
            _updateIndex(phone);
        } catch (e) {
            // localStorage cheio — limpar entradas antigas
            if (e.name === 'QuotaExceededError') {
                _evictOldest(10);
                try { localStorage.setItem(LS_PREFIX + phone, JSON.stringify(entry)); } catch {}
            }
        }
    }

    function lsRemove(phone) {
        try { localStorage.removeItem(LS_PREFIX + phone); } catch {}
    }

    /** Mantém um índice dos phones cacheados para eviction */
    function _updateIndex(phone) {
        try {
            const raw = localStorage.getItem(LS_INDEX_KEY);
            let index = raw ? JSON.parse(raw) : [];
            // Remover se já existe (para reordenar por acesso recente)
            index = index.filter(p => p !== phone);
            index.push(phone);
            // Limitar tamanho
            if (index.length > MAX_CACHED) {
                const toRemove = index.splice(0, index.length - MAX_CACHED);
                toRemove.forEach(p => lsRemove(p));
            }
            localStorage.setItem(LS_INDEX_KEY, JSON.stringify(index));
        } catch {}
    }

    function _evictOldest(count) {
        try {
            const raw = localStorage.getItem(LS_INDEX_KEY);
            if (!raw) return;
            let index = JSON.parse(raw);
            const toRemove = index.splice(0, count);
            toRemove.forEach(p => lsRemove(p));
            localStorage.setItem(LS_INDEX_KEY, JSON.stringify(index));
        } catch {}
    }

    // ======================== API PRINCIPAL ===================================

    /**
     * Buscar dados do CRM para um chatId/phone.
     *
     * @param {string} chatIdOrPhone — JID completo ou telefone
     * @returns {{ data: object|null, status: 'fresh'|'stale'|'miss', key: string }}
     *   - data: dados do /client-brain (brainData) ou null se não cacheado
     *   - status: 'fresh' (< 30min), 'stale' (30min - 24h), 'miss' (sem cache)
     *   - key: chave normalizada do cache
     */
    function get(chatIdOrPhone) {
        const key = cacheKey(chatIdOrPhone);
        const now = Date.now();

        // L1: Checar memória
        const mem = _mem.get(key);
        if (mem) {
            const age = now - mem.ts;
            if (age < FRESH_TTL) {
                return { data: mem.data, status: 'fresh', key };
            }
            if (age < STALE_TTL) {
                return { data: mem.data, status: 'stale', key };
            }
            // Expirado — remover da memória
            _mem.delete(key);
        }

        // L2: Checar localStorage
        const ls = lsGet(key);
        if (ls && ls.data && ls.ts) {
            const age = now - ls.ts;
            // Promover para memória
            _mem.set(key, { data: ls.data, ts: ls.ts, revalidating: false });

            if (age < FRESH_TTL) {
                return { data: ls.data, status: 'fresh', key };
            }
            if (age < STALE_TTL) {
                return { data: ls.data, status: 'stale', key };
            }
            // Muito antigo — tratar como miss mas ainda retornamos dados
            return { data: ls.data, status: 'stale', key };
        }

        // L3: Cache miss total
        return { data: null, status: 'miss', key };
    }

    /**
     * Salvar dados do CRM no cache (memória + localStorage).
     *
     * @param {string} chatIdOrPhone — JID ou telefone
     * @param {object} brainData — Resposta completa do /client-brain
     */
    function set(chatIdOrPhone, brainData) {
        const key = cacheKey(chatIdOrPhone);
        const entry = { data: brainData, ts: Date.now(), revalidating: false };

        // L1: Memória
        _mem.set(key, entry);

        // L2: localStorage
        lsSet(key, { data: brainData, ts: entry.ts });

        console.log(`[CRM Cache] 💾 Salvo: ${key} (${brainData.found ? brainData.client?.name : 'lead novo'})`);
    }

    /**
     * Marcar que uma revalidação está em andamento para este phone.
     * Evita múltiplas requisições concorrentes.
     */
    function isRevalidating(chatIdOrPhone) {
        const key = cacheKey(chatIdOrPhone);
        const mem = _mem.get(key);
        return mem?.revalidating || false;
    }

    function setRevalidating(chatIdOrPhone, value) {
        const key = cacheKey(chatIdOrPhone);
        const mem = _mem.get(key);
        if (mem) mem.revalidating = value;
    }

    /**
     * Invalidar um telefone específico do cache.
     */
    function invalidate(chatIdOrPhone) {
        const key = cacheKey(chatIdOrPhone);
        _mem.delete(key);
        lsRemove(key);
        console.log(`[CRM Cache] 🗑️ Invalidado: ${key}`);
    }

    /**
     * Limpar todo o cache.
     */
    function clear() {
        _mem.clear();
        try {
            const raw = localStorage.getItem(LS_INDEX_KEY);
            if (raw) {
                JSON.parse(raw).forEach(p => lsRemove(p));
            }
            localStorage.removeItem(LS_INDEX_KEY);
        } catch {}
        console.log('[CRM Cache] 🗑️ Cache limpo completamente');
    }

    /**
     * Verificar se dois objetos brainData são semanticamente iguais.
     * Compara métricas-chave para decidir se precisa re-renderizar.
     */
    function hasChanged(oldData, newData) {
        if (!oldData || !newData) return true;
        if (oldData.found !== newData.found) return true;

        // Se ambos são "not found", nada mudou
        if (!oldData.found && !newData.found) return false;

        // Comparar métricas-chave
        const om = oldData.metrics || {};
        const nm = newData.metrics || {};
        if (om.totalSpent !== nm.totalSpent) return true;
        if (om.ordersCount !== nm.ordersCount) return true;
        if (om.lastPurchaseDate !== nm.lastPurchaseDate) return true;

        // Comparar status
        if (oldData.status !== newData.status) return true;
        if (oldData.loyaltyTag !== newData.loyaltyTag) return true;

        return false;
    }

    /**
     * Estatísticas do cache para debug.
     */
    function stats() {
        let indexRaw;
        try { indexRaw = localStorage.getItem(LS_INDEX_KEY); } catch {}
        const lsCount = indexRaw ? JSON.parse(indexRaw).length : 0;
        return {
            memory: _mem.size,
            localStorage: lsCount,
            maxCached: MAX_CACHED,
            freshTTL: FRESH_TTL / 60000 + ' min',
            staleTTL: STALE_TTL / 3600000 + ' h'
        };
    }

    // ======================== PRÉ-AQUECIMENTO ================================

    /**
     * Ao carregar a página, promover entradas do localStorage para memória.
     * Isso garante que o primeiro acesso a qualquer chat seja instantâneo.
     */
    function warmup() {
        try {
            const raw = localStorage.getItem(LS_INDEX_KEY);
            if (!raw) return;
            const index = JSON.parse(raw);
            let promoted = 0;
            index.forEach(phone => {
                const ls = lsGet(phone);
                if (ls && ls.data && ls.ts) {
                    _mem.set(phone, { data: ls.data, ts: ls.ts, revalidating: false });
                    promoted++;
                }
            });
            if (promoted > 0) {
                console.log(`[CRM Cache] 🔥 Warmup: ${promoted} clientes promovidos do localStorage para memória`);
            }
        } catch (e) {
            console.warn('[CRM Cache] Warmup falhou:', e);
        }
    }

    // Executar warmup imediatamente
    warmup();

    // ======================== EXPORTAR =======================================

    window.CRMCache = {
        get,
        set,
        invalidate,
        clear,
        hasChanged,
        isRevalidating,
        setRevalidating,
        cacheKey,
        stats,
        warmup,
        // Constantes expostas (para debug)
        FRESH_TTL,
        STALE_TTL
    };

    console.log('[CRM Cache] ✅ Inicializado — SWR pattern ativo');

})();
