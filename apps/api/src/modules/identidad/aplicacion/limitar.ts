import { LimiteExcedidoError } from '../dominio/errores';
import type { ConsumoLimite, LimitadorPort } from './puertos/limitador.port';

/** Consume los limites indicados y lanza LimiteExcedidoError si alguno se supera. */
export async function aplicarLimites(
  limitador: LimitadorPort,
  consumos: readonly ConsumoLimite[],
  ahora: Date,
): Promise<void> {
  const resultado = await limitador.consumir(consumos, ahora);
  if (!resultado.permitido) throw new LimiteExcedidoError(resultado.reintentarEnSegundos);
}
