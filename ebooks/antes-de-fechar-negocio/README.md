# Antes de Fechar Negócio: o guia do comprador de carro usado

Produto 2 da linha Protocolo Cautelar. É vendido para o consumidor (R$ 27 + bump de R$ 12) e, em edição com a marca do vistoriador, como upsell do Protocolo Cautelar (R$ 67).

| Pasta / arquivo | Conteúdo |
|---|---|
| `00-briefing.md` | Público, promessa, método em 5 etapas, oferta e edição licenciada |
| `01-conteudo/capitulos/` | Texto do e-book (Markdown) |
| `01-conteudo/dados/checklist-comprador.json` | Os 48 itens do checklist |
| `01-conteudo/bump-test-drive.md` | Material complementar (Test Drive Técnico + moto) |
| `01-conteudo/licenca-como-usar.md` | Guia da edição licenciada |
| `03-materiais/` | Planilhas, modelos Word e o **personalizador** da edição licenciada |
| `04-marketing/` | Oferta e métricas, copies, roteiros, e-mails e página de vendas |
| `05-criativos/` | Mockup e criativos PNG |
| `FINAL/` | PDFs e ZIPs para upload |

## ZIPs para a plataforma (`FINAL/`)
| ZIP | Onde vender |
|---|---|
| `1-Antes-de-Fechar-Negocio.zip` | Produto principal para consumidor (R$ 27) e downsell do Protocolo |
| `2-Test-Drive-Tecnico-e-Moto.zip` | Order bump (R$ 12) |
| `3-Licenca-Guia-do-Comprador-com-a-sua-marca.zip` | Upsell do Protocolo Cautelar (R$ 67) |

## Regerar
```bash
node build/build-ebook.mjs      # edição padrão + edição licenciada (PDF de exemplo e personalizador)
node build/build-bump.mjs       # material complementar
python3 build/build-planilhas.py && python3 build/build-modelos.py
node build/build-criativos.mjs  # mockup e criativos
node build/build-pacotes.mjs    # checklist avulso, guia da licença e ZIPs
```
As bibliotecas compartilhadas (diagramação, mapas de localização, marca) ficam em `../protocolo-cautelar/build/lib/`.
