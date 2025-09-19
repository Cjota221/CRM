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

    if (!API_KEY) {
        console.error("ERRO: A variável de ambiente IDERIS_API_KEY não foi encontrada.");
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "A variável de ambiente IDERIS_API_KEY não está configurada no Netlify." })
        };
    }

    try {
        const response = await fetch(IDERIS_API_URL, {
            method: 'GET',
            headers: {
                // CORREÇÃO BASEADA NA SUA ANÁLISE:
                // O cabeçalho 'Authorization' é criado aqui, no servidor.
                // A API da Ideris espera a chave diretamente, sem o prefixo "Bearer ".
                // Portanto, a formatação atual está correta para esta API específica.
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        // Se a resposta não for 'ok' (como o erro 401 que estamos recebendo)
        if (!response.ok) {
            // Lemos a mensagem de erro da Ideris ("Invalid authorization token")
            const errorText = await response.text();
            console.error('Erro recebido da API Ideris:', errorText);
            // E a enviamos de volta para o navegador para ser exibida
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

