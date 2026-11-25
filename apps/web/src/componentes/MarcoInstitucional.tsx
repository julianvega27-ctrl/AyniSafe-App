import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { Rol, SeccionPanel, UsuarioInstitucional } from '../api/cliente';
import { Boton } from './Boton';
import { Icono } from './iconos';

/**
 * Marco institucional reproducido del origen (DESIGN.md): barra lateral, cabecera con campana y cuenta, y
 * area de trabajo. Solo presenta lo que la API autorizo; los destinos sin capacidad se declaran pendientes.
 */

export const ETIQUETA_ROL: Record<Rol, string> = { administrador: 'Administrador', operador: 'Operador' };

/** Simbolos decorativos del origen (aria-hidden): el nombre de cada destino siempre va en texto. */
const SIMBOLO: Record<string, string> = {
  inicio: '◫',
  incidentes: '▤',
  mapa: '◎',
  indicadores: '▥',
  historial: '↺',
  'instituciones-sedes': '▣',
  operadores: '◉',
  coberturas: '◌',
  categorias: '▦',
  reglas: '≡',
  'contenido-contactos': '☎',
};

/** Ruta de un destino del panel. Inicio es la raiz del rol. */
export const rutaSeccion = (rol: Rol, id: string): string => (id === 'inicio' ? `/panel/${rol}` : `/panel/${rol}/${id}`);

/** Cierra un desplegable con Escape (devolviendo el foco al disparador) o al pulsar fuera. */
function useDesplegable() {
  const [abierto, setAbierto] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!area.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      disparador.current?.focus();
    };
    const foco = (e: FocusEvent) => {
      if (e.target instanceof Node && !area.current?.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', escape);
    document.addEventListener('focusin', foco);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', foco);
    };
  }, [abierto]);
  return { abierto, setAbierto, area, disparador };
}

/** Campana del origen sin capacidad de avisos: no consulta servicios ni afirma que haya cero avisos. */
export function CampanaPendiente() {
  const { abierto, setAbierto, area, disparador } = useDesplegable();
  const id = useId();
  return (
    <div className="notification-area" ref={area}>
      <button
        type="button"
        ref={disparador}
        className="notification-button"
        aria-label="Avisos: aún no disponible"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        <span aria-hidden="true">🔔</span>
        <span>Avisos</span>
      </button>
      {abierto ? (
        <div id={id} className="notification-popover" role="region" aria-label="Avisos">
          <div className="notification-heading">
            <strong>Avisos</strong>
          </div>
          <p className="notification-empty notification-pending">
            <Icono nombre="reloj" />
            <span>
              <strong>Aún no disponible.</strong> Los avisos se habilitarán junto con la gestión de incidentes; hoy no se
              consultan ni se generan avisos.
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Menu de cuenta del origen: identidad autorizada y cierre de sesion (sin perfil web inventado). */
export function MenuCuenta({ usuario, onSalir, saliendo }: { usuario: UsuarioInstitucional; onSalir: () => void; saliendo: boolean }) {
  const { abierto, setAbierto, area, disparador } = useDesplegable();
  const id = useId();
  const inicial = usuario.nombre.trim().charAt(0).toLocaleUpperCase('es') || 'U';
  return (
    <div className="account-area" ref={area}>
      <button
        type="button"
        ref={disparador}
        className="account-trigger"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {inicial}
        </span>
        <span className="account-identity">
          <span className="solo-lectores">Cuenta de </span>
          <strong>{usuario.nombre}</strong>
          <small>{ETIQUETA_ROL[usuario.rol]}</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {abierto ? (
        <div id={id} className="account-options">
          <p className="account-summary">
            <strong>{usuario.nombre}</strong>
            <span>{usuario.correo}</span>
            <span>{ETIQUETA_ROL[usuario.rol]}</span>
          </p>
          <Boton variante="enlace" className="account-signout" onClick={onSalir} cargando={saliendo}>
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Boton>
        </div>
      ) : null}
    </div>
  );
}

interface PropsMarco {
  readonly rol?: Rol;
  readonly titulo: string;
  /** Secciones autorizadas por la API; vacio mientras carga o si no hay permiso. */
  readonly secciones?: readonly SeccionPanel[];
  readonly acciones?: ReactNode;
  readonly children: ReactNode;
}

export function MarcoInstitucional({ rol, titulo, secciones = [], acciones, children }: PropsMarco) {
  return (
    <div className="app-shell">
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-symbol brand-symbol--texto" aria-hidden="true">
            A
          </span>
          <span className="brand-text">
            <strong>AyniSafe</strong>
            <small>Panel institucional</small>
          </span>
        </Link>
        {rol && secciones.length > 0 ? (
          <>
            <div className="sidebar-label" aria-hidden="true">
              PLATAFORMA
            </div>
            <nav aria-label={`Secciones del ${titulo.toLowerCase()}`}>
              <ul className="sidebar-list">
                {secciones.map((s) => (
                  <li key={s.id}>
                    <NavLink to={rutaSeccion(rol, s.id)} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                      <span className="nav-icon" aria-hidden="true">
                        {SIMBOLO[s.id] ?? '•'}
                      </span>
                      <span className="nav-text">
                        {s.titulo}
                        {s.disponible ? null : <small className="nav-pending">Aún no disponible</small>}
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        ) : null}
        <div className="sidebar-footer">
          <p className="pilot">AyniSafe</p>
          <small>Cuidarnos es tarea de todos</small>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">{titulo}</div>
          <div className="topbar-actions">{acciones}</div>
        </header>
        <main id="contenido" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
