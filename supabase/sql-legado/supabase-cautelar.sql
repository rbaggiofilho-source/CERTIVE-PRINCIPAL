-- Migration script for Cautelar module in Supabase/PostgreSQL

-- 1. Table for db.cautelares
CREATE TABLE IF NOT EXISTS public.cautelares (
    id SERIAL PRIMARY KEY,
    os_id INTEGER NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
    dossie_numero VARCHAR(30) UNIQUE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'aguardando_inicio',
    vistoriador_id INTEGER REFERENCES public.operadores(id) ON DELETE SET NULL,
    finalizado_por_id INTEGER REFERENCES public.operadores(id) ON DELETE SET NULL,
    data_hora_inicio TIMESTAMP WITH TIME ZONE,
    data_hora_envio TIMESTAMP WITH TIME ZONE,
    data_hora_finalizacao TIMESTAMP WITH TIME ZONE,
    parecer_consolidado VARCHAR(30),
    parecer_texto TEXT,
    pdf_url TEXT,
    pdf_hash VARCHAR(64)
);

-- 2. Table for db.cautelares_secoes
CREATE TABLE IF NOT EXISTS public.cautelares_secoes (
    id SERIAL PRIMARY KEY,
    cautelar_id INTEGER NOT NULL REFERENCES public.cautelares(id) ON DELETE CASCADE,
    numero_secao INTEGER NOT NULL CHECK (numero_secao BETWEEN 1 AND 8),
    nome_secao VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'nao_iniciada',
    dados_json JSONB,
    parecer_secao VARCHAR(30),
    observacao_texto TEXT,
    data_hora_completada TIMESTAMP WITH TIME ZONE
);

-- Create index for faster sections retrieval by Cautelar
CREATE INDEX IF NOT EXISTS idx_cautelares_secoes_cautelar_id ON public.cautelares_secoes(cautelar_id);

-- 3. Table for db.cautelares_fotos
CREATE TABLE IF NOT EXISTS public.cautelares_fotos (
    id SERIAL PRIMARY KEY,
    secao_id INTEGER NOT NULL REFERENCES public.cautelares_secoes(id) ON DELETE CASCADE,
    slot_codigo VARCHAR(50) NOT NULL,
    slot_nome_display VARCHAR(100) NOT NULL,
    url_original TEXT,
    url_thumb TEXT,
    data_hora_captura TIMESTAMP WITH TIME ZONE,
    metadados JSONB,
    ordem_exibicao INTEGER NOT NULL DEFAULT 0
);

-- Create index for faster photos lookup by Section
CREATE INDEX IF NOT EXISTS idx_cautelares_fotos_secao_id ON public.cautelares_fotos(secao_id);

-- 4. Table for db.cautelares_pesquisas
CREATE TABLE IF NOT EXISTS public.cautelares_pesquisas (
    id SERIAL PRIMARY KEY,
    cautelar_id INTEGER NOT NULL REFERENCES public.cautelares(id) ON DELETE CASCADE,
    fonte VARCHAR(30) NOT NULL,
    data_hora_consulta TIMESTAMP WITH TIME ZONE,
    token_consulta VARCHAR(100),
    codigo_consulta VARCHAR(100),
    dados_json JSONB,
    status_consolidado VARCHAR(30) NOT NULL
);

-- Enable RLS (Row Level Security) if not already configured globally
-- ALTER TABLE public.cautelares ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.cautelares_secoes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.cautelares_fotos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.cautelares_pesquisas ENABLE ROW LEVEL SECURITY;
