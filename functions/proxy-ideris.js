const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const IDERIS_API_URL = 'https://api.ideris.com.br/v1/Pedido';
    const API_KEY = process.env.IDERIS_API_KEY;

    if (!API_KEY) {
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
        
        // Verifica se a resposta não foi bem-sucedida
        if (!response.ok) {
             // Tenta ler o corpo da resposta como texto, pois pode não ser JSON
            const errorText = await response.text();
            console.error('Erro da API Ideris:', errorText);
            // Retorna uma mensagem de erro clara para o frontend
            return {
                statusCode: response.status,
                body: JSON.stringify({ message: `Erro da API Ideris: ${errorText}` })
            };
        }

        // Se a resposta foi bem-sucedida, processa como JSON
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

