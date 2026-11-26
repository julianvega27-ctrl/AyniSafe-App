import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import type { Institucion, OperadorSede, Sede } from '../src/api/cliente';
import { admin, instalarApi, json, renderizarApp, servidorFalso, type Falsa, type Llamada } from './api-falsa';

const ORG = '/api/v1/administrador/organizacion';
const INSTITUCIONES: Institucion[] = [
  { id: 'bomberos', tipo: 'bomberos', nombre: 'Bomberos', contacto: null, activa: true },
  { id: 'pnp', tipo: 'pnp', nombre: 'PNP', contacto: null, activa: true },
  { id: 'samu', tipo: 'samu', nombre: 'SAMU', contacto: null, activa: true },
  { id: 'serenazgo', tipo: 'serenazgo', nombre: 'Serenazgo', contacto: null, activa: true },
];
const DISTRITOS = [
  { id: 'DIS-01', nombre: 'Ayacucho', ubigeo: null },
  { id: 'DIS-02', nombre: 'San Juan Bautista', ubigeo: null },
];
const CATEGORIAS = [
  { id: 'asalto', nombre: 'Asalto', orden: 5, activa: true },
  { id: 'robo', nombre: 'Robo', orden: 14, activa: true },
];
const SEDE_ID = '11111111-1111-4111-8111-111111111111';

const sedeBase = (extra: Partial<Sede> = {}): Sede => ({
  id: SEDE_ID, institucionId: 'pnp', nombre: 'Comisaría PNP Ayacucho', distritoUbicacionId: 'DIS-01', direccion: null, contacto: null,
  verificacion: { estado: 'sin_verificar', fuente: null, fecha: null }, habilitadaAtencion: false, activa: true, esDemostracion: false,
  distritos: [], categorias: [], ...extra,
});

/** Servidor de organizacion en memoria sobre el servidor de sesion de api-falsa. */
function servidorOrganizacion(opciones: { sedes?: Sede[]; operadores?: OperadorSede[]; sobre?: (l: Llamada) => Falsa | undefined } = {}) {
  const base = servidorFalso({ sesion: admin });
  const estado = { sedes: opciones.sedes ?? [], operadores: opciones.operadores ?? [] };
  const manejador = (l: Llamada): Falsa | Promise<Falsa> => {
    const especial = opciones.sobre?.(l);
    if (especial) return especial;
    if (l.ruta === `${ORG}/instituciones`) return json(200, { instituciones: INSTITUCIONES });
    if (l.ruta === `${ORG}/sedes` && l.metodo === 'GET') return json(200, { sedes: estado.sedes });
    if (l.ruta === '/api/v1/publico/territorio/distritos') return json(200, { estado: 'pendiente', version: null, distritos: DISTRITOS });
    if (l.ruta === '/api/v1/publico/categorias') return json(200, { categorias: CATEGORIAS });
    if (l.ruta === `${ORG}/sedes` && l.metodo === 'POST') {
      const c = l.cuerpo as { institucionId: Sede['institucionId']; nombre: string; operador: { nombre: string; correo: string } };
      const sede = sedeBase({ id: '22222222-2222-4222-8222-222222222222', institucionId: c.institucionId, nombre: c.nombre, distritoUbicacionId: null });
      estado.sedes.push(sede);
      const op: OperadorSede = { id: '33333333-3333-4333-8333-333333333333', nombre: c.operador.nombre, correo: c.operador.correo, estado: 'pendiente_activacion', sedeId: sede.id, esDemostracion: false };
      return json(201, { sede, operador: op });
    }
    if (l.ruta === `${ORG}/sedes/${SEDE_ID}/operadores` && l.metodo === 'GET') return json(200, { operadores: estado.operadores });
    return base.manejador(l);
  };
  return { estado, manejador };
}

const TITULO: Record<string, string> = { 'instituciones-sedes': 'Instituciones y sedes', operadores: 'Operadores', coberturas: 'Coberturas' };
async function abrir(seccion: string) {
  renderizarApp(`/panel/administrador/${seccion}`);
  await screen.findByRole('heading', { name: TITULO[seccion], level: 1 });
}

describe('Instituciones y sedes', () => {
  it('estado inicial: cuatro instituciones, estado vacio por institucion y sin sedes de ejemplo', async () => {
    instalarApi(servidorOrganizacion().manejador);
    await abrir('instituciones-sedes');
    for (const nombre of ['Bomberos', 'PNP', 'SAMU', 'Serenazgo']) {
      expect(await screen.findByRole('heading', { name: nombre, level: 2 })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Esta institución todavía no tiene sedes.')).toHaveLength(4);
    expect(screen.queryByText(/Aún no disponible/, { selector: '.mensaje__titulo' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Comisaría|DEMO/);
  });

  it('estados de la sede se leen como texto, no solo por color', async () => {
    const sede = sedeBase({ verificacion: { estado: 'verificada', fuente: 'Oficio', fecha: '2026-11-25' }, esDemostracion: true });
    instalarApi(servidorOrganizacion({ sedes: [sede] }).manejador);
    await abrir('instituciones-sedes');
    const lista = await screen.findByRole('list', { name: 'Estado de Comisaría PNP Ayacucho' });
    expect(lista).toHaveTextContent('Verificada');
    expect(lista).toHaveTextContent('Deshabilitada para atención');
    expect(lista).toHaveTextContent('Demostración');
    expect(within(lista.closest('li')!).getByText('Ayacucho')).toBeInTheDocument();
    expect(within(lista.closest('li')!).getByRole('link', { name: 'Operadores de la sede' })).toHaveAttribute('href', `/panel/administrador/operadores?sede=${SEDE_ID}`);
  });

  it('alta correcta: sin campo de contraseña, envia el operador inicial e informa la invitacion', async () => {
    const s = servidorOrganizacion();
    const { llamadas } = instalarApi(s.manejador);
    await abrir('instituciones-sedes');
    const form = await screen.findByRole('form', { name: 'Agregar sede con su operador inicial' });
    expect(within(form).queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
    await userEvent.selectOptions(within(form).getByLabelText('Institución'), 'pnp');
    await userEvent.type(within(form).getByLabelText('Nombre de sede'), 'Comisaría Nueva');
    await userEvent.type(within(form).getByLabelText('Nombre del operador'), 'Rosa Quispe');
    await userEvent.type(within(form).getByLabelText('Correo del operador'), 'rosa@ejemplo.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear sede e invitar' }));
    expect(await screen.findByText('Sede «Comisaría Nueva» creada')).toBeInTheDocument();
    expect(screen.getByText(/Enviamos la invitación de activación a rosa@ejemplo.com/)).toBeInTheDocument();
    const alta = llamadas.find((l) => l.metodo === 'POST' && l.ruta === `${ORG}/sedes`);
    expect(alta?.cuerpo).toEqual({ institucionId: 'pnp', nombre: 'Comisaría Nueva', operador: { nombre: 'Rosa Quispe', correo: 'rosa@ejemplo.com' } });
    expect(await screen.findByRole('list', { name: 'Sedes de PNP' })).toHaveTextContent('Comisaría Nueva');
  });

  it('409 EMAIL_IN_USE y SEDE_EXISTENTE: conserva los datos, marca el campo y no duplica', async () => {
    let n = 0;
    const s = servidorOrganizacion({
      sobre: (l) => {
        if (l.ruta !== `${ORG}/sedes` || l.metodo !== 'POST') return undefined;
        n += 1;
        return json(409, { error: { code: n === 1 ? 'EMAIL_IN_USE' : 'SEDE_EXISTENTE' } });
      },
    });
    instalarApi(s.manejador);
    await abrir('instituciones-sedes');
    const form = await screen.findByRole('form', { name: 'Agregar sede con su operador inicial' });
    await userEvent.selectOptions(within(form).getByLabelText('Institución'), 'samu');
    await userEvent.type(within(form).getByLabelText('Nombre de sede'), 'SAMU Ayacucho');
    await userEvent.type(within(form).getByLabelText('Nombre del operador'), 'Luis');
    await userEvent.type(within(form).getByLabelText('Correo del operador'), 'usado@ejemplo.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear sede e invitar' }));
    const correo = within(form).getByLabelText('Correo del operador');
    await waitFor(() => expect(correo).toHaveAttribute('aria-invalid', 'true'));
    expect(within(form).getByText('Este correo ya pertenece a otra cuenta.')).toBeInTheDocument();
    expect(correo).toHaveValue('usado@ejemplo.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear sede e invitar' }));
    expect(await within(form).findByText('Ya existe una sede con ese nombre en esta institución.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Nombre de sede')).toHaveValue('SAMU Ayacucho');
    expect(s.estado.sedes).toHaveLength(0);
  });

  it('fallo de red: resultado incierto, conserva el formulario y ofrece recargar la lista', async () => {
    const s = servidorOrganizacion({ sobre: (l) => (l.ruta === `${ORG}/sedes` && l.metodo === 'POST' ? 'red' : undefined) });
    const { llamadas } = instalarApi(s.manejador);
    await abrir('instituciones-sedes');
    const form = await screen.findByRole('form', { name: 'Agregar sede con su operador inicial' });
    await userEvent.selectOptions(within(form).getByLabelText('Institución'), 'pnp');
    await userEvent.type(within(form).getByLabelText('Nombre de sede'), 'Sede incierta');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear sede e invitar' }));
    expect(await screen.findByText('No sabemos si la sede se creó')).toBeInTheDocument();
    expect(within(form).getByLabelText('Nombre de sede')).toHaveValue('Sede incierta');
    const antes = llamadas.filter((l) => l.ruta === `${ORG}/sedes` && l.metodo === 'GET').length;
    await userEvent.click(screen.getByRole('button', { name: 'Recargar la lista' }));
    await waitFor(() => expect(llamadas.filter((l) => l.ruta === `${ORG}/sedes` && l.metodo === 'GET').length).toBe(antes + 1));
  });

  it('403 de la API: «No tienes permiso» sin datos; 401: vuelve al acceso', async () => {
    instalarApi(servidorOrganizacion({ sobre: (l) => (l.ruta.startsWith(ORG) ? json(403, { error: { code: 'FORBIDDEN' } }) : undefined) }).manejador);
    await abrir('instituciones-sedes');
    expect(await screen.findByText('No tienes permiso')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'PNP' })).not.toBeInTheDocument();
  });

  it('401 durante la carga lleva a /acceso', async () => {
    instalarApi(servidorOrganizacion({ sobre: (l) => (l.ruta === `${ORG}/sedes` ? json(401, { error: { code: 'UNAUTHENTICATED' } }) : undefined) }).manejador);
    renderizarApp('/panel/administrador/instituciones-sedes');
    expect(await screen.findByRole('heading', { name: /Iniciar sesión|Acceso/i })).toBeInTheDocument();
  });
});

describe('Operadores', () => {
  const OP_ACTIVO: OperadorSede = { id: '44444444-4444-4444-8444-444444444444', nombre: 'Omar', correo: 'omar@ejemplo.com', estado: 'activo', sedeId: SEDE_ID, esDemostracion: false };
  const OP_PENDIENTE: OperadorSede = { ...OP_ACTIVO, id: '55555555-5555-4555-8555-555555555555', nombre: 'Pia', correo: 'pia@ejemplo.com', estado: 'pendiente_activacion' };

  it('suspension rechazada: muestra el motivo y el operador sigue activo', async () => {
    const s = servidorOrganizacion({
      sedes: [sedeBase({ habilitadaAtencion: true })],
      operadores: [OP_ACTIVO],
      sobre: (l) => (l.ruta === `${ORG}/operadores/${OP_ACTIVO.id}` ? json(409, { error: { code: 'ULTIMO_OPERADOR_ACTIVO' } }) : undefined),
    });
    instalarApi(s.manejador);
    await abrir('operadores');
    const tarjeta = (await screen.findByText('omar@ejemplo.com')).closest('li')!;
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText(/único operador activo de una sede habilitada/)).toBeInTheDocument();
    expect(within(tarjeta).getByText('Activo')).toBeInTheDocument();
  });

  it('reenvio de invitacion: confirma sin mostrar enlace ni token', async () => {
    const s = servidorOrganizacion({
      sedes: [sedeBase()],
      operadores: [OP_PENDIENTE],
      sobre: (l) => (l.ruta === `${ORG}/operadores/${OP_PENDIENTE.id}/invitacion` ? json(202, { estado: 'invitacion_encolada' }) : undefined),
    });
    const { llamadas } = instalarApi(s.manejador);
    await abrir('operadores');
    const tarjeta = (await screen.findByText('pia@ejemplo.com')).closest('li')!;
    expect(within(tarjeta).getByText('Pendiente de activación')).toBeInTheDocument();
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Reenviar invitación' }));
    expect(await screen.findByText('Invitación reenviada a pia@ejemplo.com')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/#t=|token/i);
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/invitacion'))).toBe(true);
  });

  it('sin sedes indica que primero se cree una', async () => {
    instalarApi(servidorOrganizacion().manejador);
    await abrir('operadores');
    expect(await screen.findByText(/Primero crea una sede/)).toBeInTheDocument();
  });
});

describe('Coberturas', () => {
  it('guardar cobertura envia el conjunto elegido y refleja la respuesta de la API', async () => {
    const s = servidorOrganizacion({
      sedes: [sedeBase()],
      sobre: (l) => {
        if (l.ruta !== `${ORG}/sedes/${SEDE_ID}/cobertura`) return undefined;
        const distritos = (l.cuerpo as { distritos: string[] }).distritos;
        s.estado.sedes = [sedeBase({ distritos })];
        return json(200, { sede: s.estado.sedes[0] });
      },
    });
    const { llamadas } = instalarApi(s.manejador);
    await abrir('coberturas');
    const grupo = await screen.findByRole('group', { name: 'Distritos que atiende esta sede' });
    await userEvent.click(within(grupo).getByLabelText('Ayacucho'));
    await userEvent.click(within(grupo).getByLabelText('San Juan Bautista'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cobertura' }));
    expect(await screen.findByText('Cobertura guardada')).toBeInTheDocument();
    const put = llamadas.find((l) => l.metodo === 'PUT');
    expect((put?.cuerpo as { distritos: string[] }).distritos.sort()).toEqual(['DIS-01', 'DIS-02']);
    await waitFor(() => expect(within(grupo).getByLabelText('Ayacucho')).toBeChecked());
  });

  it('habilitacion con requisitos faltantes: lista cada requisito con texto y la sede sigue deshabilitada', async () => {
    instalarApi(servidorOrganizacion({
      sedes: [sedeBase()],
      sobre: (l) => (l.ruta.endsWith('/habilitacion') ? json(409, { error: { code: 'REQUISITOS_HABILITACION', faltantes: ['cobertura', 'operador_activo'] } }) : undefined),
    }).manejador);
    await abrir('coberturas');
    await userEvent.click(await screen.findByRole('button', { name: 'Habilitar atención' }));
    const lista = await screen.findByRole('list', { name: 'Requisitos faltantes' });
    expect(lista).toHaveTextContent('Elige al menos un distrito de cobertura.');
    expect(lista).toHaveTextContent('Al menos un operador debe haber activado su cuenta y estar activo.');
    expect(screen.getByText('La sede está deshabilitada para atención.')).toBeInTheDocument();
  });
});

describe('accesibilidad de organizacion (axe-core)', () => {
  it('las tres secciones no tienen violaciones automaticas', async () => {
    const sede = sedeBase();
    for (const seccion of ['instituciones-sedes', 'operadores', 'coberturas']) {
      instalarApi(servidorOrganizacion({ sedes: [sede], operadores: [] }).manejador);
      const { container, unmount } = renderizarApp(`/panel/administrador/${seccion}`);
      await screen.findByRole('heading', { name: TITULO[seccion], level: 1 });
      await screen.findAllByText(/Comisaría PNP Ayacucho/);
      const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
      expect(r.violations.map((v) => `${seccion} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      unmount();
    }
  });
});
