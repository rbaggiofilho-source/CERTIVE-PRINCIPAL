# Pendências de segurança (adiadas a pedido)

Itens da auditoria de 28/09/2026 que ficaram para depois, por decisão do
responsável. Nada aqui foi alterado ainda.

## Fase 0 — configuração (sem código)

| # | O que fazer | Onde |
|---|---|---|
| 0.1 | Gerar uma chave nova da OpenAI, trocar o segredo `OPENAI_API_KEY` das funções e desativar a chave antiga. A antiga ficou gravada nas configurações e já foi apagada do banco. | platform.openai.com → API keys; Supabase → Edge Functions → Secrets |
| 0.2 | Trocar o token da consulta de placas e guardá-lo como segredo do servidor. Hoje ele está escrito no código da função `consultar-placa`, que responde sem login. | Painel do consultarplaca; Supabase → Edge Functions → Secrets |
| 0.3 | Confirmar que o cadastro público de usuários está desligado. Se estiver ligado, qualquer pessoa cria conta e tem acesso ao banco. | Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" |
| 0.4 | Confirmar que o segredo `ASAAS_WEBHOOK_TOKEN` está configurado e é o mesmo cadastrado no Asaas. Sem ele, qualquer um pode chamar o webhook e marcar faturas como pagas. | Supabase → Edge Functions → Secrets; Asaas → Integrações → Webhooks |
| 0.5 | Ligar a proteção contra senhas vazadas e subir a senha mínima para 10 caracteres. | Supabase → Authentication → Policies / Passwords |

## Fase 1 — código

1. **Permissões de verdade no banco.** Hoje as 26 tabelas liberam tudo para
   qualquer usuário logado (`using (true)`). É preciso criar regras por função
   e por unidade, deixar a tabela de operadores alterável só por administrador
   e a auditoria só aceitando registros novos. Também é preciso tirar a
   liberação de exclusão de OS para qualquer operador com "Ricardo" no nome
   (`deleteOS` em `app_v8.js`).
2. **Funções do servidor sem login.** `generate-asaas-billing`,
   `cancel-asaas-billing`, `send-invoice-forward` e `consultar-placa`
   (`verify_jwt = false`) respondem sem login. Elas devem exigir login e
   permissão, validar as entradas e limitar o número de chamadas.
6. **Custo da OpenAI sem limite.** `gerar-laudo` e `orientar-foto` só conferem
   se há alguém logado. Elas devem conferir a unidade do operador e limitar o
   uso por usuário e por dia. A `orientar-foto` deve aceitar só fotos do
   próprio sistema.
7. **Notificação push.** Qualquer usuário logado pode enviar notificação com
   link externo aos administradores (`send-push`). Deve ser só administrador,
   e só com links internos.

## Passos que dependem do merge desta branch

- Aplicar a migração `supabase/migrations/20260928030000_storage_privado.sql`,
  que deixa os depósitos de fotos e faturas privados. Ela só pode ser
  aplicada depois que o site novo estiver no ar, porque o site antigo usa os
  endereços públicos.
- Em GitHub → Settings → Pages → Source, escolher "GitHub Actions". A
  publicação passa a ser feita por `.github/workflows/publicar-site.yml`, que
  publica só os arquivos do site.
