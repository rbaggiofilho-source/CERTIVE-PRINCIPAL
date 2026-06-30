-- ================================================
-- CERTIVE VISTORIAS — COMBINED INITIAL SETUP & MIGRATIONS
-- Execute este script completo no SQL Editor do Supabase 
-- para criar todas as tabelas e dados iniciais necessários.
-- ================================================

-- 1. DROP TABELAS (Caso queira limpar lixo existente, descomente se necessário)
-- DROP TABLE IF EXISTS metas_despesas CASCADE;
-- DROP TABLE IF EXISTS portarias_uf CASCADE;
-- DROP TABLE IF EXISTS auditoria CASCADE;
-- DROP TABLE IF EXISTS faturas CASCADE;
-- DROP TABLE IF EXISTS contas_pagar CASCADE;
-- DROP TABLE IF EXISTS caixa_movimentos CASCADE;
-- DROP TABLE IF EXISTS caixa_diario CASCADE;
-- DROP TABLE IF EXISTS ordens_servico CASCADE;
-- DROP TABLE IF EXISTS parceiros CASCADE;
-- DROP TABLE IF EXISTS operadores CASCADE;
-- DROP TABLE IF EXISTS taxas_referencia CASCADE;
-- DROP TABLE IF EXISTS servicos CASCADE;
-- DROP TABLE IF EXISTS unidades CASCADE;

-- 2. CRIAR ESTRUTURA BASE (schema.sql)
CREATE TABLE IF NOT EXISTS unidades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS servicos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  porte TEXT NOT NULL DEFAULT 'N/A',
  "precoBalcao" DECIMAL(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taxas_referencia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "servicoId" BIGINT NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  taxa DECIMAL(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS operadores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  funcao TEXT NOT NULL,
  "unidadeId" BIGINT REFERENCES unidades(id),
  permissoes TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS parceiros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  responsavel TEXT,
  telefone TEXT,
  "usaFaturamento" BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  "tabelaPrecos" JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ordens_servico (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero TEXT NOT NULL,
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "criadoPor" TEXT NOT NULL,
  "unidadeId" BIGINT REFERENCES unidades(id),
  "clienteTipo" TEXT NOT NULL CHECK ("clienteTipo" IN ('particular', 'parceiro')),
  "parceiroId" BIGINT REFERENCES parceiros(id),
  "clienteNome" TEXT NOT NULL,
  "clienteCpfCnpj" TEXT,
  "clienteCelular" TEXT,
  placa TEXT NOT NULL,
  renavam TEXT,
  "servicoId" BIGINT REFERENCES servicos(id),
  "servicoNome" TEXT,
  valor DECIMAL(10,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  "formaPagamento" TEXT,
  "detranRegistrado" BOOLEAN NOT NULL DEFAULT FALSE,
  "docVeiculoApresentado" BOOLEAN NOT NULL DEFAULT FALSE,
  "docIdentificacaoApresentado" BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','paga','em_execucao','concluida_aprovada','concluida_reprovada','cancelada')),
  "finalizadoEm" TIMESTAMPTZ,
  "finalizadoPor" TEXT,
  "canceladoEm" TIMESTAMPTZ,
  "canceladoPor" TEXT,
  "reapresentacaoOrigemID" BIGINT,
  "respostaDetranNet" TEXT,
  "respostaShopping" TEXT,
  "reapresentadaData" TIMESTAMPTZ,
  "faturaId" BIGINT
);

CREATE TABLE IF NOT EXISTS caixa_diario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "unidadeId" BIGINT REFERENCES unidades(id),
  data DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  "abertoPor" TEXT NOT NULL,
  "fechadoPor" TEXT,
  "fechadoEm" TIMESTAMPTZ,
  "saldoAbertura" DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  "saldoEspécieInformado" DECIMAL(10,2) DEFAULT 0,
  "relatorioDetran" TEXT
);

CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "caixaId" BIGINT REFERENCES caixa_diario(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  valor DECIMAL(10,2) NOT NULL,
  descricao TEXT,
  "formaPagamento" TEXT,
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operador TEXT NOT NULL,
  "osId" BIGINT,
  "faturaId" BIGINT
);

CREATE TABLE IF NOT EXISTS contas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "unidadeId" BIGINT REFERENCES unidades(id),
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fixo', 'variavel')),
  vencimento DATE NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  observacoes TEXT,
  anexo TEXT,
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  "pagoEm" DATE,
  recorrente BOOLEAN NOT NULL DEFAULT FALSE,
  frequencia TEXT CHECK (frequencia IN ('semanal', 'mensal', 'anual')),
  "recorrenciaGrupoId" BIGINT
);

CREATE TABLE IF NOT EXISTS faturas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo TEXT NOT NULL,
  "parceiroId" BIGINT REFERENCES parceiros(id),
  "unidadeId" BIGINT REFERENCES unidades(id),
  "periodoInicio" DATE,
  "periodoFim" DATE,
  "valorTotal" DECIMAL(10,2) NOT NULL,
  "ordensIds" BIGINT[] DEFAULT '{}',
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  "pagoEm" TIMESTAMPTZ,
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "criadoPor" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operador TEXT NOT NULL,
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acao TEXT NOT NULL,
  descricao TEXT,
  "unidadeId" BIGINT REFERENCES unidades(id)
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_os_unidade ON ordens_servico("unidadeId");
CREATE INDEX IF NOT EXISTS idx_os_placa ON ordens_servico(placa);
CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_criado ON ordens_servico("criadoEm");
CREATE INDEX IF NOT EXISTS idx_caixa_unidade_data ON caixa_diario("unidadeId", data);
CREATE INDEX IF NOT EXISTS idx_movimentos_caixa ON caixa_movimentos("caixaId");

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxas_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_unidades" ON unidades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_servicos" ON servicos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_taxas" ON taxas_referencia FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_operadores" ON operadores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_parceiros" ON parceiros FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_os" ON ordens_servico FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_caixa" ON caixa_diario FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_movimentos" ON caixa_movimentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_contas" ON contas_pagar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_faturas" ON faturas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_auditoria" ON auditoria FOR ALL USING (true) WITH CHECK (true);

-- 5. NOVAS TABELAS & COLUNAS DE MIGRACAO
CREATE TABLE IF NOT EXISTS portarias_uf (
  uf TEXT PRIMARY KEY,
  portaria TEXT NOT NULL
);
ALTER TABLE portarias_uf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_portarias" ON portarias_uf FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS metas_despesas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "unidadeId" BIGINT REFERENCES unidades(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  meta DECIMAL(10,2) NOT NULL,
  CONSTRAINT uq_unidade_categoria UNIQUE ("unidadeId", categoria)
);
ALTER TABLE metas_despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_metas" ON metas_despesas FOR ALL USING (true) WITH CHECK (true);

-- Adicionar colunas extras na estrutura
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "clienteEndereco" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "osFinalidade" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "veiculoChassi" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "veiculoMarcaModelo" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "veiculoAno" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "contratoTexto" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "contratoHash" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "contratoAceitoEm" TIMESTAMPTZ;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "parcelas" INTEGER;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "statusNfse" TEXT NOT NULL DEFAULT 'Não solicitada';
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "numeroNfse" TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS "dataNfse" DATE;

ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "comprovante" TEXT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS "codigoBarras" TEXT;

ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "razao_social" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "credenciamento" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "uf" TEXT DEFAULT 'SC';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS "canal_ouvidoria" TEXT;

-- 6. SEMEAR DADOS INICIAIS
-- Unidades
INSERT INTO unidades (id, nome, endereco, razao_social, cnpj, credenciamento, cidade, uf, canal_ouvidoria) OVERRIDING SYSTEM VALUE VALUES
(1, 'Certive Matriz — São José', 'Av. Presidente Kennedy, 1200 - Campinas, São José - SC', 'Certive Vistorias Automotivas Ltda', '45.890.122/0001-08', 'ECV-2023-091', 'São José', 'SC', 'ouvidoria@certive.com.br'),
(2, 'Certive Filial — Palhoça', 'Rua Prefeito Hilvestre Piazza, 450 - Centro, Palhoça - SC', 'Certive Vistorias Automotivas Ltda', '45.890.122/0002-99', 'ECV-2023-142', 'Palhoça', 'SC', 'ouvidoria@certive.com.br')
ON CONFLICT (id) DO NOTHING;

-- Serviços
INSERT INTO servicos (id, categoria, nome, porte, "precoBalcao") OVERRIDING SYSTEM VALUE VALUES
(1, 'Transferência', 'VISTORIA DE TRANSFERÊNCIA — PEQUENO PORTE', 'Pequeno', 150.00),
(2, 'Transferência', 'VISTORIA DE TRANSFERÊNCIA — MÉDIO PORTE', 'Médio', 200.00),
(3, 'Transferência', 'VISTORIA DE TRANSFERÊNCIA — GRANDE PORTE', 'Grande', 280.00),
(4, 'Cautelar', 'VISTORIA CAUTELAR HÍBRIDA', 'N/A', 180.00),
(5, 'Pesquisa', 'PESQUISA VEICULAR HISTÓRICA COMPLETA', 'N/A', 120.00),
(6, 'Reteste', 'RETESTE DE VISTORIA REPROVADA (GRATUITO)', 'N/A', 0.00)
ON CONFLICT (id) DO NOTHING;

-- Taxas
INSERT INTO taxas_referencia ("servicoId", taxa) VALUES
(1, 40.50),
(2, 40.50),
(3, 60.00),
(4, 0.00),
(5, 15.00),
(6, 0.00);

-- Operadores (senha admin123 e atendente123)
INSERT INTO operadores (id, nome, login, senha, funcao, "unidadeId", permissoes, ativo) OVERRIDING SYSTEM VALUE VALUES
(1, 'Ricardo Administrador', 'admin', 'admin123', 'Gerente Geral', 1, ARRAY['abertura_os', 'caixa', 'faturamento', 'contas', 'cadastros', 'bi'], TRUE),
(2, 'Ana Atendente', 'atendente', 'atendente123', 'Atendente', 1, ARRAY['abertura_os', 'caixa'], TRUE)
ON CONFLICT (login) DO NOTHING;

-- Portarias
INSERT INTO portarias_uf (uf, portaria) VALUES 
('SC', 'Portaria DETRAN-SC nº 465/2023'),
('SP', 'Portaria DETRAN-SP nº 123/2023'),
('PR', 'Portaria DETRAN-PR nº 789/2023')
ON CONFLICT (uf) DO NOTHING;
