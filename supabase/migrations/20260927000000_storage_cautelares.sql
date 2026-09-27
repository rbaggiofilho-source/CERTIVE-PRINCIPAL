-- Bucket das fotos e laudos da Vistoria Cautelar.
-- O app já envia para 'cautelares' (fotos em cautelares/<id>/<slot>.jpg e laudos
-- em laudos/<id>/...), mas o bucket nunca foi criado: o upload falhava e os
-- originais ficavam só no aparelho. Mesmo padrão do bucket 'faturas'.
insert into storage.buckets (id, name, public)
values ('cautelares', 'cautelares', true)
on conflict (id) do nothing;

drop policy if exists cautelares_public_read on storage.objects;
create policy cautelares_public_read on storage.objects
    for select using (bucket_id = 'cautelares');

drop policy if exists cautelares_insert on storage.objects;
create policy cautelares_insert on storage.objects
    for insert with check (bucket_id = 'cautelares');

-- upsert: true no upload exige UPDATE quando o slot é refeito
drop policy if exists cautelares_update on storage.objects;
create policy cautelares_update on storage.objects
    for update using (bucket_id = 'cautelares') with check (bucket_id = 'cautelares');
