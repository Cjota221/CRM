const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3000;

// Configuração do Token - COLOQUE SEU TOKEN AQUI
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN || 'SEU_TOKEN_AQUI';

// Função para fazer requisições HTTPS
function fetchAPI(url, token) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Erro ao parsear JSON: ' + e.message));
                    }
                } else if (res.statusCode === 401) {
                    reject(new Error('401 - Token de autorização inválido'));
                } else {
                    reject(new Error(`Erro HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

// Função para buscar todas as páginas de um endpoint
async function fetchAllPages(endpoint, token, extraParams = '') {
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `${endpoint}?page=${page}&length=100${extraParams}`;
        console.log(`[INFO] Buscando ${endpoint}, página ${page}...`);
        
        try {
            const response = await fetchAPI(url, token);
            const dataOnPage = response.data || [];
            
            if (dataOnPage.length > 0) {
                allData = allData.concat(dataOnPage);
                page++;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`[ERRO] Falha ao buscar ${endpoint} página ${page}:`, error.message);
            hasMore = false;
        }
    }
    
    return allData;
}

// Handler do proxy da API FacilZap
async function handleAPIProxy(res) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (FACILZAP_TOKEN === 'SEU_TOKEN_AQUI') {
        res.writeHead(500, headers);
        res.end(JSON.stringify({ 
            error: 'Token não configurado. Edite o arquivo server.js e adicione seu token.' 
        }));
        return;
    }

    try {
        console.log('[INFO] Iniciando sincronização com a API FacilZap...');

        // Calcula data de 2 anos atrás para buscar pedidos
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const dataInicial = twoYearsAgo.toISOString().split('T')[0];
        const dataFinal = new Date().toISOString().split('T')[0];

        // Busca paralela de clientes, pedidos e produtos
        const [clients, orders, products] = await Promise.all([
            fetchAllPages('https://api.facilzap.app.br/clientes', FACILZAP_TOKEN),
            fetchAllPages(
                'https://api.facilzap.app.br/pedidos', 
                FACILZAP_TOKEN, 
                `&filtros[data_inicial]=${dataInicial}&filtros[data_final]=${dataFinal}&filtros[incluir_produtos]=1`
            ),
            fetchAllPages('https://api.facilzap.app.br/produtos', FACILZAP_TOKEN)
        ]);

        console.log(`[INFO] Sincronização concluída: ${clients.length} clientes, ${orders.length} pedidos, ${products.length} produtos`);

        res.writeHead(200, headers);
        res.end(JSON.stringify({ clients, orders, products }));

    } catch (error) {
        console.error('[ERRO] Falha na sincronização:', error.message);
        const statusCode = error.message.includes('401') ? 401 : 500;
        res.writeHead(statusCode, headers);
        res.end(JSON.stringify({ error: error.message }));
    }
}

// Mapeamento de extensões para Content-Type
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Criar servidor HTTP
const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        });
        res.end();
        return;
    }

    // Endpoint do proxy da API
    if (url === '/api/facilzap-proxy') {
        await handleAPIProxy(res);
        return;
    }

    // Servir arquivos estáticos
    let filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Arquivo não encontrado');
            } else {
                res.writeHead(500);
                res.end('Erro interno do servidor');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           CRM FacilZap - Servidor Local                    ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Acesse: http://localhost:${PORT}                          ║`);
    console.log('║                                                            ║');
    if (FACILZAP_TOKEN === 'SEU_TOKEN_AQUI') {
        console.log('║  ⚠️  ATENÇÃO: Configure seu token no arquivo server.js     ║');
    } else {
        console.log('║  ✅ Token configurado!                                      ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
});
