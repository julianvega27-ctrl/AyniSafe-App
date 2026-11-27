import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AsignacionAdmin, AtencionOperador, ResumenIncidente } from '../src/api/cliente';
import { admin, instalarApi, json, operador, renderizarApp, servidorFalso, type Llamada } from './api-falsa';

/** P6, tarea A4.3: atencion en el resumen del operador y responsables activos del administrador. */
afterEach(() => vi.restoreAllMocks());

const ID = '00000000-0000-4000-8000-000000000001';
const RUTA = `/panel/operador/incidentes/${ID}`;

const atencion = (extra: Partial<AtencionOperador> = {}): AtencionOperador => ({
  responsable: { asignado: false },
  institucionesConResponsable: [],
  accionesPermitidas: ['asumir'],
  historial: [],
  ...extra,
});

const resumen = (extra: Partial<ResumenIncidente> = {}): ResumenIncidente => ({
  id: ID,
  referencia: 'INC-AAAA1-BBBBB',
  categoria: { id: 'robo', nombre: 'Robo' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' },
  estado: 'REGISTRADO',
  registradoEn: '2026-11-26T10:00:00.000Z',
  papel: 'principal',
  condicionMedicaPorConfirmar: false,
  verificacion: 'SIN_VERIFICAR',
  resultado: null,
  responsable: { asignado: false, esUsted: false },
  vinculado: false,
  prioridad: 'SIN_EVALUAR',
  prioridadOrigen: null,
  descripcion: 'Me arrebataron el celular',
  ocurrencia: { modo: 'ahora', instante: '2026-11-26T09:58:00.000Z' },
  territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
  respuestasCiudadano: { heridos: null, atencionMedica: null },
  condicionMedica: null,
  accesoSanitario: false,
  otrasInstituciones: [],
  evidencias: [],
  atencion: atencion(),
  ...extra,
});

const EN_REVISION = resumen({
  estado: 'EN_REVISION',
  responsable: { asignado: true, esUsted: true },
  atencion: atencion({
    responsable: { asignado: true, esUsted: true, nombre: 'Omar Quispe', desde: '2026-11-26T10:05:00.000Z' },
    institucionesConResponsable: ['pnp'],
    accionesPermitidas: ['iniciar_atencion', 'descartar', 'verificar'],
    historial: [
      { accion: 'asumir', institucion: 'pnp', actorTipo: 'operador', valorAnterior: null, valorNuevo: null, motivo: null, instante: '2026-11-26T10:05:00.000Z' },
      { accion: 'transicion', institucion: 'pnp', actorTipo: 'operador', valorAnterior: 'REGISTRADO', valorNuevo: 'EN_REVISION', motivo: null, instante: '2026-11-26T10:05:00.000Z' },
    ],
  }),
});

function montar(resumenes: ResumenIncidente[], acciones: (l: Llamada) => ReturnType<typeof json>) {
  const s = servidorFalso({ sesion: operador });
  let i = 0;
  return instalarApi((l) => {
    if (l.metodo === 'POST' && l.ruta.startsWith(`/api/v1/operador/incidentes/${ID}/`)) return acciones(l);
    if (l.ruta === `/api/v1/operador/incidentes/${ID}`) return json(200, resumenes[Math.min(i++, resumenes.length - 1)]);
    return s.manejador(l);
  });
}

const bloque = () => screen.getByRole('region', { name: 'Responsable y estado' });

describe('atención en el resumen del operador', () => {
  it('asume el caso con una sola solicitud y muestra el resumen actualizado en revisión', async () => {
    const { llamadas } = montar([resumen(), EN_REVISION], () => json(201, { asignacion: { id: 'a', institucion: 'pnp', desde: '2026-11-26T10:05:00.000Z' }, estado: 'EN_REVISION' }));
    renderizarApp(RUTA);
    const boton = await screen.findByRole('button', { name: 'Asumir caso' });
    await userEvent.click(boton);
    expect(await screen.findByText('Asumiste el caso. El incidente pasó a revisión.')).toBeInTheDocument();
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => l.ruta)).toEqual([`/api/v1/operador/incidentes/${ID}/asumir`]);
    expect(within(bloque()).getByText(/^Tú, desde/)).toBeInTheDocument();
    expect(within(bloque()).getByRole('button', { name: 'Iniciar atención' })).toBeInTheDocument();
    expect(within(bloque()).queryByRole('button', { name: 'Cerrar como atendido' })).not.toBeInTheDocument();
    expect(within(bloque()).getByText('PNP: Registrado → En revisión')).toBeInTheDocument();
  });

  it('un 409 al asumir explica que otro operador es responsable sin presentarlo como hecho', async () => {
    montar([resumen()], () => json(409, { error: { code: 'CASO_ASUMIDO' } }));
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Asumir caso' }));
    expect(await screen.findByText('Otro operador de tu institución ya es responsable de este caso.')).toBeInTheDocument();
    expect(screen.queryByText(/Asumiste el caso/)).not.toBeInTheDocument();
  });

  it('descartar exige motivo y resumen ciudadano y envía el estado esperado', async () => {
    const { llamadas } = montar([EN_REVISION, resumen({ estado: 'CERRADO', resultado: 'DESCARTADO', atencion: atencion({ accionesPermitidas: [] }) })], () =>
      json(200, { estado: 'CERRADO', resultado: 'DESCARTADO' }),
    );
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Descartar caso' }));
    expect(within(dialogo).getByText('Escribe un resumen de 10 a 300 caracteres.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
    await userEvent.type(within(dialogo).getByLabelText('Motivo interno'), 'No se pudo confirmar el hecho');
    await userEvent.type(within(dialogo).getByLabelText('Resumen para el ciudadano'), 'El caso no pudo confirmarse.');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Descartar caso' }));
    expect(await screen.findByText('Caso descartado.')).toBeInTheDocument();
    const envio = llamadas.filter((l) => l.metodo === 'POST');
    expect(envio).toHaveLength(1);
    expect(envio[0]!.cuerpo).toEqual({
      accion: 'cerrar',
      estadoEsperado: 'EN_REVISION',
      resultado: 'DESCARTADO',
      motivo: 'No se pudo confirmar el hecho',
      resumenCiudadano: 'El caso no pudo confirmarse.',
    });
    await waitFor(() => expect(within(bloque()).getByText('Cerrado · Descartado')).toBeInTheDocument());
  });

  it('otro operador responsable no ve acciones y se le informa', async () => {
    montar([resumen({ estado: 'EN_REVISION', atencion: atencion({ responsable: { asignado: true, esUsted: false, nombre: 'Rosa Huamán', desde: '2026-11-26T10:05:00.000Z' }, accionesPermitidas: [] }) })], () => json(500, {}));
    renderizarApp(RUTA);
    expect(await screen.findByText('Otro operador de tu institución es responsable de este caso.')).toBeInTheDocument();
    expect(within(bloque()).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('vinculación de duplicados', () => {
  it('vincula con referencia y motivo en una sola solicitud y muestra que se atiende desde el principal', async () => {
    const conVincular = resumen({ ...EN_REVISION, atencion: { ...EN_REVISION.atencion!, accionesPermitidas: ['iniciar_atencion', 'descartar', 'verificar', 'vincular'] } });
    const vinculado = resumen({ estado: 'EN_REVISION', vinculado: true, atencion: atencion({ accionesPermitidas: [], responsable: EN_REVISION.atencion!.responsable }) });
    const { llamadas } = montar([conVincular, vinculado], () => json(200, { vinculado: true }));
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Vincular como duplicado' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Referencia del incidente principal'), 'INC-7K3M9-Q2TXA');
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Mismo hecho reportado dos veces');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Vincular' }));
    expect(await screen.findByText('Incidente vinculado. Se atenderá desde el incidente principal.')).toBeInTheDocument();
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => [l.ruta, l.cuerpo])).toEqual([
      [`/api/v1/operador/incidentes/${ID}/vinculo`, { referenciaPrincipal: 'INC-7K3M9-Q2TXA', motivo: 'Mismo hecho reportado dos veces' }],
    ]);
    expect(await screen.findByText('Vinculado a otro reporte del mismo hecho: se atiende desde el incidente principal.')).toBeInTheDocument();
  });
});

describe('prioridad', () => {
  it('muestra la etiqueta con texto e icono y revisa con motivo en una sola solicitud', async () => {
    const base = resumen({ ...EN_REVISION, prioridad: 'NORMAL', prioridadOrigen: 'propuesta', atencion: { ...EN_REVISION.atencion!, accionesPermitidas: ['iniciar_atencion', 'priorizar'] } });
    const revisado = resumen({ ...base, prioridad: 'URGENTE', prioridadOrigen: 'revisada' });
    const { llamadas } = montar([base, revisado], () => json(200, { prioridad: 'URGENTE', origen: 'revisada' }));
    renderizarApp(RUTA);
    expect(await screen.findByText('Prioridad: Normal (propuesta)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revisar prioridad' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByLabelText('Urgente'));
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Hay una persona atrapada');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar prioridad' }));
    expect(await screen.findByText('Prioridad revisada: Urgente. La bandeja mantiene el orden de llegada.')).toBeInTheDocument();
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => l.cuerpo)).toEqual([{ valor: 'URGENTE', motivo: 'Hay una persona atrapada' }]);
    expect(await screen.findByText('Prioridad: Urgente (revisada)')).toBeInTheDocument();
  });
});

describe('responsables activos del administrador', () => {
  const asignacion: AsignacionAdmin = {
    id: '00000000-0000-4000-8000-0000000000a1',
    referencia: 'INC-AAAA1-BBBBB',
    estado: 'EN_REVISION',
    institucion: 'pnp',
    sede: { id: '00000000-0000-4000-8000-0000000000s1', nombre: 'Comisaría Centro' },
    responsable: { id: '00000000-0000-4000-8000-0000000000o1', nombre: 'Omar Quispe' },
    asignadaEn: '2026-11-26T10:05:00.000Z',
    requiereReasignacion: true,
  };

  it('lista con aviso de reasignación y reasigna con motivo en una sola solicitud', async () => {
    const s = servidorFalso({ sesion: admin });
    const { llamadas } = instalarApi((l) => {
      if (l.ruta === '/api/v1/admin/asignaciones') return json(200, { elementos: [asignacion] });
      if (l.ruta.endsWith('/candidatos')) return json(200, { elementos: [{ id: '00000000-0000-4000-8000-0000000000o2', nombre: 'Rosa Huamán', sede: { id: 's1', nombre: 'Comisaría Centro' } }] });
      if (l.ruta.endsWith('/reasignar')) return json(200, { asignacion: { id: 'x' } });
      if (l.ruta.startsWith('/api/v1/admin/enrutamientos-pendientes')) return json(200, { elementos: [], siguiente: null });
      return s.manejador(l);
    });
    renderizarApp('/panel/administrador');
    const region = await screen.findByRole('region', { name: 'Responsables activos' });
    expect(await within(region).findByText('Requiere reasignación')).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: 'Reasignar' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.selectOptions(await within(dialogo).findByLabelText('Nuevo responsable'), '00000000-0000-4000-8000-0000000000o2');
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'El responsable fue suspendido');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText('Caso INC-AAAA1-BBBBB reasignado')).toBeInTheDocument();
    const envios = llamadas.filter((l) => l.metodo === 'POST');
    expect(envios.map((l) => [l.ruta, l.cuerpo])).toEqual([
      [`/api/v1/admin/asignaciones/${asignacion.id}/reasignar`, { operadorId: '00000000-0000-4000-8000-0000000000o2', motivo: 'El responsable fue suspendido' }],
    ]);
  });
});
