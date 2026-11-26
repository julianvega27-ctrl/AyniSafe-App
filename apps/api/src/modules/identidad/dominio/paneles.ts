import type { RolInstitucional } from './usuario';

export interface SeccionPanel {
  readonly id: string;
  readonly titulo: string;
  /** Falso mientras la capacidad no exista: la web la declara «aun no disponible». */
  readonly disponible: boolean;
}

/**
 * Secciones de cada panel segun la guia de UI (2.3). Solo estan disponibles las de organizacion del
 * administrador (P3.2): Instituciones y sedes, Operadores y Coberturas. Inicio es un resumen pendiente
 * (no un tablero de metricas) e Historial se limita al autorizado cuando exista.
 */
const SECCIONES: Readonly<Record<RolInstitucional, readonly SeccionPanel[]>> = {
  operador: [
    { id: 'inicio', titulo: 'Inicio', disponible: false },
    { id: 'incidentes', titulo: 'Incidentes', disponible: false },
    { id: 'mapa', titulo: 'Mapa', disponible: false },
    { id: 'indicadores', titulo: 'Indicadores', disponible: false },
    { id: 'historial', titulo: 'Historial', disponible: false },
  ],
  administrador: [
    { id: 'inicio', titulo: 'Inicio', disponible: false },
    { id: 'instituciones-sedes', titulo: 'Instituciones y sedes', disponible: true },
    { id: 'operadores', titulo: 'Operadores', disponible: true },
    { id: 'coberturas', titulo: 'Coberturas', disponible: true },
    { id: 'categorias', titulo: 'Categorías', disponible: false },
    { id: 'reglas', titulo: 'Reglas', disponible: false },
    { id: 'contenido-contactos', titulo: 'Contenido y contactos', disponible: false },
    { id: 'historial', titulo: 'Historial', disponible: false },
  ],
};

export function seccionesDelPanel(rol: RolInstitucional): readonly SeccionPanel[] {
  return SECCIONES[rol];
}
