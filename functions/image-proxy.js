const fetch = require('node-fetch');

exports.handler = async (event) => {
    // 1. Validar se o parâmetro 'url' foi fornecido
    const encodedUrl = event.queryStringParameters.url;
    if (!encodedUrl) {
        return { statusCode: 400, body: "Parâmetro 'url' ausente." };
    }

    let imageUrl;
    try {
        // 2. Decodificar a URL da imagem
        imageUrl = decodeURIComponent(encodedUrl);

        // Garante que a URL sempre aponte para o domínio correto de arquivos
        if (imageUrl.includes('://produtos/')) {
           imageUrl = imageUrl.replace('://produtos/', '://arquivos.facilzap.app.br/produtos/');
        }
        
        const parsedUrl = new URL(imageUrl);

        // 3. Validar se a imagem pertence ao domínio permitido
        if (!parsedUrl.hostname.endsWith('.facilzap.app.br')) {
            return { statusCode: 403, body: "O acesso a este domínio não é permitido." };
        }

        // 4. Buscar a imagem original
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Falha ao buscar imagem: ${response.statusText}`);
        }

        // 5. Retornar a imagem para o navegador
        return {
            statusCode: 200,
            headers: {
                'Content-Type': response.headers.get('content-type'),
                'Access-Control-Allow-Origin': '*' // Permite que qualquer domínio acesse
            },
            body: Buffer.from(await response.arrayBuffer()).toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error("Erro no proxy de imagem:", { originalUrl: encodedUrl, processedUrl: imageUrl, message: error.message });
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Erro interno no processamento da imagem.", message: error.message })
        };
    }
};
