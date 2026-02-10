const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Helper: upsert seguro — ignora erro se tabela não existir
async function safeUpsert(supabase, table, rows, conflict = 'id') {
  try {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflict });
    if (error) {
      console.warn(`[Supabase] upsert ${table}:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[Supabase] upsert ${table} falhou:`, e.message);
    return false;
  }
}

// Helper: select seguro — retorna [] se tabela não existir
async function safeSelect(supabase, table, options = {}) {
  try {
    let query = supabase.from(table).select('*');
    if (options.eq) query = query.eq(options.eq[0], options.eq[1]);
    if (options.single) query = query.single();
    if (options.order) query = query.order(options.order, { ascending: false });
    const { data, error } = await query;
    if (error) {
      console.warn(`[Supabase] select ${table}:`, error.message);
      return options.single ? null : [];
    }
    return data;
  } catch (e) {
    return options.single ? null : [];
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY não configurada', hint: 'Configure nas variáveis de ambiente do Netlify' }) 
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, table, data, id } = body;
    
    console.log(`[Supabase] Action: ${action || '(vazio)'}, Table: ${table || '-'}`);

    // ========== PING / KEEP-ALIVE ==========
    if (!action || action === 'ping') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ts: Date.now() }) };
    }

    switch (action) {
      // ========== CRUD GENÉRICO ==========
      case 'getAll': {
        const rows = await safeSelect(supabase, table, { order: 'created_at' });
        return { statusCode: 200, headers, body: JSON.stringify({ data: rows }) };
      }

      case 'getById': {
        const row = await safeSelect(supabase, table, { eq: ['id', id], single: true });
        return { statusCode: 200, headers, body: JSON.stringify({ data: row }) };
      }

      case 'upsert': {
        await safeUpsert(supabase, table, data);
        return { statusCode: 200, headers, body: JSON.stringify({ data }) };
      }

      case 'insert': {
        const { data: result, error } = await supabase.from(table).insert(data).select();
        if (error) throw error;
        return { statusCode: 201, headers, body: JSON.stringify({ data: result }) };
      }

      case 'update': {
        const { data: result, error } = await supabase.from(table).update(data).eq('id', id).select();
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ data: result }) };
      }

      case 'delete': {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      // ========== SYNC COMPLETO ==========
      case 'syncAll': {
        const results = {};

        // --- CRM Core ---
        if (data.clients?.length > 0) {
          if (await safeUpsert(supabase, 'clients', data.clients)) results.clients = data.clients.length;
        }
        if (data.products?.length > 0) {
          if (await safeUpsert(supabase, 'products', data.products)) results.products = data.products.length;
        }
        if (data.orders?.length > 0) {
          if (await safeUpsert(supabase, 'orders', data.orders)) results.orders = data.orders.length;
        }
        if (data.coupons?.length > 0) {
          if (await safeUpsert(supabase, 'coupons', data.coupons)) results.coupons = data.coupons.length;
        }
        if (data.campaigns?.length > 0) {
          if (await safeUpsert(supabase, 'campaigns', data.campaigns)) results.campaigns = data.campaigns.length;
        }
        if (data.settings) {
          if (await safeUpsert(supabase, 'settings', { id: 'main', ...data.settings })) results.settings = true;
        }

        // --- Atendimento ---
        if (data.tags?.length > 0) {
          if (await safeUpsert(supabase, 'tags', data.tags)) results.tags = data.tags.length;
        }
        if (data.chat_tags?.length > 0) {
          if (await safeUpsert(supabase, 'chat_tags', data.chat_tags, 'chat_id,tag_id')) results.chat_tags = data.chat_tags.length;
        }
        if (data.quick_replies?.length > 0) {
          if (await safeUpsert(supabase, 'quick_replies', data.quick_replies)) results.quick_replies = data.quick_replies.length;
        }
        if (data.client_notes?.length > 0) {
          if (await safeUpsert(supabase, 'client_notes', data.client_notes)) results.client_notes = data.client_notes.length;
        }
        if (data.snoozed?.length > 0) {
          if (await safeUpsert(supabase, 'snoozed', data.snoozed, 'chat_id')) results.snoozed = data.snoozed.length;
        }
        if (data.scheduled?.length > 0) {
          if (await safeUpsert(supabase, 'scheduled', data.scheduled)) results.scheduled = data.scheduled.length;
        }
        if (data.ai_tags?.length > 0) {
          if (await safeUpsert(supabase, 'ai_tags', data.ai_tags, 'client_id')) results.ai_tags = data.ai_tags.length;
        }
        if (data.coupon_assignments?.length > 0) {
          if (await safeUpsert(supabase, 'coupon_assignments', data.coupon_assignments)) results.coupon_assignments = data.coupon_assignments.length;
        }

        return { 
          statusCode: 200, 
          headers, 
          body: JSON.stringify({ success: true, synced: results }) 
        };
      }

      // ========== CARREGAR TUDO ==========
      case 'loadAll': {
        const [clients, products, orders, coupons, campaigns, settings,
               tags, chat_tags, quick_replies, client_notes, snoozed, scheduled, ai_tags, coupon_assignments
        ] = await Promise.all([
          // CRM Core
          safeSelect(supabase, 'clients'),
          safeSelect(supabase, 'products'),
          safeSelect(supabase, 'orders'),
          safeSelect(supabase, 'coupons'),
          safeSelect(supabase, 'campaigns'),
          safeSelect(supabase, 'settings', { eq: ['id', 'main'], single: true }),
          // Atendimento
          safeSelect(supabase, 'tags'),
          safeSelect(supabase, 'chat_tags'),
          safeSelect(supabase, 'quick_replies'),
          safeSelect(supabase, 'client_notes'),
          safeSelect(supabase, 'snoozed'),
          safeSelect(supabase, 'scheduled'),
          safeSelect(supabase, 'ai_tags'),
          safeSelect(supabase, 'coupon_assignments')
        ]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            clients,
            products,
            orders,
            coupons,
            campaigns,
            settings,
            tags,
            chat_tags,
            quick_replies,
            client_notes,
            snoozed,
            scheduled,
            ai_tags,
            coupon_assignments
          })
        };
      }

      default:
        return { 
          statusCode: 200, 
          headers, 
          body: JSON.stringify({ error: `Ação desconhecida: ${action}`, hint: 'Ações: getAll, getById, upsert, insert, update, delete, syncAll, loadAll, ping' }) 
        };
    }

  } catch (error) {
    console.error('[Supabase Error]', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
