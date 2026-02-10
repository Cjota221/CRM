-- ============================================================================
-- MIGRAÇÃO: Tabelas de Atendimento (Central de Atendimento → Supabase)
-- Execute no SQL Editor do Supabase Dashboard
-- Referência: supabase-sync.js syncAll/loadAll
-- ============================================================================

-- 1. Tags de etiquetas
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    trigger TEXT,                  -- ex: 'status:lead_quente', null = manual
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Associação chat ↔ tag (N:N)
CREATE TABLE IF NOT EXISTS chat_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chat_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_tags_chat ON chat_tags (chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_tags_tag ON chat_tags (tag_id);

-- 3. Mensagens rápidas (Quick Replies)
CREATE TABLE IF NOT EXISTS quick_replies (
    id SERIAL PRIMARY KEY,
    shortcut TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Notas de cliente (Post-it por chat)
CREATE TABLE IF NOT EXISTS client_notes (
    id TEXT PRIMARY KEY,              -- chat_id como chave
    text TEXT DEFAULT '',
    history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Chats adiados (Snooze)
CREATE TABLE IF NOT EXISTS snoozed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT UNIQUE NOT NULL,
    wake_at BIGINT NOT NULL,          -- timestamp em ms
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snoozed_wake ON snoozed (wake_at);

-- 6. Mensagens agendadas
CREATE TABLE IF NOT EXISTS scheduled (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    remote_jid TEXT,
    message TEXT NOT NULL,
    send_at BIGINT NOT NULL,          -- timestamp em ms
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_pending ON scheduled (send_at) WHERE sent = FALSE;

-- 7. Tags geradas por IA (por cliente)
CREATE TABLE IF NOT EXISTS ai_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT UNIQUE NOT NULL,
    tags JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Atribuições de cupons (cupom → cliente)
CREATE TABLE IF NOT EXISTS coupon_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id TEXT,
    client_id TEXT,
    client_phone TEXT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coupon_assignments_client ON coupon_assignments (client_id);

-- ============================================================================
-- RLS — Abrir acesso para service_role (mesmo padrão do ecosystem)
-- ============================================================================

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE snoozed ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_assignments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'tags','chat_tags','quick_replies','client_notes',
        'snoozed','scheduled','ai_tags','coupon_assignments'
    ]) LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS %I ON %I;
            CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);
        ', 'allow_all_' || t, t, 'allow_all_' || t, t);
    END LOOP;
END;
$$;

SELECT 'Migração concluída: 8 tabelas de atendimento criadas com RLS' as status;
