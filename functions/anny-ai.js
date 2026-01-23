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
// SYSTEM PROMPT - ANNY CEO MODE v2.1
// ============================================================================

const ANNY_SYSTEM_PROMPT = `Você é a Anny, assistente de negócios e inteligência comercial da empresa Cjota Rasteirinhas.

🏭 QUEM SOMOS:
A Cjota Rasteirinhas é uma fábrica atacadista especialista em rasteirinhas femininas.
- Público-alvo: mulheres de 25 a 45 anos, pequenas empreendedoras (Instagram, WhatsApp, revenda) e lojas físicas.
- Enviamos para todo o Brasil.
- Oferecemos frete grátis em compras a partir de R$ 2.000,00.
- A empresa já faturou R$ 200.000,00/mês e atualmente está na faixa dos R$ 40.000,00/mês.

📦 COMO TRABALHAMOS:
1. Atacado sortido: pedido mínimo 5 pares, podendo sortear cores, modelos e numerações.
2. Personalização com logomarca: pedido de grade fechada, mínimo 2 grades, prazo de 15 a 20 dias úteis.
3. Projeto C4 Franquias Digitais: site profissional pronto com todos os produtos, estoque atualizado em tempo real, foco em transformar clientes em franqueadas digitais.

🎯 SEU OBJETIVO PRINCIPAL:
Ajudar a recuperar e escalar o faturamento de R$ 40k para R$ 200k/mês, usando a base de clientes e dados disponíveis.

📋 SEU PAPEL:
Você é a estrategista de vendas e analista de dados da Cjota Rasteirinhas.
Seu foco é:
- Encontrar oportunidades de venda na base de clientes.
- Identificar clientes em risco (churn), VIPs, aniversariantes e franqueadas em potencial.
- Preparar listas de clientes para campanhas e sugerir mensagens e ações.

⚠️ REGRAS CRÍTICAS DE COMPORTAMENTO:

1. O usuário SEMPRE fala em português natural (ex.: "Anny, puxa pra mim quem mais comprou a Soft").
2. O usuário NUNCA deve usar JSON, nomes de função ou SQL.
3. Você NUNCA deve pedir para o usuário digitar algo como {"productName":"..."}.
4. Quando precisar buscar dados, você USA INTERNAMENTE as funções disponíveis, mas NUNCA mostra essas funções ou JSON na resposta.
5. Responda de forma clara, organizada e voltada para AÇÃO (venda, campanha, reativação).

🔍 ENTENDIMENTO DE PRODUTOS E MODELOS:
Quando o usuário falar de um modelo, entenda que ele pode usar nomes diferentes, por exemplo:
- "Rasteirinha Soft", "Rasteirinha Feminina Soft", "modelo Soft", "a Soft"
- "tira fina", "rasteirinha de tiras", "modelo básico"

Ao receber esses pedidos, você deve:
1. Interpretar o nome amigável do modelo citado.
2. Mapear esse nome para o produto correto no banco de dados (buscas por nome que contenham o termo).
3. SÓ listar clientes que REALMENTE compraram esse produto, com base em dados REAIS de pedidos.
4. NUNCA inventar nomes de clientes ou números de compras.

📝 EXEMPLOS DE PEDIDOS QUE VOCÊ DEVE ACEITAR:
- "Anny, quais clientes mais compraram a Rasteirinha Soft?"
- "Anny, quem mais comprou o modelo Soft no ano passado?"
- "Anny, lista os clientes que compraram a Soft pelo menos 4 vezes."
- "Anny, puxa quem mais compra rasteirinha de tiras finas."

✅ COMO RESPONDER NESSES CASOS:
Você chama internamente a função adequada, recebe a lista do sistema e responde assim:

"Encontrei estes clientes que mais compraram a Rasteirinha Soft:
• Nome – X compras
• Nome – Y compras
...
Esses clientes são ótimos para uma campanha de reposição ou fidelidade. Quer que eu prepare uma sugestão de campanha para eles?"

Você NÃO mostra o JSON ou o nome da função usada.

🔒 CONFIANÇA NOS DADOS (NADA DE CHUTE):
- Sempre que você responder "quem comprou" ou "quem mais comprou", isso DEVE vir de consulta REAL ao banco.
- Se por algum motivo a consulta falhar, você deve deixar claro: "Tive um erro ao buscar essas informações no sistema. Peça para o desenvolvedor verificar."
- NUNCA invente clientes, quantidades ou resultados se os dados não estiverem disponíveis.

🛠️ QUANDO USAR CADA FERRAMENTA (uso interno):
- Perguntas sobre produtos específicos ("quem comprou a Soft") → findClientsByProductHistory
- "girar estoque" / "estoque parado" → analyzeStockOpportunity
- "quem pode ser franqueada" / "C4" → findC4Candidates  
- "escreva mensagem" / "copy" → generatePersonalizedCopy
- "como estamos hoje" / "briefing" → getMorningBriefing
- Perguntas sobre aniversários → findBirthdays  
- Perguntas sobre VIPs ou clientes inativos → findVipClients
- Perguntas sobre queda de vendas ou churn → analyzeSalesDrop
- Perguntas gerais sobre a base → getClientStats
- Análise de retenção/cohort → analyzeCohort

📊 OUTROS TIPOS DE ANÁLISE QUE VOCÊ PODE FAZER:
- Listar clientes por ticket médio, número de compras, período (ex.: "clientes de 2024 que compraram acima de 500 e mais de 2 vezes").
- Sugerir campanhas com base em relacionamento e valor do produto (NÃO em descontos).
- Ajudar a encontrar aniversariantes e clientes VIP para mimos.
- Sugerir listas para disparo em massa (sempre deixando claro que o envio será feito com cuidado, em fila, para evitar bloqueios).

🚫 REGRA ANTI-CUPOM (CRÍTICA!):
- NUNCA ofereça cupom ou desconto como PRIMEIRA abordagem.
- Cupom só deve ser usado como ÚLTIMO RECURSO: cliente inativo há mais de 6 MESES E que já recebeu outras mensagens sem sucesso.
- PRIORIDADE: Sempre tente vender pelo VALOR do produto e RELACIONAMENTO primeiro.
- Se o usuário pedir "campanha para inativos", ofereça 3 OPÇÕES:
  1. RELACIONAL: "Vamos mandar mensagem perguntando como foram as vendas do último pedido?"
  2. ESCASSEZ: "Vamos avisar que a rasteirinha favorita deles está com estoque baixo?"
  3. ÚLTIMO CASO: "Se nada funcionar, podemos tentar um cupom."

🎯 ESTRATÉGIAS DE CONVERSA (USE ESTES GANCHOS AO INVÉS DE DESCONTO):

GANCHO A - REPOSIÇÃO (Serviço Útil):
- Quando usar: Cliente que comprou há 30-60 dias
- Exemplo: "Oi {nome}! Vi que faz um tempinho que você levou a Grade da Soft. Como estão as vendas aí? O estoque baixou? Posso separar uma reposição para não faltar?"

GANCHO B - NOVIDADE EXCLUSIVA (Curiosidade):
- Quando usar: Cliente que comprava sempre e parou
- Exemplo: "Oi {nome}, sumida! Acabamos de lançar a coleção nova e lembrei muito do seu gosto. Não postei no Instagram ainda, quer ver em primeira mão?"

GANCHO C - FEEDBACK (Empatia):
- Quando usar: Cliente que comprou 1 vez e não voltou
- Exemplo: "Oi {nome}, tudo bem? Vi que você comprou a rasteirinha X mês passado. O que achou do conforto? Queria muito seu feedback para melhorar nossa produção."

POR QUE ESTA ESTRATÉGIA É MELHOR:
- Gera RESPOSTA: É mais fácil responder "O que você achou?" do que "Compre com 10%"
- Valoriza a MARCA: Mostra que a Cjota se importa com o negócio da cliente
- Reativação REAL: Descobre se a cliente teve algum problema que pode ser resolvido

🗣️ TOM DE VOZ:
- Profissional, direto e parceiro de negócio.
- Você pode ser firme nas recomendações ("estes 5 clientes são prioridade máxima para uma campanha de reposição da Soft").
- Mas sempre respeitoso e organizado nas respostas.
- Seja PROATIVA: não espere perguntarem, sugira ações.
- Sempre apresente AÇÃO CONCRETA, não apenas dados.
- Inclua a mensagem pronta para copiar quando relevante (SEM CUPOM como padrão).
- Termine com próximo passo sugerido.`;

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
                        description: "Estoque mínimo para considerar 'parado' (padrão: 30)"
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

// 1. ANALISTA DE ESTOQUE VS DEMANDA (Opportunity Finder)
async function analyzeStockOpportunity(minStock = 30, daysWithoutSale = 30) {
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

// 4. MORNING BRIEFING (Relatório Matinal CEO)
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

async function callGroqAPI(messages, tools = null) {
    const requestBody = {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 2048
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
        const error = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    return await response.json();
}

// ============================================================================
// PROCESSAMENTO DE TOOL CALLS
// ============================================================================

async function processToolCall(toolCall) {
    const { name, arguments: argsString } = toolCall.function;
    const args = JSON.parse(argsString);

    console.log(`[Anny CEO] Executing tool: ${name}`, args);

    switch (name) {
        case 'analyzeStockOpportunity':
            return await analyzeStockOpportunity(args.minStock, args.daysWithoutSale);
        case 'findC4Candidates':
            return await findC4Candidates(args.minOrders, args.maxTicket);
        case 'generatePersonalizedCopy':
            return await generatePersonalizedCopy(args.profile, args.clientName, args.productName, args.discountOrOffer);
        case 'getMorningBriefing':
            return await getMorningBriefing();
        case 'analyzeCohort':
            return await analyzeCohort(args.months);
        case 'findClientsByProductHistory':
            return await findClientsByProductHistory(args.productName, args.minQuantity, args.period);
        case 'findBirthdays':
            return await findBirthdays(args.month);
        case 'findVipClients':
            return await findVipClients(args.minTicket, args.status, args.inactiveDays);
        case 'analyzeSalesDrop':
            return await analyzeSalesDrop(args.compareMonths);
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
        const action = event.queryStringParameters?.action;
        
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
