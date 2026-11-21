import { PLAZO_ENVIO_MS } from '../dominio/envio-correo';
import type { ContextoTransaccional, EnviosCorreoPort } from './puertos/envios-correo.port';
import type { RelojPort } from './puertos/reloj.port';

/**
 * Capacidad reutilizable de invitacion: encola el correo de activacion de una cuenta que ya esta
 * en estado `pendiente_activacion`. NO crea cuentas, operadores ni sedes: quien la consume (Spec
 * 06) crea la cuenta y llama a esta capacidad dentro de la misma transaccion, de modo que si esa
 * transaccion se revierte no queda ni cuenta ni envio.
 *
 * El correo se entrega despues del commit: el llamador debe invocar `despertar()` del gestor de
 * envios una vez confirmada su transaccion. El token se genera al enviar, no aqui.
 */
export class InvitarCuentaUseCase {
  constructor(
    private readonly envios: EnviosCorreoPort,
    private readonly reloj: RelojPort,
  ) {}

  /** Devuelve false si ya habia una invitacion activa para ese usuario. */
  async ejecutar(usuarioId: string, tx: ContextoTransaccional): Promise<boolean> {
    const ahora = this.reloj.ahora();
    return this.envios.encolar(
      {
        usuarioId,
        tipo: 'activacion',
        creadoAt: ahora,
        venceAt: new Date(ahora.getTime() + PLAZO_ENVIO_MS.activacion),
      },
      tx,
    );
  }
}
