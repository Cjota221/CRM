// ============================================================================
// CRM FacilZap - Sistema Completo com Armazenamento Local
// ============================================================================

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe || '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check-circle text-green-500' : type === 'error' ? 'times-circle text-red-500' : 'info-circle text-blue-500'} mr-3"></i>
            <span>${message}</span>
        </div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        return new Date(dateStr).toLocaleDateString('pt-BR');
    } catch {
        return 'N/A';
    }
}

function formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ============================================================================
// ARMAZENAMENTO LOCAL (LocalStorage)
// ============================================================================

const Storage = {
    KEYS: {
        CLIENTS: 'crm_clients',
        PRODUCTS: 'crm_products',
        ORDERS: 'crm_orders',
        SETTINGS: 'crm_settings',
        LAST_SYNC: 'crm_last_sync'
    },

    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Erro ao salvar no localStorage:', e);
            return false;
        }
    },

    load(key, defaultValue = []) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('Erro ao carregar do localStorage:', e);
            return defaultValue;
        }
    },

    getClients() {
        return this.load(this.KEYS.CLIENTS, []);
    },

    saveClients(clients) {
        return this.save(this.KEYS.CLIENTS, clients);
    },

    getProducts() {
        return this.load(this.KEYS.PRODUCTS, []);
    },

    saveProducts(products) {
        return this.save(this.KEYS.PRODUCTS, products);
    },

    getOrders() {
        return this.load(this.KEYS.ORDERS, []);
    },

    saveOrders(orders) {
        return this.save(this.KEYS.ORDERS, orders);
    },

    getSettings() {
        return this.load(this.KEYS.SETTINGS, {
            activeDays: 30,
            riskDays: 60,
            groqApiKey: ''
        });
    },

    saveSettings(settings) {
        return this.save(this.KEYS.SETTINGS, settings);
    },

    getLastSync() {
        return this.load(this.KEYS.LAST_SYNC, null);
    },

    saveLastSync(date) {
        return this.save(this.KEYS.LAST_SYNC, date);
    },

    clearAll() {
        Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
    },

    // Tags comportamentais aprendidas pela IA (Feedback Loop)
    getAITags() {
        return this.load('crm_ai_tags', {});
    },

    saveAITags(clientId, tags) {
        const allTags = this.getAITags();
        allTags[clientId] = { ...allTags[clientId], ...tags, updatedAt: new Date().toISOString() };
        return this.save('crm_ai_tags', allTags);
    },

    getClientAITags(clientId) {
        const allTags = this.getAITags();
        return allTags[clientId] || null;
    }
};

// ============================================================================
// SUPABASE SYNC - Sincronização com Banco de Dados na Nuvem
// ============================================================================

const SupabaseSync = {
    endpoint: '/api/supabase-sync',
    
    async call(action, table = null, data = null, id = null) {
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, table, data, id })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erro no Supabase');
            return result;
        } catch (error) {
            console.error('[SupabaseSync]', error);
            throw error;
        }
    },
    
    // Salvar tudo no Supabase
    async saveAll() {
        const clients = Storage.getClients();
        const products = Storage.getProducts();
        const orders = Storage.getOrders();
        const coupons = Storage.load('crm_coupons', []);
        const campaigns = Storage.load('crm_campaigns', []);
        const settings = Storage.getSettings();
        
        // Preparar dados para o formato do Supabase
        const clientsForDb = clients.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            birthday: c.birthday,
            cpf: c.cpf,
            address: c.address,
            address_number: c.address_number,
            address_complement: c.address_complement,
            address_neighborhood: c.address_neighborhood,
            city: c.city,
            state: c.state,
            zip_code: c.zip_code,
            origin: c.origin,
            last_purchase_date: c.lastPurchaseDate,
            total_spent: c.totalSpent,
            order_count: c.orderCount,
            products: c.products,
            order_ids: c.orderIds,
            tags: c.tags
        }));
        
        const productsForDb = products.map(p => ({
            id: p.id,
            codigo: p.codigo,
            name: p.name,
            description: p.description,
            sku: p.sku,
            price: p.price,
            stock: p.stock,
            is_active: p.isActive,
            manages_stock: p.managesStock,
            image: p.image,
            images: p.images,
            barcode: p.barcode,
            variacoes: p.variacoes,
            has_variacoes: p.hasVariacoes
        }));
        
        const ordersForDb = orders.map(o => ({
            id: o.id,
            codigo: o.codigo,
            data: o.data,
            client_id: o.clientId,
            client_name: o.clientName,
            client_phone: o.clientPhone,
            total: o.total,
            status: o.status,
            products: o.products,
            origin: o.origin
        }));
        
        const settingsForDb = {
            active_days: settings.activeDays,
            risk_days: settings.riskDays,
            groq_api_key: settings.groqApiKey
        };
        
        return await this.call('syncAll', null, {
            clients: clientsForDb,
            products: productsForDb,
            orders: ordersForDb,
            coupons,
            campaigns,
            settings: settingsForDb
        });
    },
    
    // Carregar tudo do Supabase
    async loadAll() {
        const result = await this.call('loadAll');
        
        // Converter de volta para o formato do localStorage
        if (result.clients?.length > 0) {
            const clients = result.clients.map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                birthday: c.birthday,
                cpf: c.cpf,
                address: c.address,
                address_number: c.address_number,
                address_complement: c.address_complement,
                address_neighborhood: c.address_neighborhood,
                city: c.city,
                state: c.state,
                zip_code: c.zip_code,
                origin: c.origin,
                lastPurchaseDate: c.last_purchase_date,
                totalSpent: c.total_spent,
                orderCount: c.order_count,
                products: c.products || [],
                orderIds: c.order_ids || [],
                tags: c.tags || []
            }));
            Storage.saveClients(clients);
        }
        
        if (result.products?.length > 0) {
            const products = result.products.map(p => ({
                id: p.id,
                codigo: p.codigo,
                name: p.name,
                description: p.description,
                sku: p.sku,
                price: p.price,
                stock: p.stock,
                isActive: p.is_active,
                managesStock: p.manages_stock,
                image: p.image,
                images: p.images || [],
                barcode: p.barcode,
                variacoes: p.variacoes || [],
                hasVariacoes: p.has_variacoes
            }));
            Storage.saveProducts(products);
        }
        
        if (result.orders?.length > 0) {
            const orders = result.orders.map(o => ({
                id: o.id,
                codigo: o.codigo,
                data: o.data,
                clientId: o.client_id,
                clientName: o.client_name,
                clientPhone: o.client_phone,
                total: o.total,
                status: o.status,
                products: o.products || [],
                origin: o.origin
            }));
            Storage.saveOrders(orders);
        }
        
        if (result.coupons?.length > 0) {
            Storage.save('crm_coupons', result.coupons);
        }
        
        if (result.campaigns?.length > 0) {
            Storage.save('crm_campaigns', result.campaigns);
        }
        
        if (result.settings) {
            const currentSettings = Storage.getSettings();
            Storage.saveSettings({
                activeDays: result.settings.active_days || currentSettings.activeDays,
                riskDays: result.settings.risk_days || currentSettings.riskDays,
                groqApiKey: result.settings.groq_api_key || currentSettings.groqApiKey
            });
        }
        
        return result;
    },
    
    // Sincronizar (salva local → nuvem)
    async sync() {
        showToast('Salvando dados na nuvem...', 'info');
        try {
            const result = await this.saveAll();
            showToast('Dados salvos no Supabase!', 'success');
            console.log('[SupabaseSync] Salvos:', result.synced);
            return result;
        } catch (error) {
            showToast('Erro ao salvar na nuvem: ' + error.message, 'error');
            throw error;
        }
    },
    
    // Baixar dados da nuvem
    async download() {
        showToast('Carregando dados da nuvem...', 'info');
        try {
            const result = await this.loadAll();
            showToast('Dados carregados do Supabase!', 'success');
            renderAll();
            return result;
        } catch (error) {
            showToast('Erro ao carregar da nuvem: ' + error.message, 'error');
            throw error;
        }
    }
};

window.SupabaseSync = SupabaseSync;

// ============================================================================
// GROQ API - IA GRATUITA COM LIMITES GENEROSOS (14.400 req/dia)
// ============================================================================

// System Prompt - O "Cérebro" Completo da IA (Especialista em CRM e Campanhas)
const AI_SYSTEM_PROMPT = `PAPEL (ROLE):
Você é uma IA especialista em CRM, automação de cupons, reativação e campanhas em massa por WhatsApp. Seu foco é aumentar faturamento, recuperar clientes inativos e aumentar a frequência de compra, usando segmentação avançada e mensagens altamente personalizadas.

O QUE VOCÊ RECEBE:
Sempre receberá dados estruturados de clientes, pedidos, cupons e segmentos (ex.: "clientes com 305 dias sem comprar", ticket médio, estado, produtos favoritos, cupons usados, ano das compras).

SUA MISSÃO EM CADA RESPOSTA:

1. ANALISAR O SEGMENTO (ou cliente) considerando:
   • Recência, frequência, valor (RFM).
   • Ticket médio, LTV, número de pedidos.
   • Produtos, categorias, cores, tamanhos mais comprados.
   • Estado/cidade (para frete, oferta regional).
   • Uso passado de cupons (se já respondeu bem a descontos, frete grátis, etc.).

2. DEFINIR O TIPO DE CAMPANHA IDEAL:
   • Win‑back para inativos (tipo Elisiane, 300+ dias).
   • Upsell/cross-sell para quem tem ticket alto.
   • Incentivo de volume ou desconto leve para ticket baixo.
   • Oferta por região (frete grátis/benefício para certos estados).

3. CALIBRAR O CUPOM AUTOMATICAMENTE (lógica de negócio):
   • Clientes com ticket alto ou VIP → sugerir cupom mais forte (porcentagem maior, combo, frete grátis).
   • Clientes de ticket baixo → sugerir cupom mais leve, ou mínimo de compra.
   • Sempre mencionar se o cupom deve ser individual (por cliente) ou de campanha (para o grupo inteiro).

4. PREPARAR O DISPARO EM MASSA:
   • Explicar qual filtro o CRM deve aplicar (ex.: "clientes de 2024, estado = GO, dias_sem_comprar > 180, ticket_medio > 300").
   • Indicar quantos clientes é ideal atingir (ex.: "pegue os 200 com maior potencial de resposta").

5. GERAR MENSAGENS PRONTAS PARA WHATSAPP (copy):
   • Escrever 2 ou 3 opções de mensagem já com:
     - Tom humano e amigável.
     - Referência ao histórico ("faz 305 dias que você não aparece por aqui", "você sempre escolhe tênis preto 38").
     - Oferta clara com o cupom sugerido.
     - Urgência ou escassez quando fizer sentido.

FORMATO OBRIGATÓRIO DA RESPOSTA:

**RESUMO DO SEGMENTO:**
2–3 frases descrevendo quem é esse grupo ou cliente (ex.: "Clientes inativos há ~300 dias, ticket médio alto, foco em calçados femininos, maioria em GO e DF").

**ESTRATÉGIA RECOMENDADA:**
• Tipo de campanha
• Tipo de cupom (valor/percentual/frete)
• Segmento exato a filtrar no CRM
• Quantidade ideal de clientes a atingir
• Melhor momento para disparo

**SUGESTÃO DE CUPOM (para o sistema):**
• Nome do cupom: XXXXXXX
• Tipo de desconto: X% / R$X / Frete Grátis
• Validade: X dias
• Escopo: Individual ou Geral
• Condição mínima: R$X (se houver)

**MENSAGENS PARA WHATSAPP (prontas para disparo):**

Opção 1:
\`\`\`
[Mensagem completa usando {{nome}}, {{cupom}}, {{data_validade}}]
\`\`\`

Opção 2:
\`\`\`
[Mensagem alternativa com outro ângulo]
\`\`\`

Opção 3 (opcional):
\`\`\`
[Mensagem de urgência/escassez]
\`\`\`

**FILTRO TÉCNICO PARA O CRM:**
Descrever exatamente como filtrar: dias_sem_comprar > X AND ticket_medio > Y AND estado = "Z"

**REGRA DE ACOMPANHAMENTO:**
• Métrica principal a rastrear: taxa de uso do cupom
• Métrica secundária: dias até recompra, ticket médio pós-campanha
• Critério de sucesso: X% de conversão em Y dias

**PROBABILIDADE DE CONVERSÃO:** X% (baseado nos padrões detectados)

REGRAS IMPORTANTES:
• NUNCA responda genérico. Use SEMPRE os dados (dias sem comprar, ticket, estado, produtos, cupom anterior) para justificar a estratégia.
• Quando faltar dado importante (ex.: não há informação de estado ou ticket médio), diga EXPLICITAMENTE o que falta e como isso impacta a estratégia.
• Pense como um algoritmo de recomendação: sempre que possível, indique quais produtos ou categorias têm maior chance de conversão com esse grupo.
• Seu foco é SEMPRE: reativar, aumentar frequência, aumentar ticket, NUNCA apenas "mandar mensagem".
• Use emojis com moderação nas mensagens (máx 3-4 por mensagem).
• Mensagens devem ter no máximo 300 caracteres para melhor leitura no WhatsApp.`;

async function callAI(apiKey, prompt, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: AI_SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });

            if (response.status === 429) {
                const waitTime = 10;
                if (attempt < maxRetries) {
                    showToast(`Limite da API atingido. Aguardando ${waitTime}s... (tentativa ${attempt}/${maxRetries})`, 'info', waitTime * 1000);
                    await new Promise(r => setTimeout(r, waitTime * 1000));
                    continue;
                }
                throw new Error(`Limite de uso da API excedido. Tente novamente em alguns segundos.`);
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Erro na API');
            }

            const data = await response.json();
            return {
                candidates: [{
                    content: {
                        parts: [{
                            text: data.choices?.[0]?.message?.content || ''
                        }]
                    }
                }]
            };
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                showToast(`Erro na API. Tentando novamente... (tentativa ${attempt}/${maxRetries})`, 'info', 5000);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
    
    throw lastError || new Error('Erro ao chamar API após múltiplas tentativas');
}

// ============================================================================
// ANÁLISE COMPORTAMENTAL - Enriquecimento de Dados do Cliente
// ============================================================================

function buildEnrichedClientData(client) {
    const orders = Storage.getOrders();
    const products = Storage.getProducts();
    const aiTags = Storage.getClientAITags(client.id);
    
    // Pedidos deste cliente
    const clientOrders = orders.filter(o => o.cliente_id === client.id);
    
    // Calcular padrões temporais
    const orderDates = clientOrders.map(o => new Date(o.data)).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < orderDates.length; i++) {
        gaps.push(Math.ceil((orderDates[i] - orderDates[i-1]) / (1000 * 60 * 60 * 24)));
    }
    const mediaGap = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
    
    // Dia da semana favorito
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    orderDates.forEach(d => dayCount[d.getDay()]++);
    const favoriteDayIndex = dayCount.indexOf(Math.max(...dayCount));
    const favoriteDayName = dayCount[favoriteDayIndex] > 0 ? dayNames[favoriteDayIndex] : null;
    
    // Período do mês (início, meio, fim)
    const dayOfMonth = orderDates.map(d => d.getDate());
    const avgDayOfMonth = dayOfMonth.length > 0 ? Math.round(dayOfMonth.reduce((a, b) => a + b, 0) / dayOfMonth.length) : null;
    let monthPeriod = null;
    if (avgDayOfMonth) {
        if (avgDayOfMonth <= 10) monthPeriod = 'Início do Mês';
        else if (avgDayOfMonth <= 20) monthPeriod = 'Meio do Mês';
        else monthPeriod = 'Fim do Mês';
    }
    
    // Extrair preferências dos itens comprados
    const allItems = clientOrders.flatMap(o => o.itens || []);
    const productNames = allItems.map(i => i.nome || '').filter(Boolean);
    
    // Tentar extrair cores (palavras comuns de cores)
    const colorKeywords = ['preto', 'branco', 'azul', 'vermelho', 'verde', 'amarelo', 'rosa', 'roxo', 'laranja', 'cinza', 'marrom', 'bege', 'nude', 'dourado', 'prata', 'caramelo', 'vinho', 'bordô', 'navy', 'creme'];
    const colorCount = {};
    productNames.forEach(name => {
        const nameLower = name.toLowerCase();
        colorKeywords.forEach(color => {
            if (nameLower.includes(color)) {
                colorCount[color] = (colorCount[color] || 0) + 1;
            }
        });
    });
    const topColors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    
    // Extrair tamanhos (padrões comuns)
    const sizeKeywords = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
    const sizeCount = {};
    productNames.forEach(name => {
        sizeKeywords.forEach(size => {
            const regex = new RegExp(`\\b${size}\\b`, 'i');
            if (regex.test(name)) {
                sizeCount[size] = (sizeCount[size] || 0) + 1;
            }
        });
    });
    const topSizes = Object.entries(sizeCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    
    // Categorias (se disponível nos produtos)
    const categoryCount = {};
    allItems.forEach(item => {
        if (item.produto_id) {
            const prod = products.find(p => p.id === item.produto_id);
            if (prod?.categoria) {
                categoryCount[prod.categoria] = (categoryCount[prod.categoria] || 0) + 1;
            }
        }
    });
    const topCategories = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    
    // Calcular ticket médio
    const ticketMedio = clientOrders.length > 0 
        ? clientOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0) / clientOrders.length 
        : 0;
    
    // Dias sem comprar
    const lastPurchase = client.lastPurchaseDate ? new Date(client.lastPurchaseDate) : null;
    const diasSemComprar = lastPurchase 
        ? Math.ceil((new Date() - lastPurchase) / (1000 * 60 * 60 * 24))
        : null;
    
    // Determinar status de risco baseado no gap médio
    let alertaRisco = null;
    if (mediaGap && diasSemComprar && diasSemComprar > mediaGap * 1.5) {
        alertaRisco = `ALERTA: Cliente costuma comprar a cada ${mediaGap} dias, mas já está há ${diasSemComprar} dias sem comprar!`;
    }
    
    // Histórico recente (últimos 5 pedidos)
    const historicoRecente = clientOrders
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 5)
        .map(o => ({
            data: o.data,
            total: o.total,
            itens: (o.itens || []).map(i => i.nome).filter(Boolean).join(', ')
        }));

    return {
        cliente: {
            id: client.id,
            nome: client.name,
            estado: client.state || 'N/A',
            cidade: client.city || 'N/A',
            bairro: client.neighborhood || 'N/A',
            data_cadastro: client.createdAt,
            telefone: client.phone
        },
        comportamento: {
            dias_sem_comprar: diasSemComprar,
            media_dias_entre_compras: mediaGap,
            alerta_risco: alertaRisco,
            status: getClientState(client).status,
            ticket_medio: ticketMedio.toFixed(2),
            total_gasto: (client.totalSpent || 0).toFixed(2),
            numero_pedidos: client.orderCount || 0
        },
        padroes_temporais: {
            dia_semana_favorito: favoriteDayName,
            periodo_mes_preferido: monthPeriod,
            intervalo_medio_compras: mediaGap ? `${mediaGap} dias` : 'N/A'
        },
        preferencias_calculadas: {
            cores_top3: topColors.length > 0 ? topColors : ['Não identificado'],
            tamanhos_comuns: topSizes.length > 0 ? topSizes : ['Não identificado'],
            categorias_favoritas: topCategories.length > 0 ? topCategories : ['Não identificado']
        },
        historico_recente: historicoRecente,
        tags_ia_anteriores: aiTags || { nota: 'Primeira análise deste cliente' }
    };
}

// ============================================================================
// INTEGRAÇÃO COM IA (Google Gemini - GRATUITO)
// ============================================================================

const AIAssistant = {
    async generateStrategy(segmentData) {
        const settings = Storage.getSettings();
        if (!settings.groqApiKey) {
            throw new Error('API Key do Groq não configurada. Vá em Configurações.');
        }

        const prompt = `Você é um especialista em Growth e CRM para e-commerce. Analise os dados abaixo e me dê:
1. Uma análise breve do cenário (2-3 frases)
2. Uma estratégia de ação específica
3. Três opções de copy (texto) para mensagem de WhatsApp

DADOS DO SEGMENTO:
${JSON.stringify(segmentData, null, 2)}

Responda em JSON com o formato:
{
  "analise": "texto da análise",
  "estrategia": "texto da estratégia",
  "copies": [
    {"titulo": "Título 1", "mensagem": "Mensagem completa 1"},
    {"titulo": "Título 2", "mensagem": "Mensagem completa 2"},
    {"titulo": "Título 3", "mensagem": "Mensagem completa 3"}
  ]
}`;

        const data = await callAI(settings.groqApiKey, prompt);
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Tentar parsear JSON da resposta
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Erro ao parsear resposta da IA:', e);
        }
        
        return { analise: content, estrategia: '', copies: [] };
    },

    async generatePersonalizedMessage(client, context = '') {
        const settings = Storage.getSettings();
        if (!settings.groqApiKey) {
            throw new Error('API Key do Groq não configurada. Vá em Configurações.');
        }

        // Usar dados enriquecidos completos
        const enrichedData = buildEnrichedClientData(client);

        const prompt = `Analise os dados completos deste cliente e crie UMA mensagem de WhatsApp ultra-personalizada para reativá-lo.

DADOS COMPLETOS DO CLIENTE:
${JSON.stringify(enrichedData, null, 2)}

${context ? `CONTEXTO ADICIONAL: ${context}` : ''}

REGRAS OBRIGATÓRIAS:
1. Máximo 300 caracteres
2. Use o PRIMEIRO NOME apenas
3. Seja assertivo baseado nos padrões identificados
4. Mencione algo específico do histórico dele (cor, produto, etc)
5. Use gatilho de escassez ou exclusividade
6. Emojis com moderação (2-3 no máximo)
7. Se identificou alerta de risco, seja mais urgente

FORMATO DE RESPOSTA (JSON):
{
  "mensagem": "texto da mensagem aqui",
  "tags_comportamentais": ["tag1", "tag2", "tag3"],
  "probabilidade_conversao": "XX%",
  "melhor_horario_envio": "dia e período sugerido"
}`;

        const data = await callAI(settings.groqApiKey, prompt);
        const content = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        
        // Tentar parsear JSON e salvar tags
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                // Salvar tags comportamentais (Feedback Loop)
                if (parsed.tags_comportamentais) {
                    Storage.saveAITags(client.id, {
                        tags: parsed.tags_comportamentais,
                        probabilidade: parsed.probabilidade_conversao,
                        melhor_horario: parsed.melhor_horario_envio
                    });
                }
                
                return parsed.mensagem || content;
            }
        } catch (e) {
            console.log('Resposta não é JSON, usando texto direto');
        }
        
        return content;
    },

    // Gerar mensagem sem IA (template básico)
    generateBasicMessage(client) {
        const firstName = client.name.split(' ')[0];
        const days = getDaysSinceLastPurchase(client);
        const product = client.products?.[0]?.name || 'nossos produtos';
        
        const templates = [
            `Oi ${firstName}! Faz ${days} dias que não te vemos por aqui. Sentimos sua falta! Que tal conferir as novidades? Temos condições especiais para você!`,
            `${firstName}, tudo bem? Vi que faz um tempinho que você não compra ${product}. Chegou reposição e separei um cupom especial pra você! 💝`,
            `Olá ${firstName}! Lembrei de você hoje! Temos novidades incríveis e um desconto exclusivo esperando por você. Vem conferir!`
        ];
        
        return templates[Math.floor(Math.random() * templates.length)];
    },

    // IA sugere parâmetros ideais de classificação
    async suggestClassificationParams() {
        const settings = Storage.getSettings();
        if (!settings.groqApiKey) {
            throw new Error('API Key do Groq não configurada. Vá em Configurações.');
        }

        const clients = Storage.getClients();
        const orders = Storage.getOrders();
        
        // Calcular estatísticas dos dados
        const clientsWithOrders = clients.filter(c => c.orderCount > 0);
        const daysSinceLastPurchase = clientsWithOrders.map(c => {
            if (!c.lastPurchaseDate) return 999;
            const days = Math.ceil((new Date() - new Date(c.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
            return days;
        }).sort((a, b) => a - b);
        
        const totalSpentValues = clientsWithOrders.map(c => c.totalSpent).sort((a, b) => a - b);
        const orderCounts = clientsWithOrders.map(c => c.orderCount).sort((a, b) => a - b);
        
        // Calcular percentis
        const percentile = (arr, p) => arr[Math.floor(arr.length * p)] || 0;
        
        const stats = {
            totalClientes: clients.length,
            clientesComPedidos: clientsWithOrders.length,
            diasSemComprar: {
                minimo: daysSinceLastPurchase[0] || 0,
                percentil25: percentile(daysSinceLastPurchase, 0.25),
                mediana: percentile(daysSinceLastPurchase, 0.5),
                percentil75: percentile(daysSinceLastPurchase, 0.75),
                maximo: daysSinceLastPurchase[daysSinceLastPurchase.length - 1] || 0
            },
            valorGasto: {
                minimo: totalSpentValues[0] || 0,
                percentil25: percentile(totalSpentValues, 0.25),
                mediana: percentile(totalSpentValues, 0.5),
                percentil75: percentile(totalSpentValues, 0.75),
                percentil90: percentile(totalSpentValues, 0.9),
                maximo: totalSpentValues[totalSpentValues.length - 1] || 0
            },
            pedidos: {
                media: clientsWithOrders.reduce((s, c) => s + c.orderCount, 0) / clientsWithOrders.length || 0,
                mediana: percentile(orderCounts, 0.5),
                percentil75: percentile(orderCounts, 0.75)
            },
            totalPedidos: orders.length,
            ticketMedioGeral: orders.reduce((s, o) => s + o.total, 0) / orders.length || 0
        };

        const prompt = `Você é um especialista em CRM e análise de dados de e-commerce. 
Analise as estatísticas abaixo da base de clientes e sugira os PARÂMETROS IDEAIS para classificação.

ESTATÍSTICAS DA BASE:
${JSON.stringify(stats, null, 2)}

Com base nesses dados, sugira:

1. **TERMÔMETRO DE CLIENTES** (dias sem comprar):
   - Até quantos dias = Cliente QUENTE (engajado, recente)
   - Até quantos dias = Cliente MORNO (precisa de atenção)
   - Acima de quantos dias = Cliente FRIO (risco de churn)

2. **CLASSIFICAÇÃO VIP**:
   - A partir de quanto gasto total = VIP
   - A partir de quanto gasto = SUPER VIP
   - OU: a partir de quantos pedidos = Cliente Fiel

3. **ANÁLISE E RECOMENDAÇÕES**:
   - O que você observa nessa base?
   - Qual o maior risco/oportunidade?
   - Uma ação prioritária sugerida

Responda em JSON:
{
  "termometro": {
    "quente_ate_dias": número,
    "morno_ate_dias": número,
    "justificativa": "explicação"
  },
  "vip": {
    "vip_valor_minimo": número,
    "super_vip_valor_minimo": número,
    "fiel_pedidos_minimo": número,
    "justificativa": "explicação"
  },
  "analise": {
    "observacoes": "texto",
    "maior_risco": "texto",
    "maior_oportunidade": "texto",
    "acao_prioritaria": "texto"
  }
}`;

        const data = await callAI(settings.groqApiKey, prompt);
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Erro ao parsear resposta da IA:', e);
        }
        
        return { error: 'Não foi possível processar a resposta', raw: content };
    }
};

// ============================================================================
// ELEMENTOS DO DOM
// ============================================================================

let clientCardsContainer, productCardsContainer, orderListContainer;
let searchInput, productSearchInput, orderSearchInput;
let filterStatusSelect, filterTagSelect, sortClientsSelect;
let filterStockSelect, filterActiveSelect;
let clientCountDisplay, productCountDisplay, orderCountDisplay;
let noClientsMessage, noProductsMessage, noOrdersMessage;
let syncButton, addClientButton, openSettingsButton;
let clientModal, detailsModal, settingsModal, confirmModal;
let clientForm, settingsForm;
let modalTitle, detailsModalTitle, detailsModalContent;
let statusAtivoDaysInput, statusRiscoDaysInput;

function initDOMReferences() {
    // Containers
    clientCardsContainer = document.getElementById('client-cards-container');
    productCardsContainer = document.getElementById('product-cards-container');
    orderListContainer = document.getElementById('order-list-container');

    // Search inputs
    searchInput = document.getElementById('search-input');
    productSearchInput = document.getElementById('product-search-input');
    orderSearchInput = document.getElementById('order-search-input');

    // Filters
    filterStatusSelect = document.getElementById('filter-status');
    filterTagSelect = document.getElementById('filter-tag');
    sortClientsSelect = document.getElementById('sort-clients');
    filterStockSelect = document.getElementById('filter-stock');
    filterActiveSelect = document.getElementById('filter-active');

    // Counters
    clientCountDisplay = document.getElementById('client-count-display');
    productCountDisplay = document.getElementById('product-count-display');
    orderCountDisplay = document.getElementById('order-count-display');

    // No data messages
    noClientsMessage = document.getElementById('no-clients-message');
    noProductsMessage = document.getElementById('no-products-message');
    noOrdersMessage = document.getElementById('no-orders-message');

    // Buttons
    syncButton = document.getElementById('sync-button');
    addClientButton = document.getElementById('add-client-button');
    openSettingsButton = document.getElementById('open-settings-button');

    // Modals
    clientModal = document.getElementById('client-modal');
    detailsModal = document.getElementById('details-modal');
    settingsModal = document.getElementById('settings-modal');
    confirmModal = document.getElementById('confirm-modal');

    // Forms
    clientForm = document.getElementById('client-form');
    settingsForm = document.getElementById('settings-form');

    // Modal elements
    modalTitle = document.getElementById('modal-title');
    detailsModalTitle = document.getElementById('details-modal-title');
    detailsModalContent = document.getElementById('details-modal-content');
    statusAtivoDaysInput = document.getElementById('status-ativo-days');
    statusRiscoDaysInput = document.getElementById('status-risco-days');
}

// ============================================================================
// NAVEGAÇÃO
// ============================================================================

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.id === 'sync-button' || link.id === 'open-settings-button') return;
            
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            pages.forEach(p => p.classList.add('hidden'));
            
            const pageId = link.id.replace('nav-', '') + '-page';
            const page = document.getElementById(pageId);
            if (page) {
                page.classList.remove('hidden');
                page.classList.add('flex');
            }
        });
    });
}

// ============================================================================
// MODALS
// ============================================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function setupModals() {
    // Modal de cliente
    document.getElementById('cancel-button')?.addEventListener('click', () => closeModal('client-modal'));
    document.getElementById('close-details-button')?.addEventListener('click', () => closeModal('details-modal'));
    document.getElementById('cancel-settings-button')?.addEventListener('click', () => closeModal('settings-modal'));
    document.getElementById('cancel-delete-button')?.addEventListener('click', () => closeModal('confirm-modal'));

    // Fechar ao clicar no background
    document.querySelectorAll('.modal-bg').forEach(bg => {
        bg.addEventListener('click', () => {
            closeModal('client-modal');
            closeModal('details-modal');
            closeModal('settings-modal');
            closeModal('confirm-modal');
        });
    });

    // Adicionar cliente
    addClientButton?.addEventListener('click', () => {
        clientForm.reset();
        document.getElementById('client-id').value = '';
        modalTitle.textContent = 'Adicionar Novo Cliente';
        openModal('client-modal');
    });

    // Configurações
    openSettingsButton?.addEventListener('click', () => {
        const settings = Storage.getSettings();
        statusAtivoDaysInput.value = settings.activeDays;
        statusRiscoDaysInput.value = settings.riskDays;
        const groqKeyInput = document.getElementById('groq-api-key');
        if (groqKeyInput) {
            groqKeyInput.value = settings.groqApiKey || '';
        }
        openModal('settings-modal');
    });

    // Copiar URL do Webhook
    document.getElementById('copy-webhook-url')?.addEventListener('click', () => {
        const webhookUrl = document.getElementById('webhook-url-display')?.textContent;
        if (webhookUrl) {
            navigator.clipboard.writeText(webhookUrl).then(() => {
                showToast('URL do Webhook copiada!', 'success');
            }).catch(() => {
                // Fallback para navegadores antigos
                const textarea = document.createElement('textarea');
                textarea.value = webhookUrl;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast('URL do Webhook copiada!', 'success');
            });
        }
    });
}

// ============================================================================
// SINCRONIZAÇÃO COM API
// ============================================================================

// Funções auxiliares para processamento de produtos (baseado na documentação FácilZap)
function extrairPreco(produto) {
    // API FacilZap: preço principal está em catalogos[0].precos.preco
    
    // 1. Tentar catálogo primeiro (estrutura padrão FacilZap)
    if (produto.catalogos && produto.catalogos.length > 0) {
        // Procurar primeiro catálogo com preço > 0
        for (const catalogo of produto.catalogos) {
            const preco = catalogo.precos?.preco;
            if (preco && Number(preco) > 0) return Number(preco);
        }
    }
    
    // 2. Preco direto no produto
    if (typeof produto.preco === 'number' && produto.preco > 0) return produto.preco;
    if (typeof produto.preco === 'string' && parseFloat(produto.preco) > 0) return parseFloat(produto.preco);
    
    // 3. Campo "valor"
    if (typeof produto.valor === 'number' && produto.valor > 0) return produto.valor;
    if (typeof produto.valor === 'string' && parseFloat(produto.valor) > 0) return parseFloat(produto.valor);
    
    // 4. Tentar pegar da primeira variação
    if (produto.variacoes && produto.variacoes.length > 0) {
        const precoVariacao = produto.variacoes[0].preco || produto.variacoes[0].valor;
        if (precoVariacao && Number(precoVariacao) > 0) return Number(precoVariacao);
    }
    
    return 0;
}

function extrairEstoqueVariacao(variacao) {
    if (!variacao) return 0;
    const est = variacao.estoque;
    
    if (typeof est === 'number') return est;
    if (typeof est === 'string') return parseInt(est) || 0;
    if (typeof est === 'object' && est !== null) {
        return Number(est.estoque ?? est.disponivel ?? est.quantidade ?? 0);
    }
    return 0;
}

function extrairEstoqueProduto(produto) {
    const est = produto.estoque;
    
    if (typeof est === 'number') return est;
    if (typeof est === 'string') return parseInt(est) || 0;
    if (typeof est === 'object' && est !== null) {
        return Number(est.disponivel ?? est.estoque ?? est.quantidade ?? 0);
    }
    return 0;
}

function calcularEstoqueTotal(produto) {
    // Se tem variações, somar o estoque de todas
    if (Array.isArray(produto.variacoes) && produto.variacoes.length > 0) {
        return produto.variacoes.reduce((total, variacao) => {
            return total + extrairEstoqueVariacao(variacao);
        }, 0);
    }
    // Produto sem variações - estoque direto
    return extrairEstoqueProduto(produto);
}

function extrairImagemPrincipal(produto) {
    const imagens = produto.imagens || produto.fotos || produto.images || [];
    if (imagens.length === 0) return null;
    
    const primeira = imagens[0];
    
    if (typeof primeira === 'string') return primeira;
    if (typeof primeira === 'object' && primeira !== null) {
        // A API FacilZap retorna objeto com .url
        // Priorizar 'url' que contém o link completo
        const url = primeira.url || primeira.path || primeira.src || 
                   primeira.link || primeira.arquivo || 
                   primeira.imagem || primeira.foto || primeira.image ||
                   primeira.thumbnail || primeira.thumb;
        
        // Se só tem 'file', construir URL completa
        if (!url && primeira.file) {
            return `https://arquivos.facilzap.app.br/${primeira.file}`;
        }
        return url || null;
    }
    return null;
}

function extrairTodasImagens(produto) {
    const imagens = produto.imagens || produto.fotos || produto.images || [];
    return imagens.map(img => {
        if (typeof img === 'string') return img;
        if (typeof img === 'object' && img !== null) {
            // Priorizar .url (link completo)
            const url = img.url || img.path || img.src || 
                   img.link || img.arquivo ||
                   img.imagem || img.foto || img.image ||
                   img.thumbnail || img.thumb;
            
            // Se só tem 'file', construir URL completa
            if (!url && img.file) {
                return `https://arquivos.facilzap.app.br/${img.file}`;
            }
            return url || null;
        }
        return null;
    }).filter(Boolean);
}

function extrairCodigoBarras(produto) {
    const codBarras = produto.cod_barras;
    
    // API FacilZap: cod_barras é objeto com .numero ou .numero_interno
    if (codBarras && typeof codBarras === 'object') {
        if (codBarras.numero) return String(codBarras.numero);
        if (codBarras.numero_interno) return String(codBarras.numero_interno);
    }
    
    // Array de códigos
    if (Array.isArray(codBarras) && codBarras.length > 0) {
        const primeiro = codBarras[0];
        if (typeof primeiro === 'string') return primeiro;
        if (primeiro?.numero) return String(primeiro.numero);
    }
    
    // String direta
    if (typeof codBarras === 'string') return codBarras;
    return null;
}

function processarVariacoes(produto) {
    const variacoes = produto.variacoes || [];
    return variacoes.map(v => ({
        id: String(v.id ?? v.codigo ?? ''),
        sku: v.sku ?? v.codigo ?? null,
        nome: v.nome ?? v.name ?? null,
        preco: Number(v.preco ?? 0),
        estoque: extrairEstoqueVariacao(v),
        ativo: Boolean(v.ativada ?? v.ativo ?? true)
    }));
}

function processarProdutoAPI(p) {
    const variacoes = processarVariacoes(p);
    const preco = extrairPreco(p);
    const imagem = extrairImagemPrincipal(p);
    
    // Debug detalhado
    console.log('[DEBUG Produto]', {
        nome: p.nome,
        preco_extraido: preco,
        imagem_extraida: imagem,
        tem_imagens: !!(p.imagens && p.imagens.length > 0),
        tem_catalogos: !!(p.catalogos && p.catalogos.length > 0),
        preco_catalogo: p.catalogos?.[0]?.precos?.preco,
        url_imagem: p.imagens?.[0]?.url
    });
    
    return {
        id: String(p.id ?? p.codigo),
        codigo: p.codigo || p.id,
        name: p.nome ?? 'Sem nome',
        description: p.descricao || '',
        sku: p.sku || p.codigo || '',
        price: preco,
        stock: calcularEstoqueTotal(p),
        isActive: Boolean(p.ativado ?? p.ativo ?? true),
        managesStock: Boolean(p.estoque?.controlar_estoque),
        image: imagem,
        images: extrairTodasImagens(p),
        barcode: extrairCodigoBarras(p),
        variacoes: variacoes,
        hasVariacoes: variacoes.length > 0
    };
}

async function syncData() {
    showToast('Buscando dados na FacilZap... Isso pode levar um momento.', 'info');
    syncButton.disabled = true;
    syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center animate-spin"></i><span class="ml-4">Sincronizando...</span>';

    try {
        console.log('[SYNC] Iniciando sincronização...');
        const response = await fetch('/api/facilzap-proxy');
        console.log('[SYNC] Resposta recebida, status:', response.status);
        const data = await response.json();
        console.log('[SYNC] JSON parseado');
        
        if (!response.ok) {
            throw new Error(data.error || `Erro HTTP ${response.status}`);
        }

        const { clients: apiClients, orders: apiOrders, products: apiProducts } = data;
        
        console.log('[DEBUG] Dados recebidos da API:', {
            clients: apiClients?.length || 0,
            orders: apiOrders?.length || 0,
            products: apiProducts?.length || 0
        });
        
        // DEBUG: Verificar estrutura do primeiro pedido RAW
        if (apiOrders && apiOrders.length > 0) {
            const sampleOrder = apiOrders[0];
            console.log('[DEBUG RAW] Primeiro pedido da API:', sampleOrder);
            console.log('[DEBUG RAW] Campos do pedido:', Object.keys(sampleOrder));
            console.log('[DEBUG RAW] tem itens?', !!sampleOrder.itens, 'length:', sampleOrder.itens?.length);
            console.log('[DEBUG RAW] tem produtos?', !!sampleOrder.produtos, 'length:', sampleOrder.produtos?.length);
            if (sampleOrder.itens && sampleOrder.itens.length > 0) {
                console.log('[DEBUG RAW] Primeiro item:', sampleOrder.itens[0]);
            }
        }
        
        // Debug: mostrar primeiro produto RAW da API
        if (apiProducts && apiProducts.length > 0) {
            const sample = apiProducts[0];
            console.log('[DEBUG] Primeiro produto RAW:', {
                nome: sample.nome,
                preco: sample.preco,
                tem_imagens: !!(sample.imagens && sample.imagens.length),
                primeira_imagem: sample.imagens?.[0],
                tem_catalogos: !!(sample.catalogos && sample.catalogos.length),
                primeiro_catalogo_preco: sample.catalogos?.[0]?.precos?.preco
            });
        }
        
        if (!apiClients || !apiProducts) {
            throw new Error("Resposta da API inválida.");
        }
        
        // Se orders não veio, usar array vazio
        const ordersToProcess = apiOrders || [];

        // Processar e salvar produtos com funções melhoradas
        const productsMap = new Map();
        console.log('[SYNC] Processando', apiProducts.length, 'produtos...');
        const processedProducts = apiProducts.map(p => {
            const product = processarProdutoAPI(p);
            productsMap.set(product.id, product);
            return product;
        });
        
        // Log de verificação antes de salvar
        const prodComPreco = processedProducts.filter(p => p.price > 0).length;
        const prodComImagem = processedProducts.filter(p => p.image).length;
        console.log(`[SYNC] Produtos com preço > 0: ${prodComPreco}/${processedProducts.length}`);
        console.log(`[SYNC] Produtos com imagem: ${prodComImagem}/${processedProducts.length}`);
        if (processedProducts.length > 0) {
            console.log('[SYNC] Exemplo produto processado:', processedProducts[0]);
        }
        
        Storage.saveProducts(processedProducts);
        console.log(`[INFO] ${processedProducts.length} produtos salvos no localStorage`);

        // Processar clientes - capturando TODOS os campos possíveis
        const clientsMap = new Map();
        apiClients.forEach(c => {
            if (!c || !c.id) return;
            
            // Extrair telefone de qualquer campo disponível
            const phone = c.telefone || c.whatsapp || c.celular || '';
            
            clientsMap.set(String(c.id), {
                id: String(c.id),
                name: c.nome || 'Cliente sem nome',
                email: c.email || '',
                phone: phone,
                whatsapp: c.whatsapp || phone,
                birthday: c.data_nascimento || c.nascimento || null,
                cpf: c.cpf_cnpj || c.cpf || c.cnpj || '',
                address: c.endereco || '',
                address_number: c.numero || '',
                address_complement: c.complemento || '',
                address_neighborhood: c.bairro || '',
                city: c.cidade || '',
                state: c.estado || c.uf || '',
                zip_code: c.cep || '',
                origin: c.origem || '',
                lastPurchaseDate: c.ultima_compra || null,
                totalSpent: 0,
                orderCount: 0,
                products: new Map(), // Map de produto_id -> {name, quantity, price, lastPurchase}
                orderIds: [] // Lista de IDs dos pedidos
            });
        });

        // Processar pedidos e relacionar com clientes
        const processedOrders = [];
        console.log('[DEBUG] Processando pedidos:', ordersToProcess.length);
        ordersToProcess.forEach(order => {
            if (!order || !order.id) return;
            
            // Tentar pegar o cliente_id do pedido ou do objeto cliente
            const clientId = order.cliente_id 
                ? String(order.cliente_id) 
                : (order.cliente?.id ? String(order.cliente.id) : null);
                
            const orderDate = order.data ? new Date(order.data) : new Date();
            const orderTotal = parseFloat(order.total) || parseFloat(order.valor_total) || 0;

            // Extrair produtos do pedido - tentar TODOS os campos possíveis
            const orderProducts = [];
            const productList = order.itens || order.produtos || order.items || order.products || [];
            
            console.log(`[DEBUG] Pedido ${order.id} - ${productList.length} itens encontrados`);
            
            productList.forEach(item => {
                if (!item) return;
                const productId = String(item.produto_id || item.id || item.codigo || '');
                const productName = item.nome || item.name || item.descricao || item.produto?.nome || 'Produto';
                const quantity = parseInt(item.quantidade || item.qty || 1) || 1;
                const itemTotal = parseFloat(item.valor || item.subtotal || item.total || item.preco || 0);
                const unitPrice = item.preco_unitario || item.preco || (quantity > 0 ? itemTotal / quantity : 0);
                const itemImage = item.imagem || item.produto?.imagens?.[0]?.url || null;

                orderProducts.push({
                    productId,
                    productName,
                    quantity,
                    unitPrice,
                    total: itemTotal,
                    image: itemImage
                });

                // Atualizar histórico de produtos do cliente
                if (clientId && clientsMap.has(clientId)) {
                    const client = clientsMap.get(clientId);
                    if (client.products.has(productId)) {
                        const existing = client.products.get(productId);
                        existing.quantity += quantity;
                        existing.totalSpent += itemTotal;
                        if (orderDate > new Date(existing.lastPurchase)) {
                            existing.lastPurchase = orderDate.toISOString();
                        }
                    } else {
                        client.products.set(productId, {
                            productId,
                            name: productName,
                            quantity,
                            unitPrice,
                            totalSpent: itemTotal,
                            lastPurchase: orderDate.toISOString()
                        });
                    }
                }
            });

            // Criar registro do pedido - COMPLETO
            const processedOrder = {
                id: String(order.id),
                codigo: order.codigo || String(order.id),
                data: order.data || order.created_at || new Date().toISOString(),
                clientId,
                clientName: order.cliente?.nome || 'Cliente não identificado',
                clientPhone: order.cliente?.telefone || order.cliente?.whatsapp || '',
                clientEmail: order.cliente?.email || '',
                clientCpf: order.cliente?.cpf_cnpj || order.cliente?.cpf || '',
                total: orderTotal,
                status: order.status || order.status_pedido || '',
                formaPagamento: order.forma_pagamento || '',
                products: orderProducts,
                origin: order.origem || ''
            };
            processedOrders.push(processedOrder);

            // Atualizar estatísticas do cliente
            if (clientId && clientsMap.has(clientId)) {
                const client = clientsMap.get(clientId);
                client.totalSpent += orderTotal;
                client.orderCount++;
                client.orderIds.push(processedOrder.id);
                
                if (!client.lastPurchaseDate || orderDate > new Date(client.lastPurchaseDate)) {
                    client.lastPurchaseDate = orderDate.toISOString().split('T')[0];
                }
            }
        });

        // Converter Map de produtos de cada cliente para Array
        const processedClients = Array.from(clientsMap.values()).map(client => ({
            ...client,
            products: Array.from(client.products.values())
        }));

        // Salvar no LocalStorage
        Storage.saveClients(processedClients);
        Storage.saveOrders(processedOrders);
        Storage.saveLastSync(new Date().toISOString());

        showToast(`Sincronização concluída! ${processedClients.length} clientes, ${processedOrders.length} pedidos e ${processedProducts.length} produtos.`, 'success');
        
        // Renderizar dados
        renderAll();
        
        // SALVAR AUTOMATICAMENTE NO SUPABASE
        try {
            showToast('Salvando na nuvem...', 'info');
            await SupabaseSync.saveAll();
            showToast('Dados salvos no Supabase!', 'success');
        } catch (supaError) {
            console.error('Erro ao salvar no Supabase:', supaError);
            showToast('Aviso: Dados locais OK, mas falhou salvar na nuvem', 'warning', 5000);
        }

    } catch (error) {
        console.error('Erro na sincronização:', error);
        showToast(`Erro na sincronização: ${error.message}`, 'error', 5000);
    } finally {
        syncButton.disabled = false;
        syncButton.innerHTML = '<i class="fas fa-sync-alt w-6 text-center"></i><span class="ml-4">Sincronizar Dados</span>';
    }
}

// ============================================================================
// LÓGICA DE CRM - STATUS DE CLIENTES
// ============================================================================

function getClientStatus(client) {
    const settings = Storage.getSettings();
    
    if (!client.lastPurchaseDate) {
        return { text: 'Sem Histórico', class: 'status-sem-historico' };
    }

    const lastPurchase = new Date(client.lastPurchaseDate);
    const today = new Date();
    const diffTime = Math.abs(today - lastPurchase);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= settings.activeDays) {
        return { text: 'Ativo', class: 'status-ativo', days: diffDays };
    } else if (diffDays <= settings.riskDays) {
        return { text: 'Em Risco', class: 'status-risco', days: diffDays };
    } else {
        return { text: 'Inativo', class: 'status-inativo', days: diffDays };
    }
}

// ============================================================================
// MOTOR DE CLASSIFICAÇÃO AUTOMÁTICA (TERMÔMETRO)
// ============================================================================

/**
 * Classificação por Temperatura (estilo ZUP/Salesforce)
 * Usa parâmetros customizáveis (podem ser sugeridos pela IA)
 */
function getClientTemperature(client) {
    const days = getDaysSinceLastPurchase(client);
    const params = classificationParams || { hotDays: 30, warmDays: 90 };
    
    if (days === Infinity) {
        return { temp: 'sem-dados', label: 'Sem Dados', emoji: '❓', color: 'gray', days: null };
    }
    if (days <= params.hotDays) {
        return { temp: 'quente', label: 'Quente', emoji: '', icon: 'fa-fire-alt', color: 'red', days };
    }
    if (days <= params.warmDays) {
        return { temp: 'morno', label: 'Morno', emoji: '🌡️', color: 'yellow', days };
    }
    return { temp: 'frio', label: 'Frio', emoji: '❄️', color: 'blue', days };
}

/**
 * Classificação VIP - Usa parâmetros customizáveis
 */
function getClientVIPStatus(client, allClients) {
    const params = classificationParams || { vipMinValue: 500, loyalMinOrders: 5 };
    
    const ticketMedio = client.orderCount > 0 ? client.totalSpent / client.orderCount : 0;
    
    // Super VIP: 3x o valor mínimo VIP
    const isSuperVIP = client.totalSpent > params.vipMinValue * 3;
    // VIP: acima do valor mínimo
    const isVIP = client.totalSpent > params.vipMinValue;
    
    if (isSuperVIP) {
        return { vip: 'super-vip', label: 'Super VIP', emoji: '💎', ticketMedio };
    }
    if (isVIP) {
        return { vip: 'vip', label: 'VIP', emoji: '⭐', ticketMedio };
    }
    return { vip: 'regular', label: 'Regular', emoji: '', ticketMedio };
    
    if (isSuperVIP) {
        return { vip: 'super-vip', label: 'Super VIP', emoji: '💎', ticketMedio };
    }
    if (isVIP) {
        return { vip: 'vip', label: 'VIP', emoji: '⭐', ticketMedio };
    }
    return { vip: 'regular', label: 'Regular', emoji: '', ticketMedio };
}

/**
 * Extrair Estado (UF) do telefone ou endereço
 */
function getClientState(client) {
    // Tentar extrair do DDD do telefone
    const phone = (client.phone || '').replace(/\D/g, '');
    if (phone.length >= 10) {
        const ddd = phone.substring(0, 2);
        const dddToState = {
            '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
            '21': 'RJ', '22': 'RJ', '24': 'RJ',
            '27': 'ES', '28': 'ES',
            '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
            '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
            '47': 'SC', '48': 'SC', '49': 'SC',
            '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
            '61': 'DF',
            '62': 'GO', '64': 'GO',
            '63': 'TO',
            '65': 'MT', '66': 'MT',
            '67': 'MS',
            '68': 'AC',
            '69': 'RO',
            '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
            '79': 'SE',
            '81': 'PE', '87': 'PE',
            '82': 'AL',
            '83': 'PB',
            '84': 'RN',
            '85': 'CE', '88': 'CE',
            '86': 'PI', '89': 'PI',
            '91': 'PA', '93': 'PA', '94': 'PA',
            '92': 'AM', '97': 'AM',
            '95': 'RR',
            '96': 'AP',
            '98': 'MA', '99': 'MA'
        };
        if (dddToState[ddd]) {
            return { uf: dddToState[ddd], source: 'ddd' };
        }
    }
    
    // Tentar do endereço
    if (client.state) {
        return { uf: client.state.toUpperCase(), source: 'address' };
    }
    
    return { uf: 'N/A', source: 'unknown' };
}

/**
 * Gerar todas as tags de um cliente
 */
function getClientTags(client, allClients) {
    const temperature = getClientTemperature(client);
    const vipStatus = getClientVIPStatus(client, allClients);
    const state = getClientState(client);
    
    const tags = [];
    
    // Tag de temperatura
    tags.push({
        type: 'temperature',
        value: temperature.temp,
        label: temperature.label,
        emoji: temperature.emoji,
        color: temperature.color
    });
    
    // Tag VIP
    if (vipStatus.vip !== 'regular') {
        tags.push({
            type: 'vip',
            value: vipStatus.vip,
            label: vipStatus.label,
            emoji: vipStatus.emoji
        });
    }
    
    // Tag de fidelidade
    if (client.orderCount >= 10) {
        tags.push({ type: 'loyalty', value: 'super-fiel', label: 'Super Fiel', emoji: '🏆' });
    } else if (client.orderCount >= 5) {
        tags.push({ type: 'loyalty', value: 'fiel', label: 'Fiel', emoji: '🌟' });
    }
    
    // Tag de geografia
    if (state.uf !== 'N/A') {
        tags.push({
            type: 'geography',
            value: state.uf,
            label: state.uf,
            emoji: '📍'
        });
    }
    
    return {
        tags,
        temperature,
        vipStatus,
        state,
        ticketMedio: vipStatus.ticketMedio
    };
}

/**
 * Gerar análise de segmentos para a IA
 */
function generateSegmentAnalysis() {
    const clients = Storage.getClients();
    const orders = Storage.getOrders();
    const products = Storage.getProducts();
    
    // Classificar todos os clientes
    const clientsWithTags = clients.map(c => ({
        ...c,
        ...getClientTags(c, clients)
    }));
    
    // Agrupar por temperatura
    const byTemperature = {
        quente: clientsWithTags.filter(c => c.temperature.temp === 'quente'),
        morno: clientsWithTags.filter(c => c.temperature.temp === 'morno'),
        frio: clientsWithTags.filter(c => c.temperature.temp === 'frio'),
        semDados: clientsWithTags.filter(c => c.temperature.temp === 'sem-dados')
    };
    
    // Agrupar por estado
    const byState = {};
    clientsWithTags.forEach(c => {
        const uf = c.state.uf;
        if (!byState[uf]) byState[uf] = [];
        byState[uf].push(c);
    });
    
    // Agrupar VIPs
    const vips = clientsWithTags.filter(c => c.vipStatus.vip !== 'regular');
    
    // Clientes em risco (frios com alto LTV)
    const churnRisk = byTemperature.frio.filter(c => c.totalSpent > 500);
    
    // Produtos mais vendidos
    const productSales = {};
    orders.forEach(order => {
        (order.products || []).forEach(p => {
            if (!productSales[p.productName]) {
                productSales[p.productName] = { name: p.productName, quantity: 0, revenue: 0 };
            }
            productSales[p.productName].quantity += p.quantity;
            productSales[p.productName].revenue += p.total;
        });
    });
    const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    
    return {
        totalClients: clients.length,
        totalOrders: orders.length,
        totalProducts: products.length,
        totalRevenue: clients.reduce((sum, c) => sum + c.totalSpent, 0),
        byTemperature: {
            quente: { count: byTemperature.quente.length, clients: byTemperature.quente },
            morno: { count: byTemperature.morno.length, clients: byTemperature.morno },
            frio: { count: byTemperature.frio.length, clients: byTemperature.frio },
            semDados: { count: byTemperature.semDados.length, clients: byTemperature.semDados }
        },
        byState,
        vips: { count: vips.length, clients: vips },
        churnRisk: { count: churnRisk.length, clients: churnRisk },
        topProducts
    };
}

function getDaysSinceLastPurchase(client) {
    if (!client.lastPurchaseDate) return Infinity;
    const lastPurchase = new Date(client.lastPurchaseDate);
    const today = new Date();
    return Math.ceil(Math.abs(today - lastPurchase) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// RENDERIZAÇÃO DE CLIENTES
// ============================================================================

function renderClients() {
    const clients = Storage.getClients();
    clientCardsContainer.innerHTML = '';

    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const statusFilter = filterStatusSelect?.value || 'todos';
    const tagFilter = filterTagSelect?.value || 'todos';
    const sortOption = sortClientsSelect?.value || 'default';

    // Filtrar clientes
    let filteredClients = clients.filter(client => {
        const status = getClientStatus(client).text.toLowerCase().replace(' ', '-');
        const tag = (client.orderCount >= 7) ? 'cliente-fiel' : 'sem-tag';
        
        const matchesStatus = statusFilter === 'todos' || status === statusFilter;
        const matchesTag = tagFilter === 'todos' || tag === tagFilter;
        const matchesSearch = !searchTerm ||
            (client.name && client.name.toLowerCase().includes(searchTerm)) ||
            (client.email && client.email.toLowerCase().includes(searchTerm)) ||
            (client.phone && client.phone.includes(searchTerm));

        return matchesStatus && matchesTag && matchesSearch;
    });

    // Ordenar clientes
    switch (sortOption) {
        case 'most-orders':
            filteredClients.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
            break;
        case 'least-orders':
            filteredClients.sort((a, b) => (a.orderCount || 0) - (b.orderCount || 0));
            break;
        case 'highest-spent':
            filteredClients.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
            break;
        case 'lowest-spent':
            filteredClients.sort((a, b) => (a.totalSpent || 0) - (b.totalSpent || 0));
            break;
        case 'most-inactive':
            filteredClients.sort((a, b) => getDaysSinceLastPurchase(b) - getDaysSinceLastPurchase(a));
            break;
        case 'least-inactive':
            filteredClients.sort((a, b) => getDaysSinceLastPurchase(a) - getDaysSinceLastPurchase(b));
            break;
        default:
            // Ordenação padrão: por nome
            filteredClients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    clientCountDisplay.textContent = `Exibindo ${filteredClients.length} de ${clients.length} clientes`;
    noClientsMessage?.classList.toggle('hidden', filteredClients.length > 0);

    filteredClients.forEach(client => {
        const status = getClientStatus(client);
        const daysSince = getDaysSinceLastPurchase(client);
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md p-5 flex flex-col justify-between hover:shadow-lg transition-shadow';

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-800 text-lg truncate" title="${escapeHtml(client.name)}">${escapeHtml(client.name || 'Cliente sem nome')}</h3>
                    <span class="status-badge ${status.class} whitespace-nowrap ml-2">${status.text}</span>
                </div>
                <p class="text-sm text-gray-500 mb-1 truncate">${escapeHtml(client.email || 'Sem e-mail')}</p>
                <p class="text-sm text-gray-500 mb-4 truncate">${escapeHtml(client.phone || 'Sem telefone')}</p>
                <div class="text-sm space-y-2 mb-4">
                    <p><i class="fas fa-shopping-basket fa-fw text-gray-400 mr-2"></i>Pedidos: <span class="font-semibold">${client.orderCount || 0}</span></p>
                    <p><i class="fas fa-dollar-sign fa-fw text-gray-400 mr-2"></i>Total Gasto: <span class="font-semibold">${formatCurrency(client.totalSpent)}</span></p>
                    <p><i class="fas fa-calendar-alt fa-fw text-gray-400 mr-2"></i>Última Compra: <span class="font-semibold">${client.lastPurchaseDate ? formatDate(client.lastPurchaseDate) : 'N/A'}</span></p>
                    ${daysSince !== Infinity ? `<p><i class="fas fa-clock fa-fw text-gray-400 mr-2"></i>Dias sem comprar: <span class="font-semibold ${daysSince > 60 ? 'text-red-600' : daysSince > 30 ? 'text-yellow-600' : 'text-green-600'}">${daysSince}</span></p>` : ''}
                </div>
                ${(client.orderCount >= 7) ? `<div class="mb-4"><span class="tag-badge tag-fiel">🌟 Cliente Fiel</span></div>` : ''}
            </div>
            <div class="border-t pt-4 flex justify-end space-x-2">
                <button class="text-gray-500 hover:text-indigo-600 view-details-button p-2" data-id="${client.id}" title="Ver Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="text-gray-500 hover:text-green-600 whatsapp-button p-2" data-phone="${escapeHtml(client.phone)}" title="WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </button>
                <button class="text-gray-500 hover:text-blue-600 edit-client-button p-2" data-id="${client.id}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-gray-500 hover:text-red-600 delete-client-button p-2" data-id="${client.id}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        clientCardsContainer.appendChild(card);
    });

    // Adicionar event listeners
    setupClientCardListeners();
}

function setupClientCardListeners() {
    // Ver detalhes
    document.querySelectorAll('.view-details-button').forEach(btn => {
        btn.addEventListener('click', () => viewClientDetails(btn.dataset.id));
    });

    // WhatsApp
    document.querySelectorAll('.whatsapp-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const phone = btn.dataset.phone?.replace(/\D/g, '');
            if (phone) {
                window.open(`https://wa.me/55${phone}`, '_blank');
            } else {
                showToast('Cliente não possui telefone cadastrado.', 'error');
            }
        });
    });

    // Editar
    document.querySelectorAll('.edit-client-button').forEach(btn => {
        btn.addEventListener('click', () => editClient(btn.dataset.id));
    });

    // Excluir
    document.querySelectorAll('.delete-client-button').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteClient(btn.dataset.id));
    });
}

// ============================================================================
// DETALHES DO CLIENTE (com histórico de compras)
// ============================================================================

function viewClientDetails(clientId) {
    const clients = Storage.getClients();
    const orders = Storage.getOrders();
    const products = Storage.getProducts();
    
    // CORREÇÃO: Buscar com comparação flexível (string ou número)
    const client = clients.find(c => String(c.id) === String(clientId));

    if (!client) {
        console.error('[viewClientDetails] Cliente não encontrado. ID buscado:', clientId, 'Tipo:', typeof clientId);
        console.log('[viewClientDetails] IDs disponíveis:', clients.slice(0, 5).map(c => ({ id: c.id, tipo: typeof c.id })));
        showToast('Cliente não encontrado. ID: ' + clientId, 'error');
        return;
    }
    
    console.log('[viewClientDetails] Cliente encontrado:', client.name, 'Phone:', client.phone);

    const status = getClientStatus(client);
    const daysSince = getDaysSinceLastPurchase(client);

    // Buscar pedidos do cliente (comparação flexível)
    const clientOrders = orders.filter(o => String(o.clientId) === String(clientId))
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    // Criar mapa de produtos para lookup rápido
    const productsMap = new Map(products.map(p => [p.id, p]));

    // Gerar HTML do histórico de produtos
    let productsHtml = '<p class="text-sm text-gray-500">Nenhum produto comprado.</p>';
    if (client.products && client.products.length > 0) {
        const sortedProducts = [...client.products].sort((a, b) => b.quantity - a.quantity);
        productsHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qtd Total</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Un.</th>
                            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Última Compra</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${sortedProducts.map(p => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-2 whitespace-nowrap">${escapeHtml(p.name)}</td>
                                <td class="px-4 py-2 text-center font-semibold">${p.quantity}</td>
                                <td class="px-4 py-2 text-right">${formatCurrency(p.unitPrice)}</td>
                                <td class="px-4 py-2 text-right font-medium">${formatCurrency(p.totalSpent)}</td>
                                <td class="px-4 py-2 text-center text-sm text-gray-500">${formatDate(p.lastPurchase)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Gerar HTML do histórico de pedidos COM PRODUTOS EXPANDIDOS
    let ordersHtml = '<p class="text-sm text-gray-500">Nenhum pedido encontrado.</p>';
    if (clientOrders.length > 0) {
        ordersHtml = `
            <div class="space-y-3">
                ${clientOrders.slice(0, 10).map((order, idx) => {
                    const orderProducts = order.products || [];
                    return `
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-4 py-3 flex justify-between items-center cursor-pointer" 
                                 onclick="document.getElementById('order-items-${idx}').classList.toggle('hidden')">
                                <div class="flex items-center gap-4">
                                    <span class="font-mono text-sm font-semibold">#${escapeHtml(order.codigo)}</span>
                                    <span class="text-gray-500 text-sm">${formatDate(order.data)}</span>
                                </div>
                                <div class="flex items-center gap-4">
                                    <span class="font-bold text-green-600">${formatCurrency(order.total)}</span>
                                    <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">${orderProducts.length} itens</span>
                                    <i class="fas fa-chevron-down text-gray-400"></i>
                                </div>
                            </div>
                            <div id="order-items-${idx}" class="hidden border-t bg-white p-3">
                                ${orderProducts.length > 0 ? `
                                    <div class="space-y-2">
                                        ${orderProducts.map(p => {
                                            // Tentar pegar imagem do catálogo se não tiver no pedido
                                            const catalogProduct = productsMap.get(String(p.productId));
                                            const imageUrl = p.image || catalogProduct?.image || null;
                                            const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3QgZmlsbD0iI2YzZjRmNiIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+';
                                            return `
                                                <div class="flex items-center gap-3 p-2 bg-gray-50 rounded">
                                                    <img src="${imageUrl || placeholderImg}" alt="" class="w-10 h-10 object-cover rounded" onerror="this.src='${placeholderImg}'">
                                                    <div class="flex-1">
                                                        <p class="font-medium text-sm">${escapeHtml(p.productName || p.name || 'Produto')}</p>
                                                        <p class="text-xs text-gray-500">Qtd: ${p.quantity} × ${formatCurrency(p.unitPrice || 0)}</p>
                                                    </div>
                                                    <span class="font-semibold text-green-600">${formatCurrency(p.total || (p.quantity * (p.unitPrice || 0)))}</span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : '<p class="text-sm text-gray-400 text-center">Detalhes dos produtos não disponíveis</p>'}
                            </div>
                        </div>
                    `;
                }).join('')}
                ${clientOrders.length > 10 ? `<p class="text-sm text-gray-500 mt-2 text-center">...e mais ${clientOrders.length - 10} pedidos</p>` : ''}
            </div>
        `;
    }

    detailsModalTitle.textContent = `Detalhes de ${escapeHtml(client.name)}`;
    detailsModalContent.innerHTML = `
        <!-- Ações Rápidas -->
        <div class="flex gap-2 mb-4">
            ${client.phone ? `
                <a href="https://wa.me/55${client.phone.replace(/\\D/g, '')}" target="_blank" 
                   class="flex-1 bg-green-600 hover:bg-green-700 text-white text-center py-2 px-4 rounded-lg font-medium">
                    <i class="fab fa-whatsapp mr-2"></i>Enviar WhatsApp
                </a>
            ` : `
                <button disabled class="flex-1 bg-gray-300 text-gray-500 py-2 px-4 rounded-lg font-medium cursor-not-allowed">
                    <i class="fab fa-whatsapp mr-2"></i>Sem telefone
                </button>
            `}
            <button onclick="generateClientCoupon('${client.id}')" class="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg font-medium">
                <i class="fas fa-ticket-alt mr-2"></i>Gerar Cupom
            </button>
        </div>

        <!-- Status e Estatísticas -->
        <div class="bg-gray-50 rounded-lg p-4 mb-6">
            <div class="flex items-center justify-between mb-4">
                <span class="status-badge ${status.class} text-base px-4 py-2">${status.text}</span>
                ${daysSince !== Infinity ? `
                    <span class="text-sm text-gray-600">
                        <i class="fas fa-clock mr-1"></i> ${daysSince} dias sem comprar
                    </span>
                ` : ''}
            </div>
            <div class="grid grid-cols-3 gap-4 text-center">
                <div class="bg-white rounded-lg p-3 shadow-sm">
                    <div class="text-2xl font-bold text-indigo-600">${client.orderCount || 0}</div>
                    <div class="text-xs text-gray-500 uppercase">Pedidos</div>
                </div>
                <div class="bg-white rounded-lg p-3 shadow-sm">
                    <div class="text-2xl font-bold text-green-600">${formatCurrency(client.totalSpent)}</div>
                    <div class="text-xs text-gray-500 uppercase">Total Gasto</div>
                </div>
                <div class="bg-white rounded-lg p-3 shadow-sm">
                    <div class="text-2xl font-bold text-purple-600">${client.products?.length || 0}</div>
                    <div class="text-xs text-gray-500 uppercase">Produtos</div>
                </div>
            </div>
        </div>

        <!-- Informações de Contato -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm mb-6 pb-4 border-b">
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-envelope fa-fw mr-2 text-gray-400"></i>E-mail:</strong>
                ${escapeHtml(client.email || 'N/A')}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-phone fa-fw mr-2 text-gray-400"></i>Telefone:</strong>
                ${escapeHtml(client.phone || 'N/A')}
                ${client.phone ? `<a href="https://wa.me/55${client.phone.replace(/\D/g, '')}" target="_blank" class="ml-2 text-green-600 hover:text-green-700"><i class="fab fa-whatsapp"></i></a>` : ''}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-id-card fa-fw mr-2 text-gray-400"></i>CPF/CNPJ:</strong>
                ${escapeHtml(client.cpf || 'N/A')}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-gift fa-fw mr-2 text-gray-400"></i>Aniversário:</strong>
                ${client.birthday ? formatDate(client.birthday) : 'N/A'}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-calendar-check fa-fw mr-2 text-gray-400"></i>Última Compra:</strong>
                ${client.lastPurchaseDate ? formatDate(client.lastPurchaseDate) : 'N/A'}
            </div>
            <div>
                <strong class="text-gray-600 block"><i class="fas fa-tag fa-fw mr-2 text-gray-400"></i>Origem:</strong>
                ${escapeHtml(client.origin || 'N/A')}
            </div>
        </div>

        <!-- Histórico de Produtos -->
        <div class="mb-6">
            <h3 class="text-lg font-semibold mb-3 flex items-center">
                <i class="fas fa-box-open mr-2 text-indigo-500"></i>
                Produtos Comprados
            </h3>
            ${productsHtml}
        </div>

        <!-- Histórico de Pedidos -->
        <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center">
                <i class="fas fa-receipt mr-2 text-green-500"></i>
                Últimos Pedidos
            </h3>
            ${ordersHtml}
        </div>
    `;

    openModal('details-modal');
}

// ============================================================================
// GESTÃO DE CLIENTES (CRUD)
// ============================================================================

function editClient(clientId) {
    const clients = Storage.getClients();
    const client = clients.find(c => c.id === clientId);

    if (!client) {
        showToast('Cliente não encontrado.', 'error');
        return;
    }

    document.getElementById('client-id').value = client.id;
    document.getElementById('name').value = client.name || '';
    document.getElementById('email').value = client.email || '';
    document.getElementById('phone').value = client.phone || '';
    document.getElementById('birthday').value = client.birthday || '';

    modalTitle.textContent = 'Editar Cliente';
    openModal('client-modal');
}

let clientToDelete = null;

function confirmDeleteClient(clientId) {
    clientToDelete = clientId;
    openModal('confirm-modal');
}

function deleteClient() {
    if (!clientToDelete) return;

    let clients = Storage.getClients();
    clients = clients.filter(c => c.id !== clientToDelete);
    Storage.saveClients(clients);

    showToast('Cliente excluído com sucesso.', 'success');
    clientToDelete = null;
    closeModal('confirm-modal');
    renderClients();
}

function saveClient(e) {
    e.preventDefault();

    const clientId = document.getElementById('client-id').value;
    const clientData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        birthday: document.getElementById('birthday').value || null
    };

    let clients = Storage.getClients();

    if (clientId) {
        // Editar existente
        const index = clients.findIndex(c => c.id === clientId);
        if (index !== -1) {
            clients[index] = { ...clients[index], ...clientData };
        }
        showToast('Cliente atualizado com sucesso.', 'success');
    } else {
        // Novo cliente
        const newClient = {
            id: 'local_' + Date.now(),
            ...clientData,
            totalSpent: 0,
            orderCount: 0,
            products: [],
            orderIds: [],
            lastPurchaseDate: null,
            origin: 'manual'
        };
        clients.push(newClient);
        showToast('Cliente adicionado com sucesso.', 'success');
    }

    Storage.saveClients(clients);
    closeModal('client-modal');
    renderClients();
}

// ============================================================================
// RENDERIZAÇÃO DE PRODUTOS
// ============================================================================

function renderProducts() {
    const products = Storage.getProducts();
    
    // DEBUG: Verificar o que está vindo do localStorage
    console.log('[RENDER] Total produtos:', products.length);
    if (products.length > 0) {
        const sample = products[0];
        console.log('[RENDER] Primeiro produto do Storage:', {
            name: sample.name,
            price: sample.price,
            image: sample.image,
            stock: sample.stock
        });
        const comPreco = products.filter(p => p.price > 0).length;
        const comImagem = products.filter(p => p.image).length;
        console.log(`[RENDER] Com preço: ${comPreco}/${products.length}, Com imagem: ${comImagem}/${products.length}`);
    }
    
    productCardsContainer.innerHTML = '';

    const searchTerm = productSearchInput?.value?.toLowerCase() || '';
    const stockFilter = filterStockSelect?.value || 'todos';
    const activeFilter = filterActiveSelect?.value || 'todos';

    let filteredProducts = products.filter(product => {
        const matchesSearch = !searchTerm ||
            (product.name && product.name.toLowerCase().includes(searchTerm)) ||
            (product.sku && product.sku.toLowerCase().includes(searchTerm)) ||
            (product.barcode && product.barcode.includes(searchTerm));

        const matchesStock = stockFilter === 'todos' ||
            (stockFilter === 'gerenciado' && product.managesStock) ||
            (stockFilter === 'nao-gerenciado' && !product.managesStock) ||
            (stockFilter === 'em-estoque' && product.managesStock && product.stock > 0) ||
            (stockFilter === 'sem-estoque' && product.managesStock && product.stock <= 0) ||
            (stockFilter === 'com-variacoes' && product.hasVariacoes);

        const matchesActive = activeFilter === 'todos' ||
            (activeFilter === 'ativado' && product.isActive) ||
            (activeFilter === 'desativado' && !product.isActive);

        return matchesSearch && matchesStock && matchesActive;
    });

    // Ordenar por nome
    filteredProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    productCountDisplay.textContent = `Exibindo ${filteredProducts.length} de ${products.length} produtos`;
    noProductsMessage?.classList.toggle('hidden', filteredProducts.length > 0);

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow';

        // Usar URL direta da imagem ou placeholder cinza simples
        const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCBmaWxsPSIjZjNmNGY2IiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCI+U2VtIEZvdG88L3RleHQ+PC9zdmc+';
        const imageUrl = product.image || placeholderImg;

        // Determinar classe de estoque
        const stockClass = product.managesStock 
            ? (product.stock > 0 ? 'stock-in' : 'stock-out')
            : 'stock-unmanaged';
        const stockLabel = product.managesStock 
            ? (product.stock > 0 ? `${product.stock} un.` : 'Sem estoque')
            : 'Sem controle';

        card.innerHTML = `
            <div class="aspect-square bg-gray-100 relative">
                <img src="${imageUrl}" alt="${escapeHtml(product.name)}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCBmaWxsPSIjZjNmNGY2IiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCI+U2VtIEZvdG88L3RleHQ+PC9zdmc+'">
                <span class="absolute top-2 right-2 stock-badge ${product.isActive ? 'stock-in' : 'stock-out'}">${product.isActive ? 'Ativo' : 'Inativo'}</span>
                ${product.hasVariacoes ? `
                    <span class="absolute top-2 left-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                        ${product.variacoes.length} variações
                    </span>
                ` : ''}
            </div>
            <div class="p-4">
                <h3 class="font-semibold text-gray-800 truncate" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
                <p class="text-sm text-gray-500 mb-1">SKU: ${escapeHtml(product.sku || 'N/A')}</p>
                ${product.barcode ? `<p class="text-sm text-gray-400 mb-1"><i class="fas fa-barcode mr-1"></i>${escapeHtml(product.barcode)}</p>` : ''}
                
                <div class="flex justify-between items-center mt-3 mb-2">
                    <span class="text-lg font-bold text-green-600">${formatCurrency(product.price)}</span>
                    <span class="stock-badge ${stockClass}">${stockLabel}</span>
                </div>
                
                ${product.hasVariacoes ? `
                    <div class="mt-2 pt-2 border-t">
                        <p class="text-xs text-gray-500 mb-1">Variações:</p>
                        <div class="flex flex-wrap gap-1">
                            ${product.variacoes.slice(0, 3).map(v => `
                                <span class="text-xs bg-gray-100 px-2 py-1 rounded">${escapeHtml(v.nome || v.sku || 'Var')}</span>
                            `).join('')}
                            ${product.variacoes.length > 3 ? `<span class="text-xs text-gray-400">+${product.variacoes.length - 3}</span>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        productCardsContainer.appendChild(card);
    });
}

// ============================================================================
// RENDERIZAÇÃO DE PEDIDOS
// ============================================================================

function renderOrders() {
    const orders = Storage.getOrders();
    console.log('[DEBUG renderOrders] Total de pedidos no Storage:', orders.length);
    
    orderListContainer.innerHTML = '';

    const searchTerm = orderSearchInput?.value?.toLowerCase() || '';

    let filteredOrders = orders.filter(order => {
        return !searchTerm ||
            (order.codigo && order.codigo.toLowerCase().includes(searchTerm)) ||
            (order.clientName && order.clientName.toLowerCase().includes(searchTerm));
    }).sort((a, b) => new Date(b.data) - new Date(a.data));

    orderCountDisplay.textContent = `Exibindo ${filteredOrders.length} de ${orders.length} pedidos`;
    noOrdersMessage?.classList.toggle('hidden', filteredOrders.length > 0);

    filteredOrders.forEach(order => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        const itemCount = order.products?.length || 0;

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap font-mono text-sm">#${escapeHtml(order.codigo)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${escapeHtml(order.clientName)}</div>
                ${order.clientPhone ? `<div class="text-sm text-gray-500"><i class="fab fa-whatsapp text-green-500 mr-1"></i>${escapeHtml(order.clientPhone)}</div>` : '<div class="text-sm text-gray-400">Sem telefone</div>'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(order.data)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <span class="px-2 py-1 text-xs rounded-full ${itemCount > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}">
                    ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600">${formatCurrency(order.total)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button class="text-indigo-600 hover:text-indigo-900 view-order-button" data-id="${order.id}">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </td>
        `;

        orderListContainer.appendChild(row);
    });

    // Event listeners para ver detalhes do pedido
    document.querySelectorAll('.view-order-button').forEach(btn => {
        btn.addEventListener('click', () => viewOrderDetails(btn.dataset.id));
    });
}

function viewOrderDetails(orderId) {
    const orders = Storage.getOrders();
    const order = orders.find(o => o.id === orderId || o.id === String(orderId));

    if (!order) {
        showToast('Pedido não encontrado.', 'error');
        return;
    }

    // Buscar produtos do catálogo para imagens
    const allProducts = Storage.getProducts();
    const productsMap = new Map(allProducts.map(p => [String(p.id), p]));

    let productsHtml = '<p class="text-sm text-gray-500">Nenhum produto neste pedido.</p>';
    const orderProducts = order.products || [];
    
    if (orderProducts.length > 0) {
        productsHtml = `
            <div class="space-y-3">
                ${orderProducts.map(p => {
                    // Tentar pegar imagem do catálogo
                    const catalogProduct = productsMap.get(String(p.productId));
                    const imageUrl = p.image || catalogProduct?.image || null;
                    const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PHJlY3QgZmlsbD0iI2YzZjRmNiIgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5Y2EzYWYiIGZvbnQtc2l6ZT0iMTAiPj88L3RleHQ+PC9zdmc+';
                    
                    return `
                        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <img src="${imageUrl || placeholderImg}" alt="${escapeHtml(p.productName)}" 
                                class="w-14 h-14 object-cover rounded" 
                                onerror="this.src='${placeholderImg}'">
                            <div class="flex-1">
                                <p class="font-medium text-gray-800">${escapeHtml(p.productName)}</p>
                                <p class="text-sm text-gray-500">Qtd: ${p.quantity} × ${formatCurrency(p.unitPrice)}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-green-600">${formatCurrency(p.total)}</p>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    detailsModalTitle.textContent = `Pedido #${escapeHtml(order.codigo)}`;
    
    // Buscar dados completos do cliente se disponível
    const clients = Storage.getClients();
    const fullClient = order.clientId ? clients.find(c => String(c.id) === String(order.clientId)) : null;
    
    detailsModalContent.innerHTML = `
        <div class="space-y-4">
            <!-- Informações do Cliente -->
            <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="font-semibold mb-3 flex items-center">
                    <i class="fas fa-user mr-2 text-indigo-500"></i>Dados do Cliente
                </h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <strong class="text-gray-600">Nome:</strong>
                        <p>${escapeHtml(fullClient?.name || order.clientName || 'N/A')}</p>
                    </div>
                    <div>
                        <strong class="text-gray-600">Telefone:</strong>
                        <p>
                            ${escapeHtml(fullClient?.phone || order.clientPhone || 'N/A')}
                            ${(fullClient?.phone || order.clientPhone) ? 
                                `<a href="https://wa.me/55${(fullClient?.phone || order.clientPhone).replace(/\\D/g, '')}" target="_blank" class="ml-2 text-green-600"><i class="fab fa-whatsapp"></i></a>` : ''}
                        </p>
                    </div>
                    <div>
                        <strong class="text-gray-600">E-mail:</strong>
                        <p>${escapeHtml(fullClient?.email || order.clientEmail || 'N/A')}</p>
                    </div>
                    <div>
                        <strong class="text-gray-600">CPF/CNPJ:</strong>
                        <p>${escapeHtml(fullClient?.cpf || order.clientCpf || 'N/A')}</p>
                    </div>
                </div>
                ${fullClient?.address || fullClient?.city ? `
                    <div class="mt-3 pt-3 border-t text-sm">
                        <strong class="text-gray-600"><i class="fas fa-map-marker-alt mr-1"></i>Endereço:</strong>
                        <p>${escapeHtml([fullClient.address, fullClient.address_neighborhood, fullClient.city, fullClient.state].filter(Boolean).join(', ') || 'N/A')}</p>
                    </div>
                ` : ''}
            </div>

            <!-- Dados do Pedido -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div class="bg-white p-3 rounded-lg border">
                    <strong class="text-gray-600 block">Data:</strong>
                    <p class="font-medium">${formatDate(order.data)}</p>
                </div>
                <div class="bg-white p-3 rounded-lg border">
                    <strong class="text-gray-600 block">Status:</strong>
                    <p class="font-medium">${escapeHtml(order.status || 'N/A')}</p>
                </div>
                <div class="bg-white p-3 rounded-lg border">
                    <strong class="text-gray-600 block">Pagamento:</strong>
                    <p class="font-medium">${escapeHtml(order.formaPagamento || 'N/A')}</p>
                </div>
                <div class="bg-green-50 p-3 rounded-lg border border-green-200">
                    <strong class="text-gray-600 block">Total:</strong>
                    <p class="text-xl font-bold text-green-600">${formatCurrency(order.total)}</p>
                </div>
            </div>
            
            <!-- Produtos -->
            <div class="border-t pt-4">
                <h4 class="font-semibold mb-3 flex items-center">
                    <i class="fas fa-box mr-2 text-orange-500"></i>Produtos do Pedido (${orderProducts.length})
                </h4>
                ${productsHtml}
            </div>
        </div>
    `;

    openModal('details-modal');
}

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

function saveSettings(e) {
    e.preventDefault();

    const groqKeyInput = document.getElementById('groq-api-key');
    const settings = {
        activeDays: parseInt(statusAtivoDaysInput.value) || 30,
        riskDays: parseInt(statusRiscoDaysInput.value) || 60,
        groqApiKey: groqKeyInput?.value || ''
    };

    if (settings.riskDays <= settings.activeDays) {
        showToast('O período "Em Risco" deve ser maior que o período "Ativo".', 'error');
        return;
    }

    Storage.saveSettings(settings);
    showToast('Configurações salvas com sucesso.', 'success');
    closeModal('settings-modal');
    renderClients();
}

// ============================================================================
// GROWTH DASHBOARD - ANÁLISE ESTRATÉGICA
// ============================================================================

let selectedSegment = null;
let selectedClients = [];

function renderGrowthDashboard() {
    const analysis = generateSegmentAnalysis();
    
    // Atualizar contadores do termômetro
    document.getElementById('count-quente').textContent = analysis.byTemperature.quente.count;
    document.getElementById('count-morno').textContent = analysis.byTemperature.morno.count;
    document.getElementById('count-frio').textContent = analysis.byTemperature.frio.count;
    
    // KPIs
    const kpisContainer = document.getElementById('growth-kpis');
    kpisContainer.innerHTML = `
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Total de Clientes</p>
            <p class="text-2xl font-bold text-gray-800">${analysis.totalClients}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Receita Total</p>
            <p class="text-2xl font-bold text-green-600">${formatCurrency(analysis.totalRevenue)}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Pedidos</p>
            <p class="text-2xl font-bold text-indigo-600">${analysis.totalOrders}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
            <p class="text-sm text-gray-500">Risco de Churn</p>
            <p class="text-2xl font-bold text-red-600">${analysis.churnRisk.count}</p>
            <p class="text-xs text-gray-400">Clientes frios com alto LTV</p>
        </div>
    `;
    
    // Lista de VIPs
    const vipList = document.getElementById('vip-list');
    if (analysis.vips.count > 0) {
        vipList.innerHTML = analysis.vips.clients.slice(0, 10).map(c => `
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-medium text-gray-800">${escapeHtml(c.name)}</p>
                    <p class="text-xs text-gray-500">${c.orderCount} pedidos • ${formatCurrency(c.totalSpent)}</p>
                </div>
                <div class="flex gap-2">
                    <span class="text-sm">${c.vipStatus.emoji}</span>
                    <button onclick="openWhatsAppModal('${c.id}')" class="text-green-600 hover:text-green-800">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } else {
        vipList.innerHTML = '<p class="text-sm text-gray-500">Nenhum cliente VIP encontrado</p>';
    }
    
    // Distribuição por estado
    const stateContainer = document.getElementById('state-distribution');
    const sortedStates = Object.entries(analysis.byState)
        .filter(([uf]) => uf !== 'N/A')
        .sort((a, b) => b[1].length - a[1].length);
    
    if (sortedStates.length > 0) {
        stateContainer.innerHTML = sortedStates.map(([uf, clients]) => `
            <div class="bg-gray-50 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-100 transition-colors"
                 onclick="showSegmentClients('state', '${uf}')">
                <p class="text-lg font-bold text-indigo-600">${clients.length}</p>
                <p class="text-xs text-gray-500">${uf}</p>
            </div>
        `).join('');
    } else {
        stateContainer.innerHTML = '<p class="text-sm text-gray-500 col-span-3">Sem dados de localização</p>';
    }
}

function showSegmentClients(type, value) {
    const analysis = generateSegmentAnalysis();
    let clients = [];
    let title = '';
    
    switch(type) {
        case 'quente':
            clients = analysis.byTemperature.quente.clients;
            title = 'Clientes Quentes';
            break;
        case 'morno':
            clients = analysis.byTemperature.morno.clients;
            title = '🌡️ Clientes Mornos';
            break;
        case 'frio':
            clients = analysis.byTemperature.frio.clients;
            title = '❄️ Clientes Frios (Risco de Churn)';
            break;
        case 'state':
            clients = analysis.byState[value] || [];
            title = `📍 Clientes de ${value}`;
            break;
        case 'vip':
            clients = analysis.vips.clients;
            title = '⭐ Clientes VIP';
            break;
        case 'churn':
            clients = analysis.churnRisk.clients;
            title = '⚠️ Alto Risco de Churn';
            break;
    }
    
    selectedSegment = { type, value, title };
    selectedClients = clients;
    
    const container = document.getElementById('segment-clients');
    const titleEl = document.getElementById('segment-title');
    const listEl = document.getElementById('segment-client-list');
    
    titleEl.textContent = `${title} (${clients.length} clientes)`;
    
    listEl.innerHTML = clients.map(c => {
        const temp = c.temperature || getClientTemperature(c);
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-800">${escapeHtml(c.name)}</span>
                        <span class="text-sm">${temp.emoji}</span>
                        ${c.vipStatus?.emoji ? `<span class="text-sm">${c.vipStatus.emoji}</span>` : ''}
                    </div>
                    <p class="text-xs text-gray-500">
                        ${c.phone || 'Sem telefone'} • ${c.orderCount} pedidos • ${formatCurrency(c.totalSpent)}
                        ${temp.days ? ` • ${temp.days} dias` : ''}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button onclick="openWhatsAppModal('${c.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                        <i class="fab fa-whatsapp mr-1"></i> Mensagem
                    </button>
                    <button onclick="viewClientDetails('${c.id}')" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700">
                        <i class="fas fa-eye mr-1"></i> Ver
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    container.classList.remove('hidden');
}

// ============================================================================
// MÓDULO DE WHATSAPP
// ============================================================================

let currentWhatsAppClient = null;

function openWhatsAppModal(clientId) {
    const clients = Storage.getClients();
    const client = clients.find(c => c.id === clientId);
    
    if (!client) {
        showToast('Cliente não encontrado', 'error');
        return;
    }
    
    currentWhatsAppClient = client;
    
    document.getElementById('whatsapp-client-name').textContent = client.name;
    document.getElementById('whatsapp-client-phone').textContent = client.phone || 'Sem telefone cadastrado';
    document.getElementById('whatsapp-message').value = '';
    
    openModal('whatsapp-modal');
}

async function generateAIMessage() {
    if (!currentWhatsAppClient) return;
    
    const messageInput = document.getElementById('whatsapp-message');
    const settings = Storage.getSettings();
    
    if (!settings.groqApiKey) {
        showToast('Configure sua API Key do Groq nas Configurações', 'error');
        return;
    }
    
    messageInput.value = 'Gerando mensagem com IA...';
    messageInput.disabled = true;
    
    try {
        const message = await AIAssistant.generatePersonalizedMessage(currentWhatsAppClient);
        messageInput.value = message;
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
        messageInput.value = '';
    } finally {
        messageInput.disabled = false;
    }
}

function generateBasicMessage() {
    if (!currentWhatsAppClient) return;
    
    const message = AIAssistant.generateBasicMessage(currentWhatsAppClient);
    document.getElementById('whatsapp-message').value = message;
}

function sendWhatsApp() {
    if (!currentWhatsAppClient) return;
    
    const phone = (currentWhatsAppClient.phone || '').replace(/\D/g, '');
    const message = document.getElementById('whatsapp-message').value;
    
    if (!phone) {
        showToast('Cliente não possui telefone cadastrado', 'error');
        return;
    }
    
    if (!message) {
        showToast('Digite uma mensagem', 'error');
        return;
    }
    
    // Formatar número para WhatsApp (adicionar 55 se necessário)
    let formattedPhone = phone;
    if (phone.length === 10 || phone.length === 11) {
        formattedPhone = '55' + phone;
    }
    
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    closeModal('whatsapp-modal');
    showToast('Abrindo WhatsApp...', 'success');
}

// ============================================================================
// ESTRATÉGIAS COM IA
// ============================================================================

async function generateReactivationStrategy() {
    const settings = Storage.getSettings();
    
    if (!settings.groqApiKey) {
        showToast('Configure sua API Key do Groq nas Configurações', 'error');
        return;
    }
    
    if (!selectedClients || selectedClients.length === 0) {
        showToast('Selecione um segmento primeiro (clique em Quentes, Mornos ou Frios)', 'error');
        return;
    }
    
    const responseDiv = document.getElementById('ai-response');
    responseDiv.classList.remove('hidden');
    responseDiv.innerHTML = '<p class="text-white"><i class="fas fa-spinner fa-spin mr-2"></i> Analisando dados e gerando estratégia...</p>';
    
    // Preparar dados anonimizados do segmento
    const segmentData = {
        segmento: selectedSegment?.title || 'Clientes selecionados',
        totalClientes: selectedClients.length,
        estatisticas: {
            receitaTotal: selectedClients.reduce((sum, c) => sum + c.totalSpent, 0),
            mediaPedidos: selectedClients.reduce((sum, c) => sum + c.orderCount, 0) / selectedClients.length,
            ticketMedio: selectedClients.reduce((sum, c) => sum + (c.totalSpent / (c.orderCount || 1)), 0) / selectedClients.length
        },
        estados: [...new Set(selectedClients.map(c => c.state?.uf).filter(Boolean))],
        produtosMaisComprados: getTopProductsFromClients(selectedClients).slice(0, 5)
    };
    
    try {
        const result = await AIAssistant.generateStrategy(segmentData);
        
        responseDiv.innerHTML = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold text-white mb-2">📊 Análise</h4>
                    <p class="text-white/90">${escapeHtml(result.analise)}</p>
                </div>
                <div>
                    <h4 class="font-semibold text-white mb-2">🎯 Estratégia Recomendada</h4>
                    <p class="text-white/90">${escapeHtml(result.estrategia)}</p>
                </div>
                ${result.copies && result.copies.length > 0 ? `
                    <div>
                        <h4 class="font-semibold text-white mb-2">📝 Sugestões de Copy</h4>
                        <div class="space-y-2">
                            ${result.copies.map((copy, i) => `
                                <div class="bg-white/10 rounded p-3">
                                    <p class="font-medium text-white text-sm">${i + 1}. ${escapeHtml(copy.titulo)}</p>
                                    <p class="text-white/80 text-sm mt-1">${escapeHtml(copy.mensagem)}</p>
                                    <button onclick="copyToClipboard('${escapeHtml(copy.mensagem).replace(/'/g, "\\'")}')" class="text-xs text-indigo-200 hover:text-white mt-2">
                                        <i class="fas fa-copy mr-1"></i> Copiar
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    } catch (error) {
        responseDiv.innerHTML = `<p class="text-red-200"><i class="fas fa-exclamation-circle mr-2"></i> Erro: ${escapeHtml(error.message)}</p>`;
    }
}

function getTopProductsFromClients(clients) {
    const productMap = {};
    clients.forEach(c => {
        (c.products || []).forEach(p => {
            if (!productMap[p.name]) {
                productMap[p.name] = { name: p.name, quantity: 0 };
            }
            productMap[p.name].quantity += p.quantity;
        });
    });
    return Object.values(productMap).sort((a, b) => b.quantity - a.quantity);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Texto copiado!', 'success');
    }).catch(() => {
        showToast('Erro ao copiar', 'error');
    });
}

// ============================================================================
// IA SUGERE PARÂMETROS DE CLASSIFICAÇÃO
// ============================================================================

async function aiSuggestParameters() {
    const settings = Storage.getSettings();
    
    if (!settings.groqApiKey) {
        showToast('Configure sua API Key do Groq nas Configurações', 'error');
        return;
    }
    
    const responseDiv = document.getElementById('ai-response');
    responseDiv.classList.remove('hidden');
    responseDiv.innerHTML = '<p class="text-white"><i class="fas fa-spinner fa-spin mr-2"></i> Analisando sua base de dados... A IA está calculando os parâmetros ideais...</p>';
    
    try {
        const result = await AIAssistant.suggestClassificationParams();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        responseDiv.innerHTML = `
            <div class="space-y-6">
                <!-- Termômetro -->
                <div class="bg-white/20 rounded-lg p-4">
                    <h4 class="font-bold text-white text-lg mb-3">🌡️ Termômetro de Clientes - Parâmetros Sugeridos</h4>
                    <div class="grid grid-cols-3 gap-4 mb-3">
                        <div class="text-center">
                            <span class="text-3xl text-red-500"><i class="fas fa-fire-alt"></i></span>
                            <p class="font-bold text-xl text-yellow-300">${result.termometro?.quente_ate_dias || 30} dias</p>
                            <p class="text-sm text-white/80">QUENTE</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">🌡️</span>
                            <p class="font-bold text-xl text-yellow-300">${result.termometro?.morno_ate_dias || 90} dias</p>
                            <p class="text-sm text-white/80">MORNO</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">❄️</span>
                            <p class="font-bold text-xl text-yellow-300">+${result.termometro?.morno_ate_dias || 90} dias</p>
                            <p class="text-sm text-white/80">FRIO</p>
                        </div>
                    </div>
                    <p class="text-sm text-white/90 italic">${escapeHtml(result.termometro?.justificativa || '')}</p>
                </div>
                
                <!-- VIP -->
                <div class="bg-white/20 rounded-lg p-4">
                    <h4 class="font-bold text-white text-lg mb-3">⭐ Classificação VIP - Parâmetros Sugeridos</h4>
                    <div class="grid grid-cols-3 gap-4 mb-3">
                        <div class="text-center">
                            <span class="text-3xl">⭐</span>
                            <p class="font-bold text-xl text-yellow-300">${formatCurrency(result.vip?.vip_valor_minimo || 500)}</p>
                            <p class="text-sm text-white/80">VIP</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">💎</span>
                            <p class="font-bold text-xl text-yellow-300">${formatCurrency(result.vip?.super_vip_valor_minimo || 1500)}</p>
                            <p class="text-sm text-white/80">SUPER VIP</p>
                        </div>
                        <div class="text-center">
                            <span class="text-3xl">🏆</span>
                            <p class="font-bold text-xl text-yellow-300">${result.vip?.fiel_pedidos_minimo || 5} pedidos</p>
                            <p class="text-sm text-white/80">CLIENTE FIEL</p>
                        </div>
                    </div>
                    <p class="text-sm text-white/90 italic">${escapeHtml(result.vip?.justificativa || '')}</p>
                </div>
                
                <!-- Análise -->
                <div class="bg-white/20 rounded-lg p-4">
                    <h4 class="font-bold text-white text-lg mb-3">📊 Análise da IA</h4>
                    <div class="space-y-3">
                        <div>
                            <p class="text-sm text-white/70 uppercase">Observações:</p>
                            <p class="text-white">${escapeHtml(result.analise?.observacoes || '')}</p>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-red-500/30 rounded p-3">
                                <p class="text-sm text-white/70 uppercase">⚠️ Maior Risco:</p>
                                <p class="text-white text-sm">${escapeHtml(result.analise?.maior_risco || '')}</p>
                            </div>
                            <div class="bg-green-500/30 rounded p-3">
                                <p class="text-sm text-white/70 uppercase">💡 Maior Oportunidade:</p>
                                <p class="text-white text-sm">${escapeHtml(result.analise?.maior_oportunidade || '')}</p>
                            </div>
                        </div>
                        <div class="bg-yellow-500/30 rounded p-3">
                            <p class="text-sm text-white/70 uppercase">🎯 Ação Prioritária Recomendada:</p>
                            <p class="text-white font-medium">${escapeHtml(result.analise?.acao_prioritaria || '')}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Botão Aplicar -->
                <div class="flex justify-center gap-4">
                    <button onclick="applyAISuggestedParams(${result.termometro?.quente_ate_dias || 30}, ${result.termometro?.morno_ate_dias || 90}, ${result.vip?.vip_valor_minimo || 500}, ${result.vip?.fiel_pedidos_minimo || 5})" 
                            class="bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-bold hover:bg-yellow-300 transition-colors">
                        <i class="fas fa-check mr-2"></i> Aplicar Esses Parâmetros
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        responseDiv.innerHTML = `<p class="text-red-200"><i class="fas fa-exclamation-circle mr-2"></i> Erro: ${escapeHtml(error.message)}</p>`;
    }
}

// Variáveis globais para parâmetros customizáveis
let classificationParams = {
    hotDays: 30,
    warmDays: 90,
    vipMinValue: 500,
    loyalMinOrders: 5
};

function applyAISuggestedParams(hotDays, warmDays, vipMinValue, loyalMinOrders) {
    classificationParams = { hotDays, warmDays, vipMinValue, loyalMinOrders };
    
    // Salvar nas configurações
    const settings = Storage.getSettings();
    settings.classificationParams = classificationParams;
    Storage.saveSettings(settings);
    
    showToast('Parâmetros aplicados com sucesso! Atualizando dashboard...', 'success');
    
    // Recarregar dashboard
    renderGrowthDashboard();
}

// Carregar parâmetros salvos
function loadClassificationParams() {
    const settings = Storage.getSettings();
    if (settings.classificationParams) {
        classificationParams = settings.classificationParams;
    }
}

function setupGrowthEvents() {
    // Cliques nos cards de temperatura
    document.getElementById('temp-quente')?.addEventListener('click', () => showSegmentClients('quente'));
    document.getElementById('temp-morno')?.addEventListener('click', () => showSegmentClients('morno'));
    document.getElementById('temp-frio')?.addEventListener('click', () => showSegmentClients('frio'));
    
    // Botão atualizar análise
    document.getElementById('refresh-analysis-btn')?.addEventListener('click', renderGrowthDashboard);
    
    // Botões de IA
    document.getElementById('ai-suggest-params-btn')?.addEventListener('click', aiSuggestParameters);
    document.getElementById('ai-reactivation-btn')?.addEventListener('click', generateReactivationStrategy);
    document.getElementById('ai-vip-btn')?.addEventListener('click', () => {
        showSegmentClients('vip');
        generateReactivationStrategy();
    });
    
    // Modal WhatsApp
    document.getElementById('close-whatsapp-modal')?.addEventListener('click', () => closeModal('whatsapp-modal'));
    document.getElementById('cancel-whatsapp-btn')?.addEventListener('click', () => closeModal('whatsapp-modal'));
    document.getElementById('generate-ai-message')?.addEventListener('click', generateAIMessage);
    document.getElementById('generate-basic-message')?.addEventListener('click', generateBasicMessage);
    document.getElementById('send-whatsapp-btn')?.addEventListener('click', sendWhatsApp);
}

// ============================================================================
// RENDERIZAÇÃO GERAL
// ============================================================================

function renderAll() {
    renderClients();
    renderProducts();
    renderOrders();
    renderGrowthDashboard();
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

function setupEventListeners() {
    // Sincronização
    syncButton?.addEventListener('click', (e) => {
        e.preventDefault();
        syncData();
    });

    // Formulários
    clientForm?.addEventListener('submit', saveClient);
    settingsForm?.addEventListener('submit', saveSettings);

    // Confirmar exclusão
    document.getElementById('confirm-delete-button')?.addEventListener('click', deleteClient);

    // Filtros de clientes
    searchInput?.addEventListener('input', renderClients);
    filterStatusSelect?.addEventListener('change', renderClients);
    filterTagSelect?.addEventListener('change', renderClients);
    sortClientsSelect?.addEventListener('change', renderClients);

    // Filtros de produtos
    productSearchInput?.addEventListener('input', renderProducts);
    filterStockSelect?.addEventListener('change', renderProducts);
    filterActiveSelect?.addEventListener('change', renderProducts);

    // Filtros de pedidos
    orderSearchInput?.addEventListener('input', renderOrders);
    
    // Setup Growth Dashboard
    setupGrowthEvents();
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    console.log('CRM FacilZap - Inicializando...');
    
    initDOMReferences();
    setupNavigation();
    setupModals();
    setupEventListeners();
    
    // Carregar parâmetros de classificação salvos
    loadClassificationParams();
    
    // Carregar API Key nas configurações
    const settings = Storage.getSettings();
    const groqKeyInput = document.getElementById('groq-api-key');
    if (groqKeyInput && settings.groqApiKey) {
        groqKeyInput.value = settings.groqApiKey;
    }
    
    // Verificar última sincronização
    const lastSync = Storage.getLastSync();
    if (lastSync) {
        console.log('Última sincronização:', new Date(lastSync).toLocaleString('pt-BR'));
    }
    
    // Renderizar dados existentes
    renderAll();
    
    // Inicializar importador de legado
    initLegacyImporter();
    
    // Inicializar página de Webhooks
    initWebhooksPage();
    
    // Inicializar novos módulos de vendas
    initDashboard();
    initCampaigns();
    initCoupons();
    
    console.log('CRM FacilZap - Gerador de Vendas Pronto!');
});

// ============================================================================
// IMPORTADOR DE DADOS LEGADOS (CSV/XLSX)
// ============================================================================

const LegacyImporter = {
    currentStep: 1,
    fileData: null,
    fileColumns: [],
    mapping: {},
    importType: 'clientes',
    
    // Campos do sistema para cada tipo de importação
    systemFields: {
        clientes: [
            { key: 'nome', label: 'Nome', required: true },
            { key: 'email', label: 'E-mail', required: false },
            { key: 'telefone', label: 'Telefone/WhatsApp', required: false },
            { key: 'cpf', label: 'CPF', required: false },
            { key: 'cidade', label: 'Cidade', required: false },
            { key: 'estado', label: 'Estado/UF', required: false },
            { key: 'bairro', label: 'Bairro', required: false },
            { key: 'endereco', label: 'Endereço', required: false },
            { key: 'data_cadastro', label: 'Data de Cadastro', required: false }
        ],
        pedidos: [
            { key: 'cliente_nome', label: 'Nome do Cliente', required: true },
            { key: 'cliente_telefone', label: 'Telefone do Cliente', required: false },
            { key: 'cliente_email', label: 'E-mail do Cliente', required: false },
            { key: 'data_pedido', label: 'Data do Pedido', required: true },
            { key: 'valor_total', label: 'Valor Total', required: true },
            { key: 'status', label: 'Status', required: false },
            { key: 'produtos', label: 'Produtos (lista)', required: false },
            { key: 'forma_pagamento', label: 'Forma de Pagamento', required: false }
        ],
        produtos: [
            { key: 'nome', label: 'Nome do Produto', required: true },
            { key: 'preco', label: 'Preço', required: false },
            { key: 'sku', label: 'SKU/Código', required: false },
            { key: 'categoria', label: 'Categoria', required: false },
            { key: 'estoque', label: 'Estoque', required: false }
        ]
    },
    
    // Normalizar telefone para comparação
    normalizePhone(phone) {
        if (!phone) return '';
        return String(phone).replace(/\D/g, '').slice(-11);
    },
    
    // Normalizar email para comparação
    normalizeEmail(email) {
        if (!email) return '';
        return String(email).toLowerCase().trim();
    },
    
    // Parsear data em vários formatos
    parseDate(dateStr) {
        if (!dateStr) return null;
        
        // Tentar vários formatos
        const formats = [
            /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
            /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
            /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
            /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/ // D/M/YY ou DD/MM/YYYY
        ];
        
        const str = String(dateStr).trim();
        
        // Formato DD/MM/YYYY
        let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (match) {
            let year = parseInt(match[3]);
            if (year < 100) year += 2000;
            return new Date(year, parseInt(match[2]) - 1, parseInt(match[1])).toISOString();
        }
        
        // Formato YYYY-MM-DD
        match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return new Date(match[0]).toISOString();
        }
        
        // Tentar parse direto
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
        
        return null;
    },
    
    // Parsear valor monetário
    parseValue(val) {
        if (!val) return 0;
        const str = String(val).replace(/[R$\s]/g, '').replace(',', '.');
        return parseFloat(str) || 0;
    },
    
    // Encontrar cliente existente por chave única
    findExistingClient(newClient) {
        const clients = Storage.getClients();
        
        // Prioridade: Email > Telefone > CPF > Nome exato
        for (const existing of clients) {
            // Por email
            if (newClient.email && existing.email) {
                if (this.normalizeEmail(newClient.email) === this.normalizeEmail(existing.email)) {
                    return existing;
                }
            }
            
            // Por telefone
            if (newClient.telefone && existing.phone) {
                if (this.normalizePhone(newClient.telefone) === this.normalizePhone(existing.phone)) {
                    return existing;
                }
            }
            
            // Por CPF
            if (newClient.cpf && existing.cpf) {
                const cpf1 = String(newClient.cpf).replace(/\D/g, '');
                const cpf2 = String(existing.cpf).replace(/\D/g, '');
                if (cpf1 === cpf2 && cpf1.length >= 11) {
                    return existing;
                }
            }
            
            // Por nome exato (último recurso)
            if (newClient.nome && existing.name) {
                if (newClient.nome.toLowerCase().trim() === existing.name.toLowerCase().trim()) {
                    return existing;
                }
            }
        }
        
        return null;
    },
    
    // Processar arquivo CSV
    parseCSV(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: (results) => {
                    resolve({
                        data: results.data,
                        columns: results.meta.fields || []
                    });
                },
                error: (error) => reject(error)
            });
        });
    },
    
    // Processar arquivo XLSX/XLS
    parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
                    
                    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
                    resolve({ data: jsonData, columns });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },
    
    // Importar clientes
    importClients(data, mapping) {
        const clients = Storage.getClients();
        const results = { new: 0, merged: 0, skipped: 0, warnings: [] };
        
        for (const row of data) {
            const newClient = {};
            
            // Mapear campos
            for (const [systemField, fileColumn] of Object.entries(mapping)) {
                if (fileColumn && row[fileColumn] !== undefined) {
                    newClient[systemField] = row[fileColumn];
                }
            }
            
            // Validar campos obrigatórios
            if (!newClient.nome) {
                results.skipped++;
                continue;
            }
            
            // Verificar se já existe
            const existing = this.findExistingClient(newClient);
            
            if (existing) {
                // Mesclar dados (adicionar campos que estão vazios)
                let updated = false;
                
                if (!existing.email && newClient.email) {
                    existing.email = newClient.email;
                    updated = true;
                }
                if (!existing.phone && newClient.telefone) {
                    existing.phone = newClient.telefone;
                    updated = true;
                }
                if (!existing.city && newClient.cidade) {
                    existing.city = newClient.cidade;
                    updated = true;
                }
                if (!existing.state && newClient.estado) {
                    existing.state = newClient.estado;
                    updated = true;
                }
                if (!existing.cpf && newClient.cpf) {
                    existing.cpf = newClient.cpf;
                    updated = true;
                }
                
                // Marcar origem do merge
                if (!existing.sources) existing.sources = ['api'];
                if (!existing.sources.includes('legado')) {
                    existing.sources.push('legado');
                }
                
                if (updated) {
                    results.merged++;
                } else {
                    results.skipped++;
                }
            } else {
                // Criar novo cliente
                const clientId = 'legado_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                clients.push({
                    id: clientId,
                    name: newClient.nome,
                    email: newClient.email || '',
                    phone: newClient.telefone || '',
                    city: newClient.cidade || '',
                    state: newClient.estado || '',
                    neighborhood: newClient.bairro || '',
                    address: newClient.endereco || '',
                    cpf: newClient.cpf || '',
                    createdAt: this.parseDate(newClient.data_cadastro) || new Date().toISOString(),
                    sources: ['legado'],
                    orderCount: 0,
                    totalSpent: 0,
                    lastPurchaseDate: null,
                    products: []
                });
                
                results.new++;
            }
        }
        
        Storage.saveClients(clients);
        return results;
    },
    
    // Importar pedidos
    importOrders(data, mapping) {
        const orders = Storage.getOrders();
        const clients = Storage.getClients();
        const results = { new: 0, merged: 0, skipped: 0, warnings: [] };
        
        for (const row of data) {
            const orderData = {};
            
            // Mapear campos
            for (const [systemField, fileColumn] of Object.entries(mapping)) {
                if (fileColumn && row[fileColumn] !== undefined) {
                    orderData[systemField] = row[fileColumn];
                }
            }
            
            // Validar campos obrigatórios
            if (!orderData.data_pedido || !orderData.valor_total) {
                results.skipped++;
                continue;
            }
            
            // Tentar vincular a um cliente
            let clientId = null;
            let clientName = orderData.cliente_nome || 'Cliente Desconhecido';
            
            if (orderData.cliente_nome || orderData.cliente_telefone || orderData.cliente_email) {
                const matchClient = this.findExistingClient({
                    nome: orderData.cliente_nome,
                    telefone: orderData.cliente_telefone,
                    email: orderData.cliente_email
                });
                
                if (matchClient) {
                    clientId = matchClient.id;
                    clientName = matchClient.name;
                    
                    // Atualizar estatísticas do cliente
                    const orderDate = this.parseDate(orderData.data_pedido);
                    const orderValue = this.parseValue(orderData.valor_total);
                    
                    matchClient.orderCount = (matchClient.orderCount || 0) + 1;
                    matchClient.totalSpent = (matchClient.totalSpent || 0) + orderValue;
                    
                    if (orderDate && (!matchClient.lastPurchaseDate || orderDate > matchClient.lastPurchaseDate)) {
                        matchClient.lastPurchaseDate = orderDate;
                    }
                } else {
                    results.warnings.push(`Pedido sem cliente vinculado: ${orderData.cliente_nome || 'sem nome'}`);
                }
            }
            
            // Criar pedido
            const orderId = 'legado_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            orders.push({
                id: orderId,
                cliente_id: clientId,
                cliente: { id: clientId, nome: clientName },
                data: this.parseDate(orderData.data_pedido) || new Date().toISOString(),
                total: this.parseValue(orderData.valor_total),
                status: orderData.status || 'concluido',
                forma_pagamento: orderData.forma_pagamento || '',
                itens: orderData.produtos ? [{ nome: orderData.produtos }] : [],
                source: 'legado'
            });
            
            results.new++;
        }
        
        Storage.saveOrders(orders);
        Storage.saveClients(clients);
        return results;
    },
    
    // Importar produtos
    importProducts(data, mapping) {
        const products = Storage.getProducts();
        const results = { new: 0, merged: 0, skipped: 0, warnings: [] };
        
        for (const row of data) {
            const prodData = {};
            
            // Mapear campos
            for (const [systemField, fileColumn] of Object.entries(mapping)) {
                if (fileColumn && row[fileColumn] !== undefined) {
                    prodData[systemField] = row[fileColumn];
                }
            }
            
            // Validar campos obrigatórios
            if (!prodData.nome) {
                results.skipped++;
                continue;
            }
            
            // Verificar se já existe (por nome ou SKU)
            const existing = products.find(p => 
                p.name?.toLowerCase() === prodData.nome.toLowerCase() ||
                (prodData.sku && p.sku === prodData.sku)
            );
            
            if (existing) {
                results.skipped++;
                continue;
            }
            
            // Criar produto
            products.push({
                id: 'legado_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: prodData.nome,
                sku: prodData.sku || '',
                price: this.parseValue(prodData.preco),
                categoria: prodData.categoria || '',
                stock: parseInt(prodData.estoque) || 0,
                isActive: true,
                source: 'legado'
            });
            
            results.new++;
        }
        
        Storage.saveProducts(products);
        return results;
    },
    
    // Executar importação
    runImport() {
        const type = this.importType;
        const data = this.fileData;
        const mapping = this.mapping;
        
        switch (type) {
            case 'clientes':
                return this.importClients(data, mapping);
            case 'pedidos':
                return this.importOrders(data, mapping);
            case 'produtos':
                return this.importProducts(data, mapping);
            default:
                return { new: 0, merged: 0, skipped: 0, warnings: ['Tipo de importação inválido'] };
        }
    }
};

// Inicializar interface do importador
function initLegacyImporter() {
    const importBtn = document.getElementById('import-legacy-button');
    const importModal = document.getElementById('import-modal');
    const closeBtn = document.getElementById('close-import-modal');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const nextBtn = document.getElementById('import-next-btn');
    const backBtn = document.getElementById('import-back-btn');
    const finishBtn = document.getElementById('import-finish-btn');
    
    if (!importBtn || !importModal) return;
    
    // Abrir modal
    importBtn.addEventListener('click', (e) => {
        e.preventDefault();
        importModal.classList.remove('hidden');
        resetImporter();
    });
    
    // Fechar modal
    closeBtn.addEventListener('click', () => {
        importModal.classList.add('hidden');
    });
    
    // Tipo de importação
    document.querySelectorAll('input[name="import-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            LegacyImporter.importType = e.target.value;
        });
    });
    
    // Dropzone click
    dropzone.addEventListener('click', () => fileInput.click());
    
    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-indigo-500', 'bg-indigo-50');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-indigo-500', 'bg-indigo-50');
    });
    
    dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-indigo-500', 'bg-indigo-50');
        const file = e.dataTransfer.files[0];
        if (file) await processFile(file);
    });
    
    // File input change
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await processFile(file);
    });
    
    // Remover arquivo
    document.getElementById('remove-file')?.addEventListener('click', () => {
        resetImporter();
    });
    
    // Botões de navegação
    nextBtn.addEventListener('click', () => goToStep(LegacyImporter.currentStep + 1));
    backBtn.addEventListener('click', () => goToStep(LegacyImporter.currentStep - 1));
    finishBtn.addEventListener('click', () => {
        importModal.classList.add('hidden');
        renderAll();
        showToast('Importação concluída com sucesso!', 'success');
    });
    
    async function processFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (!['csv', 'xlsx', 'xls'].includes(ext)) {
            showToast('Formato não suportado. Use CSV ou XLSX.', 'error');
            return;
        }
        
        try {
            showToast('Processando arquivo...', 'info');
            
            let result;
            if (ext === 'csv') {
                result = await LegacyImporter.parseCSV(file);
            } else {
                result = await LegacyImporter.parseExcel(file);
            }
            
            LegacyImporter.fileData = result.data;
            LegacyImporter.fileColumns = result.columns;
            
            // Atualizar UI
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-rows').textContent = `${result.data.length} linhas encontradas`;
            
            nextBtn.disabled = false;
            showToast(`Arquivo carregado: ${result.data.length} linhas`, 'success');
            
        } catch (err) {
            console.error('Erro ao processar arquivo:', err);
            showToast('Erro ao ler o arquivo: ' + err.message, 'error');
        }
    }
    
    function resetImporter() {
        LegacyImporter.currentStep = 1;
        LegacyImporter.fileData = null;
        LegacyImporter.fileColumns = [];
        LegacyImporter.mapping = {};
        
        document.getElementById('file-info').classList.add('hidden');
        document.getElementById('file-input').value = '';
        nextBtn.disabled = true;
        
        goToStep(1);
    }
    
    function goToStep(step) {
        LegacyImporter.currentStep = step;
        
        // Esconder todas as steps
        document.getElementById('import-step-1').classList.add('hidden');
        document.getElementById('import-step-2').classList.add('hidden');
        document.getElementById('import-step-3').classList.add('hidden');
        
        // Mostrar step atual
        document.getElementById(`import-step-${step}`).classList.remove('hidden');
        
        // Atualizar indicadores
        for (let i = 1; i <= 3; i++) {
            const indicator = document.getElementById(`step${i}-indicator`);
            const circle = indicator.querySelector('span:first-child');
            const label = indicator.querySelector('span:last-child');
            
            if (i < step) {
                indicator.classList.remove('opacity-50');
                circle.className = 'w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-medium';
                circle.innerHTML = '<i class="fas fa-check"></i>';
                label.className = 'ml-2 text-sm font-medium text-green-600';
            } else if (i === step) {
                indicator.classList.remove('opacity-50');
                circle.className = 'w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-medium';
                circle.textContent = i;
                label.className = 'ml-2 text-sm font-medium text-indigo-600';
            } else {
                indicator.classList.add('opacity-50');
                circle.className = 'w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-medium';
                circle.textContent = i;
                label.className = 'ml-2 text-sm font-medium text-gray-500';
            }
        }
        
        // Atualizar botões
        backBtn.classList.toggle('hidden', step === 1);
        nextBtn.classList.toggle('hidden', step === 3);
        finishBtn.classList.toggle('hidden', step !== 3);
        
        // Ações específicas por step
        if (step === 2) {
            renderMappingInterface();
        } else if (step === 3) {
            runImportProcess();
        }
    }
    
    function renderMappingInterface() {
        const container = document.getElementById('mapping-container');
        const fields = LegacyImporter.systemFields[LegacyImporter.importType];
        const columns = LegacyImporter.fileColumns;
        
        container.innerHTML = fields.map(field => `
            <div class="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                <div class="w-1/3">
                    <label class="font-medium text-gray-700">
                        ${field.label}
                        ${field.required ? '<span class="text-red-500">*</span>' : ''}
                    </label>
                </div>
                <div class="w-8 text-center text-gray-400">
                    <i class="fas fa-arrow-right"></i>
                </div>
                <div class="flex-1">
                    <select class="mapping-select w-full border border-gray-300 rounded-md px-3 py-2" data-field="${field.key}">
                        <option value="">-- Selecione a coluna --</option>
                        ${columns.map(col => `
                            <option value="${col}" ${autoMatchColumn(field.key, col) ? 'selected' : ''}>${col}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `).join('');
        
        // Eventos de seleção
        container.querySelectorAll('.mapping-select').forEach(select => {
            select.addEventListener('change', (e) => {
                LegacyImporter.mapping[e.target.dataset.field] = e.target.value;
                validateMapping();
            });
            
            // Inicializar mapeamento automático
            if (select.value) {
                LegacyImporter.mapping[select.dataset.field] = select.value;
            }
        });
        
        // Prévia dos dados
        renderDataPreview();
        validateMapping();
    }
    
    function autoMatchColumn(fieldKey, colName) {
        const col = colName.toLowerCase();
        const matchRules = {
            nome: ['nome', 'name', 'cliente', 'razao', 'razão'],
            email: ['email', 'e-mail', 'mail'],
            telefone: ['telefone', 'phone', 'celular', 'whatsapp', 'zap', 'fone', 'tel'],
            cpf: ['cpf', 'documento', 'doc'],
            cidade: ['cidade', 'city', 'municipio'],
            estado: ['estado', 'uf', 'state'],
            bairro: ['bairro', 'neighborhood'],
            endereco: ['endereco', 'endereço', 'address', 'rua', 'logradouro'],
            data_cadastro: ['data', 'cadastro', 'criado', 'created'],
            cliente_nome: ['cliente', 'nome', 'comprador'],
            cliente_telefone: ['telefone', 'phone', 'celular', 'whatsapp'],
            cliente_email: ['email', 'e-mail'],
            data_pedido: ['data', 'date', 'pedido', 'venda'],
            valor_total: ['valor', 'total', 'preco', 'preço', 'price', 'amount'],
            status: ['status', 'situacao', 'situação'],
            produtos: ['produtos', 'itens', 'items', 'produto'],
            forma_pagamento: ['pagamento', 'payment', 'forma'],
            preco: ['preco', 'preço', 'valor', 'price'],
            sku: ['sku', 'codigo', 'código', 'code', 'ref'],
            categoria: ['categoria', 'category', 'tipo'],
            estoque: ['estoque', 'stock', 'quantidade', 'qtd']
        };
        
        const rules = matchRules[fieldKey] || [];
        return rules.some(r => col.includes(r));
    }
    
    function renderDataPreview() {
        const data = LegacyImporter.fileData.slice(0, 3);
        const columns = LegacyImporter.fileColumns;
        
        const header = document.getElementById('preview-header');
        const body = document.getElementById('preview-body');
        
        header.innerHTML = `<tr>${columns.map(c => `<th class="px-2 py-1 bg-gray-200 font-medium">${c}</th>`).join('')}</tr>`;
        body.innerHTML = data.map(row => `
            <tr>${columns.map(c => `<td class="px-2 py-1 border-t">${row[c] || ''}</td>`).join('')}</tr>
        `).join('');
    }
    
    function validateMapping() {
        const fields = LegacyImporter.systemFields[LegacyImporter.importType];
        const requiredFields = fields.filter(f => f.required).map(f => f.key);
        
        const allMapped = requiredFields.every(key => LegacyImporter.mapping[key]);
        nextBtn.disabled = !allMapped;
        
        if (!allMapped) {
            nextBtn.title = 'Mapeie todos os campos obrigatórios';
        } else {
            nextBtn.title = '';
        }
    }
    
    async function runImportProcess() {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        const resultDiv = document.getElementById('import-result');
        const progressDiv = document.getElementById('import-progress');
        
        progressDiv.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        
        // Simular progresso
        for (let i = 0; i <= 100; i += 10) {
            progressBar.style.width = i + '%';
            progressText.textContent = i + '%';
            await new Promise(r => setTimeout(r, 100));
        }
        
        // Executar importação
        const results = LegacyImporter.runImport();
        
        // Mostrar resultados
        progressDiv.classList.add('hidden');
        resultDiv.classList.remove('hidden');
        
        document.getElementById('result-new').textContent = results.new;
        document.getElementById('result-merged').textContent = results.merged;
        document.getElementById('result-skipped').textContent = results.skipped;
        
        if (results.warnings.length > 0) {
            const warningsDiv = document.getElementById('import-warnings');
            const warningsList = document.getElementById('warnings-list');
            warningsDiv.classList.remove('hidden');
            warningsList.innerHTML = results.warnings.slice(0, 10).map(w => `<li>${w}</li>`).join('');
            if (results.warnings.length > 10) {
                warningsList.innerHTML += `<li>... e mais ${results.warnings.length - 10} avisos</li>`;
            }
        }
    }
}

// Função para gerar cupom direto para um cliente
function generateClientCoupon(clientId) {
    const client = Storage.getClients().find(c => String(c.id) === String(clientId));
    if (!client) {
        showToast('Cliente não encontrado', 'error');
        return;
    }
    
    // Gerar código único
    const code = `VIP${client.name.substring(0, 3).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const discount = client.totalSpent > 1000 ? 15 : 10; // VIPs ganham mais desconto
    
    // Criar cupom
    const newCoupon = {
        id: Date.now().toString(),
        code,
        discount,
        type: 'percent',
        minValue: 0,
        maxUses: 1,
        currentUses: 0,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 dias
        isActive: true,
        description: `Cupom exclusivo para ${client.name}`,
        assignedClients: [{ clientId: client.id, name: client.name, assignedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString()
    };
    
    // Salvar
    const coupons = Storage.load('crm_coupons', []);
    coupons.push(newCoupon);
    Storage.save('crm_coupons', coupons);
    
    // Montar mensagem para WhatsApp
    const msg = `Olá ${client.name.split(' ')[0]}! 🎉\n\nPreparei um cupom EXCLUSIVO pra você:\n\n🎟️ Código: *${code}*\n💰 Desconto: *${discount}%*\n📅 Válido por 30 dias\n\nAproveite! 😊`;
    
    if (client.phone) {
        window.open(`https://wa.me/55${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        showToast(`Cupom ${code} criado e WhatsApp aberto!`, 'success');
    } else {
        // Copiar código para clipboard
        navigator.clipboard.writeText(code);
        showToast(`Cupom ${code} criado! (copiado - cliente sem telefone)`, 'success');
    }
}

window.generateClientCoupon = generateClientCoupon;

// Expor funções para uso global (para onclick no HTML)
window.viewOrderDetails = viewOrderDetails;
window.viewClientDetails = viewClientDetails;
window.openWhatsAppModal = openWhatsAppModal;
window.showSegmentClients = showSegmentClients;
window.copyToClipboard = copyToClipboard;
window.applyAISuggestedParams = applyAISuggestedParams;

// ============================================================================
// WEBHOOKS - GERENCIAMENTO DE EVENTOS EM TEMPO REAL
// ============================================================================

const WebhookManager = {
    STORAGE_KEY: 'crm_webhook_events',
    ABANDONED_CARTS_KEY: 'crm_abandoned_carts',
    
    // Obter eventos salvos
    getEvents() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    },
    
    // Salvar evento
    saveEvent(event) {
        const events = this.getEvents();
        events.unshift({
            ...event,
            receivedAt: new Date().toISOString()
        });
        // Manter apenas os últimos 100 eventos
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(events.slice(0, 100)));
        this.updateUI();
    },
    
    // Obter carrinhos abandonados
    getAbandonedCarts() {
        try {
            return JSON.parse(localStorage.getItem(this.ABANDONED_CARTS_KEY) || '[]');
        } catch {
            return [];
        }
    },
    
    // Salvar carrinho abandonado
    saveAbandonedCart(cart) {
        const carts = this.getAbandonedCarts();
        // Verificar se já existe
        const existingIndex = carts.findIndex(c => c.id === cart.id);
        if (existingIndex >= 0) {
            carts[existingIndex] = cart;
        } else {
            carts.unshift(cart);
        }
        // Manter apenas os últimos 50
        localStorage.setItem(this.ABANDONED_CARTS_KEY, JSON.stringify(carts.slice(0, 50)));
        this.updateUI();
    },
    
    // Remover carrinho (quando cliente finaliza compra)
    removeAbandonedCart(cartId) {
        const carts = this.getAbandonedCarts().filter(c => c.id !== cartId);
        localStorage.setItem(this.ABANDONED_CARTS_KEY, JSON.stringify(carts));
        this.updateUI();
    },
    
    // Limpar histórico
    clearEvents() {
        localStorage.setItem(this.STORAGE_KEY, '[]');
        this.updateUI();
        showToast('Histórico de eventos limpo', 'success');
    },
    
    // Atualizar interface
    updateUI() {
        const events = this.getEvents();
        const carts = this.getAbandonedCarts();
        
        // Badge no menu
        const badge = document.getElementById('webhook-badge');
        const cartsCount = carts.length;
        if (badge) {
            if (cartsCount > 0) {
                badge.textContent = cartsCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        
        // KPIs
        const today = new Date().toDateString();
        const eventsToday = events.filter(e => new Date(e.receivedAt).toDateString() === today);
        const newOrdersToday = eventsToday.filter(e => e.evento === 'pedido_criado').length;
        
        const elemEventsToday = document.getElementById('webhook-events-today');
        const elemNewOrders = document.getElementById('webhook-new-orders');
        const elemAbandonedCarts = document.getElementById('webhook-abandoned-carts');
        const elemRecoverableValue = document.getElementById('webhook-recoverable-value');
        
        if (elemEventsToday) elemEventsToday.textContent = eventsToday.length;
        if (elemNewOrders) elemNewOrders.textContent = newOrdersToday;
        if (elemAbandonedCarts) elemAbandonedCarts.textContent = carts.length;
        
        // Valor recuperável
        const recoverableValue = carts.reduce((sum, c) => sum + (c.valor_total || 0), 0);
        if (elemRecoverableValue) {
            elemRecoverableValue.textContent = `R$ ${recoverableValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }
        
        // Contadores
        const cartsCountElem = document.getElementById('abandoned-carts-count');
        const eventsCountElem = document.getElementById('events-count');
        if (cartsCountElem) cartsCountElem.textContent = `${carts.length} carrinhos`;
        if (eventsCountElem) eventsCountElem.textContent = `${events.length} eventos`;
        
        // Lista de carrinhos abandonados
        this.renderAbandonedCarts(carts);
        
        // Lista de eventos
        this.renderEvents(events);
    },
    
    // Renderizar carrinhos abandonados
    renderAbandonedCarts(carts) {
        const container = document.getElementById('abandoned-carts-list');
        if (!container) return;
        
        if (carts.length === 0) {
            container.innerHTML = `
                <div class="p-6 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl text-gray-300 mb-2"></i>
                    <p>Nenhum carrinho abandonado</p>
                    <p class="text-xs mt-1">Configure o webhook no FacilZap para receber alertas</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = carts.map(cart => {
            const timeSince = this.getTimeSince(cart.ultima_atualizacao || cart.iniciado_em);
            const produtos = cart.produtos || [];
            
            return `
                <div class="p-4 hover:bg-gray-50">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-medium text-gray-800">${cart.cliente?.nome || 'Cliente'}</p>
                            <p class="text-sm text-gray-500">${cart.cliente?.whatsapp || 'Sem telefone'}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-orange-600">R$ ${(cart.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p class="text-xs text-gray-400">${timeSince}</p>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 mb-2">
                        ${produtos.slice(0, 2).map(p => `${p.nome}${p.variacao?.nome ? ` (${p.variacao.nome})` : ''}`).join(', ')}
                        ${produtos.length > 2 ? ` +${produtos.length - 2} itens` : ''}
                    </div>
                    <div class="flex gap-2">
                        <button onclick="WebhookManager.sendRecoveryMessage('${cart.id}')" class="flex-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700">
                            <i class="fab fa-whatsapp mr-1"></i> Recuperar
                        </button>
                        <button onclick="WebhookManager.removeAbandonedCart('${cart.id}')" class="text-gray-400 hover:text-red-500 px-2">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Renderizar lista de eventos
    renderEvents(events) {
        const container = document.getElementById('webhook-events-list');
        if (!container) return;
        
        if (events.length === 0) {
            container.innerHTML = `
                <div class="p-6 text-center text-gray-500">
                    <i class="fas fa-satellite-dish text-4xl text-gray-300 mb-2"></i>
                    <p>Aguardando eventos...</p>
                    <p class="text-xs mt-1">Os eventos aparecerão aqui quando o FacilZap enviar</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = events.slice(0, 20).map(event => {
            const icon = this.getEventIcon(event.evento);
            const color = this.getEventColor(event.evento);
            const time = this.getTimeSince(event.receivedAt);
            const description = this.getEventDescription(event);
            
            return `
                <div class="p-3 hover:bg-gray-50 flex items-start gap-3">
                    <div class="w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0">
                        <i class="${icon} text-white text-sm"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800">${event.evento?.replace('_', ' ').toUpperCase()}</p>
                        <p class="text-xs text-gray-500 truncate">${description}</p>
                        <p class="text-xs text-gray-400">${time}</p>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Ícone do evento
    getEventIcon(evento) {
        const icons = {
            'pedido_criado': 'fas fa-shopping-cart',
            'pedido_atualizado': 'fas fa-sync-alt',
            'pedido_pago': 'fas fa-check',
            'carrinho_abandonado_criado': 'fas fa-shopping-basket'
        };
        return icons[evento] || 'fas fa-bell';
    },
    
    // Cor do evento
    getEventColor(evento) {
        const colors = {
            'pedido_criado': 'bg-green-500',
            'pedido_atualizado': 'bg-blue-500',
            'pedido_pago': 'bg-emerald-500',
            'carrinho_abandonado_criado': 'bg-orange-500'
        };
        return colors[evento] || 'bg-gray-500';
    },
    
    // Descrição do evento
    getEventDescription(event) {
        const dados = event.dados || {};
        switch (event.evento) {
            case 'pedido_criado':
                return `Pedido #${dados.id || dados.codigo || '?'} - ${dados.cliente?.nome || 'Cliente'} - R$ ${(dados.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            case 'pedido_atualizado':
                return `Pedido #${dados.id || dados.codigo || '?'} atualizado`;
            case 'pedido_pago':
                return `Pedido #${dados.id || dados.codigo || '?'} - Pagamento confirmado`;
            case 'carrinho_abandonado_criado':
                return `${dados.cliente?.nome || 'Cliente'} - R$ ${(dados.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            default:
                return JSON.stringify(dados).substring(0, 50);
        }
    },
    
    // Tempo desde o evento
    getTimeSince(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 60) return 'Agora mesmo';
        if (diff < 3600) return `Há ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Há ${Math.floor(diff / 3600)} horas`;
        return `Há ${Math.floor(diff / 86400)} dias`;
    },
    
    // Enviar mensagem de recuperação
    sendRecoveryMessage(cartId) {
        const cart = this.getAbandonedCarts().find(c => c.id === cartId);
        if (!cart) return;
        
        const phone = cart.cliente?.whatsapp || cart.cliente?.whatsapp_e164;
        if (!phone) {
            showToast('Cliente sem telefone cadastrado', 'error');
            return;
        }
        
        const produtos = (cart.produtos || []).map(p => p.nome).join(', ');
        const message = `Olá ${cart.cliente?.nome || ''}!

Vi que você deixou alguns itens no carrinho:
${produtos}

Valor total: R$ ${(cart.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

Posso te ajudar a finalizar sua compra? 🛒`;

        const cleanPhone = phone.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    },
    
    // Simular recebimento de webhook (para testes)
    simulateWebhook(type) {
        const now = new Date().toISOString();
        
        const samples = {
            pedido_criado: {
                evento: 'pedido_criado',
                dados: {
                    id: Math.floor(Math.random() * 100000),
                    codigo: 'TEST' + Math.floor(Math.random() * 1000),
                    total: Math.floor(Math.random() * 500) + 50,
                    cliente: { nome: 'Cliente Teste', whatsapp: '11999999999' }
                }
            },
            carrinho_abandonado_criado: {
                evento: 'carrinho_abandonado_criado',
                dados: {
                    id: 'cart-' + Math.random().toString(36).substr(2, 9),
                    cliente: { nome: 'Maria Silva', whatsapp: '11988887777' },
                    valor_total: Math.floor(Math.random() * 300) + 100,
                    quantidade_produtos: 2,
                    produtos: [
                        { nome: 'Camiseta Básica', variacao: { nome: 'M' }, quantidade: 1 },
                        { nome: 'Calça Jeans', variacao: null, quantidade: 1 }
                    ],
                    iniciado_em: now,
                    ultima_atualizacao: now
                }
            }
        };
        
        const sample = samples[type];
        if (sample) {
            this.saveEvent(sample);
            if (type === 'carrinho_abandonado_criado') {
                this.saveAbandonedCart(sample.dados);
            }
            showToast(`Webhook simulado: ${type}`, 'info');
        }
    }
};

// Inicializar página de Webhooks
function initWebhooksPage() {
    // Atualizar UI inicial
    WebhookManager.updateUI();
    
    // Copiar URL
    document.getElementById('copy-webhook-url-page')?.addEventListener('click', () => {
        const url = document.getElementById('webhook-url-text')?.textContent;
        if (url) {
            navigator.clipboard.writeText(url).then(() => {
                showToast('URL copiada!', 'success');
            });
        }
    });
    
    // Limpar histórico
    document.getElementById('clear-webhook-events')?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar o histórico de eventos?')) {
            WebhookManager.clearEvents();
        }
    });
}

// Expor WebhookManager globalmente
window.WebhookManager = WebhookManager;

// ============================================================================
// MÓDULO DE CUPONS - GESTÃO INTELIGENTE
// ============================================================================

const CouponManager = {
    STORAGE_KEY: 'crm_coupons',
    ASSIGNMENTS_KEY: 'crm_coupon_assignments',
    
    getCoupons() {
        try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]'); } catch { return []; }
    },
    
    saveCoupon(coupon) {
        const coupons = this.getCoupons();
        const existing = coupons.findIndex(c => c.code === coupon.code.toUpperCase());
        const newCoupon = {
            ...coupon, code: coupon.code.toUpperCase(), id: coupon.id || Date.now().toString(),
            createdAt: coupon.createdAt || new Date().toISOString(), usedCount: coupon.usedCount || 0,
            sentCount: coupon.sentCount || 0, active: coupon.active !== false
        };
        if (existing >= 0) coupons[existing] = { ...coupons[existing], ...newCoupon };
        else coupons.push(newCoupon);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coupons));
        this.updateUI();
        return newCoupon;
    },
    
    deleteCoupon(code) {
        const coupons = this.getCoupons().filter(c => c.code !== code.toUpperCase());
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coupons));
        this.updateUI();
    },
    
    getAssignments() {
        try { return JSON.parse(localStorage.getItem(this.ASSIGNMENTS_KEY) || '[]'); } catch { return []; }
    },
    
    assignCoupon(clientId, couponCode, clientName = '') {
        const assignments = this.getAssignments();
        if (!assignments.find(a => a.clientId === clientId && a.couponCode === couponCode)) {
            assignments.push({ id: Date.now().toString(), clientId, clientName, couponCode: couponCode.toUpperCase(),
                assignedAt: new Date().toISOString(), used: false, usedAt: null, orderId: null });
            localStorage.setItem(this.ASSIGNMENTS_KEY, JSON.stringify(assignments));
            const coupons = this.getCoupons();
            const coupon = coupons.find(c => c.code === couponCode.toUpperCase());
            if (coupon) { coupon.sentCount = (coupon.sentCount || 0) + 1; localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coupons)); }
        }
        this.updateUI();
    },
    
    markCouponUsed(couponCode, clientId, orderId) {
        const assignments = this.getAssignments();
        const assignment = assignments.find(a => a.couponCode === couponCode.toUpperCase() && a.clientId === clientId && !a.used);
        if (assignment) {
            assignment.used = true; assignment.usedAt = new Date().toISOString(); assignment.orderId = orderId;
            localStorage.setItem(this.ASSIGNMENTS_KEY, JSON.stringify(assignments));
            const coupons = this.getCoupons();
            const coupon = coupons.find(c => c.code === couponCode.toUpperCase());
            if (coupon) { coupon.usedCount = (coupon.usedCount || 0) + 1; localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coupons)); }
            const clients = Storage.getClients();
            const client = clients.find(c => c.id == clientId);
            if (client) { client.recoveredWithCoupon = true; client.recoveredAt = new Date().toISOString(); Storage.saveClients(clients); }
            showToast(`🎉 Cliente recuperado com cupom ${couponCode}!`, 'success');
        }
        this.updateUI();
    },
    
    suggestCoupon(client) {
        const ticketMedio = client.stats?.averageTicket || 0;
        const assignments = this.getAssignments();
        const pending = assignments.find(a => a.clientId === client.id && !a.used);
        if (pending) return { code: pending.couponCode, reason: 'Cupom já enviado', pending: true };
        if (ticketMedio >= 500) return { code: 'VOLTA15', reason: 'Ticket Alto (15%)', discount: '15%' };
        if (ticketMedio >= 200) return { code: 'VOLTA10', reason: 'Ticket Médio (10%)', discount: '10%' };
        return { code: 'FRETEGRATIS', reason: 'Frete Grátis', discount: 'Frete' };
    },
    
    getStats() {
        const coupons = this.getCoupons();
        const assignments = this.getAssignments();
        const active = coupons.filter(c => c.active).length;
        const totalSent = assignments.length;
        const totalUsed = assignments.filter(a => a.used).length;
        const conversionRate = totalSent > 0 ? ((totalUsed / totalSent) * 100).toFixed(1) : 0;
        return { active, totalSent, totalUsed, conversionRate };
    },
    
    updateUI() {
        const stats = this.getStats();
        const coupons = this.getCoupons();
        const assignments = this.getAssignments();
        
        ['coupon-active-count', 'coupon-sent-count', 'coupon-used-count', 'coupon-conversion-rate',
         'dash-recovered-count', 'dash-coupon-roi'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id.includes('active')) el.textContent = stats.active;
                else if (id.includes('sent')) el.textContent = stats.totalSent;
                else if (id.includes('used') || id.includes('recovered')) el.textContent = stats.totalUsed;
                else if (id.includes('rate') || id.includes('roi')) el.textContent = stats.conversionRate + '%';
            }
        });
        
        this.renderCouponsList(coupons);
        this.renderUsageHistory(assignments);
        this.renderPendingCoupons(assignments);
        this.updateCouponSelect(coupons);
    },
    
    renderCouponsList(coupons) {
        const container = document.getElementById('coupons-list');
        if (!container) return;
        if (coupons.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-gray-500"><i class="fas fa-ticket-alt text-4xl text-gray-300 mb-2"></i><p>Nenhum cupom cadastrado</p></div>';
            return;
        }
        container.innerHTML = coupons.map(c => {
            const conv = c.sentCount > 0 ? ((c.usedCount / c.sentCount) * 100).toFixed(0) : 0;
            return `<div class="p-4 hover:bg-gray-50"><div class="flex justify-between items-start"><div>
                <span class="font-mono font-bold text-lg text-indigo-600">${c.code}</span>
                <span class="text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">${c.active ? 'Ativo' : 'Inativo'}</span>
                <p class="text-sm text-gray-500">${c.description || 'Sem descrição'}</p></div>
                <div class="text-right"><p class="text-sm"><span class="font-bold text-blue-600">${c.sentCount || 0}</span> enviados</p>
                <p class="text-sm"><span class="font-bold text-green-600">${c.usedCount || 0}</span> usados (${conv}%)</p></div></div>
                <div class="flex gap-2 mt-2"><button onclick="CouponManager.toggleActive('${c.code}')" class="text-xs px-2 py-1 bg-gray-200 rounded">${c.active ? 'Desativar' : 'Ativar'}</button>
                <button onclick="CouponManager.deleteCoupon('${c.code}')" class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">Excluir</button></div></div>`;
        }).join('');
    },
    
    renderUsageHistory(assignments) {
        const container = document.getElementById('coupon-usage-history');
        if (!container) return;
        const used = assignments.filter(a => a.used).slice(0, 20);
        if (used.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-500"><i class="fas fa-history text-4xl text-gray-300"></i><p>Nenhum uso</p></div>'; return; }
        container.innerHTML = used.map(a => `<div class="p-3 flex justify-between"><div><p class="font-medium">${a.clientName || 'Cliente'}</p><p class="text-xs text-gray-500">Cupom: ${a.couponCode}</p></div><span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ ${formatDate(a.usedAt)}</span></div>`).join('');
    },
    
    renderPendingCoupons(assignments) {
        const container = document.getElementById('pending-coupons-list');
        const countEl = document.getElementById('pending-coupons-count');
        if (!container) return;
        const pending = assignments.filter(a => !a.used);
        if (countEl) countEl.textContent = `${pending.length} clientes`;
        if (pending.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-500"><i class="fas fa-hourglass-half text-4xl text-gray-300"></i><p>Nenhum pendente</p></div>'; return; }
        container.innerHTML = pending.slice(0, 15).map(a => `<div class="p-3 flex justify-between"><div><p class="font-medium">${a.clientName || 'Cliente'}</p><p class="text-xs">${a.couponCode} - ${formatDate(a.assignedAt)}</p></div><button onclick="CouponManager.resendCoupon('${a.clientId}','${a.couponCode}')" class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded"><i class="fab fa-whatsapp"></i> Reenviar</button></div>`).join('');
    },
    
    updateCouponSelect(coupons) {
        const select = document.getElementById('bulk-coupon-select');
        if (select) select.innerHTML = '<option value="">Nenhum cupom</option>' + coupons.filter(c => c.active).map(c => `<option value="${c.code}">${c.code}</option>`).join('');
    },
    
    toggleActive(code) {
        const coupons = this.getCoupons();
        const c = coupons.find(x => x.code === code);
        if (c) { c.active = !c.active; localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coupons)); this.updateUI(); }
    },
    
    resendCoupon(clientId, couponCode) {
        const client = Storage.getClients().find(c => c.id == clientId);
        if (!client?.phone) { showToast('Sem telefone', 'error'); return; }
        const msg = `Olá ${client.name}! Você ainda não usou seu cupom: ${couponCode}`;
        window.open(`https://wa.me/55${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    }
};
window.CouponManager = CouponManager;

// ============================================================================
// MÓDULO DE CAMPANHAS
// ============================================================================

const CampaignManager = {
    filteredClients: [],
    
    applyFilters() {
        const clients = Storage.getClients();
        const assignments = CouponManager.getAssignments();
        const daysMin = parseInt(document.getElementById('camp-days-min')?.value) || 0;
        const daysMax = parseInt(document.getElementById('camp-days-max')?.value) || 9999;
        const ticketMin = parseFloat(document.getElementById('camp-ticket-min')?.value) || 0;
        const ticketMax = parseFloat(document.getElementById('camp-ticket-max')?.value) || 999999;
        const ordersMin = parseInt(document.getElementById('camp-orders-min')?.value) || 0;
        const ordersMax = parseInt(document.getElementById('camp-orders-max')?.value) || 9999;
        const state = document.getElementById('camp-state')?.value || '';
        const hasCoupon = document.getElementById('camp-has-coupon')?.value || '';
        const aiTag = document.getElementById('camp-ai-tag')?.value || '';
        
        // Múltiplos status selecionados
        const selectedStatuses = Array.from(document.querySelectorAll('.camp-status-check:checked')).map(cb => cb.value);
        
        this.filteredClients = clients.filter(client => {
            const stats = client.stats || {};
            const days = stats.daysSinceLastPurchase || 9999;
            if (days < daysMin || days > daysMax) return false;
            if ((stats.averageTicket || 0) < ticketMin || (stats.averageTicket || 0) > ticketMax) return false;
            if ((stats.totalOrders || 0) < ordersMin || (stats.totalOrders || 0) > ordersMax) return false;
            if (state && (client.state || client.estado || '').toUpperCase() !== state.toUpperCase()) return false;
            
            // Filtro combo de status
            if (selectedStatuses.length > 0 && !selectedStatuses.includes(client.status)) return false;
            
            // Filtro por tag da IA Vigilante
            if (aiTag) {
                const aiTags = client.aiTags || [];
                if (!aiTags.includes(aiTag)) return false;
            }
            
            if (hasCoupon) {
                const ca = assignments.filter(a => a.clientId === client.id);
                if (hasCoupon === 'no' && ca.length > 0) return false;
                if (hasCoupon === 'yes' && ca.length === 0) return false;
                if (hasCoupon === 'used' && !ca.some(a => a.used)) return false;
                if (hasCoupon === 'not-used' && (ca.length === 0 || ca.some(a => a.used))) return false;
            }
            return true;
        });
        this.renderResults();
        this.updateButtons();
    },
    
    applyQuickFilter(filterType) {
        document.querySelectorAll('#campaigns-page input[type="number"], #campaigns-page select').forEach(el => { if (el.type === 'number') el.value = ''; else if (el.tagName === 'SELECT') el.value = ''; });
        document.querySelectorAll('.camp-status-check').forEach(cb => cb.checked = false);
        switch (filterType) {
            case 'inactive-300': document.getElementById('camp-days-min').value = 300; break;
            case 'risk-high-ticket': 
                document.querySelector('.camp-status-check[value="em-risco"]').checked = true;
                document.getElementById('camp-ticket-min').value = 300; 
                break;
            case 'vip-inactive': 
                document.getElementById('camp-ticket-min').value = 500; 
                document.getElementById('camp-orders-min').value = 5; 
                document.getElementById('camp-days-min').value = 60; 
                break;
            case 'first-purchase': 
                document.getElementById('camp-orders-min').value = 1; 
                document.getElementById('camp-orders-max').value = 1; 
                break;
            case 'no-coupon': document.getElementById('camp-has-coupon').value = 'no'; break;
        }
        this.applyFilters();
    },
    
    renderResults() {
        const container = document.getElementById('campaign-results-list');
        const countEl = document.getElementById('campaign-result-count');
        if (countEl) countEl.textContent = this.filteredClients.length;
        if (this.filteredClients.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-gray-500"><i class="fas fa-search text-5xl text-gray-300 mb-4"></i><p class="text-lg">Nenhum cliente encontrado</p></div>';
            return;
        }
        container.innerHTML = this.filteredClients.slice(0, 50).map(client => {
            const stats = client.stats || {};
            const suggestion = CouponManager.suggestCoupon(client);
            return `<div class="p-4 hover:bg-gray-50 flex items-center justify-between"><div class="flex items-center gap-4">
                <input type="checkbox" class="campaign-client-check" data-id="${client.id}" checked>
                <div><p class="font-medium">${client.name}</p><p class="text-sm text-gray-500">${client.phone || client.email || 'Sem contato'}</p>
                <p class="text-xs text-gray-400">${stats.totalOrders || 0} ped • ${formatCurrency(stats.averageTicket || 0)} • ${stats.daysSinceLastPurchase || '?'} dias</p></div></div>
                <div class="text-right"><span class="text-xs px-2 py-1 rounded-full ${client.status === 'ativo' ? 'bg-green-100 text-green-700' : client.status === 'em-risco' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${client.status || 'N/A'}</span>
                <p class="text-xs text-gray-500 mt-1">Sugestão: <span class="font-mono text-indigo-600">${suggestion.code}</span></p></div></div>`;
        }).join('');
    },
    
    updateButtons() {
        const has = this.filteredClients.length > 0;
        ['campaign-generate-coupons', 'campaign-export', 'campaign-whatsapp'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !has; });
    },
    
    getSelectedClients() {
        const ids = Array.from(document.querySelectorAll('.campaign-client-check:checked')).map(cb => cb.dataset.id);
        return this.filteredClients.filter(c => ids.includes(c.id.toString()));
    },
    
    generateCoupons() {
        const selected = this.getSelectedClients();
        if (selected.length === 0) { showToast('Selecione clientes', 'error'); return; }
        let gen = 0;
        selected.forEach(client => {
            const s = CouponManager.suggestCoupon(client);
            if (!s.pending) { CouponManager.assignCoupon(client.id, s.code, client.name); gen++; }
        });
        showToast(`${gen} cupons atribuídos!`, 'success');
        this.applyFilters();
    },
    
    exportCSV() {
        const selected = this.getSelectedClients();
        if (selected.length === 0) { showToast('Selecione clientes', 'error'); return; }
        const rows = [['Nome', 'Telefone', 'Email', 'Ticket', 'Dias', 'Cupom']];
        selected.forEach(c => {
            const s = c.stats || {};
            rows.push([c.name, c.phone || '', c.email || '', s.averageTicket || 0, s.daysSinceLastPurchase || '', CouponManager.suggestCoupon(c).code]);
        });
        const csv = rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `campanha_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast(`${selected.length} exportados!`, 'success');
    },
    
    openBulkWhatsApp() {
        const selected = this.getSelectedClients();
        if (selected.length === 0) { showToast('Selecione clientes', 'error'); return; }
        document.getElementById('bulk-client-count').textContent = selected.length;
        document.getElementById('ai-variations-container').classList.add('hidden');
        document.getElementById('ai-variations-loading').classList.add('hidden');
        document.getElementById('bulk-whatsapp-modal').classList.remove('hidden');
        
        // Popular select de cupons
        const coupons = Storage.load('crm_coupons', []).filter(c => c.isActive);
        const select = document.getElementById('bulk-coupon-select');
        select.innerHTML = '<option value="">Nenhum cupom</option>' + 
            coupons.map(c => `<option value="${c.code}">${c.code} (-${c.discount}${c.type === 'percent' ? '%' : 'R$'})</option>`).join('');
    },
    
    async generateAIVariations() {
        const selected = this.getSelectedClients();
        const baseMsg = document.getElementById('bulk-message-text').value;
        const settings = Storage.getSettings();
        
        if (!settings.groqApiKey) {
            showToast('Configure a API Key do Groq em Configurações', 'error');
            return;
        }
        
        document.getElementById('ai-variations-loading').classList.remove('hidden');
        document.getElementById('ai-variations-container').classList.add('hidden');
        
        // Resumo dos clientes selecionados
        const avgTicket = selected.reduce((sum, c) => sum + (c.stats?.averageTicket || 0), 0) / selected.length;
        const avgDays = selected.reduce((sum, c) => sum + (c.stats?.daysSinceLastPurchase || 0), 0) / selected.length;
        const statuses = [...new Set(selected.map(c => c.status))].join(', ');
        
        const prompt = `Você é um copywriter especialista em WhatsApp Marketing para e-commerce.

Contexto dos clientes selecionados:
- Total: ${selected.length} clientes
- Ticket médio: R$${avgTicket.toFixed(2)}
- Dias sem comprar (média): ${avgDays.toFixed(0)} dias
- Status: ${statuses}

Mensagem base atual:
"${baseMsg}"

Crie EXATAMENTE 3 variações criativas e persuasivas da mensagem acima.
- Use emojis de forma profissional
- Mantenha {nome} e {cupom} como placeholders
- Cada variação deve ter um tom diferente: 1) Urgente/Escassez, 2) Amigável/Emotivo, 3) Benefício/Valor
- Máximo 300 caracteres cada
- Formato de resposta: Retorne APENAS um JSON array com 3 strings, sem explicações.

Exemplo de resposta:
["Mensagem 1...", "Mensagem 2...", "Mensagem 3..."]`;

        try {
            const data = await callAI(settings.groqApiKey, prompt);
            const content = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            
            // Tentar parsear JSON da resposta
            let parsed = [];
            try {
                // Extrair JSON da resposta
                const match = content.match(/\[[\s\S]*\]/);
                if (match) {
                    parsed = JSON.parse(match[0]);
                }
            } catch (e) {
                // Se não conseguir parsear, dividir por linhas
                parsed = content.split('\n').filter(l => l.trim().length > 20).slice(0, 3);
            }
            
            if (parsed.length === 0) {
                throw new Error('Resposta inválida da IA');
            }
            
            // Renderizar variações
            const container = document.getElementById('ai-variations-list');
            container.innerHTML = parsed.map((v, i) => `
                <div class="p-3 bg-white border border-purple-200 rounded cursor-pointer hover:bg-purple-100 transition ai-variation" data-variation="${encodeURIComponent(v)}">
                    <span class="text-xs font-bold text-purple-600">${i === 0 ? '🔥 Urgente' : i === 1 ? '💚 Emotivo' : '💎 Valor'}</span>
                    <p class="text-sm text-gray-700 mt-1">${v.substring(0, 150)}${v.length > 150 ? '...' : ''}</p>
                </div>
            `).join('');
            
            // Adicionar listeners
            container.querySelectorAll('.ai-variation').forEach(el => {
                el.addEventListener('click', () => {
                    document.getElementById('bulk-message-text').value = decodeURIComponent(el.dataset.variation);
                    showToast('Variação aplicada!', 'success');
                });
            });
            
            document.getElementById('ai-variations-loading').classList.add('hidden');
            document.getElementById('ai-variations-container').classList.remove('hidden');
            
        } catch (error) {
            console.error('Erro ao gerar variações:', error);
            document.getElementById('ai-variations-loading').classList.add('hidden');
            showToast('Erro ao gerar variações. Verifique a API.', 'error');
        }
    },
    
    async startBulkDispatch() {
        const selected = this.getSelectedClients();
        const msg = document.getElementById('bulk-message-text').value;
        const coupon = document.getElementById('bulk-coupon-select').value;
        if (!msg) { showToast('Preencha a mensagem', 'error'); return; }
        let sent = 0;
        for (const client of selected) {
            if (!client.phone) continue;
            let m = msg.replace(/{nome}/g, client.name?.split(' ')[0] || '').replace(/{cupom}/g, coupon);
            if (coupon) CouponManager.assignCoupon(client.id, coupon, client.name);
            window.open(`https://wa.me/55${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(m)}`, '_blank');
            sent++;
            await new Promise(r => setTimeout(r, 500));
        }
        showToast(`${sent} mensagens!`, 'success');
        document.getElementById('bulk-whatsapp-modal').classList.add('hidden');
    }
};
window.CampaignManager = CampaignManager;

// ============================================================================
// IA VIGILANTE
// ============================================================================

const AIVigilante = {
    alerts: [],
    
    run() {
        console.log('[IA Vigilante] Analisando...');
        const clients = Storage.getClients();
        const orders = Storage.getOrders();
        this.alerts = [];
        
        // Calcular stats para cada cliente baseado nos pedidos
        const clientsWithStats = clients.map(client => {
            const clientOrders = orders.filter(o => 
                o.clientId == client.id || 
                o.cliente_id == client.id ||
                (o.clientName && client.name && o.clientName.toLowerCase().includes(client.name.toLowerCase().split(' ')[0]))
            );
            
            const totalSpent = clientOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
            const totalOrders = clientOrders.length;
            const averageTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;
            
            // Calcular dias desde última compra
            let daysSinceLastPurchase = 9999;
            if (clientOrders.length > 0) {
                const dates = clientOrders.map(o => new Date(o.data || o.date)).filter(d => !isNaN(d));
                if (dates.length > 0) {
                    const lastDate = new Date(Math.max(...dates));
                    daysSinceLastPurchase = Math.ceil((new Date() - lastDate) / (1000 * 60 * 60 * 24));
                }
            } else if (client.lastPurchaseDate) {
                daysSinceLastPurchase = Math.ceil((new Date() - new Date(client.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
            }
            
            // Calcular intervalo médio entre compras
            let avgPurchaseInterval = 0;
            if (clientOrders.length >= 2) {
                const dates = clientOrders.map(o => new Date(o.data || o.date)).filter(d => !isNaN(d)).sort((a,b) => a-b);
                if (dates.length >= 2) {
                    let totalDays = 0;
                    for (let i = 1; i < dates.length; i++) {
                        totalDays += (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
                    }
                    avgPurchaseInterval = totalDays / (dates.length - 1);
                }
            }
            
            return {
                ...client,
                stats: { daysSinceLastPurchase, totalOrders, averageTicket, totalSpent, avgPurchaseInterval }
            };
        });
        
        console.log('[IA Vigilante] Clientes com stats:', clientsWithStats.length);
        console.log('[IA Vigilante] Exemplo:', clientsWithStats[0]?.stats);
        
        // Urgentes (300+ dias, ticket alto OU muitos pedidos)
        const urgent = clientsWithStats.filter(c => 
            c.stats.daysSinceLastPurchase >= 300 && 
            (c.stats.averageTicket >= 200 || c.stats.totalOrders >= 3)
        );
        urgent.forEach(c => this.alerts.push({ 
            type: 'urgent', priority: 1, client: c, 
            title: `${c.name} - ${c.stats.daysSinceLastPurchase} dias`,
            reason: `Ticket: ${formatCurrency(c.stats.averageTicket)} • ${c.stats.totalOrders} pedidos`,
            suggestedCoupon: CouponManager.suggestCoupon(c) 
        }));
        
        // Também pegar inativos com menos dias mas com histórico relevante
        const atRisk = clientsWithStats.filter(c => 
            c.stats.daysSinceLastPurchase >= 90 && 
            c.stats.daysSinceLastPurchase < 300 &&
            c.stats.totalOrders >= 2
        );
        atRisk.slice(0, 10).forEach(c => this.alerts.push({ 
            type: 'urgent', priority: 2, client: c, 
            title: `${c.name} - ${c.stats.daysSinceLastPurchase} dias`,
            reason: `Em risco • ${formatCurrency(c.stats.averageTicket)} • ${c.stats.totalOrders} ped`,
            suggestedCoupon: CouponManager.suggestCoupon(c) 
        }));
        
        // Upsell - clientes ativos com bom histórico
        const upsell = clientsWithStats.filter(c => c.stats.daysSinceLastPurchase <= 30 && c.stats.totalOrders >= 3).slice(0, 10);
        upsell.forEach(c => this.alerts.push({ type: 'upsell', priority: 3, client: c, title: c.name, reason: `${c.stats.totalOrders} ped, ${formatCurrency(c.stats.averageTicket)}` }));
        
        // Atrasados - passaram do intervalo normal de compra
        const late = clientsWithStats.filter(c => {
            const avg = c.stats.avgPurchaseInterval || 0;
            const days = c.stats.daysSinceLastPurchase || 0;
            return avg > 0 && days > avg * 1.5 && c.stats.totalOrders >= 3;
        });
        late.forEach(c => this.alerts.push({ type: 'late', priority: 2, client: c, title: c.name, reason: `Comprava a cada ${Math.round(c.stats.avgPurchaseInterval)}d, há ${c.stats.daysSinceLastPurchase}d` }));
        
        this.alerts.sort((a, b) => a.priority - b.priority);
        const totalUrgent = urgent.length + atRisk.length;
        const riskValue = [...urgent, ...atRisk].reduce((s, c) => s + (c.stats.totalSpent || 0), 0);
        
        this.updateDashboard({ urgentCount: totalUrgent, riskValue, upsellCount: upsell.length, lateCount: late.length });
        console.log(`[IA Vigilante] Resultado: ${totalUrgent} urgentes, ${upsell.length} upsell, ${late.length} atrasados`);
        showToast(`IA: ${totalUrgent} clientes precisam de ação!`, totalUrgent > 0 ? 'warning' : 'info');
    },
    
    updateDashboard(stats) {
        const badge = document.getElementById('alerts-badge');
        if (badge) { if (stats.urgentCount > 0) { badge.textContent = stats.urgentCount; badge.classList.remove('hidden'); } else badge.classList.add('hidden'); }
        
        const u = document.getElementById('dash-urgent-count');
        const r = document.getElementById('dash-risk-value');
        if (u) u.textContent = stats.urgentCount;
        if (r) r.textContent = formatCurrency(stats.riskValue);
        
        document.getElementById('quick-inactive-count')?.textContent && (document.getElementById('quick-inactive-count').textContent = `${stats.urgentCount} clientes`);
        document.getElementById('late-count')?.textContent && (document.getElementById('late-count').textContent = `${stats.lateCount} clientes`);
        document.getElementById('upsell-count')?.textContent && (document.getElementById('upsell-count').textContent = `${stats.upsellCount} clientes`);
        document.getElementById('quick-cart-count')?.textContent && (document.getElementById('quick-cart-count').textContent = `${WebhookManager.getAbandonedCarts().length} carrinhos`);
        
        this.renderUrgentList();
        this.renderUpsellList();
        this.renderLateList();
    },
    
    renderUrgentList() {
        const container = document.getElementById('urgent-clients-list');
        if (!container) return;
        const urgent = this.alerts.filter(a => a.type === 'urgent').slice(0, 10);
        if (urgent.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-500"><i class="fas fa-check-circle text-4xl text-green-300"></i><p>Nenhuma urgência</p></div>'; return; }
        container.innerHTML = urgent.map(a => `<div class="p-4 hover:bg-red-50 flex justify-between items-center">
            <div><p class="font-medium">${a.title}</p><p class="text-sm text-gray-500">${a.reason}</p><p class="text-xs text-indigo-600">Sugestão: ${a.suggestedCoupon?.code}</p></div>
            <div class="flex gap-2">
                <button onclick="viewClientDetails('${a.client.id}')" class="bg-indigo-600 text-white text-xs px-2 py-1 rounded"><i class="fas fa-eye"></i></button>
                <button onclick="AIVigilante.sendCoupon('${a.client.id}','${a.suggestedCoupon?.code}')" class="bg-green-600 text-white text-xs px-3 py-1.5 rounded"><i class="fab fa-whatsapp"></i> Enviar</button>
            </div></div>`).join('');
    },
    
    renderUpsellList() {
        const container = document.getElementById('upsell-clients-list');
        if (!container) return;
        const upsell = this.alerts.filter(a => a.type === 'upsell');
        if (upsell.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-500"><i class="fas fa-star text-4xl text-yellow-300"></i><p>Analisando...</p></div>'; return; }
        container.innerHTML = upsell.map(a => `<div class="p-4 hover:bg-green-50 flex justify-between"><div><p class="font-medium">${a.title}</p><p class="text-sm text-gray-500">${a.reason}</p></div>
            <button onclick="viewClientDetails('${a.client.id}')" class="bg-indigo-600 text-white text-xs px-3 py-1 rounded">Ver</button></div>`).join('');
    },
    
    renderLateList() {
        const container = document.getElementById('late-clients-list');
        if (!container) return;
        const late = this.alerts.filter(a => a.type === 'late').slice(0, 10);
        if (late.length === 0) { container.innerHTML = '<div class="p-6 text-center text-gray-500"><i class="fas fa-calendar-check text-4xl text-gray-300"></i><p>Nenhum atrasado</p></div>'; return; }
        container.innerHTML = late.map(a => `<div class="p-3 hover:bg-yellow-50 flex justify-between"><div><p class="font-medium">${a.title}</p><p class="text-xs text-gray-500">${a.reason}</p></div>
            <div class="flex gap-2">
                <button onclick="viewClientDetails('${a.client.id}')" class="bg-indigo-600 text-white text-xs px-2 py-1 rounded"><i class="fas fa-eye"></i></button>
                <button onclick="AIVigilante.sendReminder('${a.client.id}')" class="bg-yellow-500 text-white text-xs px-3 py-1 rounded"><i class="fab fa-whatsapp"></i></button>
            </div></div>`).join('');
    },
    
    sendCoupon(clientId, couponCode) {
        const client = Storage.getClients().find(c => c.id == clientId || String(c.id) === String(clientId));
        if (!client) { showToast('Cliente não encontrado', 'error'); return; }
        if (!client.phone) { showToast('Cliente sem telefone cadastrado', 'error'); return; }
        CouponManager.assignCoupon(clientId, couponCode, client.name);
        const msg = `Olá ${client.name?.split(' ')[0]}!\n\nSentimos sua falta!\n\nCupom EXCLUSIVO: ${couponCode}\n\nAproveite!`;
        window.open(`https://wa.me/55${client.phone.replace(/\\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        showToast(`Cupom enviado!`, 'success');
    },
    
    sendReminder(clientId) {
        const client = Storage.getClients().find(c => c.id == clientId || String(c.id) === String(clientId));
        if (!client) { showToast('Cliente não encontrado', 'error'); return; }
        if (!client.phone) { showToast('Cliente sem telefone cadastrado', 'error'); return; }
        const msg = `Olá ${client.name?.split(' ')[0]}!\n\nTudo bem? Faz um tempinho que não te vemos por aqui!\n\nPosso te ajudar com algo?`;
        window.open(`https://wa.me/55${client.phone.replace(/\\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    },
    
    // NOVA FUNÇÃO: Exportar clientes urgentes para CSV
    exportUrgentCSV() {
        const urgent = this.alerts.filter(a => a.type === 'urgent' || a.type === 'at_risk');
        if (urgent.length === 0) { showToast('Nenhum cliente urgente para exportar', 'info'); return; }
        
        const headers = ['Nome', 'Telefone', 'Email', 'Último Pedido', 'Total Gasto', 'Qtd Pedidos', 'Dias Inativo', 'Motivo'];
        const rows = urgent.map(a => {
            const c = a.client;
            const stats = a.stats || {};
            return [
                c.name || '',
                c.phone || '',
                c.email || '',
                stats.lastPurchaseDate || '',
                stats.totalSpent || 0,
                stats.orderCount || 0,
                stats.daysSincePurchase || 0,
                a.reason || ''
            ];
        });
        
        const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `clientes_urgentes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast(`${urgent.length} clientes exportados!`, 'success');
    },
    
    // Exportar TODOS os clientes com telefone
    exportAllClientsCSV() {
        const clients = Storage.getClients().filter(c => c.phone);
        if (clients.length === 0) { showToast('Nenhum cliente com telefone', 'info'); return; }
        
        const headers = ['Nome', 'Telefone', 'Email', 'Cidade', 'Último Pedido', 'Total Gasto', 'Qtd Pedidos', 'Status'];
        const rows = clients.map(c => [
            c.name || '',
            c.phone || '',
            c.email || '',
            c.city || '',
            c.lastPurchaseDate || '',
            c.totalSpent || 0,
            c.orderCount || 0,
            getClientStatus(c).text
        ]);
        
        const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `todos_clientes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast(`${clients.length} clientes exportados!`, 'success');
    },
    
    actionAllUrgent() {
        const urgent = this.alerts.filter(a => a.type === 'urgent');
        if (urgent.length === 0) { showToast('Nenhum urgente', 'info'); return; }
        CampaignManager.filteredClients = urgent.map(a => a.client).filter(c => c.phone);
        CampaignManager.openBulkWhatsApp();
    }
};
window.AIVigilante = AIVigilante;

// ============================================================================
// INICIALIZAÇÃO NOVOS MÓDULOS
// ============================================================================

function initDashboard() {
    document.getElementById('run-vigilante-btn')?.addEventListener('click', () => AIVigilante.run());
    document.getElementById('action-all-urgent')?.addEventListener('click', () => AIVigilante.actionAllUrgent());
    document.getElementById('quick-action-inactive')?.addEventListener('click', () => { document.getElementById('nav-campaigns').click(); setTimeout(() => CampaignManager.applyQuickFilter('inactive-300'), 100); });
    document.getElementById('quick-action-vip')?.addEventListener('click', () => { document.getElementById('nav-campaigns').click(); setTimeout(() => CampaignManager.applyQuickFilter('vip-inactive'), 100); });
    document.getElementById('quick-action-cart')?.addEventListener('click', () => document.getElementById('nav-webhooks').click());
    setTimeout(() => { if (Storage.getClients().length > 0) AIVigilante.run(); }, 1000);
}

function initCampaigns() {
    document.getElementById('apply-campaign-filters')?.addEventListener('click', () => CampaignManager.applyFilters());
    document.querySelectorAll('.quick-filter').forEach(btn => btn.addEventListener('click', () => CampaignManager.applyQuickFilter(btn.dataset.filter)));
    document.getElementById('campaign-generate-coupons')?.addEventListener('click', () => CampaignManager.generateCoupons());
    document.getElementById('campaign-export')?.addEventListener('click', () => CampaignManager.exportCSV());
    document.getElementById('campaign-whatsapp')?.addEventListener('click', () => CampaignManager.openBulkWhatsApp());
    document.getElementById('cancel-bulk-btn')?.addEventListener('click', () => document.getElementById('bulk-whatsapp-modal').classList.add('hidden'));
    document.getElementById('start-bulk-dispatch')?.addEventListener('click', () => CampaignManager.startBulkDispatch());
    document.getElementById('generate-ai-variations')?.addEventListener('click', () => CampaignManager.generateAIVariations());
}

function initCoupons() {
    document.getElementById('add-coupon-btn')?.addEventListener('click', () => { document.getElementById('coupon-form').reset(); document.getElementById('coupon-modal').classList.remove('hidden'); });
    document.getElementById('cancel-coupon-btn')?.addEventListener('click', () => document.getElementById('coupon-modal').classList.add('hidden'));
    document.getElementById('coupon-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        CouponManager.saveCoupon({
            code: document.getElementById('coupon-code').value,
            description: document.getElementById('coupon-description').value,
            type: document.getElementById('coupon-type').value,
            value: parseFloat(document.getElementById('coupon-value').value) || 0,
            expiry: document.getElementById('coupon-expiry').value,
            limit: parseInt(document.getElementById('coupon-limit').value) || null,
            rule: document.getElementById('coupon-rule').value
        });
        document.getElementById('coupon-modal').classList.add('hidden');
        showToast('Cupom cadastrado!', 'success');
    });
    CouponManager.updateUI();
}
