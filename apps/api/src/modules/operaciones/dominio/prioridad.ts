/**
 * Prioridad del incidente (P6 grupo C, RF12, documento 11 §4). La tabla `prioridad-categoria-v1` fue
 * aprobada el 23/11/2026 y vive aqui como configuracion versionada, sin edicion desde el panel. No
 * es una escala clinica ni decide despacho, y nunca reordena la bandeja FIFO. Sin configuracion
 * valida, el incidente queda SIN_EVALUAR (no se asume NORMAL).
 */
export const PRIORIDADES = ['SIN_EVALUAR', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export type PrioridadAsignable = Exclude<Prioridad, 'SIN_EVALUAR'>;
export type OrigenPrioridad = 'propuesta' | 'revisada';

export const VERSION_PRIORIDAD = 'prioridad-categoria-v1';

/** Las 16 categorias del catalogo cerrado (modulo Reportes) con su prioridad inicial aprobada. */
export const TABLA_PRIORIDAD: Readonly<Record<string, PrioridadAsignable>> = {
  'emergencia-medica': 'URGENTE',
  incendio: 'URGENTE',
  'accidente-transito': 'ALTA',
  acoso: 'ALTA',
  agresion: 'ALTA',
  asalto: 'ALTA',
  'danos-sismo': 'ALTA',
  deslizamiento: 'ALTA',
  inundacion: 'ALTA',
  pelea: 'ALTA',
  robo: 'ALTA',
  violencia: 'ALTA',
  'actividad-sospechosa': 'NORMAL',
  'otra-emergencia': 'NORMAL',
  'otro-incidente-seguridad': 'NORMAL',
  vandalismo: 'NORMAL',
};

export interface ConfiguracionPrioridad {
  readonly version: string;
  readonly tabla: Readonly<Record<string, string>>;
}

export const CONFIGURACION_PRIORIDAD: ConfiguracionPrioridad = { version: VERSION_PRIORIDAD, tabla: TABLA_PRIORIDAD };

const ASIGNABLES: readonly string[] = ['NORMAL', 'ALTA', 'URGENTE'];

/** Valida la configuracion: version con formato, exactamente las categorias esperadas y valores admitidos. */
export function configuracionValida(c: ConfiguracionPrioridad | null | undefined, categorias: readonly string[]): boolean {
  if (!c || !/^[a-z0-9-]{1,40}$/.test(c.version)) return false;
  const claves = Object.keys(c.tabla);
  if (claves.length !== categorias.length || !categorias.every((id) => claves.includes(id))) return false;
  return claves.every((k) => ASIGNABLES.includes(c.tabla[k]!));
}

/** Prioridad propuesta por la categoria, o null si la configuracion no es valida (queda SIN_EVALUAR). */
export function propuestaPrioridad(
  categoriaId: string,
  c: ConfiguracionPrioridad | null | undefined = CONFIGURACION_PRIORIDAD,
  categorias: readonly string[] = Object.keys(TABLA_PRIORIDAD),
): { readonly valor: PrioridadAsignable; readonly version: string } | null {
  if (!c || !configuracionValida(c, categorias)) return null;
  const valor = c.tabla[categoriaId];
  return valor ? { valor: valor as PrioridadAsignable, version: c.version } : null;
}
