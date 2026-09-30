// Gera o Manual do Vistoriador em PDF A4: capa, créditos, sumário com páginas (2 passagens), capítulos.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdParaHtml } from './lib/md.mjs';
import { carroLateral, marca } from './lib/arte.mjs';
import { htmlToPdf, close } from './lib/pdf.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_MD = join(RAIZ, '01-conteudo/manual');
const SAIDA = join(RAIZ, 'FINAL');
const TMP = join(RAIZ, 'build/.tmp');
mkdirSync(SAIDA, { recursive: true }); mkdirSync(TMP, { recursive: true });
const EDICAO = 'Edição 1.0 · 2026';

const arquivos = readdirSync(DIR_MD).filter(f => f.endsWith('.md')).sort();
let corpo = arquivos.map(f => mdParaHtml(readFileSync(join(DIR_MD, f), 'utf8'))).join('\n');

// Numera capítulos (h1 com id cap-N)
corpo = corpo.replace(/<h1 id="cap-(\d+)">/g, (m, n) => `<h1 id="cap-${n}" class="cap" data-n="${String(n).padStart(2, '0')}">`);

// Entradas do sumário
const entradas = [...corpo.matchAll(/<h1 id="([^"]+)"[^>]*>(.*?)<\/h1>/g)].map(m => ({ id: m[1], titulo: m[2].replace(/<[^>]+>/g, '') }));
// subtítulo = primeira linha do resumo do capítulo
for (const e of entradas) {
  const i = corpo.indexOf(`id="${e.id}"`);
  const trecho = corpo.slice(i, i + 1500);
  const r = trecho.match(/box-resumo[\s\S]*?<li>(.*?)<\/li>/);
  e.sub = r ? r[1].replace(/<[^>]+>/g, '') : '';
}

function sumarioHtml(paginas = {}) {
  const partes = { 'cap-1': 'Parte 1 · O método', 'cap-4': 'Parte 2 · O exame técnico', 'cap-13': 'Parte 3 · Evidência, laudo e negócio', 'conclusao': 'Fechamento' };
  let lis = '';
  for (const e of entradas) {
    if (partes[e.id]) lis += `<li class="parte"><span class="n"></span><span class="t">${partes[e.id]}</span></li>`;
    const n = (e.id.match(/^cap-(\d+)/) || [])[1];
    lis += `<li><span class="n">${n ? n.padStart(2, '0') : '·'}</span><a class="t" href="#${e.id}">${e.titulo}${n && e.sub ? `<small>${e.sub}</small>` : ''}</a><span class="p">${paginas[e.id] ?? '00'}</span></li>`;
  }
  return `<section class="sumario"><h1 id="sumario" class="nao-listar">Sumá<span>rio</span></h1><ol>${lis}</ol></section>`;
}

const capa = `
<section class="capa">
  <div class="faixa"></div>
  <div class="topo">${marca({ tamanho: 1.05 })}<span class="selo">KIT PROFISSIONAL</span></div>
  <div class="titulo">
    <div class="sobre">MANUAL DO VISTORIADOR</div>
    <h1>O critério da<span>vistoria cautelar</span></h1>
    <div class="sub">Método de pátio em 12 etapas, escala de níveis N0–N4, leitura de estrutura, pintura, identificação e eletrônica, e o laudo que se sustenta.</div>
  </div>
  <div class="arte">${carroLateral({ traco: 2.2 })}</div>
  <div class="rodape">
    <div class="itens"><b>15</b> capítulos · <b>60</b> fichas de ponto crítico · <b>15</b> fichas de teste<br><b>12</b> checklists · <b>9</b> modelos editáveis · <b>6</b> planilhas · <b>1</b> app offline</div>
    <div class="ed">${EDICAO}</div>
  </div>
</section>`;

const creditos = `
<section class="creditos">
  <h2>Protocolo Cautelar · Manual do Vistoriador</h2>
  <p>${EDICAO}. Todos os direitos reservados. É proibida a reprodução, distribuição ou revenda, total ou parcial, deste material sem autorização por escrito. A licença de uso é pessoal e intransferível; os modelos, checklists e planilhas podem ser usados e personalizados pelo comprador em sua própria atividade profissional.</p>
  <div class="bloco">
    <h2>Aviso legal</h2>
    <p>Este material tem finalidade educacional e de apoio técnico à vistoria cautelar, serviço privado de exame visual e não destrutivo de veículos. Ele <strong>não</strong> habilita para a vistoria de identificação veicular exigida pelo órgão de trânsito, que é exclusiva de empresas credenciadas; <strong>não</strong> é curso credenciado; e <strong>não</strong> substitui a legislação vigente, a orientação dos órgãos de trânsito, a perícia oficial, a assessoria jurídica ou a contábil.</p>
    <p>Os valores técnicos de referência são orientativos e variam por fabricante, modelo e condição do veículo. As normas citadas devem ser conferidas na versão vigente; os pontos marcados <strong>[VERIFICAR]</strong> exigem confirmação na fonte oficial. O uso das informações é de responsabilidade do profissional que as aplica.</p>
    <p>Os casos apresentados são ilustrativos. Nenhuma placa, pessoa ou veículo real é identificado. Nenhum resultado financeiro é prometido.</p>
  </div>
  <div class="aviso"><strong>Compromisso ético.</strong> Este conteúdo existe para proteger quem compra. Não o utilize para ocultar avarias, preparar veículos para "passar" em vistoria ou interferir em elementos de identificação veicular. Condutas desse tipo podem configurar crime.</div>
</section>`;

const css = ['02-design/fonts/fonts.css', '02-design/tema.css', '02-design/manual.css']
  .map(p => readFileSync(join(RAIZ, p), 'utf8').replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${join(RAIZ, '02-design/fonts', f)})`)).join('\n');

const montar = pags => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Protocolo Cautelar · Manual do Vistoriador</title><style>${css}</style></head><body>${capa}${creditos}${sumarioHtml(pags)}${corpo}</body></html>`;

const HTML = join(TMP, 'manual.html');
const PDF = join(SAIDA, 'Protocolo-Cautelar_Manual-do-Vistoriador.pdf');

// Passagem 1
writeFileSync(HTML, montar());
await htmlToPdf(HTML, PDF);
// Descobre a página de cada destino pelos links internos do sumário
const mapa = JSON.parse(execFileSync('python3', ['-c', `
import pymupdf, json, sys
d = pymupdf.open(sys.argv[1]); r = {}
for p in d:
    for l in p.get_links():
        if l.get('nameddest'): r[l['nameddest']] = None
for name in list(r):
    dest = d.resolve_names().get(name)
    if dest: r[name] = dest['page'] + 1
print(json.dumps(r))`, PDF]).toString());
// Passagem 2
writeFileSync(HTML, montar(mapa));
await htmlToPdf(HTML, PDF);
await close();
const n = execFileSync('python3', ['-c', 'import pymupdf,sys;print(pymupdf.open(sys.argv[1]).page_count)', PDF]).toString().trim();
console.log('Manual gerado:', PDF, '·', n, 'páginas');
console.log(JSON.stringify(mapa));
