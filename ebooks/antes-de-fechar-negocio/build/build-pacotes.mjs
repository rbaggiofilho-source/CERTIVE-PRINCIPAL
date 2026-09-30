// Checklist avulso, guia da licença e ZIPs de entrega do "Antes de Fechar Negócio".
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdParaHtml } from '../../protocolo-cautelar/build/lib/md.mjs';
import { htmlToPdf, close } from '../../protocolo-cautelar/build/lib/pdf.mjs';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..'); const PC = join(RAIZ, '../protocolo-cautelar');
const F = join(RAIZ, 'FINAL'); const TMP = join(RAIZ, 'build/.tmp'); mkdirSync(TMP, { recursive: true });

// 1. Checklist avulso (páginas do e-book)
execFileSync('python3', ['-c', `
import pymupdf, sys
d = pymupdf.open(sys.argv[1]); ini = fim = None
for i, p in enumerate(d):
    t = p.get_text()
    if ini is None and 'Checklist do comprador' in t and 'Antes de sair de casa' in t: ini = i
    if ini is not None and i > ini and 'Glossário' in t and 'ATPV-e' in t: fim = i - 1; break
o = pymupdf.open(); o.insert_pdf(d, from_page=ini, to_page=fim); o.save(sys.argv[2]); print(ini + 1, fim + 1)`,
  join(F, 'Antes-de-Fechar-Negocio.pdf'), join(F, 'Checklist-do-comprador.pdf')], { stdio: 'inherit' });

// 2. Guia da licença
const css = ['02-design/fonts/fonts.css', '02-design/tema.css', '02-design/manual.css'].map(p => readFileSync(join(PC, p), 'utf8')
  .replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${join(PC, '02-design/fonts', f)})`)).join('\n')
  .replace('"PROTOCOLO CAUTELAR  ·  Manual do Vistoriador"', '"ANTES DE FECHAR NEGÓCIO  ·  Edição licenciada"') + '\nh1.sem-numero{break-before:avoid}';
writeFileSync(join(TMP, 'licenca.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Edição licenciada · como usar</title><style>${css}</style></head><body>${mdParaHtml(readFileSync(join(RAIZ, '01-conteudo/licenca-como-usar.md'), 'utf8'))}</body></html>`);
await htmlToPdf(join(TMP, 'licenca.html'), join(TMP, 'Como-usar-a-licenca.pdf')); await close();

// 3. Pacotes
const pl = f => readdirSync(join(RAIZ, '03-materiais', f)).filter(x => /\.(xlsx|docx)$/.test(x)).sort().map(x => [`03-materiais/${f}/${x}`, `Ferramentas/${x}`]);
const PAC = {
  '1-Antes-de-Fechar-Negocio': [['FINAL/Antes-de-Fechar-Negocio.pdf', '01-Antes-de-Fechar-Negocio.pdf'], ['FINAL/Checklist-do-comprador.pdf', '02-Checklist-do-comprador-IMPRIMIR.pdf'], ...pl('planilhas'), ...pl('modelos')],
  '2-Test-Drive-Tecnico-e-Moto': [['FINAL/Test-Drive-Tecnico-e-Checklist-de-Moto.pdf', 'Test-Drive-Tecnico-e-Checklist-de-Moto.pdf']],
  '3-Licenca-Guia-do-Comprador-com-a-sua-marca': [['build/.tmp/Como-usar-a-licenca.pdf', '00-Como-usar-a-licenca.pdf'], ['03-materiais/personalizador-edicao-licenciada.html', '01-personalizador-edicao-licenciada.html'], ['FINAL/Antes-de-Fechar-Negocio_Edicao-Licenciada_EXEMPLO.pdf', '02-Exemplo-edicao-licenciada.pdf'], ...pl('planilhas').map(([a, b]) => [a, b.replace('Ferramentas/', 'Ferramentas-para-os-clientes/')]), ...pl('modelos').map(([a, b]) => [a, b.replace('Ferramentas/', 'Ferramentas-para-os-clientes/')])],
};
const ENT = join(F, 'entrega'); rmSync(ENT, { recursive: true, force: true });
for (const [pac, itens] of Object.entries(PAC)) {
  for (const [de, para] of itens) { const alvo = join(ENT, pac, para); mkdirSync(dirname(alvo), { recursive: true }); copyFileSync(join(RAIZ, de), alvo); }
  rmSync(join(F, pac + '.zip'), { force: true });
  execFileSync('python3', ['-c', `import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2], sys.argv[3])`, join(F, pac), ENT, pac]);
}
console.log(execFileSync('bash', ['-c', `cd "${F}" && ls -la *.zip && find entrega -type f | sort`]).toString());
