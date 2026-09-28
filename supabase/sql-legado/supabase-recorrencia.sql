-- ================================================
-- CERTIVE VISTORIAS — Contas Recorrentes (Migração)
-- Execute este SQL no SQL Editor do Supabase
-- ================================================

-- 1. Nova coluna: flag de recorrência
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Nova coluna: frequência da recorrência
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS frequencia TEXT CHECK (frequencia IN ('semanal', 'mensal', 'anual'));

-- 3. Nova coluna: ID do grupo de recorrência (aponta para a primeira conta da série)
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "recorrenciaGrupoId" BIGINT;

-- 4. Index para buscar todas as contas de um grupo
CREATE INDEX IF NOT EXISTS idx_contas_recorrencia ON contas_pagar("recorrenciaGrupoId");
