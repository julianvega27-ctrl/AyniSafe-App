import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { instalarApi, json, renderizarApp, servidorFalso, type Manejador } from './api-falsa';

const TOKEN = 'tokenDeActivacionDePrueba_1234567890-ABCDEFG';
const CLAVE = 'contraseña-nueva-del-titular-4821';

function conFragmento(token: string = TOKEN) {
  window.history.replaceState(null, '', `/activar#t=${token}`);
}

function api(extra: Manejador = () => json(404)) {
  const base = servidorFalso().manejador;
  return instalarApi((l) => {
    if (l.ruta === '/api/v1/auth/tokens/consulta') return json(200, { proposito: 'activacion', expiresAt: '2026-11-25T00:00:00.000Z' });
    if (l.ruta === '/api/v1/auth/activaciones') return json(204);
    const r = extra(l);
    return r instanceof Promise || r !== undefined && (r === 'red' || r.estado !== 404) ? r : base(l);
  });
}

function almacenamiento(): string {
  return [window.localStorage, window.sessionStorage]
    .flatMap((a) => Array.from({ length: a.length }, (_, i) => `${a.key(i)}=${a.getItem(a.key(i)!)}`))
    .join('\n');
}

describe('/activar', () => {
  it('lee el token del fragmento, lo quita de la direccion y del historial y consulta su estado', async () => {
    conFragmento();
    const { llamadas } = api();
    renderizarApp('/activar');
    await screen.findByLabelText('Contraseña nueva');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(llamadas[0]).toMatchObject({ metodo: 'POST', ruta: '/api/v1/auth/tokens/consulta', cuerpo: { token: TOKEN } });
    expect(llamadas.every((l) => !l.ruta.includes(TOKEN))).toBe(true);
    expect(almacenamiento()).toBe('');
  });

  it('activacion correcta: informa el exito, no inicia sesion y lleva a /acceso', async () => {
    conFragmento();
    const { llamadas } = api();
    renderizarApp('/activar');
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText('Contraseña nueva'), CLAVE);
    await usuario.click(screen.getByRole('button', { name: 'Activar cuenta' }));
    expect(await screen.findByText('Tu cuenta quedó activa')).toBeInTheDocument();
    expect(llamadas.find((l) => l.ruta === '/api/v1/auth/activaciones')?.cuerpo).toEqual({ token: TOKEN, contrasena: CLAVE });
    expect(llamadas.some((l) => l.ruta.endsWith('/institucional/sesiones'))).toBe(false); // no se inicia sesion
    expect(document.body.innerHTML).not.toContain(CLAVE);
    expect(almacenamiento()).toBe('');
    await usuario.click(screen.getByRole('link', { name: 'Ir al acceso institucional' }));
    expect(await screen.findByRole('heading', { name: 'Acceso institucional' })).toBeInTheDocument();
  });

  it('la ayuda de contrasena es la de la guia y se valida de 15 a 128 caracteres sin llamar a la API', async () => {
    conFragmento();
    const { llamadas } = api();
    renderizarApp('/activar');
    const usuario = userEvent.setup();
    expect(await screen.findByText('Entre 15 y 128 caracteres. Puedes usar espacios.')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Contraseña nueva'), 'corta');
    await usuario.click(screen.getByRole('button', { name: 'Activar cuenta' }));
    expect(screen.getByText('La contraseña debe tener entre 15 y 128 caracteres.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta === '/api/v1/auth/activaciones')).toBe(false);
  });

  it('cuenta en puntos de codigo, no en unidades UTF-16', async () => {
    conFragmento();
    const { llamadas } = api();
    renderizarApp('/activar');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByLabelText('Contraseña nueva'));
    await usuario.paste('😀'.repeat(15)); // 15 puntos de codigo = 30 unidades UTF-16
    await usuario.click(screen.getByRole('button', { name: 'Activar cuenta' }));
    await waitFor(() => expect(llamadas.some((l) => l.ruta === '/api/v1/auth/activaciones')).toBe(true));
  });

  it.each([
    ['usado', 410, 'TOKEN_USED', 'Este enlace ya se usó o fue reemplazado'],
    ['vencido', 410, 'TOKEN_EXPIRED', 'Este enlace venció'],
    ['invalido', 404, 'TOKEN_INVALID', 'El enlace o el código no es válido'],
  ])('enlace %s: lo explica con texto e icono y no pide contrasena', async (_n, estado, codigo, texto) => {
    conFragmento();
    instalarApi((l) => (l.ruta === '/api/v1/auth/tokens/consulta' ? json(estado, { error: { code: codigo } }) : json(404)));
    renderizarApp('/activar');
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(texto);
    expect(alerta.querySelector('svg')).not.toBeNull();
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
  });

  it('un enlace de recuperacion no sirve para activar', async () => {
    conFragmento();
    instalarApi((l) => (l.ruta === '/api/v1/auth/tokens/consulta' ? json(200, { proposito: 'recuperacion', expiresAt: 'x' }) : json(404)));
    renderizarApp('/activar');
    expect(await screen.findByText('Este enlace no sirve para activar una cuenta')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
  });

  it('el enlace se vuelve invalido al enviar (410): muestra el estado sin afirmar el exito', async () => {
    conFragmento();
    instalarApi((l) => {
      if (l.ruta === '/api/v1/auth/tokens/consulta') return json(200, { proposito: 'activacion', expiresAt: 'x' });
      if (l.ruta === '/api/v1/auth/activaciones') return json(410, { error: { code: 'TOKEN_USED' } });
      return json(404);
    });
    renderizarApp('/activar');
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText('Contraseña nueva'), CLAVE);
    await usuario.click(screen.getByRole('button', { name: 'Activar cuenta' }));
    expect(await screen.findByText('Este enlace ya se usó o fue reemplazado')).toBeInTheDocument();
    expect(screen.queryByText('Tu cuenta quedó activa')).not.toBeInTheDocument();
  });

  it('sin conexion al consultar: «Reintentar» vuelve a consultar', async () => {
    conFragmento();
    let sinRed = true;
    instalarApi((l) => {
      if (l.ruta === '/api/v1/auth/tokens/consulta') return sinRed ? 'red' : json(200, { proposito: 'activacion', expiresAt: 'x' });
      return json(404);
    });
    renderizarApp('/activar');
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    sinRed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
  });

  it('sin conexion al activar: no afirma exito y conserva el estado para reintentar', async () => {
    conFragmento();
    instalarApi((l) => {
      if (l.ruta === '/api/v1/auth/tokens/consulta') return json(200, { proposito: 'activacion', expiresAt: 'x' });
      if (l.ruta === '/api/v1/auth/activaciones') return 'red';
      return json(404);
    });
    renderizarApp('/activar');
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText('Contraseña nueva'), CLAVE);
    await usuario.click(screen.getByRole('button', { name: 'Activar cuenta' }));
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.queryByText('Tu cuenta quedó activa')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('sin fragmento permite pegar el codigo del correo y continua igual', async () => {
    const { llamadas } = api();
    renderizarApp('/activar');
    const usuario = userEvent.setup();
    expect(await screen.findByText('Necesitamos tu código')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Código del correo'), 'corto');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/formato esperado/)).toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('Código del correo'));
    await usuario.click(screen.getByLabelText('Código del correo'));
    await usuario.paste(TOKEN);
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
    expect(llamadas.find((l) => l.ruta === '/api/v1/auth/tokens/consulta')?.cuerpo).toEqual({ token: TOKEN });
    expect(almacenamiento()).toBe('');
  });

  it('un fragmento con formato invalido se ignora y no se envia', async () => {
    window.history.replaceState(null, '', '/activar#t=corto');
    const { llamadas } = api();
    renderizarApp('/activar');
    expect(await screen.findByText('Necesitamos tu código')).toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta === '/api/v1/auth/tokens/consulta')).toBe(false);
  });
});
