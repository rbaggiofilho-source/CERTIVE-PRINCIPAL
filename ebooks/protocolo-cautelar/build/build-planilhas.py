#!/usr/bin/env python3
"""Gera as planilhas editaveis (.xlsx) do Protocolo Cautelar.

Uso:
    python3 build/build-planilhas.py            # gera em 03-materiais/planilhas/
    python3 build/build-planilhas.py --out DIR  # gera em outro diretorio

Fonte dos itens: 01-conteudo/dados/sistemas.json (numeracao canonica).
Cores: 02-design/tema.css (carbono #0F1318, ambar #F2A900, niveis N0-N4).

Todas as formulas usam funcoes compativeis com Excel 2010+ e LibreOffice
(IF, COUNTIF, COUNTIFS, SUMIFS, COUNTBLANK, MEDIAN, AVERAGE, INDEX, MATCH,
IFERROR). Nada de LET/LAMBDA/XLOOKUP/FILTER/IFS/MAXIFS.

O modulo tambem expoe build_registro(path, niveis=..., anexos=...) para o
verificador (build/verificar-planilhas.py) gerar cenarios de teste.
"""
import argparse
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName  # noqa: F401 (reservado)
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

BASE = Path(__file__).resolve().parent.parent
DADOS = BASE / "01-conteudo" / "dados" / "sistemas.json"
OUT_DEFAULT = BASE / "03-materiais" / "planilhas"

# ---------------------------------------------------------------- tema
CARBONO = "0F1318"
GRAFITE = "1B222B"
ACO = "2A3440"
AMBAR = "F2A900"
AMBAR_ESCURO = "B87F00"
AMBAR_CLARO = "FFF4D6"
PAPEL2 = "F5F6F8"
LINHA = "DDE1E6"
TEXTO = "1A1F26"
TEXTO2 = "4E5864"
NIVEL_COR = {"N0": "2E9E5B", "N1": "4F7FB0", "N2": "E0A100", "N3": "E0661B",
             "N4": "C62828", "NV": "5A6472", "N/A": "A7B0BA"}
INC = "5A6472"
AZUL_ENTRADA = "0000FF"
ENTRADA_FILL = "EEF3FF"  # fundo levissimo para achar as celulas de entrada

FONT = "Calibri"


def f(size=11, bold=False, color=TEXTO, italic=False):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)


F_IN = Font(name=FONT, size=11, color=AZUL_ENTRADA)
F_IN_B = Font(name=FONT, size=11, color=AZUL_ENTRADA, bold=True)
F_FX = Font(name=FONT, size=11, color="000000")
F_FX_B = Font(name=FONT, size=11, color="000000", bold=True)
FILL = lambda c: PatternFill("solid", start_color=c, end_color=c)  # noqa: E731
THIN = Side(style="thin", color=LINHA)
BORDA = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTRO = Alignment(horizontal="center", vertical="center", wrap_text=True)
ESQ = Alignment(horizontal="left", vertical="center", wrap_text=True)

MOEDA = 'R$ #,##0.00;-R$ #,##0.00;"-"'
PCT = '0.0%;-0.0%;"-"'


# ---------------------------------------------------------------- helpers
def base_font(ws, max_row=None, max_col=None):
    """Garante Calibri em todas as celulas escritas sem fonte explicita."""
    for row in ws.iter_rows(max_row=max_row or ws.max_row, max_col=max_col or ws.max_column):
        for c in row:
            if c.font is None or c.font.name != FONT:
                old = c.font
                c.font = Font(name=FONT, size=old.size or 11, bold=old.bold, italic=old.italic,
                              color=old.color)


def header_row(ws, row, labels, col0=1, height=30):
    for i, lab in enumerate(labels):
        c = ws.cell(row=row, column=col0 + i, value=lab)
        c.font = f(11, True, "FFFFFF")
        c.fill = FILL(CARBONO)
        c.alignment = CENTRO
        c.border = BORDA
    ws.row_dimensions[row].height = height


def widths(ws, mapping):
    for col, w in mapping.items():
        ws.column_dimensions[col].width = w


def entrada(c, value=None, bold=False, fmt=None):
    if value is not None:
        c.value = value
    c.font = F_IN_B if bold else F_IN
    c.fill = FILL(ENTRADA_FILL)
    c.border = BORDA
    if fmt:
        c.number_format = fmt
    return c


def formula(c, value, bold=False, fmt=None, align=None):
    c.value = value
    c.font = F_FX_B if bold else F_FX
    c.border = BORDA
    if fmt:
        c.number_format = fmt
    if align:
        c.alignment = align
    return c


def rotulo(c, value, bold=True, fill=PAPEL2):
    c.value = value
    c.font = f(10, bold, TEXTO2)
    if fill:
        c.fill = FILL(fill)
    c.border = BORDA
    c.alignment = ESQ
    return c


def titulo_aba(ws, texto, ncols, sub=None):
    """Faixa carbono com a marca em ambar + titulo da aba (linhas 1-2)."""
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    c = ws.cell(row=1, column=1, value="PROTOCOLO CAUTELAR  |  " + texto)
    c.font = f(14, True, AMBAR)
    c.fill = FILL(CARBONO)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28
    for col in range(1, ncols + 1):
        ws.cell(row=1, column=col).fill = FILL(CARBONO)
    if sub:
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
        c = ws.cell(row=2, column=1, value=sub)
        c.font = f(9, False, TEXTO2, italic=True)
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True, indent=1)
        ws.row_dimensions[2].height = 30


def area_logo(ws, cell_range, texto="[ SUA LOGO / SEU NOME AQUI ]"):
    ws.merge_cells(cell_range)
    first = cell_range.split(":")[0]
    c = ws[first]
    c.value = texto
    c.font = Font(name=FONT, size=11, bold=True, color=AZUL_ENTRADA)
    c.fill = FILL(AMBAR_CLARO)
    c.alignment = CENTRO
    c.comment = Comment("Substitua pelo seu nome/empresa ou apague o texto e use "
                        "Inserir > Imagem para colocar sua logo sobre esta área.", "Protocolo Cautelar")
    tl, br = cell_range.split(":")
    for row in ws[tl:br]:
        for cc in row:
            cc.border = Border(left=Side("dashed", color=AMBAR_ESCURO), right=Side("dashed", color=AMBAR_ESCURO),
                               top=Side("dashed", color=AMBAR_ESCURO), bottom=Side("dashed", color=AMBAR_ESCURO))


def impressao(ws, paisagem=False, area=None, titulos=None):
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "landscape" if paisagem else "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.print_options.horizontalCentered = True
    ws.oddFooter.left.text = "Protocolo Cautelar"
    ws.oddFooter.left.size = 8
    ws.oddFooter.right.text = "Página &P de &N"
    ws.oddFooter.right.size = 8
    if area:
        ws.print_area = area
    if titulos:
        ws.print_title_rows = titulos


def capa(wb, titulo, instrucoes, extra=None):
    ws = wb.active
    ws.title = "Capa"
    ws.sheet_view.showGridLines = False
    widths(ws, {"A": 3, "B": 22, "C": 22, "D": 22, "E": 22, "F": 3})
    for r in range(1, 40):
        for col in range(1, 7):
            ws.cell(row=r, column=col).fill = FILL("FFFFFF")
    # faixa carbono
    for r in range(1, 8):
        for col in range(1, 7):
            ws.cell(row=r, column=col).fill = FILL(CARBONO)
    ws.merge_cells("B2:E2")
    c = ws["B2"]
    c.value = "PROTOCOLO CAUTELAR"
    c.font = f(24, True, AMBAR)
    c.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[2].height = 36
    ws.merge_cells("B3:E3")
    c = ws["B3"]
    c.value = "O sistema do vistoriador cautelar"
    c.font = f(10, False, "C9CED6", italic=True)
    ws.merge_cells("B5:E6")
    c = ws["B5"]
    c.value = titulo
    c.font = f(18, True, "FFFFFF")
    c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    ws.row_dimensions[5].height = 26
    ws.row_dimensions[6].height = 26
    # faixa ambar fina
    for col in range(1, 7):
        ws.cell(row=8, column=col).fill = FILL(AMBAR)
    ws.row_dimensions[8].height = 5

    area_logo(ws, "B10:E12")
    for r in (10, 11, 12):
        ws.row_dimensions[r].height = 20

    r = 14
    ws.cell(row=r, column=2, value="COMO USAR").font = f(12, True, AMBAR_ESCURO)
    r += 1
    for i, linha in enumerate(instrucoes, 1):
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
        c = ws.cell(row=r, column=2, value=f"{i}. {linha}")
        c.font = f(11)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 32 if len(linha) > 85 else 18
        if len(linha) > 170:
            ws.row_dimensions[r].height = 46
        r += 1

    r += 1
    ws.cell(row=r, column=2, value="LEGENDA DE CORES").font = f(12, True, AMBAR_ESCURO)
    r += 1
    c = ws.cell(row=r, column=2, value="1234,00")
    entrada(c)
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
    ws.cell(row=r, column=3, value="Texto AZUL (fundo azul-claro) = ENTRADA: você digita ou escolhe na lista.").font = f(11)
    r += 1
    c = ws.cell(row=r, column=2, value="=2*617")
    formula(c, "=2*617", fmt="#,##0.00")
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
    ws.cell(row=r, column=3, value="Texto PRETO = FÓRMULA: calculado automaticamente. Não digite por cima.").font = f(11)
    r += 1
    c = ws.cell(row=r, column=2, value="Cabeçalho")
    c.font = f(11, True, "FFFFFF")
    c.fill = FILL(CARBONO)
    c.border = BORDA
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
    ws.cell(row=r, column=3, value="Faixa escura = títulos de colunas (não editar).").font = f(11)
    r += 1
    if extra:
        r += 1
        for linha in extra:
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
            c = ws.cell(row=r, column=2, value=linha)
            c.font = f(9, False, TEXTO2, italic=True)
            c.alignment = Alignment(wrap_text=True, vertical="top")
            ws.row_dimensions[r].height = 30 if len(linha) > 95 else 15
            if len(linha) > 190:
                ws.row_dimensions[r].height = 44
            r += 1
    r += 1
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
    c = ws.cell(row=r, column=2, value="Os valores de exemplo são fictícios. Placas de exemplo: ABC1D23 / XXX0X00. "
                                       "Material de apoio: não substitui norma, perícia oficial nem vistoria de transferência.")
    c.font = f(8, False, "7A8591", italic=True)
    c.alignment = Alignment(wrap_text=True)
    ws.row_dimensions[r].height = 24
    impressao(ws, paisagem=False, area=f"A1:F{r + 1}")
    return ws


def nota(ws, cell_range, texto, cor=AMBAR_CLARO, altura=None):
    ws.merge_cells(cell_range)
    first = cell_range.split(":")[0]
    c = ws[first]
    c.value = texto
    c.font = f(9, False, TEXTO, italic=True)
    c.fill = FILL(cor)
    c.alignment = Alignment(wrap_text=True, vertical="center", indent=1)
    if altura:
        ws.row_dimensions[ws[first].row].height = altura


def dv_lista(ws, itens_ou_ref, rng, prompt=None, allow_blank=True):
    if isinstance(itens_ou_ref, (list, tuple)):
        form = '"' + ",".join(itens_ou_ref) + '"'
    else:
        form = itens_ou_ref
    dv = DataValidation(type="list", formula1=form, allow_blank=allow_blank, showDropDown=False)
    dv.error = "Escolha um valor da lista."
    dv.errorTitle = "Valor inválido"
    if prompt:
        dv.prompt = prompt
        dv.showInputMessage = True
    dv.showErrorMessage = True
    ws.add_data_validation(dv)
    dv.add(rng)
    return dv


def carregar():
    return json.loads(DADOS.read_text(encoding="utf-8"))


# ================================================================ 1. REGISTRO
NIVEIS_BASE = ["N0", "N1", "N2", "N3", "N4", "N/A"]
NIVEIS_IDV = NIVEIS_BASE + ["NV"]
REG_COLS = ["Sistema", "Item", "Descrição do item", "O que verificar", "Nível",
            "Observação / constatação", "Foto nº", "Foto obrigatória?"]
REG_HDR_ROW = 14  # linha do cabecalho da tabela na aba Vistoria


def _tabela_itens(ws, itens, row0, idv_rows_out=None, niveis=None):
    """Escreve os itens a partir de row0. Retorna ultima linha."""
    r = row0
    zebra = False
    sist_anterior = None
    for sist, it in itens:
        if sist != sist_anterior:
            zebra = not zebra
            sist_anterior = sist
        vals = [sist, it["id"], it["item"], it.get("verificar", ""), None, None, None,
                "SIM" if it.get("foto") else "—"]
        for j, v in enumerate(vals, 1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = f(10, j == 2)
            c.border = BORDA
            c.alignment = WRAP if j in (3, 4, 6) else Alignment(vertical="top", horizontal="center" if j in (1, 2, 5, 7, 8) else "left")
            if zebra and j not in (5, 6, 7):
                c.fill = FILL(PAPEL2)
        if it.get("critico"):
            ws.cell(row=r, column=2).font = f(10, True, "C62828")
            ws.cell(row=r, column=2).comment = None
        for j in (5, 6, 7):
            entrada(ws.cell(row=r, column=j))
            ws.cell(row=r, column=j).font = Font(name=FONT, size=10, color=AZUL_ENTRADA, bold=(j == 5))
            ws.cell(row=r, column=j).alignment = Alignment(vertical="top", horizontal="center" if j != 6 else "left", wrap_text=True)
        if niveis and it["id"] in niveis:
            ws.cell(row=r, column=5, value=niveis[it["id"]])
        if idv_rows_out is not None and sist == "IDV":
            idv_rows_out.append(r)
        # altura aproximada
        n = max(len(it["item"]) / 38, len(it.get("verificar", "")) / 48, 1)
        ws.row_dimensions[r].height = max(15, 13.5 * int(n + 0.99))
        r += 1
    return r - 1


def _cf_niveis(ws, rng):
    for nv, cor in NIVEL_COR.items():
        branco = nv in ("N0", "N1", "N3", "N4", "NV")
        ws.conditional_formatting.add(
            rng, CellIsRule(operator="equal", formula=[f'"{nv}"'], fill=FILL(cor),
                            font=Font(name=FONT, bold=True, color="FFFFFF" if branco else TEXTO)))


def build_registro(path, sistemas=None, niveis=None, anexos=None):
    """niveis: dict item_id -> nivel (para cenarios de teste / exemplo).
    anexos: dict {'MOTO': 'SIM'|'NÃO', 'UTL': ...}."""
    d = sistemas or carregar()
    niveis = niveis or {}
    anexos = anexos or {"MOTO": "NÃO", "UTL": "NÃO"}
    wb = Workbook()
    capa(wb, "Registro de Apontamentos", [
        "Preencha o cabeçalho da aba Vistoria (veículo, cliente, vistoriador) e indique se os anexos MOTO/UTL se aplicam.",
        "Para cada item, escolha o Nível na lista (N0 a N4, N/A = não se aplica; NV = não verificável, só em Identificação veicular).",
        "Anote a constatação e o número da foto. Itens com código em vermelho são críticos; 'Foto obrigatória? SIM' exige registro fotográfico.",
        "A aba Resumo conta os níveis por sistema e mostra a classificação final pela Matriz do Protocolo. Itens em branco geram 'INCOMPLETO'.",
        "A aba Critério explica cada nível e a matriz. A classificação vale para o exame visual e não destrutivo no momento da vistoria.",
    ], extra=[
        "Matriz: NV em Identificação veicular → INCONCLUSIVO; qualquer N4 → REPROVADO; qualquer N2/N3 → APROVADO COM APONTAMENTOS; só N0/N1 → APROVADO.",
        "\"Aprovado\" classifica o resultado do exame técnico visual naquele momento; não aprova a compra, não garante o veículo e não substitui a vistoria oficial.",
    ])

    # ------------------------------------------------ Vistoria
    ws = wb.create_sheet("Vistoria")
    ws.sheet_view.showGridLines = False
    widths(ws, {"A": 12, "B": 9, "C": 40, "D": 46, "E": 9, "F": 38, "G": 12, "H": 13})
    titulo_aba(ws, "REGISTRO DE APONTAMENTOS", 8)
    area_logo(ws, "D2:F3")
    ws.merge_cells("A2:C3")
    ws["A2"].value = "Preencha as células azuis. Nível: escolha na lista. NV só é aceito nos itens IDV."
    ws["A2"].font = f(9, False, TEXTO2, italic=True)
    ws["A2"].alignment = ESQ
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 18

    campos = [
        # (linha, col_rotulo, rotulo, exemplo_esq, rotulo_dir, exemplo_dir)
        (5, "Laudo nº", "2026-0001", "Data / hora", None),
        (6, "Cliente", "Cliente Exemplo", "Telefone / e-mail", "(00) 00000-0000"),
        (7, "Vistoriador", "Seu nome", "Registro / contato", None),
        (8, "Local", "Endereço da vistoria", "Solicitante", "Comprador"),
        (9, "Marca/modelo", "Marca Modelo 1.0", "Ano fab./mod.", "2020/2021"),
        (10, "Placa", "ABC1D23", "Cor / combustível", "Prata / Flex"),
        (11, "Chassi (VIN)", "XXXXXXXXXXXXXXXXX", "Km hodômetro", 45000),
        (12, "Nº motor", None, "RENAVAM", None),
    ]
    for (r, l1, v1, l2, v2) in campos:
        rotulo(ws.cell(row=r, column=1), l1)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        entrada(ws.cell(row=r, column=2), v1).alignment = ESQ
        c = rotulo(ws.cell(row=r, column=4), l2)
        c.alignment = Alignment(horizontal="right", vertical="center")
        ws.merge_cells(start_row=r, start_column=5, end_row=r, end_column=6)
        entrada(ws.cell(row=r, column=5), v2).alignment = ESQ
        ws.row_dimensions[r].height = 18
    ws["E11"].number_format = "#,##0"
    # anexos aplicaveis
    rotulo(ws["G5"], "MOTO aplicável?")
    rotulo(ws["G6"], "UTL aplicável?")
    for cell, key in (("H5", "MOTO"), ("H6", "UTL")):
        entrada(ws[cell], anexos.get(key, "NÃO"), bold=True).alignment = CENTRO
    dv_lista(ws, ["SIM", "NÃO"], "H5:H6", "SIM inclui os itens do anexo na contagem e na classificação.", allow_blank=False)
    ws.merge_cells("G7:H7")
    rotulo(ws["G7"], "Classificação atual")
    ws.merge_cells("G8:H10")
    formula(ws["G8"], "=Resumo!$B$6", bold=True, align=CENTRO)
    ws["G8"].fill = FILL(AMBAR_CLARO)
    leg = ["N0", "N1", "N2", "N3", "N4", "NV"]
    pos = [("G11", "N0 Conforme"), ("H11", "N1 Observação"), ("G12", "N2 Apontam."),
           ("H12", "N3 Relevante"), ("G13", "N4 Crítico"), ("H13", "NV Não verif.")]
    for (cell, txt), nv in zip(pos, leg):
        c = ws[cell]
        c.value = txt
        c.fill = FILL(NIVEL_COR[nv])
        c.font = f(9, True, "FFFFFF" if nv != "N2" else TEXTO)
        c.alignment = CENTRO
    ws.merge_cells("A13:F13")
    ws["A13"].value = ("N/A = não se aplica (conta como preenchido).  NV = não verificável — somente em Identificação "
                       "veicular; leva a INCONCLUSIVO.  Código em vermelho = item crítico.")
    ws["A13"].font = f(9, False, TEXTO2, italic=True)
    ws["A13"].alignment = ESQ

    header_row(ws, REG_HDR_ROW, REG_COLS)
    itens = [(s["id"], it) for s in d["sistemas"] for it in s["itens"]]
    idv_rows = []
    first = REG_HDR_ROW + 1
    last = _tabela_itens(ws, itens, first, idv_rows, niveis)
    rng_niv = f"E{first}:E{last}"
    # validacao: IDV aceita NV; demais nao
    idv_set = set(idv_rows)
    nao_idv = [r for r in range(first, last + 1) if r not in idv_set]
    dv1 = DataValidation(type="list", formula1='"' + ",".join(NIVEIS_BASE) + '"', allow_blank=True)
    dv1.error, dv1.errorTitle, dv1.showErrorMessage = "Use N0, N1, N2, N3, N4 ou N/A. (NV só em Identificação veicular.)", "Nível inválido", True
    dv1.prompt, dv1.showInputMessage = "N0 Conforme · N1 Observação · N2 Apontamento · N3 Relevante · N4 Crítico · N/A", True
    ws.add_data_validation(dv1)
    dv1.add(f"E{first}:E{min(idv_rows) - 1}")
    dv1.add(f"E{max(idv_rows) + 1}:E{last}")
    dv2 = DataValidation(type="list", formula1='"' + ",".join(NIVEIS_IDV) + '"', allow_blank=True)
    dv2.error, dv2.errorTitle, dv2.showErrorMessage = "Use N0–N4, N/A ou NV (não verificável).", "Nível inválido", True
    dv2.prompt, dv2.showInputMessage = "NV = não verificável → classificação INCONCLUSIVO", True
    ws.add_data_validation(dv2)
    dv2.add(f"E{min(idv_rows)}:E{max(idv_rows)}")
    _cf_niveis(ws, rng_niv)
    ws.freeze_panes = f"C{first}"
    ws.auto_filter.ref = f"A{REG_HDR_ROW}:H{last}"
    impressao(ws, paisagem=True, area=f"A1:H{last}", titulos=f"{REG_HDR_ROW}:{REG_HDR_ROW}")

    # ------------------------------------------------ Anexos
    anexo_rng = {}
    for ax in d["anexos"]:
        wa = wb.create_sheet(f"Anexo {ax['id']}")
        wa.sheet_view.showGridLines = False
        widths(wa, {"A": 9, "B": 10, "C": 40, "D": 46, "E": 8, "F": 38, "G": 8, "H": 10})
        titulo_aba(wa, f"ANEXO {ax['id']} — {ax['nome'].upper()}", 8,
                   sub=f"{ax.get('objetivo', '')}  Só entra na contagem se '{ax['id']} aplicável?' = SIM na aba Vistoria.")
        rotulo(wa["A3"], "Aplicável?")
        cel_ap = "H5" if ax["id"] == "MOTO" else "H6"
        formula(wa["B3"], f"=Vistoria!${cel_ap[0]}${cel_ap[1:]}", bold=True, align=CENTRO)
        header_row(wa, 5, REG_COLS)
        last_a = _tabela_itens(wa, [(ax["id"], it) for it in ax["itens"]], 6, None, niveis)
        dv = DataValidation(type="list", formula1='"' + ",".join(NIVEIS_BASE) + '"', allow_blank=True)
        dv.error, dv.showErrorMessage = "Use N0, N1, N2, N3, N4 ou N/A.", True
        wa.add_data_validation(dv)
        dv.add(f"E6:E{last_a}")
        _cf_niveis(wa, f"E6:E{last_a}")
        wa.freeze_panes = "C6"
        impressao(wa, paisagem=True, area=f"A1:H{last_a}", titulos="5:5")
        anexo_rng[ax["id"]] = (f"'Anexo {ax['id']}'!$E$6:$E${last_a}", cel_ap)

    # ------------------------------------------------ Resumo
    wr = wb.create_sheet("Resumo", 1 + 1)  # depois de Vistoria
    wr.sheet_view.showGridLines = False
    widths(wr, {"A": 34, "B": 9, "C": 9, "D": 9, "E": 9, "F": 9, "G": 9, "H": 9, "I": 11, "J": 9, "K": 16})
    titulo_aba(wr, "RESUMO E CLASSIFICAÇÃO", 11)
    V_SIS = f"Vistoria!$A${first}:$A${last}"
    V_NIV = f"Vistoria!$E${first}:$E${last}"

    # contagens totais (linhas 12..) calculadas primeiro para referencia
    # bloco classificacao
    rotulo(wr["A4"], "Placa / Laudo nº")
    formula(wr["B4"], '=Vistoria!$B$10&"  ·  Laudo "&Vistoria!$B$5', align=ESQ)
    wr.merge_cells("B4:K4")
    rotulo(wr["A6"], "CLASSIFICAÇÃO FINAL")
    wr["A6"].font = f(12, True, TEXTO)
    wr.row_dimensions[6].height = 36
    wr.merge_cells("B6:K6")

    # tabela por sistema
    hr = 9
    header_row(wr, hr, ["Sistema", "N0", "N1", "N2", "N3", "N4", "N/A", "NV", "Em branco", "Total", "Situação"])
    for j, nv in enumerate(["N0", "N1", "N2", "N3", "N4", "N/A", "NV"], 2):
        wr.cell(row=hr, column=j).fill = FILL(NIVEL_COR[nv])
        wr.cell(row=hr, column=j).font = f(11, True, TEXTO if nv in ("N2", "N/A") else "FFFFFF")
    r = hr + 1
    sist_rows = []
    for s in d["sistemas"]:
        c = wr.cell(row=r, column=1, value=f"{s['n']:02d} {s['id']} — {s['nome']}")
        c.font = f(10)
        c.border = BORDA
        for j, nv in enumerate(["N0", "N1", "N2", "N3", "N4", "N/A", "NV"], 2):
            formula(wr.cell(row=r, column=j), f'=COUNTIFS({V_SIS},"{s["id"]}",{V_NIV},"{nv}")', fmt='0;-0;"·"',
                    align=CENTRO)
        formula(wr.cell(row=r, column=9), f'=COUNTIFS({V_SIS},"{s["id"]}",{V_NIV},"")', fmt='0;-0;"·"', align=CENTRO)
        formula(wr.cell(row=r, column=10), f'=COUNTIF({V_SIS},"{s["id"]}")', align=CENTRO)
        formula(wr.cell(row=r, column=11),
                f'=IF(I{r}>0,"Incompleto",IF(F{r}+H{r}>0,"CRÍTICO / NV",IF(E{r}>0,"Atenção (N3)",IF(D{r}>0,"Apontamento","OK"))))',
                align=CENTRO)
        sist_rows.append(r)
        r += 1
    for ax in d["anexos"]:
        rng, cel_ap = anexo_rng[ax["id"]]
        ap = f"Vistoria!${cel_ap[0]}${cel_ap[1:]}"
        c = wr.cell(row=r, column=1, value=f"Anexo {ax['id']} — {ax['nome']}")
        c.font = f(10, False, TEXTO2)
        c.border = BORDA
        for j, nv in enumerate(["N0", "N1", "N2", "N3", "N4", "N/A", "NV"], 2):
            formula(wr.cell(row=r, column=j), f'=IF({ap}="SIM",COUNTIF({rng},"{nv}"),0)', fmt='0;-0;"·"', align=CENTRO)
        formula(wr.cell(row=r, column=9), f'=IF({ap}="SIM",COUNTBLANK({rng}),0)', fmt='0;-0;"·"', align=CENTRO)
        formula(wr.cell(row=r, column=10), f'=IF({ap}="SIM",ROWS({rng}),0)', align=CENTRO)
        formula(wr.cell(row=r, column=11),
                f'=IF({ap}<>"SIM","Não aplicável",IF(I{r}>0,"Incompleto",IF(F{r}>0,"CRÍTICO",IF(E{r}>0,"Atenção (N3)",IF(D{r}>0,"Apontamento","OK")))))',
                align=CENTRO)
        sist_rows.append(r)
        r += 1
    tot = r
    c = wr.cell(row=tot, column=1, value="TOTAL")
    c.font = f(11, True, "FFFFFF")
    c.fill = FILL(CARBONO)
    for j in range(2, 11):
        L = get_column_letter(j)
        formula(wr.cell(row=tot, column=j), f"=SUM({L}{hr + 1}:{L}{tot - 1})", bold=True, align=CENTRO)
        wr.cell(row=tot, column=j).fill = FILL(AMBAR_CLARO)
    wr.cell(row=tot, column=11).fill = FILL(AMBAR_CLARO)
    wr.cell(row=tot, column=11).border = BORDA
    _cf_status = [("CRÍTICO", "C62828", "FFFFFF"), ("Atenção", "E0661B", "FFFFFF"),
                  ("Apontamento", "E0A100", TEXTO), ("OK", "2E9E5B", "FFFFFF"), ("Incompleto", "DDE1E6", TEXTO)]
    for txt, cor, fc in _cf_status:
        wr.conditional_formatting.add(
            f"K{hr + 1}:K{tot - 1}",
            FormulaRule(formula=[f'LEFT(K{hr + 1},{len(txt)})="{txt}"'], fill=FILL(cor), font=Font(name=FONT, bold=True, color=fc)))

    # indicadores (a partir de tot+2)
    ir = tot + 2
    header_row(wr, ir, ["Indicador", "Valor"], height=22)
    wr.merge_cells(start_row=ir, start_column=2, end_row=ir, end_column=3)
    NV_IDV = f'COUNTIFS({V_SIS},"IDV",{V_NIV},"NV")'
    indic = [
        ("Itens em branco (a preencher)", f"=I{tot}", "BRANCOS"),
        ("NV em Identificação veicular (IDV)", f"={NV_IDV}", "NV"),
        ("Achados N4 (Crítico)", f"=F{tot}", "N4"),
        ("Achados N3 (Apontamento relevante — ATENÇÃO)", f"=E{tot}", "N3"),
        ("Achados N2 (Apontamento)", f"=D{tot}", "N2"),
        ("Achados N1 (Observação)", f"=C{tot}", "N1"),
        ("Itens verificados (N0–N4)", f"=SUM(B{tot}:F{tot})", "VER"),
    ]
    refs = {}
    for k, (lab, fx, key) in enumerate(indic, 1):
        rr = ir + k
        rotulo(wr.cell(row=rr, column=1), lab, bold=False, fill=None)
        wr.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=3)
        formula(wr.cell(row=rr, column=2), fx, bold=True, align=CENTRO)
        refs[key] = f"$B${rr}"
    # formula final
    B, NV, N4, N3, N2 = refs["BRANCOS"], refs["NV"], refs["N4"], refs["N3"], refs["N2"]
    classif = (f'=IF({B}>0,"INCOMPLETO – faltam "&{B}&IF({B}=1," item"," itens"),'
               f'IF({NV}>0,"INCONCLUSIVO",IF({N4}>0,"REPROVADO",'
               f'IF({N2}+{N3}>0,"APROVADO COM APONTAMENTOS","APROVADO"))))')
    formula(wr["B6"], classif, bold=True, align=CENTRO)
    wr["B6"].font = f(16, True, "FFFFFF")
    wr["B6"].fill = FILL(ACO)
    for txt, cor, fc in [("INCONCLUSIVO", INC, "FFFFFF"), ("REPROVADO", "C62828", "FFFFFF"),
                         ("APROVADO COM", "E0A100", TEXTO), ("INCOMPLETO", "DDE1E6", TEXTO)]:
        wr.conditional_formatting.add("B6:K6", FormulaRule(formula=[f'LEFT($B$6,{len(txt)})="{txt}"'],
                                                         fill=FILL(cor), font=Font(name=FONT, bold=True, color=fc, size=16)))
    wr.conditional_formatting.add("B6:K6", FormulaRule(formula=['$B$6="APROVADO"'], fill=FILL("2E9E5B"),
                                                     font=Font(name=FONT, bold=True, color="FFFFFF", size=16)))
    # destaque N3
    wr.merge_cells("A7:K7")
    formula(wr["A7"], f'=IF(AND(LEFT($B$6,10)<>"INCOMPLETO",{N3}>0),"ATENÇÃO: "&{N3}&" achado(s) N3 — destacar no laudo.","")',
            align=ESQ)
    wr["A7"].font = f(10, True, "E0661B")
    wr["A7"].border = Border()

    nr = ir + len(indic) + 2
    nota(wr, f"A{nr}:K{nr + 1}",
         "Ordem da matriz: 1) itens em branco → INCOMPLETO; 2) NV em Identificação veicular → INCONCLUSIVO (o laudo não conclui "
         "e descreve o motivo); 3) algum N4 → REPROVADO; 4) algum N2/N3 → APROVADO COM APONTAMENTOS; 5) só N0/N1/N/A → APROVADO. "
         "A classificação refere-se ao exame técnico visual e não destrutivo no momento da vistoria; não garante o veículo.",
         altura=None)
    wr.row_dimensions[nr].height = 30
    wr.row_dimensions[nr + 1].height = 30
    wr.freeze_panes = "B10"
    impressao(wr, paisagem=False, area=f"A1:K{nr + 1}")

    # ------------------------------------------------ Criterio
    wc = wb.create_sheet("Critério")
    wc.sheet_view.showGridLines = False
    widths(wc, {"A": 8, "B": 24, "C": 55, "D": 50})
    titulo_aba(wc, "CRITÉRIO N0–N4 E MATRIZ DE CLASSIFICAÇÃO", 4)
    header_row(wc, 4, ["Nível", "Nome", "Definição", "Exemplos"])
    exemplos = {
        "N0": "—",
        "N1": "Riscos superficiais; pneu com ~50% de vida; pastilha a meia vida.",
        "N2": "Porta repintada; paralama substituído; vazamento leve.",
        "N3": "Painel frontal (quadro do radiador) substituído; ponteira de longarina reparada; pneu abaixo do TWI; luz de airbag acesa.",
        "N4": "Reparo em corpo de longarina, torre, coluna, soleira, assoalho ou painel corta-fogo; lodo em áreas ocultas; numeração divergente.",
    }
    r = 5
    for nv in d["niveis"]:
        vals = [nv["id"], nv["nome"], nv["definicao"], exemplos.get(nv["id"], "")]
        for j, v in enumerate(vals, 1):
            c = wc.cell(row=r, column=j, value=v)
            c.font = f(10, j <= 2)
            c.alignment = WRAP
            c.border = BORDA
        c = wc.cell(row=r, column=1)
        c.fill = FILL(NIVEL_COR[nv["id"]])
        c.font = f(11, True, TEXTO if nv["id"] == "N2" else "FFFFFF")
        c.alignment = CENTRO
        wc.row_dimensions[r].height = 42
        r += 1
    for cod, nome, desc in [("N/A", "Não se aplica", "O item não existe neste veículo (ex.: teto solar ausente). Conta como preenchido e não afeta a classificação."),
                            ("NV", "Não verificável", "Somente em Identificação veicular (IDV): o elemento não pôde ser localizado/conferido. Qualquer NV → INCONCLUSIVO. Registre o motivo e oriente conferência por perícia oficial/autoridade.")]:
        vals = [cod, nome, desc, ""]
        for j, v in enumerate(vals, 1):
            c = wc.cell(row=r, column=j, value=v)
            c.font = f(10, j <= 2)
            c.alignment = WRAP
            c.border = BORDA
        wc.cell(row=r, column=1).fill = FILL(NIVEL_COR[cod])
        wc.cell(row=r, column=1).font = f(11, True, "FFFFFF")
        wc.cell(row=r, column=1).alignment = CENTRO
        wc.row_dimensions[r].height = 42
        r += 1
    r += 1
    header_row(wc, r, ["Ordem", "Classificação", "Regra", "Observação"])
    r += 1
    obs = {"INCONCLUSIVO": "O laudo não conclui; descreve o que não pôde ser verificado e por quê.",
           "REPROVADO": "Descrever o achado N4 com foto; divergência de identificação: registrar e orientar perícia.",
           "APROVADO COM APONTAMENTOS": "N3 aparece em destaque \"Atenção\".",
           "APROVADO": "Vale para o exame visual naquele momento; não garante o veículo."}
    for k, cl in enumerate(d["classificacao"], 1):
        vals = [k, cl["id"], cl["regra"], obs.get(cl["id"], "")]
        for j, v in enumerate(vals, 1):
            c = wc.cell(row=r, column=j, value=v)
            c.font = f(10, j == 2)
            c.alignment = WRAP if j > 1 else CENTRO
            c.border = BORDA
        wc.cell(row=r, column=2).fill = FILL(cl["cor"].lstrip("#"))
        wc.cell(row=r, column=2).font = f(10, True, TEXTO if cl["id"].startswith("APROVADO COM") else "FFFFFF")
        wc.row_dimensions[r].height = 32
        r += 1
    r += 1
    nota(wc, f"A{r}:D{r}", "Nesta planilha, antes da matriz, qualquer item em branco resulta em \"INCOMPLETO – faltam X itens\": "
                           "preencha todos (use N/A quando o item não existir). Você pode publicar a sua própria matriz; "
                           "mantenha a mesma no laudo, na planilha e no contrato.", altura=44)
    impressao(wc, paisagem=False, area=f"A1:D{r}")

    for w in wb.worksheets:
        w.sheet_properties.tabColor = AMBAR if w.title in ("Capa",) else CARBONO
    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    wb.save(path)
    return {"first": first, "last": last, "idv_rows": idv_rows}


# ================================================================ 2. PINTURA
PECAS = [
    ("Capô", "Aço"), ("Teto", "Aço"), ("Tampa traseira / porta-malas", "Aço"),
    ("Paralama dianteiro esquerdo", "Aço"), ("Paralama dianteiro direito", "Aço"),
    ("Porta dianteira esquerda", "Aço"), ("Porta traseira esquerda", "Aço"),
    ("Porta dianteira direita", "Aço"), ("Porta traseira direita", "Aço"),
    ("Lateral traseira esquerda", "Aço"), ("Lateral traseira direita", "Aço"),
    ("Coluna A esquerda", "Aço"), ("Coluna A direita", "Aço"),
    ("Coluna B esquerda", "Aço"), ("Coluna B direita", "Aço"),
    ("Soleira esquerda", "Aço"), ("Soleira direita", "Aço"),
    ("Para-choque dianteiro", "Plástico"), ("Para-choque traseiro", "Plástico"),
]
# leituras ficticias (micrometros): maioria ~110, porta tras. dir. repintada, lateral com massa
EXEMPLO_LEIT = {
    "Capô": [108, 112, 110, 115, 109], "Teto": [104, 106, 101, 108, 103],
    "Tampa traseira / porta-malas": [112, 109, 114, 110, 111],
    "Paralama dianteiro esquerdo": [118, 115, 120, 117, 116], "Paralama dianteiro direito": [113, 111, 116, 112, 114],
    "Porta dianteira esquerda": [110, 107, 112, 109, 111], "Porta traseira esquerda": [106, 108, 110, 107, 105],
    "Porta dianteira direita": [115, 112, 110, 114, 113], "Porta traseira direita": [185, 192, 178, 188, 181],
    "Lateral traseira esquerda": [109, 111, 108, 112, 110], "Lateral traseira direita": [320, 410, 290, 360, 385],
    "Coluna A esquerda": [105, 103, 108, None, None], "Coluna A direita": [107, 104, 106, None, None],
}


def build_pintura(path):
    wb = Workbook()
    capa(wb, "Mapa de Pintura (espessura de película)", [
        "Na aba Mapa, confira o material de cada peça (Aço / Alumínio / Plástico) e digite até 5 leituras por peça, em micrômetros (µm).",
        "A referência é a mediana automática das médias das peças metálicas medidas. Se você conhece o valor do fabricante, digite-o em 'Referência manual' — ele sobrescreve a mediana.",
        "Razão = média da peça ÷ referência. O status e a cor mudam sozinhos conforme os limites da aba (editáveis).",
        "Para-choques e peças plásticas: NÃO MEDIR com medidor Fe/NFe (a leitura não é válida); avalie visualmente.",
        "Use o resultado como indício para o item CAR/EST do Registro; confirme visualmente antes de atribuir o nível.",
    ], extra=[
        "Valores de referência são ORIENTATIVOS e variam por fabricante, modelo, ano e processo de pintura de fábrica.",
        "Medidor Fe/NFe: Fe (ferroso) para aço; NFe (não ferroso) para alumínio. Peças de alumínio exigem o modo/sonda NFe.",
    ])
    ws = wb.create_sheet("Mapa")
    ws.sheet_view.showGridLines = False
    widths(ws, {"A": 30, "B": 11, "C": 8, "D": 8, "E": 8, "F": 8, "G": 8, "H": 9, "I": 10, "J": 8, "K": 34, "L": 28})
    titulo_aba(ws, "MAPA DE PINTURA", 12)
    area_logo(ws, "K2:L3")
    ws.merge_cells("A2:J2")
    ws["A2"].value = "Leituras em µm. Células azuis = entrada. Status por razão média/referência."
    ws["A2"].font = f(9, False, TEXTO2, italic=True)

    rotulo(ws["A4"], "Placa / laudo")
    ws.merge_cells("B4:D4")
    entrada(ws["B4"], "ABC1D23")
    rotulo(ws["E4"], "Medidor (Fe/NFe)")
    ws.merge_cells("E4:F4")
    ws.merge_cells("G4:I4")
    entrada(ws["G4"], "Fe/NFe automático")

    rotulo(ws["A5"], "Mediana automática (µm)")
    rotulo(ws["A6"], "Referência manual (µm) — opcional")
    rotulo(ws["A7"], "REFERÊNCIA USADA (µm)")
    rotulo(ws["E5"], "Limite compatível (razão ≤)")
    ws.merge_cells("E5:G5")
    rotulo(ws["E6"], "Limite repintura (razão ≤)")
    ws.merge_cells("E6:G6")
    rotulo(ws["E7"], "Acima disso")
    ws.merge_cells("E7:G7")
    entrada(ws["H5"], 1.3, fmt="0.00")
    entrada(ws["H6"], 2, fmt="0.00")
    formula(ws["H7"], '=">"&TEXT(H6,"0.00")', align=CENTRO)
    ws.merge_cells("I7:J7")
    ws["I7"].value = "com massa/reparo"
    ws["I7"].font = f(9, False, TEXTO2, italic=True)

    hr = 9
    header_row(ws, hr, ["Peça", "Material", "L1", "L2", "L3", "L4", "L5", "Média", "Razão", "Nº", "Status", "Observação"])
    first = hr + 1
    last = first + len(PECAS) - 1
    for k, (peca, mat) in enumerate(PECAS):
        r = first + k
        c = ws.cell(row=r, column=1, value=peca)
        c.font = f(10, True)
        c.border = BORDA
        entrada(ws.cell(row=r, column=2), mat).alignment = CENTRO
        leit = EXEMPLO_LEIT.get(peca, [None] * 5)
        for j in range(5):
            cc = entrada(ws.cell(row=r, column=3 + j), leit[j] if mat != "Plástico" else None, fmt="0")
            cc.alignment = CENTRO
            if mat == "Plástico":
                cc.fill = FILL("E6E8EB")
        formula(ws.cell(row=r, column=8), f'=IF(OR(B{r}="Plástico",COUNT(C{r}:G{r})=0),"",AVERAGE(C{r}:G{r}))',
                fmt="0", align=CENTRO)
        formula(ws.cell(row=r, column=9), f'=IF(OR(H{r}="",$B$7=""),"",H{r}/$B$7)', fmt="0.00", align=CENTRO)
        formula(ws.cell(row=r, column=10), f"=COUNT(C{r}:G{r})", align=CENTRO)
        formula(ws.cell(row=r, column=11),
                f'=IF(B{r}="Plástico","NÃO MEDIR (plástico)",IF(I{r}="","— sem leitura",'
                f'IF(I{r}<=$H$5,"Compatível",IF(I{r}<=$H$6,"Provável repintura",'
                f'"Provável repintura c/ massa/reparo"))))', align=CENTRO)
        entrada(ws.cell(row=r, column=12))
        ws.row_dimensions[r].height = 18
    ws["L18"].value = "Exemplo: repintura na porta"
    ws["L20"].value = "Exemplo: conferir funilaria"
    ws["L27"].value = "Avaliar visualmente"
    ws["L28"].value = "Avaliar visualmente"
    # mediana so de pecas metalicas com media (MEDIAN ignora texto "")
    formula(ws["B5"], f'=IF(COUNT(H{first}:H{last})=0,"",MEDIAN(H{first}:H{last}))', fmt="0", align=CENTRO)
    entrada(ws["B6"], None, fmt="0").alignment = CENTRO
    ws["B6"].comment = Comment("Deixe em branco para usar a mediana automática. "
                               "Digite o valor de fábrica conhecido para sobrescrever.", "Protocolo Cautelar")
    formula(ws["B7"], '=IF(ISNUMBER(B6),B6,B5)', bold=True, fmt="0", align=CENTRO)
    ws["B7"].fill = FILL(AMBAR_CLARO)
    for x in ("C5", "D5", "C6", "D6", "C7", "D7"):
        pass
    for rr in (5, 6, 7):
        ws.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=4)

    # material validacao
    dv_lista(ws, ["Aço", "Alumínio", "Plástico"], f"B{first}:B{last}",
             "Alumínio: use o modo/sonda NFe. Plástico: não medir.")
    # CF status
    rng = f"K{first}:K{last}"
    for txt, cor, fc in [("Compatível", "2E9E5B", "FFFFFF"), ("Provável repintura c/", "C62828", "FFFFFF"),
                         ("Provável repintura", "E0A100", TEXTO), ("NÃO MEDIR", "DDE1E6", TEXTO2)]:
        ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEFT(K{first},{len(txt)})="{txt}"'],
                                                     fill=FILL(cor), font=Font(name=FONT, bold=True, color=fc),
                                                     stopIfTrue=True))
    ws.conditional_formatting.add(f"I{first}:I{last}", FormulaRule(
        formula=[f'AND(ISNUMBER(I{first}),I{first}>$H$6)'], font=Font(name=FONT, bold=True, color="C62828")))
    ws.conditional_formatting.add(f"I{first}:I{last}", FormulaRule(
        formula=[f'AND(ISNUMBER(I{first}),I{first}>$H$5)'], font=Font(name=FONT, bold=True, color=AMBAR_ESCURO)))

    # resumo
    rs = last + 2
    header_row(ws, rs, ["Resumo", "Qtde"], height=22)
    for k, (lab, fx) in enumerate([
        ("Compatível", f'=COUNTIF({rng},"Compatível")'),
        ("Provável repintura", f'=COUNTIF({rng},"Provável repintura")'),
        ("Provável repintura c/ massa/reparo", f'=COUNTIF({rng},"Provável repintura c/*")'),
        ("Sem leitura (metálicas)", f'=COUNTIF({rng},"— sem leitura")'),
        ("Não medir (plástico)", f'=COUNTIF({rng},"NÃO MEDIR*")'),
    ], 1):
        rotulo(ws.cell(row=rs + k, column=1), lab, bold=False, fill=None)
        formula(ws.cell(row=rs + k, column=2), fx, bold=True, align=CENTRO)
    nr = rs + 7
    nota(ws, f"A{nr}:L{nr + 1}",
         "Valores ORIENTATIVOS: a espessura original varia por fabricante, modelo, ano, cor e processo. Limites de razão (1,3 e 2,0) "
         "são ponto de partida editável. Medidor Fe/NFe: aço no modo Fe; alumínio exige modo/sonda NFe; plástico e fibra não são "
         "medidos por esse método. Espessura alta é INDÍCIO: confirme com inspeção visual (textura, tonalidade, respingos, "
         "vedações, parafusos) antes de atribuir o nível no Registro.")
    ws.row_dimensions[nr].height = 30
    ws.row_dimensions[nr + 1].height = 30
    ws.freeze_panes = f"B{first}"
    impressao(ws, paisagem=True, area=f"A1:L{nr + 1}", titulos=f"{hr}:{hr}")
    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    wb.save(path)
    return {"first": first, "last": last}


# ================================================================ 3. PRECIFICACAO
def build_precificacao(path):
    wb = Workbook()
    capa(wb, "Precificação por custo/hora", [
        "Substitua os valores azuis (todos FICTÍCIOS) pelos seus: custos fixos mensais, horas produtivas, custos por vistoria e percentuais.",
        "O custo fixo é rateado por hora produtiva; cada tipo de vistoria recebe o custo das horas que consome + seus custos variáveis.",
        "Preço mínimo cobre custos e impostos/taxas (margem zero). Preço sugerido inclui a margem desejada sobre o faturamento.",
        "O ponto de equilíbrio mostra quantas vistorias/mês (de cada tipo, isoladamente) pagam o custo fixo ao preço sugerido.",
        "Tributos variam por regime e município: confirme a alíquota com seu contador [VERIFICAR].",
    ])
    ws = wb.create_sheet("Precificação")
    ws.sheet_view.showGridLines = False
    widths(ws, {"A": 54, "B": 15, "C": 14, "D": 14, "E": 14, "F": 14, "G": 14})
    titulo_aba(ws, "PRECIFICAÇÃO", 7)
    area_logo(ws, "E2:G3")
    ws.merge_cells("A2:D2")
    ws["A2"].value = "Todos os valores de exemplo são fictícios. Azul = entrada; preto = fórmula."
    ws["A2"].font = f(9, False, TEXTO2, italic=True)

    # custos fixos
    r = 5
    header_row(ws, r, ["1. CUSTOS FIXOS MENSAIS", "R$ / mês"], height=22)
    fixos = [("Aluguel / ponto / box", 800), ("Internet e telefone", 150), ("Contador", 300),
             ("Seguro de responsabilidade civil (RC profissional)", 120),
             ("Software / app / armazenamento de fotos", 90),
             ("Depreciação de equipamentos (valor ÷ meses de vida útil)", 150),
             ("Marketing / anúncios", 300), ("Pró-labore (sua remuneração)", 4000), ("Outros", 100)]
    f0 = r + 1
    for k, (lab, v) in enumerate(fixos):
        rotulo(ws.cell(row=f0 + k, column=1), lab, bold=False, fill=None)
        entrada(ws.cell(row=f0 + k, column=2), v, fmt=MOEDA)
    f1 = f0 + len(fixos) - 1
    ws.cell(row=f0 + 5, column=1).comment = Comment(
        "Ex.: medidor, scanner OBD2, lanterna, etc. Some o valor de compra e divida pelos meses de vida útil estimados.",
        "Protocolo Cautelar")
    rt = f1 + 1
    rotulo(ws.cell(row=rt, column=1), "TOTAL CUSTOS FIXOS / MÊS")
    formula(ws.cell(row=rt, column=2), f"=SUM(B{f0}:B{f1})", bold=True, fmt=MOEDA)
    CF = f"$B${rt}"

    r = rt + 2
    header_row(ws, r, ["2. CAPACIDADE", "Valor"], height=22)
    rotulo(ws.cell(row=r + 1, column=1), "Horas produtivas por mês (vistoria + deslocamento + laudo)", bold=False, fill=None)
    entrada(ws.cell(row=r + 1, column=2), 120, fmt="0")
    HP = f"$B${r + 1}"
    rotulo(ws.cell(row=r + 2, column=1), "Custo fixo por hora produtiva", bold=False, fill=None)
    formula(ws.cell(row=r + 2, column=2), f"=IF({HP}>0,{CF}/{HP},0)", bold=True, fmt=MOEDA)
    CH = f"$B${r + 2}"

    r = r + 4
    header_row(ws, r, ["3. CUSTOS VARIÁVEIS E PERCENTUAIS", "Valor"], height=22)
    var = [("Custo por km rodado (R$/km: combustível + desgaste)", 1.10, MOEDA, "KM"),
           ("Materiais por vistoria (luvas, etiquetas, impressão)", 8, MOEDA, "MAT"),
           ("Impostos sobre faturamento (%)  [VERIFICAR com contador]", 0.06, PCT, "IMP"),
           ("Taxa do meio de pagamento / cartão (%)", 0.035, PCT, "TAX"),
           ("Margem desejada sobre o preço (%)", 0.20, PCT, "MAR")]
    R = {}
    for k, (lab, v, fmt, key) in enumerate(var, 1):
        rotulo(ws.cell(row=r + k, column=1), lab, bold=False, fill=None)
        entrada(ws.cell(row=r + k, column=2), v, fmt=fmt)
        R[key] = f"$B${r + k}"
    rotulo(ws.cell(row=r + len(var) + 1, column=1), "Soma de impostos + taxa + margem", bold=False, fill=None)
    formula(ws.cell(row=r + len(var) + 1, column=2), f"={R['IMP']}+{R['TAX']}+{R['MAR']}", fmt=PCT)
    alerta_row = r + len(var) + 1
    ws.conditional_formatting.add(f"B{alerta_row}", CellIsRule(operator="greaterThanOrEqual", formula=["1"],
                                                                fill=FILL("C62828"), font=Font(name=FONT, color="FFFFFF", bold=True)))

    # tipos
    r = alerta_row + 2
    header_row(ws, r, ["4. POR TIPO DE VISTORIA", "Básica", "Intermediária", "Completa", "Moto", "Utilitário"], height=22)
    tipos_in = [
        ("Tempo total por vistoria (h) — pátio + laudo", [1.0, 1.5, 2.5, 1.0, 2.5], "0.0"),
        ("Deslocamento médio (km ida e volta)", [20, 20, 25, 15, 30], "0"),
        ("Consultas de histórico/restrições (R$)", [15, 30, 60, 15, 60], MOEDA),
    ]
    rows = {}
    rr = r + 1
    for lab, vals, fmt in tipos_in:
        rotulo(ws.cell(row=rr, column=1), lab, bold=False, fill=None)
        for j, v in enumerate(vals, 2):
            entrada(ws.cell(row=rr, column=j), v, fmt=fmt).alignment = CENTRO
        rows[lab[:5]] = rr
        rr += 1
    t_row, km_row, cons_row = r + 1, r + 2, r + 3
    calc = [
        ("Custo fixo alocado (tempo × custo/hora)", lambda L: f"={L}{t_row}*{CH}", MOEDA),
        ("Custos variáveis (consultas + km + materiais)", lambda L: f"={L}{cons_row}+{L}{km_row}*{R['KM']}+{R['MAT']}", MOEDA),
        ("CUSTO TOTAL POR VISTORIA", None, MOEDA),
        ("PREÇO MÍNIMO (margem zero)", None, MOEDA),
        ("PREÇO SUGERIDO (com margem)", None, MOEDA),
        ("Margem de contribuição por vistoria (preço sugerido − impostos/taxa − variáveis)", None, MOEDA),
        ("PONTO DE EQUILÍBRIO (vistorias/mês deste tipo)", None, "0"),
        ("Capacidade máxima (vistorias/mês com as horas informadas)", None, "0"),
    ]
    cf_row, cv_row = rr, rr + 1
    ct_row, pmin_row, psug_row, mc_row, pe_row, cap_row = rr + 2, rr + 3, rr + 4, rr + 5, rr + 6, rr + 7
    for k, (lab, fn, fmt) in enumerate(calc):
        row = rr + k
        destaque = lab.isupper() or lab.startswith(("CUSTO", "PREÇO", "PONTO"))
        rotulo(ws.cell(row=row, column=1), lab, bold=destaque, fill=AMBAR_CLARO if destaque else None)
        for j in range(2, 7):
            L = get_column_letter(j)
            if row == cf_row or row == cv_row:
                fx = fn(L)
            elif row == ct_row:
                fx = f"={L}{cf_row}+{L}{cv_row}"
            elif row == pmin_row:
                fx = f'=IF(1-{R["IMP"]}-{R["TAX"]}>0,{L}{ct_row}/(1-{R["IMP"]}-{R["TAX"]}),"Revise %")'
            elif row == psug_row:
                fx = f'=IF(1-{R["IMP"]}-{R["TAX"]}-{R["MAR"]}>0,{L}{ct_row}/(1-{R["IMP"]}-{R["TAX"]}-{R["MAR"]}),"Revise %")'
            elif row == mc_row:
                fx = f'=IF(ISNUMBER({L}{psug_row}),{L}{psug_row}*(1-{R["IMP"]}-{R["TAX"]})-{L}{cv_row},"")'
            elif row == pe_row:
                fx = f'=IF(AND(ISNUMBER({L}{mc_row}),{L}{mc_row}>0),ROUNDUP({CF}/{L}{mc_row},0),"—")'
            else:
                fx = f'=IF({L}{t_row}>0,ROUNDDOWN({HP}/{L}{t_row},0),"—")'
            formula(ws.cell(row=row, column=j), fx, bold=destaque, fmt=fmt, align=CENTRO)
        ws.row_dimensions[row].height = 30 if len(lab) > 45 else 18
    end = cap_row + 2
    nota(ws, f"A{end}:G{end + 1}",
         "Leitura: o PONTO DE EQUILÍBRIO considera que todas as vistorias do mês são daquele tipo; com mix de tipos, o número fica "
         "entre os extremos. Se ele passa da capacidade máxima, os custos fixos ou o pró-labore estão altos para as horas "
         "disponíveis, ou o preço está baixo. Pró-labore já está nos custos fixos: a margem é o que sobra para reinvestir e reserva. "
         "Valores fictícios; não representam preço de mercado nem promessa de renda.")
    ws.row_dimensions[end].height = 34
    ws.row_dimensions[end + 1].height = 34
    ws.freeze_panes = "B5"
    impressao(ws, paisagem=False, area=f"A1:G{end + 1}")
    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    wb.save(path)
    return {"psug_row": psug_row, "pmin_row": pmin_row, "pe_row": pe_row, "ct_row": ct_row}


# ================================================================ 4. CONTROLE
TIPOS = ["Básica", "Intermediária", "Completa", "Moto", "Utilitário"]
ORIGENS = ["Particular", "Loja", "Indicação", "Anúncio"]
FORMAS = ["Pix", "Dinheiro", "Cartão débito", "Cartão crédito", "Boleto", "Faturado (loja)"]
STATUS = ["Pago", "Pendente", "Cancelado"]
CLASSIF = ["APROVADO", "APROVADO COM APONTAMENTOS", "REPROVADO", "INCONCLUSIVO"]
N_LINHAS_VIST = 500


def build_controle(path):
    import datetime as dt
    wb = Workbook()
    capa(wb, "Controle de Vistorias e Caixa", [
        "Cadastre suas lojas/parceiros na aba Parceiros (nome, contato, condição, comissão %).",
        "Lance cada vistoria na aba Vistorias (uma por linha). Tipo, origem, parceiro, forma e status de pagamento são escolhidos em lista.",
        "No Painel, escolha mês e ano: faturamento, nº de vistorias, ticket médio, origem, classificação, a receber e comissões são calculados.",
        "As linhas de exemplo (clientes fictícios) podem ser apagadas: selecione e tecle Delete (não exclua as colunas de fórmula).",
    ], extra=[
        "LGPD (Lei 13.709/2018): esta planilha contém dados pessoais (nome, telefone, placa). Guarde em local protegido por senha, "
        "use só para a finalidade informada ao cliente (prestação do serviço, cobrança e obrigações legais), compartilhe apenas o necessário "
        "e defina um prazo de guarda [VERIFICAR prazo com seu contador/advogado]; depois, elimine ou anonimize.",
    ])
    # Parceiros
    wp = wb.create_sheet("Parceiros")
    wp.sheet_view.showGridLines = False
    widths(wp, {"A": 28, "B": 22, "C": 18, "D": 30, "E": 12, "F": 28})
    titulo_aba(wp, "PARCEIROS (LOJAS / INDICADORES)", 6)
    header_row(wp, 4, ["Parceiro", "Contato", "Telefone", "Condição combinada", "Comissão %", "Observação"])
    parceiros = [("Loja Exemplo A", "Responsável A", "(00) 0000-0000", "Faturado quinzenal", 0.10, ""),
                 ("Loja Exemplo B", "Responsável B", "(00) 0000-0000", "Pagamento no ato", 0.05, ""),
                 ("Indicador Exemplo", "Contato C", "(00) 00000-0000", "Indicação avulsa", 0.10, "")]
    P_FIRST, P_LAST = 5, 54
    for r in range(P_FIRST, P_LAST + 1):
        vals = parceiros[r - P_FIRST] if r - P_FIRST < len(parceiros) else [None] * 6
        for j, v in enumerate(vals, 1):
            entrada(wp.cell(row=r, column=j), v, fmt=PCT if j == 5 else None)
    wp.freeze_panes = "A5"
    nota(wp, "A3:F3", "Parceiro = quem indicou/encaminhou o cliente. Comissão % incide sobre o valor da vistoria. "
                      "Dados de contato também são dados pessoais (LGPD).")
    wp.row_dimensions[3].height = 28
    impressao(wp, paisagem=True, area=f"A1:F{P_LAST}", titulos="4:4")
    P_NOMES = f"Parceiros!$A${P_FIRST}:$A${P_LAST}"
    P_COM = f"Parceiros!$E${P_FIRST}:$E${P_LAST}"

    # Vistorias
    wv = wb.create_sheet("Vistorias", 1)
    wv.sheet_view.showGridLines = False
    cols = ["Data", "Nº laudo", "Cliente", "Telefone", "Placa", "Tipo", "Origem", "Parceiro", "Valor (R$)",
            "Forma de pagamento", "Status pagamento", "Classificação", "Comissão %", "Comissão (R$)", "Mês", "Ano"]
    widths(wv, dict(zip("ABCDEFGHIJKLMNOP", [11, 11, 22, 16, 10, 13, 12, 18, 12, 16, 13, 26, 11, 12, 6, 7])))
    titulo_aba(wv, "CONTROLE DE VISTORIAS", 16)
    nota(wv, "A2:P2", "LGPD: dados pessoais (nome, telefone, placa). Guarde com segurança (arquivo com senha, acesso restrito), use só "
                      "para prestar o serviço, cobrar e cumprir obrigações legais, e elimine/anonimize após o prazo de guarda definido.",
         cor="FDECEA", altura=30)
    HR = 4
    header_row(wv, HR, cols)
    for j in (13, 14, 15, 16):
        wv.cell(row=HR, column=j).fill = FILL(ACO)
    V1, V2 = HR + 1, HR + N_LINHAS_VIST
    hoje = dt.date(2026, 9, 1)
    exemplos = [
        (dt.date(2026, 9, 2), "2026-0001", "Cliente Exemplo 1", "(00) 00000-0001", "ABC1D23", "Completa", "Particular", None, 350, "Pix", "Pago", "APROVADO COM APONTAMENTOS"),
        (dt.date(2026, 9, 3), "2026-0002", "Cliente Exemplo 2", "(00) 00000-0002", "XXX0X00", "Básica", "Loja", "Loja Exemplo A", 180, "Faturado (loja)", "Pendente", "APROVADO"),
        (dt.date(2026, 9, 5), "2026-0003", "Cliente Exemplo 3", "(00) 00000-0003", "ABC1D23", "Intermediária", "Indicação", "Indicador Exemplo", 250, "Cartão crédito", "Pago", "REPROVADO"),
        (dt.date(2026, 9, 9), "2026-0004", "Cliente Exemplo 4", "(00) 00000-0004", "XXX0X00", "Moto", "Anúncio", None, 150, "Pix", "Pago", "INCONCLUSIVO"),
        (dt.date(2026, 10, 1), "2026-0005", "Cliente Exemplo 5", "(00) 00000-0005", "ABC1D23", "Completa", "Loja", "Loja Exemplo B", 330, "Boleto", "Pendente", "APROVADO"),
    ]
    _ = hoje
    for r in range(V1, V2 + 1):
        ex = exemplos[r - V1] if r - V1 < len(exemplos) else [None] * 12
        for j in range(1, 13):
            fmt = "dd/mm/yyyy" if j == 1 else (MOEDA if j == 9 else None)
            c = entrada(wv.cell(row=r, column=j), ex[j - 1], fmt=fmt)
            c.font = Font(name=FONT, size=10, color=AZUL_ENTRADA)
        formula(wv.cell(row=r, column=13), f'=IF(H{r}="","",IFERROR(INDEX({P_COM},MATCH(H{r},{P_NOMES},0)),0))', fmt=PCT)
        formula(wv.cell(row=r, column=14), f'=IF(OR(H{r}="",I{r}="",K{r}="Cancelado"),0,I{r}*N(M{r}))', fmt=MOEDA)
        formula(wv.cell(row=r, column=15), f'=IF(ISNUMBER(A{r}),MONTH(A{r}),"")', align=CENTRO)
        formula(wv.cell(row=r, column=16), f'=IF(ISNUMBER(A{r}),YEAR(A{r}),"")', align=CENTRO)
        for j in (13, 14, 15, 16):
            wv.cell(row=r, column=j).font = Font(name=FONT, size=10, color="000000")
    dv = DataValidation(type="date", operator="between", formula1="36526", formula2="73051", allow_blank=True)
    dv.error, dv.showErrorMessage = "Digite uma data válida (dd/mm/aaaa).", True
    wv.add_data_validation(dv)
    dv.add(f"A{V1}:A{V2}")
    dv_lista(wv, TIPOS, f"F{V1}:F{V2}")
    dv_lista(wv, ORIGENS, f"G{V1}:G{V2}")
    dv_lista(wv, P_NOMES, f"H{V1}:H{V2}", "Cadastre na aba Parceiros. Deixe vazio se não houver.")
    dv_lista(wv, FORMAS, f"J{V1}:J{V2}")
    dv_lista(wv, STATUS, f"K{V1}:K{V2}")
    dv_lista(wv, CLASSIF, f"L{V1}:L{V2}")
    for txt, cor in [("Pendente", "FFF4D6"), ("Cancelado", "E6E8EB")]:
        wv.conditional_formatting.add(f"K{V1}:K{V2}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=FILL(cor)))
    for txt, cor, fc in [("REPROVADO", "C62828", "FFFFFF"), ("INCONCLUSIVO", INC, "FFFFFF"),
                         ("APROVADO COM APONTAMENTOS", "E0A100", TEXTO), ("APROVADO", "2E9E5B", "FFFFFF")]:
        wv.conditional_formatting.add(f"L{V1}:L{V2}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=FILL(cor),
                                                                  font=Font(name=FONT, color=fc, bold=True)))
    wv.freeze_panes = f"C{V1}"
    wv.auto_filter.ref = f"A{HR}:P{V2}"
    impressao(wv, paisagem=True, area=f"A1:P{V2}", titulos=f"{HR}:{HR}")

    # Painel
    wpn = wb.create_sheet("Painel", 1)
    wpn.sheet_view.showGridLines = False
    widths(wpn, {"A": 34, "B": 16, "C": 16, "D": 4, "E": 30, "F": 12, "G": 16})
    titulo_aba(wpn, "PAINEL DO MÊS", 7)
    area_logo(wpn, "E2:G3")
    nota(wpn, "A2:C3", "LGPD: o painel mostra só totais; os dados pessoais ficam na aba Vistorias — proteja o arquivo com senha.",
         cor="FDECEA")
    rotulo(wpn["A5"], "Mês (1–12)")
    entrada(wpn["B5"], 9, bold=True).alignment = CENTRO
    rotulo(wpn["A6"], "Ano")
    entrada(wpn["B6"], 2026, bold=True).alignment = CENTRO
    dv_lista(wpn, [str(i) for i in range(1, 13)], "B5", allow_blank=False)
    dvy = DataValidation(type="whole", operator="between", formula1="2000", formula2="2100")
    wpn.add_data_validation(dvy)
    dvy.add("B6")
    MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
             "novembro", "dezembro"]
    formula(wpn["C5"], '=IFERROR(CHOOSE($B$5,' + ",".join(f'"{m}"' for m in MESES) + ')&"/"&$B$6,"mês inválido")',
            bold=True, align=CENTRO)
    wpn.merge_cells("C5:C6")

    VM = f"Vistorias!$O${V1}:$O${V2}"
    VA = f"Vistorias!$P${V1}:$P${V2}"
    VV = f"Vistorias!$I${V1}:$I${V2}"
    VS = f"Vistorias!$K${V1}:$K${V2}"
    VO = f"Vistorias!$G${V1}:$G${V2}"
    VC = f"Vistorias!$L${V1}:$L${V2}"
    VT = f"Vistorias!$F${V1}:$F${V2}"
    VCOM = f"Vistorias!$N${V1}:$N${V2}"
    M, A = "$B$5", "$B$6"
    base = f"{VM},{M},{VA},{A}"
    ncanc = f'{VS},"<>Cancelado"'

    header_row(wpn, 8, ["Indicador do mês", "Valor"], height=22)
    kpis = [
        ("Faturamento (exceto cancelados)", f"=SUMIFS({VV},{base},{ncanc})", MOEDA),
        ("Nº de vistorias (exceto canceladas)", f"=COUNTIFS({base},{ncanc})", "0"),
        ("Ticket médio", "=IF(B10=0,0,B9/B10)", MOEDA),
        ("Recebido (Pago)", f'=SUMIFS({VV},{base},{VS},"Pago")', MOEDA),
        ("A receber (Pendente)", f'=SUMIFS({VV},{base},{VS},"Pendente")', MOEDA),
        ("Comissões a pagar a parceiros", f"=SUMIFS({VCOM},{base})", MOEDA),
        ("Faturamento líquido de comissões", "=B9-B14", MOEDA),
        ("Cancelamentos (qtde)", f'=COUNTIFS({base},{VS},"Cancelado")', "0"),
    ]
    for k, (lab, fx, fmt) in enumerate(kpis):
        rotulo(wpn.cell(row=9 + k, column=1), lab, bold=False, fill=None)
        formula(wpn.cell(row=9 + k, column=2), fx, bold=True, fmt=fmt, align=CENTRO)

    header_row(wpn, 8, ["Por origem", "Qtde", "Faturamento"], col0=5, height=22)
    for k, o in enumerate(ORIGENS):
        r = 9 + k
        rotulo(wpn.cell(row=r, column=5), o, bold=False, fill=None)
        formula(wpn.cell(row=r, column=6), f'=COUNTIFS({base},{VO},"{o}",{ncanc})', align=CENTRO)
        formula(wpn.cell(row=r, column=7), f'=SUMIFS({VV},{base},{VO},"{o}",{ncanc})', fmt=MOEDA)
    r = 9 + len(ORIGENS)
    rotulo(wpn.cell(row=r, column=5), "(origem não informada)", bold=False, fill=None)
    formula(wpn.cell(row=r, column=6), f"=B10-SUM(F9:F{r - 1})", align=CENTRO)
    formula(wpn.cell(row=r, column=7), f"=B9-SUM(G9:G{r - 1})", fmt=MOEDA)

    r0 = 19
    header_row(wpn, r0, ["Por classificação", "Qtde", "% do mês"], col0=5, height=22)
    for k, cl in enumerate(CLASSIF):
        r = r0 + 1 + k
        rotulo(wpn.cell(row=r, column=5), cl, bold=False, fill=None)
        formula(wpn.cell(row=r, column=6), f'=COUNTIFS({base},{VC},"{cl}",{ncanc})', align=CENTRO)
        formula(wpn.cell(row=r, column=7), f"=IF($B$10=0,0,F{r}/$B$10)", fmt=PCT)
    header_row(wpn, r0, ["Por tipo", "Qtde", "Faturamento"], col0=1, height=22)
    wpn.cell(row=r0, column=3).value = "Faturamento"
    for k, t in enumerate(TIPOS):
        r = r0 + 1 + k
        rotulo(wpn.cell(row=r, column=1), t, bold=False, fill=None)
        formula(wpn.cell(row=r, column=2), f'=COUNTIFS({base},{VT},"{t}",{ncanc})', align=CENTRO)
        formula(wpn.cell(row=r, column=3), f'=SUMIFS({VV},{base},{VT},"{t}",{ncanc})', fmt=MOEDA)
    nota(wpn, "A30:G31", "Todas as vendas do mês selecionado entram pela data da vistoria (coluna A da aba Vistorias). "
                         "Comissão considera o % do parceiro na aba Parceiros; vistorias canceladas não geram comissão nem faturamento.")
    wpn.row_dimensions[30].height = 22
    wpn.row_dimensions[31].height = 22
    wpn.freeze_panes = "A8"
    impressao(wpn, paisagem=False, area="A1:G31")
    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    wb.save(path)


# ================================================================ 5. COMPARATIVO
def build_comparativo(path):
    wb = Workbook()
    capa(wb, "Comparativo: anúncio x veículo", [
        "Aba Anúncio x Veículo: transcreva o que o anúncio/vendedor afirma e, ao lado, o que foi constatado na vistoria.",
        "Em Status escolha Confere, Diverge ou Não informado. O resumo conta as divergências automaticamente.",
        "Aba Comparar veículos: coloque até 3 candidatos lado a lado (preço, km, ano, classificação, apontamentos e reparos estimados).",
        "O custo total soma preço + reparos estimados. Estimativas de reparo são do comprador/oficina, não do laudo.",
    ], extra=[
        "O comparativo organiza informações; não é recomendação de compra. O laudo descreve o estado observado no momento da vistoria.",
    ])
    ws = wb.create_sheet("Anúncio x Veículo")
    ws.sheet_view.showGridLines = False
    widths(ws, {"A": 30, "B": 30, "C": 30, "D": 15, "E": 34})
    titulo_aba(ws, "O QUE O ANÚNCIO DIZ x O QUE FOI CONSTATADO", 5)
    area_logo(ws, "D2:E3")
    rotulo(ws["A4"], "Veículo / placa")
    ws.merge_cells("B4:C4")
    entrada(ws["B4"], "Marca Modelo — ABC1D23")
    rotulo(ws["A5"], "Link / data do anúncio")
    ws.merge_cells("B5:C5")
    entrada(ws["B5"], "(cole o link) — 01/09/2026")
    header_row(ws, 7, ["Afirmação", "O anúncio diz", "Constatado na vistoria", "Status", "Observação"])
    linhas = [
        ("Quilometragem", "45.000 km", "45.230 km no hodômetro", "Confere", "Coerente com desgaste observado"),
        ("Ano fabricação/modelo", "2020/2021", "2020/2021 (documento)", "Confere", ""),
        ("Único dono", "Sim", "Não comprovado", "Não informado", "Pedir histórico/documentos"),
        ("Sem batidas / sem retoques", "Nunca bateu", "Porta traseira direita repintada (N2)", "Diverge", "Ver Mapa de Pintura"),
        ("Revisões em concessionária", "Todas feitas", "Manual com 2 de 4 carimbos", "Diverge", ""),
        ("Pneus", "Novos", "~60% de vida, mesma marca", "Diverge", "N1"),
        ("Laudo / vistoria anterior", "Laudo aprovado", "", "Não informado", "Solicitar cópia"),
        ("Chave reserva e manual", "", "", "", ""),
        ("Documentação / débitos", "", "", "", ""),
        ("Outros", "", "", "", ""),
        ("", "", "", "", ""), ("", "", "", "", ""),
    ]
    L1 = 8
    for k, vals in enumerate(linhas):
        r = L1 + k
        for j, v in enumerate(vals, 1):
            c = entrada(ws.cell(row=r, column=j), v if v != "" else None)
            c.alignment = WRAP if j != 4 else CENTRO
            if j == 1 and v:
                c.font = Font(name=FONT, size=11, color=AZUL_ENTRADA, bold=True)
        ws.row_dimensions[r].height = 20
    L2 = L1 + len(linhas) - 1
    dv_lista(ws, ["Confere", "Diverge", "Não informado"], f"D{L1}:D{L2}")
    for txt, cor, fc in [("Confere", "2E9E5B", "FFFFFF"), ("Diverge", "C62828", "FFFFFF"), ("Não informado", "DDE1E6", TEXTO)]:
        ws.conditional_formatting.add(f"D{L1}:D{L2}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=FILL(cor),
                                                                  font=Font(name=FONT, bold=True, color=fc)))
    rs = L2 + 2
    header_row(ws, rs, ["Resumo", "Qtde"], height=22)
    D = f"$D${L1}:$D${L2}"
    res = [("Confere", f'=COUNTIF({D},"Confere")'), ("Diverge", f'=COUNTIF({D},"Diverge")'),
           ("Não informado", f'=COUNTIF({D},"Não informado")'),
           ("Itens avaliados", f"=SUM(B{rs + 1}:B{rs + 3})")]
    for k, (lab, fx) in enumerate(res, 1):
        rotulo(ws.cell(row=rs + k, column=1), lab, bold=False, fill=None)
        formula(ws.cell(row=rs + k, column=2), fx, bold=True, align=CENTRO)
    rotulo(ws.cell(row=rs + 5, column=1), "Conclusão do comparativo")
    ws.merge_cells(start_row=rs + 5, start_column=2, end_row=rs + 5, end_column=5)
    formula(ws.cell(row=rs + 5, column=2),
            f'=IF(B{rs + 4}=0,"Preencha o status dos itens.",IF(B{rs + 2}>0,B{rs + 2}&" divergência(s) entre anúncio e veículo — '
            f'renegocie ou peça esclarecimento por escrito.",IF(B{rs + 3}>0,"Sem divergências; "&B{rs + 3}&" item(ns) não informado(s).",'
            f'"Tudo o que foi anunciado confere com o constatado.")))', bold=True, align=ESQ)
    ws.conditional_formatting.add(f"B{rs + 5}", FormulaRule(formula=[f"$B${rs + 2}>0"], fill=FILL("FDECEA"),
                                                             font=Font(name=FONT, bold=True, color="C62828")))
    ws.row_dimensions[rs + 5].height = 30
    ws.freeze_panes = "B8"
    impressao(ws, paisagem=False, area=f"A1:E{rs + 5}")

    # comparar 3
    wc = wb.create_sheet("Comparar veículos")
    wc.sheet_view.showGridLines = False
    widths(wc, {"A": 40, "B": 20, "C": 20, "D": 20})
    titulo_aba(wc, "COMPARAÇÃO LADO A LADO (ATÉ 3 VEÍCULOS)", 4)
    area_logo(wc, "C2:D3")
    header_row(wc, 4, ["Critério", "Veículo A", "Veículo B", "Veículo C"])
    campos = [
        ("Descrição (marca/modelo/versão)", ["Modelo X 1.0", "Modelo Y 1.3", "Modelo Z 1.0"], None),
        ("Placa (parcial)", ["ABC1D23", "XXX0X00", "ABC1D23"], None),
        ("Preço pedido (R$)", [62000, 58500, 60900], MOEDA),
        ("Quilometragem (km)", [45230, 88000, 61000], "#,##0"),
        ("Ano modelo", [2021, 2019, 2020], "0"),
        ("Classificação do laudo", ["APROVADO COM APONTAMENTOS", "REPROVADO", "APROVADO"], None),
        ("Nº apontamentos N2", [1, 3, 0], "0"),
        ("Nº apontamentos N3", [0, 1, 0], "0"),
        ("Nº apontamentos N4", [0, 1, 0], "0"),
        ("Custo estimado de reparos (R$)", [800, 6500, 300], MOEDA),
    ]
    rr = 5
    idx = {}
    for lab, vals, fmt in campos:
        rotulo(wc.cell(row=rr, column=1), lab, bold=False, fill=None)
        for j, v in enumerate(vals, 2):
            entrada(wc.cell(row=rr, column=j), v, fmt=fmt).alignment = CENTRO
        idx[lab] = rr
        rr += 1
    classif_row = idx["Classificação do laudo"]
    dv_lista(wc, CLASSIF + ["Sem laudo"], f"B{classif_row}:D{classif_row}")
    for txt, cor, fc in [("REPROVADO", "C62828", "FFFFFF"), ("INCONCLUSIVO", INC, "FFFFFF"),
                         ("APROVADO COM APONTAMENTOS", "E0A100", TEXTO), ("APROVADO", "2E9E5B", "FFFFFF")]:
        wc.conditional_formatting.add(f"B{classif_row}:D{classif_row}", CellIsRule(
            operator="equal", formula=[f'"{txt}"'], fill=FILL(cor), font=Font(name=FONT, bold=True, color=fc)))
    pr, kmr, anr = idx["Preço pedido (R$)"], idx["Quilometragem (km)"], idx["Ano modelo"]
    n2, n3, n4, rep = idx["Nº apontamentos N2"], idx["Nº apontamentos N3"], idx["Nº apontamentos N4"], idx["Custo estimado de reparos (R$)"]
    calc = [
        ("CUSTO TOTAL (preço + reparos)", lambda L: f'=IF({L}{pr}="","",{L}{pr}+N({L}{rep}))', MOEDA),
        ("Total de apontamentos (N2+N3+N4)", lambda L: f'=IF({L}{pr}="","",N({L}{n2})+N({L}{n3})+N({L}{n4}))', "0"),
        ("Km por ano de uso (aprox.)", lambda L: f'=IF(OR({L}{kmr}="",{L}{anr}=""),"",{L}{kmr}/MAX(1,$B$20-{L}{anr}+1))', "#,##0"),
        ("Alerta", lambda L: f'=IF({L}{pr}="","",IF(OR({L}{classif_row}="REPROVADO",N({L}{n4})>0),"Crítico no laudo (N4)",'
                             f'IF({L}{classif_row}="INCONCLUSIVO","Laudo inconclusivo",IF(N({L}{n3})>0,"Atenção: N3","—"))))', None),
    ]
    ct_row = rr
    for k, (lab, fn, fmt) in enumerate(calc):
        r = rr + k
        rotulo(wc.cell(row=r, column=1), lab, bold=True, fill=AMBAR_CLARO if k == 0 else None)
        for j in range(2, 5):
            L = get_column_letter(j)
            formula(wc.cell(row=r, column=j), fn(L), bold=(k == 0), fmt=fmt, align=CENTRO)
    rr += len(calc)
    wc.conditional_formatting.add(f"B{rr - 1}:D{rr - 1}", FormulaRule(formula=[f'LEFT(B{rr - 1},7)="Crítico"'],
                                                                       font=Font(name=FONT, bold=True, color="C62828")))
    rr += 1
    rotulo(wc.cell(row=rr, column=1), "Ano de referência (para km/ano)")
    entrada(wc.cell(row=rr, column=2), 2026, fmt="0").alignment = CENTRO
    assert rr == 20, rr  # usado em $B$20 acima
    rr += 1
    rotulo(wc.cell(row=rr, column=1), "Menor custo total")
    wc.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=4)
    formula(wc.cell(row=rr, column=2),
            f'=IF(COUNT(B{ct_row}:D{ct_row})=0,"",INDEX($B$4:$D$4,MATCH(MIN(B{ct_row}:D{ct_row}),B{ct_row}:D{ct_row},0))'
            f'&" — R$ "&FIXED(MIN(B{ct_row}:D{ct_row}),2))', bold=True, align=ESQ)
    rr += 1
    rotulo(wc.cell(row=rr, column=1), "Menor custo total SEM N4 / reprovação")
    wc.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=4)
    # custo "limpo": custo total se nao ha N4/reprovado/inconclusivo; senao texto
    limpo = []
    for L in "BCD":
        limpo.append(f'IF(AND(ISNUMBER({L}{ct_row}),N({L}{n4})=0,{L}{classif_row}<>"REPROVADO",{L}{classif_row}<>"INCONCLUSIVO"),{L}{ct_row},"")')
    # linha auxiliar oculta
    aux = rr + 3
    rotulo(wc.cell(row=aux, column=1), "(auxiliar: custo elegível)", bold=False, fill=None)
    wc.cell(row=aux, column=1).font = f(8, False, "7A8591", italic=True)
    for j, fx in enumerate(limpo, 2):
        formula(wc.cell(row=aux, column=j), "=" + fx, fmt=MOEDA, align=CENTRO)
        wc.cell(row=aux, column=j).font = f(8, False, "7A8591")
    formula(wc.cell(row=rr, column=2),
            f'=IF(COUNT(B{aux}:D{aux})=0,"Nenhum candidato sem N4/reprovação/inconclusivo",'
            f'INDEX($B$4:$D$4,MATCH(MIN(B{aux}:D{aux}),B{aux}:D{aux},0))&" — R$ "&FIXED(MIN(B{aux}:D{aux}),2))',
            bold=True, align=ESQ)
    nota(wc, f"A{aux + 2}:D{aux + 3}",
         "Custo de reparo é estimativa do comprador ou de oficina de confiança, não do laudo. O menor custo total não é, "
         "sozinho, a melhor escolha: pese a classificação, os itens N3/N4 e o histórico. Comparativo informativo, não é "
         "recomendação de compra.")
    wc.row_dimensions[aux + 2].height = 26
    wc.row_dimensions[aux + 3].height = 26
    wc.freeze_panes = "B5"
    impressao(wc, paisagem=False, area=f"A1:D{aux + 3}")
    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    wb.save(path)
    return {"ct_row": ct_row}


# ================================================================ 6. AGENDA
def build_agenda(path):
    import datetime as dt
    wb = Workbook()
    capa(wb, "Agenda semanal e rota", [
        "Na aba Agenda, digite a data da segunda-feira da semana: os dias são preenchidos automaticamente.",
        "Para cada vistoria: horário de início, cliente/veículo, tipo, endereço/bairro, tempo estimado (min) e deslocamento até lá (min e km).",
        "A planilha calcula o horário previsto de término e soma horas de vistoria, deslocamento e km por dia e na semana.",
        "Agrupe vistorias do mesmo bairro no mesmo dia para reduzir deslocamento; deixe folga para imprevistos e para o laudo.",
    ], extra=["Endereço e nome do cliente são dados pessoais (LGPD): compartilhe a agenda só com quem precisa."])
    ws = wb.create_sheet("Agenda")
    ws.sheet_view.showGridLines = False
    cols = ["Dia", "Data", "Início", "Cliente / veículo", "Tipo", "Endereço / bairro", "Vistoria (min)",
            "Desloc. (min)", "Desloc. (km)", "Total (h:mm)", "Término previsto", "Obs."]
    widths(ws, dict(zip("ABCDEFGHIJKL", [9, 11, 8, 24, 13, 30, 10, 10, 10, 11, 11, 22])))
    titulo_aba(ws, "AGENDA SEMANAL E ROTA", 12)
    area_logo(ws, "J2:L3")
    rotulo(ws["A4"], "Semana (data da 2ª-feira)")
    ws.merge_cells("A4:B4")
    entrada(ws["C4"], dt.date(2026, 10, 5), bold=True, fmt="dd/mm/yyyy")
    ws.merge_cells("C4:D4")
    rotulo(ws["E4"], "Jornada disponível/dia (h)")
    entrada(ws["F4"], 8, fmt="0.0").alignment = CENTRO
    HR = 6
    header_row(ws, HR, cols)
    dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    SLOTS = 6
    ex = {
        0: [("08:30", "Cliente Ex. 1 — ABC1D23", "Completa", "Centro", 150, 20, 8),
            ("11:30", "Loja Exemplo A — 2 carros", "Básica", "Bairro Norte", 120, 25, 12)],
        1: [("09:00", "Cliente Ex. 2 — XXX0X00", "Intermediária", "Bairro Sul", 90, 30, 15)],
        3: [("14:00", "Cliente Ex. 3 — moto", "Moto", "Centro", 60, 15, 6)],
    }
    r = HR + 1
    tipos = TIPOS + ["Retorno/outros"]
    dia_rows = []
    for d_i, dia in enumerate(dias):
        r_first = r
        for s in range(SLOTS):
            ws.cell(row=r, column=1, value=dia).font = f(10, True, "FFFFFF")
            ws.cell(row=r, column=1).fill = FILL(GRAFITE)
            ws.cell(row=r, column=1).alignment = CENTRO
            formula(ws.cell(row=r, column=2), f"=$C$4+{d_i}", fmt="dd/mm", align=CENTRO)
            vals = ex.get(d_i, [])
            v = vals[s] if s < len(vals) else [None] * 7
            hh = None
            if v[0]:
                h, m = v[0].split(":")
                hh = dt.time(int(h), int(m))
            entrada(ws.cell(row=r, column=3), hh, fmt="hh:mm").alignment = CENTRO
            for j, val in zip((4, 5, 6, 7, 8, 9), v[1:]):
                c = entrada(ws.cell(row=r, column=j), val, fmt="0" if j >= 7 else None)
                if j >= 7:
                    c.alignment = CENTRO
            formula(ws.cell(row=r, column=10), f'=IF(N(G{r})+N(H{r})=0,"",(N(G{r})+N(H{r}))/1440)', fmt="[h]:mm", align=CENTRO)
            formula(ws.cell(row=r, column=11), f'=IF(ISNUMBER(C{r}),C{r}+N(G{r})/1440,"")', fmt="hh:mm", align=CENTRO)
            entrada(ws.cell(row=r, column=12))
            if s % 2:
                for j in (2, 10, 11):
                    ws.cell(row=r, column=j).fill = FILL(PAPEL2)
            r += 1
        # subtotal do dia
        ws.cell(row=r, column=1, value=f"Total {dia}").font = f(10, True, TEXTO)
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        for j in range(1, 13):
            ws.cell(row=r, column=j).fill = FILL(AMBAR_CLARO)
            ws.cell(row=r, column=j).border = BORDA
        for j, L in ((7, "G"), (8, "H"), (9, "I")):
            formula(ws.cell(row=r, column=j), f"=SUM({L}{r_first}:{L}{r - 1})", bold=True, fmt="0", align=CENTRO)
            ws.cell(row=r, column=j).fill = FILL(AMBAR_CLARO)
        formula(ws.cell(row=r, column=10), f"=SUM(J{r_first}:J{r - 1})", bold=True, fmt="[h]:mm", align=CENTRO)
        ws.cell(row=r, column=10).fill = FILL(AMBAR_CLARO)
        formula(ws.cell(row=r, column=11), f'=IF(J{r}*24>$F$4,"Acima da jornada","")', bold=True, align=CENTRO)
        ws.cell(row=r, column=11).font = f(9, True, "C62828")
        dia_rows.append((r_first, r - 1, r))
        r += 1
    last = r - 1
    dv_lista(ws, tipos, f"E{HR + 1}:E{last}")
    dvn = DataValidation(type="decimal", operator="between", formula1="0", formula2="1000", allow_blank=True)
    dvn.error, dvn.showErrorMessage = "Digite minutos/km (número).", True
    ws.add_data_validation(dvn)
    dvn.add(f"G{HR + 1}:I{last}")
    dvt = DataValidation(type="time", operator="between", formula1="0", formula2="0.999988", allow_blank=True)
    dvt.error, dvt.showErrorMessage = "Digite a hora como hh:mm (ex.: 08:30).", True
    ws.add_data_validation(dvt)
    dvt.add(f"C{HR + 1}:C{last}")
    # totais da semana
    r += 1
    header_row(ws, r, ["TOTAL DA SEMANA", "", "", "", "", "", "Vistoria (min)", "Desloc. (min)", "Desloc. (km)", "Total (h:mm)", "Nº vistorias", ""], height=22)
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
    r += 1
    subs = [x[2] for x in dia_rows]
    for j, L in ((7, "G"), (8, "H"), (9, "I")):
        formula(ws.cell(row=r, column=j), "=" + "+".join(f"{L}{s}" for s in subs), bold=True, fmt="0", align=CENTRO)
    formula(ws.cell(row=r, column=10), "=" + "+".join(f"J{s}" for s in subs), bold=True, fmt="[h]:mm", align=CENTRO)
    formula(ws.cell(row=r, column=11), f'=COUNTIF(D{HR + 1}:D{last},"?*")', bold=True, align=CENTRO)
    rotulo(ws.cell(row=r, column=1), "Somatório")
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
    tot = r
    r += 1
    rotulo(ws.cell(row=r, column=1), "Horas totais (decimal) / % do tempo em deslocamento")
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
    formula(ws.cell(row=r, column=10), f"=J{tot}*24", bold=True, fmt="0.0", align=CENTRO)
    formula(ws.cell(row=r, column=11), f"=IF(J{tot}=0,0,H{tot}/(G{tot}+H{tot}))", bold=True, fmt=PCT, align=CENTRO)
    r += 2
    nota(ws, f"A{r}:L{r}", "Tempo estimado inclui a vistoria no pátio; reserve tempo à parte para redigir o laudo. "
                           "Cliente e endereço são dados pessoais (LGPD): não compartilhe a agenda em grupos.", altura=30)
    ws.freeze_panes = f"D{HR + 1}"
    impressao(ws, paisagem=True, area=f"A1:L{r}", titulos=f"{HR}:{HR}")
    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    wb.save(path)


# ================================================================ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    arquivos = [
        ("01-registro-de-apontamentos.xlsx", build_registro),
        ("02-mapa-de-pintura.xlsx", build_pintura),
        ("03-precificacao.xlsx", build_precificacao),
        ("04-controle-de-vistorias.xlsx", build_controle),
        ("05-comparativo-anuncio-x-veiculo.xlsx", build_comparativo),
        ("06-agenda-e-rota.xlsx", build_agenda),
    ]
    for nome, fn in arquivos:
        fn(out / nome)
        print("ok", out / nome)


if __name__ == "__main__":
    main()
