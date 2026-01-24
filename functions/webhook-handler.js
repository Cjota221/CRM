// ============================================================================
// WEBHOOK HANDLER - Recebe eventos do FacilZap em tempo real
// Salva no Supabase para persistência
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // GET - Retorna eventos e carrinhos salvos
    if (event.httpMethod === 'GET') {
        try {
            if (!SUPABASE_SERVICE_KEY) {
                return { statusCode: 200, headers, body: JSON.stringify({ events: [], abandonedCarts: [] }) };
            }
            
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            
            const [eventsRes, cartsRes] = await Promise.all([
                supabase.from('webhook_events').select('*').order('created_at', { ascending: false }).limit(100),
                supabase.from('abandoned_carts').select('*').order('created_at', { ascending: false }).limit(50)
            ]);
            
            // Transformar carrinhos para o formato esperado pelo frontend
            const formattedCarts = (cartsRes.data || []).map(cart => ({
                id: cart.id,
                tipo: 'carrinho_abandonado',
                cliente: {
                    id: cart.cliente_id,
                    nome: cart.cliente_nome,
                    whatsapp: cart.cliente_whatsapp,
                    email: cart.cliente_email
                },
                valor_total: cart.valor_total,
                quantidade_produtos: cart.quantidade_produtos,
                produtos: cart.produtos || [],
                link_carrinho: cart.link_carrinho,
                iniciado_em: cart.iniciado_em,
                ultima_atualizacao: cart.ultima_atualizacao,
                status: cart.status
            }));
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    events: eventsRes.data || [],
                    abandonedCarts: formattedCarts
                })
            };
        } catch (error) {
            return { statusCode: 200, headers, body: JSON.stringify({ events: [], abandonedCarts: [], error: error.message }) };
        }
    }

    // Apenas aceitar POST
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            headers, 
            body: JSON.stringify({ error: 'Método não permitido. Use POST ou GET.' }) 
        };
    }

    // Inicializar Supabase se disponível
    let supabase = null;
    if (SUPABASE_SERVICE_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }

    try {
        // Parsear o body do webhook
        const payload = JSON.parse(event.body || '{}');
        
        const webhookId = payload.id || `wh_${Date.now()}`;
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
            case 'pedido_pago':
            case 'pedido_nf_atualizada':
            case 'pedido_envio_atualizado':
            case 'pedido_status_atualizado':
            case 'pedido_pagamento_atualizado':
            case 'pedido_cancelado':
                processedData = processPedidoAtualizado(dados, evento);
                console.log(`[WEBHOOK] Pedido ${evento}: #${dados.id}`);
                break;
                
            case 'carrinho_abandonado_criado':
                processedData = processCarrinhoAbandonado(dados);
                console.log(`[WEBHOOK] Carrinho abandonado: ${dados.cliente?.nome} - R$ ${dados.valor_total}`);
                
                // SALVAR CARRINHO ABANDONADO NO SUPABASE
                if (supabase) {
                    // O link do carrinho pode vir em diferentes campos dependendo da versão do FacilZap
                    const linkCarrinho = dados.url || dados.link_carrinho || dados.link || dados.checkout_url || null;
                    
                    const cartData = {
                        id: dados.id?.toString() || webhookId,
                        cliente_id: dados.cliente?.id,
                        cliente_nome: dados.cliente?.nome,
                        cliente_whatsapp: dados.cliente?.whatsapp,
                        cliente_email: dados.cliente?.email,
                        valor_total: dados.valor_total || 0,
                        quantidade_produtos: dados.quantidade_produtos || 0,
                        produtos: dados.produtos || [],
                        link_carrinho: linkCarrinho,
                        iniciado_em: dados.iniciado_em,
                        ultima_atualizacao: dados.ultima_atualizacao,
                        status: 'pendente',
                        created_at: new Date().toISOString()
                    };
                    
                    // Log para debug - ver todos os campos que chegam
                    console.log('[WEBHOOK] Dados completos do carrinho:', JSON.stringify(dados, null, 2));
                    
                    const { error } = await supabase
                        .from('abandoned_carts')
                        .upsert(cartData, { onConflict: 'id' });
                    
                    if (error) console.error('[WEBHOOK] Erro ao salvar carrinho:', error);
                    else console.log('[WEBHOOK] Carrinho salvo no Supabase!');
                }
                break;
                
            default:
                console.log(`[WEBHOOK] Evento não tratado: ${evento}`);
        }
        
        // SALVAR EVENTO NO SUPABASE
        if (supabase && processedData) {
            const eventData = {
                id: webhookId,
                evento: evento,
                dados: processedData,
                received_at: new Date().toISOString()
            };
            
            await supabase.from('webhook_events').upsert(eventData, { onConflict: 'id' });
        }
        
        console.log('========================================');
        
        // Retornar 200 OK (obrigatório para o FacilZap)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `Webhook ${evento} recebido e salvo com sucesso`,
                webhookId,
                processedAt: new Date().toISOString(),
                data: processedData
            })
        };
        
    } catch (error) {
        console.error('[WEBHOOK] Erro ao processar:', error.message);
        console.error('[WEBHOOK] Body recebido:', event.body?.substring(0, 500));
        
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

function processPedidoAtualizado(dados, evento) {
    return {
        tipo: evento || 'pedido_atualizado',
        pedido_id: dados.id,
        codigo: dados.codigo,
        status: getStatusPedido(dados),
        status_pago: dados.status_pago,
        status_entregue: dados.status_entregue,
        total: dados.total
    };
}

function processCarrinhoAbandonado(dados) {
    // O link do carrinho pode vir em diferentes campos
    const linkCarrinho = dados.url || dados.link_carrinho || dados.link || dados.checkout_url || null;
    
    return {
        tipo: 'carrinho_abandonado',
        carrinho_id: dados.id,
        cliente: {
            id: dados.cliente?.id,
            nome: dados.cliente?.nome,
            whatsapp: dados.cliente?.whatsapp,
            email: dados.cliente?.email
        },
        valor_total: dados.valor_total,
        quantidade_produtos: dados.quantidade_produtos,
        produtos: dados.produtos?.map(p => ({
            nome: p.nome,
            variacao: p.variacao?.nome,
            quantidade: p.quantidade,
            preco: p.preco
        })),
        link_carrinho: linkCarrinho,
        iniciado_em: dados.iniciado_em,
        ultima_atualizacao: dados.ultima_atualizacao
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
