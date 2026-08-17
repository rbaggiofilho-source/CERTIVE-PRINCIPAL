-- ==========================================
-- CERTIVE VISTORIAS — Guia DETRAN-SC
-- Correção da base de cálculo da taxa de concessão
-- ==========================================
--
-- Regra real (conferida contra o DARE de Julho/2026 e o relatório do
-- Portal ECV): o DETRAN-SC cobra R$ 27,00 por LAUDO EMITIDO, qualquer
-- que seja o porte do veículo e qualquer que seja o resultado — laudo
-- aprovado, reprovado, bloqueado, cancelado ou "não enviado" são todos
-- cobrados. O único laudo gratuito é o RETORNO (reapresentação).
--
--   DARE Julho/2026 = R$ 4.941,00 = 183 laudos x R$ 27,00
--   Portal ECV      = 191 laudos - 8 retornos = 183 cobrados
--
-- Problemas corrigidos aqui:
--   1. taxas_referencia tinha linhas DUPLICADAS para os serviços 7 e 8
--      (0,00 e 33,48 / 27,00 e 40,50). O .find() do app pegava a primeira
--      da lista, então a taxa dependia da ordem de carga do array.
--   2. VISTORIA DE TRANSFERÊNCIA — SUPERCARRO (id 9) não tinha linha de
--      taxa: o app caía no `|| 0` e contava a vistoria como R$ 0,00.
--   3. Cautelar e Pesquisa Veicular entravam na guia a R$ 33,48. Elas não
--      geram laudo ECV e não compõem o DARE — o custo delas é de consulta
--      a terceiros e fica preservado na coluna custoTerceiros.

-- 1) Marca explicitamente quais serviços geram laudo ECV cobrado pelo DETRAN
alter table public.servicos
  add column if not exists "geraLaudoDetran" boolean not null default false;

update public.servicos set "geraLaudoDetran" = true  where id in (1,2,3,7,8,9);
update public.servicos set "geraLaudoDetran" = false where id in (4,5,6,10);

-- 2) Preserva o custo de consulta de terceiros antes de zerar a taxa DETRAN
alter table public.taxas_referencia
  add column if not exists "custoTerceiros" numeric(10,2);

update public.taxas_referencia set "custoTerceiros" = taxa
where "servicoId" in (4,5,10) and "custoTerceiros" is null;

-- 3) Remove linhas duplicadas (mantém o menor id por serviço)
delete from public.taxas_referencia t
using public.taxas_referencia t2
where t."servicoId" = t2."servicoId" and t.id > t2.id;

-- 4) Impede duplicidade futura
create unique index if not exists taxas_referencia_servico_uk
  on public.taxas_referencia("servicoId");

-- 5) Taxa DETRAN = R$ 27,00 por laudo ECV; 0 para quem não gera laudo
update public.taxas_referencia set taxa = 27.00 where "servicoId" in (1,2,3,7,8,9);
update public.taxas_referencia set taxa = 0.00  where "servicoId" in (4,5,6,10);

-- 6) Serviços sem linha de taxa (SUPERCARRO) passam a ter cadastro explícito
insert into public.taxas_referencia ("servicoId", taxa, "custoTerceiros")
select s.id,
       case when s."geraLaudoDetran" then 27.00 else 0.00 end,
       case when s.id = 10 then 33.48 else null end
from public.servicos s
where not exists (select 1 from public.taxas_referencia t where t."servicoId" = s.id);

-- 7) Competência das guias DETRAN: a taxa de julho vence em agosto, mas a
--    competência é julho. O backfill anterior derivou do vencimento e errou.
--    Mapeamento explícito do nome do mês (evita depender do locale do banco).
with meses(nome, num) as (
  values ('Janeiro',1),('Fevereiro',2),('Março',3),('Abril',4),
         ('Maio',5),('Junho',6),('Julho',7),('Agosto',8),
         ('Setembro',9),('Outubro',10),('Novembro',11),('Dezembro',12)
)
update public.contas_pagar c
set competencia = make_date(
      split_part(split_part(c.descricao, '/', 2), ' ', 1)::int,
      m.num, 1)
from meses m
where c.descricao like 'Taxas DETRAN-SC — Provisão %/%'
  and split_part(split_part(c.descricao, '— Provisão ', 2), '/', 1) = m.nome
  and split_part(split_part(c.descricao, '/', 2), ' ', 1) ~ '^\d{4}$';
