# Renderiza páginas de um PDF em PNG (contact sheet ou página individual) para revisão visual.
import sys, pymupdf
pdf, out = sys.argv[1], sys.argv[2]
pages = [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else None
zoom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
d = pymupdf.open(pdf)
if pages and len(pages) == 1:
    d[pages[0]-1].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(out); sys.exit()
sel = pages or list(range(1, d.page_count+1))
cols = 4; w, h = 298, 421
rows = (len(sel)+cols-1)//cols
sheet = pymupdf.open(); pg = sheet.new_page(width=cols*w, height=rows*h)
for i, n in enumerate(sel):
    r = pymupdf.Rect((i%cols)*w, (i//cols)*h, (i%cols+1)*w-4, (i//cols+1)*h-4)
    pg.show_pdf_page(r, d, n-1)
pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(out)
