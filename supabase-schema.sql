-- ================================================
-- CERTIVE VISTORIAS — Supabase PostgreSQL Schema
-- Execute este SQL no SQL Editor do Supabase
-- ================================================

-- 1. Unidades (Filiais da Empresa)
CREATE TABLE unidades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco TEXT NOT NULL
);

-- 2. Serviços (Catálogo de Vistorias)
CREATE TABLE servicos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  porte TEXT NOT NULL DEFAULT 'N/A',
  "precoBalcao" DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- 3. Taxas de Referência (Custos DETRAN por serviço)
CREATE TABLE taxas_referencia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "servicoId" BIGINT NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  taxa DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- 4. Operadores (Usuários do Sistema)
CREATE TABLE operadores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  funcao TEXT NOT NULL,
  "unidadeId" BIGINT REFERENCES unidades(id),
  permissoes TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Parceiros (Clientes Corporativos Conveniados)
CREATE TABLE parceiros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  responsavel TEXT,
  telefone TEXT,
  "usaFaturamento" BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  "tabelaPrecos" JSONB DEFAULT '{}'
);

-- 6. Ordens de Serviço (Fichas de Atendimento)
CREATE TABLE ordens_servico (
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
  "veiculoChassi" TEXT,
  "veiculoMarcaModelo" TEXT,
  "veiculoAno" TEXT,
  "clienteEndereco" TEXT,
  "osFinalidade" TEXT,
  "servicoId" BIGINT REFERENCES servicos(id),
  "servicoNome" TEXT,
  valor DECIMAL(10,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  "formaPagamento" TEXT,
  parcelas INTEGER DEFAULT 1,
  "statusNfse" TEXT DEFAULT 'Não solicitada',
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
  "faturaId" BIGINT,
  "contratoTexto" TEXT,
  "contratoHash" TEXT,
  "contratoAceitoEm" TIMESTAMPTZ
);

-- 7. Caixa Diário (Controle Diário de Caixa)
CREATE TABLE caixa_diario (
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

-- 8. Caixa Movimentos (Transações de Fluxo de Caixa)
CREATE TABLE caixa_movimentos (
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

-- 9. Contas a Pagar (Despesas Financeiras)
CREATE TABLE contas_pagar (
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

-- 10. Faturas (Invoices Corporativas Mensais)
CREATE TABLE faturas (
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

-- 11. Auditoria (Trilha de Logs Gerenciais)
CREATE TABLE auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operador TEXT NOT NULL,
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acao TEXT NOT NULL,
  descricao TEXT,
  "unidadeId" BIGINT REFERENCES unidades(id)
);


-- ================================================
-- INDEXES para performance
-- ================================================
CREATE INDEX idx_os_unidade ON ordens_servico("unidadeId");
CREATE INDEX idx_os_placa ON ordens_servico(placa);
CREATE INDEX idx_os_status ON ordens_servico(status);
CREATE INDEX idx_os_criado ON ordens_servico("criadoEm");
CREATE INDEX idx_os_parceiro ON ordens_servico("parceiroId");
CREATE INDEX idx_os_fatura ON ordens_servico("faturaId");
CREATE INDEX idx_caixa_unidade_data ON caixa_diario("unidadeId", data);
CREATE INDEX idx_movimentos_caixa ON caixa_movimentos("caixaId");
CREATE INDEX idx_contas_unidade ON contas_pagar("unidadeId");
CREATE INDEX idx_contas_vencimento ON contas_pagar(vencimento);
CREATE INDEX idx_faturas_parceiro ON faturas("parceiroId");
CREATE INDEX idx_faturas_unidade ON faturas("unidadeId");
CREATE INDEX idx_auditoria_data ON auditoria(data);
CREATE INDEX idx_auditoria_unidade ON auditoria("unidadeId");
CREATE INDEX idx_operadores_login ON operadores(login);


-- ================================================
-- ROW LEVEL SECURITY (Políticas Permissivas)
-- ================================================
-- Fase inicial: acesso total via anon key
-- TODO: restringir quando implementar Supabase Auth

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

-- Políticas permissivas para todas as tabelas
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
