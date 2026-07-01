-- ====================================================================
-- CERTIVE VISTORIAS — ADICIONAR COLUNAS EM FALTA NO CONTAS A PAGAR
-- Execute este script no SQL Editor do painel do Supabase online.
-- ====================================================================

-- 1. Adicionar coluna 'categoria' na tabela 'contas_pagar'
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS categoria TEXT;

-- 2. Adicionar coluna 'fornecedor' na tabela 'contas_pagar'
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS fornecedor TEXT;
