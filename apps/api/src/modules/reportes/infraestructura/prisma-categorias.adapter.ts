import type { PrismaClient } from '../../../generated/prisma/client';
import type { CategoriasRepositorio } from '../aplicacion/categorias.use-case';
import type { Categoria } from '../dominio/categorias';

export class PrismaCategoriasAdapter implements CategoriasRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(): Promise<readonly Categoria[]> {
    return this.prisma.categoria.findMany({
      select: { id: true, nombre: true, orden: true, activa: true },
      orderBy: { orden: 'asc' },
    });
  }
}
