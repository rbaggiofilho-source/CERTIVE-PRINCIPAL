# Especificação — Fichas de Ponto Crítico (JSON)

Cada ficha vira UMA página A4 impressa. Seja denso e preciso, mas respeite os limites de tamanho.

Formato: arquivo JSON com um array de objetos:
```json
{
  "codigo": "PC-EST-01",
  "sistema": "EST",
  "itens": ["EST-01"],                 // ids do sistemas.json que a ficha cobre
  "titulo": "Longarinas dianteiras",     // ≤ 40 caracteres
  "subtitulo": "Ponteiras e corpo da longarina", // ≤ 60
  "vista": "estrutura",                  // uma de: lateral | estrutura | cofre | interior | documento | moto | chassi | pneu
  "zonas": ["longarina-d"],              // ids de zona (lista abaixo) a destacar no desenho de localização
  "capitulo": 6,                         // capítulo do Manual onde o assunto é explicado (lista abaixo)
  "onde_fica": "…",                      // ≤ 280 caracteres
  "por_que_importa": "…",                // ≤ 350 caracteres
  "de_fabrica": ["…"],                   // 3–5 itens, ≤ 120 caracteres cada: como é o ORIGINAL
  "sinais": [ {"sinal": "…", "nivel": "N2"} ], // 4–7 sinais de intervenção/anormalidade, ≤ 130 caracteres cada, com o nível SUGERIDO (N1–N4)
  "como_verificar": ["…"],               // 4–6 passos, ≤ 140 caracteres cada, na ordem de pátio
  "ferramentas": ["Lanterna", "…"],      // 1–4
  "foto": "…",                           // ≤ 160: enquadramento da foto obrigatória
  "armadilhas": ["…"],                   // 2–3 falsos positivos / erros comuns, ≤ 160 cada
  "frase_conforme": "…",                 // ≤ 220: frase-modelo para o laudo quando conforme
  "frase_achado": "…",                   // ≤ 260: frase-modelo quando há achado (linguagem descritiva: "constatado", "indício de", nunca especular causa)
  "limite": "…"                          // ≤ 200: o que a vistoria cautelar NÃO consegue afirmar sobre este ponto
}
```

## Zonas válidas por vista
- lateral: parachoque-d, paralama-d, porta-d, porta-t, lateral-t, parachoque-t, capo, teto, tampa, coluna-a, coluna-b, coluna-c, soleira, roda-d, roda-t, farol, lanterna, vidros, retrovisor
- estrutura (planta inferior/estrutural vista de cima): longarina-d, painel-frontal, torre, caixa-roda-d, corta-fogo, assoalho, tunel, soleira, coluna-b, longarina-t, porta-malas, painel-traseiro, suspensao-d, suspensao-t, teto
- cofre: motor, numero-motor, bateria, radiador, reservatorios, correias, etiqueta-cofre, vin-cofre
- interior: painel, volante, pedais, bancos, cintos, carpete, airbag, trilhos, etiqueta-coluna
- documento: documento, placa, qrcode
- pneu: banda, dot, flanco, roda
- moto: quadro, garfo, balanca, transmissao, motor-moto, rodas-moto, numero-quadro
- chassi: longarina-chassi, travessa, suportes, cacamba, feixe-mola

## Capítulos do Manual
1 A vistoria cautelar e seus limites · 2 O Protocolo em 12 etapas · 3 O critério N0–N4 · 4 Documentação e histórico · 5 Identificação veicular · 6 Estrutura · 7 Carroceria e pintura · 8 Vidros, iluminação, rodas, pneus e suspensão · 9 Mecânica sem desmontar · 10 Eletrônica e OBD2 · 11 Interior, segurança passiva, enchente e incêndio · 12 Motos e utilitários · 13 Fotografia e evidências · 14 O laudo e a redação defensiva · 15 O negócio

## Estilo
- Imperativo curto nos passos ("Abra o capô e…").
- Nível sugerido coerente com o critério: reparo em revestimento = N2; reparo em área de absorção/indício de impacto forte = N3; estrutura de sustentação, enchente, incêndio, divergência de identificação = N4; desgaste natural = N1.
- Frases de laudo descritivas e verificáveis. Evite "batido", "bom estado", "sem problemas". Prefira "constatada repintura", "não foram constatados sinais de reparo nas áreas visíveis sem desmontagem".
- Nada de marcas comerciais de ferramentas.
