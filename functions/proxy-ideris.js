// Importa o 'node-fetch' para fazer requisições HTTP no ambiente Node.js
const fetch = require('node-fetch');

// Define a URL base da API da Ideris
const API_BASE_URL = 'https://api.ideris.com.br/v1/';

// Handler principal da função serverless, que é executado a cada requisição
exports.handler = async (event, context) => {
  try {
    // Pega a API Key das variáveis de ambiente configuradas no Netlify
    // Isso mantém a chave segura e fora do código do frontend
    const apiKey = process.env.IDERIS_API_KEY;

    // Pega o endpoint específico da API que o frontend quer acessar (ex: "Pedido")
    // Ele é passado como um parâmetro na URL da requisição, ex: /api/proxy-ideris?endpoint=Pedido
    const endpoint = event.queryStringParameters.endpoint;

    // Verifica se o endpoint foi fornecido na requisição
    if (!endpoint) {
      return {
        statusCode: 400, // Bad Request
        body: JSON.stringify({ message: 'O parâmetro "endpoint" é obrigatório.' }),
      };
    }
    
    // Verifica se a API Key foi configurada nas variáveis de ambiente do Netlify
    if (!apiKey) {
      return {
        statusCode: 500, // Internal Server Error
        body: JSON.stringify({ message: 'A variável de ambiente IDERIS_API_KEY não está configurada no Netlify.' }),
      };
    }

    // Monta a URL completa para a API da Ideris
    const apiUrl = `${API_BASE_URL}${endpoint}`;

    // Faz a requisição para a API da Ideris usando 'node-fetch'
    const response = await fetch(apiUrl, {
      method: 'GET', // A API da Ideris usa GET para buscar dados
      headers: {
        'Content-Type': 'application/json',
        // Adiciona a API Key no cabeçalho, conforme a documentação da Ideris
        'Authorization': apiKey,
      },
    });

    // Lê o corpo da resposta da API como JSON
    const data = await response.json();

    // Retorna a resposta da API da Ideris para o frontend
    // com o mesmo status code e corpo que a Ideris retornou
    return {
      statusCode: response.status,
      body: JSON.stringify(data),
    };

  } catch (error) {
    // Em caso de qualquer erro no processo, retorna um status 500
    // e uma mensagem de erro para o frontend
    console.error('Erro no proxy:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro interno no servidor proxy.', error: error.message }),
    };
  }
};

