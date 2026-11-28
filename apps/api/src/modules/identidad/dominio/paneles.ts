import type { RolInstitucional } from './usuario';

export interface SeccionPanel {
  readonly id: string;
  readonly titulo: string;
  /** Falso mientras la capacidad no exista: la web la declara «aun no disponible». */
  readonly disponible: boolean;
}

/**
 * Secciones de cada panel segun la guia de UI (2.3). Disponibles: organizacion del administrador
 * (P3.2: Instituciones y sedes, Operadores y Coberturas), Inicio del administrador limitado al bloque de
 * enrutamiento pendiente, la bandeja Incidentes del operador (P4.2) y su Mapa operativo (P7). El resto del resumen, el Inicio del
 * operador e Historial siguen pendientes; no hay tableros de metricas de ejemplo.
 */
const SECCIONES: Readonly<Record<RolInstitucional, readonly SeccionPanel[]>> = {
  operador: [
    { id: 'inicio', titulo: 'Inicio', disponible: false },
    { id: 'incidentes', titulo: 'Incidentes', disponible: true },
    { id: 'mapa', titulo: 'Mapa', disponible: true },
    { id: 'indicadores', titulo: 'Indicadores', disponible: false },
    { id: 'historial', titulo: 'Historial', disponible: false },
  ],
  administrador: [
    { id: 'inicio', titulo: 'Inicio', disponible: true },
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
