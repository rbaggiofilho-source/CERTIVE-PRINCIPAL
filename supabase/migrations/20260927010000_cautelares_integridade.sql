-- Integridade do módulo Cautelar para uso diário em volume.
-- 1) Uma seção por número em cada cautelar e uma foto por slot em cada seção:
--    o app reenvia fotos pendentes e recria seções faltantes; estas travas
--    impedem duplicatas se dois aparelhos (ou uma retentativa) gravarem juntos.
-- 2) A cautelar é inserida com id explícito (define o número do dossiê);
--    alinha a sequência para que inserts sem id nunca colidam.
create unique index if not exists uq_cautelares_secoes_cautelar_numero
    on public.cautelares_secoes ("cautelarId", "numeroSecao");

create unique index if not exists uq_cautelares_fotos_secao_slot
    on public.cautelares_fotos ("secaoId", "slotCodigo");

select setval('cautelares_id_seq', greatest((select coalesce(max(id), 0) from public.cautelares), 1));

-- 3) Ao refazer ou apagar uma foto o app remove o arquivo antigo do Storage.
drop policy if exists cautelares_delete on storage.objects;
create policy cautelares_delete on storage.objects
    for delete using (bucket_id = 'cautelares');
