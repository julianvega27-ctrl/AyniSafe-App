import type { PurgaPort } from '../aplicacion/puertos/purga.port';
import { ServicioNoDisponibleError } from '../dominio/errores';
import type { PrismaClient } from './prisma-cliente';

export class PrismaPurgaAdapter implements PurgaPort {
  constructor(private readonly prisma: PrismaClient) {}

  async purgarSesionesAnterioresA(corte: Date, lote: number): Promise<number> {
    try {
      return await this.prisma.$executeRaw`
        DELETE FROM sesiones WHERE id IN (
          SELECT id FROM sesiones
          WHERE expires_at < ${corte}::timestamptz
             OR (revoked_at IS NOT NULL AND revoked_at < ${corte}::timestamptz)
          LIMIT ${lote})`;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async purgarVentanasAnterioresA(corte: Date, lote: number): Promise<number> {
    try {
      return await this.prisma.$executeRaw`
        DELETE FROM ventanas_intentos WHERE (tipo, clave_hash, ventana_inicio) IN (
          SELECT tipo, clave_hash, ventana_inicio FROM ventanas_intentos
          WHERE ventana_inicio < ${corte}::timestamptz
          LIMIT ${lote})`;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }
}
