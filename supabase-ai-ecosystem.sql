-- ============================================================================
-- VEXX AI ECOSYSTEM - Schema Completo (7 Camadas)
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================================

-- ============================================================================
-- CAMADA 1: INTEGRAÇÃO & WEBHOOKS (Eventos Brutos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS eventos_brutos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL,                -- mensagem_texto, mensagem_audio, status_leitura, etc
    origem JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {numero, nome, plataforma, sessao_id}
    conteudo JSONB NOT NULL DEFAULT '{}'::jsonb, -- {texto, audio_url, imagem_url, metadata}
    contexto JSONB NOT NULL DEFAULT '{}'::jsonb, -- {timestamp, mensagem_id, em_resposta_a}
    processado BOOLEAN DEFAULT FALSE,
    agente_designado TEXT,             -- anne, expansion, finance, suporte
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_origem_numero ON eventos_brutos ((origem->>'numero'));
CREATE INDEX IF NOT EXISTS idx_eventos_processado ON eventos_brutos (processado, created_at);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos_brutos (tipo, created_at DESC);

-- ============================================================================
-- CAMADA 2: ORQUESTRADOR & MEMÓRIA
-- ============================================================================

-- Sessões ativas (memória de curto prazo)
CREATE TABLE IF NOT EXISTS sessoes_ativas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_telefone TEXT NOT NULL,
    cliente_nome TEXT,
    iniciada_em TIMESTAMPTZ DEFAULT NOW(),
    ultima_atividade TIMESTAMPTZ DEFAULT NOW(),
    mensagens JSONB DEFAULT '[]'::jsonb,       -- [{role, content, timestamp, metadata}]
    contexto_ativo JSONB DEFAULT '{}'::jsonb,   -- {produtos_em_discussao, carrinho_temp, duvidas}
    agente_atual TEXT DEFAULT 'anne',
    status TEXT DEFAULT 'ativa',                -- ativa, pausada, encerrada, escalada
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessoes_telefone_ativa 
    ON sessoes_ativas (cliente_telefone) WHERE status = 'ativa';
CREATE INDEX IF NOT EXISTS idx_sessoes_ultima_atividade ON sessoes_ativas (ultima_atividade DESC);

-- Histórico de conversas (memória de médio prazo — 90 dias)
CREATE TABLE IF NOT EXISTS conversas_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_telefone TEXT NOT NULL,
    cliente_nome TEXT,
    data_inicio TIMESTAMPTZ,
    data_fim TIMESTAMPTZ,
    resumo_ia TEXT,                    -- Gerado automaticamente ao encerrar
    intencoes TEXT[] DEFAULT '{}',
    resultado TEXT,                    -- venda_fechada, negociacao, duvida_resolvida, abandono, escalado
    agente_responsavel TEXT,
    mensagens_completas JSONB,         -- Backup completo da conversa
    feedback_nota INTEGER,             -- 1-5
    feedback_texto TEXT,
    feedback_solicitado_em TIMESTAMPTZ,
    ferramentas_usadas TEXT[] DEFAULT '{}',
    metricas JSONB DEFAULT '{}'::jsonb, -- {tokens_usados, tempo_resposta_medio, mensagens_total}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversas_cliente ON conversas_historico (cliente_telefone, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_resultado ON conversas_historico (resultado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_agente ON conversas_historico (agente_responsavel, created_at DESC);

-- Perfil do cliente enriquecido por IA (memória de longo prazo)
CREATE TABLE IF NOT EXISTS clientes_perfil (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone TEXT UNIQUE NOT NULL,
    nome TEXT,
    email TEXT,
    cpf TEXT,
    cidade TEXT,
    estado TEXT,
    
    -- Tags e classificação
    tags TEXT[] DEFAULT '{}',          -- VIP, Grade Fechada, Pagador Pontual, etc
    tier TEXT DEFAULT 'bronze',        -- diamante, ouro, prata, bronze
    segmento TEXT,                     -- atacado, varejo, franquia, lead
    
    -- Preferências (aprendidas pela IA)
    preferencias JSONB DEFAULT '{}'::jsonb,  -- {modelos_favoritos, cores, tamanhos, horario_contato}
    
    -- Métricas comerciais
    ticket_medio DECIMAL(10,2) DEFAULT 0,
    total_gasto DECIMAL(10,2) DEFAULT 0,
    total_pedidos INTEGER DEFAULT 0,
    ultima_compra TIMESTAMPTZ,
    frequencia_compra_dias INTEGER,
    inadimplente BOOLEAN DEFAULT FALSE,
    
    -- Métricas de relacionamento
    nivel_engajamento TEXT DEFAULT 'medio',  -- alto, medio, baixo
    nps_score INTEGER,
    total_reclamacoes INTEGER DEFAULT 0,
    total_elogios INTEGER DEFAULT 0,
    total_conversas INTEGER DEFAULT 0,
    
    -- Controle
    ultima_interacao TIMESTAMPTZ,
    ultima_reativacao TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perfil_telefone ON clientes_perfil (telefone);
CREATE INDEX IF NOT EXISTS idx_perfil_tier ON clientes_perfil (tier);
CREATE INDEX IF NOT EXISTS idx_perfil_ultima_compra ON clientes_perfil (ultima_compra);
CREATE INDEX IF NOT EXISTS idx_perfil_engajamento ON clientes_perfil (nivel_engajamento, ultima_interacao);

-- Classificações de intenção (log do orquestrador)
CREATE TABLE IF NOT EXISTS classificacoes_intencao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID REFERENCES eventos_brutos(id),
    sessao_id UUID REFERENCES sessoes_ativas(id),
    dominio_primario TEXT NOT NULL,     -- vendas_atacado, c4_franquias, crm_financeiro, suporte, relacionamento
    sub_intencao TEXT,
    confianca INTEGER DEFAULT 0,       -- 0-100
    urgencia TEXT DEFAULT 'media',     -- baixa, media, alta, critica
    sentimento TEXT DEFAULT 'neutro',  -- positivo, neutro, negativo, frustrado
    etapa_funil TEXT,                  -- descoberta, consideracao, decisao, pos_venda
    produtos_mencionados TEXT[] DEFAULT '{}',
    agente_designado TEXT,
    acoes_sugeridas JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classificacoes_dominio ON classificacoes_intencao (dominio_primario, created_at DESC);

-- ============================================================================
-- CAMADA 4: AGENTES ESPECIALISTAS
-- ============================================================================

-- Configuração dos agentes (editável via painel low-code)
CREATE TABLE IF NOT EXISTS agentes_config (
    id TEXT PRIMARY KEY,               -- anne, expansion, finance, suporte
    nome TEXT NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    
    -- System Prompt versionado
    system_prompt TEXT NOT NULL,
    system_prompt_versao INTEGER DEFAULT 1,
    system_prompt_historico JSONB DEFAULT '[]'::jsonb,
    
    -- Ferramentas habilitadas
    ferramentas JSONB DEFAULT '[]'::jsonb,  -- [{name, ativo, permissoes}]
    
    -- Personalidade
    tom TEXT DEFAULT 'amigavel',       -- profissional, amigavel, consultivo, agressivo
    uso_emojis TEXT DEFAULT 'moderado',-- nenhum, moderado, frequente
    tamanho_resposta TEXT DEFAULT 'medio', -- conciso, medio, detalhado
    
    -- Limites
    max_mensagens_conversa INTEGER DEFAULT 50,
    timeout_inatividade_min INTEGER DEFAULT 30,
    escalar_apos_tentativas INTEGER DEFAULT 3,
    
    -- Métricas
    total_conversas INTEGER DEFAULT 0,
    total_vendas INTEGER DEFAULT 0,
    receita_gerada DECIMAL(12,2) DEFAULT 0,
    nota_media DECIMAL(3,2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de execução de ferramentas dos agentes
CREATE TABLE IF NOT EXISTS agentes_tool_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id UUID REFERENCES sessoes_ativas(id),
    agente_id TEXT REFERENCES agentes_config(id),
    ferramenta TEXT NOT NULL,
    parametros JSONB DEFAULT '{}'::jsonb,
    resultado JSONB DEFAULT '{}'::jsonb,
    sucesso BOOLEAN DEFAULT TRUE,
    tempo_execucao_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_log_agente ON agentes_tool_log (agente_id, created_at DESC);

-- ============================================================================
-- CAMADA 5: AUTOMAÇÕES & GATILHOS
-- ============================================================================

-- Carrinhos abandonados (aprimorado — substituirá abandoned_carts antigo)
CREATE TABLE IF NOT EXISTS carrinhos_abandonados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_telefone TEXT,
    cliente_nome TEXT,
    cliente_email TEXT,
    valor_total DECIMAL(10,2) DEFAULT 0,
    itens JSONB DEFAULT '[]'::jsonb,
    link_checkout TEXT,
    abandonado_em TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ondas de recuperação
    onda1_enviada_em TIMESTAMPTZ,
    onda2_enviada_em TIMESTAMPTZ,
    onda3_enviada_em TIMESTAMPTZ,
    cupom_gerado TEXT,
    
    -- Resultado
    convertido BOOLEAN DEFAULT FALSE,
    convertido_em TIMESTAMPTZ,
    pedido_id TEXT,
    status TEXT DEFAULT 'abandonado',  -- abandonado, recuperando, convertido, perdido
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrinhos_status ON carrinhos_abandonados (status, abandonado_em);
CREATE INDEX IF NOT EXISTS idx_carrinhos_telefone ON carrinhos_abandonados (cliente_telefone);

-- Sistema de cupons IA (aprimorado)
CREATE TABLE IF NOT EXISTS cupons_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'percentual', -- percentual, valor_fixo, frete_gratis
    valor DECIMAL(10,2) NOT NULL,
    
    -- Regras
    valor_minimo_pedido DECIMAL(10,2),
    modelos_especificos TEXT[],
    clientes_especificos TEXT[],       -- telefones
    
    -- Validade
    valido_de TIMESTAMPTZ DEFAULT NOW(),
    valido_ate TIMESTAMPTZ,
    uso_maximo INTEGER DEFAULT 1,
    uso_maximo_por_cliente INTEGER DEFAULT 1,
    
    -- Controle
    usos_totais INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    criado_por TEXT DEFAULT 'ia',      -- ia, humano, campanha, automacao
    motivo TEXT,                        -- ex: "objecao_preco", "reativacao", "carrinho_abandonado"
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cupons_usos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cupom_id UUID REFERENCES cupons_ia(id),
    cliente_telefone TEXT,
    pedido_id TEXT,
    desconto_aplicado DECIMAL(10,2),
    usado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cupons_codigo ON cupons_ia (codigo);
CREATE INDEX IF NOT EXISTS idx_cupons_ativo ON cupons_ia (ativo, valido_ate);

-- Reativações disparadas
CREATE TABLE IF NOT EXISTS reativacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_telefone TEXT NOT NULL,
    segmento TEXT,                     -- vip_dormindo, fiel_sumida, comprador_unico
    estrategia TEXT,
    mensagem_enviada TEXT,
    resultado TEXT,                    -- respondeu, comprou, ignorou, bloqueou
    disparado_em TIMESTAMPTZ DEFAULT NOW(),
    respondido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reativacoes_cliente ON reativacoes (cliente_telefone, disparado_em DESC);

-- Automações genéricas (scheduler)
CREATE TABLE IF NOT EXISTS automacoes_agendadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL,                -- carrinho_onda1, carrinho_onda2, reativacao, followup
    referencia_id TEXT,                -- ID do carrinho, cliente, etc
    cliente_telefone TEXT,
    executar_em TIMESTAMPTZ NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    executada BOOLEAN DEFAULT FALSE,
    executada_em TIMESTAMPTZ,
    resultado JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automacoes_pendentes 
    ON automacoes_agendadas (executar_em) WHERE executada = FALSE;

-- ============================================================================
-- CAMADA 6: ANALYTICS & APRENDIZADO
-- ============================================================================

-- Métricas diárias dos agentes
CREATE TABLE IF NOT EXISTS metricas_agentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agente_id TEXT REFERENCES agentes_config(id),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Conversas
    conversas_total INTEGER DEFAULT 0,
    conversas_sucesso INTEGER DEFAULT 0,
    conversas_escaladas INTEGER DEFAULT 0,
    conversas_abandonadas INTEGER DEFAULT 0,
    
    -- Conversão
    leads_recebidos INTEGER DEFAULT 0,
    vendas_fechadas INTEGER DEFAULT 0,
    taxa_conversao DECIMAL(5,2) DEFAULT 0,
    receita_gerada DECIMAL(12,2) DEFAULT 0,
    ticket_medio DECIMAL(10,2) DEFAULT 0,
    
    -- Qualidade
    tempo_resposta_medio_ms INTEGER DEFAULT 0,
    mensagens_por_conversa DECIMAL(5,1) DEFAULT 0,
    satisfacao_media DECIMAL(3,2) DEFAULT 0,
    
    -- Ferramentas
    ferramentas_usadas JSONB DEFAULT '{}'::jsonb,  -- {tool_name: {usos, sucesso}}
    
    UNIQUE(agente_id, data)
);

CREATE INDEX IF NOT EXISTS idx_metricas_agente_data ON metricas_agentes (agente_id, data DESC);

-- Insights gerados pela IA (aprendizado)
CREATE TABLE IF NOT EXISTS insights_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL,                -- analise_feedback, padrao_falha, oportunidade, alerta
    periodo TEXT,
    conteudo JSONB NOT NULL,
    prioridade TEXT DEFAULT 'media',
    lido BOOLEAN DEFAULT FALSE,
    acao_tomada TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_tipo ON insights_ia (tipo, created_at DESC);

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

-- Buscar ou criar sessão ativa para um telefone
CREATE OR REPLACE FUNCTION get_or_create_session(p_telefone TEXT, p_nome TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_sessao_id UUID;
BEGIN
    -- Tentar encontrar sessão ativa
    SELECT id INTO v_sessao_id
    FROM sessoes_ativas
    WHERE cliente_telefone = p_telefone AND status = 'ativa'
    LIMIT 1;
    
    -- Se não existe, criar nova
    IF v_sessao_id IS NULL THEN
        INSERT INTO sessoes_ativas (cliente_telefone, cliente_nome)
        VALUES (p_telefone, p_nome)
        RETURNING id INTO v_sessao_id;
    ELSE
        -- Atualizar última atividade
        UPDATE sessoes_ativas 
        SET ultima_atividade = NOW(),
            cliente_nome = COALESCE(p_nome, cliente_nome)
        WHERE id = v_sessao_id;
    END IF;
    
    RETURN v_sessao_id;
END;
$$ LANGUAGE plpgsql;

-- Encerrar sessão e gerar histórico
CREATE OR REPLACE FUNCTION encerrar_sessao(p_sessao_id UUID, p_resumo TEXT, p_resultado TEXT)
RETURNS UUID AS $$
DECLARE
    v_historico_id UUID;
    v_sessao RECORD;
BEGIN
    SELECT * INTO v_sessao FROM sessoes_ativas WHERE id = p_sessao_id;
    
    IF v_sessao IS NULL THEN RETURN NULL; END IF;
    
    -- Criar registro no histórico
    INSERT INTO conversas_historico (
        cliente_telefone, cliente_nome, data_inicio, data_fim,
        resumo_ia, resultado, agente_responsavel, mensagens_completas
    ) VALUES (
        v_sessao.cliente_telefone, v_sessao.cliente_nome,
        v_sessao.iniciada_em, NOW(), p_resumo, p_resultado,
        v_sessao.agente_atual, v_sessao.mensagens
    ) RETURNING id INTO v_historico_id;
    
    -- Marcar sessão como encerrada
    UPDATE sessoes_ativas SET status = 'encerrada' WHERE id = p_sessao_id;
    
    -- Atualizar perfil do cliente
    UPDATE clientes_perfil 
    SET total_conversas = total_conversas + 1,
        ultima_interacao = NOW(),
        updated_at = NOW()
    WHERE telefone = v_sessao.cliente_telefone;
    
    RETURN v_historico_id;
END;
$$ LANGUAGE plpgsql;

-- Calcular métricas de um agente
CREATE OR REPLACE FUNCTION calcular_metricas_agente(p_agente TEXT, p_dias INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
    resultado JSON;
BEGIN
    SELECT json_build_object(
        'conversas', (
            SELECT json_build_object(
                'total', COUNT(*),
                'finalizadas_sucesso', COUNT(*) FILTER (WHERE resultado = 'venda_fechada'),
                'escaladas', COUNT(*) FILTER (WHERE resultado = 'escalado'),
                'abandonadas', COUNT(*) FILTER (WHERE resultado = 'abandono')
            )
            FROM conversas_historico
            WHERE agente_responsavel = p_agente
              AND data_inicio > NOW() - (p_dias || ' days')::INTERVAL
        ),
        'qualidade', (
            SELECT json_build_object(
                'satisfacao_media', COALESCE(AVG(feedback_nota), 0),
                'feedbacks_recebidos', COUNT(feedback_nota),
                'feedbacks_negativos', COUNT(*) FILTER (WHERE feedback_nota <= 2)
            )
            FROM conversas_historico
            WHERE agente_responsavel = p_agente
              AND data_inicio > NOW() - (p_dias || ' days')::INTERVAL
              AND feedback_nota IS NOT NULL
        ),
        'ferramentas', (
            SELECT json_agg(json_build_object(
                'ferramenta', ferramenta,
                'usos', COUNT(*),
                'sucesso', COUNT(*) FILTER (WHERE sucesso = TRUE)
            ))
            FROM agentes_tool_log
            WHERE agente_id = p_agente
              AND created_at > NOW() - (p_dias || ' days')::INTERVAL
            GROUP BY ferramenta
        ),
        'periodo_dias', p_dias
    ) INTO resultado;
    
    RETURN resultado;
END;
$$ LANGUAGE plpgsql;

-- Buscar histórico completo de um cliente para contexto da IA
CREATE OR REPLACE FUNCTION get_client_ai_context(p_telefone TEXT)
RETURNS JSON AS $$
DECLARE
    v_perfil JSON;
    v_conversas JSON;
    v_sessao JSON;
BEGIN
    -- Perfil
    SELECT row_to_json(cp) INTO v_perfil
    FROM clientes_perfil cp WHERE cp.telefone = p_telefone;
    
    -- Últimas 5 conversas
    SELECT json_agg(sub) INTO v_conversas FROM (
        SELECT id, data_inicio, data_fim, resumo_ia, resultado, agente_responsavel, feedback_nota
        FROM conversas_historico
        WHERE cliente_telefone = p_telefone
        ORDER BY data_inicio DESC
        LIMIT 5
    ) sub;
    
    -- Sessão ativa (se houver)
    SELECT row_to_json(sa) INTO v_sessao
    FROM sessoes_ativas sa
    WHERE sa.cliente_telefone = p_telefone AND sa.status = 'ativa';
    
    RETURN json_build_object(
        'perfil', v_perfil,
        'conversas_recentes', COALESCE(v_conversas, '[]'::json),
        'sessao_ativa', v_sessao,
        'telefone', p_telefone
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Atualizar updated_at em clientes_perfil
CREATE OR REPLACE FUNCTION update_perfil_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_perfil_updated_at ON clientes_perfil;
CREATE TRIGGER trigger_perfil_updated_at
    BEFORE UPDATE ON clientes_perfil
    FOR EACH ROW EXECUTE FUNCTION update_perfil_updated_at();

-- Atualizar updated_at em agentes_config
DROP TRIGGER IF EXISTS trigger_agentes_updated_at ON agentes_config;
CREATE TRIGGER trigger_agentes_updated_at
    BEFORE UPDATE ON agentes_config
    FOR EACH ROW EXECUTE FUNCTION update_perfil_updated_at();

-- ============================================================================
-- DADOS INICIAIS - CONFIGURAÇÃO DOS AGENTES
-- ============================================================================

INSERT INTO agentes_config (id, nome, descricao, system_prompt, ferramentas, tom, uso_emojis)
VALUES 
(
    'anne',
    'Anne - Vendas Atacado',
    'Consultora comercial sênior da CJ Rasteirinhas, especialista em atacado B2B',
    'Carregado via código (ver ai-orchestrator.js)',
    '[
        {"name": "consultar_estoque", "ativo": true, "descricao": "Verifica disponibilidade de modelo/cor/tamanho"},
        {"name": "calcular_grade", "ativo": true, "descricao": "Monta grade personalizada e calcula preço"},
        {"name": "gerar_link_pagamento", "ativo": true, "descricao": "Cria link PIX/boleto para pedido"},
        {"name": "reservar_estoque", "ativo": true, "descricao": "Bloqueia estoque por 24h"},
        {"name": "aplicar_cupom", "ativo": true, "descricao": "Valida e aplica cupom de desconto"},
        {"name": "buscar_historico_cliente", "ativo": true, "descricao": "Consulta perfil e compras do cliente"},
        {"name": "enviar_catalogo", "ativo": true, "descricao": "Envia fotos de modelos disponíveis"}
    ]'::jsonb,
    'amigavel',
    'moderado'
),
(
    'expansion',
    'Expansion - C4 Franquias',
    'Mentora de negócios focada em empoderamento e recrutamento de franqueadas',
    'Carregado via código (ver ai-orchestrator.js)',
    '[
        {"name": "calcular_roi_franquia", "ativo": true, "descricao": "Calcula lucro estimado por modelo de franquia"},
        {"name": "buscar_case_similar", "ativo": true, "descricao": "Encontra case de sucesso com perfil parecido"},
        {"name": "gerar_contrato", "ativo": true, "descricao": "Cria contrato digital para assinatura"},
        {"name": "agendar_mentoria", "ativo": true, "descricao": "Agenda sessão de mentoria"}
    ]'::jsonb,
    'consultivo',
    'moderado'
),
(
    'finance',
    'Finance - CRM & Financeiro',
    'Assistente de suporte financeiro, pedidos, rastreamento e pagamentos',
    'Carregado via código (ver ai-orchestrator.js)',
    '[
        {"name": "consultar_pedido", "ativo": true, "descricao": "Busca pedido por ID, CPF ou telefone"},
        {"name": "validar_comprovante", "ativo": true, "descricao": "Analisa imagem de comprovante PIX/boleto"},
        {"name": "gerar_segunda_via", "ativo": true, "descricao": "Emite nova via de boleto ou QR PIX"},
        {"name": "rastrear_envio", "ativo": true, "descricao": "Consulta status de rastreio dos Correios"}
    ]'::jsonb,
    'profissional',
    'nenhum'
)
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    ferramentas = EXCLUDED.ferramentas,
    updated_at = NOW();

-- ============================================================================
-- RLS Policies (serviço pode acessar tudo)
-- ============================================================================

ALTER TABLE eventos_brutos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_ativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE classificacoes_intencao ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentes_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentes_tool_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrinhos_abandonados ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupons_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupons_usos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reativacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE automacoes_agendadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE metricas_agentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights_ia ENABLE ROW LEVEL SECURITY;

-- Policy para service_role ter acesso total
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'eventos_brutos','sessoes_ativas','conversas_historico','clientes_perfil',
        'classificacoes_intencao','agentes_config','agentes_tool_log',
        'carrinhos_abandonados','cupons_ia','cupons_usos','reativacoes',
        'automacoes_agendadas','metricas_agentes','insights_ia'
    ]) LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS %I ON %I;
            CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);
        ', 'allow_all_' || t, t, 'allow_all_' || t, t);
    END LOOP;
END;
$$;

SELECT 'VEXX AI Ecosystem - Schema criado com sucesso! 14 tabelas, 4 RPCs, triggers.' as status;
