-- Pendências de baixa retroativa: quando o comprovante chega hoje mas o
-- pagamento foi feito num dia cujo caixa já está FECHADO. A baixa da fatura
-- é registrada na hora, mas o lançamento no caixa daquele dia fica pendente
-- até um Master reabrir o caixa, lançar e re-fechar.
CREATE TABLE IF NOT EXISTS baixas_faturas_pendentes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "faturaId" BIGINT REFERENCES faturas(id),
  "caixaId" BIGINT REFERENCES caixa_diario(id),
  "unidadeId" BIGINT REFERENCES unidades(id),
  valor DECIMAL(10,2) NOT NULL,
  "dataPagamento" DATE NOT NULL,
  "formaPagamento" TEXT NOT NULL DEFAULT 'transferencia',
  descricao TEXT,
  resolvido BOOLEAN NOT NULL DEFAULT FALSE,
  "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "criadoPor" TEXT,
  "resolvidoEm" TIMESTAMPTZ,
  "resolvidoPor" TEXT
);

ALTER TABLE baixas_faturas_pendentes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "allow_all_baixas_pendentes" ON baixas_faturas_pendentes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quem registrou a baixa (usado no PDF e no histórico).
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS "pagoPor" TEXT;
