const fetch = require('node-fetch');

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
  
  // ATENÇÃO: Adapte este endpoint para o correto da API FacilZap que retorna os PEDIDOS.
  // A API de /produtos não contém dados de clientes. Usaremos um endpoint hipotético /pedidos.
  const BASE_API_ENDPOINT = 'https://api.facilzap.app.br/pedidos';
  let allOrders = [];
  let page = 1;
  let hasMore = true;

  console.log(`[INFO] Iniciando busca de todos os pedidos da FacilZap...`);

  try {
    // Loop para buscar todas as páginas de pedidos
    while (hasMore) {
      const API_ENDPOINT_PAGE = `${BASE_API_ENDPOINT}?page=${page}&length=100`;
      console.log(`[INFO] Buscando página ${page}...`);
      
      const response = await fetch(API_ENDPOINT_PAGE, {
          method: 'GET',
          headers: {
              'Authorization': `Bearer ${FACILZAP_TOKEN}`,
              'Content-Type': 'application/json'
          }
      });

      if (response.status === 401) {
        console.error("[ERRO] Autenticação (401). Verifique a FACILZAP_TOKEN.");
        // Retorna o erro imediatamente para o frontend
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Token de autorização da FacilZap inválido." }) };
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ERRO] API da FacilZap retornou status ${response.status} na página ${page}. Body: ${errorBody}`);
        // Para a busca se uma página der erro
        hasMore = false; 
        // Retorna o erro, mas podemos decidir continuar ou parar
        throw new Error(`Erro da API na página ${page}: ${errorBody}`);
      }
      
      const pageData = await response.json();
      
      // A API da FacilZap retorna um objeto com uma chave "data" que contém o array
      const ordersOnPage = pageData.data;

      if (ordersOnPage && ordersOnPage.length > 0) {
        allOrders = allOrders.concat(ordersOnPage);
        page++;
      } else {
        // Se não houver mais pedidos na página, para o loop
        hasMore = false;
      }
    }
    
    console.log(`[INFO] Busca finalizada. Total de ${allOrders.length} pedidos encontrados.`);
    
    // Retorna a lista completa de todos os pedidos de todas as páginas
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(allOrders) // Retorna o array diretamente
    };

  } catch (error) {
    console.error("[ERRO FATAL] Erro inesperado no proxy:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Erro interno no servidor proxy: ${error.message}` })
    };
  }
};

