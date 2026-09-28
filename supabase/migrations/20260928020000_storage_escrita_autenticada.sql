-- Arquivos: gravação, alteração e exclusão só por usuários logados.
-- Antes as políticas valiam para qualquer um (inclusive sem login), o que
-- permitia sobrescrever fotos de evidência das cautelares e enviar arquivos.
-- O assistente ChatGPT foi removido: o bucket dele fica privado e sem gravação.

drop policy if exists cautelares_insert on storage.objects;
create policy cautelares_insert on storage.objects
    for insert to authenticated with check (bucket_id = 'cautelares');

drop policy if exists cautelares_update on storage.objects;
create policy cautelares_update on storage.objects
    for update to authenticated using (bucket_id = 'cautelares') with check (bucket_id = 'cautelares');

drop policy if exists cautelares_delete on storage.objects;
create policy cautelares_delete on storage.objects
    for delete to authenticated using (bucket_id = 'cautelares');

drop policy if exists "Anon/Auth Insert" on storage.objects;
drop policy if exists faturas_insert on storage.objects;
create policy faturas_insert on storage.objects
    for insert to authenticated with check (bucket_id = 'faturas');

-- upload de fatura com upsert (reenvio do mesmo PDF)
drop policy if exists faturas_update on storage.objects;
create policy faturas_update on storage.objects
    for update to authenticated using (bucket_id = 'faturas') with check (bucket_id = 'faturas');

drop policy if exists chatgpt_img_insert on storage.objects;
drop policy if exists chatgpt_img_public_read on storage.objects;
update storage.buckets set public = false where id = 'chatgpt-imagens';
