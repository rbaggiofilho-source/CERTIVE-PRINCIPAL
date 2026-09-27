# Prompt — silhuetas de veículos para o laudo cautelar (página "IV Pintura e Acabamento")

## Objetivo
Hoje a página IV do laudo mostra sempre o desenho de um sedan (vista de cima, lateral,
frente e traseira) com marcadores coloridos por peça. O laudo deve mostrar o desenho
do MESMO TIPO de carroceria do veículo vistoriado.

O tipo já é registrado no sistema:
- na O.S. (campo "Tipo de Veículo", opcional no balcão);
- na vistoria, Etapa I (obrigatório — o vistoriador confirma olhando o carro).

Valores gravados (`ordens_servico.veiculoTipo` e `dadosJson.tipoVeiculo` da seção 1):
`hatch`, `sedan`, `suv`, `pickup`, `van`, `minivan`, `cupe`, `outro`.

Depois de gerar as imagens, salvar como `assets/silhuetas/<tipo>.png`
(ex.: `assets/silhuetas/pickup.png`). `outro` usa a imagem do sedan.

## Prompt base (usar uma vez por tipo, trocando [TIPO] e [DESCRIÇÃO DO TIPO])

> Crie uma ilustração técnica de um veículo genérico do tipo **[TIPO]** para um laudo
> de vistoria veicular. **Sem marca, sem logotipo, sem placa legível, sem texto.**
>
> Composição em uma única imagem, fundo branco puro (#FFFFFF), formato retrato 3:4,
> alta resolução (mínimo 1500 × 2000 px), PNG:
> 1. **Vista superior** (de cima, frente do carro apontando para CIMA), grande, ocupando
>    a metade esquerda superior da imagem.
> 2. **Vista lateral esquerda** (lado do motorista, frente apontando para a ESQUERDA),
>    abaixo da vista superior.
> 3. **Vista frontal** e **vista traseira**, pequenas, lado a lado, na parte de baixo.
>
> Estilo: desenho vetorial limpo, cinza-claro metálico (#D9DCE1 a #9AA0A8), contornos
> cinza-escuros finos (#4A4F57), vidros em cinza-azulado escuro, sombras suaves, sem
> cenário, sem chão, sem reflexos exagerados, visual de manual técnico premium.
> Proporções realistas de um **[DESCRIÇÃO DO TIPO]**.
> Deixe espaço em branco ao redor de cada vista (mín. 6% da largura) para marcadores
> circulares numerados serem sobrepostos depois. Todas as peças da carroceria devem
> estar bem visíveis e separadas: para-choques, capô, paralamas, portas, colunas,
> tampa traseira/caçamba e teto.

### [DESCRIÇÃO DO TIPO] por tipo
| Tipo (`veiculoTipo`) | [TIPO] | [DESCRIÇÃO DO TIPO] |
|---|---|---|
| `hatch` | hatch compacto | hatchback compacto de 4 portas, traseira curta e vertical, tampa traseira com vidro |
| `sedan` | sedan | sedan médio de 4 portas com porta-malas saliente (três volumes) |
| `suv` | SUV | SUV médio de 4 portas, carroceria alta, vão livre elevado, tampa traseira vertical |
| `pickup` | pick-up | pick-up cabine dupla de 4 portas com caçamba aberta e tampa da caçamba |
| `van` | van / utilitário | furgão/van com cabine de 2 portas, porta lateral corrediça e 2 portas traseiras |
| `minivan` | minivan | minivan de 4 portas com portas traseiras corrediças e traseira vertical |
| `cupe` | cupê | cupê esportivo de 2 portas, teto baixo e caimento traseiro |

## Posição dos marcadores (numeração da tela de pintura da vistoria)
A vistoria registra as peças nesta ordem (volta de 360°). Os marcadores do laudo devem
usar os mesmos números:

| Nº | Peça | Onde marcar |
|---|---|---|
| 1 | Para-choque dianteiro | vista frontal |
| 2 | Capô | vista superior |
| 3 | Paralama dianteiro esquerdo | vista superior + lateral |
| 4 | Coluna dianteira esquerda | vista lateral |
| 5 | Porta dianteira esquerda | vista lateral |
| 6 | Coluna central esquerda | vista lateral |
| 7 | Porta traseira esquerda | vista lateral (não existe em cupê/van de 2 portas) |
| 8 | Coluna traseira esquerda | vista lateral |
| 9 | Paralama traseiro esquerdo | vista superior + lateral |
| 10 | Tampa traseira (ou tampa da caçamba) | vista superior + traseira |
| 11 | Para-choque traseiro | vista traseira |
| 12 | Paralama traseiro direito | vista superior |
| 13 | Coluna traseira direita | vista superior |
| 14 | Porta traseira direita | vista superior |
| 15 | Coluna central direita | vista superior |
| 16 | Porta dianteira direita | vista superior |
| 17 | Coluna dianteira direita | vista superior |
| 18 | Paralama dianteiro direito | vista superior |
| 19 | Teto | vista superior |

Cores dos marcadores (já usadas no laudo): Original `#2F6B3F` · Repintura `#C9A961` ·
Repintura com massa `#B8642B` · Avariado `#8B2635` · Não se aplica/não avaliado `#D8CFBE`.

## Próximo passo no sistema (depois das imagens prontas)
1. Salvar as 7 imagens em `assets/silhuetas/`.
2. Anotar, para cada imagem, as coordenadas (x, y em %) de cada marcador 1–19.
3. No gerador do laudo (`laudo_pdf_v2.js`), desenhar a silhueta do tipo do veículo
   sobre a área do desenho da página IV e os marcadores coloridos conforme a
   classificação de cada peça feita pelo vistoriador — hoje o desenho e as cores dos
   marcadores dessa página são fixos no modelo do PDF e não refletem a vistoria.
