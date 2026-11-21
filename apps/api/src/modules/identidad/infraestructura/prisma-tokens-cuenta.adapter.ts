import type {
  ConsultaToken,
  ConsumoToken,
  NuevoTokenCuenta,
  ResultadoConsumo,
  TokensCuentaPort,
} from '../aplicacion/puertos/tokens-cuenta.port';
import { ServicioNoDisponibleError } from '../dominio/errores';
import { clasificarToken, type PropositoToken } from '../dominio/token-cuenta';
import type { PrismaClient } from './prisma-cliente';

interface FilaConsulta {
  proposito: string;
  usuarioId: string;
  expiresAt: Date;
  usedAt: Date | null;
  invalidadoAt: Date | null;
}

/** Sirve para revertir la transaccion devolviendo un resultado en lugar de un error. */
class RevertirConResultado extends Error {
  constructor(readonly resultado: ResultadoConsumo) {
    super('revertir');
  }
}

export class PrismaTokensCuentaAdapter implements TokensCuentaPort {
  constructor(private readonly prisma: PrismaClient) {}

  async emitir(nuevo: NuevoTokenCuenta): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE tokens_cuenta
             SET invalidado_at = ${nuevo.createdAt}::timestamptz
           WHERE usuario_id = ${nuevo.usuarioId}::uuid
             AND proposito = ${nuevo.proposito}::"PropositoToken"
             AND used_at IS NULL AND invalidado_at IS NULL`;
        await tx.$executeRaw`
          INSERT INTO tokens_cuenta (usuario_id, proposito, token_hash, created_at, expires_at)
          VALUES (${nuevo.usuarioId}::uuid, ${nuevo.proposito}::"PropositoToken", ${nuevo.tokenHash},
                  ${nuevo.createdAt}::timestamptz, ${nuevo.expiresAt}::timestamptz)`;
      });
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async consultar(tokenHash: string, ahora: Date): Promise<ConsultaToken> {
    try {
      const filas = await this.prisma.$queryRaw<FilaConsulta[]>`
        SELECT proposito::text AS proposito, usuario_id AS "usuarioId", expires_at AS "expiresAt",
               used_at AS "usedAt", invalidado_at AS "invalidadoAt"
          FROM tokens_cuenta WHERE token_hash = ${tokenHash}`;
      const fila = filas[0];
      if (!fila) return { estado: 'invalido' };
      const estado = clasificarToken(fila, ahora);
      if (estado !== 'vigente') return { estado };
      return { estado, proposito: fila.proposito as PropositoToken, expiresAt: fila.expiresAt };
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async consumir(c: ConsumoToken): Promise<ResultadoConsumo> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<ResultadoConsumo> => {
        const filas = await tx.$queryRaw<FilaConsulta[]>`
          SELECT proposito::text AS proposito, usuario_id AS "usuarioId", expires_at AS "expiresAt",
                 used_at AS "usedAt", invalidado_at AS "invalidadoAt"
            FROM tokens_cuenta WHERE token_hash = ${c.tokenHash}`;
        const fila = filas[0];
        if (!fila || fila.proposito !== c.proposito) return { resultado: 'invalido' };

        // Bloquea al usuario: los consumos simultaneos de sus tokens se serializan aqui.
        const cuentas = await tx.$queryRaw<{ rol: string; estado: string }[]>`
          SELECT rol::text AS rol, estado::text AS estado
            FROM usuarios WHERE id = ${fila.usuarioId}::uuid FOR UPDATE`;
        const cuenta = cuentas[0];
        if (!cuenta) return { resultado: 'invalido' };

        // Uso unico: solo una transaccion logra marcarlo; la condicion se reevalua tras el bloqueo.
        const marcados = await tx.$queryRaw<{ id: string }[]>`
          UPDATE tokens_cuenta SET used_at = ${c.ahora}::timestamptz
           WHERE token_hash = ${c.tokenHash}
             AND used_at IS NULL AND invalidado_at IS NULL
             AND expires_at > ${c.ahora}::timestamptz
          RETURNING id`;
        if (marcados.length === 0) {
          const actual = await tx.$queryRaw<FilaConsulta[]>`
            SELECT proposito::text AS proposito, usuario_id AS "usuarioId", expires_at AS "expiresAt",
                   used_at AS "usedAt", invalidado_at AS "invalidadoAt"
              FROM tokens_cuenta WHERE token_hash = ${c.tokenHash}`;
          const reclasificado = actual[0] ? clasificarToken(actual[0], c.ahora) : 'usado';
          return { resultado: reclasificado === 'vigente' ? 'usado' : reclasificado };
        }

        const apta =
          c.proposito === 'recuperacion'
            ? cuenta.rol === 'ciudadano' && cuenta.estado === 'activo'
            : cuenta.estado === 'pendiente_activacion';
        // No se distingue la causa: una cuenta suspendida o inadecuada es un token invalido.
        if (!apta) throw new RevertirConResultado({ resultado: 'invalido' });

        if (c.proposito === 'recuperacion') {
          await tx.$executeRaw`
            UPDATE usuarios SET password_hash = ${c.nuevoPasswordHash}, updated_at = now()
             WHERE id = ${fila.usuarioId}::uuid`;
        } else {
          await tx.$executeRaw`
            UPDATE usuarios SET password_hash = ${c.nuevoPasswordHash}, estado = 'activo', updated_at = now()
             WHERE id = ${fila.usuarioId}::uuid`;
        }
        await tx.$executeRaw`
          UPDATE tokens_cuenta SET invalidado_at = ${c.ahora}::timestamptz
           WHERE usuario_id = ${fila.usuarioId}::uuid
             AND used_at IS NULL AND invalidado_at IS NULL`;
        await tx.$executeRaw`
          UPDATE sesiones SET revoked_at = ${c.ahora}::timestamptz
           WHERE usuario_id = ${fila.usuarioId}::uuid AND revoked_at IS NULL`;
        return { resultado: 'consumido', usuarioId: fila.usuarioId };
      });
    } catch (error) {
      if (error instanceof RevertirConResultado) return error.resultado;
      throw new ServicioNoDisponibleError(error);
    }
  }
}
