const fetch = require('node-fetch');

// Função auxiliar para buscar todas as páginas de um determinado endpoint
async function fetchAllPages(endpoint, token) {
  let allData = [];
  let page = 1;
  let hasMore = true;

  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const dataInicial = tenYearsAgo.toISOString().split('T')[0];

  while (hasMore) {
    // Adiciona parâmetros para buscar dados históricos e incluir detalhes extras
    const url = `${endpoint}?page=${page}&length=100&data_inicial=${dataInicial}&incluir_produtos=1`;
    console.log(`[INFO] A procurar ${endpoint}, página ${page}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
        if (response.status === 401) throw new Error("401 - Token de autorização da FacilZap inválido.");
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
    console.log("[INFO] A iniciar busca paralela de clientes, pedidos e produtos.");

    // Busca todos os dados em paralelo para otimizar o tempo
    const [clients, orders, products] = await Promise.all([
      fetchAllPages('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN),
      fetchAllPages('https://api.facilzap.app.br/pedidos', FACILZAP_TOKEN),
      fetchAllPages('https://api.facilzap.app.br/produtos', FACILZAP_TOKEN)
    ]);
    
    console.log(`[INFO] Busca finalizada. ${clients.length} clientes, ${orders.length} pedidos e ${products.length} produtos encontrados.`);
    
    // --- INÍCIO DO CÓDIGO DE DEPURAÇÃO ---
    // Procura o primeiro pedido que tenha qualquer campo que pareça uma lista de produtos
    const firstOrderWithProducts = orders.find(order => 
        (order.produtos && order.produtos.length > 0) ||
        (order.itens && order.itens.length > 0) ||
        (order.ads_campanha && order.ads_campanha.produtos && order.ads_campanha.produtos.length > 0)
    );

    if (firstOrderWithProducts) {
        console.log('[DEBUG] Estrutura do primeiro PEDIDO COM PRODUTOS:', JSON.stringify(firstOrderWithProducts, null, 2));
    } else if (orders.length > 0) {
        console.log('[DEBUG] Nenhum pedido encontrado com uma lista de produtos nos campos esperados. Estrutura do primeiro pedido recebido:', JSON.stringify(orders[0], null, 2));
    }
    // --- FIM DO CÓDIGO DE DEPURAÇÃO ---

    // Retorna um objeto com as três listas de dados
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients, orders, products })
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
