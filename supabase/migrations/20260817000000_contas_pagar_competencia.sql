-- ==========================================
-- CERTIVE VISTORIAS — Contas a Pagar
-- Coluna de competência (mês de referência da despesa)
-- ==========================================

-- Cria a coluna de competência (mês de referência)
alter table public.contas_pagar
  add column if not exists competencia date;

-- Backfill: competência = 1º dia do mês do vencimento (histórico existente)
update public.contas_pagar
set competencia = date_trunc('month', vencimento)::date
where competencia is null and vencimento is not null;
