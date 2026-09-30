// Mapas de localização esquemáticos por "vista". Cada zona tem data-z; as zonas pedidas ficam em âmbar.
import { PERFIL } from './arte.mjs';

const ARCO_D = 'A82 82 0 0 0 170 300';
const ARCO_T = 'A82 82 0 0 0 698 300';

// Cada vista: { vb, base (desenho de fundo), zonas: {id: svg}, rotulos: {id: nome} }
export const VISTAS = {
  lateral: {
    vb: '0 0 1000 400',
    base: `<path d="${PERFIL.corpo}" class="b"/><path d="${PERFIL.vidros}" class="b2"/><path d="${PERFIL.portas}" class="l"/>`,
    zonas: {
      'parachoque-d': 'M62 300 C52 290 50 268 56 252 L64 236 C70 226 84 222 104 220 L106 300 Z',
      'paralama-d': `M106 220 L318 204 L404 190 L404 300 L334 300 ${ARCO_D} L106 300 Z`,
      'porta-d': 'M404 190 L556 184 L566 186 L566 292 L404 292 Z',
      'porta-t': 'M566 186 L740 186 L744 196 L752 292 L566 292 Z',
      'lateral-t': `M744 196 L806 196 L912 204 L930 244 L932 300 L862 300 A82 82 0 0 0 752 292 Z`,
      'parachoque-t': 'M912 204 C930 206 940 214 944 228 L948 262 C950 282 944 296 930 300 L920 300 Z',
      'capo': 'M104 220 L318 204 C350 200 372 190 392 176 L400 184 L320 214 L108 232 Z',
      'teto': 'M456 132 C464 124 474 118 492 117 L646 115 C668 115 684 120 700 132 L690 138 L480 132 Z',
      'tampa': 'M770 184 C780 191 792 195 806 196 L912 204 L910 214 L790 206 Z',
      'coluna-a': 'M392 176 L446 132 L462 132 L406 180 Z',
      'coluna-b': 'M556 127 L572 127 L572 186 L556 186 Z',
      'coluna-c': 'M682 140 L700 132 L770 184 L744 196 Z',
      'soleira': 'M338 284 L694 284 L698 300 L334 300 Z',
      'roda-d': '<circle cx="252" cy="300" r="64"/>',
      'roda-t': '<circle cx="780" cy="300" r="64"/>',
      'farol': PERFIL.farol,
      'lanterna': PERFIL.lanterna,
      'vidros': PERFIL.vidros,
      'retrovisor': 'M398 176 L426 172 L430 190 L402 194 Z',
    },
  },
  estrutura: {
    vb: '0 0 1000 400',
    base: `<rect x="40" y="55" width="920" height="290" rx="90" class="b"/>
      <rect x="165" y="42" width="130" height="34" rx="10" class="r"/><rect x="165" y="324" width="130" height="34" rx="10" class="r"/>
      <rect x="715" y="42" width="130" height="34" rx="10" class="r"/><rect x="715" y="324" width="130" height="34" rx="10" class="r"/>
      <text x="330" y="26" class="t">◀ FRENTE</text>`,
    zonas: {
      'longarina-d': 'M62 112 L318 112 L318 132 L62 132 Z M62 268 L318 268 L318 288 L62 288 Z',
      'painel-frontal': 'M56 100 L80 100 L80 300 L56 300 Z',
      'torre': '<circle cx="245" cy="140" r="24"/><circle cx="245" cy="260" r="24"/>',
      'caixa-roda-d': 'M160 78 L300 78 L300 104 L160 104 Z M160 296 L300 296 L300 322 L160 322 Z',
      'corta-fogo': 'M322 84 L338 84 L338 316 L322 316 Z',
      'assoalho': 'M345 112 L755 112 L755 288 L345 288 Z',
      'tunel': 'M345 186 L755 186 L755 214 L345 214 Z',
      'soleira': 'M340 70 L760 70 L760 96 L340 96 Z M340 304 L760 304 L760 330 L340 330 Z',
      'coluna-b': 'M530 60 L556 60 L556 98 L530 98 Z M530 302 L556 302 L556 340 L530 340 Z',
      'longarina-t': 'M760 120 L940 120 L940 140 L760 140 Z M760 260 L940 260 L940 280 L760 280 Z',
      'porta-malas': 'M790 150 L925 150 L925 250 L790 250 Z',
      'painel-traseiro': 'M942 110 L958 110 L958 290 L942 290 Z',
      'suspensao-d': 'M200 104 L290 150 M200 296 L290 250',
      'suspensao-t': 'M720 104 L800 150 M720 296 L800 250',
      'teto': 'M400 100 L745 100 L745 300 L400 300 Z',
    },
  },
  cofre: {
    vb: '0 0 1000 400',
    base: `<path d="M120 40 L880 40 L940 360 L60 360 Z" class="b"/><text x="470" y="30" class="t">FRENTE ▲</text>`,
    zonas: {
      'radiador': 'M170 60 L830 60 L830 100 L170 100 Z',
      'motor': 'M330 130 L670 130 L670 300 L330 300 Z',
      'numero-motor': 'M600 250 L660 250 L660 290 L600 290 Z',
      'bateria': 'M150 150 L270 150 L270 250 L150 250 Z',
      'reservatorios': '<rect x="720" y="140" width="110" height="70" rx="18"/><rect x="740" y="235" width="80" height="55" rx="14"/>',
      'correias': 'M300 140 L322 140 L322 290 L300 290 Z',
      'etiqueta-cofre': 'M160 290 L240 290 L240 330 L160 330 Z',
      'vin-cofre': 'M420 320 L580 320 L580 350 L420 350 Z',
    },
  },
  interior: {
    vb: '0 0 1000 400',
    base: `<rect x="60" y="40" width="880" height="320" rx="60" class="b"/><text x="80" y="30" class="t">FRENTE ◀</text>`,
    zonas: {
      'painel': 'M80 70 L200 70 L200 330 L80 330 Z',
      'volante': '<circle cx="235" cy="275" r="38"/>',
      'pedais': 'M150 250 L180 250 L180 300 L150 300 Z',
      'bancos': 'M300 80 L430 80 L430 170 L300 170 Z M300 230 L430 230 L430 320 L300 320 Z M600 80 L800 80 L800 320 L600 320 Z',
      'cintos': 'M300 170 L430 80 M300 320 L430 230 M620 80 L700 200 M720 200 L800 320',
      'carpete': 'M440 90 L590 90 L590 310 L440 310 Z',
      'airbag': '<circle cx="235" cy="275" r="14"/><circle cx="140" cy="130" r="16"/>',
      'trilhos': 'M300 176 L430 176 L430 186 L300 186 Z M300 214 L430 214 L430 224 L300 224 Z',
      'etiqueta-coluna': 'M500 40 L560 40 L560 64 L500 64 Z',
    },
  },
  documento: {
    vb: '0 0 1000 400',
    base: `<rect x="80" y="40" width="520" height="320" rx="18" class="b"/><path d="M110 110 L470 110 M110 150 L420 150 M110 190 L450 190 M110 230 L380 230 M110 270 L440 270" class="l"/>
      <rect x="660" y="140" width="280" height="110" rx="12" class="b"/><text x="740" y="130" class="t">PLACA</text>`,
    zonas: {
      'documento': 'M100 60 L580 60 L580 90 L100 90 Z M100 100 L480 100 L480 280 L100 280 Z',
      'qrcode': 'M490 250 L580 250 L580 340 L490 340 Z',
      'placa': 'M670 150 L930 150 L930 240 L670 240 Z',
    },
  },
  pneu: {
    vb: '0 0 1000 400',
    base: `<circle cx="340" cy="200" r="170" class="b"/><circle cx="340" cy="200" r="95" class="b2"/>
      <rect x="600" y="80" width="340" height="240" rx="20" class="b"/><path d="M630 110 L630 290 M680 110 L680 290 M730 110 L730 290 M780 110 L780 290 M830 110 L830 290 M880 110 L880 290" class="l"/>
      <text x="690" y="350" class="t">BANDA (vista frontal)</text>`,
    zonas: {
      'banda': '<path d="M340 30 A170 170 0 1 1 339.9 30 Z M340 52 A148 148 0 1 0 340.1 52 Z" fill-rule="evenodd"/><rect x="610" y="95" width="320" height="210" rx="14"/>',
      'dot': 'M430 90 L520 90 L520 130 L430 130 Z',
      'flanco': '<path d="M340 52 A148 148 0 1 1 339.9 52 Z M340 105 A95 95 0 1 0 340.1 105 Z" fill-rule="evenodd"/>',
      'roda': '<circle cx="340" cy="200" r="92"/>',
    },
  },
  moto: {
    vb: '0 0 1000 400',
    base: `<circle cx="210" cy="290" r="90" class="b"/><circle cx="790" cy="290" r="90" class="b"/>
      <path d="M300 120 L450 100 L650 120 L720 160" class="l"/>`,
    zonas: {
      'quadro': 'M330 110 L480 190 L620 190 L700 150 L620 120 L380 100 Z',
      'garfo': 'M300 100 L320 100 L230 290 L210 290 Z',
      'balanca': 'M600 240 L790 280 L790 300 L600 262 Z',
      'transmissao': 'M560 250 L800 290 L800 306 L560 270 Z',
      'motor-moto': 'M420 190 L600 190 L600 290 L420 290 Z',
      'rodas-moto': '<circle cx="210" cy="290" r="90"/><circle cx="790" cy="290" r="90"/>',
      'numero-quadro': '<circle cx="320" cy="110" r="20"/>',
    },
  },
  chassi: {
    vb: '0 0 1000 400',
    base: `<rect x="40" y="70" width="920" height="260" rx="30" class="b"/><text x="60" y="55" class="t">FRENTE ◀</text>`,
    zonas: {
      'longarina-chassi': 'M60 130 L940 130 L940 150 L60 150 Z M60 250 L940 250 L940 270 L60 270 Z',
      'travessa': 'M120 150 L140 150 L140 250 L120 250 Z M380 150 L400 150 L400 250 L380 250 Z M620 150 L640 150 L640 250 L620 250 Z M880 150 L900 150 L900 250 L880 250 Z',
      'suportes': '<rect x="250" y="110" width="30" height="20"/><rect x="250" y="270" width="30" height="20"/><rect x="520" y="110" width="30" height="20"/><rect x="520" y="270" width="30" height="20"/><rect x="760" y="110" width="30" height="20"/><rect x="760" y="270" width="30" height="20"/>',
      'cacamba': 'M580 85 L945 85 L945 315 L580 315 Z',
      'feixe-mola': 'M700 118 L860 118 L860 128 L700 128 Z M700 272 L860 272 L860 282 L700 282 Z',
    },
  },
};

function zonaSvg(conteudo, cls) {
  if (conteudo.trim().startsWith('<')) return `<g class="${cls}">${conteudo}</g>`;
  const linha = !/Z/i.test(conteudo);
  return `<path class="${cls}${linha ? ' lin' : ''}" d="${conteudo}"/>`;
}

export function mapaLocal(vista, zonas = [], { cor = '#F2A900' } = {}) {
  const v = VISTAS[vista];
  if (!v) throw new Error('vista desconhecida: ' + vista);
  const outras = Object.entries(v.zonas).filter(([z]) => !zonas.includes(z)).map(([, c]) => zonaSvg(c, 'z')).join('');
  const ativas = zonas.filter(z => v.zonas[z]).map(z => zonaSvg(v.zonas[z], 'za')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.vb}" class="mapa">
  <style>
    svg.mapa .b{fill:#F3F5F7;stroke:#9AA3AE;stroke-width:3}
    svg.mapa .b2{fill:#E3E8ED;stroke:#9AA3AE;stroke-width:2}
    svg.mapa .l{fill:none;stroke:#B6BEC7;stroke-width:3}
    svg.mapa .r{fill:#D5DAE0;stroke:#9AA3AE;stroke-width:2}
    svg.mapa .t{font:700 20px 'JetBrains Mono',monospace;fill:#7A8591;letter-spacing:2px}
    svg.mapa .z,svg.mapa .z *{fill:rgba(122,133,145,.10);stroke:#B6BEC7;stroke-width:1.5;stroke-dasharray:5 4}
    svg.mapa .za,svg.mapa .za *{fill:${cor};fill-opacity:.85;stroke:#0F1318;stroke-width:3}
    svg.mapa .z.lin{fill:none;stroke-width:6}
    svg.mapa .za.lin{fill:none;stroke:${cor};stroke-width:14;stroke-linecap:round;stroke-dasharray:none}
  </style>
  ${v.base}${outras}${ativas}
</svg>`;
}

export const ZONAS_VALIDAS = Object.fromEntries(Object.entries(VISTAS).map(([k, v]) => [k, Object.keys(v.zonas)]));
