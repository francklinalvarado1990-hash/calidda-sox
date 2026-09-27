# Resultados gerenciales GNLC (Cálidda) · agosto 2026

Dashboard gerencial del estado de resultados mensualizado de Gas Natural de Lima y Callao S.A.,
construido a partir de los saldos contables y del archivo de homologación de EEFF.

## Contenido

| Archivo | Qué es |
|---|---|
| `Dashboard_GNLC_2026-08.html` | Dashboard interactivo (un solo archivo, sin servidor): KPIs, EERR gerencial expandible, puente de resultados, ingresos por línea, márgenes, gastos por función y naturaleza, provisión por incobrables, partidas bajo el EBITDA, hallazgos con plan de acción, notas NIIF y anexo por cuenta. |
| `Modelo_PowerBI_GNLC_2026-08.xlsx` | Modelo listo para Power BI: `Hechos` (largo, una fila por cuenta y mes), `DimCuenta` (homologación + función y naturaleza del gasto), `DimFecha`, `EERR_Gerencial_miles` y `Medidas_DAX`. |
| `datos.json` | Datos agregados que alimentan el dashboard. |
| `preparar_datos.py` | Script que lee `fuentes/`, arma la estructura gerencial, y genera el JSON, el modelo Power BI y el HTML. |
| `plantilla_dashboard.html` | Plantilla del dashboard (el script inserta los datos en `__DATOS__`). |
| `fuentes/` | Saldos mensualizados y homologación recibidos de contabilidad. |

## Actualizar con un nuevo mes

1. Reemplazar `fuentes/Saldos_GNLC_2026-08.xlsx` por el archivo del nuevo cierre (misma estructura: `Cuenta`, `Descripción`, `Enero`…`Diciembre`). Si cambia el nombre, ajustar `SALDOS` en el script.
2. Si hay cuentas nuevas, agregarlas a `fuentes/Homologacion_EEFF_GNLC.xlsx` (hoja `GNLC`).
3. Ejecutar:

```bash
pip install pandas openpyxl
python3 preparar_datos.py
```

El script detecta automáticamente hasta qué mes hay movimiento, valida que la suma de todas las
cuentas coincida con la utilidad neta de cada mes y lista las cuentas sin homologar.

## Convenciones

- **Signo.** Los saldos contables traen ingresos en negativo. El importe gerencial invierte el signo
  (ingresos +, gastos −), por lo que todo subtotal es una suma.
- **Base de los indicadores.** Los márgenes se calculan sobre los *ingresos por distribución y
  servicios*, que excluyen la venta de gas y su transporte (pass-through con margen cero).
- **Gastos operativos.** Función por prefijo de cuenta (51 administración, 52 comercial,
  71 operación y mantenimiento); naturaleza por palabras clave de la descripción (ver `NATURALEZA`
  en el script; ajustar allí si se desea otra agrupación).

## Power BI

1. Obtener datos → Excel → seleccionar las hojas `Hechos`, `DimCuenta` y `DimFecha`.
2. Relaciones: `Hechos[Cuenta] → DimCuenta[Cuenta]` y `Hechos[Fecha] → DimFecha[Fecha]`; marcar
   `DimFecha` como tabla de fechas.
3. Crear las medidas de la hoja `Medidas_DAX` (Importe, Ingresos netos, Margen bruto, EBITDA,
   Utilidad neta, YTD, variación mensual, tasa efectiva).
4. Matriz del EERR: filas `DimCuenta[Nivel1]`, `[Nivel2]`, `[Nivel3]` ordenadas por `Orden`;
   valores `[Importe]` y `[Importe YTD]`; segmentador por `DimFecha[Mes]`.

## Alcance

El archivo de saldos solo contiene cuentas de resultados; no incluye estado de situación
financiera, por lo que el tablero no calcula liquidez, apalancamiento ni días de cobro.
