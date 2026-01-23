// ============================================================================
// ANNY AI - Business Intelligence Assistant
// Netlify Function com integração Groq API
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

// System Prompt da Anny
const ANNY_SYSTEM_PROMPT = `Você é a Anny, a estrategista de vendas da CJOTA Rasteirinhas, uma fábrica atacadista de calçados femininos.

NOSSO NEGÓCIO:
- Focamos em mulheres (25-45 anos), revendedoras e lojistas
- Temos pedido mínimo de 5 peças (atacado)
- Fabricamos grades personalizadas com logo (mínimo 2 grades, 15-20 dias de produção)
- Temos o projeto 'C4 Franquias' (site pronto para revendedoras)
- Frete grátis acima de R$ 2.000

SUA MISSÃO:
- Ajudar a empresa a recuperar o faturamento de R$ 200k/mês (atualmente em R$ 40k)
- Identificar oportunidades na base de clientes inativos
- Sugerir ações de venda agressivas mas empáticas

REGRAS DE ANÁLISE:
- Considere o padrão de compra atacado
- Se alguém comprava muito (grades fechadas) e parou, é prioridade máxima
- Use o frete grátis (acima de R$ 2k) como argumento de fechamento
- Clientes com ticket médio > R$ 500 são VIPs
- Clientes inativos há mais de 30 dias precisam de atenção
- Aniversariantes são oportunidades de reconquista

FORMATO DE RESPOSTA:
- Seja direta e profissional
- Use dados concretos quando disponíveis
- Sugira ações específicas
- Não use emojis excessivos
- Quando listar clientes, mencione que pode preparar uma campanha

FERRAMENTAS DISPONÍVEIS:
Você pode usar as seguintes funções para buscar dados:
- findClientsByProductHistory: Buscar clientes por histórico de produto
- findBirthdays: Buscar aniversariantes do mês
- findVipClients: Buscar clientes VIP por ticket e status
- analyzeSalesDrop: Analisar queda de vendas e churn
- getClientStats: Obter estatísticas gerais dos clientes`;

// Definição das ferramentas (Function Calling)
const TOOLS = [
    {
        type: "function",
        function: {
            name: "findClientsByProductHistory",
            description: "Busca clientes que compraram um produto específico em determinada quantidade. Útil para avisar sobre reposição de estoque.",
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
// FUNÇÕES DE BANCO DE DADOS
// ============================================================================

async function findClientsByProductHistory(productName, minQuantity = 4, period = 'last_year') {
    if (!supabase) return { error: 'Banco de dados não configurado' };

    try {
        // Buscar pedidos com o produto
        const { data: orders, error } = await supabase
            .from('orders')
            .select('client_id, client_name, client_phone, products, data')
            .ilike('products', `%${productName}%`);

        if (error) throw error;

        // Calcular data limite baseado no período
        const now = new Date();
        let dateLimit = new Date();
        if (period === 'last_year') dateLimit.setFullYear(now.getFullYear() - 1);
        else if (period === 'last_6_months') dateLimit.setMonth(now.getMonth() - 6);
        else if (period === 'last_3_months') dateLimit.setMonth(now.getMonth() - 3);

        // Agrupar por cliente e contar quantidade
        const clientMap = {};
        orders.forEach(order => {
            if (new Date(order.data) < dateLimit) return;
            
            const products = typeof order.products === 'string' ? JSON.parse(order.products) : order.products;
            const matchingProducts = products.filter(p => 
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

        // Filtrar por quantidade mínima
        const results = Object.values(clientMap)
            .filter(c => c.total_quantity >= minQuantity)
            .sort((a, b) => b.total_quantity - a.total_quantity);

        // Buscar dados adicionais dos clientes
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

        return {
            data: results.slice(0, 50),
            columns: ['name', 'phone', 'total_quantity', 'order_count', 'total_spent', 'last_purchase_date'],
            summary: `${results.length} clientes compraram ${productName} com ${minQuantity}+ unidades`
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

        // Filtrar por mês
        const results = clients.filter(client => {
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

        // Identificar aniversariantes de hoje
        const today = new Date();
        const todayBirthdays = results.filter(c => 
            c.birthday_day === today.getDate() && targetMonth === (today.getMonth() + 1)
        );

        return {
            data: results.slice(0, 50),
            columns: ['name', 'phone', 'email', 'birthday', 'total_spent'],
            summary: `${results.length} aniversariantes em ${targetMonth}/${new Date().getFullYear()}`,
            todayCount: todayBirthdays.length
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
        const cutoffDate = new Date();
        cutoffDate.setDate(now.getDate() - inactiveDays);

        let results = clients.map(client => {
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

        // Filtrar por status
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
        // Buscar todos os pedidos
        const { data: orders, error } = await supabase
            .from('orders')
            .select('id, client_id, client_name, client_phone, total, data')
            .order('data', { ascending: false });

        if (error) throw error;

        const now = new Date();
        
        // Período atual (último mês)
        const currentStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const currentEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        
        // Período anterior (meses anteriores)
        const previousStart = new Date(now.getFullYear(), now.getMonth() - compareMonths - 1, 1);
        const previousEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);

        // Agrupar vendas por período
        const currentOrders = orders.filter(o => {
            const d = new Date(o.data);
            return d >= currentStart && d <= currentEnd;
        });

        const previousOrders = orders.filter(o => {
            const d = new Date(o.data);
            return d >= previousStart && d <= previousEnd;
        });

        // Clientes por período
        const currentClients = new Set(currentOrders.map(o => o.client_id));
        const previousClients = new Set(previousOrders.map(o => o.client_id));

        // Churn: clientes que compravam e pararam
        const churnedClientIds = [...previousClients].filter(id => !currentClients.has(id));

        // Buscar dados dos clientes em churn
        const { data: churnedClientsData } = await supabase
            .from('clients')
            .select('id, name, phone, email, total_spent, order_count, last_purchase_date')
            .in('id', churnedClientIds)
            .order('total_spent', { ascending: false });

        // Calcular faturamento
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
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

        const stats = {
            totalClients: clients.length,
            activeClients: 0,
            inactiveClients: 0,
            totalRevenue: 0,
            avgTicket: 0,
            vipClients: 0
        };

        clients.forEach(client => {
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
            summary: `Base: ${stats.totalClients} clientes | ${stats.activeClients} ativos | ${stats.vipClients} VIPs`
        };
    } catch (error) {
        console.error('getClientStats error:', error);
        return { error: error.message };
    }
}

// ============================================================================
// INSIGHTS PROATIVOS
// ============================================================================

async function generateInsights() {
    const insights = [];

    try {
        // Aniversariantes de hoje
        const birthdays = await findBirthdays();
        if (birthdays.todayCount > 0) {
            insights.push({
                type: 'birthday',
                priority: 'high',
                title: `${birthdays.todayCount} VIP(s) fazem aniversário hoje`,
                description: 'Oportunidade de enviar cupom especial',
                action: 'Quem faz aniversário hoje?'
            });
        }

        // VIPs inativos
        const vips = await findVipClients(500, 'inactive', 45);
        if (vips.data && vips.data.length > 0) {
            insights.push({
                type: 'inactive',
                priority: 'high',
                title: `${vips.data.length} cliente(s) VIP inativo(s)`,
                description: `R$ ${(vips.totalValueAtRisk || 0).toLocaleString('pt-BR')} em risco`,
                action: 'Quais VIPs estão inativos há mais de 45 dias?'
            });
        }

        // Análise de churn
        const churn = await analyzeSalesDrop(3);
        if (churn.analytics && churn.analytics.churnCount > 5) {
            insights.push({
                type: 'churn',
                priority: 'medium',
                title: `${churn.analytics.churnCount} clientes em churn`,
                description: `Queda de ${Math.abs(churn.analytics.revenueChange)}% no faturamento`,
                action: 'Analise a queda de vendas e identifique os clientes que pararam de comprar'
            });
        }

        // Aniversariantes do mês
        const monthBirthdays = await findBirthdays();
        if (monthBirthdays.data && monthBirthdays.data.length > 0) {
            insights.push({
                type: 'birthday',
                priority: 'low',
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

    console.log(`[Anny] Executing tool: ${name}`, args);

    switch (name) {
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

    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Handle GET - Insights
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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ status: 'Anny AI está online' })
        };
    }

    // Handle POST - Chat
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

            // Construir mensagens para a API
            const messages = [
                { role: 'system', content: ANNY_SYSTEM_PROMPT },
                ...history.map(h => ({
                    role: h.sender === 'user' ? 'user' : 'assistant',
                    content: h.text
                })),
                { role: 'user', content: message }
            ];

            // Primeira chamada - pode retornar tool_calls
            let completion = await callGroqAPI(messages, TOOLS);
            let assistantMessage = completion.choices[0].message;

            // Se houver tool calls, executar e continuar
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

                    // Guardar resultado para retornar ao frontend
                    if (result.data) {
                        results = result;
                    }
                }

                // Segunda chamada com os resultados das tools
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
            console.error('[Anny] Error:', error);
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
