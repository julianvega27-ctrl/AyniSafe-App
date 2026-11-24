import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variante = 'primario' | 'secundario' | 'enlace';

const clase = (variante: Variante, bloque?: boolean): string =>
  ['boton', variante !== 'primario' ? `boton--${variante}` : '', bloque ? 'boton--bloque' : ''].filter(Boolean).join(' ');

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variante?: Variante;
  /** Estado «cargando»: sigue enfocable y anuncia que esta ocupado, pero ignora nuevas pulsaciones. */
  readonly cargando?: boolean;
  readonly bloque?: boolean;
  readonly children: ReactNode;
}

/** Estados: normal, pulsado (CSS :active), cargando y deshabilitado. Altura minima de 48 px. */
export function Boton({ variante = 'primario', cargando = false, bloque, children, onClick, type = 'button', ...resto }: PropsBoton) {
  return (
    <button
      {...resto}
      type={type}
      className={clase(variante, bloque)}
      aria-busy={cargando || undefined}
      aria-disabled={cargando || undefined}
      onClick={(e) => {
        if (cargando) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}

export function BotonEnlace({ variante = 'primario', bloque, ...resto }: LinkProps & { variante?: Variante; bloque?: boolean }) {
  return <Link {...resto} className={clase(variante, bloque)} />;
}
