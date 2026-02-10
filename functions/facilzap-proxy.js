const fetch = require('node-fetch');

// Buscar uma página específica
async function fetchPage(endpoint, token, page, extraParams = '') {
  const url = `${endpoint}?page=${page}&length=100${extraParams}`;
  console.log(`[DEBUG] Buscando: ${url.substring(0, 80)}...`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[DEBUG] ${endpoint} página ${page} - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[ERROR] ${endpoint} página ${page} falhou: ${response.status} - ${errorText.substring(0, 200)}`);
      if (response.status === 401) throw new Error("401 - Token inválido");
      return [];
    }
    
    const data = await response.json();
    const items = data.data || [];
    console.log(`[DEBUG] ${endpoint} página ${page} - Retornou ${items.length} itens`);
    return items;
  } catch (err) {
    console.log(`[ERROR] Exceção em ${endpoint} página ${page}: ${err.message}`);
    return [];
  }
}

// Functions fetchOrderDetails and fetchOrdersDetails removed as they are no longer needed
// fetchAllParallel continues below

// Buscar todas as páginas em paralelo (até um limite)
async function fetchAllParallel(endpoint, token, maxPages = 20, extraParams = '') {
  console.log(`[DEBUG] Iniciando busca paralela de ${endpoint} (${maxPages} páginas)`);
  
  const pagePromises = [];
  for (let p = 1; p <= maxPages; p++) {
    pagePromises.push(fetchPage(endpoint, token, p, extraParams));
  }
  
  const results = await Promise.all(pagePromises);
  let allData = [];
  
  for (let i = 0; i < results.length; i++) {
    if (results[i].length > 0) {
      allData = allData.concat(results[i]);
    }
  }
  
  console.log(`[DEBUG] ${endpoint} - Total coletado: ${allData.length} itens`);
  return allData;
}

exports.handler = async (event) => {
  console.log("[DEBUG] ========== INÍCIO DA FUNÇÃO ==========");
  console.log("[DEBUG] Método:", event.httpMethod);
  console.log("[DEBUG] Path:", event.path);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;
  
  console.log("[DEBUG] Token presente:", !!FACILZAP_TOKEN);
  console.log("[DEBUG] Token (primeiros 10 chars):", FACILZAP_TOKEN ? FACILZAP_TOKEN.substring(0, 10) + '...' : 'VAZIO');
  
  if (!FACILZAP_TOKEN) {
    console.error("[ERRO] FACILZAP_TOKEN não configurado!");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "FACILZAP_TOKEN não configurado." }) };
  }
  
  try {
    const startTime = Date.now();
    
    // Calcular datas para filtro de pedidos (1 ano e 6 meses)
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    const dataInicial = eighteenMonthsAgo.toISOString().split('T')[0];
    const dataFinal = new Date().toISOString().split('T')[0];
    // CORREÇÃO: O parâmetro correto parece ser filtros[incluir_produtos]=1 igual ao server.js local
    const pedidosParams = `&filtros[data_inicial]=${dataInicial}&filtros[data_final]=${dataFinal}&filtros[incluir_produtos]=1`;
    
    console.log("[DEBUG] Data inicial:", dataInicial);
    console.log("[DEBUG] Data final:", dataFinal);
    console.log("[DEBUG] Params pedidos:", pedidosParams);
    
    // Buscar tudo em paralelo
    console.log("[DEBUG] Iniciando Promise.all para buscar dados...");
    
    const [clientsRaw, ordersRaw, productsRaw] = await Promise.all([
      fetchAllParallel('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN, 15, ''),
      fetchAllParallel('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN, 20, pedidosParams),
      fetchAllParallel('https://api.facilzap.app.br/produtos', FACILZAP_TOKEN, 5, '')
    ]);
    
    // Com o parâmetro correto (filtros[incluir_produtos]=1), os itens já vêm na lista principal
    // Não é necessário buscar detalhes individualmente

    
    // Simplificar dados para reduzir tamanho da resposta (limite Netlify: 6MB)
    // MANTENDO TODOS OS CAMPOS IMPORTANTES
    const clients = clientsRaw.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone || c.whatsapp || c.celular || '',
      whatsapp: c.whatsapp || '',
      celular: c.celular || '',
      email: c.email || '',
      cpf_cnpj: c.cpf_cnpj || c.cpf || c.cnpj || '',
      data_nascimento: c.data_nascimento || c.nascimento || '',
      endereco: c.endereco || '',
      bairro: c.bairro || '',
      cidade: c.cidade || '',
      estado: c.estado || c.uf || '',
      cep: c.cep || '',
      origem: c.origem || '',
      ultima_compra: c.ultima_compra || '',
      created_at: c.created_at
    }));
    
    const orders = ordersRaw.map(o => {
      // Itens devem vir agora diretamente do objeto, graças ao parâmetro correto
      const rawItems = o.itens || o.produtos || o.items || [];
      
      // Determinar se o pedido foi pago/válido
      const statusPago = o.status_pago;
      const statusEntregue = o.status_entregue;
      
      return {
        id: o.id,
        codigo: o.codigo || o.id,
        cliente_id: o.cliente_id,
        cliente: o.cliente ? { 
          id: o.cliente.id, 
          nome: o.cliente.nome,
          telefone: o.cliente.telefone || o.cliente.whatsapp || o.cliente.celular || '',
          email: o.cliente.email || '',
          cpf_cnpj: o.cliente.cpf_cnpj || o.cliente.cpf || ''
        } : null,
        data: o.data || o.created_at,
        status: o.status || o.status_pedido || '',
        status_pedido: o.status_pedido || o.status || '',
        status_pago: statusPago,           // NOVO: flag de pagamento
        status_entregue: statusEntregue,   // NOVO: flag de entrega
        total: o.total || o.valor_total || 0,
        forma_pagamento: o.forma_pagamento || '',
        origem: o.origem || '',
        // Pegar itens do detalhe individual
        itens: rawItems.map(i => ({
          produto_id: i.produto_id || i.id || i.codigo,
          nome: i.nome || i.produto?.nome || i.descricao || 'Produto',
          quantidade: i.quantidade || i.qty || 1,
          valor: i.valor || i.subtotal || i.preco || 0,
          preco_unitario: i.preco_unitario || i.preco || (i.valor / (i.quantidade || 1)) || 0,
          imagem: i.produto?.imagens?.[0]?.url || i.imagem || null
        }))
      };
    });
    
    // Normalizar produtos para formato esperado pelo catálogo
    const products = productsRaw.map(p => ({
      id: p.id,
      codigo: p.codigo || p.id,
      nome: p.nome || p.name || p.titulo || 'Produto sem nome',
      descricao: p.descricao || p.description || '',
      referencia: p.referencia || p.ref || p.sku || '',
      sku: p.sku || p.referencia || '',
      preco: parseFloat(p.preco || p.price || p.valor || 0),
      estoque: p.estoque != null ? p.estoque : (p.stock != null ? p.stock : -1),
      imagem: p.imagem || (p.imagens && p.imagens[0]?.url) || p.image || null,
      imagens: p.imagens || p.images || [],
      link_oficial: p.link_oficial || p.link || p.url || '',
      ativo: p.ativo != null ? p.ativo : (p.is_active != null ? p.is_active : true),
      variacoes: p.variacoes || [],
      barcode: p.barcode || p.codigo_barras || ''
    }));
    
    const elapsed = Date.now() - startTime;
    
    // DEBUG: Verificar estrutura de um pedido
    if (ordersRaw.length > 0) {
      const sampleOrder = ordersRaw[0];
      console.log("[DEBUG] Estrutura do primeiro pedido RAW:");
      console.log("[DEBUG] - Campos disponíveis:", Object.keys(sampleOrder));
      console.log("[DEBUG] - tem 'itens'?", !!sampleOrder.itens, "length:", sampleOrder.itens?.length);
      console.log("[DEBUG] - tem 'produtos'?", !!sampleOrder.produtos, "length:", sampleOrder.produtos?.length);
      console.log("[DEBUG] - tem 'items'?", !!sampleOrder.items, "length:", sampleOrder.items?.length);
      if (sampleOrder.itens && sampleOrder.itens.length > 0) {
        console.log("[DEBUG] - Primeiro item:", JSON.stringify(sampleOrder.itens[0]).substring(0, 500));
      }
    }
    
    console.log("[DEBUG] ========== RESULTADO FINAL ==========");
    console.log(`[DEBUG] Clientes: ${clients.length}`);
    console.log(`[DEBUG] Pedidos: ${orders.length}`);
    console.log(`[DEBUG] Produtos: ${products.length}`);
    console.log(`[DEBUG] Tempo total: ${elapsed}ms`);
    
    // Verificar amostra de pedido
    if (orders.length > 0) {
      console.log("[DEBUG] Primeiro pedido ID:", orders[0].id);
      console.log("[DEBUG] Primeiro pedido data:", orders[0].data);
    } else {
      console.log("[DEBUG] NENHUM PEDIDO RETORNADO!");
    }
    
    const responseBody = JSON.stringify({ clients, orders, products });
    console.log(`[DEBUG] Tamanho da resposta: ${responseBody.length} bytes (limite: 6291556)`);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: responseBody
    };

  } catch (error) {
    console.error("[ERRO FATAL]", error.message);
    console.error("[ERRO STACK]", error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};

