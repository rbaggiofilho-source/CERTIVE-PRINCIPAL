-- ====================================================================
-- CERTIVE VISTORIAS — CONFIGURAÇÃO DA FUNÇÃO COMBO & SOLICITANTES
-- Execute este script no SQL Editor do painel do Supabase online.
-- ====================================================================

-- 1. Adicionar colunas de preços do combo na tabela 'parceiros'
ALTER TABLE parceiros ADD COLUMN IF NOT EXISTS "precoCombo" DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE parceiros ADD COLUMN IF NOT EXISTS "precoComboTransferencia" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- 2. Criar tabela 'solicitantes_parceiros' para os solicitantes recorrentes
CREATE TABLE IF NOT EXISTS solicitantes_parceiros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "parceiroId" BIGINT NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  celular TEXT NOT NULL,
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS) para a nova tabela
ALTER TABLE solicitantes_parceiros ENABLE ROW LEVEL SECURITY;

-- Criar política de acesso total para solicitantes
CREATE POLICY "allow_all_solicitantes" ON solicitantes_parceiros FOR ALL USING (true) WITH CHECK (true);

-- 3. Inserir novos serviços de Combo (Vistoria Combo e Vistoria de Transferência Combo)
INSERT INTO servicos (id, categoria, nome, porte, "precoBalcao") OVERRIDING SYSTEM VALUE VALUES
(7, 'Cautelar', 'Vistoria Combo', 'N/A', 180.00),
(8, 'Transferência', 'Vistoria de Transferência Combo', 'N/A', 150.00)
ON CONFLICT (id) DO NOTHING;

-- 4. Adicionar taxas de referência padrão para os novos serviços (opcional)
INSERT INTO taxas_referencia ("servicoId", taxa) VALUES
(7, 0.00),
(8, 40.50)
ON CONFLICT DO NOTHING;
