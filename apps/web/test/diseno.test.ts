import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORES, PARES_DE_COLOR, contraste } from '../src/diseno/colores';

const css = readFileSync(resolve(__dirname, '../src/estilos.css'), 'utf8');

describe('tokens y contraste (guia de UI, WCAG AA)', () => {
  it.each(PARES_DE_COLOR)('$nombre cumple el contraste minimo', ({ texto, fondo, minimo }) => {
    expect(contraste(COLORES[texto], COLORES[fondo])).toBeGreaterThanOrEqual(minimo);
  });

  it('usa los roles de color de la referencia elegida en DESIGN.md', () => {
    expect(COLORES['--color-azul']).toBe('#203843');
    expect(COLORES['--color-verde']).toBe('#177571');
    expect(COLORES['--color-fondo']).toBe('#F4F7F7');
    expect(COLORES['--color-texto']).toBe('#203843');
    expect(COLORES['--color-enlace']).toBe('#0E7774');
  });

  it('carga las familias elegidas desde recursos propios sin importar estilos remotos', () => {
    const adaptacion = readFileSync(resolve(__dirname, '../src/diseno/adaptacion-publica.css'), 'utf8');
    const referencia = readFileSync(resolve(__dirname, '../src/diseno/referencia-publica.css'), 'utf8');
    expect(adaptacion).toContain("font-family: 'DM Sans'");
    expect(adaptacion).toContain('font-family: Manrope');
    expect(adaptacion).toContain("url('/fuentes/DM-Sans.ttf')");
    expect(adaptacion).toContain("url('/fuentes/Manrope.ttf')");
    expect(`${css}\n${adaptacion}\n${referencia}`).not.toMatch(/@import\s+url\(['"]?https?:/);
  });

  it('estilos.css declara exactamente los mismos valores que colores.ts', () => {
    for (const [nombre, valor] of Object.entries(COLORES)) {
      const m = new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      expect(m, `${nombre} declarado en estilos.css`).not.toBeNull();
      expect(m![1]!.toLowerCase()).toBe(valor.toLowerCase());
    }
  });

  // Valores literales del marco institucional del origen (referencia-institucional.css), con sus adaptaciones.
  it.each([
    ['destino del lateral', '#C2D6D8', '#133941', 4.5],
    ['«Aún no disponible» en el lateral', '#A9CBCC', '#133941', 4.5],
    ['destino activo', '#FFFFFF', '#265D59', 4.5],
    ['«Aún no disponible» en destino activo', '#DCEBEC', '#265D59', 4.5],
    ['destino al pasar el cursor', '#FFFFFF', '#28645D', 4.5],
    ['subtitulo de marca', '#9FC5C5', '#133941', 4.5],
    ['etiqueta de plataforma', '#86A6A8', '#133941', 4.5],
    ['lema del pie lateral', '#91B4B6', '#133941', 4.5],
    ['boton de avisos', '#20565A', '#F7FBFA', 4.5],
    ['inicial del avatar', '#136E63', '#E5F5EE', 4.5],
    ['antetitulo', COLORES['--color-accion'], COLORES['--color-fondo'], 4.5],
    ['cerrar sesion', COLORES['--color-error-texto'], '#FFFFFF', 4.5],
    ['anillo de foco en el lateral', '#7AD8AB', '#133941', 3],
    // Bandeja y pendientes (P4.2): tabla del origen con la cabecera ajustada al texto suave.
    ['cabecera de tabla', COLORES['--color-texto-suave'], '#F9FBFB', 4.5],
    ['nombre en la tabla', '#253F47', '#FFFFFF', 4.5],
    ['fila enlazada al pasar el cursor', '#203843', '#F2F9F6', 4.5],
    ['referencia en la fila resaltada', COLORES['--color-texto-suave'], '#F2F9F6', 4.5],
    ['etiqueta de la fila', '#476D70', '#ECF3F2', 4.5],
    ['condicion medica por confirmar', COLORES['--color-aviso-texto'], COLORES['--color-aviso-fondo'], 4.5],
    ['foco de la fila enlazada', COLORES['--color-accion'], '#F2F9F6', 3],
  ] as const)('marco institucional: %s cumple el contraste minimo', (_n, texto, fondo, minimo) => {
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(minimo);
  });

  it('el marco institucional no importa estilos remotos y mantiene objetivos de 48 px', () => {
    const institucional = readFileSync(resolve(__dirname, '../src/diseno/referencia-institucional.css'), 'utf8');
    expect(institucional).not.toMatch(/@import|https?:/);
    for (const clase of ['nav-item', 'notification-button', 'account-trigger']) {
      expect(institucional).toMatch(new RegExp(`\\.${clase}\\s*{[^}]*min-height:\\s*var\\(--altura-minima\\)`));
    }
  });

  it('el calculo de contraste coincide con valores de referencia', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contraste('#007F78', '#F5F7FA')).toBeCloseTo(4.54, 1); // vector histórico del cálculo, no paleta vigente
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
