import type { ReactNode } from 'react';
import { TONO_ESTADO, TONO_PERIODO } from '../lib/formato';
import type { EstadoEjecucion, EstadoPeriodo } from '../lib/tipos';

export function Insignia({ tono, children }: { tono: string; children: ReactNode }) {
  return <span className={`insignia insignia--${tono}`}>{children}</span>;
}

/** Estado de un control: icono + texto, nunca color solo. */
export function EstadoControl({ estado }: { estado: EstadoEjecucion }) {
  const e = TONO_ESTADO[estado];
  return (
    <Insignia tono={e.tono}>
      <span aria-hidden="true">{e.icono}</span>
      {e.texto}
    </Insignia>
  );
}

export function EstadoDelPeriodo({ estado }: { estado: EstadoPeriodo }) {
  const e = TONO_PERIODO[estado];
  return (
    <Insignia tono={e.tono}>
      <span aria-hidden="true">{e.icono}</span>
      {e.texto}
    </Insignia>
  );
}

export function Tarjeta({
  titulo, subtitulo, acciones, children,
}: {
  titulo?: string; subtitulo?: string; acciones?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="tarjeta">
      {titulo && (
        <div className="tarjeta__titulo">
          <h2>{titulo}</h2>
          {acciones}
        </div>
      )}
      {subtitulo && <p className="tarjeta__sub">{subtitulo}</p>}
      {children}
    </section>
  );
}

/**
 * Cifra destacada. El valor va siempre en texto: el medidor de color es un
 * refuerzo visual, no la unica forma de leer el dato.
 */
export function Kpi({
  etiqueta, valor, pie, tono, medidor,
}: {
  etiqueta: string; valor: string | number; pie?: string;
  tono?: 'ok' | 'critico'; medidor?: number;
}) {
  const clase = medidor === undefined ? '' : medidor >= 90 ? '' : medidor >= 60 ? ' medidor__relleno--medio' : ' medidor__relleno--bajo';
  return (
    <div className={`tarjeta ${tono ? `kpi--${tono}` : ''}`}>
      <div className="kpi__etiqueta">{etiqueta}</div>
      <div className="kpi__valor">{valor}</div>
      {pie && <div className="kpi__pie">{pie}</div>}
      {medidor !== undefined && (
        <div className="medidor" role="img" aria-label={`Avance ${medidor}%`}>
          <div className={`medidor__relleno${clase}`} style={{ width: `${Math.min(100, medidor)}%` }} />
        </div>
      )}
    </div>
  );
}

export function Aviso({ tono = 'info', children }: { tono?: string; children: ReactNode }) {
  return <div className={`aviso aviso--${tono}`}>{children}</div>;
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="cargando">{texto}</div>;
}

export function Vacio({ texto }: { texto: string }) {
  return <div className="vacio">{texto}</div>;
}

export function Modal({
  titulo, onCerrar, pie, children,
}: {
  titulo: string; onCerrar: () => void; pie?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="velo" onClick={onCerrar} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__cab">
          <h2>{titulo}</h2>
          <button className="btn btn--sm" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal__cuerpo">{children}</div>
        {pie && <div className="modal__pie">{pie}</div>}
      </div>
    </div>
  );
}
