const fetch = require('node-fetch');

// Buscar uma página específica
async function fetchPage(endpoint, token, page) {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const dataInicial = oneYearAgo.toISOString().split('T')[0];
  
  const url = `${endpoint}?page=${page}&length=100&data_inicial=${dataInicial}&incluir_produtos=1`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("401 - Token inválido");
    return []; // Retorna vazio em caso de erro
  }
  
  const data = await response.json();
  return data.data || [];
}

// Buscar todas as páginas em paralelo (até um limite)
async function fetchAllParallel(endpoint, token, maxPages = 20) {
  // Buscar todas as páginas em paralelo de uma vez
  const pagePromises = [];
  for (let p = 1; p <= maxPages; p++) {
    pagePromises.push(fetchPage(endpoint, token, p));
  }
  
  const results = await Promise.all(pagePromises);
  let allData = [];
  
  for (const pageData of results) {
    if (pageData.length > 0) {
      allData = allData.concat(pageData);
    }
  }
  
  return allData;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;
  
  if (!FACILZAP_TOKEN) {
    console.error("[ERRO] Variável de ambiente FACILZAP_TOKEN não configurada.");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "FACILZAP_TOKEN não configurado no servidor." }) };
  }
  
  try {
    console.log("[INFO] Buscando dados em paralelo...");
    
    // Buscar tudo em paralelo com limite de páginas para caber no timeout
    const [clients, orders, products] = await Promise.all([
      fetchAllParallel('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN, 15),
      fetchAllParallel('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN, 20),
      fetchAllParallel('https://api.facilzap.app.br/produtos', FACILZAP_TOKEN, 5)
    ]);
    
    console.log(`[INFO] Resultado: ${clients.length} clientes, ${orders.length} pedidos, ${products.length} produtos`);
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients, orders, products })
    };

  } catch (error) {
    console.error("[ERRO]", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

