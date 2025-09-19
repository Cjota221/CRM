const fetch = require('node-fetch');

// Função auxiliar para buscar todas as páginas de um determinado endpoint
async function fetchAllPages(endpoint, token) {
  let allData = [];
  let page = 1;
  let hasMore = true;

  // Define uma data inicial para buscar todos os registros (ex: últimos 10 anos)
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const dataInicial = tenYearsAgo.toISOString().split('T')[0];

  while (hasMore) {
    // Adiciona parâmetros para buscar todos os dados históricos e incluir detalhes
    const url = `${endpoint}?page=${page}&length=100&data_inicial=${dataInicial}&incluir_produtos=1`;
    console.log(`[INFO] Buscando ${endpoint}, página ${page}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
        // Se a autenticação falhar, interrompe imediatamente
        if (response.status === 401) throw new Error("401 - Token de autorização da FacilZap inválido.");
        // Para outros erros, lança uma exceção que será capturada abaixo
        const errorBody = await response.text();
        throw new Error(`Erro da API para ${endpoint} na página ${page}: Status ${response.status} - ${errorBody}`);
    }
    
    const pageData = await response.json();
    const dataOnPage = pageData.data;

    if (dataOnPage && dataOnPage.length > 0) {
      allData = allData.concat(dataOnPage);
      page++;
    } else {
      hasMore = false;
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
    console.log("[INFO] Iniciando busca paralela de clientes e pedidos.");

    // Busca todos os clientes e todos os pedidos em paralelo para otimizar o tempo
    const [clients, orders] = await Promise.all([
      fetchAllPages('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN),
      fetchAllPages('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN)
    ]);
    
    console.log(`[INFO] Busca finalizada. ${clients.length} clientes e ${orders.length} pedidos encontrados.`);
    
    // Log de depuração com a estrutura do primeiro cliente e primeiro pedido
    if (clients.length > 0) console.log('[DEBUG] Estrutura do primeiro CLIENTE:', JSON.stringify(clients[0], null, 2));
    if (orders.length > 0) console.log('[DEBUG] Estrutura do primeiro PEDIDO:', JSON.stringify(orders[0], null, 2));
    
    // Retorna um objeto com as duas listas de dados
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients, orders })
    };

  } catch (error) {
    console.error("[ERRO FATAL] Erro inesperado no proxy:", error.message);
    const statusCode = error.message.startsWith('401') ? 401 : 500;
    return {
      statusCode: statusCode,
      headers,
      body: JSON.stringify({ error: `Erro interno no servidor proxy: ${error.message}` })
    };
  }
};

