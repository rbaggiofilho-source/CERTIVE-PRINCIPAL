# Catálogo: linha de e-books low-ticket da Certive Vistorias

> **Status:** Fase 1, banco de ideias. **Aguardando aprovação do Ricardo** antes de produzir o piloto.
> **Data:** 30/09/2026
> **Regra de ouro da linha:** o e-book ensina o comprador a *enxergar riscos e fazer as perguntas certas*. Ele **não** substitui a vistoria cautelar profissional, a vistoria oficial do DETRAN nem uma assessoria jurídica. Essa limitação vira o gancho para o laudo.

---

## 1. O que li no projeto e como isso muda a estratégia

| Achado no repositório | Impacto na linha de e-books |
|---|---|
| O site (`index.html`) já nomeia os três níveis: **Cautelar Essencial, Avançado e Absoluto**, além do **Laudo de transferência DETRAN SC** | O CTA de todos os e-books aponta para esses nomes. Não vou inventar outros. |
| Endereço: Rua das Camélias 345, Kobrasol, São José/SC. Laudo entregue pelo WhatsApp. **15% de desconto na renovação** para veículo com laudo Certive | Isso é prova de agilidade e tecnologia. O cupom de laudo como upsell **só faz sentido na Grande Florianópolis** (ver seção 4). |
| Já existe a **Certive Academy** (`curso-online/`): ementa e VSL do curso de formação de vistoriador cautelar | Módulos 3 e 4 (identificação e leitura de colisões) servem de base técnica. Há também uma escada de valor extra: e-book → curso. |
| Identidade: azul-marinho `#050811 / #0d1526 / #16223f`, dourado `#d4a017 → #e8bf3a / #f0be3a`, fontes **Outfit** (títulos) e **Inter** (texto) | Essa paleta vira a do design editorial. |
| Logos: só existem `icons/icon-512.png` (escudo com pessoa) e `icons/selo_procedencia.png` (selo "Laudo Cautelar – Aprovado") | **Não há arquivo** do "C de velocímetro" nem do "lince". ⚠️ O selo diz **"APROVADO"** e **não deve** aparecer nos e-books nem nos anúncios, porque sugere aprovação do veículo ou do comprador. Preciso do logo oficial em vetor (ver seção 6). |
| O prompt do agente de laudo (`docs/prompts/agente_laudo_cautelar.md`) e o modelo de contrato ECV | Servem de referência para a terminologia do capítulo "como ler um laudo". |

**Ponto estratégico mais importante:** o anúncio é nacional, mas o serviço é regional. Por isso a linha precisa ser lucrativa **por si só** em escala nacional, e o laudo entra como um bônus de ROI apenas no tráfego de SC. Na prática, isso significa rodar duas campanhas: *Brasil* (upsell = produto digital) e *Grande Florianópolis* (upsell = cupom de laudo).

---

## 2. Banco de ideias (14)

Notas de 1 a 5, onde 5 é melhor. Em **Produção**, 5 = fácil de produzir. **Σ** = soma das quatro notas.

| # | Título + subtítulo | Público | Dor | Conhecimento entregue | Materiais práticos | Preço | Order bump / Upsell | Dem. | Anúncio | Prod. | Sinerg. | Σ | Riscos de compliance |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Antes de Fechar Negócio**: o checklist do vistoriador para comprar carro usado sem cair nas armadilhas mais comuns | Comprador de carro usado (PF), 25 a 55 anos | Medo de pagar caro num carro batido, com dívida ou com documento irregular | Método em 5 etapas: anúncio → documentos/consultas → inspeção visual → test drive → fechamento com recibo | Checklist imprimível, planilha comparativa, planilha de custo total, modelo de recibo/contrato | **R$ 27** | Bump R$ 12: Roteiro de Test Drive Técnico · Upsell R$ 37: "Batido ou Não?" (#3) ou cupom de laudo (SC) | 5 | 5 | 4 | 5 | **19** | Médio. Não prometer "compra segura". O modelo de contrato exige aviso de que não substitui advogado. |
| 2 | **Como Ler um Laudo Cautelar**: o que cada item significa (estrutura, numerações, pintura, histórico) e o que perguntar ao vistoriador | Quem já contratou ou vai contratar um laudo | Recebe o laudo e não entende "ressalva", "reparo" ou "não conforme" | Anatomia de um laudo, graus de apontamento, o que é impeditivo e o que é negociável | Glossário ilustrado, "tradutor" de apontamentos | R$ 17 | Funciona melhor como **bônus** do #1 | 2 | 2 | 5 | 5 | 14 | Baixo. Não citar nem comparar laudos de terceiros. |
| 3 | **Batido ou Não?** Sinais de batida, repintura e reparo estrutural que qualquer pessoa consegue observar | Comprador PF, entusiastas | Carro "impecável" que esconde uma batida forte | Folgas, alinhamento de peças, ondulação, overspray, parafusos mexidos, vedações, soldas visíveis, etiquetas | Mapa ilustrado de pontos de inspeção, checklist de lataria | R$ 27 | Bump: medidor de espessura, "como usar e como não se enganar" (R$ 12) · Upsell: #6 | 5 | 5 | 3 | 5 | **18** | Médio. **Dual-use:** vendedor mal-intencionado pode usar o texto para saber "o que esconder". Mitigação: ensinar só a **observação**, sem técnica de reparo e sem o que torna um reparo "indetectável". Fotos precisam ser próprias. |
| 4 | **Transferência sem Dor de Cabeça em SC**: vistoria, ATPV-e, prazos, taxas e os erros que atrasam o processo | Comprador e vendedor em SC | Multa por atraso, veículo "preso" no nome do vendedor, retrabalho | Passo a passo DETRAN/SC, comunicação de venda, vistoria de transferência, pendências comuns | Fluxograma, checklist de documentos, calendário de prazos | R$ 19 | Upsell: agendamento do laudo de transferência com desconto | 3 | 3 | 4 | 5 | 15 | **Alto de exatidão**: prazos e taxas mudam, e tudo precisa de [VERIFICAR] contra o DETRAN/SC vigente. Audiência só de SC limita a escala. |
| 5 | **Raio-X do Histórico**: onde e como consultar débitos, restrições, gravame, recall e leilão antes de pagar | Comprador PF | Não sabe o que consultar nem onde | Mapa das consultas oficiais (DETRAN, SENATRAN/CDT, Recall gov.br, tribunais) e como interpretar cada uma | Roteiro de consultas com links | R$ 17 | Melhor como **bônus** ou capítulo do #1 | 3 | 4 | 4 | 4 | 15 | Médio. Muito do conteúdo é gratuito e o valor percebido é baixo. **LGPD:** indicar só fontes oficiais, nunca "sites de consulta por CPF". |
| 6 | **Leilão, Sinistro e Recuperado**: o que cada classificação significa e os cuidados antes de comprar | Comprador de leilão, comprador PF que encontrou "carro de leilão barato" | Não sabe se "leilão" é bom negócio ou armadilha; revenda e seguro difíceis | Tipos de leilão, pequena/média/grande monta, recuperado de roubo/furto, impacto em seguro, revenda e financiamento | Checklist pré-lance, calculadora de custo real do arremate | R$ 27 | Upsell: Laudo Cautelar Absoluto (SC) / #3 | 4 | 4 | 3 | 5 | **16** | Médio. Não depreciar leiloeiros. Classificação de danos e regras precisam de [VERIFICAR] na Res. CONTRAN vigente. Não afirmar que "leilão = golpe". |
| 7 | **Test Drive Técnico**: roteiro de 20 minutos do que observar, ouvir e sentir | Comprador PF | Faz um test drive "passeio" e não percebe nada | Partida a frio, painel, embreagem/câmbio, freios, suspensão, direção, ruídos | Roteiro de bolso | R$ 12 | **Order bump** do #1 | 3 | 3 | 5 | 3 | 14 | Baixo. Avisar que o test drive ocorre com autorização do dono e dentro das leis de trânsito. |
| 8 | **Kit do Vendedor Transparente**: prepare carro e documentos para vender mais rápido e sem retrabalho | Vendedor PF | Carro parado no anúncio, negociação que cai na hora do documento | Documentação em dia, fotos honestas, histórico organizado, laudo cautelar como argumento de venda | Pasta de documentos, roteiro de fotos, modelo de anúncio | R$ 19 | Upsell: laudo cautelar "pré-venda" (SC) | 3 | 3 | 4 | 4 | 14 | **Alto.** Pode resvalar em "maquiar o carro". Só aceitável com o enquadramento de **transparência**: limpeza e documentação sim, esconder avaria nunca. Precisa de revisão atenta. |
| 9 | **Entrada de Estoque sem Surpresa**: checklist e planilha para o lojista avaliar cada carro antes de comprar | Pequeno lojista/revendedor | Compra na troca um carro com problema e perde a margem | Processo de avaliação na troca, triagem de risco, quando exigir laudo | Checklist de entrada, planilha de estoque (custo, preparação, margem, giro) | R$ 37 | Upsell: **convênio lojista Certive** (faturamento mensal) | 2 | 2 | 3 | 5 | 12 | Baixo. Público pequeno e difícil de segmentar na Meta. Rende mais como **isca B2B** (gratuita ou R$ 17) do que como produto de tráfego. |
| 10 | **Moto Usada: o Checklist Completo** | Comprador de moto usada | Mesmas dores do carro, sem material específico | Quadro, garfo, balança, transmissão (corrente/coroa/pinhão), numerações, histórico | Checklist de moto | R$ 19 | Bump do #1 (R$ 9) ou produto solo | 3 | 4 | 4 | 3 | 14 | Médio. Sinergia depende do volume de motos na Certive [confirmar]. |
| 11 | **Golpes na Compra e Venda de Veículos Online**: os padrões mais comuns e como se proteger | Compradores e vendedores em marketplaces | Medo do falso intermediário, do sinal via Pix, do documento falso | Padrões de golpe, sinais de alerta, protocolo de pagamento e entrega | Protocolo "antes do Pix" | R$ 19 | Bump do #1 | 5 | 3 | 4 | 3 | 15 | **Alto em anúncios**: é tema sensível para a Meta (golpe/medo), e a copy não pode prometer "nunca mais cair em golpe". Não citar plataformas pelo nome de forma depreciativa. |
| 12 | **Meu Primeiro Carro Usado**: do orçamento real à documentação, sem susto | Jovens de 18 a 30 anos, primeira compra | Não sabe quanto custa manter um carro nem o que olhar | Custo total (IPVA, seguro, manutenção), escolha do modelo, inspeção básica, documentação | Calculadora de custo mensal | R$ 19 | Upsell: #1 | 4 | 4 | 4 | 3 | 15 | Baixo. Sobrepõe-se muito ao #1 e canibaliza. Melhor como **ângulo de anúncio** do #1. |
| 13 | **Kit Checklists do Vistoriador**: só as ferramentas imprimíveis e as planilhas da linha | Todos | Quer a ferramenta, não a leitura | Pacote de checklists (carro, moto, lataria, test drive, documentos) e planilhas | Tudo em PDF/XLSX | R$ 17 | **Downsell** e upsell natural | 3 | 4 | 5 | 4 | 16 | Baixo. Não é um e-book, é um produto da escada de oferta. |
| 14 | **Carro elétrico e híbrido usado: o que muda na avaliação** | Early adopters | Medo da bateria | Saúde da bateria, garantia, recall | Checklist EV | R$ 27 | n/a | 2 | 3 | 2 | 2 | 9 | Alto de exatidão técnica: exige diagnóstico que a vistoria visual não cobre. **Descartar por ora.** |

### Ideias que recomendo não fazer (crítica)

- **#14 (elétricos):** fora da competência demonstrável da Certive hoje. Teria que prometer um diagnóstico de bateria que o laudo não entrega.
- **"Como passar na vistoria"**, em qualquer formato: descartada. Mesmo que o conteúdo fosse legítimo (lâmpadas, extintor quando aplicável, pneus), o título soa como burla e ameaça o credenciamento. O que é legítimo entra no #4 como "itens que costumam gerar pendência".
- **#8 (vendedor)** só vale com revisão linha a linha. Pelo risco de imagem, não é para a primeira onda.
- **#2, #5, #7 e #13** são fortes como **componentes da oferta** (bônus, bump, downsell), mas fracos como produtos de tráfego.

---

## 3. TOP 3 e piloto

| Posição | E-book | Por quê |
|---|---|---|
| 🥇 **Piloto** | **#1 Antes de Fechar Negócio** | Tem a maior demanda e é o ângulo mais fácil de anunciar ("antes de fechar negócio", "evite prejuízo"). Usa todas as ferramentas pedidas (checklist, duas planilhas, recibo). É o produto de entrada natural para todos os outros e o que mais leva ao laudo cautelar. |
| 🥈 | **#3 Batido ou Não?** | Tema visual e curioso, excelente para vídeo no pátio. É o **upsell** natural do piloto. |
| 🥉 | **#6 Leilão, Sinistro e Recuperado** | Público com dor financeira alta e poucas fontes confiáveis. É onde o Laudo **Absoluto** mais se justifica. |

### Oferta proposta para o piloto (detalhamento na Fase 3)

- **Principal (R$ 27):** *Antes de Fechar Negócio*, com os bônus **#2 Como Ler um Laudo Cautelar** (versão enxuta) e **#5 Raio-X do Histórico** (como capítulo ou bônus).
- **Order bump (R$ 12):** #7 Roteiro de Test Drive Técnico, com a folha de moto (#10 resumido) como extra.
- **Upsell (R$ 37):** #3 *Batido ou Não?*. No tráfego de SC, o upsell é o **cupom de desconto no Laudo Cautelar** (o valor do desconto você define).
- **Downsell (R$ 17):** #13 Kit Checklists do Vistoriador.
- **Plataforma:** **Kiwify** para começar (checkout, bump e upsell de um clique nativos, onboarding mais simples). A Hotmart fica como alternativa se você quiser a rede de afiliados.

**Conta rápida (a validar na Fase 3):** com R$ 27 e taxa de cerca de 9% + R$ 2,49 [VERIFICAR a tabela vigente da plataforma], o líquido fica em torno de R$ 22. Com 30% de bump e 12% de upsell, o ticket médio líquido chega perto de R$ 29. É esse número, e não os R$ 27, que define o CPA máximo.

### Sumário provisório do piloto (em torno de 35 a 42 páginas)

0. Capa · direitos e aviso legal · para quem é e para quem não é · sumário clicável
1. **Os 10 minutos que evitam os piores negócios** (ganho rápido: 7 sinais de alerta do anúncio e da primeira conversa)
2. Planejamento: orçamento real e custo total da compra
3. Documentos e consultas: CRLV-e, ATPV-e, débitos, restrições, gravame, recall, histórico de leilão
4. Inspeção visual externa: lataria, pintura, vidros, pneus, iluminação
5. Identificação veicular *para leigos*: conferir se o carro é o que o documento diz (apenas conferência, **sem** detalhar sinais de adulteração que ensinem a fraudar)
6. Interior, motor e compartimentos: o que o leigo consegue ver
7. Test drive técnico (versão resumida)
8. Quando chamar um profissional: o que só a vistoria cautelar enxerga, e como ler o laudo
9. Fechamento: negociação, forma de pagamento, recibo, transferência e prazos
10. Ferramentas · glossário · conclusão · CTA Certive · fontes (CTB, Resoluções CONTRAN, DETRAN/SC)

Cada capítulo terá os boxes *Atenção / Na prática / Sinal de alerta / Dica do vistoriador*, um checklist final e um caso real anonimizado.

---

## 4. Riscos transversais e como vou tratá-los

1. **Promessas:** o vocabulário proibido na copy e no livro inclui "garantido", "blindado", "nunca mais", "100% seguro", "à prova de golpe". No lugar, uso "reduzir riscos", "saber o que perguntar", "decidir com informação".
2. **Numeração e identificação:** o e-book ensina só a **conferir** (VIN do documento contra o do veículo, etiquetas presentes). Não descreve como uma adulteração é feita nem o que a torna difícil de detectar. Quando houver suspeita, o texto encaminha para um profissional e para a autoridade.
3. **Exatidão normativa:** todo prazo, taxa ou resolução citada leva fonte e data. O que eu não conseguir confirmar fica marcado com **[VERIFICAR]** para a sua checagem final.
4. **Anúncios (Meta):** nada de "você está sendo enganado?" (atributo pessoal), nada de imagem de acidente chocante e nada de antes/depois enganoso. Placas e dados de veículos reais sempre borrados.
5. **CDC e LGPD:** garantia incondicional de 7 dias (art. 49 do CDC), política de privacidade na página de vendas e consentimento explícito para e-mail e WhatsApp.
6. **Credenciamento:** nenhuma frase pode sugerir que o laudo cautelar é "oficial do DETRAN". A diferença entre cautelar e transferência precisa ficar explícita.

---

## 5. Estrutura de pastas (será criada no piloto)

```
ebooks/certive/
├── 00-catalogo.md            ← este arquivo
└── antes-de-fechar-negocio/
    ├── 00-briefing.md
    ├── 01-conteudo/   02-design/   03-materiais/
    ├── 04-marketing/  05-criativos/  FINAL/
```

---

## 6. O que preciso de você antes ou durante o piloto

1. **Aprovação:** piloto = #1? TOP 3 ok? Preço de R$ 27 ok?
2. **Logo oficial** em SVG ou PNG de alta resolução (o "C velocímetro" ou o "lince"), se já existir. Sem ele, uso um wordmark tipográfico "CERTIVE VISTORIAS" em Outfit com o gradiente dourado. Não vou usar o selo "Aprovado".
3. **Fotos reais do pátio** (sem placas) para os pontos de inspeção. Sem elas, uso ilustrações vetoriais próprias, o que evita problemas de licença.
4. **Autoria e autoridade:** o livro sai assinado por "Ricardo Baggio Filho, Certive Vistorias"? Posso citar números (vistorias por mês, anos de operação) e o número de credenciamento? Não vou inventar nenhum dado.
5. **Cupom de laudo:** qual desconto e em quais níveis (Essencial, Avançado ou Absoluto)?
6. **Casos reais:** 3 a 5 histórias de vistorias marcantes, que eu anonimizo.
