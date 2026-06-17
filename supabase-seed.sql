-- ================================================
-- CERTIVE VISTORIAS — Seed Data (Dados Iniciais)
-- Executar APÓS o schema estar criado
-- ================================================

-- 1. Unidades (Filiais)
INSERT INTO unidades (id, nome, endereco) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Certive Matriz — São José', 'Rua das Camélias - Kobrasol SC'),
  (2, 'Certive Filial — Palhoça', 'Avenida Atílio Pagani, 850, Palhoça - SC');

SELECT setval(pg_get_serial_sequence('unidades', 'id'), (SELECT MAX(id) FROM unidades));

-- 2. Serviços (Catálogo de Vistorias)
INSERT INTO servicos (id, categoria, nome, porte, "precoBalcao") OVERRIDING SYSTEM VALUE VALUES
  (1, 'Transferência', 'Vistoria de Transferência — Pequeno Porte', 'Pequeno', 150.00),
  (2, 'Transferência', 'Vistoria de Transferência — Médio Porte', 'Médio', 200.00),
  (3, 'Transferência', 'Vistoria de Transferência — Grande Porte', 'Grande', 280.00),
  (4, 'Cautelar', 'Vistoria Cautelar', 'N/A', 180.00),
  (5, 'Pesquisa', 'Pesquisa Veicular', 'N/A', 120.00),
  (6, 'Exótico', 'Carros exóticos', 'N/A', 0.00);

SELECT setval(pg_get_serial_sequence('servicos', 'id'), (SELECT MAX(id) FROM servicos));

-- 3. Taxas de Referência (Custos DETRAN-SC)
INSERT INTO taxas_referencia ("servicoId", taxa) VALUES
  (1, 27.00),
  (2, 27.00),
  (3, 27.00),
  (4, 10.00),
  (5, 5.00),
  (6, 0.00);

-- 4. Operadores (Usuários do Sistema)
INSERT INTO operadores (id, nome, login, senha, funcao, "unidadeId", permissoes, ativo) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Ricardo Administrador', 'admin', 'admin123', 'Gerente Geral', 1, ARRAY['abertura_os','caixa','faturamento','contas','cadastros','bi'], TRUE),
  (2, 'Ana Atendente', 'atendente', 'atendente123', 'Atendente', 1, ARRAY['abertura_os','caixa'], TRUE),
  (3, 'Carlos Financeiro', 'financeiro', 'financeiro123', 'Analista Financeiro', 1, ARRAY['caixa','faturamento','contas'], TRUE);

SELECT setval(pg_get_serial_sequence('operadores', 'id'), (SELECT MAX(id) FROM operadores));

-- 5. Parceiros (Clientes Corporativos)
INSERT INTO parceiros (id, nome, cnpj, responsavel, telefone, "usaFaturamento", observacoes, "tabelaPrecos") OVERRIDING SYSTEM VALUE VALUES
  (1, 'Autocentro Veículos', '12.345.678/0001-90', 'Marcos Almeida', '(48) 3222-1111', TRUE,
   'Parceiro prioritário da região de São José.',
   '{"1": 130.00, "2": 180.00, "3": 250.00, "4": 150.00, "5": 100.00}'::jsonb),
  (2, 'Despachante Silva', '98.765.432/0001-10', 'Roberto Silva', '(48) 3333-4444', TRUE,
   'Pagamento faturado quinzenalmente.',
   '{"1": 140.00, "2": 190.00, "3": 260.00, "4": 160.00, "5": 110.00}'::jsonb),
  (3, 'Giga Car Multimarcas', '11.222.333/0001-44', 'Carlos Giga', '(48) 3444-5555', FALSE,
   'Não aceita faturamento. Pagamentos somente à vista.',
   '{"1": 135.00, "2": 185.00, "3": 255.00, "4": 155.00, "5": 105.00}'::jsonb);

SELECT setval(pg_get_serial_sequence('parceiros', 'id'), (SELECT MAX(id) FROM parceiros));
