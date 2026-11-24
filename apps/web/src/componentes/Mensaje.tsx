import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './iconos';

export type TipoMensaje = 'info' | 'exito' | 'aviso' | 'error';

const ICONO: Record<TipoMensaje, NombreIcono> = { info: 'info', exito: 'exito', aviso: 'aviso', error: 'error' };

interface Props {
  readonly tipo: TipoMensaje;
  readonly titulo?: string;
  readonly children?: ReactNode;
  /** Accion para continuar cuando corresponda (por ejemplo, «Reintentar»). */
  readonly accion?: ReactNode;
}

/**
 * Mensaje con texto E icono (el color nunca es el unico indicador). Los errores se anuncian de forma
 * asertiva; el resto, como estado.
 */
export function Mensaje({ tipo, titulo, children, accion }: Props) {
  return (
    <div className={`mensaje mensaje--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono nombre={ICONO[tipo]} clase="mensaje__icono" />
      <div className="mensaje__cuerpo">
        {titulo ? <p className="mensaje__titulo">{titulo}</p> : null}
        {children ? <p>{children}</p> : null}
        {accion}
      </div>
    </div>
  );
}
