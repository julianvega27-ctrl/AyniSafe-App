import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { api, type Rol, type SeccionPanel } from '../api/cliente';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { Estructura, useTitulo } from '../componentes/Estructura';
import { FalloDeConexion } from '../componentes/FalloDeConexion';
import { Icono } from '../componentes/iconos';
import { Mensaje } from '../componentes/Mensaje';
import { useSesion } from '../sesion/SesionContexto';

/**
 * Guard de ruta: solo guia la navegacion (experiencia de usuario). La autorizacion real esta en la
 * API, que vuelve a validar la cookie y el rol en cada peticion; manipular este estado no concede datos.
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { sesion, restaurar } = useSesion();
  useTitulo('Panel');
  if (sesion.estado === 'cargando') {
    return (
      <Estructura>
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Comprobando tu sesión…</span>
        </p>
      </Estructura>
    );
  }
  if (sesion.estado === 'error') {
    return (
      <Estructura>
        <FalloDeConexion tipo={sesion.causa} onReintentar={() => void restaurar()} />
      </Estructura>
    );
  }
  if (sesion.estado === 'anonimo') {
    // Cierre voluntario: a la portada. Sesion ausente o vencida: al acceso, con aviso.
    return sesion.causa === 'cierre' ? <Navigate to="/" replace /> : <Navigate to="/acceso" replace state={{ motivo: 'sesion' }} />;
  }
  return <>{children}</>;
}

/** `/panel` lleva a cada persona al panel de su rol. */
export function PanelInicio() {
  const { sesion } = useSesion();
  if (sesion.estado !== 'autenticado') return null;
  return <Navigate to={`/panel/${sesion.usuario.rol}`} replace />;
}

const TITULO: Record<Rol, string> = { administrador: 'Panel del administrador', operador: 'Panel del operador' };

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly secciones: readonly SeccionPanel[] }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

/** Panel minimo de un rol. Lo que se muestra depende solo de la respuesta de la API para ese rol. */
export function PanelRol({ rol }: { rol: Rol }) {
  useTitulo(TITULO[rol]);
  const { sesion, salir, expirar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  const [falloAlSalir, setFalloAlSalir] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    api
      .panel(rol, control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setCarga({ estado: 'listo', secciones: r.datos.secciones });
        else if (r.tipo === 'error' && r.estado === 401) expirar();
        else if (r.tipo === 'error' && r.estado === 403) setCarga({ estado: 'sin-permiso' });
        else if (r.tipo === 'red') setCarga({ estado: 'fallo', causa: 'red' });
        else setCarga({ estado: 'fallo', causa: 'servicio' });
      })
      .catch(() => {
        /* cancelada al salir de la pagina */
      });
    return () => control.abort();
  }, [rol, intento, expirar]);

  const reintentar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  async function cerrarSesion() {
    setSaliendo(true);
    setFalloAlSalir(false);
    const r = await salir();
    setSaliendo(false);
    if (r.tipo !== 'ok') setFalloAlSalir(true);
  }

  const usuario = sesion.estado === 'autenticado' ? sesion.usuario : null;
  const acciones = (
    <>
      {usuario ? (
        <div className="cuenta">
          <span>{usuario.nombre}</span>
          <span className="cuenta__rol">{usuario.rol === 'administrador' ? 'Administrador' : 'Operador'}</span>
        </div>
      ) : null}
      <Boton variante="secundario" onClick={() => void cerrarSesion()} cargando={saliendo}>
        {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </Boton>
    </>
  );

  return (
    <Estructura acciones={acciones}>
      <h1>{TITULO[rol]}</h1>

      {falloAlSalir ? (
        <Mensaje
          tipo="error"
          titulo="No pudimos cerrar tu sesión"
          accion={
            <Boton variante="secundario" onClick={() => void cerrarSesion()} cargando={saliendo}>
              Reintentar
            </Boton>
          }
        >
          No pudimos confirmar el cierre, así que tu sesión puede seguir abierta. Inténtalo de nuevo.
        </Mensaje>
      ) : null}

      {carga.estado === 'cargando' ? (
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Cargando tu panel…</span>
        </p>
      ) : null}

      {carga.estado === 'fallo' ? <FalloDeConexion tipo={carga.causa} onReintentar={reintentar} /> : null}

      {carga.estado === 'sin-permiso' ? (
        <>
          <Mensaje tipo="error" titulo="No tienes permiso para ver este panel">
            Tu cuenta no puede acceder a esta sección.
          </Mensaje>
          <BotonEnlace to="/panel">Ir a mi panel</BotonEnlace>
        </>
      ) : null}

      {carga.estado === 'listo' ? (
        <div className="panel">
          <nav aria-label={`Secciones del ${TITULO[rol].toLowerCase()}`}>
            <ul className="navegacion-panel">
              {carga.secciones.map((s) => (
                <li key={s.id} className="navegacion-panel__item">
                  <span>{s.titulo}</span>
                  {s.disponible ? null : (
                    <span className="etiqueta">
                      <Icono nombre="reloj" />
                      Aún no disponible
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <section aria-labelledby="estado-panel">
            <h2 id="estado-panel">Panel mínimo</h2>
            <Mensaje tipo="info" titulo="Todavía no hay funciones disponibles">
              Las secciones de la izquierda se habilitarán en próximas entregas. Por ahora no se muestran datos, mapas ni cifras de ejemplo.
            </Mensaje>
          </section>
        </div>
      ) : null}
    </Estructura>
  );
}
