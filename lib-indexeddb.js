// ============================================================================
// INDEXEDDB LAYER — Persistência local de chats e mensagens
// Elimina re-fetch completo na Central de Atendimento
// ============================================================================
// Stores:
//   chats       → { remoteJid (PK), ...enrichedChatData }
//   messages    → { id (PK), remoteJid (index), ...messageData }
//   meta        → { key (PK), value }  — ex: lastSyncTs, version
// ============================================================================

(function () {
    'use strict';

    const DB_NAME = 'crm_central_v1';
    const DB_VERSION = 1;

    let _db = null;       // Referência singleton ao IDBDatabase
    let _dbReady = null;  // Promise que resolve quando DB está pronto

    // ======================== OPEN / UPGRADE ================================

    function openDB() {
        if (_dbReady) return _dbReady;

        _dbReady = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Store: chats — PK = remoteJid
                if (!db.objectStoreNames.contains('chats')) {
                    const chatStore = db.createObjectStore('chats', { keyPath: 'remoteJid' });
                    chatStore.createIndex('lastMsgTs', 'lastMsgTs', { unique: false });
                    chatStore.createIndex('displayName', 'displayName', { unique: false });
                }

                // Store: messages — PK = auto-inc id composto
                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: '_idbKey' });
                    msgStore.createIndex('remoteJid', 'remoteJid', { unique: false });
                    msgStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Store: meta — key-value genérico
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }

                console.log('[IDB] Database criada/atualizada v' + DB_VERSION);
            };

            req.onsuccess = (e) => {
                _db = e.target.result;
                _db.onerror = (ev) => console.warn('[IDB] db error:', ev.target.error);
                console.log('[IDB] ✅ Database aberta');
                resolve(_db);
            };

            req.onerror = (e) => {
                console.error('[IDB] Erro ao abrir:', e.target.error);
                _dbReady = null; // Allow retry
                reject(e.target.error);
            };
        });

        return _dbReady;
    }

    // ======================== HELPERS ========================================

    function getDB() {
        if (_db) return Promise.resolve(_db);
        return openDB();
    }

    /** Gerar _idbKey estável para uma mensagem */
    function msgKey(msg) {
        const id = msg.key?.id || msg.id || '';
        const jid = msg.key?.remoteJid || msg.remoteJid || '';
        const ts = msg.messageTimestamp || 0;
        return `${jid}::${id}::${ts}`;
    }

    /** Extrair timestamp numérico de uma mensagem (segundos → ms) */
    function msgTimestamp(msg) {
        let ts = msg.messageTimestamp;
        if (typeof ts === 'object' && ts !== null) ts = Number(ts.low || ts);
        ts = Number(ts) || 0;
        // Se for em segundos (< 2e10), converter para ms
        if (ts > 0 && ts < 2e10) ts *= 1000;
        return ts;
    }

    // ======================== CHATS ==========================================

    /**
     * Salvar array de chats enriquecidos no IDB.
     * Preserva chats antigos que não estão no array (merge, não replace).
     */
    async function saveChats(chats) {
        if (!chats || chats.length === 0) return;
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chats', 'readwrite');
            const store = tx.objectStore('chats');
            let saved = 0;

            chats.forEach(chat => {
                const jid = chat.remoteJid || chat.id;
                if (!jid) return;

                // Normalizar: garantir campos essenciais
                const record = {
                    ...chat,
                    remoteJid: jid,
                    lastMsgTs: (chat.lastMessage?.messageTimestamp || 0) * 1000 || chat.lastMsgTs || 0,
                    _savedAt: Date.now()
                };

                store.put(record);
                saved++;
            });

            tx.oncomplete = () => {
                console.log(`[IDB] 💾 ${saved} chats salvos`);
                resolve(saved);
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Carregar TODOS os chats do IDB, ordenados por lastMsgTs DESC.
     * @returns {Promise<Array>}
     */
    async function getChats() {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chats', 'readonly');
            const store = tx.objectStore('chats');
            const req = store.getAll();

            req.onsuccess = () => {
                const chats = (req.result || []).sort((a, b) => (b.lastMsgTs || 0) - (a.lastMsgTs || 0));
                resolve(chats);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Obter um chat específico pelo remoteJid.
     */
    async function getChat(remoteJid) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chats', 'readonly');
            const req = tx.objectStore('chats').get(remoteJid);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Retorna o maior lastMsgTs de todos os chats armazenados.
     * Usado para Delta Sync — saber a partir de quando buscar novidades.
     * @returns {Promise<number>} timestamp em ms (0 se vazio)
     */
    async function getNewestChatTimestamp() {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chats', 'readonly');
            const idx = tx.objectStore('chats').index('lastMsgTs');
            const req = idx.openCursor(null, 'prev'); // Maior primeiro
            req.onsuccess = () => {
                const cursor = req.result;
                resolve(cursor ? (cursor.value.lastMsgTs || 0) : 0);
            };
            req.onerror = () => resolve(0);
        });
    }

    /**
     * Contagem rápida de chats.
     */
    async function countChats() {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('chats', 'readonly');
            const req = tx.objectStore('chats').count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
        });
    }

    // ======================== MESSAGES =======================================

    /**
     * Salvar mensagens para um remoteJid.
     * Faz merge: mensagens existentes são atualizadas, novas são adicionadas.
     * @param {string} remoteJid
     * @param {Array} messages
     */
    async function saveMessages(remoteJid, messages) {
        if (!remoteJid || !messages || messages.length === 0) return 0;
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            let saved = 0;

            messages.forEach(msg => {
                const record = {
                    ...msg,
                    _idbKey: msgKey(msg),
                    remoteJid: remoteJid,
                    timestamp: msgTimestamp(msg),
                    _savedAt: Date.now()
                };
                store.put(record);
                saved++;
            });

            tx.oncomplete = () => resolve(saved);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Carregar mensagens de um chat, ordenadas por timestamp ASC.
     * @param {string} remoteJid
     * @returns {Promise<Array>}
     */
    async function getMessages(remoteJid) {
        if (!remoteJid) return [];
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readonly');
            const idx = tx.objectStore('messages').index('remoteJid');
            const req = idx.getAll(remoteJid);

            req.onsuccess = () => {
                const msgs = (req.result || []).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                resolve(msgs);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Retorna o timestamp da mensagem mais recente para um remoteJid.
     * @returns {Promise<number>} timestamp em ms (0 se sem mensagens)
     */
    async function getLatestMessageTimestamp(remoteJid) {
        const msgs = await getMessages(remoteJid);
        if (msgs.length === 0) return 0;
        return msgs[msgs.length - 1].timestamp || 0;
    }

    /**
     * Contagem de mensagens para um chat.
     */
    async function countMessages(remoteJid) {
        if (!remoteJid) return 0;
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('messages', 'readonly');
            const idx = tx.objectStore('messages').index('remoteJid');
            const req = idx.count(remoteJid);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
        });
    }

    // ======================== META ==========================================

    async function getMeta(key) {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get(key);
            req.onsuccess = () => resolve(req.result?.value ?? null);
            req.onerror = () => resolve(null);
        });
    }

    async function setMeta(key, value) {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ key, value, _updatedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // Atalhos frequentes
    async function getLastSyncTimestamp() {
        return (await getMeta('lastSyncTs')) || 0;
    }

    async function setLastSyncTimestamp(ts) {
        return setMeta('lastSyncTs', ts || Date.now());
    }

    // ======================== DELTA SYNC HELPERS =============================

    /**
     * Comparar chats antigos (IDB) com chats novos (API) e retornar quais mudaram.
     * Um chat "mudou" se:
     *   - Não existia no IDB (novo)
     *   - Tem lastMsgTs maior que o armazenado
     *   - Tem nome/status diferente
     * @param {Array} oldChats  - do IDB
     * @param {Array} newChats  - da API
     * @returns {{ changed: Array, unchanged: Array }}
     */
    function diffChats(oldChats, newChats) {
        const oldMap = new Map();
        oldChats.forEach(c => oldMap.set(c.remoteJid, c));

        const changed = [];
        const unchanged = [];

        newChats.forEach(nc => {
            const jid = nc.remoteJid || nc.id;
            const oc = oldMap.get(jid);

            if (!oc) {
                changed.push(nc);
                return;
            }

            const newTs = (nc.lastMessage?.messageTimestamp || 0) * 1000;
            const oldTs = oc.lastMsgTs || 0;

            if (newTs > oldTs) {
                changed.push(nc);
            } else {
                // Manter versão enriquecida do IDB (com displayName, client, etc.)
                unchanged.push(oc);
            }
        });

        return { changed, unchanged };
    }

    // ======================== CLEANUP ========================================

    /**
     * Limpar todo o IndexedDB.
     */
    async function clearAll() {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['chats', 'messages', 'meta'], 'readwrite');
            tx.objectStore('chats').clear();
            tx.objectStore('messages').clear();
            tx.objectStore('meta').clear();
            tx.oncomplete = () => {
                console.log('[IDB] 🗑️ Database limpa');
                resolve();
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Remover mensagens antigas (mais de N dias).
     * @param {number} maxAgeDays
     */
    async function pruneOldMessages(maxAgeDays = 30) {
        const db = await getDB();
        const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            const idx = store.index('timestamp');
            const range = IDBKeyRange.upperBound(cutoff);
            let deleted = 0;

            const cursor = idx.openCursor(range);
            cursor.onsuccess = (e) => {
                const c = e.target.result;
                if (c) {
                    store.delete(c.primaryKey);
                    deleted++;
                    c.continue();
                }
            };

            tx.oncomplete = () => {
                if (deleted > 0) console.log(`[IDB] 🧹 ${deleted} mensagens antigas removidas (>${maxAgeDays}d)`);
                resolve(deleted);
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ======================== EXPORT ========================================

    const ChatDB = {
        // Init
        open: openDB,

        // Chats
        saveChats,
        getChats,
        getChat,
        getNewestChatTimestamp,
        countChats,
        diffChats,

        // Messages
        saveMessages,
        getMessages,
        getLatestMessageTimestamp,
        countMessages,

        // Meta
        getMeta,
        setMeta,
        getLastSyncTimestamp,
        setLastSyncTimestamp,

        // Cleanup
        clearAll,
        pruneOldMessages
    };

    window.ChatDB = ChatDB;

    // Pre-abrir o DB para não bloquear o primeiro uso
    openDB().catch(() => console.warn('[IDB] Não foi possível pré-abrir'));

    console.log('[IDB] Módulo IndexedDB carregado');
})();
