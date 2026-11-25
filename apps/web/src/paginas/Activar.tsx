import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { Campo, CampoContrasena } from '../componentes/Campo';
import { Estructura, useTitulo } from '../componentes/Estructura';
import { FalloDeConexion } from '../componentes/FalloDeConexion';
import { Mensaje } from '../componentes/Mensaje';

const CONTRASENA_MIN = 15;
const CONTRASENA_MAX = 128;
const TOKEN_EN_FRAGMENTO = /^#t=([A-Za-z0-9_-]{20,200})$/;

/** Longitud en puntos de codigo Unicode, como valida el servidor. */
const longitud = (texto: string): number => [...texto].length;

type Fase =
  | { readonly fase: 'sin-codigo' }
  | { readonly fase: 'consultando' }
  | { readonly fase: 'formulario' }
  | { readonly fase: 'exito' }
  | { readonly fase: 'enlace'; readonly motivo: 'usado' | 'vencido' | 'invalido' | 'otro-proposito' }
  | { readonly fase: 'conexion'; readonly causa: 'red' | 'servicio' }
  | { readonly fase: 'espera'; readonly segundos?: number };

/**
 * Activacion de cuenta invitada. El token llega en el fragmento (#t=...), que no viaja al servidor: se
 * lee, se quita de la barra de direcciones y del historial y se conserva SOLO en memoria. Ni el token
 * ni la contrasena se guardan en el navegador ni se envian a terceros. La activacion no inicia sesion.
 */
export function Activar() {
  useTitulo('Activa tu cuenta');
  const token = useRef<string | null>(null);
  const [fase, setFase] = useState<Fase>({ fase: 'consultando' });
  const [codigo, setCodigo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);

  const consultar = useCallback(async () => {
    if (token.current === null) {
      setFase({ fase: 'sin-codigo' });
      return;
    }
    setFase({ fase: 'consultando' });
    const r = await api.consultarToken(token.current);
    if (r.tipo === 'ok') {
      setFase(r.datos.proposito === 'activacion' ? { fase: 'formulario' } : { fase: 'enlace', motivo: 'otro-proposito' });
    } else if (r.tipo === 'red' || r.tipo === 'servicio') {
      setFase({ fase: 'conexion', causa: r.tipo });
    } else if (r.estado === 410) {
      setFase({ fase: 'enlace', motivo: r.codigo === 'TOKEN_EXPIRED' ? 'vencido' : 'usado' });
    } else if (r.estado === 429) {
      setFase({ fase: 'espera', segundos: r.reintentarEn });
    } else {
      setFase({ fase: 'enlace', motivo: 'invalido' });
    }
  }, []);

  useEffect(() => {
    const coincide = TOKEN_EN_FRAGMENTO.exec(window.location.hash);
    if (coincide) {
      token.current = coincide[1] ?? null;
      // Quita el fragmento de la barra de direcciones y del historial: el token solo queda en memoria.
      window.history.replaceState(null, '', window.location.pathname);
    }
    // Consulta inicial del estado del enlace al abrir la pagina.
    void consultar();
  }, [consultar]);

  function usarCodigo(evento: FormEvent) {
    evento.preventDefault();
    const limpio = codigo.trim();
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(limpio)) {
      setError('El código no tiene el formato esperado. Cópialo completo desde el correo.');
      return;
    }
    setError(undefined);
    token.current = limpio;
    setCodigo('');
    void consultar();
  }

  async function activar(evento: FormEvent) {
    evento.preventDefault();
    if (enCurso.current || token.current === null) return;
    const n = longitud(contrasena);
    if (n < CONTRASENA_MIN || n > CONTRASENA_MAX) {
      setError(`La contraseña debe tener entre ${CONTRASENA_MIN} y ${CONTRASENA_MAX} caracteres.`);
      return;
    }
    setError(undefined);
    enCurso.current = true;
    setEnviando(true);
    try {
      const r = await api.activarCuenta(token.current, contrasena);
      if (r.tipo === 'ok') {
        token.current = null;
        setContrasena('');
        setFase({ fase: 'exito' });
      } else if (r.tipo === 'red' || r.tipo === 'servicio') {
        setFase({ fase: 'conexion', causa: r.tipo });
      } else if (r.estado === 400) {
        setError(r.campos?.contrasena ?? `La contraseña debe tener entre ${CONTRASENA_MIN} y ${CONTRASENA_MAX} caracteres.`);
      } else if (r.estado === 410) {
        setFase({ fase: 'enlace', motivo: r.codigo === 'TOKEN_EXPIRED' ? 'vencido' : 'usado' });
      } else if (r.estado === 429) {
        setFase({ fase: 'espera', segundos: r.reintentarEn });
      } else {
        setFase({ fase: 'enlace', motivo: 'invalido' });
      }
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  const volver = (
    <BotonEnlace to="/" variante="secundario">
      Volver a la portada
    </BotonEnlace>
  );

  return (
    <Estructura>
      <section className="tarjeta tarjeta--formulario login-card" aria-labelledby="titulo-activar">
        {volver}
        <p className="login-identity">AyniSafe</p>
        <h1 id="titulo-activar">Activa tu cuenta</h1>

        {fase.fase === 'consultando' ? <p role="status">Comprobando tu enlace…</p> : null}

        {fase.fase === 'sin-codigo' ? (
          <form onSubmit={usarCodigo} noValidate>
            <Mensaje tipo="info" titulo="Necesitamos tu código">
              Abre el enlace del correo de invitación o pega aquí el código que aparece en él.
            </Mensaje>
            <Campo
              etiqueta="Código del correo"
              name="codigo"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              error={error}
            />
            <Boton type="submit" bloque>
              Continuar
            </Boton>
          </form>
        ) : null}

        {fase.fase === 'formulario' ? (
          <form onSubmit={(e) => void activar(e)} noValidate>
            <p>Elige la contraseña con la que ingresarás al panel.</p>
            <CampoContrasena
              etiqueta="Contraseña nueva"
              ayuda="Entre 15 y 128 caracteres. Puedes usar espacios."
              name="contrasena"
              autoComplete="new-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              error={error}
            />
            <Boton type="submit" bloque cargando={enviando}>
              {enviando ? 'Activando…' : 'Activar cuenta'}
            </Boton>
          </form>
        ) : null}

        {fase.fase === 'exito' ? (
          <>
            <Mensaje tipo="exito" titulo="Tu cuenta quedó activa">
              Ya puedes iniciar sesión con tu correo y la contraseña que elegiste. No iniciamos sesión automáticamente.
            </Mensaje>
            <BotonEnlace to="/acceso" bloque>
              Ir al acceso institucional
            </BotonEnlace>
          </>
        ) : null}

        {fase.fase === 'enlace' ? (
          <Mensaje
            tipo="error"
            titulo={
              fase.motivo === 'usado'
                ? 'Este enlace ya se usó o fue reemplazado'
                : fase.motivo === 'vencido'
                  ? 'Este enlace venció'
                  : fase.motivo === 'otro-proposito'
                    ? 'Este enlace no sirve para activar una cuenta'
                    : 'El enlace o el código no es válido'
            }
          >
            No necesitas escribir una contraseña. Pide a quien administra AyniSafe que te envíe una invitación nueva.
          </Mensaje>
        ) : null}

        {fase.fase === 'conexion' ? (
          <FalloDeConexion tipo={fase.causa} onReintentar={() => void consultar()} />
        ) : null}

        {fase.fase === 'espera' ? (
          <Mensaje tipo="aviso" titulo="Demasiados intentos">
            {fase.segundos ? `Espera ${fase.segundos} segundos` : 'Espera unos minutos'} antes de volver a intentarlo. No reintentaremos por ti.
          </Mensaje>
        ) : null}
      </section>
    </Estructura>
  );
}
