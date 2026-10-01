-- PENDENTE DE APLICAÇÃO (rodar no SQL Editor do Supabase).
-- Depois de aplicada, trocar REMOVER_OS_CONSIDERA_EXTRAS para true em app_v8.js.
--
-- Tirar uma OS da fatura: as cobranças extras continuam na fatura e entram na
-- conta do valor (a fatura só é apagada quando não sobra nem OS nem cobrança).
create or replace function public._remover_os_da_fatura(p_os_id bigint, p_por text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_os public.ordens_servico;
  v_fat public.faturas;
  v_extras numeric;
  v_bruto_antes numeric;
  v_bruto_depois numeric;
  v_abatido numeric;
  v_liquido numeric;
  v_devolver numeric := 0;
  v_credito jsonb := null;
  v_restantes bigint[];
  v_apagar boolean;
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

  v_extras := public._total_extras(v_fat."cobrancasExtras");
  select coalesce(sum(valor), 0) + v_extras into v_bruto_antes from public.ordens_servico where id = any(v_fat."ordensIds");
  v_abatido := greatest(v_bruto_antes - v_fat."valorTotal", 0);
  v_restantes := array_remove(v_fat."ordensIds", p_os_id);
  select coalesce(sum(valor), 0) + v_extras into v_bruto_depois from public.ordens_servico where id = any(v_restantes);

  v_liquido := greatest(v_bruto_depois - v_abatido, 0);
  v_devolver := greatest(v_abatido - v_bruto_depois, 0);
  v_apagar := coalesce(array_length(v_restantes, 1), 0) = 0 and v_extras = 0;

  update public.ordens_servico set "faturaId" = null where id = p_os_id;

  if v_apagar then
    update public.parceiros_creditos set "faturaId" = null where "faturaId" = v_fat.id;
    delete from public.faturas where id = v_fat.id;
  else
    update public.faturas set "ordensIds" = coalesce(v_restantes, '{}'), "valorTotal" = v_liquido where id = v_fat.id;
  end if;

  if v_devolver > 0 then
    v_credito := public._inserir_json('parceiros_creditos', jsonb_build_object(
      'parceiroId', v_fat."parceiroId", 'tipo', 'credito', 'valor', v_devolver,
      'descricao', 'Crédito devolvido: ' || v_os.numero || ' saiu da fatura ' || v_fat.codigo,
      'utilizado', false, 'criadoEm', now(), 'criadoPor', p_por));
  end if;

  return jsonb_build_object(
    'fatura_id', v_fat.id,
    'fatura_apagada', v_apagar,
    'ordensIds', to_jsonb(coalesce(v_restantes, '{}')),
    'valorTotal', v_liquido,
    'credito_devolvido', v_credito);
end $$;
revoke all on function public._remover_os_da_fatura(bigint, text) from public, anon;
grant execute on function public._remover_os_da_fatura(bigint, text) to authenticated;
