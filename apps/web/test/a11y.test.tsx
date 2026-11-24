import { screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { admin, instalarApi, renderizarApp, servidorFalso } from './api-falsa';

/**
 * Comprobacion automatizada basica con axe-core. jsdom no calcula estilos ni layout, por lo que el
 * contraste se verifica aparte (diseno.test.ts) y la revision con lector de pantalla y zoom queda manual.
 */
async function auditar(contenedor: HTMLElement) {
  const r = await axe.run(contenedor, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    resultTypes: ['violations'],
  });
  return r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

describe('accesibilidad automatizada (axe-core)', () => {
  it('portada', async () => {
    instalarApi(servidorFalso().manejador);
    const { container } = renderizarApp('/');
    await screen.findByText('Finalidad de prueba de AyniSafe.');
    expect(await auditar(container)).toEqual([]);
    // Jerarquia de encabezados: un h1 y secciones h2.
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelectorAll('h2').length).toBe(4);
  });

  it('acceso con etiquetas persistentes y controles con nombre accesible', async () => {
    instalarApi(servidorFalso().manejador);
    const { container } = renderizarApp('/acceso');
    await screen.findByLabelText('Correo');
    expect(await auditar(container)).toEqual([]);
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar' })).toBeInTheDocument();
  });

  it('panel del administrador', async () => {
    instalarApi(servidorFalso({ sesion: admin }).manejador);
    const { container } = renderizarApp('/panel');
    await screen.findByText('Instituciones y sedes');
    expect(await auditar(container)).toEqual([]);
  });

  it('activacion', async () => {
    window.history.replaceState(null, '', '/activar#t=tokenDeActivacionDePrueba_1234567890-ABCDEFG');
    instalarApi((l) =>
      l.ruta === '/api/v1/auth/tokens/consulta'
        ? { estado: 200, cuerpo: { proposito: 'activacion', expiresAt: 'x' } }
        : { estado: 404 },
    );
    const { container } = renderizarApp('/activar');
    await screen.findByLabelText('Contraseña nueva');
    expect(await auditar(container)).toEqual([]);
  });

  it('el idioma de la pagina es espanol y la pagina tiene titulo', () => {
    // index.html declara lang="es"; el titulo cambia por pagina.
    instalarApi(servidorFalso().manejador);
    renderizarApp('/acceso');
    expect(document.title).toBe('Acceso institucional · AyniSafe');
  });
});
