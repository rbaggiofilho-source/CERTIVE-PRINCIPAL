-- ==========================================
-- CERTIVE VISTORIAS — Caixa Diário
-- Vínculo entre saída de caixa e conta a pagar
-- ==========================================
--
-- O Jonas recebe parte do salário em espécie ao longo do mês: a conta
-- "RESTANTE SALARIO JONAS DIA 15" (R$ 1.620,00) é quitada em 2 a 4 saídas
-- de caixa. Sem vínculo não dá para saber quanto de cada conta já foi pago,
-- nem dar baixa quando fecha.
--
-- Conferência do histórico — os dois grupos somam exatamente o valor da conta:
--   Julho:  R$ 1.000,00 + R$ 620,00                       = R$ 1.620,00
--   Agosto: R$ 120,00 + R$ 648,00 + R$ 520,00 + R$ 332,00 = R$ 1.620,00

alter table public.caixa_movimentos
  add column if not exists "contaPagarId" bigint
  references public.contas_pagar(id) on delete set null;

create index if not exists idx_caixa_mov_conta_pagar
  on public.caixa_movimentos("contaPagarId") where "contaPagarId" is not null;

-- Backfill dos pagamentos já identificados
update public.caixa_movimentos set "contaPagarId" = 12 where id in (123, 222);
update public.caixa_movimentos set "contaPagarId" = 40 where id in (502, 538, 556, 568);
update public.caixa_movimentos set "contaPagarId" = 33 where id = 154;  -- Sodexo
update public.caixa_movimentos set "contaPagarId" = 24 where id = 155;  -- Aluguel julho

-- Baixa nas contas já integralmente quitadas pelo caixa
update public.contas_pagar c
set pago = true,
    "pagoEm" = coalesce(c."pagoEm", (
      select max(m.data)::date from public.caixa_movimentos m
      where m."contaPagarId" = c.id
    ))
where c.pago = false
  and exists (select 1 from public.caixa_movimentos m where m."contaPagarId" = c.id)
  and (select coalesce(sum(m.valor),0) from public.caixa_movimentos m
       where m."contaPagarId" = c.id) >= c.valor;
