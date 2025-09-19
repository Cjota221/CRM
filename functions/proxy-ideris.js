const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const IDERIS_API_URL = 'https://api.ideris.com.br/v1/Pedido';
    const API_KEY = process.env.IDERIS_API_KEY;

    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Variável de ambiente IDERIS_API_KEY não configurada." })
        };
    }

    try {
        const response = await fetch(IDERIS_API_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`, // Adiciona prefixo Bearer
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro da API Ideris:', response.status, errorText);
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
        console.error("Erro interno:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Erro interno no servidor." })
        };
    }
};
