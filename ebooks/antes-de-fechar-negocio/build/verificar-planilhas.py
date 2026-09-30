#!/usr/bin/env python3
"""Verifica as planilhas do e-book "Antes de Fechar Negocio".

1. Gera os 2 arquivos entregues + cenarios de teste numa pasta temporaria,
   recalcula com LibreOffice (soffice headless) e procura erros de formula
   (#REF!, #NAME?, #DIV/0!, #VALUE!, #N/A, Err:...).
2. Comparativo: alerta de preco (25% abaixo), carro Reprovado/Inconclusivo ou
   com Alerta nas consultas nunca e a melhor opcao, pontuacao confere com
   reimplementacao em Python.
3. Custo total: PMT confere com a formula manual da Tabela Price, taxa 0%,
   sem financiamento, debitos do comprador, resumo e indicador do orcamento.

Uso: python3 build/verificar-planilhas.py      (requer soffice no PATH)
"""
import copy
import importlib.util
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import load_workbook

AQUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bp", AQUI / "build-planilhas.py")
bp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bp)

ERROS = ("#REF!", "#NAME?", "#DIV/0!", "#VALUE!", "#N/A", "#NUM!", "#NULL!", "Err:")
FALHAS = 0


def check(ok, msg):
    global FALHAS
    FALHAS += not ok
    print(f"  [{'OK' if ok else 'FALHA'}] {msg}")


def recalc(paths, outdir):
    prof = Path(tempfile.mkdtemp(prefix="lo-prof-"))
    cmd = ["soffice", f"-env:UserInstallation={prof.as_uri()}", "--headless", "--calc",
           "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", str(outdir)] + [str(p) for p in paths]
    subprocess.run(cmd, check=True, capture_output=True, timeout=300)
    shutil.rmtree(prof, ignore_errors=True)
    return [outdir / p.name for p in paths]


def varrer_erros(path):
    wbf = load_workbook(path)
    wbv = load_workbook(path, data_only=True)
    achados, n_form = [], 0
    for ws in wbf.worksheets:
        wv = wbv[ws.title]
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    n_form += 1
                v = wv[c.coordinate].value
                if isinstance(v, str) and any(v.startswith(e) for e in ERROS):
                    achados.append(f"{ws.title}!{c.coordinate}={v}")
    return n_form, achados


# ---------------------------------------------------------------- python: comparativo
def pont_python(d, i, pesos=bp.PESOS, anoref=2026, reserva=0.10):
    """Reimplementa a pontuacao final do carro i (0-3); None se coluna vazia."""
    def g(k):
        return d.get(k, [None] * 4)[i]

    def ct(j):
        gg = lambda k: d.get(k, [None] * 4)[j]  # noqa: E731
        if gg("pp") is None:
            return None
        pc = gg("pn") if gg("pn") is not None else gg("pp")
        if gg("ct2"):
            return gg("ct2")
        return pc + (gg("transf") or 0) + (gg("rep") or 0) + pc * reserva
    if g("pp") is None:
        return None
    cts = [x for x in (ct(j) for j in range(4)) if x is not None]
    s1 = 10 * min(cts) / ct(i)
    kmano = g("km") / max(1, anoref - g("fab"))
    s2 = max(0, min(10, 10 - (kmano - 10000) / 2000))
    donos = g("donos")
    s3 = (0 if donos is None else 5 if donos <= 1 else 3 if donos == 2 else 1) + (5 if g("rev") == "S" else 0)
    lau = g("laudo")
    s4 = {"Aprovado": 10, "Aprovado com apontamentos": 6, "Não feito": 2, None: 2}.get(lau, 0)
    cons = [g(f"c{k}") for k in range(1, 6)]
    s5 = 0 if "Alerta" in cons else 2 * cons.count("OK")
    s6 = g("s6") or 0
    sc = {"s1": s1, "s2": s2, "s3": s3, "s4": s4, "s5": s5, "s6": s6}
    return sum(sc[k] * pesos[k] for k in pesos) / sum(pesos.values())


def bloqueado(d, i):
    cons = [d[f"c{k}"][i] for k in range(1, 6)]
    return d["laudo"][i] in ("Reprovado", "Inconclusivo") or "Alerta" in cons


def cenarios_comp():
    ex = copy.deepcopy(bp.EXEMPLO_COMP)
    c2 = copy.deepcopy(ex)  # 25% abaixo no carro 1
    c2["pp"][0] = 0.75 * c2["ref"][0]
    c2["pn"][0] = None
    c3 = copy.deepcopy(ex)  # carro 2 "perfeito" mas Reprovado: maior nota bruta, nao pode ganhar
    for k, v in {"pp": 50000, "pn": None, "ref": 51000, "km": 30000, "fab": 2021, "donos": 1, "rev": "S",
                 "laudo": "Reprovado", "s6": 10, "rep": 0}.items():
        c3[k][1] = v
    for k in range(1, 6):
        c3[f"c{k}"][1] = "OK"
    for j in (0, 2):
        c3["donos"][j] = 3
        c3["rev"][j] = "N"
        c3["s6"][j] = 2
        c3["laudo"][j] = "Não feito"
    c4 = copy.deepcopy(c3)  # igual, mas Inconclusivo + consultas com Alerta no carro 2
    c4["laudo"][1] = "Inconclusivo"
    c5 = copy.deepcopy(ex)  # carro 2 laudo Aprovado, mas Alerta em consulta -> fora
    c5["laudo"][1] = "Aprovado"
    c5["s6"][1] = 10
    c6 = copy.deepcopy(ex)  # todos bloqueados
    c6["laudo"] = ["Reprovado", "Inconclusivo", "Aprovado", None]
    c6["c3"][2] = "Alerta"
    c7 = {k: [None] * 4 for k in ex}  # modelo em branco
    c8 = copy.deepcopy(ex)  # 4 carros preenchidos, carro 4 = copia do carro 3 mais barato
    for k in c8:
        c8[k][3] = c8[k][2]
    c8["pn"][3] = 60000
    c8["apelido"][3] = "Hatch D 1.3 Flex"
    return [
        ("A Exemplo entregue", ex),
        ("B Preço 25% abaixo da referência", c2),
        ("C Carro 2 com maior nota bruta, laudo Reprovado", c3),
        ("D Carro 2 com maior nota bruta, laudo Inconclusivo", c4),
        ("E Carro 2 laudo Aprovado, mas Alerta em consulta", c5),
        ("F Todos com restrição", c6),
        ("G Modelo em branco", c7),
        ("H Quatro carros", c8),
    ]


# ---------------------------------------------------------------- python: custo
def pmt(i, n, pv):
    return pv / n if i == 0 else pv * i / (1 - (1 + i) ** -n)


def custo_python(d):
    fin = d["fin"] == "Sim"
    financiado = max(0, d["preco"] - (d["entrada"] or 0)) if fin else 0
    parcela = pmt(d["taxa"], d["n"], financiado) if fin and financiado and d["n"] else 0
    transf = sum(d[k] or 0 for k in ("vist_transf", "taxa_orgao", "firma", "despachante"))
    deb = sum(d[k] or 0 for k in ("ipva_deb", "lic_deb", "multas") if d[k + "_q"] == "Comprador")
    pos = sum(d[k] or 0 for k in ("oleo", "correia", "pneus", "freios", "reparos"))
    dia = (d["entrada"] if fin else d["preco"]) + transf + deb + d["cautelar"] + d["seg1"]
    ipva = d["preco"] * d["ipva_aliq"]
    comb = d["km_mes"] * d["comb_preco"] / d["consumo"]
    aquis = d["entrada"] + parcela * min(12, d["n"]) if fin and parcela else d["preco"]
    seg = max(d["seg_anual"] or 0, d["seg1"] or 0)
    ano1 = aquis + transf + deb + d["cautelar"] + pos + seg + ipva + (d["lic_anual"] or 0) + d["manut"] * 12 + comb * 12
    mensal = parcela + seg / 12 + ipva / 12 + (d["lic_anual"] or 0) / 12 + d["manut"] + comb + d["estac"] + d["outros"]
    return {"financiado": financiado, "parcela": parcela, "total_fin": parcela * d["n"],
            "custo_fin": parcela * d["n"] - financiado if parcela else 0, "sub_deb": deb, "dia": dia,
            "ano1": ano1, "reserva": d["preco"] * d["res_pct"], "mensal": mensal, "pct": mensal / d["renda"]}


def cenarios_custo():
    return [
        ("K1 Exemplo entregue (financiado 48x 1,9% a.m.)", {}),
        ("K2 Sem financiamento", {"fin": "Não"}),
        ("K3 Taxa 0% (12x)", {"taxa": 0, "n": 12}),
        ("K4 Débitos do comprador + taxas preenchidas + renda alta", {
            "ipva_deb": 1450.5, "ipva_deb_q": "Comprador", "lic_deb": 160, "lic_deb_q": "Comprador", "multas": 195.23,
            "multas_q": "Vendedor", "vist_transf": 100, "taxa_orgao": 250, "firma": 20, "despachante": 400,
            "lic_anual": 160, "renda": 20000}),
        ("K5 Financiamento 60x 2,49% a.m.", {"entrada": 10000, "n": 60, "taxa": 0.0249}),
    ]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="afn-verif-"))
    src, out = tmp / "src", tmp / "out"
    src.mkdir()
    out.mkdir()

    entregues = []
    for nome, fn in bp.ARQUIVOS:
        fn(src / nome)
        entregues.append(src / nome)
    comp = cenarios_comp()
    comp_paths = []
    R = None
    for k, (_, d) in enumerate(comp, 1):
        p = src / f"comp-{k}.xlsx"
        R = bp.build_comparativo(p, dados=d)
        comp_paths.append(p)
    cust = cenarios_custo()
    cust_paths = []
    meta = None
    for k, (_, d) in enumerate(cust, 1):
        p = src / f"custo-{k}.xlsx"
        meta = bp.build_custo(p, dados=d)
        cust_paths.append(p)
    rec = recalc(entregues + comp_paths + cust_paths, out)

    print("== Erros de fórmula (após recálculo LibreOffice)")
    for p in rec:
        n, err = varrer_erros(p)
        check(not err, f"{p.name}: {n} fórmulas, {len(err)} erros {err[:5]}")

    print("== Comparativo de veículos")
    rc = rec[len(entregues):len(entregues) + len(comp)]
    for (nome, d), p in zip(comp, rc):
        ws = load_workbook(p, data_only=True)["Comparar"]
        melhor = ws[f"B{R['melhor']}"].value or ""
        pont = [ws[f"{L}{R['pont']}"].value for L in bp.COLS]
        py = [pont_python(d, i) for i in range(4)]
        ok_p = all((a is None and b in (None, "")) or (isinstance(b, (int, float)) and abs(a - b) < 1e-9)
                   for a, b in zip(py, pont))
        restr = [ws[f"{L}{R['restr']}"].value for L in bp.COLS]
        ok_r = all((restr[i] == bp.NAO_REC) == bloqueado(d, i) for i in range(4) if d["pp"][i] is not None)
        elegiveis = [i for i in range(4) if d["pp"][i] is not None and not bloqueado(d, i)]
        if elegiveis:
            best = max(elegiveis, key=lambda i: (py[i], -i))
            esperado = bp.CARROS[best]
            ok_m = melhor.startswith(esperado + " ") or melhor.startswith(esperado + "  ")
        elif any(x is not None for x in d["pp"]):
            esperado = "Nenhum carro sem restrição"
            ok_m = melhor.startswith(esperado)
        else:
            esperado = "Preencha os dados"
            ok_m = melhor.startswith(esperado)
        bloq_nunca_ganha = all(not melhor.startswith(bp.CARROS[i] + " ") for i in range(4)
                               if d["pp"][i] is not None and bloqueado(d, i))
        check(ok_p and ok_r and ok_m and bloq_nunca_ganha,
              f"{nome}: melhor='{melhor}' (esperado {esperado}); pontuação planilha={[round(x, 3) if isinstance(x, float) else x for x in pont]}")
        if nome.startswith("B"):
            dif = ws[f"B{R['dif']}"].value
            al = ws[f"B{R['alerta']}"].value
            check(abs(dif + 0.25) < 1e-9 and al == bp.ALERTA_PRECO, f"   alerta com −25%: dif={dif:.2%} → '{al}'")
        if nome.startswith("A"):
            al = ws[f"C{R['alerta']}"].value
            difc = ws["C%d" % R["dif"]].value
            check(al == bp.ALERTA_PRECO, f"   exemplo: Carro 2 a {difc:.1%} → '{al}'")
        if nome[0] in "CD":
            check(max(p_ for p_ in py if p_ is not None) == py[1] and restr[1] == bp.NAO_REC,
                  f"   Carro 2 tem a maior nota bruta ({py[1]:.2f}) e está '{restr[1]}'")

    # alerta: limiar exato (-15% nao alerta; -15,1% alerta)
    print("== Limiar do alerta de preço")
    d = copy.deepcopy(bp.EXEMPLO_COMP)
    d["pn"] = [None] * 4
    d["pp"] = [0.85 * 59000, 0.849 * 61000, 1.11 * 63500, None]
    p = src / "comp-limiar.xlsx"
    bp.build_comparativo(p, dados=d)
    (q,) = recalc([p], out)
    ws = load_workbook(q, data_only=True)["Comparar"]
    al = [ws[f"{L}{R['alerta']}"].value for L in "BCD"]
    check(al == ["Dentro da faixa da referência", bp.ALERTA_PRECO, "Acima da referência: argumento para negociar"],
          f"−15,0% / −15,1% / +11%: {al}")

    print("== Custo total da compra")
    rk = rec[len(entregues) + len(comp):]
    Rc, Ro = meta["custo"], meta["orc"]
    for (nome, mod), p in zip(cust, rk):
        d = dict(bp.EXEMPLO_CUSTO)
        d.update(mod)
        py = custo_python(d)
        wb = load_workbook(p, data_only=True)
        ws, wo = wb["Custo total"], wb["Orçamento mensal"]
        got = {k: ws[f"B{Rc[k]}"].value for k in ("financiado", "parcela", "total_fin", "custo_fin", "sub_deb", "dia",
                                                   "ano1", "reserva")}
        got["mensal"] = wo[f"B{Ro['total']}"].value
        got["pct"] = wo[f"B{Ro['pct']}"].value
        difs = {k: (got[k], py[k]) for k in py if abs((got[k] or 0) - py[k]) > 1e-6}
        ind = wo[f"B{Ro['indic']}"].value
        ind_ok = ind.startswith("Acima") == (py["pct"] > d["limite"])
        check(not difs and ind_ok,
              f"{nome}: parcela={got['parcela']:.2f} (manual {py['parcela']:.2f}) dia={got['dia']:.2f} "
              f"1º ano={got['ano1']:.2f} mensal={got['mensal']:.2f} ({got['pct']:.1%}) → '{ind}' {difs or ''}")

    print(f"\nPasta de trabalho: {tmp}")
    print("RESULTADO:", "TUDO OK" if FALHAS == 0 else f"{FALHAS} FALHA(S)")
    sys.exit(1 if FALHAS else 0)


if __name__ == "__main__":
    main()
