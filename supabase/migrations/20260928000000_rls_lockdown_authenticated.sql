-- ==========================================================
-- SEGURANÇA — fecha o acesso anônimo (chave publishable) ao banco.
--
-- Antes: todas as tabelas tinham política 'public' com using(true)/check(true),
-- então a chave pública embutida no JS permitia ler/gravar/apagar TUDO sem login
-- (dados de caixa, faturas, contas, contratos e PII de clientes).
--
-- O cliente já é "session-aware" (restaura a sessão no boot antes de carregar
-- dados), e as edge functions/webhooks usam service_role (ignora RLS). Então
-- restringir ao papel 'authenticated' fecha o buraco sem afetar operadores
-- logados. Verificado: anon -> 0 linhas; authenticated -> acesso normal.
-- Reversível: recriar a policy 'for all to public using(true)'.
-- ==========================================================

-- Advisor 0011: search_path mutável
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.placa_canonica(text) set search_path = public, pg_temp;

-- Advisor 0028/0029: has_role SECURITY DEFINER executável por anon/authenticated
revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;

-- RLS: troca as políticas permissivas 'public' por 'authenticated' em toda
-- tabela public com RLS ligado.
do $$
declare t text; p text;
begin
  for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
    execute format(
      'create policy %I on public.%I as permissive for all to authenticated using (true) with check (true)',
      'auth_all_'||t, t);
  end loop;
end $$;
