-- ============================================================================
-- VEXX 2.0 — Migration: Central de Operações
-- Módulo 1: Segmentação & Auto-Tagging
-- Módulo 2: Rastreio Logístico
-- Módulo 6: Alertas de Status de Pedido
-- ============================================================================

-- ============================================================================
-- TABELA: clientes_tags (tags de segmentação IA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clientes_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    telefone TEXT NOT NULL,
    tag TEXT NOT NULL,
    origem TEXT DEFAULT 'manual', -- 'ia', 'manual', 'webhook', 'campanha', 'anuncio', 'bio_link'
    confianca INTEGER DEFAULT 100, -- 0-100 (IA pode ter confiança variável)
    criado_por TEXT DEFAULT 'sistema', -- 'ia_anne', 'manual_operador', 'webhook', etc.
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    expira_em TIMESTAMPTZ, -- Tags temporárias (ex: "Lead Quente" expira em 7 dias)
    metadata JSONB DEFAULT '{}', -- Dados extras (utm_source, utm_campaign, etc.)
    UNIQUE(telefone, tag)
);

CREATE INDEX IF NOT EXISTS idx_clientes_tags_telefone ON clientes_tags(telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_tags_tag ON clientes_tags(tag);
CREATE INDEX IF NOT EXISTS idx_clientes_tags_origem ON clientes_tags(origem);

-- ============================================================================
-- TABELA: tracking_events (eventos de rastreio de pedidos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tracking_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT REFERENCES orders(id),
    tracking_code TEXT,
    status TEXT NOT NULL, -- 'aprovado', 'separacao', 'postado', 'transito', 'entregue'
    status_anterior TEXT,
    descricao TEXT,
    notificado BOOLEAN DEFAULT FALSE,
    notificado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_code ON tracking_events(tracking_code);
CREATE INDEX IF NOT EXISTS idx_tracking_order ON tracking_events(order_id);

-- ============================================================================
-- Adicionar coluna tracking_code à tabela orders (se não existir)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_code'
    ) THEN
        ALTER TABLE orders ADD COLUMN tracking_code TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_url'
    ) THEN
        ALTER TABLE orders ADD COLUMN tracking_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'status_updated_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN status_updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- TABELA: media_library (biblioteca de mídias para campanhas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_library (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL, -- 'image', 'audio', 'sticker', 'video', 'document'
    url TEXT, -- URL pública (CDN/storage)
    base64 TEXT, -- Base64 para áudios/stickers pequenos
    mimetype TEXT,
    tamanho_bytes INTEGER,
    tags TEXT[] DEFAULT '{}',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    usado_em TIMESTAMPTZ, -- Última vez que foi usado em campanha
    uso_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_media_library_tipo ON media_library(tipo);

-- ============================================================================
-- RPC: Buscar tags de um cliente
-- ============================================================================
CREATE OR REPLACE FUNCTION get_client_tags(p_telefone TEXT)
RETURNS TABLE(tag TEXT, origem TEXT, confianca INTEGER, criado_em TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT ct.tag, ct.origem, ct.confianca, ct.criado_em
    FROM clientes_tags ct
    WHERE ct.telefone = p_telefone
      AND (ct.expira_em IS NULL OR ct.expira_em > NOW())
    ORDER BY ct.criado_em DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RPC: Buscar último rastreio por telefone
-- ============================================================================
CREATE OR REPLACE FUNCTION get_tracking_by_phone(p_telefone TEXT)
RETURNS TABLE(
    order_id UUID, codigo TEXT, total NUMERIC, status TEXT, 
    tracking_code TEXT, tracking_url TEXT, data TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.codigo, o.total, o.status, 
           o.tracking_code, o.tracking_url, o.data
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    WHERE c.phone LIKE '%' || RIGHT(p_telefone, 11)
       OR c.phone LIKE '%' || RIGHT(p_telefone, 9)
    ORDER BY o.data DESC
    LIMIT 3;
END;
$$ LANGUAGE plpgsql;
