import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { contenido, instalarApi, json, renderizarApp, servidorFalso } from './api-falsa';

describe('portada publica', () => {
  it('sin sesion: muestra finalidad, funcionamiento, alcance del piloto y desarrolladores, sin pedir credenciales', async () => {
    const s = servidorFalso({ contenido: contenido({ piloto: { estado: 'aprobado', texto: 'Alcance de prueba del piloto.' } }) });
    const { llamadas } = instalarApi(s.manejador);
    renderizarApp('/');
    expect(await screen.findByText('Finalidad de prueba de AyniSafe.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finalidad' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Funcionamiento' })).toBeInTheDocument();
    expect(screen.getByText('Funcionamiento de prueba de AyniSafe.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alcance del piloto' })).toBeInTheDocument();
    expect(screen.getByText('Alcance de prueba del piloto.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desarrolladores' })).toBeInTheDocument();
    expect(screen.getByText(/Dev de Prueba — Desarrollador/)).toBeInTheDocument();
    // No hay panel ni formulario: la portada es publica y solo hay un acceso visible.
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta.includes('/panel'))).toBe(false);
  });

  it('el alcance del piloto pendiente se declara «aún no disponible» con icono, sin texto de reemplazo', async () => {
    instalarApi(servidorFalso().manejador);
    renderizarApp('/');
    const seccion = (await screen.findByRole('heading', { name: 'Alcance del piloto' })).closest('article')!;
    expect(seccion).toHaveTextContent('Aún no disponible');
    expect(seccion.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(seccion.querySelectorAll('p')).toHaveLength(1);
  });

  it('una seccion de desarrolladores pendiente tambien se declara no disponible', async () => {
    instalarApi(servidorFalso({ contenido: contenido({ desarrolladores: { estado: 'pendiente' } }) }).manejador);
    renderizarApp('/');
    const seccion = (await screen.findByRole('heading', { name: 'Desarrolladores' })).closest('section')!;
    expect(seccion).toHaveTextContent('Aún no disponible');
  });

  it('no incluye texto propio de contenido, numeros de emergencia ni registro de personas', async () => {
    instalarApi(servidorFalso().manejador);
    const { container } = renderizarApp('/');
    await screen.findByText('Finalidad de prueba de AyniSafe.');
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/\b(105|911|116|115|100)\b/);
    expect(screen.queryByRole('link', { name: /regist|crear cuenta|inscrib/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /regist|crear cuenta/i })).not.toBeInTheDocument();
  });

  it('el acceso institucional es visible, esta en el orden de tabulacion y lleva a /acceso', async () => {
    instalarApi(servidorFalso().manejador);
    renderizarApp('/');
    const enlace = await screen.findByRole('link', { name: 'Acceso institucional' });
    expect(enlace).toHaveAttribute('href', '/acceso');
    const usuario = userEvent.setup();
    await usuario.tab(); // «Saltar al contenido»
    await usuario.tab(); // marca
    await usuario.tab(); // Cómo funciona, en la cabecera de referencia
    await usuario.tab();
    expect(enlace).toHaveFocus();
    await usuario.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Acceso institucional' })).toBeInTheDocument();
  });

  it('con sesion vigente la portada sigue siendo publica y ofrece ir al panel sin repetir credenciales', async () => {
    const s = servidorFalso();
    s.estado.sesion = { id: 'x', nombre: 'Ana', correo: 'ana@ejemplo.com', rol: 'administrador' };
    instalarApi(s.manejador);
    renderizarApp('/');
    expect(await screen.findByText('Finalidad de prueba de AyniSafe.')).toBeInTheDocument();
    const enlace = await screen.findByRole('link', { name: 'Ir a mi panel' });
    expect(enlace).toHaveAttribute('href', '/panel');
    expect(screen.queryByRole('link', { name: 'Acceso institucional' })).not.toBeInTheDocument();
  });

  it('error de red o de servicio: muestra el problema con «Reintentar» y, al reintentar, carga', async () => {
    let falla: 'red' | 503 | null = 'red';
    const s = servidorFalso();
    instalarApi((l) => {
      if (l.ruta === '/api/v1/publico/contenido' && falla) return falla === 'red' ? 'red' : json(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
      return s.manejador(l);
    });
    renderizarApp('/');
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.queryByText('Finalidad de prueba de AyniSafe.')).not.toBeInTheDocument();
    falla = 503;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('El servicio no está disponible')).toBeInTheDocument();
    falla = null;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Finalidad de prueba de AyniSafe.')).toBeInTheDocument());
  });
});
