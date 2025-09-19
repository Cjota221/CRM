const fetch = require('node-fetch');

// Esta função serverless atua como nosso backend seguro.
exports.handler = async function(event, context) {
    const IDERIS_API_URL = 'https://api.ideris.com.br/v1/Pedido';
    
    // PONTO-CHAVE: A chave de API é lida DIRETAMENTE do ambiente seguro do Netlify.
    // Ela nunca vem do navegador, garantindo que o token permaneça secreto.
    const API_KEY = process.env.IDERIS_API_KEY;

    // Linha de depuração para verificar a chave nos logs do Netlify
    if (API_KEY) {
        console.log(`Verificando API Key. Início: ${API_KEY.substring(0, 5)}, Final: ${API_KEY.substring(API_KEY.length - 5)}`);
    }

    // Validação #1: O token está ausente no servidor?
    if (!API_KEY) {
        console.error("ERRO: A variável de ambiente IDERIS_API_KEY não foi encontrada.");
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "A variável de ambiente IDERIS_API_KEY não está configurada no Netlify." })
        };
    }

    try {
        // Validação #2: O proxy está repassando a autenticação corretamente?
        // Sim, esta função É o proxy. Sua principal responsabilidade é criar o cabeçalho
        // de autenticação e adicioná-lo à chamada para a API da Ideris.
        const response = await fetch(IDERIS_API_URL, {
            method: 'GET',
            headers: {
                // Validação #3: O cabeçalho está bem formado?
                // Sim. A API da Ideris espera a chave diretamente no cabeçalho 'Authorization',
                // sem o prefixo "Bearer ". A formatação está correta para esta API.
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        // Validação #4: O token é inválido ou expirado?
        // Se a resposta da Ideris não for bem-sucedida (ex: erro 401),
        // significa que o TOKEN em si (o valor em IDERIS_API_KEY) está incorreto.
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro recebido da API Ideris:', errorText);
            return {
                statusCode: response.status,
                body: JSON.stringify({ message: `Erro da API Ideris: ${errorText}` })
            };
        }

        // Se a autenticação for bem-sucedida, a resposta é enviada para o CRM
        const data = await response.json();
        
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Erro interno no proxy: ", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Ocorreu um erro interno no servidor proxy.", error: error.message })
        };
    }
};

