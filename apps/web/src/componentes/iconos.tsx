import type { ReactNode } from 'react';

/** Iconos decorativos: el significado siempre se dice tambien con texto (aria-hidden). */
function Base({ children, clase = 'icono' }: { children: ReactNode; clase?: string }) {
  return (
    <svg className={clase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export type NombreIcono = 'info' | 'exito' | 'aviso' | 'error' | 'reloj' | 'candado';

export function Icono({ nombre, clase }: { nombre: NombreIcono; clase?: string }) {
  switch (nombre) {
    case 'info':
      return (
        <Base clase={clase}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-5" />
          <path d="M12 8h.01" />
        </Base>
      );
    case 'exito':
      return (
        <Base clase={clase}>
          <circle cx="12" cy="12" r="10" />
          <path d="m8 12 3 3 5-6" />
        </Base>
      );
    case 'aviso':
      return (
        <Base clase={clase}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </Base>
      );
    case 'error':
      return (
        <Base clase={clase}>
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </Base>
      );
    case 'reloj':
      return (
        <Base clase={clase}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7v5l3 2" />
        </Base>
      );
    case 'candado':
      return (
        <Base clase={clase}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </Base>
      );
  }
}
