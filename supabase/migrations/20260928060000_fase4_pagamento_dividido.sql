-- Fase 4: pagamento dividido em coluna própria (antes só dentro do texto das
-- observações, e se alguém editasse as observações a divisão se perdia).

alter table public.ordens_servico add column if not exists "pagamentoDividido" jsonb;

-- OS antigas: copia a divisão da marca [PAG_DIVIDIDO: pix=100;especie=50]
update public.ordens_servico o
   set "pagamentoDividido" = (
     select jsonb_agg(jsonb_build_object('forma', split_part(parte, '=', 1), 'valor', split_part(parte, '=', 2)::numeric) order by n)
       from unnest(string_to_array((regexp_match(o.observacoes, '\[PAG_DIVIDIDO: ([^\]]+)\]'))[1], ';')) with ordinality as t(parte, n)
      where split_part(parte, '=', 2) ~ '^[0-9]+(\.[0-9]+)?$')
 where o."pagamentoDividido" is null
   and o.observacoes ~ '\[PAG_DIVIDIDO: [^\]]+\]';

create or replace function public.alterar_pagamento_os(
  p_os_id bigint, p_os jsonb, p_movimentos jsonb, p_por text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_fatura jsonb := null;
  v_mov jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_apagados bigint[];
  v_os jsonb;
begin
  perform 1 from public.ordens_servico where id = p_os_id for update;
  v_fatura := public._remover_os_da_fatura(p_os_id, p_por);

  with apagados as (
    delete from public.caixa_movimentos
     where "osId" = p_os_id and tipo = 'entrada' and "faturaId" is null
    returning id)
  select coalesce(array_agg(id), '{}') into v_apagados from apagados;

  for v_mov in select * from jsonb_array_elements(coalesce(p_movimentos, '[]'::jsonb)) loop
    v_movs := v_movs || jsonb_build_array(
      public._inserir_json('caixa_movimentos', v_mov || jsonb_build_object('osId', p_os_id)));
  end loop;

  update public.ordens_servico o set
    "formaPagamento" = p_os->>'formaPagamento',
    pago = coalesce((p_os->>'pago')::boolean, o.pago),
    parcelas = nullif(p_os->>'parcelas', '')::int,
    "faturaId" = null,
    observacoes = p_os->>'observacoes',
    "pagamentoDividido" = case when jsonb_typeof(p_os->'pagamentoDividido') = 'array' then p_os->'pagamentoDividido' end
  where id = p_os_id
  returning to_jsonb(o.*) into v_os;

  return jsonb_build_object('os', v_os, 'fatura', v_fatura, 'movimentos', v_movs, 'apagados', to_jsonb(v_apagados));
end $$;
revoke all on function public.alterar_pagamento_os(bigint, jsonb, jsonb, text) from public, anon;
grant execute on function public.alterar_pagamento_os(bigint, jsonb, jsonb, text) to authenticated;
