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
    
    // Calcular datas para filtro de pedidos (1 ano para reduzir tamanho)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dataInicial = oneYearAgo.toISOString().split('T')[0];
    const dataFinal = new Date().toISOString().split('T')[0];
    // Removido incluir_produtos=1 para reduzir tamanho da resposta
    const pedidosParams = `&filtros[data_inicial]=${dataInicial}&filtros[data_final]=${dataFinal}`;
    
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
    
    // Simplificar dados para reduzir tamanho da resposta (limite Netlify: 6MB)
    const clients = clientsRaw.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      endereco: c.endereco,
      bairro: c.bairro,
      cidade: c.cidade,
      estado: c.estado,
      created_at: c.created_at
    }));
    
    const orders = ordersRaw.map(o => ({
      id: o.id,
      cliente_id: o.cliente_id,
      cliente: o.cliente ? { id: o.cliente.id, nome: o.cliente.nome } : null,
      data: o.data,
      status: o.status,
      total: o.total,
      forma_pagamento: o.forma_pagamento,
      itens: o.itens ? o.itens.map(i => ({
        produto_id: i.produto_id,
        nome: i.nome || i.produto?.nome,
        quantidade: i.quantidade,
        valor: i.valor
      })) : []
    }));
    
    const products = productsRaw.map(p => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      categoria: p.categoria,
      ativo: p.ativo
    }));
    
    const elapsed = Date.now() - startTime;
    
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

