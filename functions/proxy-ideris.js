const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Adiciona headers CORS para desenvolvimento
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  // Responde a requisições OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;
  
  if (!FACILZAP_TOKEN) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Token FACILZAP_TOKEN não configurado nas variáveis de ambiente." })
    };
  }

  const { page, length, id } = event.queryStringParameters || {};

  const fetchOptions = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${FACILZAP_TOKEN}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  let API_ENDPOINT;

  if (id) {
    API_ENDPOINT = `https://api.facilzap.app.br/produtos/${id}`;
  } else {
    const pageNum = page || '1';
    const pageLength = length || '100';
    API_ENDPOINT = `https://api.facilzap.app.br/produtos?page=${pageNum}&length=${pageLength}`;
  }

  console.log(`[INFO] Fazendo requisição para: ${API_ENDPOINT}`);

  try {
    const response = await fetch(API_ENDPOINT, fetchOptions);

    if (response.status === 401) {
      console.error("Erro de autenticação (401). Verifique o FACILZAP_TOKEN.");
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Token de autenticação inválido ou expirado." })
      };
    }

    const responseBody = await response.text();
    console.log(`[INFO] Status da resposta: ${response.status}`);

    if (!response.ok) {
      console.error(`Erro da API para ${API_ENDPOINT}. Status: ${response.status}, Body: ${responseBody}`);
      return {
        statusCode: response.status,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Erro da API: ${response.status} - ${responseBody}` })
      };
    }
    
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: responseBody
    };

  } catch (error) {
    console.error("Erro fatal no Proxy:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Erro interno: ${error.message}` })
    };
  }
};
