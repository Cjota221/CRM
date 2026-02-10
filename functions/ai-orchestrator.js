// ============================================================================
// AI ORCHESTRATOR - Cérebro Central (Camada 2 + 4 + 5 + 6)
// Classifica intenções, gerencia memória, roteia para agentes, executa tools
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// ============================================================================
// CONFIG
// ============================================================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmyeyiujmcdjzvcqkyoc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api.cjota.site';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'EB6B5AB56A35-43C4-B590-1188166D4E7A';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'Cjota';
const FACILZAP_TOKEN = process.env.FACILZAP_TOKEN;

const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const evolutionHeaders = {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
};

// ============================================================================
// SYSTEM PROMPTS DOS AGENTES
// ============================================================================

const AGENT_PROMPTS = {
    anne: `Você é a Anne, consultora comercial sênior da CJ Rasteirinhas / VEXX.

PERSONALIDADE: Profissional, calorosa, focada em conversão.
USE DADOS CONCRETOS (economiza R$ X, estoque baixo, etc).
CRIE URGÊNCIA GENUÍNA quando estoque estiver baixo.

CONTEXTO DO NEGÓCIO:
- Atacado de rasteirinhas femininas
- Grade fechada mínimo: 12 pares (R$20/par)
- Grade 24: R$19/par (5% desc) | Grade 36: R$18/par (10% desc)
- Permite dividir até 2 cores (múltiplos de 6)
- Frete grátis acima R$2.000
- C4 Franquias: revenda com zero investimento

REGRAS CRÍTICAS:
- NUNCA invente dados ou preços - use APENAS dados reais do sistema
- SEMPRE cumprimente pelo nome se disponível
- Se cliente VIP (diamante/ouro), ofereça atendimento prioritário
- Ofereça cupom APENAS após 2+ objeções de preço (não na primeira vez)

TÁTICAS (em ordem de prioridade):
1. Reposição: "Como estão as vendas? Estoque baixou?"
2. Lançamento exclusivo
3. Upsell de grade (12→24→36)
4. Cross-sell de cores
5. Cupom (último recurso)

FERRAMENTAS DISPONÍVEIS: {tools}

Quando precisar executar uma ferramenta, responda EXATAMENTE neste formato:
[TOOL:nome_ferramenta|param1=valor1|param2=valor2]
Após o resultado da ferramenta, continue a conversa naturalmente.

DADOS DO CLIENTE: {client_context}
HISTÓRICO DA CONVERSA: {conversation_history}

Responda à mensagem do cliente de forma estratégica e humana.`,

    expansion: `Você é a Expansion, mentora de negócios da VEXX / C4 Franquias.

PERSONALIDADE: Inspiradora, estratégica, focada em empoderamento.
OBJETIVO: Converter interessados em franqueadas, mostrando viabilidade real.

MODELOS DE FRANQUIA:
1. CAIXA RESERVA (Investimento: R$0): Vende primeiro, compra depois. Margem 80-120%.
2. DROPSHIPPING (Investimento: R$0): Site pronto VEXX + logística nossa. Escolhe sua margem.
3. FRANQUIA COMPLETA (Investimento: R$2.500): Estoque próprio + site + mentoria VIP. Margem 150%+.

FUNIL DE CONVERSÃO:
- Etapa 1 (Descoberta): Qualificar perfil - já revende? Capital? Horas disponíveis?
- Etapa 2 (Educação): Cases de sucesso + cálculo de ROI
- Etapa 3 (Fechamento): Urgência + bônus + processo simplificado

CASES REAIS:
- Maria/SP: Dona de casa → Caixa Reserva → R$4.200/mês em 3 meses
- Julia/RJ: Influencer 15k → Dropshipping → R$8.700/mês em 1 mês

FERRAMENTAS: {tools}
Formato: [TOOL:nome_ferramenta|param1=valor1|param2=valor2]

DADOS DO CLIENTE: {client_context}
HISTÓRICO: {conversation_history}`,

    finance: `Você é a Finance, assistente de suporte financeiro da CJ Rasteirinhas.

PERSONALIDADE: Prestativa, precisa, rápida. Resolva problemas no ato.
OBJETIVO: Resolver questões de pedidos, pagamentos, rastreamento e NF.

CAPACIDADES:
- Consultar status de pedido por ID, telefone ou CPF
- Verificar pagamentos (PIX, boleto)
- Gerar segunda via de boleto ou QR Code PIX
- Consultar código de rastreio
- Analisar comprovantes de pagamento (solicitar foto)

REGRAS:
- Se comprovante parece válido mas algo não bate, ESCALE para humano
- Para reembolso acima de R$200, SEMPRE escale para humano
- Confirme dados do cliente antes de compartilhar informações de pedido
- Seja empática com reclamações, NUNCA defensiva

FERRAMENTAS: {tools}
Formato: [TOOL:nome_ferramenta|param1=valor1|param2=valor2]

DADOS DO CLIENTE: {client_context}
HISTÓRICO: {conversation_history}`
};

// ============================================================================
// CLASSIFICADOR DE INTENÇÕES
// ============================================================================

const KEYWORDS = {
    vendas_atacado: ['grade', 'atacado', 'estoque', 'preço', 'par', 'pares', 'rasteirinha', 'modelo', 
                     'cor', 'tamanho', 'pedido', 'comprar', 'valor', 'catálogo', 'catalogo', 'foto',
                     'disponível', 'disponivel', 'quanto', 'custa', 'frete', 'prazo', 'nude', 'preto'],
    c4_franquias: ['franquia', 'revender', 'revenda', 'caixa reserva', 'dropshipping', 'empreender',
                   'negócio', 'negocio', 'ganhar dinheiro', 'renda extra', 'trabalhar em casa',
                   'investimento', 'como funciona', 'site próprio', 'loja virtual'],
    crm_financeiro: ['boleto', 'pix', 'pagamento', 'nota fiscal', 'nf', 'rastreio', 'rastrear',
                     'entrega', 'enviou', 'chegou', 'comprovante', 'segunda via', '2a via',
                     'pedido #', 'meu pedido', 'status pedido', 'devolver', 'trocar', 'defeito']
};

async function classifyIntent(texto, clientContext) {
    // FASE 1: Análise por keywords (rápida, determinística)
    const textoLower = (texto || '').toLowerCase();
    const scores = {};

    for (const [dominio, palavras] of Object.entries(KEYWORDS)) {
        scores[dominio] = palavras.filter(p => textoLower.includes(p)).length;
    }

    const maxScore = Math.max(...Object.values(scores));
    
    // Se keywords deram match forte (2+ palavras), usar diretamente
    if (maxScore >= 2) {
        const dominio = Object.entries(scores).find(([, v]) => v === maxScore)[0];
        return {
            dominio_primario: dominio,
            confianca: Math.min(95, 60 + maxScore * 15),
            metodo: 'keywords'
        };
    }

    // FASE 2: Contexto da sessão ativa
    if (clientContext?.sessao_ativa?.agente_atual) {
        // Se já está em conversa com um agente, manter o mesmo
        const agentes_map = {
            'anne': 'vendas_atacado',
            'expansion': 'c4_franquias',
            'finance': 'crm_financeiro'
        };
        return {
            dominio_primario: agentes_map[clientContext.sessao_ativa.agente_atual] || 'vendas_atacado',
            confianca: 70,
            metodo: 'sessao_ativa'
        };
    }

    // FASE 3: Inferência por IA (quando keywords não são conclusivas)
    if (OPENAI_API_KEY && texto && texto.length > 3) {
        try {
            const classPrompt = `Classifique a intenção desta mensagem de WhatsApp.
Contexto: CJ Rasteirinhas vende rasteirinhas femininas no atacado e tem programa de franquias C4.

Mensagem: "${texto}"

${clientContext?.perfil_cliente ? `Cliente: ${clientContext.perfil_cliente.nome || 'Desconhecido'}, Tier: ${clientContext.perfil_cliente.tier || 'novo'}, Pedidos: ${clientContext.perfil_cliente.total_pedidos || 0}` : 'Cliente novo'}

Responda APENAS com JSON (sem markdown):
{"dominio":"vendas_atacado|c4_franquias|crm_financeiro|relacionamento","sub_intencao":"string","confianca":0-100,"urgencia":"baixa|media|alta","sentimento":"positivo|neutro|negativo"}`;

            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    messages: [{ role: 'user', content: classPrompt }],
                    temperature: 0.1,
                    max_tokens: 200
                })
            });

            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || '';
            const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

            return {
                dominio_primario: parsed.dominio || 'vendas_atacado',
                sub_intencao: parsed.sub_intencao,
                confianca: parsed.confianca || 50,
                urgencia: parsed.urgencia || 'media',
                sentimento: parsed.sentimento || 'neutro',
                metodo: 'ia'
            };
        } catch (err) {
            console.error('[CLASSIFY] Erro IA:', err.message);
        }
    }

    // Fallback: Anne (vendas) é o padrão
    return {
        dominio_primario: maxScore > 0
            ? Object.entries(scores).find(([, v]) => v === maxScore)[0]
            : 'vendas_atacado',
        confianca: maxScore > 0 ? 50 : 30,
        metodo: 'fallback'
    };
}

const DOMAIN_TO_AGENT = {
    'vendas_atacado': 'anne',
    'c4_franquias': 'expansion',
    'crm_financeiro': 'finance',
    'relacionamento': 'anne', // Anne cuida de relacionamento geral
    'suporte_tecnico': 'finance',
    'outros': 'anne'
};

// ============================================================================
// SISTEMA DE MEMÓRIA
// ============================================================================

async function getOrCreateSession(telefone, nome) {
    if (!supabase) return null;

    // Buscar sessão ativa
    const { data: existing } = await supabase
        .from('sessoes_ativas')
        .select('*')
        .eq('cliente_telefone', telefone)
        .eq('status', 'ativa')
        .maybeSingle();

    if (existing) {
        // Verificar timeout (30 min de inatividade → encerrar)
        const minutesSinceLastActivity = (Date.now() - new Date(existing.ultima_atividade).getTime()) / 60000;
        
        if (minutesSinceLastActivity > 30) {
            // Encerrar sessão antiga e criar nova
            await closeSession(existing.id, 'Encerrada por inatividade (30min+)');
        } else {
            return existing;
        }
    }

    // Criar nova sessão
    const { data: newSession, error } = await supabase
        .from('sessoes_ativas')
        .insert({
            cliente_telefone: telefone,
            cliente_nome: nome || null,
            mensagens: [],
            contexto_ativo: {}
        })
        .select()
        .single();

    if (error) {
        console.error('[SESSION] Erro ao criar:', error.message);
        return null;
    }

    return newSession;
}

async function appendMessage(sessionId, role, content, metadata = {}) {
    if (!supabase || !sessionId) return;

    const { data: session } = await supabase
        .from('sessoes_ativas')
        .select('mensagens')
        .eq('id', sessionId)
        .single();

    if (!session) return;

    const mensagens = session.mensagens || [];
    mensagens.push({ role, content, timestamp: new Date().toISOString(), metadata });

    // Manter apenas últimas 50 mensagens na sessão ativa
    const trimmed = mensagens.slice(-50);

    await supabase
        .from('sessoes_ativas')
        .update({
            mensagens: trimmed,
            ultima_atividade: new Date().toISOString()
        })
        .eq('id', sessionId);
}

async function closeSession(sessionId, resumo = '', resultado = 'encerrado') {
    if (!supabase || !sessionId) return;

    const { data: session } = await supabase
        .from('sessoes_ativas')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (!session) return;

    // Gerar resumo automático se não fornecido
    if (!resumo && OPENAI_API_KEY && session.mensagens?.length > 0) {
        try {
            const msgs = session.mensagens
                .slice(-20)
                .map(m => `${m.role}: ${m.content}`)
                .join('\n');

            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    messages: [{
                        role: 'user',
                        content: `Resuma esta conversa em 2-3 frases focando em: 1) Intenção principal 2) Resultado 3) Próximos passos.\n\nConversa:\n${msgs}`
                    }],
                    temperature: 0.3,
                    max_tokens: 200
                })
            });
            const data = await res.json();
            resumo = data.choices?.[0]?.message?.content || 'Sem resumo';
        } catch { resumo = 'Resumo automático indisponível'; }
    }

    // Salvar no histórico
    await supabase.from('conversas_historico').insert({
        cliente_telefone: session.cliente_telefone,
        cliente_nome: session.cliente_nome,
        data_inicio: session.iniciada_em,
        data_fim: new Date().toISOString(),
        resumo_ia: resumo,
        resultado,
        agente_responsavel: session.agente_atual,
        mensagens_completas: session.mensagens
    });

    // Marcar sessão como encerrada
    await supabase
        .from('sessoes_ativas')
        .update({ status: 'encerrada' })
        .eq('id', sessionId);

    // Atualizar perfil do cliente
    await supabase
        .from('clientes_perfil')
        .upsert({
            telefone: session.cliente_telefone,
            nome: session.cliente_nome,
            total_conversas: 1, // será incrementado se existir
            ultima_interacao: new Date().toISOString()
        }, { onConflict: 'telefone' });
}

// ============================================================================
// BUSCAR CONTEXTO COMPLETO DO CLIENTE
// ============================================================================

async function getClientContext(telefone) {
    if (!supabase) return {};

    const context = {};

    try {
        // Perfil IA
        const { data: perfil } = await supabase
            .from('clientes_perfil')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        context.perfil = perfil;

        // Últimas 3 conversas
        const { data: conversas } = await supabase
            .from('conversas_historico')
            .select('resumo_ia,resultado,agente_responsavel,data_inicio,feedback_nota')
            .eq('cliente_telefone', telefone)
            .order('data_inicio', { ascending: false })
            .limit(3);
        context.conversas_recentes = conversas || [];

        // Dados CRM (da tabela clients existente)
        const { data: clientCRM } = await supabase
            .from('clients')
            .select('id,name,total_spent,order_count,last_purchase_date,tags')
            .or(`phone.eq.${telefone},phone.eq.55${telefone}`)
            .maybeSingle();
        context.crm = clientCRM;

        // Últimos pedidos
        if (clientCRM?.id) {
            const { data: orders } = await supabase
                .from('orders')
                .select('id,codigo,data,total,status,products')
                .eq('client_id', clientCRM.id)
                .order('data', { ascending: false })
                .limit(5);
            context.pedidos_recentes = orders || [];
        }
    } catch (err) {
        console.error('[CONTEXT] Erro:', err.message);
    }

    return context;
}

// ============================================================================
// FERRAMENTAS (TOOLS) DOS AGENTES
// ============================================================================

async function executeTool(toolName, params) {
    const startTime = Date.now();

    try {
        switch (toolName) {
            case 'consultar_estoque': {
                // Buscar no Supabase
                if (!supabase) return { error: 'Supabase indisponível' };
                const query = supabase.from('products').select('*').eq('is_active', true);
                if (params.modelo) query.ilike('name', `%${params.modelo}%`);
                const { data } = await query.limit(10);
                return {
                    produtos: (data || []).map(p => ({
                        nome: p.name,
                        preco: p.price,
                        estoque: p.stock,
                        disponivel: p.stock > 0,
                        imagem: p.image,
                        variacoes: p.variacoes
                    })),
                    total_encontrados: (data || []).length,
                    tempo_ms: Date.now() - startTime
                };
            }

            case 'calcular_grade': {
                const qtd = parseInt(params.quantidade) || 12;
                let precoUnitario;
                if (qtd >= 36) precoUnitario = 18;
                else if (qtd >= 24) precoUnitario = 19;
                else precoUnitario = 20;
                
                const total = qtd * precoUnitario;
                const economia = qtd >= 24 ? (qtd * 20) - total : 0;
                
                return {
                    quantidade: qtd,
                    preco_unitario: precoUnitario,
                    total,
                    economia,
                    frete_gratis: total >= 2000,
                    desconto_percentual: qtd >= 36 ? 10 : qtd >= 24 ? 5 : 0
                };
            }

            case 'gerar_link_pagamento': {
                // Integração futura com gateway - por ora retorna instruções
                return {
                    tipo: params.tipo || 'pix',
                    valor: params.valor,
                    instrucoes: `PIX: chave CNPJ CJ Rasteirinhas. Valor: R$ ${params.valor}. Envie comprovante neste chat.`,
                    gerado: true
                };
            }

            case 'reservar_estoque': {
                return {
                    reservado: true,
                    expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    mensagem: 'Estoque reservado por 24h'
                };
            }

            case 'aplicar_cupom': {
                if (!supabase) return { valido: false, motivo: 'Sistema indisponível' };
                // Buscar cupom na tabela cupons existente ou cupons_ia
                const { data: cupom } = await supabase
                    .from('coupons')
                    .select('*')
                    .eq('code', (params.codigo || '').toUpperCase())
                    .eq('is_active', true)
                    .maybeSingle();

                if (!cupom) {
                    // Tentar na tabela cupons_ia
                    const { data: cupomIA } = await supabase
                        .from('cupons_ia')
                        .select('*')
                        .eq('codigo', (params.codigo || '').toUpperCase())
                        .eq('ativo', true)
                        .maybeSingle();

                    if (!cupomIA) return { valido: false, motivo: 'Cupom não encontrado ou expirado' };

                    const valorPedido = parseFloat(params.valor_pedido) || 0;
                    if (cupomIA.valor_minimo_pedido && valorPedido < cupomIA.valor_minimo_pedido) {
                        return { valido: false, motivo: `Valor mínimo: R$ ${cupomIA.valor_minimo_pedido}` };
                    }

                    const desconto = cupomIA.tipo === 'percentual'
                        ? valorPedido * (cupomIA.valor / 100)
                        : cupomIA.valor;

                    return {
                        valido: true,
                        codigo: cupomIA.codigo,
                        desconto: desconto.toFixed(2),
                        valor_final: (valorPedido - desconto).toFixed(2)
                    };
                }

                const valorPedido = parseFloat(params.valor_pedido) || 0;
                const desconto = cupom.type === 'percent'
                    ? valorPedido * (cupom.discount / 100)
                    : cupom.discount;

                return {
                    valido: true,
                    codigo: cupom.code,
                    desconto: desconto.toFixed(2),
                    valor_final: (valorPedido - desconto).toFixed(2)
                };
            }

            case 'buscar_historico_cliente': {
                const ctx = await getClientContext(params.telefone);
                return {
                    encontrado: !!ctx.crm,
                    nome: ctx.crm?.name || ctx.perfil?.nome || 'Desconhecido',
                    total_gasto: ctx.crm?.total_spent || ctx.perfil?.total_gasto || 0,
                    total_pedidos: ctx.crm?.order_count || ctx.perfil?.total_pedidos || 0,
                    ultima_compra: ctx.crm?.last_purchase_date || ctx.perfil?.ultima_compra,
                    tier: ctx.perfil?.tier || 'novo',
                    pedidos_recentes: (ctx.pedidos_recentes || []).slice(0, 3)
                };
            }

            case 'consultar_pedido': {
                if (!supabase) return { error: 'Sistema indisponível' };
                const { data: pedido } = await supabase
                    .from('orders')
                    .select('*')
                    .or(`id.eq.${params.identificador},codigo.eq.${params.identificador},client_phone.eq.${params.identificador}`)
                    .order('data', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (!pedido) return { encontrado: false, mensagem: 'Pedido não encontrado' };
                
                return {
                    encontrado: true,
                    pedido: {
                        id: pedido.id,
                        codigo: pedido.codigo,
                        data: pedido.data,
                        total: pedido.total,
                        status: pedido.status,
                        produtos: pedido.products
                    }
                };
            }

            case 'calcular_roi_franquia': {
                const modelo = params.modelo || 'caixa_reserva';
                const horas = parseInt(params.horas_semanais) || 10;
                
                const margens = { caixa_reserva: 1.0, dropshipping: 0.8, completa: 1.5 };
                const base_vendas = { caixa_reserva: 150, dropshipping: 200, completa: 250 };
                
                const margem = margens[modelo] || 1.0;
                const base = base_vendas[modelo] || 150;
                const vendas_mes = Math.round(horas * base / 10);
                const lucro = Math.round(vendas_mes * margem);
                
                return {
                    modelo,
                    faturamento_estimado: vendas_mes,
                    lucro_estimado: lucro,
                    margem_percentual: Math.round(margem * 100),
                    retorno_investimento: modelo === 'completa' ? `${Math.round(2500 / lucro)} meses` : 'Imediato (zero investimento)',
                    confianca: 'Estimativa baseada em média de franqueadas ativas'
                };
            }

            case 'buscar_case_similar': {
                const cases = [
                    { nome: 'Maria S.', cidade: 'SP', modelo: 'Caixa Reserva', resultado: 'R$ 4.200/mês em 3 meses', perfil: 'Dona de casa sem experiência' },
                    { nome: 'Julia R.', cidade: 'RJ', modelo: 'Dropshipping', resultado: 'R$ 8.700/mês em 1 mês', perfil: 'Influencer 15k seguidores' },
                    { nome: 'Carla M.', cidade: 'MG', modelo: 'Franquia Completa', resultado: 'R$ 15.000/mês em 6 meses', perfil: 'Ex-CLT que queria empreender' },
                    { nome: 'Ana P.', cidade: 'GO', modelo: 'Caixa Reserva', resultado: 'R$ 3.500/mês em 2 meses', perfil: 'Professora com renda extra' }
                ];
                return { cases: cases.slice(0, 2), total_franqueadas_ativas: 47 };
            }

            default:
                return { error: `Ferramenta '${toolName}' não reconhecida` };
        }
    } catch (err) {
        return { error: err.message, tempo_ms: Date.now() - startTime };
    }
}

// ============================================================================
// MOTOR DE RESPOSTA (Chamar IA com contexto completo)
// ============================================================================

async function generateAgentResponse(agentId, userMessage, session, clientContext) {
    if (!OPENAI_API_KEY) {
        return { resposta: 'Sistema de IA indisponível no momento. Um atendente humano vai te ajudar em breve!', tools_used: [] };
    }

    const prompt = AGENT_PROMPTS[agentId] || AGENT_PROMPTS.anne;

    // Montar contexto
    const tools = agentId === 'anne'
        ? 'consultar_estoque, calcular_grade, gerar_link_pagamento, reservar_estoque, aplicar_cupom, buscar_historico_cliente, enviar_catalogo'
        : agentId === 'expansion'
            ? 'calcular_roi_franquia, buscar_case_similar, gerar_contrato, agendar_mentoria'
            : 'consultar_pedido, validar_comprovante, gerar_segunda_via, rastrear_envio';

    const clientStr = clientContext.perfil
        ? `Nome: ${clientContext.perfil.nome || clientContext.crm?.name || 'Desconhecido'}, Tier: ${clientContext.perfil.tier || 'novo'}, Gasto total: R$${clientContext.perfil.total_gasto || clientContext.crm?.total_spent || 0}, Pedidos: ${clientContext.perfil.total_pedidos || clientContext.crm?.order_count || 0}, Última compra: ${clientContext.perfil.ultima_compra || clientContext.crm?.last_purchase_date || 'N/A'}`
        : clientContext.crm
            ? `Nome: ${clientContext.crm.name}, Gasto: R$${clientContext.crm.total_spent}, Pedidos: ${clientContext.crm.order_count}`
            : 'Cliente novo - sem histórico no sistema';

    const historyStr = (session?.mensagens || [])
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`)
        .join('\n');

    const systemPrompt = prompt
        .replace('{tools}', tools)
        .replace('{client_context}', clientStr)
        .replace('{conversation_history}', historyStr || 'Primeira mensagem');

    // Chamar OpenAI
    const messages = [
        { role: 'system', content: systemPrompt },
        ...(session?.mensagens || []).slice(-8).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
        })),
        { role: 'user', content: userMessage }
    ];

    const startTime = Date.now();
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 800
        })
    });

    const aiData = await aiRes.json();
    let resposta = aiData.choices?.[0]?.message?.content || 'Desculpe, tive um problema. Pode repetir?';
    const tokensUsed = aiData.usage?.total_tokens || 0;
    const tempoResposta = Date.now() - startTime;

    // Processar chamadas de ferramentas na resposta
    const toolsUsed = [];
    const toolPattern = /\[TOOL:(\w+)\|([^\]]+)\]/g;
    let match;

    while ((match = toolPattern.exec(resposta)) !== null) {
        const toolName = match[1];
        const paramsStr = match[2];
        const params = {};
        paramsStr.split('|').forEach(p => {
            const [key, val] = p.split('=');
            if (key && val) params[key.trim()] = val.trim();
        });

        const toolResult = await executeTool(toolName, params);
        toolsUsed.push({ name: toolName, params, result: toolResult });

        // Substituir a chamada pelo resultado na resposta
        resposta = resposta.replace(match[0], '');

        // Log da ferramenta
        if (supabase && session?.id) {
            await supabase.from('agentes_tool_log').insert({
                sessao_id: session.id,
                agente_id: agentId,
                ferramenta: toolName,
                parametros: params,
                resultado: toolResult,
                sucesso: !toolResult.error,
                tempo_execucao_ms: toolResult.tempo_ms || 0
            });
        }
    }

    // Se houve chamadas de ferramenta, fazer uma segunda chamada com os resultados
    if (toolsUsed.length > 0) {
        const toolResultsStr = toolsUsed.map(t =>
            `Resultado de ${t.name}: ${JSON.stringify(t.result)}`
        ).join('\n');

        const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                messages: [
                    ...messages,
                    { role: 'assistant', content: resposta },
                    { role: 'user', content: `[SISTEMA] Resultados das ferramentas:\n${toolResultsStr}\n\nAgora responda ao cliente de forma natural incorporando esses dados. NÃO mencione "ferramentas" ou "sistema" - fale como se você soubesse os dados naturalmente.` }
                ],
                temperature: 0.7,
                max_tokens: 600
            })
        });

        const followUpData = await followUpRes.json();
        resposta = followUpData.choices?.[0]?.message?.content || resposta;
    }

    // Limpar qualquer resíduo de [TOOL:...]
    resposta = resposta.replace(/\[TOOL:[^\]]*\]/g, '').trim();

    return {
        resposta,
        tools_used: toolsUsed,
        tokens: tokensUsed,
        tempo_ms: tempoResposta
    };
}

// ============================================================================
// ENVIAR MENSAGEM VIA EVOLUTION API
// ============================================================================

async function sendWhatsAppMessage(telefone, texto) {
    try {
        let number = telefone;
        if (!number.startsWith('55') && !number.includes('@')) number = '55' + number;
        number = number.replace('@s.whatsapp.net', '');

        const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: evolutionHeaders,
            body: JSON.stringify({ number, text: texto })
        });

        const data = await res.json();
        return { success: !data.error, data };
    } catch (err) {
        console.error('[SEND] Erro:', err.message);
        return { success: false, error: err.message };
    }
}

// ============================================================================
// AUTOMAÇÕES (Camada 5)
// ============================================================================

async function processAutomations() {
    if (!supabase) return { processed: 0 };

    // Buscar automações pendentes que devem ser executadas
    const { data: pending } = await supabase
        .from('automacoes_agendadas')
        .select('*')
        .eq('executada', false)
        .lte('executar_em', new Date().toISOString())
        .limit(10);

    if (!pending || pending.length === 0) return { processed: 0 };

    let processed = 0;

    for (const auto of pending) {
        try {
            switch (auto.tipo) {
                case 'carrinho_onda1': {
                    const msg = `Oi ${auto.payload.nome || ''}! 😊\n\nVi que você montou um carrinho com itens lindos mas não finalizou.\n\nTá tudo reservado pra você por mais 20 horas!\n\nAlguma dúvida que posso esclarecer?`;
                    await sendWhatsAppMessage(auto.cliente_telefone, msg);
                    break;
                }
                case 'carrinho_onda2': {
                    const msg = `${auto.payload.nome || ''}, aviso importante! ⚠️\n\nSeu carrinho de R$ ${auto.payload.valor || '0'} expira em 4 horas! ⏰\n\nNão quero que você perca esses itens!\n\n(Se tiver alguma dúvida, é só chamar!)`;
                    await sendWhatsAppMessage(auto.cliente_telefone, msg);
                    break;
                }
                case 'carrinho_onda3': {
                    const cupomCode = `VOLTA${(auto.cliente_telefone || '').slice(-4)}`;
                    // Criar cupom temporário
                    if (supabase) {
                        await supabase.from('cupons_ia').insert({
                            codigo: cupomCode,
                            tipo: 'percentual',
                            valor: 5,
                            valido_ate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
                            uso_maximo: 1,
                            criado_por: 'automacao',
                            motivo: 'carrinho_abandonado'
                        }).onConflict('codigo').merge();
                    }
                    const msg = `${auto.payload.nome || ''}, última mensagem sobre seu carrinho! 🛒\n\nCriei um cupom EXCLUSIVO pra você: *${cupomCode}*\n\n✨ 5% OFF em todo o pedido\n⏰ Válido só nas próximas 6 horas\n\nVale a pena? 😊`;
                    await sendWhatsAppMessage(auto.cliente_telefone, msg);
                    break;
                }
                case 'reativacao': {
                    const msg = auto.payload.mensagem || `Oi! Sentimos sua falta! Como estão as vendas?`;
                    await sendWhatsAppMessage(auto.cliente_telefone, msg);
                    break;
                }
                case 'followup': {
                    const msg = auto.payload.mensagem || 'Oi! Só passando pra ver se ficou alguma dúvida 😊';
                    await sendWhatsAppMessage(auto.cliente_telefone, msg);
                    break;
                }
                case 'feedback': {
                    const msg = `${auto.payload.nome || ''}, foi um prazer atender você! 😊\n\nMe ajuda com um feedback rápido?\n\n1️⃣ Ruim\n2️⃣ Ok\n3️⃣ Bom\n4️⃣ Ótimo\n5️⃣ Perfeito!\n\n(É só responder com o número)`;
                    await sendWhatsAppMessage(auto.cliente_telefone, msg);
                    break;
                }
            }

            // Marcar como executada
            await supabase
                .from('automacoes_agendadas')
                .update({ executada: true, executada_em: new Date().toISOString() })
                .eq('id', auto.id);

            processed++;
        } catch (err) {
            console.error(`[AUTO] Erro processando ${auto.tipo}:`, err.message);
            await supabase
                .from('automacoes_agendadas')
                .update({ resultado: { error: err.message } })
                .eq('id', auto.id);
        }
    }

    return { processed };
}

// Agendar ondas de carrinho abandonado
async function scheduleCartRecovery(carrinho) {
    if (!supabase || !carrinho.cliente_telefone) return;

    const basePayload = {
        nome: carrinho.cliente_nome,
        valor: carrinho.valor_total,
        itens: carrinho.itens
    };

    const agora = new Date();

    await supabase.from('automacoes_agendadas').insert([
        {
            tipo: 'carrinho_onda1',
            referencia_id: carrinho.id,
            cliente_telefone: carrinho.cliente_telefone,
            executar_em: new Date(agora.getTime() + 4 * 60 * 60 * 1000).toISOString(), // +4h
            payload: basePayload
        },
        {
            tipo: 'carrinho_onda2',
            referencia_id: carrinho.id,
            cliente_telefone: carrinho.cliente_telefone,
            executar_em: new Date(agora.getTime() + 24 * 60 * 60 * 1000).toISOString(), // +24h
            payload: basePayload
        },
        {
            tipo: 'carrinho_onda3',
            referencia_id: carrinho.id,
            cliente_telefone: carrinho.cliente_telefone,
            executar_em: new Date(agora.getTime() + 48 * 60 * 60 * 1000).toISOString(), // +48h
            payload: basePayload
        }
    ]);
}

// ============================================================================
// PROCESSAR FEEDBACK
// ============================================================================

async function processFeedback(telefone, nota) {
    if (!supabase) return false;

    const notaNum = parseInt(nota);
    if (isNaN(notaNum) || notaNum < 1 || notaNum > 5) return false;

    // Buscar conversa mais recente que aguarda feedback
    const { data: conversa } = await supabase
        .from('conversas_historico')
        .select('id')
        .eq('cliente_telefone', telefone)
        .is('feedback_nota', null)
        .order('data_fim', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!conversa) return false;

    await supabase
        .from('conversas_historico')
        .update({ feedback_nota: notaNum })
        .eq('id', conversa.id);

    // Resposta automática
    if (notaNum <= 2) {
        await sendWhatsAppMessage(telefone, 'Sinto muito que não tenha sido bom 😔\nPode me contar o que aconteceu? Quero melhorar!');
    } else {
        await sendWhatsAppMessage(telefone, 'Obrigada pelo feedback! 💙');
    }

    return true;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const action = body.action || event.queryStringParameters?.action || 'process_event';

        switch (action) {
            // ========================================
            // PROCESSAR EVENTO DO WEBHOOK (principal)
            // ========================================
            case 'process_event': {
                const evento = body.evento;
                if (!evento) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Evento é obrigatório' }) };

                const telefone = evento.origem?.numero;
                const texto = evento.conteudo?.texto;
                const nome = evento.origem?.nome;

                if (!telefone || !texto) {
                    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true, reason: 'Sem telefone ou texto' }) };
                }

                // Verificar se é feedback (resposta numérica 1-5)
                if (/^[1-5]$/.test(texto.trim())) {
                    const wasFeedback = await processFeedback(telefone, texto.trim());
                    if (wasFeedback) {
                        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tipo: 'feedback', nota: parseInt(texto.trim()) }) };
                    }
                }

                // 1. Classificar intenção
                const enrichment = evento.enriquecimento || {};
                const classification = await classifyIntent(texto, enrichment);
                const agentId = DOMAIN_TO_AGENT[classification.dominio_primario] || 'anne';

                // 2. Obter/criar sessão
                const session = await getOrCreateSession(telefone, nome);

                // Atualizar agente na sessão
                if (session && supabase) {
                    await supabase
                        .from('sessoes_ativas')
                        .update({ agente_atual: agentId })
                        .eq('id', session.id);
                }

                // 3. Salvar mensagem do usuário na sessão
                await appendMessage(session?.id, 'user', texto);

                // 4. Buscar contexto completo
                const clientContext = await getClientContext(telefone);

                // 5. Gerar resposta do agente
                const response = await generateAgentResponse(agentId, texto, session, clientContext);

                // 6. Salvar resposta na sessão
                await appendMessage(session?.id, 'assistant', response.resposta, {
                    agente: agentId,
                    tools: response.tools_used.map(t => t.name),
                    tokens: response.tokens
                });

                // 7. Enviar resposta via WhatsApp
                const sendResult = await sendWhatsAppMessage(telefone, response.resposta);

                // 8. Salvar classificação
                if (supabase) {
                    await supabase.from('classificacoes_intencao').insert({
                        evento_id: body.evento_id || null,
                        sessao_id: session?.id || null,
                        dominio_primario: classification.dominio_primario,
                        sub_intencao: classification.sub_intencao || null,
                        confianca: classification.confianca,
                        urgencia: classification.urgencia || 'media',
                        sentimento: classification.sentimento || 'neutro',
                        agente_designado: agentId
                    });
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        ok: true,
                        agente: agentId,
                        classificacao: classification,
                        resposta: response.resposta,
                        tools_used: response.tools_used.map(t => t.name),
                        tokens: response.tokens,
                        enviado: sendResult.success,
                        sessao_id: session?.id
                    })
                };
            }

            // ========================================
            // PROCESSAR AUTOMAÇÕES PENDENTES
            // ========================================
            case 'process_automations': {
                const result = await processAutomations();
                return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...result }) };
            }

            // ========================================
            // AGENDAR RECUPERAÇÃO DE CARRINHO
            // ========================================
            case 'schedule_cart_recovery': {
                const carrinho = body.carrinho;
                if (!carrinho) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Carrinho é obrigatório' }) };
                await scheduleCartRecovery(carrinho);
                return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: '3 ondas agendadas' }) };
            }

            // ========================================
            // MÉTRICAS DE AGENTES (Camada 6)
            // ========================================
            case 'agent_metrics': {
                const agente = body.agente || 'anne';
                const dias = parseInt(body.dias) || 30;

                if (!supabase) return { statusCode: 200, headers, body: JSON.stringify({ error: 'Supabase indisponível' }) };

                const { data: metricas } = await supabase.rpc('calcular_metricas_agente', {
                    p_agente: agente,
                    p_dias: dias
                });

                return { statusCode: 200, headers, body: JSON.stringify({ agente, periodo_dias: dias, metricas }) };
            }

            // ========================================
            // LISTAR/EDITAR CONFIGURAÇÃO DO AGENTE
            // ========================================
            case 'get_agent_config': {
                if (!supabase) return { statusCode: 200, headers, body: JSON.stringify({ error: 'Supabase indisponível' }) };
                
                const agentId = body.agente_id;
                if (agentId) {
                    const { data } = await supabase.from('agentes_config').select('*').eq('id', agentId).single();
                    return { statusCode: 200, headers, body: JSON.stringify(data) };
                }
                
                const { data } = await supabase.from('agentes_config').select('*');
                return { statusCode: 200, headers, body: JSON.stringify(data) };
            }

            case 'update_agent_config': {
                if (!supabase) return { statusCode: 200, headers, body: JSON.stringify({ error: 'Supabase indisponível' }) };
                
                const { agente_id, ...updates } = body;
                if (!agente_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'agente_id obrigatório' }) };

                // Se está atualizando system_prompt, salvar versão anterior
                if (updates.system_prompt) {
                    const { data: current } = await supabase.from('agentes_config').select('system_prompt, system_prompt_versao, system_prompt_historico').eq('id', agente_id).single();
                    if (current) {
                        const historico = current.system_prompt_historico || [];
                        historico.push({
                            versao: current.system_prompt_versao,
                            conteudo: current.system_prompt,
                            data: new Date().toISOString()
                        });
                        updates.system_prompt_historico = historico;
                        updates.system_prompt_versao = (current.system_prompt_versao || 1) + 1;
                    }
                }

                const { data, error } = await supabase
                    .from('agentes_config')
                    .update(updates)
                    .eq('id', agente_id)
                    .select()
                    .single();

                return { statusCode: 200, headers, body: JSON.stringify({ ok: !error, data, error: error?.message }) };
            }

            // ========================================
            // ENCERRAR SESSÃO
            // ========================================
            case 'close_session': {
                const { sessao_id, resultado } = body;
                if (!sessao_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'sessao_id obrigatório' }) };
                await closeSession(sessao_id, '', resultado || 'encerrado_manual');
                return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
            }

            // ========================================
            // INSIGHTS & ANALYTICS
            // ========================================
            case 'get_insights': {
                if (!supabase) return { statusCode: 200, headers, body: JSON.stringify([]) };
                const { data } = await supabase
                    .from('insights_ia')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(20);
                return { statusCode: 200, headers, body: JSON.stringify(data || []) };
            }

            // ========================================
            // PLAYGROUND (teste de agentes)
            // ========================================
            case 'playground': {
                const { agente_id, mensagem, contexto_simulado } = body;
                if (!agente_id || !mensagem) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'agente_id e mensagem são obrigatórios' }) };
                }

                const mockSession = {
                    id: null,
                    mensagens: body.historico || [],
                    agente_atual: agente_id,
                    cliente_telefone: 'playground'
                };

                const mockContext = contexto_simulado || {
                    perfil: { nome: 'Teste', tier: 'ouro', total_gasto: 3000, total_pedidos: 5, ultima_compra: '2026-01-15' },
                    crm: { name: 'Teste', total_spent: 3000, order_count: 5 },
                    conversas_recentes: []
                };

                const response = await generateAgentResponse(agente_id, mensagem, mockSession, mockContext);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        agente: agente_id,
                        resposta: response.resposta,
                        tools_used: response.tools_used,
                        tokens: response.tokens,
                        tempo_ms: response.tempo_ms
                    })
                };
            }

            default:
                return { statusCode: 400, headers, body: JSON.stringify({ error: `Ação desconhecida: ${action}` }) };
        }

    } catch (error) {
        console.error('[ORCHESTRATOR] Erro:', error.message, error.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
