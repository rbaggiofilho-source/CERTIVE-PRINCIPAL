# Protocolo Cautelar: o sistema completo do vistoriador cautelar

Produto digital (piloto) para vistoriadores cautelares: método + ferramentas, com um critério único (N0–N4 e matriz de classificação) aplicado em tudo.

## Onde está cada coisa

| Pasta / arquivo | Conteúdo |
|---|---|
| `00-briefing.md` | Posicionamento, análise da referência de mercado, público, critério canônico e limites |
| `01-conteudo/manual/` | Os 15 capítulos do Manual em Markdown (fonte) |
| `01-conteudo/dados/` | Dados canônicos: `sistemas.json` (checklist), `fichas-*.json` (60 fichas), `testes.json` (15 testes) |
| `02-design/` | Tema (cores/fontes), CSS do manual e dos materiais, fontes locais |
| `03-materiais/` | App (fonte + `painel-vistoria.html`), planilhas XLSX, modelos DOCX |
| `04-marketing/` | Oferta e métricas, copies Meta/Google, roteiros de vídeo, e-mails e WhatsApp, copy e **página de vendas** (`pagina-de-vendas/index.html`) |
| `05-criativos/` | Mockup 3D e 12 criativos PNG (4 conceitos × 1080×1080 / 1080×1350 / 1080×1920) |
| `FINAL/` | PDFs finais e os **ZIPs para upload** na plataforma |
| `06-checklist-qualidade.md` | O que foi verificado e as pendências antes de publicar |

## Pacotes para a plataforma de venda (`FINAL/`)

| ZIP | Produto na oferta |
|---|---|
| `1-Protocolo-Cautelar_Kit-Principal.zip` | Produto principal (R$ 37) |
| `2-Pacote-Juridico-e-Comercial.zip` | Order bump 1 (R$ 19) |
| `3-Planilhas-de-Gestao.zip` | Order bump 2 (R$ 14) |

## Como regerar tudo (a partir desta pasta)

```bash
node build/build-manual.mjs        # Manual (PDF com sumário paginado)
node build/build-materiais.mjs     # Fichas, testes e checklists (PDF)
node build/build-app.mjs           # App Painel de Vistoria (HTML único)
node build/test-app.mjs            # Testes automatizados do app
python3 build/build-modelos.py     # Modelos DOCX
python3 build/build-planilhas.py   # Planilhas XLSX
python3 build/verificar-planilhas.py
node build/build-criativos.mjs     # Mockup e criativos PNG
node build/build-pacotes.mjs       # "Comece por aqui" + ZIPs de entrega
```

Requisitos: Node 22 com `puppeteer` (raiz do repositório), Python 3 com `openpyxl`, `python-docx`, `pymupdf` e `pillow`, e LibreOffice para verificar planilhas e modelos.

**Trocar a marca:** o nome e as cores ficam em `02-design/tema.css` e em `build/lib/arte.mjs` (a função `marca`). Os PDFs, os criativos e o app leem dali.
