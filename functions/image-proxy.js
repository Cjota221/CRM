const fetch = require('node-fetch');

exports.handler = async (event) => {
    // 1. Validar parâmetro da URL
    const encodedUrl = event.queryStringParameters.url;
    if (!encodedUrl) {
        return { statusCode: 400, body: "Parâmetro 'url' ausente." };
    }

    let imageUrl;
    try {
        // 2. Decodificar a URL recebida
        imageUrl = decodeURIComponent(encodedUrl);

        // Garante que a URL base da FacilZap esteja correta
        if (!imageUrl.startsWith('http')) {
             imageUrl = `https://arquivos.facilzap.app.br/${imageUrl.replace(/^\//, '')}`;
        }
        
        const parsedUrl = new URL(imageUrl);
        
        // 3. Validar se o domínio pertence à FacilZap
        if (!parsedUrl.hostname.endsWith('.facilzap.app.br')) {
            return { statusCode: 403, body: "Domínio de imagem não permitido." };
        }
        
        // 4. Buscar a imagem no servidor da FacilZap
        const response = await fetch(imageUrl);

        if (!response.ok) {
            return { statusCode: response.status, body: `Falha ao buscar imagem: ${response.statusText}` };
        }
        
        const imageBuffer = await response.buffer();
        
        // 5. Retornar a imagem para o navegador
        return {
            statusCode: 200,
            headers: {
                'Content-Type': response.headers.get('content-type'),
                // CORREÇÃO: Permite que a imagem seja exibida em qualquer domínio
                'Access-Control-Allow-Origin': '*' 
            },
            body: imageBuffer.toString('base64'),
            isBase64Encoded: true
        };
        
    } catch (error) {
        console.error("Erro no proxy de imagem:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Erro interno no processamento da imagem.",
                message: error.message
            })
        };
    }
};
