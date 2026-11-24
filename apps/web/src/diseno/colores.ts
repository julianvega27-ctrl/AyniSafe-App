/**
 * Tokens de color de la guia de UI (docs/05-diseno-ui/guia-ui.md): azul profundo, verde azulado, fondos
 * claros. `estilos.css` declara los mismos valores como variables CSS; una prueba comprueba que no
 * difieran y que cada par de texto cumpla WCAG AA (4,5:1; 3:1 para bordes y elementos graficos).
 */
export const COLORES = {
  '--color-azul': '#17324D',
  '--color-verde': '#007F78',
  '--color-enlace': '#006B65',
  '--color-azul-hover': '#24496C',
  '--color-fondo': '#F5F7FA',
  '--color-banda': '#E9EFF1',
  '--color-divisor': '#C5D2D6',
  '--color-superficie': '#FFFFFF',
  '--color-texto': '#172B3A',
  '--color-texto-suave': '#46586A',
  '--color-borde': '#5B6B78',
  '--color-info-fondo': '#E7F1F8',
  '--color-info-texto': '#17324D',
  '--color-exito-fondo': '#E6F4EC',
  '--color-exito-texto': '#0B5B35',
  '--color-aviso-fondo': '#FFF4DB',
  '--color-aviso-texto': '#5C3B00',
  '--color-error-fondo': '#FDECEC',
  '--color-error-texto': '#8A1C1C',
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
