-- ================================================
-- CERTIVE VISTORIAS — Supabase Migration SQL
-- Execute este SQL no SQL Editor do Supabase
-- para adicionar as colunas e tabelas necessárias
-- para o funcionamento do Contrato e Portarias.
-- ================================================

-- 1. Nova Tabela: Portarias por UF
CREATE TABLE IF NOT EXISTS portarias_uf (
  uf TEXT PRIMARY KEY,
  portaria TEXT NOT NULL
);

-- Habilitar RLS para portarias_uf
ALTER TABLE portarias_uf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_portarias" ON portarias_uf FOR ALL USING (true) WITH CHECK (true);

-- 2. Nova Tabela: Metas de Despesas (BI / Assessor Financeiro)
CREATE TABLE IF NOT EXISTS metas_despesas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "unidadeId" BIGINT REFERENCES unidades(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  meta DECIMAL(10,2) NOT NULL,
  CONSTRAINT uq_unidade_categoria UNIQUE ("unidadeId", categoria)
);

-- Habilitar RLS para metas_despesas
ALTER TABLE metas_despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_metas" ON metas_despesas FOR ALL USING (true) WITH CHECK (true);

-- 3. Adicionar Colunas Faltantes na Tabela ordens_servico (Dados do Veículo e Assinatura Eletrônica)
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "clienteEndereco" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "osFinalidade" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "veiculoChassi" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "veiculoMarcaModelo" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "veiculoAno" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "contratoTexto" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "contratoHash" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "contratoAceitoEm" TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "parcelas" INTEGER;

-- Colunas fiscais (NFS-e)
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "statusNfse" TEXT NOT NULL DEFAULT 'Não solicitada';
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "numeroNfse" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "dataNfse" DATE;

-- 4. Adicionar Colunas de Comprovantes e Anexos
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "comprovante" TEXT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "codigoBarras" TEXT;

-- 5. Semear dados iniciais de portarias (opcional se vazio)
INSERT INTO portarias_uf (uf, portaria) VALUES 
('SC', 'Portaria DETRAN-SC nº 465/2023'),
('SP', 'Portaria DETRAN-SP nº 123/2023'),
('PR', 'Portaria DETRAN-PR nº 789/2023')
ON CONFLICT (uf) DO NOTHING;

-- 6. Adicionar Colunas Faltantes na Tabela unidades (Dados de Credenciamento e Ouvidoria)
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "razao_social" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "credenciamento" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "uf" TEXT DEFAULT 'SC';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "canal_ouvidoria" TEXT;

-- Atualizar dados das unidades pré-existentes
UPDATE unidades SET 
  "razao_social" = 'Certive Vistorias Automotivas Ltda',
  "cnpj" = '45.890.122/0001-08',
  "credenciamento" = 'ECV-2023-091',
  "cidade" = 'São José',
  "uf" = 'SC',
  "canal_ouvidoria" = 'ouvidoria@certive.com.br'
WHERE id = 1;

UPDATE unidades SET 
  "razao_social" = 'Certive Vistorias Automotivas Ltda',
  "cnpj" = '45.890.122/0002-99',
  "credenciamento" = 'ECV-2023-142',
  "cidade" = 'Palhoça',
  "uf" = 'SC',
  "canal_ouvidoria" = 'ouvidoria@certive.com.br'
WHERE id = 2;

