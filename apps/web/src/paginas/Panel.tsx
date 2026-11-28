import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { api, type Rol, type SeccionPanel } from '../api/cliente';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { useTitulo } from '../componentes/Estructura';
import { FalloDeConexion } from '../componentes/FalloDeConexion';
import { Icono } from '../componentes/iconos';
import { CampanaPendiente, ETIQUETA_ROL, MarcoInstitucional, MenuCuenta, rutaSeccion } from '../componentes/MarcoInstitucional';
import { Mensaje } from '../componentes/Mensaje';
import { useSesion } from '../sesion/SesionContexto';
import { Bandeja, olvidarBandeja, ResumenIncidenteVista } from './incidentes/Bandeja';
import { EnrutamientoPendiente } from './incidentes/Pendientes';
import { ResponsablesActivos } from './incidentes/Responsables';
import { MapaOperativo } from './incidentes/MapaOperativo';
import { DESCRIPCION_SECCION, SeccionOrganizacion } from './organizacion/Organizacion';

/**
 * Guard de ruta: solo guia la navegacion (experiencia de usuario). La autorizacion real esta en la
 * API, que vuelve a validar la cookie y el rol en cada peticion; manipular este estado no concede datos.
 * Mientras comprueba, el marco no muestra identidad ni secciones (sin destello de otro rol).
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { sesion, restaurar } = useSesion();
  useTitulo('Panel');
  if (sesion.estado === 'cargando') {
    return (
      <MarcoInstitucional titulo="Panel institucional">
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Comprobando tu sesión…</span>
        </p>
      </MarcoInstitucional>
    );
  }
  if (sesion.estado === 'error') {
    return (
      <MarcoInstitucional titulo="Panel institucional">
        <FalloDeConexion tipo={sesion.causa} onReintentar={() => void restaurar()} />
      </MarcoInstitucional>
    );
  }
  if (sesion.estado === 'anonimo') {
    // Sin sesion no queda en memoria ninguna bandeja de la visita anterior.
    olvidarBandeja();
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

/** Explicacion de cada destino pendiente: dice que falta, sin cifras, mapas ni datos de ejemplo. */
const EXPLICACION: Record<string, string> = {
  inicio: 'El resumen se habilitará cuando existan incidentes registrados. Hoy no se muestran cifras ni indicadores de ejemplo.',
  historial: 'El historial autorizado se habilitará con las actuaciones sobre incidentes. Todavía no hay registros que consultar.',
  mapa: 'El mapa de incidentes se habilitará en una próxima entrega. No se muestran ubicaciones de ejemplo.',
  indicadores: 'Los indicadores se calcularán con incidentes reales cuando la gestión esté disponible.',
};
const EXPLICACION_GENERAL = 'Esta sección se habilitará en una próxima entrega. Por ahora no se muestran datos, mapas ni cifras de ejemplo.';

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly secciones: readonly SeccionPanel[] }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

/** Encabezado de las secciones operativas de P4.2 (bandeja del operador e Inicio del administrador). */
const INTRO_P42: Record<string, { eyebrow: string; titulo: string; texto: string }> = {
  'operador:incidentes': {
    eyebrow: 'Operaciones',
    titulo: 'Bandeja de incidentes',
    texto: 'Casos en que participa tu sede, en orden de llegada. Leer un caso no confirma su recepción ni su atención.',
  },
  'operador:mapa': {
    eyebrow: 'Territorio',
    titulo: 'Mapa de incidencias',
    texto: 'Ubicaciones de los incidentes en que participa tu sede. Solo tu sede ve estos puntos exactos; el mapa ciudadano muestra zonas aproximadas.',
  },
  'administrador:inicio': {
    eyebrow: 'Administración',
    titulo: 'Panel del administrador',
    texto: 'Casos que necesitan una sede. El resto del resumen administrativo se habilitará en una próxima entrega.',
  },
};

/** Panel de un rol. Lo que se muestra depende solo de la respuesta de la API para ese rol. */
export function PanelRol({ rol }: { rol: Rol }) {
  const { seccion: idSeccion = 'inicio', incidenteId } = useParams();
  const { sesion, salir, expirar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  const [falloAlSalir, setFalloAlSalir] = useState(false);

  const seccion = carga.estado === 'listo' ? carga.secciones.find((s) => s.id === idSeccion) : undefined;
  // Secciones construidas: organizacion del administrador (P3.2), Inicio del administrador y bandeja del
  // operador (P4.2). Cabecera y paneles como las paginas del origen.
  const intro = seccion?.disponible ? INTRO_P42[`${rol}:${seccion.id}`] : undefined;
  const organizacion = seccion?.disponible === true && rol === 'administrador' && !intro;
  const operativa = organizacion || intro !== undefined;
  // El resumen de incidente solo existe dentro de la bandeja del operador.
  const resumen = rol === 'operador' && seccion?.id === 'incidentes' && seccion.disponible && incidenteId ? incidenteId : null;
  useTitulo(seccion && seccion.id !== 'inicio' ? `${seccion.titulo} · ${TITULO[rol]}` : TITULO[rol]);

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
    if (r.tipo === 'ok') olvidarBandeja();
    if (r.tipo !== 'ok') setFalloAlSalir(true);
  }

  const usuario = sesion.estado === 'autenticado' ? sesion.usuario : null;
  // Identidad de la propia sesion verificada; las secciones solo llegan con la respuesta de la API del rol.
  const acciones = usuario ? (
    <>
      <CampanaPendiente />
      <MenuCuenta usuario={usuario} onSalir={() => void cerrarSesion()} saliendo={saliendo} />
    </>
  ) : null;

  return (
    <MarcoInstitucional rol={rol} titulo={TITULO[rol]} secciones={carga.estado === 'listo' ? carga.secciones : []} acciones={acciones}>
      <div className="page-intro">
        <span className="eyebrow">
          {carga.estado === 'sin-permiso' ? 'Panel institucional' : intro ? intro.eyebrow : organizacion ? 'Organización' : ETIQUETA_ROL[rol]}
        </span>
        <h1>{intro ? intro.titulo : organizacion && seccion ? seccion.titulo : TITULO[rol]}</h1>
        {intro ? <p>{intro.texto}</p> : organizacion && seccion ? <p>{DESCRIPCION_SECCION[seccion.id]}</p> : null}
      </div>

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

      {carga.estado === 'listo' && !seccion ? <Navigate to={rutaSeccion(rol, 'inicio')} replace /> : null}
      {carga.estado === 'listo' && seccion && incidenteId && !resumen ? <Navigate to={rutaSeccion(rol, seccion.id)} replace /> : null}

      {seccion && organizacion ? <SeccionOrganizacion id={seccion.id} /> : null}
      {resumen ? <ResumenIncidenteVista key={resumen} id={resumen} /> : null}
      {intro && seccion?.id === 'incidentes' && !resumen ? <Bandeja /> : null}
      {intro && seccion?.id === 'mapa' ? <MapaOperativo /> : null}
      {intro && seccion?.id === 'inicio' ? (
        <>
          <EnrutamientoPendiente />
          <ResponsablesActivos />
          <Mensaje tipo="info" titulo="Resumen administrativo aún no disponible">
            Los indicadores y avisos del panel se habilitarán en una próxima entrega. No se muestran cifras de ejemplo.
          </Mensaje>
        </>
      ) : null}

      {seccion && !operativa ? (
        <section className="panel" aria-labelledby="titulo-seccion">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Sección</span>
              <h2 id="titulo-seccion">{seccion.titulo}</h2>
            </div>
          </div>
          {seccion.disponible ? null : (
            <Mensaje tipo="info" titulo="Aún no disponible">
              {EXPLICACION[seccion.id] ?? EXPLICACION_GENERAL}
            </Mensaje>
          )}
        </section>
      ) : null}
    </MarcoInstitucional>
  );
}
