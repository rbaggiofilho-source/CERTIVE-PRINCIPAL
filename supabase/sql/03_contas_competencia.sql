-- ============================================================
-- 03 — Contas a Pagar: campo de COMPETÊNCIA (mês de referência)
-- ------------------------------------------------------------
-- Aditivo e REVERSÍVEL. Rodar em produção SOMENTE com a
-- confirmação do gestor. Testar antes, se possível.
--
-- Regra: a competência define a que mês a conta pertence.
-- Gravada sempre no DIA 1 do mês de referência (ex.: 2026-08-01).
-- ============================================================

-- 1) Cria a coluna (nullable). Não afeta o sistema atual.
alter table public.contas_pagar
  add column if not exists competencia date;

-- 2) Backfill do histórico existente:
--    competência = 1º dia do mês do VENCIMENTO (aproximação segura).
--    Preenche apenas onde ainda está nulo (idempotente).
update public.contas_pagar
set competencia = date_trunc('month', vencimento)::date
where competencia is null
  and vencimento is not null;

-- (Opcional) conferência pós-migração:
--   select count(*) as sem_competencia
--   from public.contas_pagar where competencia is null;

-- ------------------------------------------------------------
-- REVERSÃO (se necessário):
--   alter table public.contas_pagar drop column competencia;
-- ============================================================
