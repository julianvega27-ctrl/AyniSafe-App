import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { Campo, CampoContrasena } from '../componentes/Campo';
import { Estructura, useTitulo } from '../componentes/Estructura';
import { Mensaje } from '../componentes/Mensaje';
import { useSesion } from '../sesion/SesionContexto';

type Aviso =
  | { readonly tipo: 'credenciales' }
  | { readonly tipo: 'origen' }
  | { readonly tipo: 'espera'; readonly segundos?: number }
  | { readonly tipo: 'red' }
  | { readonly tipo: 'servicio' }
  | { readonly tipo: 'inesperado' };

function textoEspera(segundos?: number): string {
  if (!segundos) return 'Espera unos minutos antes de volver a intentarlo.';
  if (segundos < 90) return `Espera ${segundos} segundos antes de volver a intentarlo.`;
  return `Espera unos ${Math.ceil(segundos / 60)} minutos antes de volver a intentarlo.`;
}

/**
 * Acceso institucional. La contrasena vive solo en el estado de este formulario: se descarta al salir
 * de la pantalla y nunca se guarda en el navegador. Las credenciales incorrectas, o de una cuenta no
 * institucional, reciben el mismo mensaje general (la API no distingue la causa).
 */
export function Acceso() {
  useTitulo('Acceso institucional');
  const { sesion, ingresar } = useSesion();
  const ubicacion = useLocation();
  const motivo = (ubicacion.state as { motivo?: 'sesion' } | null)?.motivo;

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Un solo envio en curso, aunque se pulse varias veces antes de que React repinte.
  const enCurso = useRef(false);

  if (sesion.estado === 'autenticado') return <Navigate to="/panel" replace />;

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (enCurso.current) return;
    const errores: Record<string, string> = {};
    if (correo.trim() === '') errores.correo = 'Ingresa tu correo.';
    if (contrasena === '') errores.contrasena = 'Ingresa tu contraseña.';
    setCampos(errores);
    if (Object.keys(errores).length > 0) return;

    enCurso.current = true;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await ingresar(correo.trim(), contrasena);
      if (r.tipo === 'ok') return; // la sesion cambia y se redirige al panel
      if (r.tipo === 'red') setAviso({ tipo: 'red' });
      else if (r.tipo === 'servicio') setAviso({ tipo: 'servicio' });
      else if (r.estado === 400) setCampos(r.campos ?? {});
      else if (r.estado === 401) setAviso({ tipo: 'credenciales' });
      else if (r.estado === 403) setAviso({ tipo: 'origen' });
      else if (r.estado === 429) setAviso({ tipo: 'espera', segundos: r.reintentarEn });
      else setAviso({ tipo: 'inesperado' });
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  const reintentar = (
    <Boton variante="secundario" onClick={() => void enviar()} cargando={enviando}>
      Reintentar
    </Boton>
  );

  return (
    <Estructura acciones={<BotonEnlace to="/" variante="secundario">Volver a la portada</BotonEnlace>}>
      <section className="tarjeta tarjeta--formulario" aria-labelledby="titulo-acceso">
        <h1 id="titulo-acceso">Acceso institucional</h1>
        <p>Para administradores y operadores. Las cuentas se crean por invitación.</p>

        {motivo === 'sesion' && aviso === null ? (
          <Mensaje tipo="info" titulo="Tu sesión no es válida o venció">
            Inicia sesión de nuevo para continuar.
          </Mensaje>
        ) : null}

        {aviso?.tipo === 'credenciales' ? (
          <Mensaje tipo="error" titulo="No pudimos iniciar sesión">
            Correo o contraseña incorrectos.
          </Mensaje>
        ) : null}
        {aviso?.tipo === 'origen' ? (
          <Mensaje tipo="error" titulo="Solicitud no admitida">
            No pudimos verificar el origen de la solicitud. Abre AyniSafe desde su dirección oficial.
          </Mensaje>
        ) : null}
        {aviso?.tipo === 'espera' ? (
          <Mensaje tipo="aviso" titulo="Demasiados intentos">
            {textoEspera(aviso.segundos)} No reintentaremos por ti.
          </Mensaje>
        ) : null}
        {aviso?.tipo === 'red' ? (
          <Mensaje tipo="error" titulo="Sin conexión" accion={reintentar}>
            No pudimos conectar con AyniSafe, así que no sabemos si iniciaste sesión. Revisa tu conexión e inténtalo de nuevo.
          </Mensaje>
        ) : null}
        {aviso?.tipo === 'servicio' ? (
          <Mensaje tipo="aviso" titulo="El servicio no está disponible" accion={reintentar}>
            El servicio puede estar iniciándose y tardar hasta un minuto. No iniciaste sesión; inténtalo de nuevo en unos momentos.
          </Mensaje>
        ) : null}
        {aviso?.tipo === 'inesperado' ? (
          <Mensaje tipo="error" titulo="Ocurrió un error inesperado" accion={reintentar}>
            No pudimos completar el acceso. Inténtalo de nuevo.
          </Mensaje>
        ) : null}

        <form onSubmit={(e) => void enviar(e)} noValidate>
          <Campo
            etiqueta="Correo"
            type="email"
            name="correo"
            autoComplete="username"
            inputMode="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            error={campos.correo}
          />
          <CampoContrasena
            etiqueta="Contraseña"
            name="contrasena"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            error={campos.contrasena}
          />
          <Boton type="submit" bloque cargando={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Boton>
        </form>
      </section>
    </Estructura>
  );
}
