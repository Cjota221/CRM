-- ============================================================================
-- MIGRATION: Sistema de Identidade Unificada + Performance
-- Adiciona phone_normalized, índices de performance, campaigns_blocks
-- ============================================================================

-- ============================================================================
-- 1. COLUNA phone_normalized em clients (identidade canônica)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'phone_normalized'
    ) THEN
        ALTER TABLE clients ADD COLUMN phone_normalized TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'needs_review'
    ) THEN
        ALTER TABLE clients ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Preencher phone_normalized para registros existentes (DDD + 8 dígitos, sem 9º)
UPDATE clients SET phone_normalized = 
    CASE
        -- Se phone tem 13+ chars (com DDI 55): extrair DDD+8
        WHEN LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) >= 12
        THEN SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 3 FOR 2) ||
             SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 6)
        -- Se phone tem 11 chars (DDD + 9 + 8): remover 9º dígito
        WHEN LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) = 11
        THEN SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 1 FOR 2) ||
             SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 4)
        -- Se phone tem 10 chars (DDD + 8): já está correto
        WHEN LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) = 10
        THEN REGEXP_REPLACE(phone, '\D', '', 'g')
        -- Fallback: últimos 10 dígitos
        ELSE RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10)
    END
WHERE phone IS NOT NULL AND phone_normalized IS NULL;

-- Índice único para evitar duplicatas futuras
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_normalized 
    ON clients(phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_normalized != '';

-- Índice para busca rápida (cobrirá WHERE + ORDER BY)
CREATE INDEX IF NOT EXISTS idx_clients_phone_norm_lookup 
    ON clients(phone_normalized, id, name) WHERE phone_normalized IS NOT NULL;

-- ============================================================================
-- 2. COLUNA phone_normalized em clientes_perfil (se existir)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clientes_perfil') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'clientes_perfil' AND column_name = 'phone_normalized'
        ) THEN
            ALTER TABLE clientes_perfil ADD COLUMN phone_normalized TEXT;
        END IF;

        UPDATE clientes_perfil SET phone_normalized = 
            CASE
                WHEN LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) >= 12
                THEN SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 3 FOR 2) ||
                     SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 6)
                WHEN LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) = 11
                THEN SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 1 FOR 2) ||
                     SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 4)
                WHEN LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) = 10
                THEN REGEXP_REPLACE(telefone, '\D', '', 'g')
                ELSE RIGHT(REGEXP_REPLACE(telefone, '\D', '', 'g'), 10)
            END
        WHERE telefone IS NOT NULL AND phone_normalized IS NULL;

        CREATE INDEX IF NOT EXISTS idx_perfil_phone_normalized
            ON clientes_perfil(phone_normalized) WHERE phone_normalized IS NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- 3. phone_normalized em clientes_tags
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clientes_tags') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'clientes_tags' AND column_name = 'phone_normalized'
        ) THEN
            ALTER TABLE clientes_tags ADD COLUMN phone_normalized TEXT;
        END IF;

        UPDATE clientes_tags SET phone_normalized = 
            CASE
                WHEN LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) >= 12
                THEN SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 3 FOR 2) ||
                     SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 6)
                WHEN LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) = 11
                THEN SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 1 FOR 2) ||
                     SUBSTRING(REGEXP_REPLACE(telefone, '\D', '', 'g') FROM 4)
                ELSE RIGHT(REGEXP_REPLACE(telefone, '\D', '', 'g'), 10)
            END
        WHERE telefone IS NOT NULL AND phone_normalized IS NULL;

        CREATE INDEX IF NOT EXISTS idx_tags_phone_normalized
            ON clientes_tags(phone_normalized) WHERE phone_normalized IS NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- 4. RPC: Buscar cliente por phone_normalized (com variações do 9º dígito)
-- ============================================================================
CREATE OR REPLACE FUNCTION find_client_by_phone(p_raw_phone TEXT)
RETURNS TABLE(id UUID, name TEXT, phone TEXT, phone_normalized TEXT, email TEXT, needs_review BOOLEAN) AS $$
DECLARE
    v_clean TEXT;
    v_canonical TEXT;
BEGIN
    -- Limpar: só dígitos
    v_clean := REGEXP_REPLACE(p_raw_phone, '\D', '', 'g');
    -- Remover DDI 55
    IF LENGTH(v_clean) >= 12 AND v_clean LIKE '55%' THEN
        v_clean := SUBSTRING(v_clean FROM 3);
    END IF;
    -- Canonical: remover 9º dígito se 11 dígitos
    IF LENGTH(v_clean) = 11 AND SUBSTRING(v_clean, 3, 1) = '9' THEN
        v_canonical := SUBSTRING(v_clean, 1, 2) || SUBSTRING(v_clean, 4);
    ELSE
        v_canonical := v_clean;
    END IF;

    RETURN QUERY
    SELECT c.id, c.name, c.phone, c.phone_normalized, c.email, COALESCE(c.needs_review, FALSE)
    FROM clients c
    WHERE c.phone_normalized = v_canonical
       OR c.phone_normalized = v_clean
       OR RIGHT(REGEXP_REPLACE(c.phone, '\D', '', 'g'), 8) = RIGHT(v_clean, 8)
    ORDER BY 
        CASE WHEN c.phone_normalized = v_canonical THEN 0 ELSE 1 END,
        c.id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TABELA: campaign_blocks (persistir sequências de blocos de campanhas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    block_index INTEGER NOT NULL,
    block_type TEXT NOT NULL, -- 'text', 'image', 'audio', 'poll', 'sticker', 'delay', 'presence'
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, block_index)
);

CREATE INDEX IF NOT EXISTS idx_campaign_blocks_campaign ON campaign_blocks(campaign_id);

-- ============================================================================
-- 6. ÍNDICES DE PERFORMANCE para queries frequentes
-- ============================================================================
-- Orders: usar em segmentação (client_id + data)
CREATE INDEX IF NOT EXISTS idx_orders_client_date ON orders(client_id, data DESC);
-- Orders: status para filtragem
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
-- Chats recentes (se existir tabela chats)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chats') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC)';
    END IF;
END $$;

-- ============================================================================
-- 7. RPC: Detectar e marcar duplicatas de clientes
-- ============================================================================
CREATE OR REPLACE FUNCTION detect_duplicate_clients()
RETURNS TABLE(phone_normalized TEXT, duplicate_count BIGINT, client_ids UUID[]) AS $$
BEGIN
    RETURN QUERY
    SELECT c.phone_normalized, COUNT(*) as dup_count, ARRAY_AGG(c.id ORDER BY c.id) as ids
    FROM clients c
    WHERE c.phone_normalized IS NOT NULL AND c.phone_normalized != ''
    GROUP BY c.phone_normalized
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Função para merge de clientes duplicados
-- ============================================================================
CREATE OR REPLACE FUNCTION merge_duplicate_clients(p_keep_id UUID, p_remove_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Reatribuir orders do removido para o mantido
    UPDATE orders SET client_id = p_keep_id WHERE client_id = p_remove_id;
    -- Reatribuir tags
    UPDATE clientes_tags SET telefone = (SELECT phone FROM clients WHERE id = p_keep_id)
        WHERE telefone = (SELECT phone FROM clients WHERE id = p_remove_id);
    -- Remover o duplicado
    DELETE FROM clients WHERE id = p_remove_id;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
