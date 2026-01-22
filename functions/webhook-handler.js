// ============================================================================
// WEBHOOK HANDLER - Recebe eventos do FacilZap em tempo real
// ============================================================================

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Apenas aceitar POST
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            headers, 
            body: JSON.stringify({ error: 'Método não permitido. Use POST.' }) 
        };
    }

    try {
        // Parsear o body do webhook
        const payload = JSON.parse(event.body || '{}');
        
        const webhookId = payload.id || 'unknown';
        const evento = payload.evento || 'unknown';
        const dados = payload.dados || {};
        
        console.log('========================================');
        console.log(`[WEBHOOK] Recebido: ${evento}`);
        console.log(`[WEBHOOK] ID: ${webhookId}`);
        console.log(`[WEBHOOK] Timestamp: ${new Date().toISOString()}`);
        
        // Processar diferentes tipos de eventos
        let processedData = null;
        
        switch (evento) {
            case 'pedido_criado':
                processedData = processPedidoCriado(dados);
                console.log(`[WEBHOOK] Novo pedido: #${dados.id} - ${dados.cliente?.nome} - R$ ${dados.total}`);
                break;
                
            case 'pedido_atualizado':
                processedData = processPedidoAtualizado(dados);
                console.log(`[WEBHOOK] Pedido atualizado: #${dados.id} - Status: ${getStatusPedido(dados)}`);
                break;
                
            case 'pedido_pago':
                processedData = processPedidoPago(dados);
                console.log(`[WEBHOOK] Pedido pago: #${dados.id} - R$ ${dados.total}`);
                break;
                
            case 'carrinho_abandonado_criado':
                processedData = processCarrinhoAbandonado(dados);
                console.log(`[WEBHOOK] Carrinho abandonado: ${dados.cliente?.nome} - R$ ${dados.valor_total}`);
                break;
                
            default:
                console.log(`[WEBHOOK] Evento não tratado: ${evento}`);
                console.log(`[WEBHOOK] Dados:`, JSON.stringify(dados).substring(0, 500));
        }
        
        console.log('========================================');
        
        // Retornar 200 OK (obrigatório para o FacilZap)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `Webhook ${evento} recebido com sucesso`,
                webhookId,
                processedAt: new Date().toISOString(),
                data: processedData
            })
        };
        
    } catch (error) {
        console.error('[WEBHOOK] Erro ao processar:', error.message);
        console.error('[WEBHOOK] Body recebido:', event.body?.substring(0, 500));
        
        // Ainda retorna 200 para evitar retentativas desnecessárias
        // (a menos que queira que o FacilZap tente novamente)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                processedAt: new Date().toISOString()
            })
        };
    }
};

// ============================================================================
// PROCESSADORES DE EVENTOS
// ============================================================================

function processPedidoCriado(dados) {
    return {
        tipo: 'pedido_criado',
        pedido: {
            id: dados.id,
            codigo: dados.codigo,
            data: dados.data,
            total: dados.total,
            status: getStatusPedido(dados)
        },
        cliente: {
            id: dados.cliente?.id,
            nome: dados.cliente?.nome,
            whatsapp: dados.cliente?.whatsapp,
            email: dados.cliente?.email,
            cidade: dados.cliente?.cidade,
            estado: dados.cliente?.estado
        },
        itens_count: dados.itens?.length || 0,
        forma_pagamento: dados.pagamentos?.[0]?.forma_pagamento?.nome || 'N/A'
    };
}

function processPedidoAtualizado(dados) {
    return {
        tipo: 'pedido_atualizado',
        pedido_id: dados.id,
        status: getStatusPedido(dados),
        status_pago: dados.status_pago,
        status_entregue: dados.status_entregue
    };
}

function processPedidoPago(dados) {
    return {
        tipo: 'pedido_pago',
        pedido_id: dados.id,
        valor: dados.total,
        forma_pagamento: dados.pagamentos?.[0]?.forma_pagamento?.nome
    };
}

function processCarrinhoAbandonado(dados) {
    return {
        tipo: 'carrinho_abandonado',
        carrinho_id: dados.id,
        cliente: {
            id: dados.cliente?.id,
            nome: dados.cliente?.nome,
            whatsapp: dados.cliente?.whatsapp
        },
        valor_total: dados.valor_total,
        quantidade_produtos: dados.quantidade_produtos,
        produtos: dados.produtos?.map(p => ({
            nome: p.nome,
            variacao: p.variacao?.nome,
            quantidade: p.quantidade
        })),
        iniciado_em: dados.iniciado_em,
        ultima_atualizacao: dados.ultima_atualizacao,
        // Sugestão de ação
        acao_sugerida: 'Enviar mensagem de recuperação de carrinho'
    };
}

function getStatusPedido(dados) {
    if (dados.status_entregue) return 'Entregue';
    if (dados.status_despachado) return 'Despachado';
    if (dados.status_separado) return 'Separado';
    if (dados.status_em_separacao) return 'Em Separação';
    if (dados.status_pago) return 'Pago';
    if (dados.status) return 'Aguardando Pagamento';
    return 'Cancelado';
}
