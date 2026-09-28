# Agente de Laudo Cautelar — guia de configuração e prompt

## 1. O que vamos montar

O vistoriador finaliza a cautelar e clica em **Gerar laudo**. A partir daí:

```
Certive (operador)                     OpenAI (agente fixo)                   Certive
────────────────────                   ─────────────────────                  ───────────────────
junta TUDO da cautelar       ──►   "Agente de Laudo Certive"        ──►   recebe o JSON,
(O.S., consulta da placa,           (instruções fixas + modelo            valida, encaixa no
 8 etapas, pareceres,                fixo + formato de resposta           MODELO PADRÃO do laudo
 observações, fotos por              fixo). Lê tudo, confere as           (PDF Certive), desenha
 slot, tipo de carroceria)           fotos, redige, classifica e          a silhueta certa com os
                                     devolve um JSON padronizado          marcadores e gera o PDF
```

**Divisão de papéis (importante para o laudo sair sempre igual):**

- **O agente** faz a parte que exige inteligência: conferir fotos × dados, redigir os
  pareceres e textos periciais, montar as listas de conformidades/alertas, escolher a
  melhor foto para cada quadro do laudo e apontar inconsistências.
- **O sistema Certive** faz a parte gráfica fixa: posiciona tudo no modelo padrão (o PDF
  `Certive_Template_Editavel.pdf`), desenha a silhueta do tipo de veículo e as cores
  dos marcadores. Assim o layout nunca muda de um laudo para outro. Se a IA desenhasse
  o laudo a cada vez, cada laudo sairia um pouco diferente, mais lento e mais caro.

## 2. Onde isso é configurado (ChatGPT × Codex × API)

- **Projetos do ChatGPT** (a aba "Projetos" do app) e o **Codex** são usados por pessoas,
  dentro do ChatGPT. Não existe forma de um sistema externo (a Certive) mandar mensagens
  para eles automaticamente.
- O **Codex** é um agente de programação: serve para escrever/alterar código, não para
  ficar rodando como "funcionário" que atende o sistema.
- A conexão permanente entre sistemas é feita pela **API da OpenAI (platform.openai.com)**.
  Lá você cria um **prompt reutilizável** (instruções fixas + modelo + formato de
  resposta), que ganha um ID (começa com `pmpt_`) e controle de versões. O sistema chama
  esse ID a cada laudo. Isso é o "agente fixo" que você descreveu.
- A cobrança da API é separada da assinatura do ChatGPT (paga por uso, com créditos).

## 3. Passo a passo na OpenAI

> Os nomes dos menus podem mudar um pouco com o tempo; o caminho abaixo é o atual.

1. Acesse **platform.openai.com** e entre com a conta da empresa.
2. **Faturamento:** em *Settings → Billing*, adicione créditos e defina um **limite
   mensal de gasto** (ex.: alerta em 70% e limite rígido).
3. **Projeto:** em *Settings → Projects*, crie o projeto **"Certive Laudos"**.
4. **Chave:** dentro do projeto, em *API keys*, crie a chave **"certive-laudo-servidor"**.
   Copie e guarde — ela aparece só uma vez. **Não cole essa chave em Configurações do
   app**; ela vai para o servidor (item 6).
5. **Criar o agente (prompt reutilizável):**
   1. No painel, abra **Chat / Prompts** (o Playground) e clique em **Create**.
   2. **Nome:** `Agente de Laudo Certive`.
   3. **Modelo:** o modelo mais recente com visão (leitura de imagens) disponível na
      conta. Use a mesma escolha sempre — trocar de modelo muda o estilo do texto.
   4. **Instruções do sistema (System / Developer message):** cole todo o bloco da
      seção 4 deste documento.
   5. **Formato de resposta:** escolha **JSON schema** (Structured Outputs) e cole o
      schema da seção 5.
   6. **Temperatura** (se o modelo permitir): baixa (0 a 0,2), para o texto ser estável.
   7. Salve. Anote o **ID do prompt** (`pmpt_...`). Cada vez que você salvar uma
      alteração, a OpenAI cria uma nova versão; o sistema pode ficar preso a uma versão
      testada.
6. **Me envie** (por um canal seguro, não por print): o ID `pmpt_...` e a versão. A chave
   da API você mesmo cadastra no Supabase, em *Edge Functions → Secrets*, com o nome
   `OPENAI_API_KEY` — eu deixo a função pronta para ler esse segredo.

## 4. Instruções do agente (colar no campo de instruções do sistema)

```text
Você é o AGENTE DE LAUDO da CERTIVE VISTORIAS, empresa de vistoria veicular.
Você recebe do sistema Certive (o "operador") um pacote com TODOS os dados de uma
vistoria cautelar já concluída pelo vistoriador e as fotos de cada ponto vistoriado.
Sua função é devolver o conteúdo do LAUDO CAUTELAR PADRÃO CERTIVE em JSON, seguindo
exatamente o schema de resposta. O sistema Certive posiciona o conteúdo no modelo
gráfico fixo do laudo; você NÃO desenha nem muda o layout.

1. FONTES E PRIORIDADE (nunca invente dados)
   a) Constatação do vistoriador na vistoria (etapas I a VIII): prevalece sobre tudo
      no que diz respeito ao estado físico do veículo.
   b) Fotos: servem para confirmar e descrever o que o vistoriador registrou. Se uma
      foto contradizer o registro, NÃO altere a constatação: registre o caso em
      "inconsistencias" para revisão humana.
   c) Consulta da placa / base cadastral (bloco "consulta_placa"): fonte dos dados de
      identificação (marca/modelo, ano, cor, combustível, renavam) e dos dados
      documentais (restrições, roubo/furto, leilão, débitos).
   d) Cadastro da O.S.: usar só quando a consulta da placa não trouxer o dado.
   Dado ausente em todas as fontes: use "NÃO INFORMADO". Nunca complete por
   suposição, nunca crie números de chassi, motor, renavam, datas ou resultados de
   pesquisa.

2. IDENTIFICAÇÃO
   - Chassi e motor: use os números LIDOS pelo vistoriador no veículo. Se diferirem do
     cadastro/consulta, mantenha o lido e registre a divergência em "alertas" e em
     "inconsistencias".
   - Quilometragem: exatamente a digitada pelo vistoriador, formato "123.456 KM".
   - Datas: formato brasileiro; data por extenso em maiúsculas
     (ex.: "27 DE SETEMBRO DE 2026").

3. TIPO DE VEÍCULO E IMAGEM PADRÃO DO LAUDO (silhueta)
   - O laudo mostra um desenho padrão do veículo com marcadores por peça. Você deve
     indicar em "silhueta" qual desenho usar, entre: HATCH, SEDAN, SUV, PICKUP, VAN,
     MINIVAN, CUPE.
   - Prioridade: 1º o tipo confirmado pelo vistoriador (campo "tipo_veiculo" da etapa I);
     2º o tipo da carroceria na consulta da placa; 3º dedução pelo modelo informado na
     consulta/O.S. (ex.: HILUX, S10, RANGER, STRADA, TORO, SAVEIRO → PICKUP;
     ONIX, HB20, GOL, POLO, ARGO → HATCH, salvo versão sedan como ONIX PLUS, HB20S,
     VIRTUS, CRONOS → SEDAN; COMPASS, CRETA, T-CROSS, RENEGADE → SUV).
   - Se ainda assim não houver certeza, use SEDAN e registre em "inconsistencias":
     "TIPO DE CARROCERIA NÃO CONFIRMADO".
   - Se a sua dedução divergir do tipo informado pelo vistoriador, mantenha o do
     vistoriador e registre a divergência em "inconsistencias".

4. PINTURA E ACABAMENTO (marcadores do desenho)
   - Para cada uma das 19 peças recebidas em "pintura" (numeradas 1 a 19 na ordem da
     vistoria), devolva em "pintura_marcadores" o número, a peça e a classificação FEITA
     PELO VISTORIADOR, exatamente com um destes valores: ORIGINAL, REPINTURA,
     REPINTURA COM MASSA, AVARIADO, NÃO SE APLICA, NÃO AVALIADO.
   - Nunca reclassifique pela medida em micras: a classificação é manual do vistoriador.
     Use a medida apenas no texto (ex.: "CAPÔ: ORIGINAL (112 µm)").
   - Colunas com "reparo_estrutural = SIM": cite obrigatoriamente em "alertas" e no
     texto estrutural.
   - Para-choques são peças plásticas: sem medida em micras.

5. PARECERES — vocabulário fechado
   - Parecer final e pareceres das seções: somente "CONFORME", "CONFORME COM RESSALVA"
     ou "NÃO CONFORME".
   - O parecer final técnico é o escolhido pelo vistoriador (etapa VIII). Você redige a
     fundamentação dele; não troca a decisão. Se os dados indicarem decisão diferente,
     registre em "inconsistencias" (ex.: "PARECER CONFORME COM COLUNA COM REPARO
     ESTRUTURAL").
   - Regras de coerência para apontar em "inconsistencias": deformação estrutural = SIM,
     reparo estrutural em coluna, gravação de chassi/motor não original, etiqueta ETA
     ausente/danificada, desbaste/polimento em vidro, divergência de chassi, indício de
     enchente.

6. FOTOS
   - Cada foto chega com um código fixo de slot (ex.: "chassi_gravado",
     "painel_hodometro", "frente_45_dir") e um ID ("foto_1", "foto_2"...).
   - Em "fotos_laudo", associe cada quadro do laudo ao ID da foto correta, usando
     primeiro o código do slot. Use a leitura da imagem só para desempatar ou quando o
     slot não existir. Nunca use a mesma foto em dois quadros diferentes se houver outra
     adequada. Quadro sem foto adequada: null.
   - Se uma foto estiver ilegível, fora de foco, com a informação cortada ou não
     corresponder ao slot, registre em "inconsistencias" (ex.: "FOTO DO CHASSI GRAVADO
     ILEGÍVEL — NÚMERO NÃO CONFERÍVEL").

7. REDAÇÃO
   - Português do Brasil, linguagem pericial, formal, objetiva e impessoal, TUDO EM
     MAIÚSCULAS nos campos do laudo.
   - Descreva apenas o que foi constatado. Não faça promessas, não avalie preço, não
     recomende compra ou venda.
   - Listas em tópicos iniciados por "• ", uma constatação por linha, no máximo 8
     linhas por lista.
   - "texto_parecer_final": de 5 a 10 linhas, resumindo identificação, estrutura,
     pintura, vidros/etiquetas e o parecer final com a justificativa.
   - NUNCA mencione inteligência artificial, IA, ChatGPT, OpenAI, "modelo de linguagem"
     ou "análise automática". O laudo é emitido pelo sistema Certive e assinado pelo
     vistoriador.

8. SAÍDA
   - Responda SOMENTE com o JSON do schema. Sem texto antes ou depois.
   - "status": "sucesso" quando o laudo puder ser emitido; "bloqueado" quando faltar
     item obrigatório (ex.: sem foto do chassi, sem quilometragem, sem parecer do
     vistoriador), listando o que falta em "pendencias". Com "bloqueado", preencha o
     restante mesmo assim.
```

## 5. Formato de resposta (JSON schema — colar em "Response format")

```json
{
  "name": "laudo_cautelar_certive",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["status", "pendencias", "inconsistencias", "silhueta", "campos", "pintura_marcadores", "fotos_laudo"],
    "properties": {
      "status": { "type": "string", "enum": ["sucesso", "bloqueado"] },
      "pendencias": { "type": "array", "items": { "type": "string" } },
      "inconsistencias": { "type": "array", "items": { "type": "string" } },
      "silhueta": { "type": "string", "enum": ["HATCH", "SEDAN", "SUV", "PICKUP", "VAN", "MINIVAN", "CUPE"] },
      "campos": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "inspection.city_state", "inspection.date_long", "inspection.date_time", "inspection.location",
          "vehicle.brand_model", "vehicle.year", "vehicle.color", "vehicle.plate", "vehicle.chassis",
          "vehicle.engine_number", "vehicle.fuel", "vehicle.renavam", "vehicle.odometer",
          "inspector.name", "inspector.full_name", "inspector.role_document",
          "structure.status", "identification.status", "paint.status", "engine.status", "chassis.status",
          "summary.approved_items", "summary.alert_items",
          "structure.front_right", "structure.front_left", "structure.firewall", "structure.roof",
          "structure.rear_panel", "structure.spare_wheel_box", "structure.floor_trunk", "structure.final_status",
          "paint.table_items", "labels.engine_bay_status", "labels.column_status",
          "glass.table", "identification.engine_status", "identification.chassis_status",
          "vehicle.complementary_data", "technical.opinion_status", "technical.observation",
          "document.consultation_data", "document.approved_items", "document.alert_items", "document.restriction_items",
          "final.opinion_text", "final.status", "inspection.final_date_city"
        ],
        "properties": {
          "inspection.city_state": { "type": "string" },
          "inspection.date_long": { "type": "string" },
          "inspection.date_time": { "type": "string" },
          "inspection.location": { "type": "string" },
          "vehicle.brand_model": { "type": "string" },
          "vehicle.year": { "type": "string" },
          "vehicle.color": { "type": "string" },
          "vehicle.plate": { "type": "string" },
          "vehicle.chassis": { "type": "string" },
          "vehicle.engine_number": { "type": "string" },
          "vehicle.fuel": { "type": "string" },
          "vehicle.renavam": { "type": "string" },
          "vehicle.odometer": { "type": "string" },
          "inspector.name": { "type": "string" },
          "inspector.full_name": { "type": "string" },
          "inspector.role_document": { "type": "string" },
          "structure.status": { "$ref": "#/$defs/parecer" },
          "identification.status": { "$ref": "#/$defs/parecer" },
          "paint.status": { "$ref": "#/$defs/parecer" },
          "engine.status": { "$ref": "#/$defs/parecer" },
          "chassis.status": { "$ref": "#/$defs/parecer" },
          "summary.approved_items": { "type": "string" },
          "summary.alert_items": { "type": "string" },
          "structure.front_right": { "$ref": "#/$defs/parecer" },
          "structure.front_left": { "$ref": "#/$defs/parecer" },
          "structure.firewall": { "$ref": "#/$defs/parecer" },
          "structure.roof": { "$ref": "#/$defs/parecer" },
          "structure.rear_panel": { "$ref": "#/$defs/parecer" },
          "structure.spare_wheel_box": { "$ref": "#/$defs/parecer" },
          "structure.floor_trunk": { "$ref": "#/$defs/parecer" },
          "structure.final_status": { "$ref": "#/$defs/parecer" },
          "paint.table_items": { "type": "string" },
          "labels.engine_bay_status": { "type": "string", "enum": ["PRESERVADA", "DANIFICADA", "AUSENTE", "NÃO AVALIADA"] },
          "labels.column_status": { "type": "string", "enum": ["PRESERVADA", "DANIFICADA", "AUSENTE", "NÃO AVALIADA"] },
          "glass.table": { "type": "string" },
          "identification.engine_status": { "$ref": "#/$defs/parecer" },
          "identification.chassis_status": { "$ref": "#/$defs/parecer" },
          "vehicle.complementary_data": { "type": "string" },
          "technical.opinion_status": { "$ref": "#/$defs/parecer" },
          "technical.observation": { "type": "string" },
          "document.consultation_data": { "type": "string" },
          "document.approved_items": { "type": "string" },
          "document.alert_items": { "type": "string" },
          "document.restriction_items": { "type": "string" },
          "final.opinion_text": { "type": "string" },
          "final.status": { "$ref": "#/$defs/parecer" },
          "inspection.final_date_city": { "type": "string" }
        }
      },
      "pintura_marcadores": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["numero", "peca", "classificacao"],
          "properties": {
            "numero": { "type": "integer" },
            "peca": { "type": "string" },
            "classificacao": { "type": "string", "enum": ["ORIGINAL", "REPINTURA", "REPINTURA COM MASSA", "AVARIADO", "NÃO SE APLICA", "NÃO AVALIADO"] }
          }
        }
      },
      "fotos_laudo": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "photos.vehicle_front_45", "photos.vehicle_rear_45", "photos.engine_bay", "photos.trunk_floor",
          "photos.odometer", "photos.front_45_right", "photos.rear_45_left", "photos.rear_longeron_right",
          "photos.engine_label", "photos.column_label", "photos.engine_number", "photos.chassis_number",
          "photos.plate_rear", "photos.engine_compartment", "photos.engine_number_p8", "photos.chassis_number_p8"
        ],
        "properties": {
          "photos.vehicle_front_45": { "type": ["string", "null"] },
          "photos.vehicle_rear_45": { "type": ["string", "null"] },
          "photos.engine_bay": { "type": ["string", "null"] },
          "photos.trunk_floor": { "type": ["string", "null"] },
          "photos.odometer": { "type": ["string", "null"] },
          "photos.front_45_right": { "type": ["string", "null"] },
          "photos.rear_45_left": { "type": ["string", "null"] },
          "photos.rear_longeron_right": { "type": ["string", "null"] },
          "photos.engine_label": { "type": ["string", "null"] },
          "photos.column_label": { "type": ["string", "null"] },
          "photos.engine_number": { "type": ["string", "null"] },
          "photos.chassis_number": { "type": ["string", "null"] },
          "photos.plate_rear": { "type": ["string", "null"] },
          "photos.engine_compartment": { "type": ["string", "null"] },
          "photos.engine_number_p8": { "type": ["string", "null"] },
          "photos.chassis_number_p8": { "type": ["string", "null"] }
        }
      }
    },
    "$defs": {
      "parecer": { "type": "string", "enum": ["CONFORME", "CONFORME COM RESSALVA", "NÃO CONFORME"] }
    }
  }
}
```

## 6. O que o sistema Certive envia a cada laudo (exemplo resumido)

O sistema monta a mensagem automaticamente; você não digita nada.

```json
{
  "dossie": "CV-2026-00003",
  "unidade": { "nome": "CERTIVE SÃO JOSÉ", "cidade_uf": "SÃO JOSÉ / SC" },
  "vistoriador": { "nome": "NOME DO VISTORIADOR", "cargo": "VISTORIADOR TÉCNICO" },
  "data_hora_vistoria": "2026-09-27T17:29:00-03:00",
  "os": { "placa": "RWC0G00", "chassi": "1C6SRFLT9NN250362", "renavam": "…", "marca_modelo": "…", "tipo_veiculo": "pickup" },
  "consulta_placa": { "marca_modelo": "…", "ano": "…", "cor": "…", "combustivel": "…", "carroceria": "…", "restricoes": [] },
  "etapas": {
    "identificacao": { "tipo_veiculo": "pickup", "quilometragem": "45210", "placa_confere": "sim", "conservacao": "bom", "observacao": "" },
    "numeracao": { "chassi_lido": "…", "motor_lido": "…", "chassi_original": true, "motor_original": true,
                   "etiquetas": { "eta_motor": "preservada", "eta_coluna": "ausente" }, "observacao": "…" },
    "motor": { "reparo_estrutural": "nao", "cor_original": "sim", "observacao": "" },
    "estrutura": { "enchente": "nao", "batida": "sim", "deformacao": "nao",
                   "pecas": [{ "slot": "longarina_diant_esq", "avaliacao": "original", "obs": "" }], "parecer": "conforme" },
    "pintura": [{ "numero": 1, "peca": "PARA-CHOQUE DIANTEIRO", "um": null, "classificacao": "Original" },
                { "numero": 4, "peca": "COLUNA DIANTEIRA ESQUERDA", "um": 118, "classificacao": "Original", "reparo_estrutural": "nao" }],
    "vidros": [{ "slot": "vidro_parabrisa", "gravacao_original": true, "gravacao_lida": "…", "desbaste": false }],
    "quadros_interior": { "intervencao_quadros": "nao", "conservacao_interior": "bom", "observacao": "" },
    "fechamento": { "parecer_vistoriador": "com_ressalvas", "observacao_final": "…" }
  },
  "fotos": [{ "id": "foto_1", "slot": "frente_45_dir" }, { "id": "foto_2", "slot": "chassi_gravado" }]
}
```

As fotos vão anexadas na mesma mensagem, cada uma precedida do texto
`FOTO foto_N — SLOT <codigo>`.

## 7. O que será feito no sistema Certive (parte técnica)

1. **Chave fora do navegador.** Hoje a chave da OpenAI fica salva em *Configurações* e é
   lida pelo navegador. A tabela onde ela fica pode ser lida por qualquer pessoa que
   tenha a chave pública do site (que está no código da página). Ela passa a ficar só
   no servidor (segredo do Supabase) e deve ser **trocada** (revogar a antiga na OpenAI).
2. **Função no servidor `gerar-laudo`** (Supabase Edge Function): recebe o ID da
   cautelar, monta o pacote da seção 6 direto do banco (sem depender do celular),
   chama o prompt `pmpt_...` na versão fixada, valida o JSON e grava o resultado.
3. **Botão "Gerar laudo"** chama essa função; a tela mostra "O sistema está gerando o
   laudo…". Se o agente devolver `bloqueado` ou `inconsistencias`, a mesa vê a lista
   antes de emitir.
4. **PDF sempre no modelo padrão:** o gerador encaixa `campos` e `fotos_laudo` no
   `Certive_Template_Editavel.pdf`, desenha a `silhueta` e pinta os
   `pintura_marcadores` (depende das imagens de `docs/prompts/silhuetas_veiculos_laudo.md`).
5. **Rastreabilidade:** cada laudo guarda a versão do prompt usada, o JSON recebido e a
   data, para auditoria.
