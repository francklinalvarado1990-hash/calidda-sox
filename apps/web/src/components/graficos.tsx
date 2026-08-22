import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { nombreMes } from '../lib/formato';

/**
 * Decisiones de visualizacion (paleta validada para daltonismo):
 *
 * - Cada grafico usa UNA sola serie, por lo que basta un unico tono azul y no
 *   hace falta leyenda: el titulo nombra la serie.
 * - No se combinan verde y rojo dentro de un mismo grafico: ese par no supera
 *   la separacion minima bajo deuteranopia (ΔE 4.1). El semaforo de estado vive
 *   en las insignias, donde siempre va acompanado de icono y etiqueta.
 * - Un solo eje por grafico; nunca dos escalas superpuestas.
 */

/** Lee los tokens de color del tema activo y reacciona al cambio claro/oscuro. */
function useTokens() {
  const leer = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string, def: string) => s.getPropertyValue(n).trim() || def;
    return {
      dato: v('--dato', '#2a78d6'),
      datoSuave: v('--dato-suave', '#cde2fb'),
      grid: v('--linea', '#e1e0d9'),
      eje: v('--linea-fuerte', '#c3c2b7'),
      mudo: v('--ink-mudo', '#898781'),
      ink: v('--ink', '#0b0b0b'),
      ink2: v('--ink-2', '#52514e'),
      superficie: v('--superficie', '#fcfcfb'),
    };
  };

  const [tokens, setTokens] = useState(leer);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => setTokens(leer());
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return tokens;
}

function CajaTooltip({ titulo, filas }: { titulo: string; filas: [string, string][] }) {
  const t = useTokens();
  return (
    <div
      style={{
        background: t.superficie, border: `1px solid ${t.eje}`, borderRadius: 6,
        padding: '9px 12px', fontSize: 13, color: t.ink, boxShadow: '0 4px 14px rgba(0,0,0,.14)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{titulo}</div>
      {filas.map(([k, v]) => (
        <div key={k} style={{ color: t.ink2, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span>{k}</span>
          <strong style={{ color: t.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</strong>
        </div>
      ))}
    </div>
  );
}

export interface PuntoTendencia {
  anio: number; mes: number; etiqueta: string;
  total: number; completos: number; vencidos: number;
  cumplimiento: number | null;
}

/** Tendencia de cumplimiento mensual: una serie, eje 0-100. */
export function GraficoTendencia({ datos }: { datos: PuntoTendencia[] }) {
  const t = useTokens();
  // Solo los meses con periodo aperturado. Dibujar los meses sin datos deja
  // huecos en la linea que se leen como caidas de cumplimiento inexistentes.
  const conDato = datos.filter((d) => d.cumplimiento !== null);

  if (!conDato.length) {
    return <div className="vacio">Aún no hay periodos con datos para construir la tendencia.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={conDato} margin={{ top: 16, right: 22, left: -18, bottom: 4 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="etiqueta" tick={{ fill: t.mudo, fontSize: 11.5 }}
          axisLine={{ stroke: t.eje }} tickLine={false}
          interval="preserveStartEnd" minTickGap={26}
        />
        <YAxis
          domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%"
          tick={{ fill: t.mudo, fontSize: 11.5 }} axisLine={false} tickLine={false}
        />
        <Tooltip
          cursor={{ stroke: t.eje, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as PuntoTendencia | undefined;
            if (!active || !p) return null;
            return (
              <CajaTooltip
                titulo={`${nombreMes(p.mes)} ${p.anio}`}
                filas={[
                  ['Cumplimiento', p.cumplimiento === null ? 'sin datos' : `${p.cumplimiento}%`],
                  ['Completos', `${p.completos} de ${p.total}`],
                  ['Vencidos', String(p.vencidos)],
                ]}
              />
            );
          }}
        />
        <Line
          type="linear" dataKey="cumplimiento" stroke={t.dato} strokeWidth={2}
          dot={{ r: 4, fill: t.dato, stroke: t.superficie, strokeWidth: 2 }}
          activeDot={{ r: 6, fill: t.dato, stroke: t.superficie, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface BarraProceso {
  proceso: string; codigo: string; total: number; completos: number; vencidos: number; cumplimiento: number;
}

/** Avance por proceso: barras horizontales, ordenadas de menor a mayor avance. */
export function GraficoProcesos({ datos }: { datos: BarraProceso[] }) {
  const t = useTokens();
  if (!datos.length) return <div className="vacio">No hay controles instanciados en el periodo.</div>;

  const altura = Math.max(180, datos.length * 34 + 30);

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 46, left: 6, bottom: 4 }}>
        <CartesianGrid stroke={t.grid} horizontal={false} />
        <XAxis
          type="number" domain={[0, 100]} unit="%" ticks={[0, 25, 50, 75, 100]}
          tick={{ fill: t.mudo, fontSize: 11.5 }} axisLine={{ stroke: t.eje }} tickLine={false}
        />
        <YAxis
          type="category" dataKey="codigo" width={62}
          tick={{ fill: t.ink2, fontSize: 12 }} axisLine={false} tickLine={false}
        />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as BarraProceso | undefined;
            if (!active || !p) return null;
            return (
              <CajaTooltip
                titulo={p.proceso}
                filas={[
                  ['Cumplimiento', `${p.cumplimiento}%`],
                  ['Completos', `${p.completos} de ${p.total}`],
                  ['Vencidos', String(p.vencidos)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="cumplimiento" fill={t.dato} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
          <LabelList
            dataKey="cumplimiento" position="right"
            formatter={(v: number) => `${v}%`}
            style={{ fill: t.ink2, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface BarraEstado { estado: string; etiqueta: string; cantidad: number; destacar: boolean }

/**
 * Distribucion por estado. Es una magnitud por categoria, no una composicion,
 * asi que usa un solo tono; los estados criticos se marcan con un tono mas
 * intenso del mismo azul y quedan siempre etiquetados con su nombre.
 */
export function GraficoEstados({ datos }: { datos: BarraEstado[] }) {
  const t = useTokens();
  if (!datos.length) return <div className="vacio">Sin datos en el periodo.</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 32 + 24)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 40, left: 6, bottom: 4 }}>
        <CartesianGrid stroke={t.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: t.mudo, fontSize: 11.5 }} axisLine={{ stroke: t.eje }} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="etiqueta" width={124} tick={{ fill: t.ink2, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as BarraEstado | undefined;
            if (!active || !p) return null;
            return <CajaTooltip titulo={p.etiqueta} filas={[['Controles', String(p.cantidad)]]} />;
          }}
        />
        <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
          {datos.map((d) => (
            <Cell key={d.estado} fill={d.destacar ? t.dato : t.datoSuave} />
          ))}
          <LabelList
            dataKey="cantidad" position="right"
            style={{ fill: t.ink2, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
