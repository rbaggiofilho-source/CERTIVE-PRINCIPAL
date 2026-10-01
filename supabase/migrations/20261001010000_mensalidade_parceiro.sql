-- Mensalidade fixa do parceiro (ex.: aluguel do pátio lateral), cobrada junto
-- com as O.S. no fechamento da fatura. Entra uma vez por mês de competência.

alter table public.parceiros add column if not exists "mensalidadeDescricao" text;
alter table public.parceiros add column if not exists "mensalidadeValor" numeric(10,2);
alter table public.faturas add column if not exists "cobrancasExtras" jsonb not null default '[]'::jsonb;

-- Valor bruto de uma fatura: O.S. + cobranças extras
create or replace function public._total_extras(p_extras jsonb)
returns numeric language sql immutable set search_path = public as $$
  select coalesce(sum((e->>'valor')::numeric), 0) from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) e;
$$;

-- Versão nova com p_extras (sem default, para não ficar ambígua com a antiga
-- de 6 argumentos, que continua existindo; o app sempre manda p_extras).
create or replace function public.faturar_os(
  p_parceiro bigint, p_unidade bigint, p_inicio date, p_fim date,
  p_os_ids bigint[], p_criado_por text, p_extras jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_qtd int;
  v_bruto numeric := 0;
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
  v_e jsonb;
  v_resto numeric;
  v_usar numeric;
  v_fat public.faturas;
  v_cred record;
  v_usados bigint[] := '{}';
  v_sobra jsonb := null;
  v_sobra_valor numeric := 0;
  v_os_ids bigint[] := coalesce(p_os_ids, '{}');
begin
  if coalesce(array_length(v_os_ids, 1), 0) = 0 and jsonb_array_length(v_extras) = 0 then
    raise exception 'Nenhuma OS ou cobrança selecionada.';
  end if;

  -- Trava o parceiro: dois fechamentos ao mesmo tempo não cobram a mesma mensalidade
  perform 1 from public.parceiros where id = p_parceiro for update;

  for v_e in select * from jsonb_array_elements(v_extras) loop
    if coalesce((v_e->>'valor')::numeric, 0) <= 0 then
      raise exception 'Cobrança extra sem valor: %', v_e->>'descricao';
    end if;
    if v_e ? 'competencia' and exists (
      select 1 from public.faturas f
       where f."parceiroId" = p_parceiro
         and f."cobrancasExtras" @> jsonb_build_array(jsonb_build_object('tipo', 'mensalidade', 'competencia', v_e->>'competencia'))
    ) and v_e->>'tipo' = 'mensalidade' then
      raise exception 'A mensalidade de % deste parceiro já foi faturada.', v_e->>'competencia' using errcode = 'P0001';
    end if;
  end loop;

  if array_length(v_os_ids, 1) > 0 then
    perform 1 from public.ordens_servico where id = any(v_os_ids) for update;
    select count(*), coalesce(sum(valor), 0) into v_qtd, v_bruto
      from public.ordens_servico
     where id = any(v_os_ids)
       and "faturaId" is null
       and status <> 'cancelada'
       and "parceiroId" = p_parceiro
       and "formaPagamento" = 'faturamento';
    if v_qtd <> array_length(v_os_ids, 1) then
      raise exception 'Alguma OS selecionada já foi faturada, foi cancelada ou não é deste parceiro. Atualize a tela e tente de novo.'
        using errcode = 'P0001';
    end if;
  end if;

  v_bruto := v_bruto + public._total_extras(v_extras);

  v_resto := v_bruto;
  for v_cred in
    select * from public.parceiros_creditos
     where "parceiroId" = p_parceiro and not coalesce(utilizado, false)
     order by "criadoEm", id
     for update
  loop
    exit when v_resto <= 0;
    v_usar := least(v_cred.valor, v_resto);
    v_resto := v_resto - v_usar;
    v_usados := v_usados || v_cred.id;
    if v_cred.valor > v_usar then
      v_sobra_valor := v_sobra_valor + (v_cred.valor - v_usar);
    end if;
  end loop;

  insert into public.faturas ("parceiroId", "unidadeId", "periodoInicio", "periodoFim", "valorTotal",
                              "ordensIds", "cobrancasExtras", pago, "pagoEm", "criadoEm", "criadoPor")
  values (p_parceiro, p_unidade, p_inicio, p_fim, greatest(v_resto, 0),
          v_os_ids, v_extras, v_resto <= 0, case when v_resto <= 0 then now() end, now(), p_criado_por)
  returning * into v_fat;

  if array_length(v_os_ids, 1) > 0 then
    update public.ordens_servico set "faturaId" = v_fat.id where id = any(v_os_ids);
  end if;

  if array_length(v_usados, 1) > 0 then
    update public.parceiros_creditos set utilizado = true, "faturaId" = v_fat.id where id = any(v_usados);
  end if;

  if v_sobra_valor > 0 then
    v_sobra := public._inserir_json('parceiros_creditos', jsonb_build_object(
      'parceiroId', p_parceiro, 'tipo', 'credito', 'valor', v_sobra_valor,
      'descricao', 'Saldo remanescente de crédito após faturamento ' || v_fat.codigo,
      'utilizado', false, 'criadoEm', now(), 'criadoPor', p_criado_por));
  end if;

  return jsonb_build_object('fatura', to_jsonb(v_fat), 'creditos_usados', to_jsonb(v_usados),
                            'sobra', v_sobra, 'bruto', v_bruto, 'abatido', v_bruto - greatest(v_resto, 0));
end $$;
revoke all on function public.faturar_os(bigint, bigint, date, date, bigint[], text, jsonb) from public, anon;
grant execute on function public.faturar_os(bigint, bigint, date, date, bigint[], text, jsonb) to authenticated;
