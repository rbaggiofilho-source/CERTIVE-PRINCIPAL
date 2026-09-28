-- Fase 3: autenticidade do laudo cautelar
--
-- Cada laudo emitido recebe um código de verificação aleatório (vai no QR e no
-- rodapé) e o SHA-256 do PDF final. A página pública de consulta usa só a
-- função consultar_laudo, que devolve o mínimo necessário para conferir o
-- documento: nada de cliente, CPF ou valores.

alter table public.cautelares add column if not exists "codigoVerificacao" text;
alter table public.cautelares add column if not exists "laudoGeradoId" bigint;
create unique index if not exists cautelares_codigo_verificacao_unico
  on public.cautelares ("codigoVerificacao") where "codigoVerificacao" is not null;

create or replace function public.consultar_laudo(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9_]', '', 'g'));
  v jsonb;
begin
  if length(v_codigo) < 8 then return null; end if;

  select jsonb_build_object(
      'dossie', c."dossieNumero",
      'placa', o.placa,
      'marcaModelo', o."veiculoMarcaModelo",
      'ano', o."veiculoAno",
      'chassiFinal', right(coalesce(o."veiculoChassi", ''), 4),
      'emitidoEm', c."dataHoraFinalizacao",
      'parecer', c."parecerConsolidado",
      'unidade', u.nome,
      'cidade', u.cidade,
      'uf', u.uf,
      'sha256', case when c."pdfHash" ~ '^[0-9a-f]{64}$' then c."pdfHash" end,
      'codigo', c."codigoVerificacao")
    into v
    from public.cautelares c
    join public.ordens_servico o on o.id = c."osId"
    left join public.unidades u on u.id = o."unidadeId"
   where c.status in ('concluida', 'finalizada', 'finalizado', 'concluido')
     and (upper(c."codigoVerificacao") = v_codigo
          -- QR dos laudos emitidos antes do código de verificação
          or (c."codigoVerificacao" is null and upper(c."pdfHash") = v_codigo))
   limit 1;
  return v;
end $$;
revoke all on function public.consultar_laudo(text) from public;
grant execute on function public.consultar_laudo(text) to anon, authenticated;
