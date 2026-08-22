import { useState } from 'react';
import { useSesion } from '../lib/sesion';
import { ErrorApi, api } from '../lib/api';
import { Aviso } from '../components/ui';

/**
 * Ingreso. Si el rol exige doble factor y el usuario aun no lo configuro, la
 * misma pantalla lo guia por el enrolamiento: no se le deja fuera del sistema.
 */
export default function Ingreso() {
  const { entrar, refrescarUsuario } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigoMfa, setCodigoMfa] = useState('');
  const [pideMfa, setPideMfa] = useState(false);
  const [enrolando, setEnrolando] = useState<{ secreto: string; otpauth: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const usuario = await entrar(email, password, codigoMfa || undefined);
      if (usuario.debeConfigurarMfa) {
        setEnrolando(await api('/auth/mfa/iniciar', { metodo: 'POST' }));
      }
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'MFA_REQUERIDO') {
        setPideMfa(true);
        setError('Ingrese el código de 6 dígitos de su aplicación autenticadora.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      }
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarEnrolamiento(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api('/auth/mfa/confirmar', { metodo: 'POST', cuerpo: { codigo: codigoMfa } });
      await refrescarUsuario();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setEnviando(false);
    }
  }

  if (enrolando) {
    return (
      <div className="ingreso">
        <div className="ingreso__caja">
          <div className="ingreso__marca">
            <strong>Controles SOX</strong>
            <span>Cálidda · Cálidda Energía</span>
          </div>
          <div className="tarjeta">
            <h2>Configure el doble factor</h2>
            <p className="tarjeta__sub">
              Su rol administra el cumplimiento SOX, por lo que requiere autenticación de dos factores.
            </p>
            <Aviso tono="info">
              Registre esta clave en Microsoft Authenticator o Google Authenticator y luego ingrese
              el código que le muestre la aplicación.
            </Aviso>
            <div className="campo">
              <label htmlFor="secreto">Clave para el autenticador</label>
              <input id="secreto" className="mono" readOnly value={enrolando.secreto} onFocus={(e) => e.target.select()} />
              <small>También puede pegar esta URI en su gestor: {enrolando.otpauth.slice(0, 48)}…</small>
            </div>
            <form onSubmit={confirmarEnrolamiento}>
              <div className="campo">
                <label htmlFor="cod">Código de verificación</label>
                <input
                  id="cod" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                  value={codigoMfa} onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000" required
                />
              </div>
              {error && <Aviso tono="critico">{error}</Aviso>}
              <button className="btn btn--primario" style={{ width: '100%' }} disabled={enviando || codigoMfa.length !== 6}>
                {enviando ? 'Verificando…' : 'Activar doble factor'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ingreso">
      <div className="ingreso__caja">
        <div className="ingreso__marca">
          <strong>Controles SOX</strong>
          <span>Cálidda · Cálidda Energía</span>
        </div>
        <form className="tarjeta" onSubmit={alEnviar}>
          <h2>Iniciar sesión</h2>
          <p className="tarjeta__sub">Acceso restringido al personal autorizado.</p>

          <div className="campo">
            <label htmlFor="email">Correo corporativo</label>
            <input
              id="email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre.apellido@calidda.com.pe"
            />
          </div>
          <div className="campo">
            <label htmlFor="pwd">Contraseña</label>
            <input
              id="pwd" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {pideMfa && (
            <div className="campo">
              <label htmlFor="mfa">Código de verificación</label>
              <input
                id="mfa" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                value={codigoMfa} onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </div>
          )}
          {error && <Aviso tono={pideMfa ? 'aviso' : 'critico'}>{error}</Aviso>}
          <button className="btn btn--primario" style={{ width: '100%' }} disabled={enviando}>
            {enviando ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
