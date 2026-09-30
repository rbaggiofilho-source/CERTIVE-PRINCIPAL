// Mockup e criativos PNG do guia "Antes de Fechar Negócio".
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyFileSync } from 'node:fs';
import { marca } from '../../protocolo-cautelar/build/lib/arte.mjs';
import { pagina, png } from '../../protocolo-cautelar/build/lib/criativo-base.mjs';
import { close } from '../../protocolo-cautelar/build/lib/pdf.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(RAIZ, '05-criativos'); const TMP = join(RAIZ, 'build/.tmp');
const img = f => pathToFileURL(join(OUT, 'assets', f)).href;
const logo = `<div>${marca({ tamanho: 1.1 })}</div>`;
const gerar = (nome, w, h, corpo, t = false) => png(OUT, TMP, nome, w, h, pagina(w, h, corpo, t ? 'body{background:transparent}' : ''), t);

function cena(s = 1, fundo = true) {
  const x = v => v * s;
  return `${fundo ? '<div class="grid"></div>' : ''}
  <div style="position:absolute;inset:0;perspective:${x(2200)}px">
    <div class="book" style="left:${x(300)}px;top:${x(120)}px;width:${x(460)}px;height:${x(650)}px;transform:rotateY(22deg)"><div class="f"><img src="${img('capa.png')}"></div><div class="l"></div></div></div>
  <div class="sheet" style="left:${x(70)}px;top:${x(470)}px;width:${x(300)}px;transform:rotate(-7deg)"><img src="${img('pagina-sinais.png')}"></div>
  <div class="sheet" style="left:${x(760)}px;top:${x(250)}px;width:${x(320)}px;transform:rotate(5deg)"><img src="${img('pagina-checklist.png')}"></div>
  <div class="sheet" style="left:${x(820)}px;top:${x(560)}px;width:${x(250)}px;transform:rotate(-3deg)"><img src="${img('bump.png')}"></div>`;
}

await gerar('mockup-guia-3d', 1200, 900, cena(1));
await gerar('mockup-guia-3d-transparente', 1200, 900, cena(1, false), true);
copyFileSync(join(OUT, 'mockup-guia-3d-transparente.png'), join(RAIZ, '04-marketing/pagina-de-vendas/img/mockup.png'));

const F = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1080x1920': [1080, 1920] };
const topo = (h) => (h > 1400 ? 260 : 80);
const rod = (h) => (h > 1400 ? 380 : h > 1100 ? 110 : 80);

const C = {
  'C1-sinais-de-alerta': (w, h) => {
    const st = h > 1400; const sin = [['⛔', 'Sinal antes de ver o carro'], ['⛔', 'Pagamento para outra pessoa'], ['⚠', 'Preço muito abaixo do mercado'], ['⚠', 'Pressa: "tem outros interessados"'], ['⛔', 'Recusa de vistoria']];
    return `<div class="grid"></div><div style="position:absolute;left:80px;right:80px;top:${topo(h)}px">${logo}
      <h1 style="--hs:${st ? 84 : 68}px;margin-top:${st ? 60 : 36}px">Antes de pagar qualquer sinal,<br><em>confira estes sinais.</em></h1></div>
      <div style="position:absolute;left:80px;right:80px;top:${st ? 780 : h > 1100 ? 480 : 400}px">${sin.map(([i, t]) => `<div style="display:flex;gap:20px;align-items:center;padding:${st ? 22 : h > 1100 ? 16 : 11}px 0;border-bottom:1px solid rgba(255,255,255,.1);font:700 ${st ? 34 : 29}px var(--f-texto)"><span style="font-size:${st ? 36 : 30}px;width:46px">${i}</span>${t}</div>`).join('')}</div>
      <div style="position:absolute;left:80px;right:80px;bottom:${rod(h)}px;display:flex;justify-content:space-between;align-items:center;gap:20px"><div class="sub" style="font-size:${st ? 30 : 25}px;max-width:560px">Os 12 sinais completos estão no guia.</div><span class="cta" style="font-size:${st ? 28 : 24}px">Ver o guia →</span></div><div class="faixa"></div>`;
  },
  'C2-regra-de-ouro': (w, h) => {
    const st = h > 1400;
    return `<div class="grid"></div><div style="position:absolute;left:80px;right:80px;top:${topo(h)}px">${logo}
      <div class="k" style="margin-top:${st ? 70 : 44}px">A regra de ouro do pagamento</div>
      <h1 style="--hs:${st ? 96 : 80}px;margin-top:18px">Pague só para o<br><em>titular do documento.</em></h1>
      <div class="sub" style="margin-top:${st ? 40 : 26}px;font-size:${st ? 34 : 29}px;max-width:860px">Valor total combinado direto com ele, meio rastreável, nome conferido na tela antes de confirmar. Se alguém pedir sigilo sobre o preço, encerre a conversa.</div></div>
      <div style="position:absolute;left:80px;right:80px;bottom:${rod(h)}px"><div class="sub" style="font-size:${st ? 28 : 24}px;margin-bottom:22px">Do anúncio à transferência: o guia do comprador de carro usado.</div><span class="cta">Conheça o guia →</span></div><div class="faixa"></div>`;
  },
  'C3-guia': (w, h) => {
    const st = h > 1400; const s = st ? .86 : h > 1100 ? .76 : .6;
    return `<div class="grid"></div><div style="position:absolute;left:80px;right:80px;top:${topo(h) - (st ? 0 : 10)}px">${logo}
      <h1 style="--hs:${st ? 80 : 62}px;margin-top:${st ? 50 : 26}px">Antes de fechar negócio,<br><em>saiba o que olhar.</em></h1></div>
      <div style="position:absolute;left:${st ? 0 : h > 1100 ? 40 : 170}px;top:${st ? 560 : h > 1100 ? 380 : 290}px;width:${1200 * s}px;height:${900 * s}px">${cena(s, false)}</div>
      <div style="position:absolute;left:80px;right:80px;bottom:${rod(h) - (st ? 0 : 20)}px;display:flex;flex-wrap:wrap;gap:12px;align-items:center">${['5 etapas', 'Checklist imprimível', '2 planilhas', 'Recibo e contrato'].map(t => `<span style="font:700 ${st ? 24 : 20}px var(--f-texto);border:2px solid rgba(242,169,0,.6);border-radius:40px;padding:8px 18px">${t}</span>`).join('')}</div><div class="faixa"></div>`;
  },
  'C4-checklist': (w, h) => {
    const st = h > 1400;
    return `<div class="grid"></div><div style="position:absolute;left:80px;right:80px;top:${topo(h)}px">${logo}
      <h1 style="--hs:${st ? 82 : 66}px;margin-top:${st ? 50 : 30}px">48 itens para levar<br><em>na visita.</em></h1>
      <div class="sub" style="margin-top:18px;font-size:${st ? 30 : 26}px">Do anúncio ao pagamento, em 5 etapas. Imprima e marque.</div><div style="margin-top:${st ? 34 : 22}px"><span class="cta" style="font-size:${st ? 28 : 22}px;padding:${st ? 22 : 16}px 28px">Quero o checklist →</span></div></div>
      <div class="sheet" style="left:${w / 2 - (st ? 280 : h > 1100 ? 220 : 200)}px;top:${st ? 860 : h > 1100 ? 600 : 520}px;width:${st ? 560 : h > 1100 ? 440 : 400}px;transform:rotate(-3deg)"><img src="${img('pagina-checklist.png')}"></div>
      <div class="faixa"></div>`;
  },
};
for (const [n, fn] of Object.entries(C)) for (const [f, [w, h]] of Object.entries(F)) await gerar(`${n}_${f}`, w, h, fn(w, h));
await close(); console.log('ok');
