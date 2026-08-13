-- ============================================================
-- 02 — TRANCAR o banco com RLS autenticado  (RODAR NA VIRADA)
-- ------------------------------------------------------------
-- ⚠️ NÃO rode isto antes de o login novo (Supabase Auth) estar
-- publicado. Ele fecha o acesso "público" que o sistema atual
-- usa — se rodar antes, o sistema atual para de funcionar.
--
-- O que faz:
--  - Remove TODAS as políticas atuais (as "allow_all" abertas).
--  - Cria uma política por tabela liberando só para usuários
--    AUTENTICADOS (logados). Sem login = banco inacessível.
--  - Em operadores, autenticados só LEEM; a escrita é feita
--    apenas pela Edge Function (que usa a chave-mestra e ignora
--    o RLS), impedindo que qualquer logado altere operadores.
-- ============================================================

do $$
declare
  r record;
begin
  -- 1) Apaga todas as políticas existentes do schema public
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I',
                   r.policyname, r.tablename);
  end loop;

  -- 2) Cria política de acesso só para autenticados
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    if r.tablename = 'operadores' then
      -- operadores: logados só leem
      execute format(
        'create policy %I on public.%I for select to authenticated using (true)',
        'auth_select_' || r.tablename, r.tablename);
    else
      -- demais tabelas: logados leem e gravam
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true)',
        'auth_all_' || r.tablename, r.tablename);
    end if;
  end loop;
end $$;
