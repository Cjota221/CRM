// A função precisa do 'node-fetch' para fazer requisições HTTP no ambiente Node.js do Netlify.
// Certifique-se de adicionar "node-fetch": "^2.6.1" ao seu package.json.
const fetch = require('node-fetch');

// URL base da API da Ideris.
const API_BASE_URL = 'https://api.ideris.com.br/v1/';

// Handler principal da função serverless.
exports.handler = async (event, context) => {
  try {
    // Pega a API Key das variáveis de ambiente configuradas no Netlify.
    // Este é o passo crucial para manter sua chave segura.
    const apiKey = process.env.IDERIS_API_KEY;

    // Pega o endpoint da API que o frontend deseja acessar (ex: "Pedido").
    const endpoint = event.queryStringParameters.endpoint;

    if (!endpoint) {
      return {
        statusCode: 400, // Bad Request
        body: JSON.stringify({ message: 'O parâmetro "endpoint" é obrigatório na URL.' }),
      };
    }
    
    if (!apiKey) {
      return {
        statusCode: 500, // Internal Server Error
        body: JSON.stringify({ message: 'A variável de ambiente IDERIS_API_KEY não foi configurada no painel do Netlify.' }),
      };
    }

    // Monta a URL completa para a API da Ideris.
    const apiUrl = `${API_BASE_URL}${endpoint}`;

    // Faz a requisição para a API da Ideris.
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Adiciona a API Key no cabeçalho, conforme a documentação da Ideris.
        'Authorization': apiKey,
      },
    });

    const data = await response.json();

    // Retorna a resposta da API da Ideris diretamente para o frontend.
    return {
      statusCode: response.status,
      body: JSON.stringify(data),
    };

  } catch (error) {
    // Em caso de erro, retorna uma mensagem clara.
    console.error('Erro na função de proxy:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Ocorreu um erro interno no servidor proxy.', error: error.message }),
    };
  }
};

