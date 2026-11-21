import type {
  NuevaSesion,
  SesionConUsuario,
  SesionesPort,
} from '../aplicacion/puertos/sesiones.port';
import { ServicioNoDisponibleError } from '../dominio/errores';
import type { Sesion } from '../dominio/sesion';
import type { PrismaClient } from './prisma-cliente';

interface FilaSesion {
  id: string;
  usuarioId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

function aSesion(fila: FilaSesion): Sesion {
  return {
    id: fila.id,
    usuarioId: fila.usuarioId,
    createdAt: fila.createdAt,
    expiresAt: fila.expiresAt,
    revokedAt: fila.revokedAt,
  };
}

export class PrismaSesionesAdapter implements SesionesPort {
  constructor(private readonly prisma: PrismaClient) {}

  async crearSiUsuarioHabilitado(nueva: NuevaSesion): Promise<Sesion | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Bloquea la fila del usuario: una suspension concurrente espera a este commit o ya
        // fue confirmada, y en ese caso la consulta no devuelve filas.
        const habilitado = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM usuarios
          WHERE id = ${nueva.usuarioId}::uuid AND rol = 'ciudadano' AND estado = 'activo'
          FOR UPDATE`;
        if (habilitado.length === 0) return null;
        const fila = await tx.sesion.create({
          data: {
            usuarioId: nueva.usuarioId,
            tokenHash: nueva.tokenHash,
            createdAt: nueva.createdAt,
            expiresAt: nueva.expiresAt,
          },
        });
        return aSesion(fila);
      });
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async buscarVigente(tokenHash: string, ahora: Date): Promise<SesionConUsuario | null> {
    try {
      const fila = await this.prisma.sesion.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: ahora },
          usuario: { rol: 'ciudadano', estado: 'activo' },
        },
        include: { usuario: true },
      });
      if (!fila) return null;
      const { usuario } = fila;
      return {
        sesion: aSesion(fila),
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          correoNormalizado: usuario.correoNormalizado,
          passwordHash: usuario.passwordHash,
          rol: usuario.rol,
          estado: usuario.estado,
          createdAt: usuario.createdAt,
        },
      };
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async revocar(tokenHash: string, ahora: Date): Promise<void> {
    try {
      await this.prisma.sesion.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: ahora },
      });
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async revocarTodasDe(usuarioId: string, ahora: Date): Promise<number> {
    try {
      const r = await this.prisma.sesion.updateMany({
        where: { usuarioId, revokedAt: null },
        data: { revokedAt: ahora },
      });
      return r.count;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }
}
