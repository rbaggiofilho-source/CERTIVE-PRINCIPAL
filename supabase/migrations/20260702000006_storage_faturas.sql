-- Criação de um Bucket Público chamado "faturas" no Storage do Supabase
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'faturas', 
    'faturas', 
    true, 
    false, 
    10485760, -- 10MB limit
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Configurar Políticas de RLS (Security) para permitir acesso anônimo/leitura
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'faturas' );

-- Permitir inserts com anon/authenticated
CREATE POLICY "Anon/Auth Insert" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'faturas' );
