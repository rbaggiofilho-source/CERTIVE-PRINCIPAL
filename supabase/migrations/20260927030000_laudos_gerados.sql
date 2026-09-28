create table if not exists public.laudos_gerados (
  id bigint generated always as identity primary key,
  "cautelarId" bigint not null references public.cautelares(id) on delete cascade,
  "criadoEm" timestamptz not null default now(),
  "criadoPor" uuid not null references auth.users(id),
  "promptId" text not null,
  "promptVersion" text not null,
  modelo text,
  status text not null check (status in ('sucesso', 'bloqueado')),
  resposta jsonb not null,
  "pacoteEnviado" jsonb not null
);

create index if not exists idx_laudos_gerados_cautelar_criado
  on public.laudos_gerados ("cautelarId", "criadoEm" desc);

alter table public.laudos_gerados enable row level security;
drop policy if exists laudos_gerados_select_autenticado on public.laudos_gerados;
create policy laudos_gerados_select_autenticado on public.laudos_gerados
  for select to authenticated using (true);

revoke select, insert, update, delete on public.laudos_gerados from anon;
revoke insert, update, delete on public.laudos_gerados from authenticated;
grant select on public.laudos_gerados to authenticated;
