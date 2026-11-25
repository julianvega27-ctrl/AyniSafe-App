import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation } from 'react-router';

/** Titulo de la pestana por pagina (ayuda a lectores de pantalla y al historial). */
export function useTitulo(titulo: string): void {
  useEffect(() => {
    document.title = titulo ? `${titulo} · AyniSafe` : 'AyniSafe';
  }, [titulo]);
}

interface Marco {
  /** Contenedor de la cabecera donde cada pagina coloca sus acciones. */
  readonly ranura: HTMLElement | null;
  readonly declarar: (acciones: boolean, completa: boolean) => void;
}
const ContextoMarco = createContext<Marco | null>(null);

/**
 * Marco de la aplicacion (ruta de layout): cabecera, contenido y pie persisten entre paginas.
 * Mueve el foco al contenido en cada cambio de ruta para que un lector de pantalla lo note.
 */
export function MarcoApp() {
  const [ranura, setRanura] = useState<HTMLElement | null>(null);
  const [conAcciones, setConAcciones] = useState(false);
  const [completa, setCompleta] = useState(false);
  const { pathname } = useLocation();
  const publica = pathname === '/';
  const cuenta = pathname === '/acceso' || pathname === '/activar';
  // El panel institucional dibuja su propio marco (lateral, cabecera y area de trabajo del origen).
  const institucional = pathname === '/panel' || pathname.startsWith('/panel/');
  const principal = useRef<HTMLElement>(null);
  const anterior = useRef(pathname);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    (principal.current ?? document.getElementById('contenido'))?.focus({ preventScroll: true });
    document.documentElement.scrollTop = 0;
  }, [pathname]);

  const marco: Marco = {
    ranura,
    declarar: (a, c) => {
      setConAcciones(a);
      setCompleta(c);
    },
  };

  if (institucional) {
    return (
      <ContextoMarco.Provider value={marco}>
        <Outlet />
      </ContextoMarco.Provider>
    );
  }

  return (
    <ContextoMarco.Provider value={marco}>
      <div className={publica ? 'welcome-page' : cuenta ? 'account-page' : 'app-pendiente'}>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      {!cuenta ? <header className={publica ? 'welcome-header' : 'cabecera'}>
        <div className={publica ? 'welcome-header__interior' : 'contenedor cabecera__interior'}>
          <Link to="/" className={publica ? 'welcome-brand marca' : 'marca'} aria-label={publica ? undefined : 'AyniSafe, ir a la portada'}>
            <span>AyniSafe{publica ? <small>Cuidarnos es tarea de todos</small> : null}</span>
          </Link>
          <div className={publica ? 'welcome-header__nav' : undefined}>
            {publica ? <a className="welcome-header__anchor" href="#funcionamiento">Cómo funciona</a> : null}
            <nav className="cabecera__acciones" aria-label="Acciones de la cuenta" hidden={!conAcciones} ref={setRanura} />
          </div>
        </div>
      </header> : null}
      <main id="contenido" tabIndex={-1} ref={principal} className={publica ? 'principal--completa' : cuenta ? 'login-page' : completa ? 'principal--completa' : undefined}>
        <Outlet />
      </main>
      {!cuenta ? <footer className={publica ? 'welcome-footer pie' : 'pie'}>
        <div className="contenedor">
          <p className="pie__marca">AyniSafe</p>
          <p className="pie__lema">Cuidarnos es tarea de todos</p>
        </div>
      </footer> : null}
      </div>
    </ContextoMarco.Provider>
  );
}

interface Props {
  readonly children: ReactNode;
  /** Acciones de la cabecera (acceso institucional, cuenta, cerrar sesion). */
  readonly acciones?: ReactNode;
  /** Portada: el contenido gestiona su propio ancho (franjas a todo el ancho). */
  readonly completa?: boolean;
}

/** Contenido de una pagina dentro del marco: coloca sus acciones en la cabecera y fija su ancho. */
export function Estructura({ children, acciones, completa = false }: Props) {
  const marco = useContext(ContextoMarco);
  const hayAcciones = acciones !== undefined && acciones !== null && acciones !== false;
  const declarar = marco?.declarar;

  useLayoutEffect(() => {
    declarar?.(hayAcciones, completa);
    return () => declarar?.(false, false);
  }, [declarar, hayAcciones, completa]);

  return (
    <>
      {marco?.ranura && hayAcciones ? createPortal(acciones, marco.ranura) : null}
      {completa ? children : <div className="contenedor">{children}</div>}
    </>
  );
}
