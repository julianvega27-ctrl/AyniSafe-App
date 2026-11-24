import type { RolInstitucional } from './usuario';

export interface SeccionPanel {
  readonly id: string;
  readonly titulo: string;
  /** Falso mientras la capacidad no exista: la web la declara «aun no disponible». */
  readonly disponible: boolean;
}

/** Secciones de cada panel segun la guia de UI (2.3). Ninguna esta construida todavia. */
const SECCIONES: Readonly<Record<RolInstitucional, readonly SeccionPanel[]>> = {
  operador: [
    { id: 'reportes', titulo: 'Reportes', disponible: false },
    { id: 'mapa', titulo: 'Mapa', disponible: false },
    { id: 'indicadores', titulo: 'Indicadores', disponible: false },
  ],
  administrador: [
    { id: 'instituciones-sedes', titulo: 'Instituciones y sedes', disponible: false },
    { id: 'operadores', titulo: 'Operadores', disponible: false },
    { id: 'coberturas', titulo: 'Coberturas', disponible: false },
    { id: 'categorias', titulo: 'Categorías', disponible: false },
    { id: 'reglas', titulo: 'Reglas', disponible: false },
    { id: 'contenido-contactos', titulo: 'Contenido y contactos', disponible: false },
  ],
};

export function seccionesDelPanel(rol: RolInstitucional): readonly SeccionPanel[] {
  return SECCIONES[rol];
}
