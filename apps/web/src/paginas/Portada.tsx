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
    <Estructura completa acciones={acciones}>
      <section className="welcome-hero" aria-labelledby="titulo-portada">
        <div className="welcome-copy">
          <span className="welcome-tag">AYNISAFE · AYACUCHO</span>
          <h1 id="titulo-portada">AyniSafe<br /><em>Cuidarnos es tarea de todos</em></h1>
          <h2 id="finalidad" className="solo-lectores">Finalidad</h2>
          {carga.estado === 'listo' ? (
            carga.contenido.app.estado === 'aprobado' && carga.contenido.app.finalidad
              ? <p>{carga.contenido.app.finalidad}</p> : <NoDisponible />
          ) : null}
          <div className="welcome-actions">
            <BotonEnlace to={autenticado ? '/panel' : '/acceso'}>{autenticado ? 'Abrir mi panel' : 'Entrar al panel institucional'} <span aria-hidden="true">→</span></BotonEnlace>
            <a className="boton boton--secundario" href="#funcionamiento">Conocer la plataforma</a>
          </div>
        </div>
        <figure className="welcome-art">
          <img src="/community-hero.png" alt="Ilustración de una ciudadana y equipos médicos, de bomberos y municipales en una plaza de Ayacucho" fetchPriority="high" width="1536" height="1024" />
          <figcaption><Icono nombre="info" /> Cuidarnos es tarea de todos</figcaption>
        </figure>
      </section>

      {carga.estado === 'cargando' ? (
        <div className="estado-carga">
          <p role="status" className="pendiente">
            <Icono nombre="reloj" />
            <span>Cargando información…</span>
          </p>
          <div className="esqueleto" aria-hidden="true" />
        </div>
      ) : null}

      {carga.estado === 'fallo' ? (
        <div className="estado-carga">
          {carga.causa === 'respuesta' ? (
            <FalloDeConexion tipo="servicio" onReintentar={cargar} />
          ) : (
            <FalloDeConexion tipo={carga.causa} onReintentar={cargar} />
          )}
        </div>
      ) : null}

      {carga.estado === 'listo' ? (
        <>
          <section className="welcome-channels" aria-labelledby="titulo-plataforma">
            <h2 id="titulo-plataforma">Información de AyniSafe</h2>
            <div className="channel-cards">
              <article aria-labelledby="funcionamiento">
                <Icono nombre="info" />
                <h3 id="funcionamiento">Funcionamiento</h3>
                {carga.contenido.app.estado === 'aprobado' && carga.contenido.app.funcionamiento
                  ? <p>{carga.contenido.app.funcionamiento}</p> : <NoDisponible />}
              </article>
              <article aria-labelledby="piloto">
                <Icono nombre="reloj" />
                <h3 id="piloto">Alcance del piloto</h3>
                {carga.contenido.piloto.estado === 'aprobado' && carga.contenido.piloto.texto
                  ? <p>{carga.contenido.piloto.texto}</p> : <NoDisponible />}
              </article>
            </div>
          </section>
          <section className="welcome-how" aria-labelledby="desarrolladores">
            <h2 id="desarrolladores">Desarrolladores</h2>
            {carga.contenido.desarrolladores.estado === 'aprobado' && (carga.contenido.desarrolladores.personas?.length ?? 0) > 0 ? (
              <ul className="welcome-steps lista-simple">
                {carga.contenido.desarrolladores.personas?.map((p) => (
                  <li key={`${p.nombre}-${p.rol}`}>
                    {p.nombre} — {p.rol}
                  </li>
                ))}
              </ul>
            ) : (
              <NoDisponible />
            )}
          </section>
        </>
      ) : null}
      <EstadoActual />
      <section className="welcome-access" aria-labelledby="titulo-institucional">
        <div><h2 id="titulo-institucional">Acceso institucional</h2><p>Para administradores y operadores. Las cuentas se crean por invitación.</p></div>
        <BotonEnlace to={autenticado ? '/panel' : '/acceso'}>{autenticado ? 'Continuar a mi panel' : 'Iniciar sesión'} <span aria-hidden="true">→</span></BotonEnlace>
      </section>
    </Estructura>
  );
}
