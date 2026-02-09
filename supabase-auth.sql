-- ===========================================================================
-- TABELA DE USUÁRIOS DO CRM (crm_users)
-- Execute este SQL no Supabase SQL Editor
-- ===========================================================================

CREATE TABLE IF NOT EXISTS crm_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;

-- Policy: apenas service_role pode ler/escrever (sem acesso público)
CREATE POLICY "Service role only" ON crm_users
    FOR ALL USING (auth.role() = 'service_role');

-- Inserir usuário administrador
-- Email: Carolineazevedo075@gmail.com | Senha: Cjota@015
INSERT INTO crm_users (email, name, password_hash, salt, active)
VALUES (
    'carolineazevedo075@gmail.com',
    'Caroline Azevedo',
    '3f8c1617dce09ffe2ef4154a536c0105546bb069a0d25904e36e3b0b04b9faf7',
    'M4J02atfvUYs3FGq',
    true
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    salt = EXCLUDED.salt,
    updated_at = now();
