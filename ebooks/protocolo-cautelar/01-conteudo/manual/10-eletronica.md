# Eletrônica e diagnóstico OBD2 {#cap-10}

::: resumo Neste capítulo
- O autoteste do painel e o que uma luz que "não acende" significa
- Scanner OBD2: códigos, estados e monitores de prontidão
- Como reconhecer indícios de códigos apagados recentemente
- Bateria e sistema de carga
- Chicotes e conectores: o elo com a enchente
:::

## O autoteste do painel

Ao ligar a ignição, o painel acende as luzes de advertência por alguns segundos e depois apaga as que não têm falha. Esse autoteste é uma das verificações mais importantes da vistoria.

| Situação | Interpretação | Nível |
|---|---|---|
| Todas acendem no teste e apagam após a partida | Normal | N0 |
| Luz permanece acesa após a partida (injeção, ABS, airbag etc.) | Falha registrada no sistema | N2 (injeção) a **N3** (airbag, ABS, freio) |
| Luz **não acende** no autoteste | Lâmpada/LED queimado, desconectado ou **desabilitado** | **N3** para airbag, ABS e freio: não é possível saber se o sistema está íntegro |

::: alerta Sinal de alerta
A luz do **airbag que não acende** no autoteste é mais preocupante do que a que fica acesa. A que fica acesa mostra uma falha; a que não acende pode estar escondendo uma. Registre como N3 e, junto com outros sinais de impacto frontal, investigue a troca de airbags (capítulo 11).
:::

## Scanner OBD2

Os automóveis leves vendidos no Brasil a partir do fim dos anos 2000 têm diagnóstico de bordo padronizado (**OBDBr-2**), acessível por um conector sob o painel **[VERIFICAR cronograma exato de obrigatoriedade]**. Um scanner genérico lê o módulo de injeção; scanners mais completos leem ABS, airbag, câmbio e carroceria.

### Estrutura do código de falha (DTC)

| 1º caractere | Sistema |
|---|---|
| **P** | Powertrain: motor e transmissão |
| **C** | Chassis: freios, suspensão, direção |
| **B** | Body: carroceria, airbag, conforto |
| **U** | Rede de comunicação entre módulos |

O 2º caractere indica se o código é **genérico** (0) ou **específico do fabricante** (1, na maioria dos casos). Os demais identificam a falha.

### Estados do código

| Estado | Significado |
|---|---|
| **Ativo / confirmado** | Falha detectada e confirmada pelo módulo; costuma acender a luz |
| **Pendente** | Falha detectada uma vez, aguardando confirmação em novos ciclos |
| **Histórico** | Falha que ocorreu e não está mais presente |
| **Permanente** | Em sistemas que suportam, não é apagado pelo scanner; só some quando o próprio módulo verifica a correção |

### Monitores de prontidão (readiness)

O módulo de injeção executa **autotestes** periódicos de sistemas de emissão: catalisador, sonda lambda, aquecimento da sonda, EVAP, EGR (quando existe), falhas de ignição, sistema de combustível e componentes gerais. Cada monitor fica **"pronto"** quando o teste foi concluído desde a última vez que a memória foi apagada.

::: pratica Na prática: o indício do "apagão"
Quando alguém **apaga os códigos** com um scanner, ou quando a bateria é desconectada, os monitores voltam para **"não pronto"** e só completam depois de um ciclo de condução que pode levar dias.
1. Leia os monitores. **Vários "não prontos"** num carro que supostamente roda todo dia são um indício.
2. Pergunte (e registre) se a bateria foi trocada ou desconectada recentemente.
3. Veja se há código **pendente** voltando a aparecer.
4. Registre como indício, **sem concluir** que houve apagamento intencional. Recomende nova leitura depois de alguns dias de uso normal (N1 isolado; N2 quando combinado com outros sinais).
:::

### Quadro congelado (freeze frame)

Muitos scanners mostram as condições no momento em que a falha ocorreu: rotação, temperatura, velocidade e, em alguns casos, a **quilometragem**. É um dado útil para confrontar com o histórico.

### Quilometragem em módulos

Em alguns modelos, módulos como o de injeção, o do ABS ou o do airbag registram a quilometragem. Scanners avançados podem ler esses dados. **Divergência entre módulos e painel** é indício a ser registrado e explicado ao cliente, com recomendação de apuração. Não é conclusão de adulteração.

## Bateria e sistema de carga

| Medição | Referência orientativa | Interpretação |
|---|---|---|
| Tensão em repouso (motor desligado há horas) | ~12,4 a 12,7 V | Abaixo de ~12,2 V: bateria descarregada ou fraca |
| Tensão durante a partida | Não cair abaixo de ~9,6–10 V | Queda maior: bateria fraca ou motor de partida exigindo demais |
| Tensão com o motor ligado | ~13,5 a 14,7 V | Fora da faixa: alternador ou regulador com problema |
| Com cargas ligadas (faróis, ventilador, desembaçador) | Estável, próxima da faixa acima | Queda forte: alternador insuficiente |

::: atencao Atenção
Carros com **gerenciamento inteligente de carga** (comum em modelos com start-stop) podem trabalhar com tensões diferentes dessas faixas por projeto. Os valores são orientativos. Confira também a **data de fabricação** e o tipo da bateria (as de start-stop são específicas).
:::

## Chicotes e conectores

Procure no cofre, sob o painel e sob os bancos:

- **Emendas amadoras**: fita isolante, fios de cores diferentes, conectores "de gambiarra". N2.
- **Chicote substituído em parte do cofre** junto com plásticos derretidos ou fuligem: **indício de incêndio** (N4, capítulo 11).
- **Oxidação esverdeada ou esbranquiçada** em conectores de áreas baixas (sob os bancos, no assoalho, perto da caixa de fusíveis inferior): **indício de enchente** (capítulo 11).

## Demais sistemas elétricos

Teste o funcionamento de: vidros e travas elétricos em todas as portas, retrovisores elétricos, ar-condicionado (temperatura na saída, ruído do compressor, cheiro), central multimídia, câmeras, sensores de estacionamento, limpadores e buzina. Falha isolada de conforto é, em geral, N1 a N2.

::: checklist Checklist do capítulo
- [ ] Observei o autoteste completo do painel
- [ ] Li códigos de falha com estado (ativo, pendente, histórico)
- [ ] Li os monitores de prontidão e registrei os "não prontos"
- [ ] Perguntei sobre desconexão ou troca recente de bateria
- [ ] Medi a bateria em repouso, na partida e com o motor ligado
- [ ] Procurei emendas, sinais de fogo e oxidação em chicotes
- [ ] Testei os acessórios elétricos
:::
