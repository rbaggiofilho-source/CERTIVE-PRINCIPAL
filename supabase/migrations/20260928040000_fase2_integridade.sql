-- Fase 2: dinheiro e integridade dos dados
--
-- 1. Numeração de OS e fatura feita pelo banco (acaba o "OS-TEMP"/"FAT-TEMP").
-- 2. Número de OS e código de fatura únicos.
-- 3. Um único lançamento de venda por OS e forma de pagamento no caixa
--    (a sincronização automática de dois aparelhos duplicava).
-- 4. Uma única provisão de taxas do DETRAN por unidade e mês.
-- 5. Operações em várias tabelas feitas numa transação só:
--      criar_os, faturar_os, remover_os_da_fatura, alterar_pagamento_os.

-- ---------------------------------------------------------------- numeração
create or replace function public.numerar_os() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.numero is null or new.numero = '' or new.numero = 'OS-TEMP' then
    new.numero := 'OS-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_numerar_os on public.ordens_servico;
create trigger trg_numerar_os before insert on public.ordens_servico
  for each row execute function public.numerar_os();

create or replace function public.numerar_fatura() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.codigo is null or new.codigo = '' or new.codigo = 'FAT-TEMP' then
    new.codigo := 'FAT-' || lpad(new.id::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_numerar_fatura on public.faturas;
create trigger trg_numerar_fatura before insert on public.faturas
  for each row execute function public.numerar_fatura();

-- OS que ficou presa como "OS-TEMP" por falha no meio da criação antiga
update public.ordens_servico set numero = 'OS-' || lpad(id::text, 4, '0') where numero = 'OS-TEMP';
update public.faturas set codigo = 'FAT-' || lpad(id::text, 4, '0') where codigo = 'FAT-TEMP';

create unique index if not exists ordens_servico_numero_unico on public.ordens_servico (numero);
create unique index if not exists faturas_codigo_unico on public.faturas (codigo);

-- ------------------------------------------------------- caixa sem duplicata
-- Três lançamentos antigos (OS 108 a 110, de agosto) estão em dobro; ficam como
-- estão para não reescrever caixas fechados. A regra vale a partir de agora.
create unique index if not exists caixa_mov_venda_unica
  on public.caixa_movimentos ("osId", "formaPagamento", left(descricao, 14))
  where tipo = 'entrada' and "osId" is not null and "faturaId" is null and data >= timestamptz '2026-09-29 03:00:00+00';

-- ------------------------------------------------------- provisão do DETRAN
create unique index if not exists contas_pagar_provisao_detran_unica
  on public.contas_pagar ("unidadeId", competencia)
  where descricao like 'Taxas DETRAN-% — Provisão %';

-- ------------------------------------------------------------- utilitário
-- Insere um registro a partir de um JSON, usando só as colunas enviadas
-- (as demais ficam com o valor padrão da tabela).
create or replace function public._inserir_json(p_tabela text, p_dados jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_cols text;
  v_res jsonb;
begin
  select string_agg(format('%I', c.column_name), ',')
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_tabela
     and p_dados ? c.column_name;
  if v_cols is null then
    raise exception 'Nenhuma coluna válida para %', p_tabela;
  end if;
  -- id enviado = id reservado antes (reservar_id_os); a coluna é identity ALWAYS
  execute format(
    'insert into public.%I (%s) %s select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
    p_tabela, v_cols, case when p_dados ? 'id' then 'overriding system value' else '' end,
    v_cols, p_tabela, p_tabela)
    into v_res using p_dados;
  return v_res;
end $$;
revoke all on function public._inserir_json(text, jsonb) from public, anon;
grant execute on function public._inserir_json(text, jsonb) to authenticated;

-- Reserva o id da próxima OS (o contrato é gerado com o número antes de gravar)
create or replace function public.reservar_id_os() returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  return nextval(pg_get_serial_sequence('public.ordens_servico', 'id'));
end $$;
revoke all on function public.reservar_id_os() from public, anon;
grant execute on function public.reservar_id_os() to authenticated;

-- ---------------------------------------------------------------- criar_os
-- OS + lançamentos de caixa + marca da reapresentação, tudo ou nada.
create or replace function public.criar_os(p_os jsonb, p_movimentos jsonb default '[]'::jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_os jsonb;
  v_id bigint;
  v_mov jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_origem bigint;
begin
  v_os := public._inserir_json('ordens_servico', p_os);
  v_id := (v_os->>'id')::bigint;

  for v_mov in select * from jsonb_array_elements(coalesce(p_movimentos, '[]'::jsonb)) loop
    v_movs := v_movs || jsonb_build_array(
      public._inserir_json('caixa_movimentos', v_mov || jsonb_build_object('osId', v_id)));
  end loop;

  v_origem := nullif(v_os->>'reapresentacaoOrigemID', '')::bigint;
  if v_origem is not null then
    update public.ordens_servico set "reapresentadaData" = now() where id = v_origem;
  end if;

  return jsonb_build_object('os', v_os, 'movimentos', v_movs);
end $$;
revoke all on function public.criar_os(jsonb, jsonb) from public, anon;
grant execute on function public.criar_os(jsonb, jsonb) to authenticated;

-- -------------------------------------------------------------- faturar_os
-- Fecha a fatura de um lote de OS de um parceiro. Trava as OS e os créditos
-- para que duas pessoas não faturem as mesmas OS nem usem o mesmo crédito.
create or replace function public.faturar_os(
  p_parceiro bigint, p_unidade bigint, p_inicio date, p_fim date,
  p_os_ids bigint[], p_criado_por text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_qtd int;
  v_bruto numeric := 0;
  v_resto numeric;
  v_usar numeric;
  v_fat public.faturas;
  v_cred record;
  v_usados bigint[] := '{}';
  v_sobra jsonb := null;
  v_sobra_valor numeric := 0;
begin
  if coalesce(array_length(p_os_ids, 1), 0) = 0 then
    raise exception 'Nenhuma OS selecionada.';
  end if;

  perform 1 from public.ordens_servico where id = any(p_os_ids) for update;

  select count(*), coalesce(sum(valor), 0) into v_qtd, v_bruto
    from public.ordens_servico
   where id = any(p_os_ids)
     and "faturaId" is null
     and status <> 'cancelada'
     and "parceiroId" = p_parceiro
     and "formaPagamento" = 'faturamento';
  if v_qtd <> array_length(p_os_ids, 1) then
    raise exception 'Alguma OS selecionada já foi faturada, foi cancelada ou não é deste parceiro. Atualize a tela e tente de novo.'
      using errcode = 'P0001';
  end if;

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
                              "ordensIds", pago, "pagoEm", "criadoEm", "criadoPor")
  values (p_parceiro, p_unidade, p_inicio, p_fim, greatest(v_resto, 0),
          p_os_ids, v_resto <= 0, case when v_resto <= 0 then now() end, now(), p_criado_por)
  returning * into v_fat;

  update public.ordens_servico set "faturaId" = v_fat.id where id = any(p_os_ids);

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
revoke all on function public.faturar_os(bigint, bigint, date, date, bigint[], text) from public, anon;
grant execute on function public.faturar_os(bigint, bigint, date, date, bigint[], text) to authenticated;

-- ---------------------------------------------------- remover_os_da_fatura
-- Tira uma OS de uma fatura EM ABERTO. O crédito que tinha sido abatido e que
-- deixa de caber volta ao parceiro como crédito novo; fatura vazia é apagada.
-- Fatura paga não muda: o dinheiro já entrou.
create or replace function public._remover_os_da_fatura(p_os_id bigint, p_por text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_os public.ordens_servico;
  v_fat public.faturas;
  v_bruto_antes numeric;
  v_bruto_depois numeric;
  v_abatido numeric;
  v_liquido numeric;
  v_devolver numeric := 0;
  v_credito jsonb := null;
  v_restantes bigint[];
begin
  select * into v_os from public.ordens_servico where id = p_os_id for update;
  if v_os.id is null then raise exception 'OS não encontrada.'; end if;
  if v_os."faturaId" is null then return jsonb_build_object('fatura', null); end if;

  select * into v_fat from public.faturas where id = v_os."faturaId" for update;
  if v_fat.id is null then
    update public.ordens_servico set "faturaId" = null where id = p_os_id;
    return jsonb_build_object('fatura', null);
  end if;
  if coalesce(v_fat.pago, false) then
    raise exception 'A fatura % já foi paga; a OS não pode sair dela. Faça o acerto como crédito ao parceiro.', v_fat.codigo
      using errcode = 'P0001';
  end if;

  select coalesce(sum(valor), 0) into v_bruto_antes from public.ordens_servico where id = any(v_fat."ordensIds");
  v_abatido := greatest(v_bruto_antes - v_fat."valorTotal", 0);
  v_restantes := array_remove(v_fat."ordensIds", p_os_id);
  select coalesce(sum(valor), 0) into v_bruto_depois from public.ordens_servico where id = any(v_restantes);

  v_liquido := greatest(v_bruto_depois - v_abatido, 0);
  v_devolver := greatest(v_abatido - v_bruto_depois, 0);

  update public.ordens_servico set "faturaId" = null where id = p_os_id;

  if coalesce(array_length(v_restantes, 1), 0) = 0 then
    update public.parceiros_creditos set "faturaId" = null where "faturaId" = v_fat.id;
    delete from public.faturas where id = v_fat.id;
  else
    update public.faturas set "ordensIds" = v_restantes, "valorTotal" = v_liquido where id = v_fat.id;
  end if;

  if v_devolver > 0 then
    v_credito := public._inserir_json('parceiros_creditos', jsonb_build_object(
      'parceiroId', v_fat."parceiroId", 'tipo', 'credito', 'valor', v_devolver,
      'descricao', 'Crédito devolvido: ' || v_os.numero || ' saiu da fatura ' || v_fat.codigo,
      'utilizado', false, 'criadoEm', now(), 'criadoPor', p_por));
  end if;

  return jsonb_build_object(
    'fatura_id', v_fat.id,
    'fatura_apagada', coalesce(array_length(v_restantes, 1), 0) = 0,
    'ordensIds', to_jsonb(v_restantes),
    'valorTotal', v_liquido,
    'credito_devolvido', v_credito);
end $$;
revoke all on function public._remover_os_da_fatura(bigint, text) from public, anon;
grant execute on function public._remover_os_da_fatura(bigint, text) to authenticated;

create or replace function public.remover_os_da_fatura(p_os_id bigint, p_por text)
returns jsonb language sql set search_path = public as $$
  select public._remover_os_da_fatura(p_os_id, p_por);
$$;
revoke all on function public.remover_os_da_fatura(bigint, text) from public, anon;
grant execute on function public.remover_os_da_fatura(bigint, text) to authenticated;

-- ---------------------------------------------------- alterar_pagamento_os
-- Troca a forma de pagamento de uma OS numa transação: tira da fatura em
-- aberto (se for o caso), apaga os lançamentos de venda antigos, grava os
-- novos e atualiza a OS.
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
    observacoes = p_os->>'observacoes'
  where id = p_os_id
  returning to_jsonb(o.*) into v_os;

  return jsonb_build_object('os', v_os, 'fatura', v_fatura, 'movimentos', v_movs, 'apagados', to_jsonb(v_apagados));
end $$;
revoke all on function public.alterar_pagamento_os(bigint, jsonb, jsonb, text) from public, anon;
grant execute on function public.alterar_pagamento_os(bigint, jsonb, jsonb, text) to authenticated;
