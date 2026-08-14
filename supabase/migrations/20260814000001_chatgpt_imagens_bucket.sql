-- Bucket público para imagens geradas pelo assistente ChatGPT
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'chatgpt-imagens',
    'chatgpt-imagens',
    true,
    false,
    15728640, -- 15MB
    ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chatgpt_img_public_read" ON storage.objects;
CREATE POLICY "chatgpt_img_public_read"
ON storage.objects FOR SELECT
USING ( bucket_id = 'chatgpt-imagens' );

DROP POLICY IF EXISTS "chatgpt_img_insert" ON storage.objects;
CREATE POLICY "chatgpt_img_insert"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'chatgpt-imagens' );
