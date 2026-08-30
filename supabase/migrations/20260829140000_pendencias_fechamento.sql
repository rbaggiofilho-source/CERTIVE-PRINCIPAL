-- ==========================================
-- CERTIVE VISTORIAS — Auditoria de fechamento
-- Pendências da conferência com o DETRAN
-- ==========================================
--
-- O operador pode fechar o caixa mesmo com divergência — mas a divergência
-- não some. Ela fica gravada aqui e é recontada a cada fechamento, todos os
-- dias, até alguém corrigir. Cada vez que reaparece, vezesIgnorada sobe, e o
-- push enviado aos administradores mostra há quantos fechamentos aquilo vem
-- sendo arrastado.
--
-- A chave de deduplicação evita recriar a mesma pendência todo dia: o que
-- muda é o contador, não o registro.

create table if not exists public.pendencias_fechamento (
  id            bigint generated always as identity primary key,
  "unidadeId"   bigint not null,
  tipo          text   not null check (tipo in
                  ('laudo_sem_os','os_sem_laudo','placa_errada','os_aberta')),
  chave         text   not null,
  placa         text,
  descricao     text   not null,
  "valorTaxa"   numeric(10,2) default 0,
  "osId"        bigint references public.ordens_servico(id) on delete set null,
  "osNumero"    text,
  "detectadaEm"        timestamptz not null default now(),
  "detectadaPor"       text,
  "primeiroFechamento" date,
  "ultimoFechamento"   date,
  "vezesIgnorada"      integer not null default 1,
  resolvida     boolean not null default false,
  "resolvidaEm" timestamptz,
  "resolvidaPor" text,
  "resolvidaComo" text,
  observacao    text
);

create unique index if not exists pendencias_fechamento_chave_uk
  on public.pendencias_fechamento("unidadeId", chave);

create index if not exists idx_pendencias_abertas
  on public.pendencias_fechamento("unidadeId", resolvida)
  where resolvida = false;

alter table public.pendencias_fechamento enable row level security;

drop policy if exists "allow_all_pendencias_fechamento" on public.pendencias_fechamento;
create policy "allow_all_pendencias_fechamento" on public.pendencias_fechamento
  for all using (true) with check (true);
