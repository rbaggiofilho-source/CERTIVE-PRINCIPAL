// Artes vetoriais próprias do Protocolo Cautelar (sem marcas, sem placas).

// Perfil lateral técnico de um sedã genérico (viewBox 0 0 1000 400), frente à esquerda.
export const PERFIL = {
  corpo: 'M62 300 C52 290 50 268 56 252 L64 236 C70 226 84 222 104 220 L318 204 C350 200 372 190 392 176 L446 132 C458 122 474 118 492 117 L646 115 C668 115 684 120 700 132 L770 184 C780 191 792 195 806 196 L912 204 C930 206 940 214 944 228 L948 262 C950 282 944 296 930 300 L862 300 A82 82 0 0 0 698 300 L334 300 A82 82 0 0 0 170 300 Z',
  vidros: 'M406 180 L456 138 C464 131 474 128 486 128 L556 127 L556 184 Z M572 127 L642 127 C658 127 670 131 682 140 L740 186 L572 186 Z',
  portas: 'M404 190 L404 292 M566 132 L566 292 M744 196 L752 292',
  soleira: 'M338 286 L694 286',
  linha: 'M92 246 L930 240',
  farol: 'M60 238 L110 230 L112 246 L64 252 Z',
  lanterna: 'M932 214 L946 216 L948 244 L930 244 Z',
  rodas: [[252, 300], [780, 300]],
};

export function carroLateral({ cor = '#F2A900', traco = 2, fundo = 'none', rodaCor = '#2A3440', opacidade = 1, grade = true, cotas = true } = {}) {
  const P = PERFIL;
  const rodas = P.rodas.map(([x, y]) => `
    <circle cx="${x}" cy="${y}" r="64" fill="${rodaCor}" stroke="${cor}" stroke-width="${traco}"/>
    <circle cx="${x}" cy="${y}" r="38" fill="none" stroke="${cor}" stroke-width="${traco * 0.8}" opacity=".7"/>
    <circle cx="${x}" cy="${y}" r="8" fill="${cor}"/>`).join('');
  const g = grade ? Array.from({ length: 21 }, (_, i) => `<line x1="${i * 50}" y1="40" x2="${i * 50}" y2="380" stroke="${cor}" stroke-width=".6" opacity=".12"/>`).join('') +
    Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${40 + i * 50}" x2="1000" y2="${40 + i * 50}" stroke="${cor}" stroke-width=".6" opacity=".12"/>`).join('') : '';
  const c = cotas ? `
    <g stroke="${cor}" stroke-width="1.2" fill="${cor}" font-family="JetBrains Mono, monospace" font-size="15" opacity=".9">
      <line x1="252" y1="388" x2="780" y2="388"/><line x1="252" y1="378" x2="252" y2="396"/><line x1="780" y1="378" x2="780" y2="396"/>
      <text x="470" y="382" stroke="none">EST · IDV · CAR</text>
      <line x1="980" y1="115" x2="980" y2="300" /><line x1="970" y1="115" x2="990" y2="115"/><line x1="970" y1="300" x2="990" y2="300"/>
      <circle cx="610" cy="230" r="10" fill="none"/><line x1="610" y1="230" x2="660" y2="60"/><text x="666" y="58" stroke="none">112 µm</text>
      <circle cx="300" cy="215" r="10" fill="none"/><line x1="300" y1="215" x2="250" y2="70"/><text x="160" y="66" stroke="none">N0 · 104 µm</text>
      <circle cx="840" cy="215" r="10" fill="none"/><line x1="840" y1="215" x2="880" y2="90"/><text x="846" y="86" stroke="none">N2 · 298 µm</text>
    </g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet">
    <rect width="1000" height="400" fill="${fundo}"/>${g}
    <g opacity="${opacidade}" fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linejoin="round">
      <path d="${P.corpo}" fill="rgba(242,169,0,.06)"/>
      <path d="${P.vidros}" fill="rgba(242,169,0,.14)"/>
      <path d="${P.portas}"/><path d="${P.soleira}" opacity=".6"/><path d="${P.linha}" opacity=".45"/>
      <path d="${P.farol}" fill="${cor}" opacity=".8"/><path d="${P.lanterna}" fill="${cor}" opacity=".8"/>
    </g>${rodas}${c}
  </svg>`;
}

// Marca tipográfica do Protocolo (monograma "PC" em escudo hexagonal + nome)
export function marca({ cor = '#F2A900', texto = '#FFFFFF', tamanho = 1 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 80" style="height:${48 * tamanho}px">
    <g transform="translate(4,4)">
      <path d="M36 0 L70 18 L70 54 L36 72 L2 54 L2 18 Z" fill="none" stroke="${cor}" stroke-width="5"/>
      <path d="M22 50 L22 22 L38 22 C46 22 50 27 50 33 C50 39 46 44 38 44 L22 44" fill="none" stroke="${cor}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M40 52 l6 6 l12 -14" fill="none" stroke="${texto}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <text x="92" y="36" font-family="Archivo, sans-serif" font-weight="900" font-size="30" letter-spacing="1.5" fill="${texto}">PROTOCOLO</text>
    <text x="92" y="68" font-family="Archivo, sans-serif" font-weight="800" font-size="24" letter-spacing="7.2" fill="${cor}">CAUTELAR</text>
  </svg>`;
}
