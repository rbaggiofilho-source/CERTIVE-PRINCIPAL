// Gera "Antes de Fechar Negócio": edição padrão (PDF) e edição licenciada (personalizador HTML offline + PDF de exemplo).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdParaHtml } from '../../protocolo-cautelar/build/lib/md.mjs';
import { carroLateral, marca } from '../../protocolo-cautelar/build/lib/arte.mjs';
import { mapaLocal } from '../../protocolo-cautelar/build/lib/locais.mjs';
import { htmlToPdf, close } from '../../protocolo-cautelar/build/lib/pdf.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PC = join(RAIZ, '../protocolo-cautelar');
const TMP = join(RAIZ, 'build/.tmp'); mkdirSync(TMP, { recursive: true });
const FINAL = join(RAIZ, 'FINAL'); mkdirSync(FINAL, { recursive: true });
const EDICAO = 'Edição 1.0 · 2026';
const TITULO = 'Antes de Fechar Negócio';

// ---------- conteúdo ----------
const CK = JSON.parse(readFileSync(join(RAIZ, '01-conteudo/dados/checklist-comprador.json'), 'utf8'));
const LEG = { lateral: 'Pontos da volta de 360°: compare vãos, cor e textura peça a peça, dos dois lados.', pneu: 'No pneu: o código DOT (idade) fica na lateral; o desgaste se lê na banda.', interior: 'Onde procurar sinais de enchente: sob o tapete, nos trilhos dos bancos e nos cintos.' };

function checklistHtml() {
  const tabela = e => `<div class="ck-etapa"><div class="ck-t"><span>${e.id}</span>${e.nome}</div>
    <table class="ckc"><tr><th style="width:8mm">OK</th><th>Item</th><th style="width:12mm">Alerta</th><th style="width:48mm">Anotação</th></tr>
    ${e.itens.map(i => `<tr><td><span class="cb"></span></td><td>${i}</td><td><span class="cb"></span></td><td></td></tr>`).join('')}</table></div>`;
  return `<section class="checklist-imp" id="checklist"><h2 id="checklist-do-comprador">Checklist do comprador</h2>
    <div class="ck-dados"><span>Carro / placa</span><span>Vendedor</span><span>Data</span></div>
    ${CK.etapas.slice(0, 3).map(tabela).join('')}</section>
    <section class="checklist-imp">${CK.etapas.slice(3).map(tabela).join('')}
    <div class="box box-atencao" style="margin-top:6mm"><div class="box-c"><p><b>Marcou "Alerta" em algum item?</b> Pergunte ao vendedor, registre a resposta e mostre ao vistoriador. Alerta nas etapas A ou E, especialmente sobre proprietário, pagamento ou restrições, é motivo para não fechar até esclarecer.</p></div></div></section>`;
}

function ctaHtml(lic) {
  if (!lic) return `<div class="cta-final"><div class="k">Antes de pagar</div><h3>Chame um vistoriador cautelar</h3>
    <p>Este guia leva você longe, mas a estrutura, a identificação completa, a pintura medida e a eletrônica do carro pedem ferramentas e experiência. Procure um vistoriador cautelar <b>independente</b> na sua cidade, que explique o critério e entregue laudo com fotos (capítulo 7).</p></div>`;
  return `<div class="cta-final lic"><div class="lic-logo"><img data-logo alt="" style="display:none"><span data-sem-logo>SUA LOGO</span></div>
    <div class="k">Antes de pagar</div><h3 data-campo="chamada">Faça a vistoria cautelar com quem inspeciona carros todos os dias</h3>
    <p data-campo="texto">Leve este guia para a visita e, antes de fechar, agende a sua vistoria cautelar. Você recebe laudo com fotos, classificação explicada e as consultas do veículo.</p>
    <div class="lic-contato"><b data-campo="nome">[NOME DA EMPRESA / VISTORIADOR]</b><span data-campo="telefone">[WHATSAPP]</span><span data-campo="cidade">[CIDADE / REGIÃO]</span><span data-campo="site">[SITE / INSTAGRAM]</span></div></div>`;
}

function corpo(lic) {
  const arquivos = readdirSync(join(RAIZ, '01-conteudo/capitulos')).filter(f => f.endsWith('.md')).sort();
  let src = arquivos.map(f => readFileSync(join(RAIZ, '01-conteudo/capitulos', f), 'utf8')).join('\n\n');
  let h = mdParaHtml(src);
  h = h.replace(/<p>\{\{mapa (\w+) ([\w,-]+)\}\}<\/p>/g, (m, v, z) => `<figure class="mapa-fig">${mapaLocal(v, z.split(','))}<figcaption>${LEG[v] || ''}</figcaption></figure>`);
  h = h.replace(/<p>\{\{checklist\}\}<\/p>/, checklistHtml());
  h = h.replace(/<p>\{\{cta\}\}<\/p>/, ctaHtml(lic));
  h = h.replace(/<h1 id="cap-(\d+)">/g, (m, n) => `<h1 id="cap-${n}" class="cap" data-n="${String(n).padStart(2, '0')}">`);
  return h;
}

// ---------- capa, créditos, sumário ----------
function capa(lic) {
  const rodape = lic
    ? `<div class="rodape"><div class="oferecido"><div class="lic-logo claro"><img data-logo alt="" style="display:none"><span data-sem-logo>SUA LOGO</span></div><div><small>Oferecido por</small><b data-campo="nome">[NOME DA EMPRESA / VISTORIADOR]</b><span data-campo="telefone">[WHATSAPP]</span></div></div><div class="ed">${EDICAO}</div></div>`
    : `<div class="rodape"><div class="itens"><b>5</b> etapas · <b>9</b> capítulos · checklist imprimível<br><b>2</b> planilhas · recibo e contrato editáveis</div><div class="ed">${EDICAO}</div></div>`;
  return `<section class="capa"><div class="faixa"></div>
  <div class="topo">${lic ? '<span></span>' : marca({ tamanho: 1.05 })}<span class="selo">GUIA DO COMPRADOR</span></div>
  <div class="titulo"><div class="sobre">CARRO USADO</div><h1>Antes de fechar<span>negócio</span></h1>
    <div class="sub">O guia do vistoriador para comprar carro usado sem cair nas armadilhas mais comuns: o que olhar, o que perguntar, o que consultar e quando chamar um profissional.</div></div>
  <div class="arte">${carroLateral({ traco: 2.2 })}</div>${rodape}</section>`;
}

function creditos(lic) {
  return `<section class="creditos"><h2>${TITULO}</h2>
  <p>${EDICAO}. Todos os direitos reservados. ${lic ? 'Edição licenciada para distribuição gratuita pelo licenciado aos seus próprios clientes. É proibida a revenda.' : 'É proibida a reprodução, distribuição ou revenda sem autorização por escrito.'} Publicado pelo Protocolo Cautelar.</p>
  <div class="bloco"><h2>Aviso legal</h2>
  <p>Este guia tem finalidade educativa e ajuda a reduzir riscos na compra de veículos usados. Ele <strong>não</strong> garante o resultado da compra, <strong>não</strong> substitui a vistoria cautelar profissional, a vistoria de transferência exigida pelo órgão de trânsito nem a orientação jurídica. Procedimentos, taxas e prazos variam por estado e mudam com o tempo; os pontos marcados <strong>[VERIFICAR]</strong> devem ser confirmados no órgão de trânsito do seu estado.</p>
  <p>Os casos apresentados são ilustrativos. Nenhuma pessoa, placa ou veículo real é identificado.</p></div>
  <div class="aviso"><strong>Compromisso.</strong> Este guia existe para proteger quem compra. Ele não ensina, nem deve ser usado para, esconder defeitos ou preparar veículos para enganar compradores ou vistorias.</div></section>`;
}

function sumario(entradas, pags) {
  const lis = entradas.map(e => { const n = (e.id.match(/^cap-(\d+)/) || [])[1];
    return `<li><span class="n">${n ? n.padStart(2, '0') : '·'}</span><a class="t" href="#${e.id}">${e.titulo}</a><span class="p">${pags[e.id] ?? '00'}</span></li>`; }).join('');
  return `<section class="sumario"><h1 id="sumario">Sumá<span>rio</span></h1><ol>${lis}</ol></section>`;
}

// ---------- CSS ----------
const fontesCss = (embutir) => readFileSync(join(PC, '02-design/fonts/fonts.css'), 'utf8').replace(/url\((\S+?\.woff2)\)/g, (m, f) =>
  embutir ? `url(data:font/woff2;base64,${readFileSync(join(PC, '02-design/fonts', f)).toString('base64')})` : `url(${join(PC, '02-design/fonts', f)})`);
const EXTRA = `
.capa h1{color:#fff}
.mapa-fig{margin:3mm 0 5mm;border:1px solid var(--linha);border-radius:6px;padding:3mm 6mm;break-inside:avoid;background:#fff}
.mapa-fig svg{width:100%;max-height:62mm}
.mapa-fig figcaption{font-size:8pt;color:var(--texto-3);text-align:center;margin-top:1mm}
.checklist-imp{break-before:page}
.ck-dados{display:grid;grid-template-columns:1.4fr 1.2fr .8fr;gap:5mm;margin:0 0 4mm}
.ck-dados span{border-bottom:1px solid #9AA3AE;padding-bottom:5mm;font:600 7.5pt var(--f-texto);color:var(--texto-2)}
.ck-etapa{margin-bottom:4mm;break-inside:avoid}
.ck-t{display:flex;align-items:center;gap:2.5mm;font:800 10.5pt var(--f-titulo);color:var(--carbono);margin-bottom:1.5mm}
.ck-t span{width:6mm;height:6mm;border-radius:50%;background:var(--carbono);color:var(--ambar);font:900 8.5pt/6mm var(--f-titulo);text-align:center}
table.ckc{width:100%;border-collapse:collapse;font-size:8.2pt}
table.ckc th{background:var(--carbono);color:#fff;font:700 7pt var(--f-texto);padding:1.4mm 2mm;text-align:left}
table.ckc td{border-bottom:1px solid var(--linha);padding:1.35mm 2mm;vertical-align:middle}
table.ckc td:first-child,table.ckc td:nth-child(3){text-align:center}
table.ckc td:nth-child(4){border-left:1px dashed var(--linha)}
table.ckc .cb{display:inline-block;margin:0}
.cta-final{break-inside:avoid;margin-top:10mm;background:var(--carbono);color:#E6EAEF;border-radius:8px;padding:7mm 8mm;border-top:5px solid var(--ambar)}
.cta-final .k{font:700 7.5pt var(--f-mono);letter-spacing:.24em;color:var(--ambar);text-transform:uppercase}
.cta-final h3{color:#fff;font:900 17pt/1.15 var(--f-titulo);margin:2mm 0 3mm}
.cta-final p{color:#C9D1DA;margin:0}
.lic-logo{width:34mm;height:16mm;border:1.5px dashed rgba(242,169,0,.7);border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 7pt var(--f-mono);color:var(--ambar);letter-spacing:.14em;overflow:hidden;float:right;margin:0 0 3mm 5mm;background:#fff}
.lic-logo img{max-width:100%;max-height:100%;object-fit:contain}
.lic-contato{display:flex;flex-wrap:wrap;gap:2mm 5mm;margin-top:4mm;padding-top:3mm;border-top:1px solid rgba(242,169,0,.3);font-size:9.5pt}
.lic-contato b{color:var(--ambar);width:100%;font:800 11pt var(--f-titulo)}
.capa .oferecido{display:flex;align-items:center;gap:5mm}
.capa .oferecido .lic-logo{float:none;margin:0;width:38mm;height:18mm}
.capa .oferecido small{display:block;font:700 7pt var(--f-mono);letter-spacing:.2em;color:#9aa3ae;text-transform:uppercase}
.capa .oferecido b{display:block;font:800 12pt var(--f-titulo);color:#fff}
.capa .oferecido span{font-size:9pt;color:#C9D1DA}
`;
function css(lic, embutir) {
  const base = [fontesCss(embutir), readFileSync(join(PC, '02-design/tema.css'), 'utf8'), readFileSync(join(PC, '02-design/manual.css'), 'utf8'), EXTRA].join('\n');
  return base.replace('"PROTOCOLO CAUTELAR  ·  Manual do Vistoriador"', lic ? '"[NOME DA EMPRESA / VISTORIADOR]  ·  [WHATSAPP]"' : '"ANTES DE FECHAR NEGÓCIO  ·  Protocolo Cautelar"');
}

// ---------- personalizador (edição licenciada) ----------
const PERSONALIZADOR = `
<style media="screen">
body{padding-top:0}
#painel{position:sticky;top:0;z-index:99;background:#0F1318;color:#fff;padding:14px 18px;font:14px var(--f-texto);box-shadow:0 6px 20px rgba(0,0,0,.4)}
#painel h4{margin:0 0 8px;font:800 16px var(--f-titulo);color:#F2A900}
#painel .g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
#painel label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#C9D1DA}
#painel input,#painel textarea{font:14px var(--f-texto);padding:8px;border-radius:8px;border:1px solid #2A3440;background:#1B222B;color:#fff}
#painel button{margin-top:10px;background:#F2A900;border:0;border-radius:10px;padding:12px 18px;font:900 15px var(--f-titulo);cursor:pointer}
#painel small{display:block;margin-top:6px;color:#8b95a1}
.capa,.creditos,.sumario,body>h1,body>h2,body>p,body>div,body>section,body>figure,body>ul,body>ol,body>table{max-width:210mm;margin-left:auto;margin-right:auto}
</style>
<style media="print">#painel{display:none}</style>
<div id="painel"><h4>Personalize o guia com a sua marca</h4><div class="g">
<label>Nome da empresa / vistoriador<input data-in="nome" maxlength="60"></label>
<label>WhatsApp / telefone<input data-in="telefone" maxlength="30"></label>
<label>Cidade / região<input data-in="cidade" maxlength="50"></label>
<label>Site / Instagram<input data-in="site" maxlength="50"></label>
<label>Chamada (página final)<input data-in="chamada" maxlength="90"></label>
<label>Texto (página final)<textarea data-in="texto" maxlength="260" rows="2"></textarea></label>
<label>Logo (PNG/JPG)<input type="file" accept="image/*" id="logo"></label></div>
<button onclick="window.print()">Gerar PDF (Imprimir → Salvar como PDF)</button>
<small>Na janela de impressão: destino "Salvar como PDF", papel A4, margens "Padrão", marque "Gráficos de plano de fundo". Os dados ficam só neste navegador.</small></div>
<script>
(function(){
  var K='afn_lic';var d={};try{d=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
  var rod=document.createElement('style');document.head.appendChild(rod);
  function esc(s){return String(s).replace(/["\\\\]/g,'')}
  function aplicar(){
    document.querySelectorAll('[data-campo]').forEach(function(el){var k=el.getAttribute('data-campo');if(d[k])el.textContent=d[k];});
    document.querySelectorAll('[data-logo]').forEach(function(img){if(d.logo){img.src=d.logo;img.style.display='block'}});
    document.querySelectorAll('[data-sem-logo]').forEach(function(s){s.style.display=d.logo?'none':''});
    var t=(d.nome||'[NOME DA EMPRESA / VISTORIADOR]')+'  ·  '+(d.telefone||'[WHATSAPP]');
    rod.textContent='@page{@bottom-left{content:"'+esc(t)+'"}}';
  }
  document.querySelectorAll('[data-in]').forEach(function(inp){var k=inp.getAttribute('data-in');if(d[k])inp.value=d[k];
    inp.addEventListener('input',function(){d[k]=inp.value;try{localStorage.setItem(K,JSON.stringify(d))}catch(e){}aplicar();});});
  document.getElementById('logo').addEventListener('change',function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();
    r.onload=function(){var im=new Image();im.onload=function(){var c=document.createElement('canvas');var s=Math.min(1,600/Math.max(im.width,im.height));c.width=im.width*s;c.height=im.height*s;c.getContext('2d').drawImage(im,0,0,c.width,c.height);d.logo=c.toDataURL('image/png');try{localStorage.setItem(K,JSON.stringify(d))}catch(e){}aplicar();};im.src=r.result;};r.readAsDataURL(f);});
  aplicar();
})();
</script>`;

// ---------- montagem ----------
async function gerar(lic) {
  const c = corpo(lic);
  const entradas = [...c.matchAll(/<h1 id="([^"]+)"[^>]*>(.*?)<\/h1>/g)].map(m => ({ id: m[1], titulo: m[2].replace(/<[^>]+>/g, '') }));
  const doc = (pags, embutir, painel) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${TITULO}${lic ? ' · edição licenciada' : ''}</title><style>${css(lic, embutir)}</style></head><body>${painel ? PERSONALIZADOR : ''}${capa(lic)}${creditos(lic)}${sumario(entradas, pags)}${c}</body></html>`;
  const html = join(TMP, lic ? 'licenciada.html' : 'padrao.html');
  const pdf = join(FINAL, lic ? 'Antes-de-Fechar-Negocio_Edicao-Licenciada_EXEMPLO.pdf' : 'Antes-de-Fechar-Negocio.pdf');
  writeFileSync(html, doc({}, false, false)); await htmlToPdf(html, pdf);
  const pags = JSON.parse(execFileSync('python3', ['-c', `
import pymupdf, json, sys
d = pymupdf.open(sys.argv[1]); n = d.resolve_names()
print(json.dumps({k: v['page'] + 1 for k, v in n.items()}))`, pdf]).toString());
  writeFileSync(html, doc(pags, false, false)); await htmlToPdf(html, pdf);
  if (lic) writeFileSync(join(RAIZ, '03-materiais/personalizador-edicao-licenciada.html'), doc(pags, true, true));
  const np = execFileSync('python3', ['-c', 'import pymupdf,sys;print(pymupdf.open(sys.argv[1]).page_count)', pdf]).toString().trim();
  console.log(pdf, np, 'páginas');
}
await gerar(false);
await gerar(true);
await close();
