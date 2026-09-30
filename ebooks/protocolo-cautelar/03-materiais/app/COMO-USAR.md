# Painel de Vistoria — como usar

O Painel de Vistoria é **um único arquivo** (`painel-vistoria.html`) que funciona no navegador do celular ou do computador, **sem internet** e sem cadastro. Roteiro dos 10 sistemas (e anexos Moto e Utilitário), níveis N0–N4, fotos, mapa de pintura, classificação automática e laudo em PDF com a **sua** marca.

## 1. Abrir no celular

**Android (Chrome)**
1. Baixe `painel-vistoria.html` no celular (pela área de membros ou pelo computador, via cabo/e-mail/app de mensagens).
2. Abra o app **Arquivos/Downloads**, toque no arquivo e escolha **Chrome** para abrir.
3. Na primeira vez, preencha a **Configuração** (nome/empresa, CNPJ/CPF, contato, logo e texto de limites do laudo).
4. Atalho: no Chrome, menu **⋮ → Adicionar à tela inicial**. Em alguns aparelhos essa opção não aparece para arquivos locais; nesse caso, salve o arquivo em uma pasta fixa e crie um atalho pelo gerenciador de arquivos, ou abra pelo histórico do Chrome.

**iPhone (Safari)**
1. Salve o arquivo no app **Arquivos** (“No meu iPhone”).
2. A pré-visualização do app Arquivos **não executa** o painel. Abra o arquivo em um navegador ou em um aplicativo leitor de HTML que execute JavaScript (há opções gratuitas na App Store). [VERIFICAR: se a área de membros oferecer um link direto para o arquivo, abra-o no Safari e use **Compartilhar → Adicionar à Tela de Início**.]
3. Use sempre o mesmo caminho para abrir: os dados ficam ligados ao navegador/aplicativo e ao local do arquivo.

**Computador** (Chrome, Edge, Firefox ou Safari): dê dois cliques no arquivo.

> Importante: **não renomeie nem mova** o arquivo depois de começar a usar. Em alguns navegadores os dados salvos ficam vinculados ao endereço do arquivo e “somem” (continuam no aparelho, mas não aparecem) se o endereço mudar. Se precisar mudar, exporte um backup antes e importe depois.

## 2. Fluxo de uma vistoria
1. **Vistoria**: toque em *Nova vistoria*, escolha o tipo (carro, moto ou utilitário) e preencha placa, modelo, anos, cor, km, chassi, RENAVAM, combustível, solicitante e local. Data e hora já vêm preenchidas. O número do laudo é sequencial.
2. **Roteiro**: para cada item, marque **N0 a N4**, **N/A** (não se aplica) ou, nos itens críticos de identificação, **Não verificável**. Use *Obs.* para descrever o que foi constatado e *Câmera/Galeria* para as fotos (são reduzidas automaticamente). Tocar de novo no nível marcado desfaz a marcação.
3. **Pintura** (carros e utilitários): até 5 leituras por peça. A referência é a mediana das médias das peças (ou o valor que você definir). Semáforo: abaixo de 0,7× a referência = mais fina que as demais, investigar (polimento intenso ou peça substituída); de 0,7× a 1,3× = compatível; até 2× = provável repintura; acima = provável repintura com massa/reparo. **É orientativo**: a espessura de fábrica varia por fabricante, modelo, cor e processo, e a conclusão é sua, confirmada pela inspeção visual. Para-choques são plásticos e não são medidos.
4. **Resumo**: contagem por nível, lista de N2/N3/N4, pendências e a classificação automática pela matriz: não verificável → INCONCLUSIVO; N4 → REPROVADO; N2/N3 → APROVADO COM APONTAMENTOS; só N0/N1 → APROVADO. Escreva seu parecer, se quiser.
5. **Laudo**: só é liberado com todos os itens respondidos. Toque em **Imprimir / Salvar PDF** e escolha **Salvar como PDF** (Android: na tela de impressão, selecione a impressora “Salvar como PDF”; iPhone: na tela de impressão, afaste dois dedos sobre a prévia e use Compartilhar → Salvar em Arquivos).

A classificação “APROVADO” refere-se ao exame técnico visual no momento da vistoria; não aprova a compra, não garante o veículo e não substitui a vistoria oficial.

## 3. Backup (faça sempre)
- **Uma vistoria**: *Minhas vistorias → Exportar* gera um arquivo `.json` com os dados e as fotos.
- **Tudo**: *Configuração → Exportar tudo* gera um backup completo (vistorias, fotos e configuração).
- **Restaurar / trocar de aparelho**: *Importar* e escolha o arquivo `.json`.
- Guarde os backups fora do celular (computador, pen drive ou nuvem de sua escolha).

## 4. Privacidade (LGPD)
Os dados ficam **somente no aparelho**, no armazenamento do navegador; o painel não envia nada para a internet. Você é o responsável por eles (LGPD — Lei 13.709/2018): informe o solicitante sobre as fotos e o uso do laudo, proteja o aparelho com senha e apague o que não precisa mais guardar. Ao compartilhar backups `.json`, lembre que eles contêm placas, nomes e fotos.

## 5. Limitações conhecidas
- **Limpar os dados do navegador apaga as vistorias.** O iPhone pode apagar dados de páginas não usadas por algumas semanas. Faça backup.
- O espaço depende do navegador/aparelho; cada foto ocupa cerca de 150–300 KB. Exporte e exclua vistorias antigas periodicamente.
- Não funciona em modo anônimo/privado de forma confiável (os dados podem ser descartados ao fechar).
- Não há sincronização entre aparelhos: use exportar/importar.
- A aparência do PDF pode variar um pouco entre navegadores; confira a prévia antes de enviar.
- O painel apoia o registro e a organização; os níveis e a conclusão são sempre decisão técnica do vistoriador. Não substitui vistoria oficial (ECV), perícia ou exame por autoridade competente.
