const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const IDERIS_API_URL = 'https://api.ideris.com.br/v1/Pedido';
    const API_KEY = process.env.IDERIS_API_KEY;

    // Linha de depuração para verificar a chave no Netlify
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
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro recebido da API Ideris:', errorText);
            return {
                statusCode: response.status,
                body: JSON.stringify({ message: `Erro da API Ideris: ${errorText}` })
            };
        }

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

