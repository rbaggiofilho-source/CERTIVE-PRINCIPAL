-- ==========================================
-- CERTIVE VISTORIAS — Desempenho de carregamento
-- Indicadores de existência dos campos pesados
-- ==========================================
--
-- Sintoma: "Erro ao conectar com o banco de dados" recorrente, principalmente
-- no celular. Nos logs do PostgREST, 200 ocorrências de "Warp server error:
-- Thread killed by timeout manager" — as consultas estouravam o tempo limite.
--
-- Causa: anexos, comprovantes e contratos são gravados como base64 dentro da
-- própria linha, e o carregamento inicial trazia tudo:
--
--   contas_pagar.anexo             9,9 MB  (42 linhas)
--   contas_pagar.comprovante       9,8 MB  (23 linhas)
--   ordens_servico.contratoTexto   6,3 MB  (473 linhas)
--   caixa_diario.relatorioDetran   1,8 MB  (56 linhas)
--                                 -------
--                                  ~28 MB a cada login, em 23 requisições
--                                  paralelas
--
-- O app deixou de trazer esses campos no carregamento e passou a buscá-los sob
-- demanda, ao abrir o anexo. Mas a interface ainda precisa saber se o anexo
-- existe, para decidir se mostra o botão de visualizar. Colunas geradas
-- resolvem sem trigger: o Postgres recalcula sozinho a cada gravação.
--
-- Resultado: a carga inicial dessas três tabelas cai de ~27 MB para ~218 KB.

alter table public.contas_pagar
  add column if not exists "temAnexo" boolean
    generated always as (anexo is not null and anexo <> '') stored,
  add column if not exists "temComprovante" boolean
    generated always as (comprovante is not null and comprovante <> '') stored;

alter table public.ordens_servico
  add column if not exists "temContrato" boolean
    generated always as ("contratoTexto" is not null and "contratoTexto" <> '') stored;

alter table public.caixa_diario
  add column if not exists "temRelatorioDetran" boolean
    generated always as ("relatorioDetran" is not null and "relatorioDetran" <> '') stored;
