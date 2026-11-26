/**
 * Catalogo cerrado de las 16 categorias del documento 09 (seccion 4). Los identificadores son
 * estables: otras capacidades guardan el ID, nunca el nombre visible. La migracion inserta las
 * mismas filas; este dominio es la referencia para validar que la BD no se aparto de ella.
 */
export interface Categoria {
  readonly id: string;
  readonly nombre: string;
  readonly orden: number;
  readonly activa: boolean;
}

export const CATEGORIAS_PILOTO: readonly Omit<Categoria, 'activa'>[] = [
  { id: 'accidente-transito', nombre: 'Accidente de tránsito', orden: 1 },
  { id: 'acoso', nombre: 'Acoso', orden: 2 },
  { id: 'actividad-sospechosa', nombre: 'Actividad sospechosa', orden: 3 },
  { id: 'agresion', nombre: 'Agresión', orden: 4 },
  { id: 'asalto', nombre: 'Asalto', orden: 5 },
  { id: 'danos-sismo', nombre: 'Daños por sismo', orden: 6 },
  { id: 'deslizamiento', nombre: 'Deslizamiento', orden: 7 },
  { id: 'emergencia-medica', nombre: 'Emergencia médica', orden: 8 },
  { id: 'incendio', nombre: 'Incendio', orden: 9 },
  { id: 'inundacion', nombre: 'Inundación', orden: 10 },
  { id: 'otra-emergencia', nombre: 'Otra emergencia', orden: 11 },
  { id: 'otro-incidente-seguridad', nombre: 'Otro incidente de seguridad', orden: 12 },
  { id: 'pelea', nombre: 'Pelea', orden: 13 },
  { id: 'robo', nombre: 'Robo', orden: 14 },
  { id: 'vandalismo', nombre: 'Vandalismo', orden: 15 },
  { id: 'violencia', nombre: 'Violencia', orden: 16 },
];

/** Fallo al leer el catalogo. No lleva detalles del almacenamiento. */
export class CatalogoNoDisponibleError extends Error {
  constructor() {
    super('Catalogo de categorias no disponible');
    this.name = 'CatalogoNoDisponibleError';
  }
}

/** Ordena por `orden` y devuelve solo los campos publicos, sin reglas ni prioridades. */
export function aCatalogoPublico(filas: readonly Categoria[]): Categoria[] {
  return [...filas]
    .sort((a, b) => a.orden - b.orden)
    .map(({ id, nombre, orden, activa }) => ({ id, nombre, orden, activa }));
}
