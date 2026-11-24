import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, instalarApi, json, operador, renderizarApp, servidorFalso } from './api-falsa';

describe('restauracion de la sesion (refrescar el navegador)', () => {
  it('con sesion vigente restaura el panel del rol tras consultar al servidor', async () => {
    const s = servidorFalso({ sesion: admin });
    const { llamadas } = instalarApi(s.manejador);
    renderizarApp('/panel');
    expect(await screen.findByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
    expect(llamadas[0]?.ruta).toBe('/api/v1/auth/institucional/sesion'); // consulta antes de mostrar nada privado
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
  });

  it('mientras consulta muestra «Comprobando tu sesión…» y no revela contenido del panel', async () => {
    let liberar: () => void = () => undefined;
    const espera = new Promise<void>((r) => {
      liberar = r;
    });
    const s = servidorFalso({ sesion: admin });
    instalarApi(async (l) => {
      if (l.ruta.endsWith('/institucional/sesion')) await espera;
      return s.manejador(l);
    });
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('Comprobando tu sesión…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Panel del administrador' })).not.toBeInTheDocument();
    liberar();
    expect(await screen.findByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
  });

  it('401: vuelve a /acceso con aviso y sin conservar datos del panel', async () => {
    instalarApi(servidorFalso({ sesion: null }).manejador);
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('Tu sesión no es válida o venció')).toBeInTheDocument();
    expect(screen.queryByText('Instituciones y sedes')).not.toBeInTheDocument();
  });

  it('red caida al restaurar: no asume sesion valida ni invalida y ofrece «Reintentar»', async () => {
    const s = servidorFalso({ sesion: admin });
    let sinRed = true;
    instalarApi((l) => (l.ruta.endsWith('/institucional/sesion') && sinRed ? 'red' : s.manejador(l)));
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Panel del administrador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acceso institucional' })).not.toBeInTheDocument();
    sinRed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
  });

  it('servicio no disponible al restaurar (arranque en frio): ofrece «Reintentar»', async () => {
    const s = servidorFalso({ sesion: admin });
    let caido = true;
    instalarApi((l) => (l.ruta.endsWith('/institucional/sesion') && caido ? json(504, { error: { code: 'X' } }) : s.manejador(l)));
    renderizarApp('/panel');
    expect(await screen.findByText('El servicio no está disponible')).toBeInTheDocument();
    caido = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
  });
});

describe('shell por rol', () => {
  it('administrador: secciones de administracion, todas «Aún no disponible», sin datos de ejemplo', async () => {
    instalarApi(servidorFalso({ sesion: admin }).manejador);
    renderizarApp('/panel');
    await screen.findByRole('heading', { name: 'Panel del administrador' });
    const nav = await screen.findByRole('navigation', { name: /secciones del panel del administrador/i });
    const items = within(nav).getAllByRole('listitem');
    expect(items.map((i) => i.textContent?.replace('Aún no disponible', '').trim())).toEqual([
      'Instituciones y sedes',
      'Operadores',
      'Coberturas',
      'Categorías',
      'Reglas',
      'Contenido y contactos',
    ]);
    for (const i of items) expect(i).toHaveTextContent('Aún no disponible');
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{2,}\s*(reportes|incidentes)/i);
  });

  it('operador: Reportes, Mapa e Indicadores, no disponibles', async () => {
    instalarApi(servidorFalso({ sesion: operador }).manejador);
    renderizarApp('/panel');
    await screen.findByRole('heading', { name: 'Panel del operador' });
    const nav = await screen.findByRole('navigation', { name: /secciones del panel del operador/i });
    expect(within(nav).getAllByRole('listitem').map((i) => i.textContent?.replace('Aún no disponible', '').trim())).toEqual([
      'Reportes',
      'Mapa',
      'Indicadores',
    ]);
  });

  it('un operador que abre la ruta del administrador no ve sus secciones: la API responde 403', async () => {
    const { llamadas } = instalarApi(servidorFalso({ sesion: operador }).manejador);
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('No tienes permiso para ver este panel')).toBeInTheDocument();
    expect(screen.queryByText('Instituciones y sedes')).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta === '/api/v1/administrador/panel')).toBe(true); // lo decide la API, no el cliente
    expect(screen.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute('href', '/panel');
  });

  it('manipular el estado del cliente no concede nada: las respuestas de la API mandan', async () => {
    // Un cliente alterado cree ser administrador, pero la API (sesion de operador) responde 403.
    const s = servidorFalso({ sesion: operador });
    instalarApi((l) => {
      if (l.ruta.endsWith('/institucional/sesion') && l.metodo === 'GET') return json(200, { usuario: { ...operador, rol: 'administrador' }, expiresAt: 'x' });
      return s.manejador(l);
    });
    renderizarApp('/panel');
    expect(await screen.findByText('No tienes permiso para ver este panel')).toBeInTheDocument();
    expect(screen.queryByText('Operadores')).not.toBeInTheDocument();
  });

  it('401 de la API durante el uso lleva al acceso', async () => {
    const s = servidorFalso({ sesion: admin });
    instalarApi((l) => (l.ruta === '/api/v1/administrador/panel' ? json(401, { error: { code: 'UNAUTHENTICATED' } }) : s.manejador(l)));
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('Tu sesión no es válida o venció')).toBeInTheDocument();
  });

  it('fallo de red al cargar el panel: «Reintentar» vuelve a pedirlo', async () => {
    const s = servidorFalso({ sesion: admin });
    let sinRed = true;
    instalarApi((l) => (l.ruta === '/api/v1/administrador/panel' && sinRed ? 'red' : s.manejador(l)));
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    sinRed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Instituciones y sedes')).toBeInTheDocument();
  });
});

describe('cierre de sesion', () => {
  it('revoca en el servidor, vuelve a la portada y Atrás no reabre contenido privado', async () => {
    const s = servidorFalso({ sesion: admin });
    const { llamadas } = instalarApi(s.manejador);
    renderizarApp('/panel');
    await screen.findByRole('heading', { name: 'Panel del administrador' });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Finalidad' })).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'DELETE' && l.ruta === '/api/v1/auth/institucional/sesion')).toBe(true);
    expect(s.estado.sesion).toBeNull();
    expect(screen.queryByText('Instituciones y sedes')).not.toBeInTheDocument();
    expect(screen.queryByText('Ana Torres')).not.toBeInTheDocument();
    // «Atrás» (volver a la ruta protegida): el guard envia al acceso y no se muestra nada privado.
    await userEvent.click(await screen.findByRole('link', { name: 'Acceso institucional' }));
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
  });

  it('si el servidor no confirma el cierre, no afirma haber cerrado y ofrece reintentar', async () => {
    const s = servidorFalso({ sesion: admin });
    let sinRed = true;
    instalarApi((l) => (l.metodo === 'DELETE' && sinRed ? 'red' : s.manejador(l)));
    renderizarApp('/panel');
    await screen.findByRole('heading', { name: 'Panel del administrador' });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No pudimos cerrar tu sesión');
    expect(screen.getByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
    sinRed = false;
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Finalidad' })).toBeInTheDocument());
  });
});
