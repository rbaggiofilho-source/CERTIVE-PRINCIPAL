-- ==========================================
-- CERTIVE VISTORIAS — Contas a Pagar
-- Sanidade do campo competência
-- ==========================================
--
-- Sintoma observado: a despesa "ALUGUEL MUNDO CAR" (duplicata do aluguel de
-- agosto/2026) estava com competencia = 0002-08-01 — ano digitado com 1 dígito
-- no campo mês/ano. Como a tela de Contas a Pagar filtra por competência, a
-- conta ficava INVISÍVEL na página; mas o Painel BI filtrava por vencimento e
-- continuava somando os R$ 10.830,07. Uma duplicata invisível de onde deveria
-- ser gerenciada e visível onde vira prejuízo.

update public.contas_pagar
set competencia = date_trunc('month', vencimento)::date
where competencia is not null
  and (extract(year from competencia) < 2000 or extract(year from competencia) > 2100);

alter table public.contas_pagar
  drop constraint if exists contas_pagar_competencia_plausivel;

alter table public.contas_pagar
  add constraint contas_pagar_competencia_plausivel
  check (competencia is null
         or (extract(year from competencia) between 2000 and 2100));
