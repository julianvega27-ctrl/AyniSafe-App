import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORES, PARES_DE_COLOR, contraste } from '../src/diseno/colores';

const css = readFileSync(resolve(__dirname, '../src/estilos.css'), 'utf8');

describe('tokens y contraste (guia de UI, WCAG AA)', () => {
  it.each(PARES_DE_COLOR)('$nombre cumple el contraste minimo', ({ texto, fondo, minimo }) => {
    expect(contraste(COLORES[texto], COLORES[fondo])).toBeGreaterThanOrEqual(minimo);
  });

  it('usa la paleta de la guia: azul, verde azulado, fondo y texto', () => {
    expect(COLORES['--color-azul']).toBe('#17324D');
    expect(COLORES['--color-verde']).toBe('#007F78');
    expect(COLORES['--color-fondo']).toBe('#F5F7FA');
    expect(COLORES['--color-texto']).toBe('#172B3A');
    // El texto de enlaces sobre fondos tintados usa #006B65, no el verde azulado (4,54:1 sobre el fondo).
    expect(COLORES['--color-enlace']).toBe('#006B65');
  });

  it('el verde azulado de la guia no se usa como color de texto', () => {
    expect(css).not.toMatch(/color:\s*var\(--color-verde\)/);
  });

  it('estilos.css declara exactamente los mismos valores que colores.ts', () => {
    for (const [nombre, valor] of Object.entries(COLORES)) {
      const m = new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      expect(m, `${nombre} declarado en estilos.css`).not.toBeNull();
      expect(m![1]!.toLowerCase()).toBe(valor.toLowerCase());
    }
  });

  it('el calculo de contraste coincide con valores de referencia', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contraste('#007F78', '#F5F7FA')).toBeCloseTo(4.54, 1); // dato de la guia de UI
  });

  it('los controles tienen altura minima de 48 px y el texto base es de 16 px', () => {
    expect(css).toMatch(/--altura-minima:\s*48px/);
    expect(css).toMatch(/\.boton\s*{[^}]*min-height:\s*var\(--altura-minima\)/);
    expect(css).toMatch(/\.campo__entrada\s*{[^}]*min-height:\s*var\(--altura-minima\)/);
    expect(css).toMatch(/body\s*{[^}]*font-size:\s*1rem/);
    expect(css).toMatch(/html\s*{[^}]*font-size:\s*100%/);
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px/);
  });
});
