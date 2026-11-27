/**
 * Tokens web de la referencia elegida en DESIGN.md. `estilos.css` declara los mismos valores;
 * los roles de texto/borde mantienen el contraste exigido por AyniSafe. Una prueba comprueba que no
 * difieran y que cada par de texto cumpla WCAG AA (4,5:1; 3:1 para bordes y elementos graficos).
 */
export const COLORES = {
  '--color-azul': '#203843',
  '--color-verde': '#177571',
  '--color-enlace': '#0E7774',
  '--color-azul-hover': '#0B6058',
  '--color-fondo': '#F4F7F7',
  '--color-banda': '#E8F2E7',
  '--color-divisor': '#E3EBEC',
  '--color-superficie': '#FFFFFF',
  '--color-texto': '#203843',
  '--color-texto-suave': '#537179',
  '--color-borde': '#668087',
  '--color-info-fondo': '#EAF4F4',
  '--color-info-texto': '#286769',
  '--color-exito-fondo': '#E9F6E9',
  '--color-exito-texto': '#337944',
  '--color-aviso-fondo': '#FFF4E3',
  '--color-aviso-texto': '#92400E',
  '--color-error-fondo': '#FFF0ED',
  '--color-error-texto': '#9E453F',
  '--color-prioridad-pendiente-texto': '#475569',
  '--color-prioridad-pendiente-fondo': '#F1F5F9',
  '--color-prioridad-pendiente-borde': '#CBD5E1',
  '--color-prioridad-normal-texto': '#1E40AF',
  '--color-prioridad-normal-fondo': '#EFF6FF',
  '--color-prioridad-normal-borde': '#BFDBFE',
  '--color-prioridad-alta-texto': '#92400E',
  '--color-prioridad-alta-fondo': '#FFFBEB',
  '--color-prioridad-alta-borde': '#FCD34D',
  '--color-prioridad-urgente-texto': '#991B1B',
  '--color-prioridad-urgente-fondo': '#FEF2F2',
  '--color-prioridad-urgente-borde': '#F87171',
  '--color-accion': '#137D72',
  '--color-portada-fondo': '#FAFBF7',
  '--color-portada-texto': '#183E41',
  '--color-portada-suave': '#58716C',
} as const;

export interface ParDeColor {
  readonly nombre: string;
  readonly texto: keyof typeof COLORES;
  readonly fondo: keyof typeof COLORES;
  /** Minimo exigido: 4,5 para texto normal, 3 para bordes e iconos. */
  readonly minimo: number;
}

/** Combinaciones realmente usadas en la web. */
export const PARES_DE_COLOR: readonly ParDeColor[] = [
  { nombre: 'prioridad sin evaluar del origen', texto: '--color-prioridad-pendiente-texto', fondo: '--color-prioridad-pendiente-fondo', minimo: 4.5 },
  { nombre: 'prioridad normal del origen', texto: '--color-prioridad-normal-texto', fondo: '--color-prioridad-normal-fondo', minimo: 4.5 },
  { nombre: 'prioridad alta del origen', texto: '--color-prioridad-alta-texto', fondo: '--color-prioridad-alta-fondo', minimo: 4.5 },
  { nombre: 'prioridad urgente del origen', texto: '--color-prioridad-urgente-texto', fondo: '--color-prioridad-urgente-fondo', minimo: 4.5 },
  { nombre: 'accion principal de referencia', texto: '--color-superficie', fondo: '--color-accion', minimo: 4.5 },
  { nombre: 'texto de portada', texto: '--color-portada-texto', fondo: '--color-portada-fondo', minimo: 4.5 },
  { nombre: 'texto secundario de portada', texto: '--color-portada-suave', fondo: '--color-portada-fondo', minimo: 4.5 },
  { nombre: 'texto sobre fondo', texto: '--color-texto', fondo: '--color-fondo', minimo: 4.5 },
  { nombre: 'texto sobre superficie', texto: '--color-texto', fondo: '--color-superficie', minimo: 4.5 },
  { nombre: 'texto suave sobre fondo', texto: '--color-texto-suave', fondo: '--color-fondo', minimo: 4.5 },
  { nombre: 'texto suave sobre superficie', texto: '--color-texto-suave', fondo: '--color-superficie', minimo: 4.5 },
  { nombre: 'titulos azules sobre fondo', texto: '--color-azul', fondo: '--color-fondo', minimo: 4.5 },
  { nombre: 'titulos azules sobre superficie', texto: '--color-azul', fondo: '--color-superficie', minimo: 4.5 },
  { nombre: 'boton primario', texto: '--color-superficie', fondo: '--color-azul', minimo: 4.5 },
  { nombre: 'boton primario al pasar el cursor', texto: '--color-superficie', fondo: '--color-azul-hover', minimo: 4.5 },
  { nombre: 'texto sobre franja de la portada', texto: '--color-texto', fondo: '--color-banda', minimo: 4.5 },
  { nombre: 'texto suave sobre franja de la portada', texto: '--color-texto-suave', fondo: '--color-banda', minimo: 4.5 },
  { nombre: 'titulos azules sobre franja de la portada', texto: '--color-azul', fondo: '--color-banda', minimo: 4.5 },
  { nombre: 'enlace sobre fondo', texto: '--color-enlace', fondo: '--color-fondo', minimo: 4.5 },
  { nombre: 'enlace sobre superficie', texto: '--color-enlace', fondo: '--color-superficie', minimo: 4.5 },
  { nombre: 'enlace sobre mensaje informativo', texto: '--color-enlace', fondo: '--color-info-fondo', minimo: 4.5 },
  { nombre: 'mensaje informativo', texto: '--color-info-texto', fondo: '--color-info-fondo', minimo: 4.5 },
  { nombre: 'mensaje de exito', texto: '--color-exito-texto', fondo: '--color-exito-fondo', minimo: 4.5 },
  { nombre: 'mensaje de aviso', texto: '--color-aviso-texto', fondo: '--color-aviso-fondo', minimo: 4.5 },
  { nombre: 'mensaje de error', texto: '--color-error-texto', fondo: '--color-error-fondo', minimo: 4.5 },
  { nombre: 'borde de campo sobre superficie', texto: '--color-borde', fondo: '--color-superficie', minimo: 3 },
  { nombre: 'anillo de foco sobre fondo', texto: '--color-azul', fondo: '--color-fondo', minimo: 3 },
];

function lineal(canal: number): number {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lineal((n >> 16) & 255) + 0.7152 * lineal((n >> 8) & 255) + 0.0722 * lineal(n & 255);
}

/** Relacion de contraste WCAG 2.x entre dos colores #RRGGBB. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
