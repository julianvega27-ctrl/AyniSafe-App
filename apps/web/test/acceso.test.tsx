import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, instalarApi, json, renderizarApp, servidorFalso } from './api-falsa';

const CLAVE_OK = 'contraseña-correcta-123';

async function abrirAcceso() {
  const usuario = userEvent.setup();
  renderizarApp('/acceso');
  await screen.findByRole('heading', { name: 'Acceso institucional' });
  // La restauracion inicial (401 de un visitante anonimo) ya termino.
  await waitFor(() => expect(screen.getByLabelText('Correo')).toBeInTheDocument());
  return usuario;
}

const escribir = async (usuario: ReturnType<typeof userEvent.setup>, correo: string, clave: string) => {
  await usuario.type(screen.getByLabelText('Correo'), correo);
  await usuario.type(screen.getByLabelText('Contraseña'), clave);
};

function almacenamiento(): string {
  const partes: string[] = [];
  for (const a of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < a.length; i++) partes.push(`${a.key(i)}=${a.getItem(a.key(i)!)}`);
  }
  return partes.join('\n');
}

describe('/acceso', () => {
  it('ingreso correcto: lleva al panel del rol y no guarda nada en el navegador', async () => {
    const s = servidorFalso();
    instalarApi(s.manejador);
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, CLAVE_OK);
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
    expect(almacenamiento()).toBe('');
    expect(document.cookie).toBe(''); // la sesion es del servidor (HttpOnly): JavaScript no ve nada
  });

  it('credenciales incorrectas y de ciudadano: el mismo mensaje general, sin indicar la causa', async () => {
    instalarApi(servidorFalso().manejador);
    const usuario = await abrirAcceso();
    await escribir(usuario, 'otra@ejemplo.com', 'contraseña-incorrecta-123');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(alerta.querySelector('svg')).not.toBeNull(); // texto e icono
    expect(alerta).not.toHaveTextContent(/ciudadan|suspendid|pendiente|no existe/i);
    expect(almacenamiento()).toBe('');
  });

  it('campos vacios: errores junto a cada campo sin llamar a la API', async () => {
    const { llamadas } = instalarApi(servidorFalso().manejador);
    const usuario = await abrirAcceso();
    const antes = llamadas.length;
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('Ingresa tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(llamadas.length).toBe(antes);
  });

  it('errores de validacion del servidor (400) se muestran junto al campo', async () => {
    const s = servidorFalso();
    instalarApi((l) =>
      l.ruta.endsWith('/sesiones') ? json(400, { error: { code: 'VALIDATION_ERROR', fields: { correo: 'Ingresa un correo válido.' } } }) : s.manejador(l),
    );
    const usuario = await abrirAcceso();
    await escribir(usuario, 'no-es-correo', CLAVE_OK);
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
  });

  it('429: explica la espera con texto e icono y no reintenta por su cuenta', async () => {
    const s = servidorFalso();
    const { llamadas } = instalarApi((l) =>
      l.ruta.endsWith('/sesiones') ? json(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '60' }) : s.manejador(l),
    );
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, CLAVE_OK);
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    const estado = await screen.findByRole('status');
    expect(estado).toHaveTextContent('Demasiados intentos');
    expect(estado).toHaveTextContent('Espera 60 segundos');
    expect(estado.querySelector('svg')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(llamadas.filter((l) => l.ruta.endsWith('/sesiones'))).toHaveLength(1);
  });

  it('403 (origen no admitido) se explica sin afirmar que se inicio sesion', async () => {
    const s = servidorFalso();
    instalarApi((l) => (l.ruta.endsWith('/sesiones') ? json(403, { error: { code: 'FORBIDDEN_ORIGIN' } }) : s.manejador(l)));
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, CLAVE_OK);
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos verificar el origen');
    expect(screen.queryByRole('heading', { name: 'Panel del administrador' })).not.toBeInTheDocument();
  });

  it('sin conexion: informa, no afirma exito y ofrece «Reintentar», que vuelve a intentar', async () => {
    const s = servidorFalso();
    let sinRed = true;
    instalarApi((l) => (l.ruta.endsWith('/sesiones') && sinRed ? 'red' : s.manejador(l)));
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, CLAVE_OK);
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Sin conexión');
    expect(alerta).toHaveTextContent('no sabemos si iniciaste sesión');
    expect(screen.queryByRole('heading', { name: 'Panel del administrador' })).not.toBeInTheDocument();
    sinRed = false;
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Panel del administrador' })).toBeInTheDocument();
  });

  it('servicio no disponible: explica que no se inicio sesion y ofrece «Reintentar»', async () => {
    const s = servidorFalso();
    instalarApi((l) => (l.ruta.endsWith('/sesiones') ? json(503, { error: { code: 'SERVICE_UNAVAILABLE' } }) : s.manejador(l)));
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, CLAVE_OK);
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    const estado = await screen.findByRole('status');
    expect(estado).toHaveTextContent('El servicio no está disponible');
    expect(estado).toHaveTextContent('No iniciaste sesión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('varias pulsaciones antes de la respuesta emiten una sola solicitud', async () => {
    const s = servidorFalso();
    let liberar: () => void = () => undefined;
    const espera = new Promise<void>((r) => {
      liberar = r;
    });
    const { llamadas } = instalarApi(async (l) => {
      if (l.ruta.endsWith('/sesiones')) await espera;
      return s.manejador(l);
    });
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, CLAVE_OK);
    const boton = screen.getByRole('button', { name: 'Ingresar' });
    await usuario.click(boton);
    await usuario.click(screen.getByRole('button', { name: 'Ingresando…' }));
    await usuario.click(screen.getByRole('button', { name: 'Ingresando…' }));
    expect(screen.getByRole('button', { name: 'Ingresando…' })).toHaveAttribute('aria-busy', 'true');
    liberar();
    await screen.findByRole('heading', { name: 'Panel del administrador' });
    expect(llamadas.filter((l) => l.ruta.endsWith('/sesiones'))).toHaveLength(1);
  });

  it('Mostrar/Ocultar alterna la visibilidad y se puede pegar y usar un gestor de contrasenas', async () => {
    instalarApi(servidorFalso().manejador);
    const usuario = await abrirAcceso();
    const campo = screen.getByLabelText('Contraseña');
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Correo')).toHaveAttribute('autocomplete', 'username');
    await usuario.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(campo).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-pressed', 'true');
    await usuario.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(campo).toHaveAttribute('type', 'password');
    await usuario.click(campo);
    await usuario.paste('contraseña pegada con espacios 123');
    expect(campo).toHaveValue('contraseña pegada con espacios 123');
  });

  it('la contrasena no se guarda ni queda en la pagina al abandonar la pantalla', async () => {
    instalarApi(servidorFalso().manejador);
    const usuario = await abrirAcceso();
    await escribir(usuario, admin.correo, 'contraseña-que-no-debe-quedar');
    expect(almacenamiento()).toBe('');
    await usuario.click(screen.getByRole('link', { name: 'Volver a la portada' }));
    await screen.findByRole('heading', { name: 'Finalidad' });
    expect(document.body.innerHTML).not.toContain('contraseña-que-no-debe-quedar');
    expect(almacenamiento()).toBe('');
    // Al volver al acceso el formulario esta vacio.
    await usuario.click(await screen.findByRole('link', { name: 'Acceso institucional' }));
    expect(await screen.findByLabelText('Contraseña')).toHaveValue('');
  });

  it('el mensaje de sesion vencida aparece al llegar desde una ruta protegida', async () => {
    instalarApi(servidorFalso().manejador);
    renderizarApp('/panel/administrador');
    expect(await screen.findByText('Tu sesión no es válida o venció')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acceso institucional' })).toBeInTheDocument();
  });
});
