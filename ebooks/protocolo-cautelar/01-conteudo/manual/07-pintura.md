# Carroceria e pintura: leitura e medição {#cap-7}

::: resumo Neste capítulo
- As camadas da pintura de fábrica e o que muda numa repintura
- Como usar o medidor de espessura com método (e não com fé)
- A leitura relativa: por que o número absoluto engana
- Os sinais visuais: vãos, parafusos, overspray, textura, tonalidade
- O mapa de pintura peça a peça
:::

## O que é uma pintura de fábrica

A pintura original é aplicada em linha automatizada, em camadas finas e muito controladas:

1. **Tratamento e cataforese (e-coat):** proteção anticorrosiva por imersão, que cobre toda a chapa, inclusive por dentro.
2. **Primer:** base de aderência e nivelamento.
3. **Base (cor):** a cor propriamente dita.
4. **Verniz:** proteção e brilho.

O resultado é uma camada total **fina e homogênea**, com pequena variação entre peças do mesmo carro. A espessura típica depende do fabricante, do modelo, da cor e da fábrica. Por isso, o valor que importa é a comparação entre peças do mesmo veículo.

::: atencao Atenção
Os valores deste capítulo são **orientativos**. Não existe um número universal que separa "original" de "repintado". Quem usa uma tabela fixa sem comparar as peças do próprio carro erra para os dois lados: acusa repintura onde não há e deixa passar onde há.
:::

## O medidor de espessura

| Tipo | Princípio | Mede sobre | Não mede |
|---|---|---|---|
| **Fe** (ferroso) | Indução magnética | Aço | Alumínio, plástico, fibra |
| **NFe** (não ferroso) | Correntes parasitas | Alumínio | Aço (em modo NFe), plástico |
| **Fe/NFe** (combinado) | Detecta o substrato e escolhe o modo | Aço e alumínio | Plástico, fibra, compósitos |

::: dica Dica do vistoriador
Vários modelos têm **capô, tampa ou paralamas de alumínio**. Um medidor só Fe vai dar "erro" ou zero nessas peças, e o vistoriador desatento anota "peça trocada por plástico". Tenha um medidor Fe/NFe e saiba de que material é cada peça do modelo.
:::

### Método de medição

1. **Calibre** no início do dia (e ao trocar de ambiente com muita diferença de temperatura), com a placa-padrão e a lâmina de referência do fabricante do medidor.
2. **Limpe** o ponto: poeira e cera alteram a leitura.
3. **Encoste o sensor perpendicular**, sem arrastar, longe de bordas e dobras (a pelo menos 2–3 cm).
4. Faça **no mínimo 5 leituras por peça**, em grade: centro e quatro quadrantes. Em peças grandes (capô, teto), faça mais.
5. Registre **média e máxima** de cada peça. A máxima localiza o reparo; a média mostra se a peça inteira foi pintada.
6. Siga **sempre o mesmo sentido** (horário, começando pelo para-choque dianteiro esquerdo) para o mapa ficar comparável.

## A leitura relativa

O Protocolo usa uma **referência do próprio veículo**: a **mediana das médias** das peças metálicas medidas. A mediana resiste às peças repintadas, ao contrário da média simples. Depois, cada peça é comparada com essa referência:

| Razão (média da peça ÷ referência) | Leitura orientativa | Nível sugerido |
|---|---|---|
| até 1,3× | Compatível com as demais peças | N0 |
| de 1,3× a 2× | Provável repintura | N2 |
| acima de 2× | Provável repintura com massa ou reparo | N2 (N3 se houver outros sinais de impacto no conjunto) |
| **abaixo de 0,7×** | Pintura mais fina que as demais: possível polimento intenso **ou peça substituída** | Investigar |

O app e a planilha do kit calculam a referência e a razão automaticamente e colorem o mapa.

::: alerta Sinal de alerta: a peça "fina demais"
Uma peça **nova de reposição**, pintada em oficina, pode ter espessura **parecida ou até menor** que a original, porque sai da fábrica com a proteção anticorrosiva e recebe só base e verniz. Uma leitura "baixa" isolada, junto com parafusos rompidos, selador diferente ou etiqueta ausente, é sinal de **substituição**. O medidor não enxerga isso sozinho; você enxerga.
:::

### Referência em números absolutos (só como apoio)

Na prática de mercado, é comum encontrar pinturas originais entre **~80 e ~180 µm** em aço, variando conforme o fabricante. Leituras acima de **~250–300 µm** costumam indicar repintura, e acima de **~400–500 µm**, presença de massa. Use esses números **apenas** para confirmar o que a comparação relativa já mostrou, nunca no lugar dela.

::: pratica Na prática: conversão de unidades
Alguns medidores mostram em **mils** (milésimos de polegada). **1 mil = 25,4 µm.** Uma leitura de 5 mils corresponde a cerca de 127 µm.
:::

## Os sinais visuais

O medidor responde "quanto". Os sinais visuais respondem "o quê" e "onde". Os dois juntos formam a evidência.

| Sinal | Como procurar | O que indica |
|---|---|---|
| **Vãos irregulares** | Olhe as folgas entre peças; compare com o lado oposto | Peça removida, reposicionada ou estrutura deslocada |
| **Faceamento** | Passe a mão na junção entre peças | Peça mais alta ou mais baixa que a vizinha |
| **Parafusos com pintura rompida** | Cabeças dos parafusos de paralamas, dobradiças, capô e tampa | Peça foi removida (não diz por quê) |
| **Overspray** | Borrachas, frisos, plásticos, vidros, emblemas, bordas internas | Pintura aplicada fora de linha de fábrica |
| **Casca de laranja diferente** | Luz rasante, olhando a textura do verniz de peça em peça | Repintura (textura diferente da original) |
| **Tonalidade diferente** | Ângulos variados, sob luz natural e sob lanterna | Repintura; atenção ao metamerismo (cor que muda conforme a luz) |
| **Poeira ou fiapos presos** | Luz rasante e lupa | Repintura em ambiente não controlado |
| **Marcas de lixa** | Luz rasante próxima; aparecem como riscos finos sob o verniz | Preparação de repintura mal acabada |
| **Ondulação / massa** | Reflexo de uma linha reta (régua, lâmpada tubular) na peça | Massa niveladora sob a pintura |
| **Selador nas dobras** | Bordas internas de portas, capô, tampa | Peça reparada ou substituída |

::: dica Dica do vistoriador
Leve uma **lâmpada tubular de LED** portátil. Refletida na lataria, ela desenha uma linha: onde a linha ondula, há massa ou chapa desempenada. Nenhum medidor substitui esse teste de 10 segundos.
:::

## Peças plásticas e para-choques

Para-choques, spoilers e retrovisores costumam ser de **plástico** e não são medidos pelo medidor convencional. Avalie:

- Textura e tonalidade em relação à carroceria.
- **Presilhas e fixações**: quebradas, coladas ou substituídas por parafusos genéricos.
- **Reparo plástico**: solda plástica visível por dentro, grampos metálicos, massa.
- Alinhamento com faróis, lanternas e paralamas.

Para-choque repintado ou substituído é, em geral, **N2**. O que importa é a **alma (reforço)** atrás dele, que é metálica e faz parte do caminho da energia (capítulo 6).

## O mapa de pintura

O mapa é a parte do laudo que o cliente **mais entende**, porque é visual. Monte-o sempre:

1. Peças na ordem do sentido horário.
2. Média e máxima de cada peça.
3. Cor pela razão com a referência (verde, amarelo, vermelho).
4. Peças plásticas marcadas "não medido".
5. Uma frase de conclusão: "Constatada repintura em 3 peças de revestimento (para-choque dianteiro, paralama dianteiro esquerdo e porta dianteira esquerda); demais peças metálicas compatíveis com a referência do próprio veículo."

::: checklist Checklist do capítulo
- [ ] Calibrei o medidor no início do dia
- [ ] Sei quais peças do modelo são de alumínio ou plástico
- [ ] Faço no mínimo 5 leituras por peça, em grade, longe das bordas
- [ ] Uso a referência do próprio veículo (mediana), não um número fixo
- [ ] Investigo peças "finas demais" como possível substituição
- [ ] Confirmo leituras com sinais visuais (parafusos, overspray, textura, selador)
- [ ] Entrego o mapa de pintura colorido com conclusão escrita
:::
