-- ==========================================
-- CERTIVE VISTORIAS — Caixa Diário
-- Natureza da saída de caixa
-- ==========================================
--
-- Nem toda saída do caixa é despesa. O operador lançava como "saída" três
-- coisas muito diferentes:
--
--   transferencia    — depósito do dinheiro do cofre na conta bancária.
--                      O dinheiro sai da gaveta mas continua sendo da empresa:
--                      é troca de caixa físico por caixa bancário, não despesa.
--   pagamento_conta  — liquidação de uma conta que já existe em contas_pagar
--                      (aluguel, salário, Sodexo). A despesa já foi contabilizada
--                      na competência; somar de novo seria contar duas vezes.
--   despesa          — despesa avulsa que não existe em contas_pagar
--                      (café, insumos, Uber, ressarcimento a cliente).
--                      Esta sim precisa entrar no resultado.
--
-- O tipo 'saida' continua valendo para todas: o dinheiro realmente sai da
-- gaveta e o fechamento de caixa depende disso. A natureza só diz se aquilo
-- é ou não custo do negócio.

alter table public.caixa_movimentos
  add column if not exists natureza text;

alter table public.caixa_movimentos
  drop constraint if exists caixa_movimentos_natureza_valida;

alter table public.caixa_movimentos
  add constraint caixa_movimentos_natureza_valida
  check (natureza is null or natureza in ('despesa','transferencia','pagamento_conta'));

-- Backfill do histórico
update public.caixa_movimentos
set natureza = 'transferencia'
where tipo = 'saida' and natureza is null
  and descricao ilike '%DEPOSITO%';

update public.caixa_movimentos
set natureza = 'pagamento_conta'
where tipo = 'saida' and natureza is null
  and (descricao ilike '%ALUGUEL%'
       or descricao ilike '%SODEXO%'
       or descricao ilike '%SALARIO%'
       or descricao ilike '%FOLHA%');

update public.caixa_movimentos
set natureza = 'despesa'
where tipo = 'saida' and natureza is null;

create index if not exists idx_caixa_mov_natureza
  on public.caixa_movimentos(natureza) where natureza is not null;
