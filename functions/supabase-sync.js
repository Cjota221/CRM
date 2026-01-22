const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY não configurada' }) 
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { action, table, data, id } = JSON.parse(event.body || '{}');
    
    console.log(`[Supabase] Action: ${action}, Table: ${table}`);

    switch (action) {
      // ========== CRUD GENÉRICO ==========
      case 'getAll': {
        const { data: rows, error } = await supabase
          .from(table)
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ data: rows }) };
      }

      case 'getById': {
        const { data: row, error } = await supabase
          .from(table)
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ data: row }) };
      }

      case 'upsert': {
        const { data: result, error } = await supabase
          .from(table)
          .upsert(data, { onConflict: 'id' })
          .select();
        
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ data: result }) };
      }

      case 'insert': {
        const { data: result, error } = await supabase
          .from(table)
          .insert(data)
          .select();
        
        if (error) throw error;
        return { statusCode: 201, headers, body: JSON.stringify({ data: result }) };
      }

      case 'update': {
        const { data: result, error } = await supabase
          .from(table)
          .update(data)
          .eq('id', id)
          .select();
        
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ data: result }) };
      }

      case 'delete': {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      // ========== SYNC COMPLETO ==========
      case 'syncAll': {
        // Recebe todos os dados e faz upsert em massa
        const { clients, products, orders, coupons, campaigns, settings } = data;
        const results = {};

        if (clients?.length > 0) {
          const { error } = await supabase.from('clients').upsert(clients, { onConflict: 'id' });
          if (error) console.error('Erro clients:', error);
          results.clients = clients.length;
        }

        if (products?.length > 0) {
          const { error } = await supabase.from('products').upsert(products, { onConflict: 'id' });
          if (error) console.error('Erro products:', error);
          results.products = products.length;
        }

        if (orders?.length > 0) {
          const { error } = await supabase.from('orders').upsert(orders, { onConflict: 'id' });
          if (error) console.error('Erro orders:', error);
          results.orders = orders.length;
        }

        if (coupons?.length > 0) {
          const { error } = await supabase.from('coupons').upsert(coupons, { onConflict: 'id' });
          if (error) console.error('Erro coupons:', error);
          results.coupons = coupons.length;
        }

        if (campaigns?.length > 0) {
          const { error } = await supabase.from('campaigns').upsert(campaigns, { onConflict: 'id' });
          if (error) console.error('Erro campaigns:', error);
          results.campaigns = campaigns.length;
        }

        if (settings) {
          const { error } = await supabase.from('settings').upsert({ id: 'main', ...settings }, { onConflict: 'id' });
          if (error) console.error('Erro settings:', error);
          results.settings = true;
        }

        return { 
          statusCode: 200, 
          headers, 
          body: JSON.stringify({ success: true, synced: results }) 
        };
      }

      // ========== CARREGAR TUDO ==========
      case 'loadAll': {
        const [clientsRes, productsRes, ordersRes, couponsRes, campaignsRes, settingsRes] = await Promise.all([
          supabase.from('clients').select('*'),
          supabase.from('products').select('*'),
          supabase.from('orders').select('*'),
          supabase.from('coupons').select('*'),
          supabase.from('campaigns').select('*'),
          supabase.from('settings').select('*').eq('id', 'main').single()
        ]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            clients: clientsRes.data || [],
            products: productsRes.data || [],
            orders: ordersRes.data || [],
            coupons: couponsRes.data || [],
            campaigns: campaignsRes.data || [],
            settings: settingsRes.data || null
          })
        };
      }

      default:
        return { 
          statusCode: 400, 
          headers, 
          body: JSON.stringify({ error: `Ação desconhecida: ${action}` }) 
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
