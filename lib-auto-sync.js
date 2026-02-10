// ============================================================================
// AUTO-SYNC: Sincronização automática com Supabase
// Carrega dados da nuvem ao abrir e salva periodicamente
// ============================================================================

(function() {
    'use strict';

    const SYNC_ENDPOINT = '/api/supabase-sync';
    const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutos
    const SYNC_FLAG_KEY = '_crm_last_cloud_load';

    // Verifica se já sincronizou nesta sessão (evita reload duplicado)
    function wasLoadedThisSession() {
        try {
            const flag = sessionStorage.getItem(SYNC_FLAG_KEY);
            if (!flag) return false;
            const elapsed = Date.now() - parseInt(flag);
            return elapsed < 60000; // menos de 1 minuto atrás
        } catch { return false; }
    }

    function markSessionLoaded() {
        try { sessionStorage.setItem(SYNC_FLAG_KEY, Date.now().toString()); } catch {}
    }

    // Carrega todos os dados do Supabase → localStorage
    async function loadFromCloud() {
        try {
            const res = await fetch(SYNC_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'loadAll' })
            });
            if (!res.ok) {
                console.log('[AutoSync] Supabase não disponível, usando dados locais');
                return false;
            }
            const result = await res.json();
            if (result.error) {
                console.log('[AutoSync] Supabase não configurado:', result.hint || result.error);
                return false;
            }

            let loaded = 0;

            // --- CRM Core ---
            if (result.clients?.length > 0) {
                const clients = result.clients.map(c => ({
                    id: c.id, name: c.name, email: c.email, phone: c.phone,
                    // Aliases FacilZap — garante que findClientByPhone encontre o cliente
                    nome: c.name, telefone: c.phone, celular: c.phone, whatsapp: c.phone,
                    birthday: c.birthday, cpf: c.cpf, address: c.address,
                    address_number: c.address_number, address_complement: c.address_complement,
                    address_neighborhood: c.address_neighborhood, city: c.city, state: c.state,
                    zip_code: c.zip_code, origin: c.origin,
                    lastPurchaseDate: c.last_purchase_date, totalSpent: c.total_spent,
                    orderCount: c.order_count, products: c.products || [],
                    orderIds: c.order_ids || [], tags: c.tags || []
                }));
                localStorage.setItem('crm_clients', JSON.stringify(clients));
                loaded++;
            }

            if (result.products?.length > 0) {
                const products = result.products.map(p => ({
                    id: p.id, codigo: p.codigo, name: p.name, description: p.description,
                    sku: p.sku, price: p.price, stock: p.stock, isActive: p.is_active,
                    managesStock: p.manages_stock, image: p.image, images: p.images || [],
                    barcode: p.barcode, variacoes: p.variacoes || [], hasVariacoes: p.has_variacoes
                }));
                localStorage.setItem('crm_products', JSON.stringify(products));
                loaded++;
            }

            if (result.orders?.length > 0) {
                const orders = result.orders.map(o => ({
                    id: o.id, codigo: o.codigo, data: o.data, clientId: o.client_id,
                    clientName: o.client_name, clientPhone: o.client_phone,
                    total: o.total, status: o.status, products: o.products || [], origin: o.origin
                }));
                localStorage.setItem('crm_orders', JSON.stringify(orders));
                loaded++;
            }

            if (result.coupons?.length > 0) {
                localStorage.setItem('crm_coupons', JSON.stringify(result.coupons));
                loaded++;
            }

            if (result.campaigns?.length > 0) {
                localStorage.setItem('crm_campaigns', JSON.stringify(result.campaigns));
                loaded++;
            }

            if (result.settings) {
                const current = JSON.parse(localStorage.getItem('crm_settings') || '{}');
                localStorage.setItem('crm_settings', JSON.stringify({
                    activeDays: result.settings.active_days || current.activeDays || 30,
                    riskDays: result.settings.risk_days || current.riskDays || 60,
                    openaiApiKey: result.settings.openai_api_key || current.openaiApiKey || ''
                }));
                loaded++;
            }

            // --- Atendimento ---
            if (result.tags?.length > 0) {
                localStorage.setItem('crm_tags', JSON.stringify(result.tags));
                loaded++;
            }

            if (result.chat_tags?.length > 0) {
                const obj = {};
                result.chat_tags.forEach(r => {
                    if (!obj[r.chat_id]) obj[r.chat_id] = [];
                    obj[r.chat_id].push(r.tag_id);
                });
                localStorage.setItem('crm_chat_tags', JSON.stringify(obj));
                loaded++;
            }

            if (result.quick_replies?.length > 0) {
                localStorage.setItem('crm_quick_replies', JSON.stringify(result.quick_replies));
                loaded++;
            }

            if (result.client_notes?.length > 0) {
                const obj = {};
                result.client_notes.forEach(r => { obj[r.id] = { text: r.text || '', history: r.history || [] }; });
                localStorage.setItem('crm_client_notes', JSON.stringify(obj));
                loaded++;
            }

            if (result.snoozed?.length > 0) {
                const obj = {};
                result.snoozed.forEach(r => { obj[r.chat_id] = r.wake_at; });
                localStorage.setItem('crm_snoozed', JSON.stringify(obj));
                loaded++;
            }

            if (result.scheduled?.length > 0) {
                localStorage.setItem('crm_scheduled', JSON.stringify(result.scheduled));
                loaded++;
            }

            if (result.ai_tags?.length > 0) {
                const obj = {};
                result.ai_tags.forEach(r => { obj[r.client_id] = r.tags || {}; });
                localStorage.setItem('crm_ai_tags', JSON.stringify(obj));
                loaded++;
            }

            if (result.coupon_assignments?.length > 0) {
                localStorage.setItem('crm_coupon_assignments', JSON.stringify(result.coupon_assignments));
                loaded++;
            }

            console.log(`[AutoSync] ✅ ${loaded} categorias carregadas do Supabase`);
            markSessionLoaded();
            return loaded > 0;
        } catch (err) {
            console.log('[AutoSync] Erro ao carregar da nuvem:', err.message);
            return false;
        }
    }

    // Salva todos os dados do localStorage → Supabase (background)
    async function saveToCloud() {
        try {
            // Usar SupabaseSync.saveAll() se disponível (script.js carregado)
            if (window.SupabaseSync && typeof window.SupabaseSync.saveAll === 'function') {
                await window.SupabaseSync.saveAll();
                console.log('[AutoSync] 💾 Dados salvos na nuvem (via SupabaseSync)');
                return true;
            }
            console.log('[AutoSync] SupabaseSync não disponível, pulando save');
            return false;
        } catch (err) {
            console.log('[AutoSync] Erro ao salvar na nuvem:', err.message);
            return false;
        }
    }

    // Auto-load ao abrir a página
    if (!wasLoadedThisSession()) {
        // Carregar dados do Supabase antes de tudo
        loadFromCloud().then(loaded => {
            if (loaded) {
                // Disparar evento para que os componentes atualizem
                window.dispatchEvent(new CustomEvent('crm-cloud-loaded'));
            }
        });
    }

    // Auto-save periódico (5 min)
    setInterval(() => {
        saveToCloud();
    }, AUTO_SAVE_INTERVAL);

    // Salvar ao sair da página
    window.addEventListener('beforeunload', () => {
        // Usar sendBeacon para salvar sem bloquear
        try {
            const payload = JSON.stringify({ action: 'ping' }); // Lightweight ping
            navigator.sendBeacon(SYNC_ENDPOINT, new Blob([payload], { type: 'application/json' }));
        } catch {}
        // Tentar save síncrono rápido
        saveToCloud();
    });

    // Expor para uso manual
    window.CRMAutoSync = {
        loadFromCloud,
        saveToCloud,
        forceSync: async () => {
            await saveToCloud();
            await loadFromCloud();
            window.dispatchEvent(new CustomEvent('crm-cloud-loaded'));
        }
    };

    console.log('[AutoSync] Módulo inicializado — sync automático ativo');
})();
