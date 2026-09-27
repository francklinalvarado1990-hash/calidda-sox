#!/usr/bin/env python3
"""Prepara los datos del dashboard gerencial de GNLC (Cálidda) a partir de:

  fuentes/Saldos_GNLC_2026-08.xlsx        saldos contables mensualizados (solo cuentas de resultados)
  fuentes/Homologacion_EEFF_GNLC.xlsx     homologación cuenta -> estructura de EEFF

Genera:
  datos.json                               insumo del dashboard HTML
  Modelo_PowerBI_GNLC_2026-08.xlsx         modelo listo para Power BI (hechos, dimensiones, EERR gerencial, medidas DAX)

Convención de signo: la contabilidad trae ingresos en negativo (crédito) y gastos en positivo.
El "importe gerencial" invierte el signo: ingresos positivos, costos y gastos negativos,
de modo que cualquier subtotal se obtiene sumando.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
SALDOS = BASE / "fuentes" / "Saldos_GNLC_2026-08.xlsx"
HOMOLOG = BASE / "fuentes" / "Homologacion_EEFF_GNLC.xlsx"

MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
         "Septiembre", "Octubre", "Noviembre", "Diciembre"]
MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
ANIO = 2026


# --------------------------------------------------------------------------- carga
def cargar() -> tuple[pd.DataFrame, list[str]]:
    s = pd.read_excel(SALDOS)
    s = s[["Cuenta", "Descripción"] + MESES].copy()
    s[MESES] = s[MESES].fillna(0.0)
    dup = s[s["Cuenta"].duplicated(keep=False)]["Cuenta"].unique().tolist()
    if dup:
        print(f"Aviso: cuentas repetidas en el archivo de saldos, se consolidan sumando: {dup}")
        s = s.groupby(["Cuenta", "Descripción"], as_index=False, sort=False)[MESES].sum()
    # meses con movimiento (se detiene en el último mes con algún saldo distinto de cero)
    con_mov = [m for m in MESES if (s[m].abs() > 0.005).any()]
    meses = MESES[: MESES.index(con_mov[-1]) + 1]

    h = pd.read_excel(HOMOLOG, sheet_name="GNLC")
    h = h.drop(columns=["Empresa", "Descripción"]).drop_duplicates("Cuenta")
    m = s.merge(h, on="Cuenta", how="left")
    m["homologada"] = m["Estado Financiero"].notna()
    for c in ["Estado Financiero", "Elemento", "Sub-Elemento", "Rubro", "Sub-Cuenta",
              "Divisionaria", "Sub-Divisionaria"]:
        m[c] = m[c].fillna("Sin homologar")
    # importe gerencial (ingresos +, gastos -)
    for mes in meses:
        m[f"g_{mes}"] = -m[mes]
    m["ytd"] = m[[f"g_{x}" for x in meses]].sum(axis=1)
    return m, meses


# --------------------------------------------------------------------------- clasificación opex
NATURALEZA = [
    ("Personal", r"sueldos|gratificaci|bonificaci|participaci[oó]n de los trabajadores|cesant|vacaciones|"
                 r"seguro privado|seguro de vida|seguro complementario|^salud|auxilio educativo|atenciones al personal|"
                 r"capacitaci|indemnizaci|beneficios especiales|contratos de aprendizaje|remuneraciones|recargos lab|"
                 r"subsidio|subvenci|dotaci[oó]n|otros gastos de personal|gastos deportivos|head hunter|vi[aá]ticos|"
                 r"gastos de viaje"),
    ("Cobranza, facturación y comercial", r"cobranza|comercializaci|publicidad|comunicaciones y eventos"),
    ("Mantenimiento y O&M", r"mantenimiento|materiales, suministros y repuestos|otros contratos de servicios|"
                            r"estudios y proyectos"),
    ("Tecnología y comunicaciones", r"inform[aá]ticos|telecomunicaciones|telefon[ií]a|erp"),
    ("Honorarios y asesorías", r"honorarios|asesor[ií]as|consultor"),
    ("Regulación, tributos y sanciones", r"regulaci[oó]n|impuestos asumidos|multas|otros impuestos|impuesto a las ventas|"
                                         r"gravamen|contribuci[oó]n de solidaridad"),
    ("Seguros", r"multirriesgo|responsabilidad civil|todo riesgo|seguros de veh|infidelidad"),
    ("Arrendamientos (NIIF 16)", r"arrendamiento"),
    ("Ingresos operativos con vinculados", r"^ingresos no oper|^ingresos no operac|^veh[ií]culos"),
]


def naturaleza(desc: str) -> str:
    d = desc.lower()
    for nombre, patron in NATURALEZA:
        if re.search(patron, d):
            return nombre
    return "Servicios generales y otros"


def funcion(cuenta: int) -> str:
    p = str(cuenta)[:2]
    return {"51": "Administración", "52": "Comercial", "71": "Operación y mantenimiento",
            "42": "Ingresos con vinculados", "53": "Gastos bancarios", "54": "Otros gastos"}.get(p, "Otros")


# --------------------------------------------------------------------------- estructura gerencial
def serie(df: pd.DataFrame, meses: list[str]) -> list[float]:
    return [round(float(df[f"g_{x}"].sum()), 2) for x in meses]


def linea(id_: str, nombre: str, df: pd.DataFrame, meses: list[str], tipo: str, nivel: int,
          hijos: list | None = None, nota: str | None = None, cuentas: int | None = None) -> dict:
    vals = serie(df, meses)
    out = {"id": id_, "nombre": nombre, "tipo": tipo, "nivel": nivel, "valores": vals,
           "ytd": round(sum(vals), 2), "cuentas": int(df["Cuenta"].nunique()) if cuentas is None else cuentas}
    if hijos:
        out["hijos"] = hijos
    if nota:
        out["nota"] = nota
    return out


def subtotal(id_: str, nombre: str, partes: list[dict], meses: list[str], tipo: str, nivel: int = 0,
             hijos: list | None = None, nota: str | None = None) -> dict:
    vals = [round(sum(p["valores"][i] for p in partes), 2) for i in range(len(meses))]
    out = {"id": id_, "nombre": nombre, "tipo": tipo, "nivel": nivel, "valores": vals,
           "ytd": round(sum(vals), 2)}
    if hijos:
        out["hijos"] = hijos
    if nota:
        out["nota"] = nota
    return out


def cuentas_de(df: pd.DataFrame, meses: list[str], top: int | None = None) -> list[dict]:
    g = (df.groupby(["Cuenta", "Descripción"], as_index=False)[[f"g_{x}" for x in meses]].sum())
    g["ytd"] = g[[f"g_{x}" for x in meses]].sum(axis=1)
    g = g[g["ytd"].abs() > 0.5].sort_values("ytd", key=lambda s: s.abs(), ascending=False)
    if top:
        g = g.head(top)
    return [{"id": f"c{int(r.Cuenta)}", "nombre": f"{int(r.Cuenta)} · {r.Descripción}", "tipo": "cuenta",
             "nivel": 3, "valores": [round(float(getattr(r, f"g_{x}")), 2) for x in meses],
             "ytd": round(float(r.ytd), 2)} for r in g.itertuples()]


def construir(m: pd.DataFrame, meses: list[str]) -> dict:
    sd = lambda *keys: m[m["Sub-Divisionaria"].isin(keys)]  # noqa: E731

    # ---- ingresos
    ing_dist = linea("i_dist", "Distribución de gas", sd("2Distribución"), meses, "ingreso", 1,
                     hijos=cuentas_de(sd("2Distribución"), meses),
                     nota="Ingreso regulado por distribución. Incluye la contraprestación pagada a clientes "
                          "(NIIF 15.70) como menor ingreso.")
    ing_fin = linea("i_fin", "Financiación a clientes (intereses)", sd("6Intereses préstamos clientes"), meses,
                    "ingreso", 1, hijos=cuentas_de(sd("6Intereses préstamos clientes"), meses, top=8),
                    nota="Intereses de financiamiento no bancario (FNB) y otras cuentas por cobrar a clientes.")
    ing_inst = linea("i_inst", "Instalaciones internas y acometidas", sd("3Instalaciones"), meses, "ingreso", 1,
                     hijos=cuentas_de(sd("3Instalaciones"), meses))
    ing_dcx = linea("i_dcx", "Derechos de conexión", sd("4Derechos de Conexión"), meses, "ingreso", 1)
    ing_reub = linea("i_reub", "Reubicaciones", sd("5Ingresos por reubicaciones"), meses, "ingreso", 1)
    ing_merc = linea("i_merc", "Venta de mercaderías", sd("7Ventas de Mercaderias"), meses, "ingreso", 1)
    ing_otros = linea("i_otros", "Otros ingresos operativos", sd("8Otros ingresos"), meses, "ingreso", 1,
                      hijos=cuentas_de(sd("8Otros ingresos"), meses, top=8))
    ing_amp = linea("i_amp", "Ampliación de red (construcción CINIIF 12)", sd("9Ingreso por ampliación de la Red"),
                    meses, "ingreso", 1,
                    nota="Servicios de construcción de la red concesionada, reconocidos al costo (margen cero).")
    ing_netos = subtotal("i_netos", "Ingresos por distribución y servicios", [
        ing_dist, ing_fin, ing_inst, ing_dcx, ing_reub, ing_merc, ing_otros, ing_amp], meses, "subtotal", 0,
        hijos=[ing_dist, ing_fin, ing_inst, ing_dcx, ing_reub, ing_merc, ing_otros, ing_amp],
        nota="Excluye el gas natural y su transporte, que se facturan sin margen (pass-through).")
    ing_gas = linea("i_gas", "Gas natural y transporte (pass-through)", sd("1Gas y Transporte"), meses, "ingreso", 1,
                    hijos=cuentas_de(sd("1Gas y Transporte"), meses),
                    nota="Venta de gas y transporte a clientes regulados. El costo es idéntico cada mes: margen cero.")
    ing_tot = subtotal("i_tot", "Ingresos totales", [ing_netos, ing_gas], meses, "total", 0, hijos=[ing_gas])

    # ---- costos
    c_gas = linea("c_gas", "Costo de gas natural y transporte", sd("1Cost Gas y Transp"), meses, "costo", 1,
                  hijos=cuentas_de(sd("1Cost Gas y Transp"), meses))
    c_inst = linea("c_inst", "Costo de instalaciones y acometidas", sd("3Cost Instalaciones"), meses, "costo", 1,
                   hijos=cuentas_de(sd("3Cost Instalaciones"), meses))
    c_reub = linea("c_reub", "Costo de reubicaciones", sd("5Costo de reubicación"), meses, "costo", 1)
    c_merc = linea("c_merc", "Costo de mercaderías", sd("7Costo de venta de mercaderias"), meses, "costo", 1)
    c_otros = linea("c_otros", "Otros costos de servicios", sd("8Otros costos"), meses, "costo", 1,
                    hijos=cuentas_de(sd("8Otros costos"), meses))
    c_amp = linea("c_amp", "Costo de ampliación de red", sd("9Costo de venta por ampliación de la Red"), meses,
                  "costo", 1)
    c_tot = subtotal("c_tot", "Costo de ventas y servicios", [c_gas, c_inst, c_reub, c_merc, c_otros, c_amp], meses,
                     "subtotal", 0, hijos=[c_gas, c_inst, c_reub, c_merc, c_otros, c_amp])
    mb = subtotal("mb", "Margen bruto", [ing_tot, c_tot], meses, "margen", 0)

    # ---- gastos operativos
    op = m[m["Sub-Divisionaria"] == "Operativos"].copy()
    op["funcion"] = op["Cuenta"].map(funcion)
    op["naturaleza"] = op["Descripción"].map(naturaleza)
    g_func = []
    for f in ["Administración", "Comercial", "Operación y mantenimiento", "Gastos bancarios", "Otros gastos",
              "Ingresos con vinculados"]:
        sub = op[op["funcion"] == f]
        if len(sub):
            fid = "g_" + re.sub(r"\W+", "_", f.lower())
            g_func.append(linea(fid, f, sub, meses, "gasto", 2,
                                hijos=cuentas_de(sub, meses, top=12)))
    g_op = linea("g_op", "Gastos operativos", op, meses, "gasto", 1, hijos=g_func,
                 nota="Gastos de administración, comerciales y de operación y mantenimiento, por función.")
    g_inc = linea("g_inc", "Provisión por incobrables (NIIF 9)", sd("Provision incobrables"), meses, "gasto", 1,
                  nota="Pérdida crediticia esperada sobre cuentas por cobrar comerciales y financiadas.")
    g_cont = linea("g_cont", "Provisión por contingencias legales (NIC 37)", sd("Provision contingencias legales"),
                   meses, "gasto", 1)
    ebitda = subtotal("ebitda", "EBITDA", [mb, g_op, g_inc, g_cont], meses, "margen", 0)

    # ---- bajo el EBITDA
    da = linea("da", "Depreciación y amortización", sd("Amortización", "Depreciacion"), meses, "gasto", 1,
               hijos=[linea("da_am", "Amortización de intangibles (concesión, CINIIF 12)", sd("Amortización"), meses,
                            "gasto", 2),
                      linea("da_dp", "Depreciación de propiedad, planta y equipo", sd("Depreciacion"), meses,
                            "gasto", 2)])
    fin = linea("fin", "Resultado financiero neto", sd("Financieros"), meses, "gasto", 1,
                hijos=cuentas_de(sd("Financieros"), meses, top=8))
    dc = linea("dc", "Diferencia en cambio (NIC 21)", sd("Dif en cambio"), meses, "gasto", 1)
    cob = linea("cob", "Coberturas de tipo de cambio", sd("Cobertura"), meses, "gasto", 1,
                hijos=cuentas_de(sd("Cobertura"), meses))
    vpp = linea("vpp", "Participación en subsidiaria (Cálidda Energía)", sd("VPP CENE"), meses, "gasto", 1)
    uai = subtotal("uai", "Utilidad antes de impuesto a la renta", [ebitda, da, fin, dc, cob, vpp], meses, "margen", 0)
    imp_cte = m[m["Cuenta"].isin([6105050000, 6105050100])]
    imp_dif = m[m["Cuenta"] == 6105100000]
    imp = linea("imp", "Impuesto a la renta (NIC 12)", sd("Impuesto"), meses, "gasto", 1,
                hijos=[linea("imp_c", "Corriente", imp_cte, meses, "gasto", 2),
                       linea("imp_d", "Diferido", imp_dif, meses, "gasto", 2)])
    un = subtotal("un", "Utilidad neta", [uai, imp], meses, "total", 0)

    lineas = [ing_netos, ing_gas, ing_tot, c_tot, mb, g_op, g_inc, g_cont, ebitda, da, fin, dc, cob, vpp, uai, imp, un]

    # ---- opex por naturaleza y por función (para gráficos)
    nat = (op.groupby("naturaleza")[[f"g_{x}" for x in meses]].sum())
    nat["ytd"] = nat.sum(axis=1)
    nat = nat.sort_values("ytd")
    opex_nat = [{"nombre": n, "valores": [round(float(r[f"g_{x}"]), 2) for x in meses], "ytd": round(float(r.ytd), 2)}
                for n, r in nat.iterrows()]
    opex_top = []
    t = op.groupby(["Cuenta", "Descripción", "funcion", "naturaleza"], as_index=False)[[f"g_{x}" for x in meses]].sum()
    t["ytd"] = t[[f"g_{x}" for x in meses]].sum(axis=1)
    for r in t.sort_values("ytd").head(20).itertuples():
        opex_top.append({"cuenta": int(r.Cuenta), "nombre": r.Descripción, "funcion": r.funcion,
                         "naturaleza": r.naturaleza,
                         "valores": [round(float(getattr(r, f"g_{x}")), 2) for x in meses],
                         "ytd": round(float(r.ytd), 2)})

    # ---- diferencia en cambio: flujos brutos
    dcx = m[m["Sub-Divisionaria"] == "Dif en cambio"]
    gan = dcx[dcx["Cuenta"].astype(str).str.startswith("44")]
    per = dcx[dcx["Cuenta"].astype(str).str.startswith("55")]
    dif_cambio = {"ganancias": serie(gan, meses), "perdidas": serie(per, meses),
                  "ganancia_bruta_ytd": round(float(gan["ytd"].sum()), 2),
                  "perdida_bruta_ytd": round(float(per["ytd"].sum()), 2)}

    # ---- calidad de datos
    sin_hom = m[~m["homologada"]]
    dup = m[m["Cuenta"].duplicated(keep=False)]
    calidad = {
        "cuentas_total": int(m["Cuenta"].nunique()),
        "filas_total": int(len(m)),
        "sin_homologar": [{"cuenta": int(r.Cuenta), "descripcion": r.Descripción, "ytd": round(float(r.ytd), 2)}
                          for r in sin_hom.itertuples()],
        "duplicadas": [{"cuenta": int(r.Cuenta), "descripcion": r.Descripción, "ytd": round(float(r.ytd), 2)}
                       for r in dup.itertuples()],
        "solo_resultados": bool((m["Estado Financiero"] != "Estado de Situación Financiera").all()),
        "meses_con_datos": len(meses),
        "control_utilidad_neta": {  # la suma de todas las cuentas debe coincidir con la utilidad neta
            "suma_cuentas": [round(float(m[f"g_{x}"].sum()), 2) for x in meses],
            "utilidad_neta": un["valores"]},
    }

    # ---- detalle por cuenta (anexo)
    det = m.groupby(["Cuenta", "Descripción", "Rubro", "Sub-Cuenta", "Sub-Divisionaria"], as_index=False)[
        [f"g_{x}" for x in meses]].sum()
    det["ytd"] = det[[f"g_{x}" for x in meses]].sum(axis=1)
    det = det[det["ytd"].abs() > 0.5].sort_values("ytd", key=lambda s: s.abs(), ascending=False)
    cuentas = [{"c": int(r.Cuenta), "d": r.Descripción, "r": r.Rubro, "s": r._4, "g": r._5,
                "v": [round(float(getattr(r, f"g_{x}")), 0) for x in meses], "y": round(float(r.ytd), 0)}
               for r in det.itertuples()]

    return {
        "meta": {"empresa": "Gas Natural de Lima y Callao S.A. (Cálidda)", "sigla": "GNLC", "anio": ANIO,
                 "periodo": f"{meses[-1]} {ANIO}", "moneda": "US$", "meses": meses,
                 "meses_cortos": MES_CORTO[: len(meses)], "generado": date.today().isoformat()},
        "lineas": lineas,
        "opex_naturaleza": opex_nat,
        "opex_top": opex_top,
        "dif_cambio": dif_cambio,
        "calidad": calidad,
        "cuentas": cuentas,
    }


# --------------------------------------------------------------------------- modelo Power BI
DAX = """\
Tabla de medidas sugeridas (crear en Power BI Desktop, tabla 'Medidas').
El importe gerencial ya viene con signo: ingresos +, gastos -. Los subtotales son sumas.

Importe = SUM ( Hechos[ImporteGerencial] )

Ingresos totales = CALCULATE ( [Importe], DimCuenta[Divisionaria] = "Ingresos" )
Ingresos netos = CALCULATE ( [Importe], DimCuenta[Divisionaria] = "Ingresos",
    DimCuenta[Sub-Divisionaria] <> "1Gas y Transporte" )
Costo de ventas = CALCULATE ( [Importe], DimCuenta[Divisionaria] = "Costos" )
Margen bruto = CALCULATE ( [Importe], DimCuenta[Sub-Cuenta] = "Margen Bruto" )
Gastos operativos = CALCULATE ( [Importe], DimCuenta[Sub-Divisionaria] = "Operativos" )
Provisión incobrables = CALCULATE ( [Importe], DimCuenta[Sub-Cuenta] = "Provision incobrables" )
EBITDA = CALCULATE ( [Importe], DimCuenta[Rubro] = "EBIDTA" )
Margen EBITDA % = DIVIDE ( [EBITDA], [Ingresos netos] )
Depreciación y amortización = CALCULATE ( [Importe], DimCuenta[Rubro] = "Depreciacion y amortización" )
Resultado financiero = CALCULATE ( [Importe], DimCuenta[Rubro] = "Financieros neto" )
Utilidad antes de impuestos = CALCULATE ( [Importe], DimCuenta[Sub-Elemento] = "Utilidad antes de impuesto" )
Impuesto a la renta = CALCULATE ( [Importe], DimCuenta[Rubro] = "Impuesto a la renta" )
Utilidad neta = CALCULATE ( [Importe], DimCuenta[Elemento] = "Utilidad Neta" )
Tasa efectiva % = DIVIDE ( -[Impuesto a la renta], [Utilidad antes de impuestos] )

Importe YTD = TOTALYTD ( [Importe], DimFecha[Fecha] )
Importe mes anterior = CALCULATE ( [Importe], DATEADD ( DimFecha[Fecha], -1, MONTH ) )
Var vs mes anterior = [Importe] - [Importe mes anterior]
Var vs mes anterior % = DIVIDE ( [Var vs mes anterior], ABS ( [Importe mes anterior] ) )

Relaciones: Hechos[Cuenta] -> DimCuenta[Cuenta] (muchos a uno); Hechos[Fecha] -> DimFecha[Fecha] (muchos a uno).
Marcar DimFecha como tabla de fechas. Para el EERR gerencial usar la matriz con DimCuenta[Orden] y
DimCuenta[Nivel1..Nivel3] como filas y la medida [Importe] o [Importe YTD] como valores.
"""


def modelo_powerbi(m: pd.DataFrame, meses: list[str], datos: dict, destino: Path) -> None:
    filas = []
    for r in m.itertuples():
        for i, mes in enumerate(meses):
            v = float(getattr(r, mes))
            if abs(v) < 0.005:
                continue
            filas.append({"Fecha": date(ANIO, i + 1, 1), "Cuenta": int(r.Cuenta), "Descripción": r.Descripción,
                          "ImporteContable": round(v, 2), "ImporteGerencial": round(-v, 2)})
    hechos = pd.DataFrame(filas)

    h = pd.read_excel(HOMOLOG, sheet_name="GNLC").drop_duplicates("Cuenta")
    h["Nivel1"] = h["Elemento"]
    h["Nivel2"] = h["Rubro"]
    h["Nivel3"] = h["Sub-Divisionaria"].fillna(h["Sub-Cuenta"])
    h["Función (opex)"] = h["Cuenta"].map(funcion)
    h["Naturaleza (opex)"] = h["Descripción"].map(naturaleza)
    h.loc[h["Sub-Divisionaria"] != "Operativos", ["Función (opex)", "Naturaleza (opex)"]] = None
    dim_cuenta = h

    fechas = pd.DataFrame({"Fecha": [date(ANIO, i + 1, 1) for i in range(12)]})
    fechas["Año"] = ANIO
    fechas["MesNum"] = range(1, 13)
    fechas["Mes"] = MESES
    fechas["MesCorto"] = MES_CORTO
    fechas["Trimestre"] = ["T" + str((i // 3) + 1) for i in range(12)]

    # EERR gerencial en miles de dólares
    eerr = []

    def volcar(l: dict, nivel: int) -> None:
        eerr.append({"Concepto": ("    " * nivel) + l["nombre"], "Tipo": l["tipo"],
                     **{MES_CORTO[i]: round(l["valores"][i] / 1000, 1) for i in range(len(meses))},
                     "YTD": round(l["ytd"] / 1000, 1)})
        for hijo in l.get("hijos", []):
            if hijo["tipo"] != "cuenta":
                volcar(hijo, nivel + 1)

    for l in datos["lineas"]:
        volcar(l, 0)
    eerr_df = pd.DataFrame(eerr)

    with pd.ExcelWriter(destino, engine="openpyxl") as xw:
        hechos.to_excel(xw, sheet_name="Hechos", index=False)
        dim_cuenta.to_excel(xw, sheet_name="DimCuenta", index=False)
        fechas.to_excel(xw, sheet_name="DimFecha", index=False)
        eerr_df.to_excel(xw, sheet_name="EERR_Gerencial_miles", index=False)
        pd.DataFrame({"Medidas DAX": DAX.splitlines()}).to_excel(xw, sheet_name="Medidas_DAX", index=False)
        for ws in xw.book.worksheets:
            for col in ws.columns:
                ancho = min(60, max(10, max(len(str(c.value)) if c.value is not None else 0 for c in col) + 2))
                ws.column_dimensions[col[0].column_letter].width = ancho
            ws.freeze_panes = "A2"


def main() -> None:
    m, meses = cargar()
    datos = construir(m, meses)
    (BASE / "datos.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    modelo_powerbi(m, meses, datos, BASE / f"Modelo_PowerBI_GNLC_{ANIO}-{len(meses):02d}.xlsx")
    # dashboard HTML: la plantilla lleva los datos embebidos para funcionar sin servidor
    plantilla = (BASE / "plantilla_dashboard.html").read_text(encoding="utf-8")
    js = json.dumps(datos, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    (BASE / f"Dashboard_GNLC_{ANIO}-{len(meses):02d}.html").write_text(plantilla.replace("__DATOS__", js), encoding="utf-8")
    un = next(l for l in datos["lineas"] if l["id"] == "un")
    ctl = datos["calidad"]["control_utilidad_neta"]
    ok = all(abs(a - b) < 1 for a, b in zip(ctl["suma_cuentas"], ctl["utilidad_neta"]))
    print(f"Meses con datos: {meses[0]}–{meses[-1]} ({len(meses)})")
    print(f"Utilidad neta YTD: {un['ytd']:,.0f}  | control suma de cuentas = utilidad neta: {'OK' if ok else 'ERROR'}")
    print(f"Cuentas sin homologar: {len(datos['calidad']['sin_homologar'])}")


if __name__ == "__main__":
    main()
