const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Headers CORS para permitir que seu CRM (rodando no navegador) acesse esta função
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // Responde a requisições OPTIONS (preflight) que o navegador envia antes do GET
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Pega a chave de API secreta das variáveis de ambiente do Netlify
  const IDERIS_API_KEY = process.env.IDERIS_API_KEY;
  
  // Se a chave não estiver configurada no Netlify, retorna um erro claro
  if (!IDERIS_API_KEY) {
    console.error("[ERRO] Variável de ambiente IDERIS_API_KEY não configurada.");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Variável de ambiente IDERIS_API_KEY não configurada no servidor." })
    };
  }

  // Endpoint da API da Ideris para buscar os pedidos
  const API_ENDPOINT = 'https://api.ideris.com.br/v1/Pedido';

  console.log(`[INFO] Fazendo requisição para: ${API_ENDPOINT}`);

  try {
    const response = await fetch(API_ENDPOINT, {
        method: 'GET',
        headers: {
            // A API da Ideris espera a chave diretamente, sem o prefixo "Bearer"
            'Authorization': IDERIS_API_KEY,
            'Content-Type': 'application/json'
        }
    });

    const responseBody = await response.text();

    // Se o token for inválido, a Ideris retorna 401
    if (response.status === 401) {
      console.error("[ERRO] Erro de autenticação (401). Verifique a IDERIS_API_KEY no Netlify.");
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Token de autorização da Ideris é inválido ou expirou." })
      };
    }
    
    // Se ocorrer outro erro na API, retorna a mensagem de erro
    if (!response.ok) {
      console.error(`[ERRO] Erro da API Ideris. Status: ${response.status}, Body: ${responseBody}`);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Erro retornado pela API da Ideris: ${responseBody}` })
      };
    }
    
    // Se tudo der certo, retorna os dados dos pedidos
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: responseBody
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

