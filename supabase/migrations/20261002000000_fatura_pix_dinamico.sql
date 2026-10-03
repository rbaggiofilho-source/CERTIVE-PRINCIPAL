-- QR Code PIX dinâmico do Asaas na fatura (com validade real).
-- Antes, a fatura mostrava um PIX estático montado no cliente (sem validade e
-- sem travar o valor). Agora guardamos o "kit PIX" da cobrança do Asaas:
--   asaas_pix_qr      -> imagem do QR em base64 (PNG, sem prefixo data:)
--   asaas_pix_payload -> PIX copia-e-cola da cobrança
--   asaas_pix_expira  -> data/hora em que o QR expira (texto, como vem do Asaas)
-- São campos pequenos (QR ~poucos KB); não entram na lista de campos pesados.

alter table public.faturas add column if not exists asaas_pix_qr text;
alter table public.faturas add column if not exists asaas_pix_payload text;
alter table public.faturas add column if not exists asaas_pix_expira text;
