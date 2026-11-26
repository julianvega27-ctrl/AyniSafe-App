import { aCatalogoPublico, CatalogoNoDisponibleError, type Categoria } from '../dominio/categorias';

/** Puerto de lectura del catalogo. Solo lectura: no existen altas, renombres ni borrados. */
export interface CategoriasRepositorio {
  listar(): Promise<readonly Categoria[]>;
}

export class ConsultarCategorias {
  constructor(private readonly repositorio: CategoriasRepositorio) {}

  /** Catalogo publico ordenado. Cualquier fallo del almacenamiento se traduce a no disponible. */
  async listar(): Promise<Categoria[]> {
    let filas: readonly Categoria[];
    try {
      filas = await this.repositorio.listar();
    } catch {
      throw new CatalogoNoDisponibleError();
    }
    return aCatalogoPublico(filas);
  }

  /** Identificadores de categorias activas: lo que otra capacidad puede referenciar. */
  async idsActivos(): Promise<ReadonlySet<string>> {
    return new Set((await this.listar()).filter((c) => c.activa).map((c) => c.id));
  }
}
