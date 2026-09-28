-- Índices de cobertura para chaves estrangeiras sem índice.
-- Corrige o alerta de performance "unindexed_foreign_keys" do linter do Supabase.
-- Acelera JOINs, buscas por FK e verificações de ON DELETE/ON UPDATE.
-- CREATE INDEX IF NOT EXISTS é idempotente e seguro em produção.

create index if not exists idx_auditoria_unidadeId
  on public.auditoria ("unidadeId");

create index if not exists idx_baixas_faturas_pendentes_caixaId
  on public.baixas_faturas_pendentes ("caixaId");
create index if not exists idx_baixas_faturas_pendentes_faturaId
  on public.baixas_faturas_pendentes ("faturaId");
create index if not exists idx_baixas_faturas_pendentes_unidadeId
  on public.baixas_faturas_pendentes ("unidadeId");

create index if not exists idx_cautelares_finalizadoPorId
  on public.cautelares ("finalizadoPorId");
create index if not exists idx_cautelares_osId
  on public.cautelares ("osId");
create index if not exists idx_cautelares_vistoriadorId
  on public.cautelares ("vistoriadorId");

create index if not exists idx_cautelares_pesquisas_cautelarId
  on public.cautelares_pesquisas ("cautelarId");

create index if not exists idx_contas_pagar_unidadeId
  on public.contas_pagar ("unidadeId");

create index if not exists idx_faturas_parceiroId
  on public.faturas ("parceiroId");
create index if not exists idx_faturas_unidadeId
  on public.faturas ("unidadeId");

create index if not exists idx_laudos_gerados_criadoPor
  on public.laudos_gerados ("criadoPor");

create index if not exists idx_operadores_unidadeId
  on public.operadores ("unidadeId");

create index if not exists idx_ordens_servico_parceiroId
  on public.ordens_servico ("parceiroId");
create index if not exists idx_ordens_servico_servicoId
  on public.ordens_servico ("servicoId");

create index if not exists idx_parceiros_creditos_faturaId
  on public.parceiros_creditos ("faturaId");
create index if not exists idx_parceiros_creditos_parceiroId
  on public.parceiros_creditos ("parceiroId");

create index if not exists idx_pendencias_fechamento_osId
  on public.pendencias_fechamento ("osId");

create index if not exists idx_solicitantes_parceiros_parceiroId
  on public.solicitantes_parceiros ("parceiroId");
