const fetch = require('node-fetch');

exports.handler = async (event) => {
    // 1. Validar parâmetro de URL
    const encodedUrl = event.queryStringParameters.url;
    if (!encodedUrl) {
        return { statusCode: 400, body: "Parâmetro 'url' ausente." };
    }

    let imageUrl;
    try {
        // 2. Decodificar e normalizar a URL da imagem
        imageUrl = decodeURIComponent(encodedUrl);

        // Garante que o domínio base esteja correto
        if (imageUrl.includes('://produtos/')) {
            imageUrl = imageUrl.replace('://produtos/', '://arquivos.facilzap.app.br/produtos/');
        }
        if (!imageUrl.startsWith('http')) {
            imageUrl = `https://arquivos.facilzap.app.br/${imageUrl.replace(/^\//, '')}`;
        }
        
        const parsedUrl = new URL(imageUrl);

        // 3. Validar se a imagem pertence ao domínio permitido
        if (!parsedUrl.hostname.endsWith('.facilzap.app.br')) {
            return { statusCode: 403, body: "Domínio de imagem não permitido." };
        }

        // 4. Buscar a imagem
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Falha ao buscar imagem: Status ${response.status}`);
        }

        // 5. Retornar a imagem com os cabeçalhos de segurança corretos
        return {
            statusCode: 200,
            headers: {
                'Content-Type': response.headers.get('content-type'),
                'Access-Control-Allow-Origin': 'https://cjotarasteirinhas.com.br' // Linha crucial adicionada
            },
            body: Buffer.from(await response.arrayBuffer()).toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error("Erro no proxy de imagem:", {
            originalUrl: encodedUrl,
            processedUrl: imageUrl,
            errorMessage: error.message
        });
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Erro interno ao processar a imagem." })
        };
    }
};
