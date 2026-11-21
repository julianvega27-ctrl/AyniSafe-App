import type { CuentasPort, NuevaCuentaCiudadano } from '../aplicacion/puertos/cuentas.port';
import { CorreoEnUsoError, ServicioNoDisponibleError } from '../dominio/errores';
import type { Usuario } from '../dominio/usuario';
import type { PrismaClient } from './prisma-cliente';

interface FilaUsuario {
  id: string;
  nombre: string;
  correoNormalizado: string;
  passwordHash: string | null;
  rol: Usuario['rol'];
  estado: Usuario['estado'];
  createdAt: Date;
}

/** Fila devuelta por la consulta cruda del alta (rol y estado llegan como texto). */
type FilaCruda = Omit<FilaUsuario, 'rol' | 'estado'> & { rol: string; estado: string };

function aUsuario(fila: FilaUsuario | FilaCruda): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    correoNormalizado: fila.correoNormalizado,
    passwordHash: fila.passwordHash,
    rol: fila.rol as Usuario['rol'],
    estado: fila.estado as Usuario['estado'],
    createdAt: fila.createdAt,
  };
}

function esViolacionDeUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

export class PrismaCuentasAdapter implements CuentasPort {
  constructor(private readonly prisma: PrismaClient) {}

  async crearCiudadano(datos: NuevaCuentaCiudadano): Promise<Usuario> {
    try {
      // Una transaccion corta: el alta se confirma completa o no deja nada. La restriccion UNIQUE
      // de la base es la autoridad ante solicitudes concurrentes. Se usa ON CONFLICT DO NOTHING
      // en lugar de capturar el error: una violacion de unicidad hace que PostgreSQL escriba el
      // correo (dato personal) en su propio registro, y asi no se genera ninguna.
      const filas = await this.prisma.$transaction((tx) =>
        tx.$queryRaw<FilaCruda[]>`
          INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
          VALUES (${datos.nombre}, ${datos.correoNormalizado}, ${datos.passwordHash},
                  'ciudadano', 'activo', now())
          ON CONFLICT (correo_normalizado) DO NOTHING
          RETURNING id,
                    nombre,
                    correo_normalizado AS "correoNormalizado",
                    password_hash AS "passwordHash",
                    rol::text AS rol,
                    estado::text AS estado,
                    created_at AS "createdAt"`,
      );
      const fila = filas[0];
      if (!fila) throw new CorreoEnUsoError();
      return aUsuario(fila);
    } catch (error) {
      if (error instanceof CorreoEnUsoError) throw error;
      if (esViolacionDeUnicidad(error)) throw new CorreoEnUsoError();
      throw new ServicioNoDisponibleError(error);
    }
  }

  async buscarPorCorreo(correoNormalizado: string): Promise<Usuario | null> {
    try {
      const fila = await this.prisma.usuario.findUnique({ where: { correoNormalizado } });
      return fila ? aUsuario(fila) : null;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    try {
      const fila = await this.prisma.usuario.findUnique({ where: { id } });
      return fila ? aUsuario(fila) : null;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }
}
