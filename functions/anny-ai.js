// ============================================================================
// ANNY AI - Business Intelligence Assistant v2.0 (CEO Mode)
// Netlify Function com integração Groq API
// Superpoderes: Cohort Analysis, Copywriting, Stock Audit, Morning Briefing
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// Configuração
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// Inicializar Supabase
const supabase = SUPABASE_URL && SUPABASE_KEY 
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// ============================================================================
// SYSTEM PROMPT - ANNY 3.0 - Consultora Comercial Sênior
// ============================================================================

const ANNY_SYSTEM_PROMPT = `Você é a Anny 3.0, Consultora Comercial Sênior e Estrategista de Recuperação de Vendas da Cjota Rasteirinhas — especialista em atacado B2B de calçados femininos com foco em reativação, crescimento e maximização de LTV.

══ DNA DO NEGÓCIO ══
- Público: Mulheres 25-45, revendedoras, lojistas, empreendedoras digitais
- Atacado: Pedido mínimo 5 pares, entrega 5-7 dias úteis
- Grades Personalizadas: Mínimo 2 grades, logo da cliente, 15-20 dias produção
- C4 Franquias: Site pronto para revenda, suporte marketing, investimento zero
- Frete grátis: Pedidos acima de R$2.000

══ MISSÃO CRÍTICA ══
Faturamento atual: R$40k/mês → Meta: R$200k/mês (gap de R$160k)

3 PILARES DE CRESCIMENTO:
1. REATIVAÇÃO (60% = R$96k): Recuperar clientes inativos de alto valor
2. UPSELL/CROSS-SELL (25% = R$40k): Elevar ticket médio R$500→R$1.200+
3. NOVOS NEGÓCIOS (15% = R$24k): Converter leads, expandir C4 Franquias

══ SEGMENTAÇÃO ESTRATÉGICA ══

TIER 1 - DIAMANTES PERDIDOS (PRIORIDADE MÁXIMA):
Ex-compradoras de grades personalizadas, ticket >R$2.000, inativas 30+ dias
Potencial: R$60-80k/mês | Ação: Recuperação imediata com oferta premium

TIER 2 - OURO EM PAUSA:
Compradoras recorrentes atacado, ticket R$800-1.500, inativas 30-60 dias
Potencial: R$40-50k/mês | Ação: Upsell para grade personalizada

TIER 3 - PRATA ADORMECIDA:
Compradoras ocasionais, ticket R$500-800, inativas 60-90 dias
Potencial: R$20-30k/mês | Ação: Reengajamento com novidades

TIER 4 - BRONZE FRIA:
Compradoras teste (1-2 pedidos), ticket <R$500, inativas 90+ dias
Potencial: R$10-15k/mês | Ação: Campanha automatizada

══ METODOLOGIA RAPIDA ══
R-Reconhecer contexto | A-Analisar dados silenciosamente | P-Processar oportunidades | I-Informar com dados | D-Direcionar ação | A-Automatizar próximo passo

══ REGRAS CRÍTICAS ══

1. LINGUAGEM NATURAL: Usuário fala "quem comprou a Soft" → você interpreta e executa. NUNCA peça JSON ou dados formatados.
2. INVISIBILIDADE TÉCNICA: Mostre RESULTADOS, nunca nomes de função. "Encontrei 23 clientes" e não "Vou usar findClientsByProductHistory".
3. INTEGRIDADE DE DADOS: NUNCA invente dados. Só responda com dados REAIS do sistema. Sem dados: "Não encontrei essa informação no sistema".
4. Se erro técnico: "Tive um problema ao consultar. Pode pedir ao desenvolvedor verificar os logs?"

5. DISTINÇÃO PEDIDO vs TICKET:
   - "pedidos acima de R$300" = cada pedido individual ≥ R$300
   - "ticket médio acima de R$300" = média de todos os pedidos ≥ R$300
   - "total gasto acima de R$300" = soma de todos os pedidos ≥ R$300

══ ESTRATÉGIA ANTI-CUPOM (Maximize Margem) ══
NUNCA ofereça desconto primeiro! Hierarquia de abordagem:
1. REPOSIÇÃO: "Como estão as vendas? Estoque baixou?"
2. LANÇAMENTO EXCLUSIVO: "Coleção nova, quer garantir antes do público?"
3. UPSELL: "Vi que você adora a linha [X]. Temos modelo similar bombando!"
4. FEEDBACK: "Suas clientes comentaram algo sobre o conforto?"
5. CROSS-SELL: "Quem compra [A] normalmente combina com [B]"
Cupom APENAS: Cliente inativa >6 meses + não respondeu 2+ mensagens anteriores.

══ TÁTICAS DE FECHAMENTO ══

TÁTICA 1 "EXCLUSIVIDADE + URGÊNCIA" (Tier 1): Status VIP + novidade exclusiva + benefício concreto + urgência real
TÁTICA 2 "EVOLUÇÃO DE NEGÓCIO" (Tier 2): Validar sucesso + apresentar próxima etapa + prova social + ROI claro
TÁTICA 3 "FRETE GRÁTIS REVERSO" (pedidos R$1.200-1.900): Mostrar economia + sugerir produto complementar + cálculo real
TÁTICA 4 "RESGATE DE RELACIONAMENTO" (Tier 1-2 >90 dias): Vulnerabilidade genuína + pergunta sobre insatisfação + oferta de solução
TÁTICA 5 "C4 FRANQUIAS" (3+ pedidos, ticket >R$1k): Reconhecimento + oportunidade maior + benefícios tangíveis + processo simples

══ SINAIS DE ALERTA ══
EMERGÊNCIA: Tier 1 inativa >45 dias | Queda >50% no ticket | Migrou de grade pra atacado simples
URGENTE: Tier 2 inativa >30 dias | 2+ pedidos abaixo da média | Próxima do frete grátis mas não fecha
ATENÇÃO: VIP inativa >30 dias | Primeira queda no padrão | Nunca testou grade personalizada

══ FORMATO DE RESPOSTA ══
1. DIAGNÓSTICO: Dados concretos (números, nomes, datas, classificação por tier)
2. ANÁLISE: O que significa comercialmente + oportunidades + riscos
3. PLANO: Tática recomendada + segmentação + timing
4. MENSAGEM PRONTA: Copy personalizado com dados reais + CTA claro
5. PRÓXIMO PASSO: Ação pós-resposta + métricas + alternativa

══ TOM DE VOZ ══
Assertiva, estratégica, urgente (sem desespero), empática, consultiva, orientada a resultado.
Use números concretos, nomes reais, valores em R$, prazos definidos, CTAs imperativos.
Máximo 1-2 emojis por resposta (apenas estratégico). Sem linguagem vaga.

══ MODO PROATIVO ══
Identifique e alerte sobre: VIPs inativos >21 dias | Estoque parado >60 dias | Quedas >20% | Aniversariantes | Clientes próximos do frete grátis | Potenciais C4.

Sempre termine com: sugestão de ação ou pergunta "Que análise ou ação comercial posso fazer agora?"`;

// ============================================================================
// DEFINIÇÃO DAS FERRAMENTAS (FUNCTION CALLING) - VERSÃO CEO
// ============================================================================

const TOOLS = [
    // === NOVAS FERRAMENTAS CEO ===
    {
        type: "function",
        function: {
            name: "analyzeStockOpportunity",
            description: "Analisa estoque parado e cruza com preferências de clientes para encontrar oportunidades de venda. Use quando perguntarem sobre girar estoque, produtos parados, ou oportunidades de venda.",
            parameters: {
                type: "object",
                properties: {
                    minStock: {
                        type: "integer",
                        description: "Estoque mínimo para considerar 'parado' (padrão: 10)"
                    },
                    daysWithoutSale: {
                        type: "integer",
                        description: "Dias sem venda para considerar parado (padrão: 30)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getStockSummary",
            description: "Retorna o valor total do estoque, quantidade de produtos e lista completa. Use quando perguntarem 'qual o valor do estoque', 'quanto tem em estoque', 'resumo do estoque', 'produtos cadastrados'.",
            parameters: {
                type: "object",
                properties: {
                    onlyWithStock: {
                        type: "boolean",
                        description: "Se true, retorna apenas produtos com estoque > 0 (padrão: false)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findC4Candidates",
            description: "Identifica clientes com potencial para se tornarem franqueadas C4 (site próprio). Busca quem compra frequentemente mas com ticket baixo.",
            parameters: {
                type: "object",
                properties: {
                    minOrders: {
                        type: "integer",
                        description: "Mínimo de pedidos nos últimos 60 dias (padrão: 4)"
                    },
                    maxTicket: {
                        type: "number",
                        description: "Ticket máximo por pedido em reais (padrão: 300)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generatePersonalizedCopy",
            description: "Gera mensagens personalizadas RELACIONAIS para diferentes perfis de cliente. IMPORTANTE: Prioriza relacionamento e valor, NÃO cupons. Cria 3 variações de copy prontas para usar.",
            parameters: {
                type: "object",
                properties: {
                    profile: {
                        type: "string",
                        enum: ["reposicao", "novidade_exclusiva", "feedback", "atacadao", "varejinho", "c4_upsell", "aniversario", "escassez", "ultimo_caso_cupom"],
                        description: "Perfil/gancho da mensagem. PRIORIZE: reposicao, novidade_exclusiva, feedback. Use ultimo_caso_cupom APENAS se cliente estiver inativo há 6+ meses E já recebeu outras mensagens."
                    },
                    clientName: {
                        type: "string",
                        description: "Nome do cliente (opcional, usa {nome} se não informado)"
                    },
                    productName: {
                        type: "string",
                        description: "Nome do produto para mencionar (opcional)"
                    },
                    discountOrOffer: {
                        type: "string",
                        description: "Oferta ou desconto a mencionar (opcional)"
                    }
                },
                required: ["profile"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getMorningBriefing",
            description: "Gera o relatório matinal completo com insights prontos para ação. Use quando perguntarem 'como estamos', 'briefing', 'resumo do dia'.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyzeCohort",
            description: "Analisa a retenção de clientes por cohort (mês de primeira compra). Identifica padrões de recompra e clientes que precisam de atenção.",
            parameters: {
                type: "object",
                properties: {
                    months: {
                        type: "integer",
                        description: "Quantos meses analisar (padrão: 6)"
                    }
                }
            }
        }
    },
    // === FERRAMENTAS EXISTENTES (MELHORADAS) ===
    {
        type: "function",
        function: {
            name: "findClientsByProductHistory",
            description: "Busca clientes que compraram um produto específico. Útil para reposição de estoque ou lançamentos similares.",
            parameters: {
                type: "object",
                properties: {
                    productName: {
                        type: "string",
                        description: "Nome ou parte do nome do produto (ex: 'Rasteirinha Soft')"
                    },
                    minQuantity: {
                        type: "integer",
                        description: "Quantidade mínima que o cliente comprou (padrão: 4)"
                    },
                    period: {
                        type: "string",
                        description: "Período de análise: 'last_year', 'last_6_months', 'last_3_months'"
                    }
                },
                required: ["productName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findBirthdays",
            description: "Lista clientes que fazem aniversário em um determinado mês. Ótimo para enviar mimos ou cupons.",
            parameters: {
                type: "object",
                properties: {
                    month: {
                        type: "integer",
                        description: "Mês do aniversário (1-12). Se não informado, usa o mês atual."
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findVipClients",
            description: "Busca clientes VIP (alto ticket) que podem estar inativos ou ativos.",
            parameters: {
                type: "object",
                properties: {
                    minTicket: {
                        type: "number",
                        description: "Ticket médio mínimo em reais (padrão: 500)"
                    },
                    status: {
                        type: "string",
                        enum: ["active", "inactive", "all"],
                        description: "Status do cliente: 'active' (comprou últimos 30 dias), 'inactive' (não compra há 30+ dias), 'all'"
                    },
                    inactiveDays: {
                        type: "integer",
                        description: "Dias sem comprar para considerar inativo (padrão: 30)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyzeSalesDrop",
            description: "Analisa a queda de vendas comparando períodos e identifica clientes que pararam de comprar (churn).",
            parameters: {
                type: "object",
                properties: {
                    compareMonths: {
                        type: "integer",
                        description: "Quantos meses comparar (padrão: 3)"
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findClientsByOrderValue",
            description: "Busca clientes que fizeram PEDIDOS INDIVIDUAIS acima ou abaixo de um valor. Diferente de ticket médio - aqui olha cada pedido separadamente. Use quando perguntarem 'clientes com pedidos acima de X' ou 'pedidos maiores que X'.",
            parameters: {
                type: "object",
                properties: {
                    minOrderValue: {
                        type: "number",
                        description: "Valor mínimo do pedido individual em reais (ex: 300)"
                    },
                    maxOrderValue: {
                        type: "number",
                        description: "Valor máximo do pedido individual em reais (opcional)"
                    },
                    period: {
                        type: "string",
                        enum: ["all", "2024", "2025", "last30days", "last60days", "last90days"],
                        description: "Período para filtrar os pedidos (padrão: all)"
                    }
                },
                required: ["minOrderValue"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getClientStats",
            description: "Obtém estatísticas gerais da base de clientes.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    }
];

// ============================================================================
// NOVAS FUNÇÕES CEO - SUPERPODERES
// ============================================================================

// 0. RESUMO DO ESTOQUE (Stock Summary)
async function getStockSummary(onlyWithStock = false) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        // Buscar TODOS os produtos
        let query = supabase
            .from('products')
            .select('*')
            .order('stock', { ascending: false });
        
        if (onlyWithStock) {
            query = query.gt('stock', 0);
        }

        const { data: products, error } = await query;

        if (error) throw error;

        if (!products || products.length === 0) {
            return {
                summary: '⚠️ Nenhum produto cadastrado na tabela "products" do Supabase.',
                totalProducts: 0,
                totalUnits: 0,
                totalValue: 0,
                hint: 'A tabela products está vazia. É preciso cadastrar os produtos com estoque para a Anny analisar.'
            };
        }

        // Calcular totais
        let totalUnits = 0;
        let totalValue = 0;
        const productList = [];

        for (const product of products) {
            const stock = product.stock || 0;
            const price = product.price || product.preco || 0;
            const value = stock * price;
            
            totalUnits += stock;
            totalValue += value;

            if (stock > 0 || !onlyWithStock) {
                productList.push({
                    nome: product.name || product.nome || 'Sem nome',
                    codigo: product.codigo || product.sku || '-',
                    estoque: stock,
                    preco: price,
                    valorEmEstoque: value
                });
            }
        }

        // Top 10 por valor em estoque
        const top10ByValue = [...productList]
            .sort((a, b) => b.valorEmEstoque - a.valorEmEstoque)
            .slice(0, 10);

        // Produtos sem estoque
        const withoutStock = productList.filter(p => p.estoque === 0).length;
        const withStock = productList.length - withoutStock;

        return {
            summary: `📦 ESTOQUE TOTAL: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            totalProducts: products.length,
            productsWithStock: withStock,
            productsWithoutStock: withoutStock,
            totalUnits: totalUnits,
            totalValue: totalValue,
            top10ByValue: top10ByValue,
            allProducts: productList,
            columns: ['nome', 'codigo', 'estoque', 'preco', 'valorEmEstoque'],
            insight: totalUnits > 0 
                ? `Você tem ${totalUnits} unidades em ${withStock} produtos diferentes, totalizando R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em estoque.`
                : 'Todos os produtos estão com estoque zerado.'
        };
    } catch (error) {
        console.error('getStockSummary error:', error);
        return { error: error.message };
    }
}

// 1. ANALISTA DE ESTOQUE VS DEMANDA (Opportunity Finder)
async function analyzeStockOpportunity(minStock = 10, daysWithoutSale = 30) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        // Buscar produtos com estoque alto
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('*')
            .gte('stock', minStock)
            .order('stock', { ascending: false });

        if (prodError) throw prodError;

        // Buscar pedidos recentes para ver o que está vendendo
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysWithoutSale);

        const { data: recentOrders, error: ordError } = await supabase
            .from('orders')
            .select('products, data')
            .gte('data', cutoffDate.toISOString());

        if (ordError) throw ordError;

        // Contar vendas recentes por produto
        const recentSales = {};
        (recentOrders || []).forEach(order => {
            const prods = typeof order.products === 'string' ? JSON.parse(order.products) : order.products;
            if (Array.isArray(prods)) {
                prods.forEach(p => {
                    const name = (p.nome || p.name || '').toLowerCase();
                    recentSales[name] = (recentSales[name] || 0) + (p.quantidade || p.qty || 1);
                });
            }
        });

        // Identificar produtos parados (estoque alto, vendas baixas)
        const opportunities = [];
        for (const product of (products || [])) {
            const productName = (product.name || product.nome || '').toLowerCase();
            const recentSalesCount = recentSales[productName] || 0;
            
            // Se tem mais estoque do que vendeu recentemente, é oportunidade
            if (product.stock > recentSalesCount * 2) {
                // Buscar clientes que já compraram este produto ou similar
                const { data: clientsWhoLike } = await supabase
                    .from('orders')
                    .select('client_id, client_name, client_phone')
                    .ilike('products', `%${product.name || product.nome}%`)
                    .limit(20);

                // Remover duplicados
                const uniqueClients = [];
                const seen = new Set();
                (clientsWhoLike || []).forEach(c => {
                    if (!seen.has(c.client_id)) {
                        seen.add(c.client_id);
                        uniqueClients.push(c);
                    }
                });

                opportunities.push({
                    product: product.name || product.nome,
                    stock: product.stock,
                    price: product.price || product.preco,
                    recentSales: recentSalesCount,
                    potentialRevenue: (product.stock * (product.price || product.preco || 50)),
                    interestedClients: uniqueClients.slice(0, 10),
                    clientCount: uniqueClients.length
                });
            }
        }

        // Ordenar por potencial de receita
        opportunities.sort((a, b) => b.potentialRevenue - a.potentialRevenue);

        const topOpportunities = opportunities.slice(0, 5);
        const totalPotential = topOpportunities.reduce((sum, o) => sum + o.potentialRevenue, 0);

        return {
            data: topOpportunities,
            columns: ['product', 'stock', 'recentSales', 'clientCount', 'potentialRevenue'],
            summary: `🎯 ${opportunities.length} produtos parados encontrados! Potencial de R$ ${totalPotential.toLocaleString('pt-BR')} em estoque.`,
            insights: topOpportunities.map(o => ({
                message: `"${o.product}" tem ${o.stock} pares parados. Encontrei ${o.clientCount} clientes que gostam deste modelo.`,
                suggestedAction: `Oferta relâmpago para os ${o.clientCount} clientes com desconto de 15%`,
                clients: o.interestedClients
            }))
        };
    } catch (error) {
        console.error('analyzeStockOpportunity error:', error);
        return { error: error.message };
    }
}

// 2. IDENTIFICADOR DE CANDIDATAS C4 FRANQUIAS
async function findC4Candidates(minOrders = 4, maxTicket = 300) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // Buscar pedidos dos últimos 60 dias
        const { data: orders, error } = await supabase
            .from('orders')
            .select('client_id, client_name, client_phone, total, data')
            .gte('data', sixtyDaysAgo.toISOString())
            .order('data', { ascending: false });

        if (error) throw error;

        // Agrupar por cliente
        const clientStats = {};
        (orders || []).forEach(order => {
            const id = order.client_id;
            if (!clientStats[id]) {
                clientStats[id] = {
                    id,
                    name: order.client_name,
                    phone: order.client_phone,
                    orderCount: 0,
                    totalSpent: 0,
                    orderDates: []
                };
            }
            clientStats[id].orderCount++;
            clientStats[id].totalSpent += parseFloat(order.total || 0);
            clientStats[id].orderDates.push(new Date(order.data));
        });

        // Filtrar candidatos C4: muitos pedidos, ticket baixo
        const candidates = Object.values(clientStats)
            .filter(c => {
                const avgTicket = c.totalSpent / c.orderCount;
                return c.orderCount >= minOrders && avgTicket <= maxTicket;
            })
            .map(c => {
                const avgTicket = c.totalSpent / c.orderCount;
                // Calcular frequência (dias entre pedidos)
                c.orderDates.sort((a, b) => a - b);
                let avgDaysBetween = 0;
                if (c.orderDates.length > 1) {
                    const totalDays = (c.orderDates[c.orderDates.length - 1] - c.orderDates[0]) / (1000 * 60 * 60 * 24);
                    avgDaysBetween = Math.round(totalDays / (c.orderDates.length - 1));
                }
                
                return {
                    ...c,
                    avgTicket: Math.round(avgTicket),
                    avgDaysBetween,
                    c4Score: Math.round((c.orderCount * 10) + (100 / (avgDaysBetween || 1))),
                    suggestedMessage: `Oi ${c.name.split(' ')[0]}! Vi que você compra toda semana e está arrasando nas vendas! 🔥 Já pensou em ter seu SITE PRÓPRIO com nosso estoque? No C4 Franquias você tem sua loja online pronta. Quer saber mais?`
                };
            })
            .sort((a, b) => b.c4Score - a.c4Score);

        return {
            data: candidates.slice(0, 20),
            columns: ['name', 'phone', 'orderCount', 'avgTicket', 'avgDaysBetween', 'c4Score'],
            summary: `🚀 ${candidates.length} candidatas perfeitas para C4 Franquias! Essas clientes compram frequentemente mas em pequenas quantidades - site próprio aumentaria o ticket.`,
            topCandidate: candidates[0] ? {
                name: candidates[0].name,
                insight: `${candidates[0].name} fez ${candidates[0].orderCount} pedidos em 60 dias, comprando a cada ${candidates[0].avgDaysBetween} dias. Ticket médio de R$ ${candidates[0].avgTicket}. PERFIL IDEAL para C4!`,
                message: candidates[0].suggestedMessage
            } : null
        };
    } catch (error) {
        console.error('findC4Candidates error:', error);
        return { error: error.message };
    }
}

// 3. GERADOR DE COPY PERSONALIZADA (Copywriter Dinâmica) - ESTRATÉGIA RELACIONAL
// PRIORIDADE: Relacionamento > Escassez > Novidade > Cupom (ÚLTIMO CASO)
async function generatePersonalizedCopy(profile, clientName = '{nome}', productName = '', discountOrOffer = '') {
    const templates = {
        // === GANCHOS RELACIONAIS (PRIORIDADE MÁXIMA) ===
        reposicao: {
            description: '🎯 GANCHO A - Serviço Útil: Cliente que comprou há 30-60 dias',
            priority: 1,
            variations: [
                `Oi ${clientName}! Vi que faz um tempinho que você levou ${productName ? `a ${productName}` : 'o último pedido'}. Como estão as vendas aí? O estoque baixou? Posso separar uma reposição pra não faltar!`,
                `${clientName}, tudo bem? 😊 Passando pra saber como está o giro ${productName ? `da ${productName}` : 'dos produtos'}. Suas clientes estão gostando? Se precisar repor, é só me avisar que separo rapidinho!`,
                `Ei ${clientName}! Lembrei de você! ${productName ? `A ${productName}` : 'O modelo'} que você levou está vendendo bem por aí? Se o estoque tiver baixando, me conta que preparo uma reposição especial!`
            ]
        },
        novidade_exclusiva: {
            description: '🎯 GANCHO B - Curiosidade: Cliente que comprava sempre e parou',
            priority: 2,
            variations: [
                `Oi ${clientName}, sumida! 😊 Acabamos de lançar ${productName || 'a coleção nova'} e lembrei muito do seu gosto. Ainda não postei no Instagram, quer ver em primeira mão?`,
                `${clientName}! Tenho uma novidade que é a sua cara! 🔥 ${productName || 'Modelo novo'} fresquinho, acabou de sair da produção. Você vai ser a primeira a ver. Mando as fotos?`,
                `Ei ${clientName}! Tô guardando uma exclusividade pra você! ${productName || 'Lançamento'} que ainda não mostrei pra ninguém. Acho que suas clientes vão amar. Posso te mostrar antes de abrir pro público?`
            ]
        },
        feedback: {
            description: '🎯 GANCHO C - Empatia: Cliente que comprou 1-2 vezes e não voltou',
            priority: 3,
            variations: [
                `Oi ${clientName}, tudo bem? Vi que você comprou ${productName || 'a rasteirinha'} há um tempo. O que achou do conforto? Queria muito seu feedback pra melhorar nossa produção! 💕`,
                `${clientName}! Passando pra saber: como foi a experiência com ${productName || 'o pedido'}? Suas clientes gostaram? Sua opinião é super importante pra gente!`,
                `Ei ${clientName}, tudo certo? 😊 Queria saber se ${productName || 'os produtos'} chegaram direitinho e se você curtiu a qualidade. Me conta! Adoro ouvir feedback das revendedoras.`
            ]
        },
        escassez: {
            description: '⚡ GATILHO DE ESCASSEZ: Estoque baixo do produto favorito',
            priority: 4,
            variations: [
                `${clientName}! Aviso importante: ${productName || 'aquele modelo que você adora'} está com estoque baixo e não sei quando volta. Se quiser garantir, me avisa que separo!`,
                `Oi ${clientName}! Lembrei de você porque ${productName || 'a rasteirinha favorita'} está acabando. Últimas unidades! Quer que eu reserve antes que acabe?`,
                `${clientName}, corre aqui! 🏃‍♀️ ${productName || 'O modelo best-seller'} tá voando e sobrou pouco. Suas clientes vão cobrar se faltar, hein! Reservo pra você?`
            ]
        },
        // === GANCHOS DE VALOR (SEM CUPOM) ===
        atacadao: {
            description: 'Cliente que compra grade fechada, foca em margem e qualidade',
            priority: 5,
            variations: [
                `Oi ${clientName}! 💼 Chegou GRADE NOVA ${productName ? `da ${productName}` : ''} direto da fábrica! Margem garantida de 100%+ na revenda. Quer que eu separe?`,
                `${clientName}, bom dia! Lembrei de você quando vi essa ${productName || 'novidade'}. Qualidade premium, suas clientes vão notar a diferença. Mando as fotos?`,
                `Fala ${clientName}! 🏭 Saiu do forno: ${productName || 'novo modelo'}. Prazo de fabricação: 15 dias com sua LOGO na palmilha. Exclusividade total! Vamos fechar?`
            ]
        },
        varejinho: {
            description: 'Cliente que compra sortido para Instagram/loja pequena',
            priority: 5,
            variations: [
                `Oi ${clientName}! 📸 Chegou a ${productName || 'novidade'} que vai BOMBAR no seu Instagram! Já separei as melhores fotos pra você. Quer ver?`,
                `${clientName}! As clientes vão pirar! 😍 ${productName || 'Nova coleção'} com cores tendência. Perfeita pro feed! Mando o catálogo?`,
                `Ei ${clientName}! Sabe aquele modelo que suas clientes pedem? Chegou! ${productName || ''} pronta entrega. Fotos profissionais inclusas. Bora?`
            ]
        },
        c4_upsell: {
            description: 'Candidata a franqueada C4',
            priority: 5,
            variations: [
                `${clientName}! 🚀 Você vende MUITO bem! Já pensou em ter seu SITE PRÓPRIO com nosso estoque? No C4 Franquias você tem sua loja online pronta, sem investir em estoque. Quer conhecer?`,
                `Oi ${clientName}! Vi seu histórico e você é uma das nossas melhores revendedoras! 🌟 Tenho uma proposta: que tal ter sua própria LOJA VIRTUAL com a marca Cjota? Projeto C4 Franquias. Posso explicar?`,
                `${clientName}, parabéns pelas vendas! 🎉 Você tem perfil de FRANQUEADA! Imagina ter um site com seu nome, nosso estoque e zero preocupação com logística? É o C4. Bora conversar?`
            ]
        },
        aniversario: {
            description: 'Cliente aniversariante - mimo especial (pode ter brinde, mas foco no carinho)',
            priority: 5,
            variations: [
                `${clientName}! 🎂 FELIZ ANIVERSÁRIO! A Cjota lembrou do seu dia especial! Preparamos um mimo pra você. O que você quer de presente?`,
                `Parabéns ${clientName}! 🎉 Seu dia especial merece um carinho da gente! Temos um brinde surpresa esperando você. Aceita?`,
                `FELIZ ANIVERSÁRIO ${clientName}! 🥳 Não podíamos deixar passar! Que tal comemorar escolhendo ${productName || 'aquele modelo que você ama'}? Presente da Cjota pra você!`
            ]
        },
        // === ÚLTIMO CASO (CUPOM) - SÓ USAR SE NADA FUNCIONOU ===
        ultimo_caso_cupom: {
            description: '⚠️ ÚLTIMO RECURSO: Cliente inativo há 6+ MESES que já recebeu outras mensagens SEM SUCESSO',
            priority: 99,
            warning: 'ATENÇÃO: Só use este perfil se o cliente estiver inativo há mais de 6 meses E já recebeu mensagens de reposição, novidade e feedback sem responder!',
            variations: [
                `Oi ${clientName}! Faz muito tempo que não te vemos... 💕 Preparei um cupom especial só pra você voltar: ${discountOrOffer || 'VOLTE15 com 15% OFF'}. O que acha de matar a saudade?`,
                `${clientName}, sentimos sua falta! 🥺 Sei que faz tempo, então preparei algo especial: ${discountOrOffer || 'frete grátis no próximo pedido'}. Bora recomeçar?`,
                `Ei ${clientName}! Última tentativa de te trazer de volta... 😅 ${discountOrOffer || 'Cupom SAUDADE com 20% OFF'} esperando você. Posso te mostrar as novidades?`
            ]
        }
    };

    const template = templates[profile] || templates.reposicao;
    
    // Adiciona aviso se for perfil de cupom
    const cupomWarning = profile === 'ultimo_caso_cupom' 
        ? '⚠️ ATENÇÃO: Cupom deve ser ÚLTIMO RECURSO! Só use se: (1) Cliente inativo há 6+ meses E (2) Já tentou mensagens de relacionamento sem sucesso.'
        : null;
    
    // Sugere alternativas relacionais se tentarem usar cupom
    const alternatives = profile === 'ultimo_caso_cupom' ? {
        suggestion: '💡 ANTES DO CUPOM, TENTE:',
        options: [
            '1. REPOSIÇÃO: Pergunte como estão as vendas do último pedido',
            '2. NOVIDADE: Ofereça ver a coleção nova em primeira mão',
            '3. FEEDBACK: Peça opinião sobre o conforto do produto'
        ]
    } : null;

    return {
        profile,
        priority: template.priority,
        description: template.description,
        variations: template.variations,
        warning: cupomWarning,
        alternatives: alternatives,
        summary: `📝 3 variações de mensagem para perfil "${profile}" geradas!`,
        tip: profile === 'ultimo_caso_cupom' 
            ? '⚠️ CUPOM = ÚLTIMO RECURSO! Priorize sempre relacionamento e valor do produto.'
            : '💡 Dica: Mensagens relacionais geram mais respostas que cupons! Foque em AJUDAR a cliente, não em vender.'
    };
}

// 4.5 DASHBOARD BI DATA (espelho do /api/anny/dashboard do server.js)
async function getDashboardData() {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const now = new Date();

        const [clientsRes, ordersRes] = await Promise.all([
            supabase.from('clients').select('id, name, phone, email, total_spent, order_count, last_purchase_date').order('total_spent', { ascending: false }).limit(2000),
            supabase.from('orders').select('client_id, client_name, total, data').order('data', { ascending: false }).limit(5000)
        ]);

        const clients = clientsRes.data || [];
        const orders = ordersRes.data || [];

        const enriched = clients.map(c => {
            const lp = c.last_purchase_date ? new Date(c.last_purchase_date) : null;
            const daysInactive = lp ? Math.floor((now - lp) / 864e5) : 999;
            const avgTicket = c.order_count > 0 ? Math.round(c.total_spent / c.order_count) : 0;
            const clientOrders = orders.filter(o => o.client_id === c.id).map(o => new Date(o.data)).sort((a, b) => a - b);
            let cycle = 0;
            if (clientOrders.length > 1) {
                const totalDays = (clientOrders[clientOrders.length - 1] - clientOrders[0]) / 864e5;
                cycle = Math.round(totalDays / (clientOrders.length - 1));
            }
            let tier = 4;
            if (c.total_spent >= 2000 && c.order_count >= 3) tier = 1;
            else if (c.total_spent >= 800 && c.order_count >= 2) tier = 2;
            else if (c.total_spent >= 500) tier = 3;
            return { ...c, days_inactive: daysInactive, avg_ticket: avgTicket, cycle, tier };
        });

        // UTI
        const uti = enriched
            .filter(c => c.total_spent >= 500 && c.days_inactive > 30)
            .sort((a, b) => b.total_spent - a.total_spent)
            .slice(0, 20);

        // Oportunidades
        const opportunities = enriched
            .filter(c => c.avg_ticket >= 300 && c.days_inactive >= 15 && c.days_inactive <= 120 && c.order_count >= 2)
            .sort((a, b) => b.avg_ticket - a.avg_ticket)
            .slice(0, 20);

        // C4 Candidatos
        const ninetyAgo = new Date(now.getTime() - 90 * 864e5);
        const recentByClient = {};
        orders.forEach(o => {
            if (new Date(o.data) >= ninetyAgo && o.client_id) {
                if (!recentByClient[o.client_id]) recentByClient[o.client_id] = { count: 0, total: 0 };
                recentByClient[o.client_id].count++;
                recentByClient[o.client_id].total += parseFloat(o.total || 0);
            }
        });
        const c4Candidates = Object.entries(recentByClient)
            .filter(([_, s]) => s.count >= 3)
            .map(([id, s]) => {
                const client = enriched.find(c => String(c.id) === String(id));
                if (!client) return null;
                return { ...client, recent_orders: s.count, recent_total: s.total, recent_avg: Math.round(s.total / s.count) };
            })
            .filter(Boolean)
            .sort((a, b) => b.recent_orders - a.recent_orders)
            .slice(0, 20);

        // Recuperados
        const thirtyAgo = new Date(now.getTime() - 30 * 864e5);
        const recentBuyerIds = new Set(orders.filter(o => new Date(o.data) >= thirtyAgo).map(o => o.client_id));
        const recovered = enriched.filter(c => {
            if (!recentBuyerIds.has(c.id)) return false;
            const cOrders = orders.filter(o => o.client_id === c.id).map(o => new Date(o.data)).sort((a, b) => b - a);
            if (cOrders.length < 2) return false;
            return Math.floor((now - cOrders[1]) / 864e5) > 60;
        });
        const recoveredValue = recovered.reduce((s, c) => {
            const lastOrder = orders.filter(o => o.client_id === c.id && new Date(o.data) >= thirtyAgo);
            return s + lastOrder.reduce((ss, o) => ss + parseFloat(o.total || 0), 0);
        }, 0);

        const ltvAtRisk = uti.reduce((s, c) => s + parseFloat(c.total_spent || 0), 0);

        return {
            kpis: {
                ltvAtRisk: { value: ltvAtRisk, count: uti.length },
                opportunities: { value: opportunities.length, hotCount: opportunities.filter(c => c.days_inactive < 45).length },
                recovered: { value: recoveredValue, count: recovered.length },
                c4Potential: { value: c4Candidates.length, estimatedRevenue: c4Candidates.reduce((s, c) => s + (c.recent_total || 0), 0) }
            },
            uti,
            opportunities,
            c4Candidates,
            updatedAt: now.toISOString()
        };
    } catch (err) {
        console.error('[Dashboard Netlify] Error:', err);
        return { error: err.message };
    }
}

// 5. MORNING BRIEFING (Relatório Matinal CEO)
async function getMorningBriefing() {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const insights = [];
        const now = new Date();

        // 1. VIPs em risco de churn (45+ dias sem comprar)
        const vipRisk = await findVipClients(500, 'inactive', 45);
        if (vipRisk.data && vipRisk.data.length > 0) {
            const totalAtRisk = vipRisk.data.reduce((sum, c) => sum + parseFloat(c.total_spent || 0), 0);
            insights.push({
                type: 'alert',
                icon: '🚨',
                priority: 'high',
                title: `${vipRisk.data.length} Clientes VIPs em RISCO DE CHURN`,
                description: `R$ ${totalAtRisk.toLocaleString('pt-BR')} em valor histórico. Não compram há 45+ dias.`,
                action: 'Ligar HOJE para os 3 maiores',
                clients: vipRisk.data.slice(0, 3)
            });
        }

        // 2. Aniversariantes de hoje
        const birthdays = await findBirthdays(now.getMonth() + 1);
        const todayBirthdays = (birthdays.data || []).filter(c => {
            const bday = new Date(c.birthday);
            return bday.getDate() === now.getDate();
        });
        if (todayBirthdays.length > 0) {
            insights.push({
                type: 'opportunity',
                icon: '🎂',
                priority: 'high',
                title: `${todayBirthdays.length} Aniversariante(s) HOJE!`,
                description: 'Oportunidade de enviar cupom especial de aniversário',
                action: 'Enviar mensagem com cupom NIVER15',
                clients: todayBirthdays
            });
        }

        // 3. Meta do mês
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const { data: monthOrders } = await supabase
            .from('orders')
            .select('total')
            .gte('data', monthStart.toISOString());

        const monthRevenue = (monthOrders || []).reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
        const monthGoal = 200000;
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysPassed = now.getDate();
        const daysRemaining = daysInMonth - daysPassed;
        const dailyNeeded = daysRemaining > 0 ? (monthGoal - monthRevenue) / daysRemaining : 0;

        insights.push({
            type: 'goal',
            icon: '📊',
            priority: monthRevenue < monthGoal * 0.5 ? 'high' : 'medium',
            title: `Meta do Mês: R$ ${monthRevenue.toLocaleString('pt-BR')} / R$ ${(monthGoal / 1000)}k`,
            description: `Faltam R$ ${(monthGoal - monthRevenue).toLocaleString('pt-BR')}. Precisamos de R$ ${dailyNeeded.toLocaleString('pt-BR')}/dia.`,
            action: daysRemaining <= 10 ? 'ATIVAR campanha de recuperação urgente!' : 'Manter ritmo de vendas',
            progress: Math.round((monthRevenue / monthGoal) * 100)
        });

        // 4. Estoque parado (oportunidade)
        const stockOpp = await analyzeStockOpportunity(20, 30);
        if (stockOpp.data && stockOpp.data.length > 0) {
            const topProduct = stockOpp.data[0];
            insights.push({
                type: 'opportunity',
                icon: '📦',
                priority: 'medium',
                title: `${stockOpp.data.length} Produtos com estoque parado`,
                description: `"${topProduct.product}" tem ${topProduct.stock} pares. ${topProduct.clientCount} clientes interessados.`,
                action: `Criar oferta relâmpago da "${topProduct.product}"`,
                potentialRevenue: topProduct.potentialRevenue
            });
        }

        // 5. Candidatas C4
        const c4 = await findC4Candidates(4, 300);
        if (c4.data && c4.data.length > 0) {
            insights.push({
                type: 'upsell',
                icon: '🚀',
                priority: 'low',
                title: `${c4.data.length} Candidatas para C4 Franquias`,
                description: c4.topCandidate ? `${c4.topCandidate.name} é a top candidata!` : 'Clientes que compram frequentemente',
                action: 'Apresentar o programa C4 essa semana',
                topCandidate: c4.topCandidate
            });
        }

        // Ordenar por prioridade
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return {
            greeting: getGreeting(),
            date: now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            insights: insights.slice(0, 5),
            summary: `☀️ ${getGreeting()}, Chefe! Hoje temos ${insights.filter(i => i.priority === 'high').length} alertas urgentes e ${insights.filter(i => i.type === 'opportunity').length} oportunidades de venda.`,
            quickActions: [
                insights.find(i => i.priority === 'high')?.action || 'Verificar pedidos pendentes',
                'Postar novidade no Instagram',
                'Responder mensagens do WhatsApp'
            ]
        };
    } catch (error) {
        console.error('getMorningBriefing error:', error);
        return { error: error.message };
    }
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

// 5. ANÁLISE DE COHORT (Retenção Real)
async function analyzeCohort(months = 6) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

        // Buscar todos os pedidos do período
        const { data: orders, error } = await supabase
            .from('orders')
            .select('client_id, client_name, client_phone, total, data')
            .gte('data', startDate.toISOString())
            .order('data', { ascending: true });

        if (error) throw error;

        // Agrupar clientes por mês da primeira compra (cohort)
        const clientFirstPurchase = {};
        const clientPurchaseMonths = {};

        (orders || []).forEach(order => {
            const clientId = order.client_id;
            const orderDate = new Date(order.data);
            const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;

            if (!clientFirstPurchase[clientId]) {
                clientFirstPurchase[clientId] = {
                    id: clientId,
                    name: order.client_name,
                    phone: order.client_phone,
                    cohort: monthKey,
                    firstPurchaseDate: order.data
                };
                clientPurchaseMonths[clientId] = new Set();
            }
            clientPurchaseMonths[clientId].add(monthKey);
        });

        // Analisar retenção por cohort
        const cohorts = {};
        Object.values(clientFirstPurchase).forEach(client => {
            const cohort = client.cohort;
            if (!cohorts[cohort]) {
                cohorts[cohort] = {
                    month: cohort,
                    totalClients: 0,
                    retained: 0,
                    churned: 0,
                    champions: [],
                    atRisk: []
                };
            }

            const purchaseMonths = clientPurchaseMonths[client.id];
            cohorts[cohort].totalClients++;

            if (purchaseMonths.size >= 3) {
                cohorts[cohort].retained++;
                cohorts[cohort].champions.push(client);
            } else if (purchaseMonths.size === 1) {
                cohorts[cohort].churned++;
            } else {
                const lastPurchaseMonth = [...purchaseMonths].sort().pop();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                if (lastPurchaseMonth < currentMonth) {
                    cohorts[cohort].atRisk.push(client);
                } else {
                    cohorts[cohort].retained++;
                }
            }
        });

        // Calcular métricas
        const cohortData = Object.values(cohorts)
            .sort((a, b) => a.month.localeCompare(b.month))
            .map(c => ({
                ...c,
                retentionRate: c.totalClients > 0 ? Math.round((c.retained / c.totalClients) * 100) : 0,
                churnRate: c.totalClients > 0 ? Math.round((c.churned / c.totalClients) * 100) : 0,
                championsCount: c.champions.length,
                atRiskCount: c.atRisk.length
            }));

        const allAtRisk = cohortData.flatMap(c => c.atRisk);
        const allChampions = cohortData.flatMap(c => c.champions);

        return {
            data: cohortData.map(c => ({
                month: c.month,
                totalClients: c.totalClients,
                retained: c.retained,
                churned: c.churned,
                retentionRate: c.retentionRate,
                championsCount: c.championsCount,
                atRiskCount: c.atRiskCount
            })),
            columns: ['month', 'totalClients', 'retained', 'churned', 'retentionRate'],
            summary: `📈 Análise de ${months} meses: ${allChampions.length} clientes fiéis (3+ compras), ${allAtRisk.length} em risco de churn.`,
            insights: {
                champions: allChampions.slice(0, 5),
                atRisk: allAtRisk.slice(0, 10),
                avgRetention: cohortData.length > 0 
                    ? Math.round(cohortData.reduce((sum, c) => sum + c.retentionRate, 0) / cohortData.length)
                    : 0
            },
            recommendation: allAtRisk.length > 5 
                ? `⚠️ ALERTA: ${allAtRisk.length} clientes compraram mais de uma vez mas pararam. Priorize reconquistá-los!`
                : '✅ Retenção saudável! Continue engajando os clientes fiéis.'
        };
    } catch (error) {
        console.error('analyzeCohort error:', error);
        return { error: error.message };
    }
}

// ============================================================================
// FUNÇÕES EXISTENTES (MANTIDAS E OTIMIZADAS)
// ============================================================================

async function findClientsByProductHistory(productName, minQuantity = 4, period = 'last_year') {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('client_id, client_name, client_phone, products, data')
            .ilike('products', `%${productName}%`);

        if (error) throw error;

        const now = new Date();
        let dateLimit = new Date();
        if (period === 'last_year') dateLimit.setFullYear(now.getFullYear() - 1);
        else if (period === 'last_6_months') dateLimit.setMonth(now.getMonth() - 6);
        else if (period === 'last_3_months') dateLimit.setMonth(now.getMonth() - 3);

        const clientMap = {};
        (orders || []).forEach(order => {
            if (new Date(order.data) < dateLimit) return;
            
            const products = typeof order.products === 'string' ? JSON.parse(order.products) : order.products;
            const matchingProducts = (products || []).filter(p => 
                p.nome?.toLowerCase().includes(productName.toLowerCase()) ||
                p.name?.toLowerCase().includes(productName.toLowerCase())
            );

            const totalQty = matchingProducts.reduce((sum, p) => sum + (p.quantidade || p.qty || 1), 0);
            
            if (!clientMap[order.client_id]) {
                clientMap[order.client_id] = {
                    id: order.client_id,
                    name: order.client_name,
                    phone: order.client_phone,
                    total_quantity: 0,
                    order_count: 0
                };
            }
            clientMap[order.client_id].total_quantity += totalQty;
            clientMap[order.client_id].order_count++;
        });

        const results = Object.values(clientMap)
            .filter(c => c.total_quantity >= minQuantity)
            .sort((a, b) => b.total_quantity - a.total_quantity);

        if (results.length > 0) {
            const clientIds = results.map(c => c.id);
            const { data: clients } = await supabase
                .from('clients')
                .select('id, email, last_purchase_date, total_spent')
                .in('id', clientIds);

            if (clients) {
                results.forEach(r => {
                    const client = clients.find(c => c.id === r.id);
                    if (client) {
                        r.email = client.email;
                        r.last_purchase_date = client.last_purchase_date;
                        r.total_spent = client.total_spent;
                    }
                });
            }
        }

        const suggestedMessage = `Oi {nome}! Vi que você adora a ${productName}. Chegou reposição fresquinha! Quer que eu separe pra você?`;

        return {
            data: results.slice(0, 50),
            columns: ['name', 'phone', 'total_quantity', 'order_count', 'total_spent', 'last_purchase_date'],
            summary: `${results.length} clientes compraram ${productName} (${minQuantity}+ unidades)`,
            suggestedMessage
        };
    } catch (error) {
        console.error('findClientsByProductHistory error:', error);
        return { error: error.message };
    }
}

async function findBirthdays(month = null) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const targetMonth = month || (new Date().getMonth() + 1);
        
        const { data: clients, error } = await supabase
            .from('clients')
            .select('id, name, phone, email, birthday, total_spent, last_purchase_date')
            .not('birthday', 'is', null);

        if (error) throw error;

        const results = (clients || []).filter(client => {
            if (!client.birthday) return false;
            const bday = new Date(client.birthday);
            return (bday.getMonth() + 1) === targetMonth;
        }).map(client => {
            const bday = new Date(client.birthday);
            return {
                ...client,
                birthday_day: bday.getDate()
            };
        }).sort((a, b) => a.birthday_day - b.birthday_day);

        const today = new Date();
        const todayBirthdays = results.filter(c => 
            c.birthday_day === today.getDate() && targetMonth === (today.getMonth() + 1)
        );

        return {
            data: results.slice(0, 50),
            columns: ['name', 'phone', 'email', 'birthday', 'total_spent'],
            summary: `${results.length} aniversariantes em ${targetMonth}/${new Date().getFullYear()}`,
            todayCount: todayBirthdays.length,
            todayBirthdays: todayBirthdays.slice(0, 10)
        };
    } catch (error) {
        console.error('findBirthdays error:', error);
        return { error: error.message };
    }
}

async function findVipClients(minTicket = 500, status = 'inactive', inactiveDays = 30) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const { data: clients, error } = await supabase
            .from('clients')
            .select('id, name, phone, email, total_spent, order_count, last_purchase_date')
            .gte('total_spent', minTicket)
            .order('total_spent', { ascending: false });

        if (error) throw error;

        const now = new Date();

        let results = (clients || []).map(client => {
            const lastPurchase = client.last_purchase_date ? new Date(client.last_purchase_date) : null;
            const daysInactive = lastPurchase 
                ? Math.floor((now - lastPurchase) / (1000 * 60 * 60 * 24))
                : 999;
            
            return {
                ...client,
                days_inactive: daysInactive,
                is_active: daysInactive <= inactiveDays,
                avg_ticket: client.order_count > 0 ? (client.total_spent / client.order_count) : 0
            };
        });

        if (status === 'active') {
            results = results.filter(c => c.is_active);
        } else if (status === 'inactive') {
            results = results.filter(c => !c.is_active);
        }

        const totalValue = results.reduce((sum, c) => sum + parseFloat(c.total_spent || 0), 0);

        return {
            data: results.slice(0, 50),
            columns: ['name', 'phone', 'total_spent', 'order_count', 'days_inactive', 'last_purchase_date'],
            summary: `${results.length} clientes VIP ${status === 'inactive' ? 'inativos' : status === 'active' ? 'ativos' : ''} (ticket > R$${minTicket})`,
            totalValueAtRisk: status === 'inactive' ? totalValue : 0
        };
    } catch (error) {
        console.error('findVipClients error:', error);
        return { error: error.message };
    }
}

// BUSCAR CLIENTES POR VALOR DE PEDIDO INDIVIDUAL (não ticket médio!)
async function findClientsByOrderValue(minOrderValue, maxOrderValue = null, period = 'all') {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        // Buscar todos os pedidos
        let query = supabase
            .from('orders')
            .select('id, client_id, client_name, client_phone, total, data, status')
            .gte('total', minOrderValue);
        
        if (maxOrderValue) {
            query = query.lte('total', maxOrderValue);
        }

        // Filtrar por período
        if (period !== 'all') {
            const now = new Date();
            let startDate;
            
            switch (period) {
                case '2024':
                    startDate = new Date('2024-01-01');
                    query = query.gte('data', startDate.toISOString()).lte('data', '2024-12-31');
                    break;
                case '2025':
                    startDate = new Date('2025-01-01');
                    query = query.gte('data', startDate.toISOString()).lte('data', '2025-12-31');
                    break;
                case 'last30days':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    query = query.gte('data', startDate.toISOString());
                    break;
                case 'last60days':
                    startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
                    query = query.gte('data', startDate.toISOString());
                    break;
                case 'last90days':
                    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    query = query.gte('data', startDate.toISOString());
                    break;
            }
        }

        query = query.order('total', { ascending: false });

        const { data: orders, error } = await query;

        if (error) throw error;

        // Agrupar por cliente e contar pedidos acima do valor
        const clientMap = new Map();
        
        for (const order of (orders || [])) {
            const clientId = order.client_id;
            if (!clientMap.has(clientId)) {
                clientMap.set(clientId, {
                    client_id: clientId,
                    name: order.client_name,
                    phone: order.client_phone,
                    orders_above_value: [],
                    total_orders_above: 0,
                    total_value: 0
                });
            }
            
            const client = clientMap.get(clientId);
            client.orders_above_value.push({
                order_id: order.id,
                value: parseFloat(order.total),
                date: order.data
            });
            client.total_orders_above++;
            client.total_value += parseFloat(order.total || 0);
        }

        // Converter para array e ordenar por quantidade de pedidos
        const results = Array.from(clientMap.values())
            .sort((a, b) => b.total_orders_above - a.total_orders_above);

        const totalOrders = results.reduce((sum, c) => sum + c.total_orders_above, 0);
        const totalValue = results.reduce((sum, c) => sum + c.total_value, 0);

        return {
            data: results.slice(0, 50).map(c => ({
                name: c.name,
                phone: c.phone,
                pedidos_acima: c.total_orders_above,
                valor_total: c.total_value.toFixed(2),
                maior_pedido: Math.max(...c.orders_above_value.map(o => o.value)).toFixed(2)
            })),
            columns: ['name', 'phone', 'pedidos_acima', 'valor_total', 'maior_pedido'],
            summary: `📊 ${results.length} clientes fizeram ${totalOrders} pedidos acima de R$ ${minOrderValue}${maxOrderValue ? ` e abaixo de R$ ${maxOrderValue}` : ''}`,
            period: period,
            totalClients: results.length,
            totalOrders: totalOrders,
            totalValue: totalValue,
            insight: `Esses clientes têm poder de compra alto! Total movimentado: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        };
    } catch (error) {
        console.error('findClientsByOrderValue error:', error);
        return { error: error.message };
    }
}

async function analyzeSalesDrop(compareMonths = 3) {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('id, client_id, client_name, client_phone, total, data')
            .order('data', { ascending: false });

        if (error) throw error;

        const now = new Date();
        const currentStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const currentEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const previousStart = new Date(now.getFullYear(), now.getMonth() - compareMonths - 1, 1);
        const previousEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);

        const currentOrders = (orders || []).filter(o => {
            const d = new Date(o.data);
            return d >= currentStart && d <= currentEnd;
        });

        const previousOrders = (orders || []).filter(o => {
            const d = new Date(o.data);
            return d >= previousStart && d <= previousEnd;
        });

        const currentClients = new Set(currentOrders.map(o => o.client_id));
        const previousClients = new Set(previousOrders.map(o => o.client_id));
        const churnedClientIds = [...previousClients].filter(id => !currentClients.has(id));

        const { data: churnedClientsData } = await supabase
            .from('clients')
            .select('id, name, phone, email, total_spent, order_count, last_purchase_date')
            .in('id', churnedClientIds)
            .order('total_spent', { ascending: false });

        const currentRevenue = currentOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
        const previousRevenue = previousOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
        const revenueChange = previousRevenue > 0 
            ? ((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)
            : 0;

        return {
            data: (churnedClientsData || []).slice(0, 50),
            columns: ['name', 'phone', 'total_spent', 'order_count', 'last_purchase_date'],
            summary: `${churnedClientIds.length} clientes pararam de comprar (churn)`,
            analytics: {
                currentRevenue,
                previousRevenue,
                revenueChange,
                churnCount: churnedClientIds.length,
                currentClientCount: currentClients.size,
                previousClientCount: previousClients.size
            }
        };
    } catch (error) {
        console.error('analyzeSalesDrop error:', error);
        return { error: error.message };
    }
}

async function getClientStats() {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        const { data: clients, error } = await supabase
            .from('clients')
            .select('id, total_spent, order_count, last_purchase_date');

        if (error) throw error;

        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const stats = {
            totalClients: (clients || []).length,
            activeClients: 0,
            inactiveClients: 0,
            totalRevenue: 0,
            avgTicket: 0,
            vipClients: 0
        };

        (clients || []).forEach(client => {
            stats.totalRevenue += parseFloat(client.total_spent || 0);
            
            if (client.last_purchase_date && new Date(client.last_purchase_date) >= thirtyDaysAgo) {
                stats.activeClients++;
            } else {
                stats.inactiveClients++;
            }

            if (parseFloat(client.total_spent || 0) >= 500) {
                stats.vipClients++;
            }
        });

        stats.avgTicket = stats.totalClients > 0 ? stats.totalRevenue / stats.totalClients : 0;

        return {
            stats,
            summary: `Base: ${stats.totalClients} clientes | ${stats.activeClients} ativos | ${stats.vipClients} VIPs | Receita Total: R$ ${stats.totalRevenue.toLocaleString('pt-BR')}`
        };
    } catch (error) {
        console.error('getClientStats error:', error);
        return { error: error.message };
    }
}

// ============================================================================
// INSIGHTS PROATIVOS (MELHORADO)
// ============================================================================

async function generateInsights() {
    const insights = [];

    try {
        // 1. Aniversariantes de hoje
        const birthdays = await findBirthdays();
        if (birthdays.todayCount > 0) {
            insights.push({
                type: 'birthday',
                priority: 'high',
                icon: '🎂',
                title: `${birthdays.todayCount} cliente(s) fazem aniversário HOJE`,
                description: 'Envie cupom NIVER15 agora!',
                action: 'Quem faz aniversário hoje?',
                clients: birthdays.todayBirthdays
            });
        }

        // 2. VIPs inativos (URGENTE)
        const vips = await findVipClients(500, 'inactive', 45);
        if (vips.data && vips.data.length > 0) {
            insights.push({
                type: 'churn_risk',
                priority: 'high',
                icon: '🚨',
                title: `${vips.data.length} VIP(s) em RISCO DE CHURN`,
                description: `R$ ${(vips.totalValueAtRisk || 0).toLocaleString('pt-BR')} em valor histórico`,
                action: 'Quais VIPs estão inativos há mais de 45 dias?',
                clients: vips.data.slice(0, 5)
            });
        }

        // 3. Análise de churn
        const churn = await analyzeSalesDrop(3);
        if (churn.analytics && churn.analytics.churnCount > 5) {
            insights.push({
                type: 'churn',
                priority: 'medium',
                icon: '📉',
                title: `${churn.analytics.churnCount} clientes pararam de comprar`,
                description: `Variação de ${churn.analytics.revenueChange}% no faturamento`,
                action: 'Analise a queda de vendas'
            });
        }

        // 4. Oportunidade de estoque
        const stock = await analyzeStockOpportunity(30, 30);
        if (stock.data && stock.data.length > 0) {
            const topOpp = stock.data[0];
            insights.push({
                type: 'stock_opportunity',
                priority: 'medium',
                icon: '📦',
                title: `${topOpp.stock} pares de "${topOpp.product}" parados`,
                description: `${topOpp.clientCount} clientes interessados. Potencial: R$ ${topOpp.potentialRevenue.toLocaleString('pt-BR')}`,
                action: 'O que faço para girar o estoque?'
            });
        }

        // 5. Aniversariantes do mês
        const monthBirthdays = await findBirthdays();
        if (monthBirthdays.data && monthBirthdays.data.length > 0 && birthdays.todayCount === 0) {
            insights.push({
                type: 'birthday_month',
                priority: 'low',
                icon: '🎉',
                title: `${monthBirthdays.data.length} aniversariantes este mês`,
                description: 'Programe cupons especiais',
                action: 'Quem faz aniversário este mês?'
            });
        }

    } catch (error) {
        console.error('generateInsights error:', error);
    }

    return insights;
}

// ============================================================================
// CHAMADA À API GROQ
// ============================================================================

// Parser para tool calls mal-formatados pelo Llama
// Formato inválido: <function=nomeFuncao{"param":"valor"}</function>
// Também captura: <function=nomeFuncao>{"param":"valor"}</function>
function parseFailedToolCall(failedGeneration) {
    if (!failedGeneration) return null;
    
    try {
        // Padrão 1: <function=name{"key":"val"}</function>
        let match = failedGeneration.match(/<function=(\w+)\s*(\{[\s\S]*?\})\s*<\/function>/);
        if (match) {
            return {
                name: match[1],
                arguments: JSON.parse(match[2])
            };
        }
        
        // Padrão 2: <function=name>{"key":"val"}</function>
        match = failedGeneration.match(/<function=(\w+)>\s*(\{[\s\S]*?\})\s*<\/function>/);
        if (match) {
            return {
                name: match[1],
                arguments: JSON.parse(match[2])
            };
        }
        
        // Padrão 3: funcName({"key":"val"})
        match = failedGeneration.match(/(\w+)\(\s*(\{[\s\S]*?\})\s*\)/);
        if (match) {
            return {
                name: match[1],
                arguments: JSON.parse(match[2])
            };
        }

        // Padrão 4: {"name":"funcName","parameters":{"key":"val"}}
        if (failedGeneration.includes('"name"')) {
            const parsed = JSON.parse(failedGeneration);
            if (parsed.name) {
                return {
                    name: parsed.name,
                    arguments: parsed.parameters || parsed.arguments || {}
                };
            }
        }
    } catch (e) {
        console.error('[Anny] parseFailedToolCall error:', e.message, 'input:', failedGeneration);
    }
    
    return null;
}

async function callGroqAPI(messages, tools = null, retryCount = 0) {
    const MAX_RETRIES = 3;
    
    const requestBody = {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 1500 // Reduzido para caber no rate limit
    };

    if (tools) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        
        // Se for rate limit (429), espera e tenta novamente
        if (response.status === 429 && retryCount < MAX_RETRIES) {
            // Extrai o tempo de espera sugerido ou usa 30s
            const waitMatch = errorText.match(/try again in ([\d.]+)s/);
            const waitTime = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) : 30000;
            
            console.log(`[Anny] Rate limit atingido. Aguardando ${waitTime/1000}s antes de tentar novamente (tentativa ${retryCount + 1}/${MAX_RETRIES})...`);
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return callGroqAPI(messages, tools, retryCount + 1);
        }
        
        // Se for rate limit e já esgotou retries, dá mensagem amigável
        if (response.status === 429) {
            throw new Error('Estou processando muitas mensagens agora. Por favor, aguarde alguns segundos e tente novamente! 🙏');
        }
        
        // FIX: Llama às vezes gera tool calls em formato inválido (<function=name{args}</function>)
        // Groq retorna 400 tool_use_failed — capturar, parsear e executar manualmente
        if (response.status === 400 && errorText.includes('tool_use_failed')) {
            console.log('[Anny] Tool call format inválido detectado, tentando recuperar...');
            try {
                const errorData = JSON.parse(errorText);
                const failedGen = errorData?.error?.failed_generation || '';
                const parsed = parseFailedToolCall(failedGen);
                
                if (parsed) {
                    console.log(`[Anny] Recuperado tool call: ${parsed.name}`, parsed.arguments);
                    // Retornar como se fosse uma resposta normal com tool_calls
                    return {
                        choices: [{
                            message: {
                                role: 'assistant',
                                content: null,
                                tool_calls: [{
                                    id: `recovered_${Date.now()}`,
                                    type: 'function',
                                    function: {
                                        name: parsed.name,
                                        arguments: JSON.stringify(parsed.arguments)
                                    }
                                }]
                            }
                        }]
                    };
                }
            } catch (parseErr) {
                console.error('[Anny] Falha ao parsear failed_generation:', parseErr.message);
            }
            
            // Se não conseguiu parsear, tenta novamente SEM tools
            if (tools && retryCount < MAX_RETRIES) {
                console.log('[Anny] Retentando sem tools...');
                return callGroqAPI(messages, null, retryCount + 1);
            }
        }
        
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
}

// ============================================================================
// PROCESSAMENTO DE TOOL CALLS
// ============================================================================

async function processToolCall(toolCall) {
    const { name, arguments: argsString } = toolCall.function;
    // Tratar caso de args vazio/null
    const args = argsString ? JSON.parse(argsString) : {};

    console.log(`[Anny CEO] Executing tool: ${name}`, args);

    switch (name) {
        case 'getStockSummary':
            return await getStockSummary(args?.onlyWithStock);
        case 'analyzeStockOpportunity':
            return await analyzeStockOpportunity(args?.minStock, args?.daysWithoutSale);
        case 'findC4Candidates':
            return await findC4Candidates(args?.minOrders, args?.maxTicket);
        case 'generatePersonalizedCopy':
            return await generatePersonalizedCopy(args?.profile, args?.clientName, args?.productName, args?.discountOrOffer);
        case 'getMorningBriefing':
            return await getMorningBriefing();
        case 'analyzeCohort':
            return await analyzeCohort(args?.months);
        case 'findClientsByProductHistory':
            return await findClientsByProductHistory(args?.productName, args?.minQuantity, args?.period);
        case 'findBirthdays':
            return await findBirthdays(args?.month);
        case 'findVipClients':
            return await findVipClients(args?.minTicket, args?.status, args?.inactiveDays);
        case 'findClientsByOrderValue':
            return await findClientsByOrderValue(args?.minOrderValue, args?.maxOrderValue, args?.period);
        case 'analyzeSalesDrop':
            return await analyzeSalesDrop(args?.compareMonths);
        case 'getClientStats':
            return await getClientStats();
        default:
            return { error: `Função desconhecida: ${name}` };
    }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod === 'GET') {
        // Suportar action via query string OU via path (/api/anny/dashboard)
        let action = event.queryStringParameters?.action;
        if (!action && event.path) {
            const pathMatch = event.path.match(/anny-ai\/(.+)/) || event.path.match(/anny\/(.+)/);
            if (pathMatch) action = pathMatch[1].split('?')[0];
        }
        
        if (action === 'insights') {
            const insights = await generateInsights();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ insights })
            };
        }

        if (action === 'briefing') {
            const briefing = await getMorningBriefing();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(briefing)
            };
        }

        if (action === 'dashboard') {
            const dashData = await getDashboardData();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(dashData)
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ status: 'Anny AI CEO Mode v2.0 está online 🚀' })
        };
    }

    if (event.httpMethod === 'POST') {
        try {
            if (!GROQ_API_KEY) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'GROQ_API_KEY não configurada' })
                };
            }

            // Gerar mensagem de campanha via IA
            const actionParam = event.queryStringParameters?.action;
            if (actionParam === 'generate-campaign') {
                const { daysInactive, tone, couponName, clientCount, context: ctx } = JSON.parse(event.body || '{}');
                const prompt = `Gere uma mensagem curta e persuasiva para WhatsApp (máx 300 caracteres) para clientes de rasteirinhas que não compram há ${daysInactive || 30} dias.
Use um tom ${tone || 'Amigável'}.
${couponName ? `Mencione o cupom ${couponName} como incentivo.` : 'Não mencione cupom.'}
${ctx ? `Contexto adicional: ${ctx}` : ''}
Foque em novidades da coleção e no benefício do frete grátis acima de R$2.000.
A mensagem deve ser para ${clientCount || 'vários'} clientes, então use {{nome}} como variável para personalizar.
${couponName ? 'Use {{cupom}} como variável para o código do cupom.' : ''}
Responda APENAS com o texto da mensagem, sem aspas, sem explicação.`;

                const completion = await callGroqAPI([
                    { role: 'system', content: ANNY_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ]);
                const generatedMessage = completion.choices[0].message.content.trim();
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, message: generatedMessage })
                };
            }

            const { message, history = [] } = JSON.parse(event.body);

            if (!message) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Mensagem não fornecida' })
                };
            }

            const messages = [
                { role: 'system', content: ANNY_SYSTEM_PROMPT },
                ...history.map(h => ({
                    role: h.sender === 'user' ? 'user' : 'assistant',
                    content: h.text
                })),
                { role: 'user', content: message }
            ];

            let completion = await callGroqAPI(messages, TOOLS);
            let assistantMessage = completion.choices[0].message;

            let results = null;
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                const toolResults = [];

                for (const toolCall of assistantMessage.tool_calls) {
                    const result = await processToolCall(toolCall);
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        content: JSON.stringify(result)
                    });

                    if (result.data || result.insights || result.variations || result.greeting) {
                        results = result;
                    }
                }

                messages.push(assistantMessage);
                messages.push(...toolResults);

                completion = await callGroqAPI(messages);
                assistantMessage = completion.choices[0].message;
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    response: assistantMessage.content,
                    results
                })
            };

        } catch (error) {
            console.error('[Anny CEO] Error:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: error.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Método não permitido' })
    };
};
