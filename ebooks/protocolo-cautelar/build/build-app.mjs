#!/usr/bin/env node
// Gera 03-materiais/app/painel-vistoria.html (arquivo único, offline) a partir de 03-materiais/app/src/.
// Embute: sistemas.json, CSS, JS e fontes (Inter e Archivo, subconjunto latin, variáveis) em base64.
// Uso: node ebooks/protocolo-cautelar/build/build-app.mjs
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, '03-materiais/app/src');
const OUT = join(RAIZ, '03-materiais/app/painel-vistoria.html');
const FONTS = join(RAIZ, '02-design/fonts');
const LIMITE = 1.5 * 1024 * 1024;

const ler = p => readFileSync(p, 'utf8');
const b64 = p => readFileSync(p).toString('base64');

// Fontes: os arquivos latin de cada família são fontes variáveis (mesmo arquivo para todos os pesos),
// então basta embutir um por família com faixa de peso. Português usa apenas o subconjunto latin.
const fontes = [
  { familia: 'Inter', arquivo: 'Inter-400-latin.woff2', pesos: '400 700' },
  { familia: 'Archivo', arquivo: 'Archivo-800-latin.woff2', pesos: '500 900' }
];
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
let cssFontes = fontes.map(f => `@font-face{font-family:'${f.familia}';font-style:normal;font-weight:${f.pesos};font-display:swap;src:url(data:font/woff2;base64,${b64(join(FONTS, f.arquivo))}) format('woff2');unicode-range:${LATIN};}`).join('\n');

const css = ler(join(SRC, 'styles.css'));
const js = ['db.js', 'logica.js', 'laudo.js', 'app.js'].map(f => `/* ---- ${f} ---- */\n` + ler(join(SRC, f))).join('\n');
const dados = JSON.stringify(JSON.parse(ler(join(RAIZ, '01-conteudo/dados/sistemas.json')))).replace(/</g, '\\u003c');

if (/<\/script/i.test(js)) throw new Error('JS contém </script>');

let html = ler(join(SRC, 'index.html'));
const trocar = (marca, conteudo) => {
  if (!html.includes(marca)) throw new Error('Marcador ausente: ' + marca);
  html = html.replace(marca, () => conteudo);
};
trocar('/*__FONTS__*/', cssFontes);
trocar('/*__CSS__*/', css);
trocar('/*__DATA__*/', dados);
trocar('/*__JS__*/', js);

// Garantias: nenhuma requisição de rede.
const proibidos = [
  /\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?\/\//i,
  /url\(\s*["']?\s*(?:https?:)?\/\//i,
  /@import/i,
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /new\s+WebSocket/,
  /sendBeacon/
];
for (const re of proibidos) {
  const m = html.match(re);
  if (m) throw new Error(`Referência de rede encontrada (${re}): ${m[0]}`);
}

writeFileSync(OUT, html);
const tam = statSync(OUT).size;
console.log(`OK  ${OUT}\n    ${(tam / 1024).toFixed(1)} KB (${tam} bytes)${tam > LIMITE ? '  ATENÇÃO: acima de 1,5 MB' : ''}`);
