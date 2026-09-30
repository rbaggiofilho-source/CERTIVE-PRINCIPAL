// Gera o "Comece por aqui" e monta os pacotes de entrega (pastas + ZIP) em FINAL/.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdParaHtml } from './lib/md.mjs';
import { htmlToPdf, close } from './lib/pdf.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = join(RAIZ, 'FINAL'); const TMP = join(RAIZ, 'build/.tmp'); mkdirSync(TMP, { recursive: true });

// 1. Comece por aqui (PDF)
const css = ['02-design/fonts/fonts.css', '02-design/tema.css', '02-design/manual.css']
  .map(p => readFileSync(join(RAIZ, p), 'utf8').replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${join(RAIZ, '02-design/fonts', f)})`)).join('\n')
  .replace('Manual do Vistoriador"', 'Comece por aqui"') + '\nh1.sem-numero{break-before:avoid}';
const corpo = mdParaHtml(readFileSync(join(RAIZ, '01-conteudo/comece-aqui.md'), 'utf8'));
writeFileSync(join(TMP, 'comece.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Protocolo Cautelar · Comece por aqui</title><style>${css}</style></head><body>${corpo}</body></html>`);
const COMECE = join(F, '00-Comece-por-aqui.pdf');
await htmlToPdf(join(TMP, 'comece.html'), COMECE);
await close();

// 2. Pacotes
const PAC = {
  '1-Protocolo-Cautelar_Kit-Principal': [
    ['FINAL/00-Comece-por-aqui.pdf', '00-Comece-por-aqui.pdf'],
    ['FINAL/Protocolo-Cautelar_Manual-do-Vistoriador.pdf', '01-Manual-do-Vistoriador.pdf'],
    ['FINAL/Protocolo-Cautelar_Fichas-de-Ponto-Critico.pdf', '02-Fichas-de-Ponto-Critico.pdf'],
    ['FINAL/Protocolo-Cautelar_Fichas-de-Teste.pdf', '03-Fichas-de-Teste.pdf'],
    ['FINAL/Protocolo-Cautelar_Checklists.pdf', '04-Checklists.pdf'],
    ['03-materiais/app/painel-vistoria.html', '05-App-Painel-de-Vistoria/painel-vistoria.html'],
    ['FINAL/.app-como-usar.pdf', '05-App-Painel-de-Vistoria/Como-usar-o-app.pdf'],
    ['03-materiais/app/laudo-exemplo.pdf', '05-App-Painel-de-Vistoria/Exemplo-de-laudo.pdf'],
    ['03-materiais/planilhas/01-registro-de-apontamentos.xlsx', '06-Planilhas/01-registro-de-apontamentos.xlsx'],
    ['03-materiais/planilhas/02-mapa-de-pintura.xlsx', '06-Planilhas/02-mapa-de-pintura.xlsx'],
  ],
  '2-Pacote-Juridico-e-Comercial': readdirSync(join(RAIZ, '03-materiais/modelos')).filter(f => f.endsWith('.docx')).sort().map(f => [`03-materiais/modelos/${f}`, f]),
  '3-Planilhas-de-Gestao': ['03-precificacao.xlsx', '04-controle-de-vistorias.xlsx', '05-comparativo-anuncio-x-veiculo.xlsx', '06-agenda-e-rota.xlsx'].map(f => [`03-materiais/planilhas/${f}`, f]),
};

// Guia do app em PDF
const guia = mdParaHtml(readFileSync(join(RAIZ, '03-materiais/app/COMO-USAR.md'), 'utf8').replace(/^# (.*)$/m, '# $1 {#guia .sem-numero}'));
writeFileSync(join(TMP, 'guia-app.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel de Vistoria · Como usar</title><style>${css.replace('Comece por aqui"', 'Painel de Vistoria"')}</style></head><body>${guia}</body></html>`);
await htmlToPdf(join(TMP, 'guia-app.html'), join(F, '.app-como-usar.pdf'));
await close();

const ENT = join(F, 'entrega'); rmSync(ENT, { recursive: true, force: true });
for (const [pac, itens] of Object.entries(PAC)) {
  for (const [de, para] of itens) {
    const alvo = join(ENT, pac, para); mkdirSync(dirname(alvo), { recursive: true }); copyFileSync(join(RAIZ, de), alvo);
  }
  rmSync(join(F, pac + '.zip'), { force: true });
  execFileSync('python3', ['-c', `import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2], sys.argv[3])`, join(F, pac), ENT, pac]);
}
rmSync(join(F, '.app-como-usar.pdf'), { force: true });
console.log(execFileSync('bash', ['-c', `cd "${F}" && ls -la *.zip && find entrega -type f | sort`]).toString());
