-- ============================================================================
-- FIX: Identificar e Corrigir Números Incorretos (@lid)
-- ============================================================================
-- JIDs @lid são IDs internos do Meta/Facebook, NÃO são telefones.
-- Este script identifica registros contaminados e limpa para re-sync.
-- ============================================================================

-- ============================
-- PASSO 1: DIAGNÓSTICO
-- ============================

-- Ver clientes com possíveis números inválidos
SELECT 
    id,
    name,
    phone,
    created_at,
    CASE 
        WHEN phone LIKE '516%' THEN '❌ ID Meta (516)'
        WHEN phone LIKE '326%' THEN '❌ ID Meta (326)'
        WHEN phone LIKE '327%' THEN '❌ ID Meta (327)'
        WHEN LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) > 11 
             AND phone NOT LIKE '55%' THEN '❌ Muito longo / DDI estranho'
        ELSE '✅ OK'
    END as status
FROM clients
WHERE phone IS NOT NULL
ORDER BY 
    CASE WHEN phone LIKE '516%' OR phone LIKE '326%' OR phone LIKE '327%' THEN 1 ELSE 3 END,
    created_at DESC
LIMIT 50;

-- ============================
-- PASSO 2: CONTAGEM DE AFETADOS
-- ============================

SELECT 
    COUNT(*) FILTER (WHERE phone LIKE '516%') as lid_516,
    COUNT(*) FILTER (WHERE phone LIKE '326%') as lid_326,
    COUNT(*) FILTER (WHERE phone LIKE '327%') as lid_327,
    COUNT(*) FILTER (WHERE LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) > 11 
                     AND phone NOT LIKE '55%') as muito_longo,
    COUNT(*) as total_clientes
FROM clients
WHERE phone IS NOT NULL;

-- ============================
-- PASSO 3: BACKUP ANTES DE LIMPAR
-- ============================

CREATE TABLE IF NOT EXISTS _backup_clients_lid AS
SELECT * FROM clients
WHERE phone LIKE '516%' 
   OR phone LIKE '326%' 
   OR phone LIKE '327%';

-- ============================
-- PASSO 4: LIMPAR (descomente para executar)
-- ============================

-- UPDATE clients
-- SET phone = NULL
-- WHERE phone LIKE '516%' 
--    OR phone LIKE '326%' 
--    OR phone LIKE '327%';

-- ============================
-- PASSO 5: Caso conheça o número real, atualizar manualmente
-- ============================

-- UPDATE clients
-- SET phone = '94984121802'
-- WHERE name ILIKE '%malaquias%';
