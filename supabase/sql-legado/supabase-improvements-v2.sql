-- ================================================
-- CERTIVE VISTORIAS — Schema Improvements V2
-- Execute este SQL no SQL Editor do Supabase
-- APÓS o schema original estar rodando
-- ================================================

ALTER TABLE ordens_servico 
ADD COLUMN IF NOT EXISTS "veiculoChassi" TEXT,
ADD COLUMN IF NOT EXISTS "veiculoMarcaModelo" TEXT,
ADD COLUMN IF NOT EXISTS "veiculoAno" TEXT,
ADD COLUMN IF NOT EXISTS "clienteEndereco" TEXT,
ADD COLUMN IF NOT EXISTS "osFinalidade" TEXT,
ADD COLUMN IF NOT EXISTS parcelas INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS "statusNfse" TEXT DEFAULT 'Não solicitada',
ADD COLUMN IF NOT EXISTS "contratoTexto" TEXT,
ADD COLUMN IF NOT EXISTS "contratoHash" TEXT,
ADD COLUMN IF NOT EXISTS "contratoAceitoEm" TIMESTAMPTZ;
