#!/usr/bin/env bash
# Copia para a pasta de publicação apenas os arquivos públicos do site.
# Ao criar uma página ou recurso novo usado pelo site, inclua-o aqui.
set -euo pipefail
DESTINO="${1:-_site}"
rm -rf "$DESTINO"
mkdir -p "$DESTINO"

ARQUIVOS=(
  CNAME .nojekyll manifest.webmanifest
  index.html app.html consulta-laudo.html privacidade.html termos.html curso.html
  app_v8.js supabase-config.js supabase-db.js laudo_pdf_v2.js sw.js
  styles.css site.css
)
PASTAS=(icons assets js/vendor)

for f in "${ARQUIVOS[@]}"; do cp "$f" "$DESTINO/"; done
mkdir -p "$DESTINO/js"
cp js/laudo_certive.js "$DESTINO/js/"
for d in "${PASTAS[@]}"; do mkdir -p "$DESTINO/$(dirname "$d")"; cp -r "$d" "$DESTINO/$d"; done

echo "Publicados: $(find "$DESTINO" -type f | wc -l) arquivos"
