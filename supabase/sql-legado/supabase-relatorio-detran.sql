-- ================================================
-- CERTIVE VISTORIAS — Relatório DETRAN no Caixa (Migração)
-- Execute este SQL no SQL Editor do Supabase
-- ================================================

-- Nova coluna: armazena o relatório DETRAN em base64 (PDF ou imagem)
ALTER TABLE caixa_diario ADD COLUMN IF NOT EXISTS "relatorioDetran" TEXT;
