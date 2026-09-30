// Markdown do Protocolo -> HTML: blocos ":::" aninhados, atributos de título {#id .classe}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { marked } = require(new URL('../../../../js/vendor/marked-18.0.14.umd.js', import.meta.url).pathname);

marked.setOptions({ gfm: true, breaks: false });

export const ICONES = {
  atencao: '<svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 6 1 7h-2l1-7zm0 9.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" fill="currentColor"/></svg>',
  pratica: '<svg viewBox="0 0 24 24"><path d="M22 6.5 13.5 15l-3-3L3 19.5 1.5 18l9-9 3 3 7-7z M15 5h7v7z" fill="currentColor"/></svg>',
  alerta: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11 6h2v8h-2zM11 16h2v2h-2z" fill="currentColor"/></svg>',
  dica: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2zM9 20h6v2H9z" fill="currentColor"/></svg>',
  lei: '<svg viewBox="0 0 24 24"><path d="M12 2 3 6v2h18V6l-9-4zM5 10v7h2v-7H5zm4 0v7h2v-7H9zm4 0v7h2v-7h-2zm4 0v7h2v-7h-2zM3 19v3h18v-3H3z" fill="currentColor"/></svg>',
  caso: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H7l-3 3V4z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 8h8M8 12h5" stroke="currentColor" stroke-width="2"/></svg>',
  checklist: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m7 12 3.5 3.5L17 9" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>',
  resumo: '<svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" stroke-width="2.6"/></svg>',
  sim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="2.6"/></svg>',
  nao: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="m8 8 8 8M16 8l-8 8" stroke="#fff" stroke-width="2.6"/></svg>',
};

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Converte blocos ":::" (aninháveis) em HTML, processando o miolo como markdown.
function blocos(src) {
  const linhas = src.split('\n');
  const pilha = [{ tipo: null, titulo: '', linhas: [] }];
  for (const l of linhas) {
    const abre = l.match(/^:::\s*([a-z-]+)\s*(.*)$/);
    if (abre) { pilha.push({ tipo: abre[1], titulo: abre[2].trim(), linhas: [] }); continue; }
    if (/^:::\s*$/.test(l)) {
      const b = pilha.pop();
      const html = renderBloco(b);
      pilha[pilha.length - 1].linhas.push('', html, '');
      continue;
    }
    pilha[pilha.length - 1].linhas.push(l);
  }
  if (pilha.length !== 1) throw new Error('Bloco ::: não fechado');
  return pilha[0].linhas.join('\n');
}

function renderBloco(b) {
  const miolo = marked.parse(b.linhas.join('\n'));
  if (b.tipo === 'duas-colunas') return `<div class="duas-colunas">${miolo}</div>`;
  if (b.tipo === 'glossario') return `<div class="glossario">${miolo}</div>`;
  const ic = ICONES[b.tipo] || '';
  const titulo = b.titulo ? `<div class="box-t"><span class="box-i">${ic}</span>${marked.parseInline(b.titulo)}</div>` : '';
  return `<div class="box box-${b.tipo}">${titulo}<div class="box-c">${miolo}</div></div>`;
}

// Títulos com {#id .classe}
function titulos(src) {
  return src.replace(/^(#{1,4})[ \t]+(.+?)[ \t]*\{([^}]*)\}[ \t]*$/gm, (m, h, txt, attrs) => {
    const id = (attrs.match(/#([\w-]+)/) || [])[1] || slug(txt);
    const cls = [...attrs.matchAll(/\.([\w-]+)/g)].map(x => x[1]).join(' ');
    const n = h.length;
    return `<h${n} id="${id}"${cls ? ` class="${cls}"` : ''}>${marked.parseInline(txt)}</h${n}>`;
  });
}

export function mdParaHtml(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  src = titulos(src);
  src = blocos(src);
  let html = marked.parse(src);
  // ids automáticos nos h2/h3 sem id
  html = html.replace(/<h([23])>(.*?)<\/h\1>/g, (m, n, t) => `<h${n} id="${slug(t.replace(/<[^>]+>/g, ''))}">${t}</h${n}>`);
  // tabelas envolvidas
  html = html.replace(/<table>/g, '<div class="tabela"><table>').replace(/<\/table>/g, '</table></div>');
  // checkboxes
  html = html.replace(/<input (checked="" )?disabled="" type="checkbox">/g, '<span class="cb"></span>');
  html = html.replace(/<li><span class="cb"><\/span>([\s\S]*?)<\/li>/g, '<li><span class="cb"></span><span>$1</span></li>');
  return html;
}

export { slug, marked };
