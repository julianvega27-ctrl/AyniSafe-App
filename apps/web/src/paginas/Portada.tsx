import { useCallback, useEffect, useState } from 'react';
import { api, type ContenidoPublico } from '../api/cliente';
import { BotonEnlace } from '../componentes/Boton';
import { Estructura, useTitulo } from '../componentes/Estructura';
import { FalloDeConexion } from '../componentes/FalloDeConexion';
import { Icono } from '../componentes/iconos';
import { useSesion } from '../sesion/SesionContexto';

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly contenido: ContenidoPublico }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' | 'respuesta' };

/** Secciones sin texto aprobado: se declara que aun no estan disponibles, nunca un texto de reemplazo. */
function NoDisponible() {
  return (
    <p className="pendiente">
      <Icono nombre="reloj" />
      <span>Aún no disponible</span>
    </p>
  );
}

/**
 * Estado de la plataforma en esta version (PRODUCT.md, «Capabilities and Constraints»). Es estado de
 * producto, no contenido publico: hay que actualizarlo cuando se incorpore cada funcion.
 */
const ESTADO_ACTUAL: readonly { readonly texto: string; readonly disponible: boolean }[] = [
  { texto: 'Cuenta y perfil ciudadano', disponible: true },
  { texto: 'Acceso institucional y panel', disponible: true },
  { texto: 'Reporte de incidentes', disponible: false },
  { texto: 'Mapa y alertas', disponible: false },
  { texto: 'Seguimiento de reportes', disponible: false },
];

function EstadoActual() {
  return (
    <aside className="estado" aria-labelledby="titulo-estado">
      <p id="titulo-estado" className="estado__titulo">
        Estado de la plataforma
      </p>
      <ul className="estado__lista">
        {ESTADO_ACTUAL.map((e) => (
          <li key={e.texto} className="estado__fila">
            <Icono nombre={e.disponible ? 'exito' : 'reloj'} />
            <span className="estado__texto">{e.texto}</span>
            <span className="estado__marca">{e.disponible ? 'En esta versión' : 'Aún no disponible'}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Seccion({ id, titulo, banda = false, compacto = false, children }: { id: string; titulo: string; banda?: boolean; compacto?: boolean; children: React.ReactNode }) {
  const clase = ['bloque', banda ? 'bloque--banda' : '', compacto ? 'bloque--compacto' : ''].filter(Boolean).join(' ');
  return (
    <section className={clase} aria-labelledby={id}>
      <div className="contenedor bloque__interior">
        <h2 id={id} className="bloque__titulo">
          {titulo}
        </h2>
        <div className="bloque__cuerpo">{children}</div>
      </div>
    </section>
  );
}

/**
 * Portada publica (RF38): accesible sin sesion y separada del panel. Todo su texto de finalidad,
 * funcionamiento, alcance del piloto y desarrolladores sale de `GET /publico/contenido`.
 */
export function Portada() {
  useTitulo('');
  const { sesion } = useSesion();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  const cargar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    setIntento((n) => n + 1);
  }, []);

  useEffect(() => {
    const control = new AbortController();
    api
      .contenidoPublico(control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setCarga({ estado: 'listo', contenido: r.datos });
        else if (r.tipo === 'red') setCarga({ estado: 'fallo', causa: 'red' });
        else if (r.tipo === 'servicio') setCarga({ estado: 'fallo', causa: 'servicio' });
        else setCarga({ estado: 'fallo', causa: 'respuesta' });
      })
      .catch(() => {
        /* cancelada al salir de la pagina */
      });
    return () => control.abort();
  }, [intento]);

  const autenticado = sesion.estado === 'autenticado';
  const acciones = autenticado ? (
    <BotonEnlace to="/panel">Ir a mi panel</BotonEnlace>
  ) : (
    <BotonEnlace to="/acceso">Acceso institucional</BotonEnlace>
  );

  return (
    <Estructura completa>
      <section className="heroe" aria-labelledby="titulo-portada" data-enter>
        <div className="contenedor heroe__interior">
          <div className="heroe__texto">
            <h1 id="titulo-portada" className="heroe__nombre">
              AyniSafe
            </h1>
            <p className="heroe__lema">Cuidarnos es tarea de todos</p>
            <div className="heroe__acciones">{acciones}</div>
          </div>
          <EstadoActual />
        </div>
      </section>

      {carga.estado === 'cargando' ? (
        <div className="contenedor estado-carga">
          <p role="status" className="pendiente">
            <Icono nombre="reloj" />
            <span>Cargando información…</span>
          </p>
          <div className="esqueleto" aria-hidden="true" />
        </div>
      ) : null}

      {carga.estado === 'fallo' ? (
        <div className="contenedor estado-carga">
          {carga.causa === 'respuesta' ? (
            <FalloDeConexion tipo="servicio" onReintentar={cargar} />
          ) : (
            <FalloDeConexion tipo={carga.causa} onReintentar={cargar} />
          )}
        </div>
      ) : null}

      {carga.estado === 'listo' ? (
        <>
          <Seccion id="finalidad" titulo="Finalidad" banda>
            {carga.contenido.app.estado === 'aprobado' && carga.contenido.app.finalidad ? (
              <p>{carga.contenido.app.finalidad}</p>
            ) : (
              <NoDisponible />
            )}
          </Seccion>
          <Seccion id="funcionamiento" titulo="Funcionamiento">
            {carga.contenido.app.estado === 'aprobado' && carga.contenido.app.funcionamiento ? (
              <p>{carga.contenido.app.funcionamiento}</p>
            ) : (
              <NoDisponible />
            )}
          </Seccion>
          <Seccion id="piloto" titulo="Alcance del piloto" banda compacto>
            {carga.contenido.piloto.estado === 'aprobado' && carga.contenido.piloto.texto ? (
              <p>{carga.contenido.piloto.texto}</p>
            ) : (
              <NoDisponible />
            )}
          </Seccion>
          <Seccion id="desarrolladores" titulo="Desarrolladores" compacto>
            {carga.contenido.desarrolladores.estado === 'aprobado' && (carga.contenido.desarrolladores.personas?.length ?? 0) > 0 ? (
              <ul className="lista-simple">
                {carga.contenido.desarrolladores.personas?.map((p) => (
                  <li key={`${p.nombre}-${p.rol}`}>
                    {p.nombre} — {p.rol}
                  </li>
                ))}
              </ul>
            ) : (
              <NoDisponible />
            )}
          </Seccion>
        </>
      ) : null}
    </Estructura>
  );
}
