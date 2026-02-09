-- ===========================================================================
-- MIGRAÇÃO COMPLETA: localStorage → Supabase
-- Tabelas adicionais para persistir TODOS os dados do CRM
-- Execute no Supabase SQL Editor APÓS o supabase-auth.sql
-- ===========================================================================

-- 1. Tabela SETTINGS (configurações do sistema)
-- Já deve existir pelo syncAll, mas garantir estrutura
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'main',
    active_days INTEGER DEFAULT 30,
    risk_days INTEGER DEFAULT 60,
    groq_api_key TEXT DEFAULT '',
    evolution_url TEXT DEFAULT '',
    evolution_api_key TEXT DEFAULT '',
    instance_name TEXT DEFAULT '',
    facilzap_token TEXT DEFAULT '',
    site_base_url TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela TAGS (etiquetas de chat)
CREATE TABLE IF NOT EXISTS crm_tags (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    trigger TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela CHAT_TAGS (vínculo tag ↔ chat)
CREATE TABLE IF NOT EXISTS crm_chat_tags (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(chat_id, tag_id)
);

-- 4. Tabela QUICK_REPLIES (mensagens rápidas)
CREATE TABLE IF NOT EXISTS crm_quick_replies (
    id SERIAL PRIMARY KEY,
    shortcut TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela CLIENT_NOTES (notas por conversa)
CREATE TABLE IF NOT EXISTS crm_client_notes (
    id TEXT PRIMARY KEY, -- chatId como chave
    text TEXT DEFAULT '',
    history JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela SNOOZED_CHATS (chats adiados)
CREATE TABLE IF NOT EXISTS crm_snoozed (
    chat_id TEXT PRIMARY KEY,
    wake_at BIGINT NOT NULL, -- timestamp em ms
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Tabela SCHEDULED_MESSAGES (mensagens agendadas)
CREATE TABLE IF NOT EXISTS crm_scheduled (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    remote_jid TEXT NOT NULL,
    chat_name TEXT DEFAULT '',
    message TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela AI_TAGS (tags comportamentais da IA)
CREATE TABLE IF NOT EXISTS crm_ai_tags (
    client_id TEXT PRIMARY KEY,
    tags JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Tabela WEBHOOK_EVENTS (eventos recebidos)
CREATE TABLE IF NOT EXISTS crm_webhook_events (
    id TEXT PRIMARY KEY,
    type TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Tabela ABANDONED_CARTS (carrinhos abandonados)
CREATE TABLE IF NOT EXISTS crm_abandoned_carts (
    id TEXT PRIMARY KEY,
    data JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Tabela COUPON_ASSIGNMENTS (atribuição de cupons)
CREATE TABLE IF NOT EXISTS crm_coupon_assignments (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    client_name TEXT,
    coupon_code TEXT,
    assigned_at TEXT,
    used BOOLEAN DEFAULT false,
    used_at TEXT,
    order_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_chat_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_snoozed ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_scheduled ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_coupon_assignments ENABLE ROW LEVEL SECURITY;

-- Policies: apenas service_role (backend) pode acessar
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'settings', 'crm_tags', 'crm_chat_tags', 'crm_quick_replies',
        'crm_client_notes', 'crm_snoozed', 'crm_scheduled', 'crm_ai_tags',
        'crm_webhook_events', 'crm_abandoned_carts', 'crm_coupon_assignments'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%s" ON %I', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "service_role_all_%s" ON %I FOR ALL USING (auth.role() = ''service_role'')',
            tbl, tbl
        );
    END LOOP;
END $$;

-- Inserir settings padrão se não existir
INSERT INTO settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;
