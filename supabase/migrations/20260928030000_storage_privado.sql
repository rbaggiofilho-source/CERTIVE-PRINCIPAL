-- Fotos das cautelares (inclui o documento do veículo) e PDFs de faturas deixam de
-- ser públicos: só usuários logados leem, e o sistema exibe por links temporários
-- (createSignedUrl). Aplicar junto com a versão do app que usa urlArmazenamento().
update storage.buckets set public = false where id in ('cautelares', 'faturas');

drop policy if exists cautelares_public_read on storage.objects;
drop policy if exists cautelares_select on storage.objects;
create policy cautelares_select on storage.objects
    for select to authenticated using (bucket_id = 'cautelares');

drop policy if exists "Public Access" on storage.objects;
drop policy if exists faturas_select on storage.objects;
create policy faturas_select on storage.objects
    for select to authenticated using (bucket_id = 'faturas');
