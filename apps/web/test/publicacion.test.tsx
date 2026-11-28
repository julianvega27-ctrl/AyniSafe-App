import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtencionOperador, PublicacionOperador, ResumenIncidente } from '../src/api/cliente';
import { instalarApi, json, operador, renderizarApp, servidorFalso, type Llamada } from './api-falsa';

/** P7, tarea A4.2: bloque «Publicación» del control del caso en el resumen del operador. */
afterEach(() => vi.restoreAllMocks());

const ID = '00000000-0000-4000-8000-000000000001';
const RUTA = `/panel/operador/incidentes/${ID}`;
const MOTIVO = 'Riesgo de identificar a la víctima';

const publicacion = (extra: Partial<PublicacionOperador> = {}): PublicacionOperador => ({
  estado: 'NO_PUBLICADO',
  reservada: false,
  sensible: false,
  publicadaEn: null,
  venceEn: '2026-12-03T09:58:00.000Z',
  causaRetiro: null,
  noPublicable: null,
  accionesPermitidas: ['publicar'],
  ...extra,
});

const atencion = (p: PublicacionOperador | null, extra: Partial<AtencionOperador> = {}): AtencionOperador => ({
  responsable: { asignado: true, esUsted: true, automatica: false, nombre: 'Omar Quispe', desde: '2026-11-26T10:05:00.000Z' },
  institucionesConResponsable: ['pnp'],
  accionesPermitidas: ['iniciar_atencion', 'descartar', 'verificar'],
  historial: [],
  publicacion: p,
  ...extra,
});

const resumen = (p: PublicacionOperador | null, extra: Partial<ResumenIncidente> = {}): ResumenIncidente => ({
  id: ID,
  referencia: 'INC-AAAA1-BBBBB',
  categoria: { id: 'robo', nombre: 'Robo' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' },
  estado: 'EN_REVISION',
  registradoEn: '2026-11-26T10:00:00.000Z',
  papel: 'principal',
  condicionMedicaPorConfirmar: false,
  verificacion: 'VERIFICADO',
  resultado: null,
  responsable: { asignado: true, esUsted: true },
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
  atencion: atencion(p),
  ...extra,
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

async function abrirControl() {
  const boton = await screen.findByRole('button', { name: /Control del caso/ });
  if (boton.getAttribute('aria-expanded') === 'false') await userEvent.click(boton);
  return screen.getByRole('list', { name: 'Control del caso' });
}

describe('publicación en el control del caso', () => {
  it('publica con una sola solicitud, con vista previa sin datos privados, y muestra el vencimiento', async () => {
    const vigente = publicacion({ estado: 'VIGENTE', publicadaEn: '2026-11-26T10:10:00.000Z', accionesPermitidas: ['retirar', 'reservar'] });
    const { llamadas } = montar([resumen(publicacion()), resumen(vigente)], () =>
      json(201, { publicacion: { estado: 'VIGENTE', reservada: false, publicadaEn: '2026-11-26T10:10:00.000Z', venceEn: '2026-12-03T09:58:00.000Z' } }),
    );
    renderizarApp(RUTA);
    const control = await abrirControl();
    expect(within(control).getByText('No publicado')).toBeInTheDocument();
    const previa = within(control).getByText('Lo que verá la ciudadanía').parentElement!;
    expect(previa).toHaveTextContent('Robo · Ayacucho · zona aproximada de 300 m');
    expect(previa).not.toHaveTextContent('Me arrebataron');
    await userEvent.click(within(control).getByRole('button', { name: 'Publicar en el mapa' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Publicar en el mapa' }));
    expect(await screen.findByText('Incidente publicado en el mapa como zona aproximada.')).toBeInTheDocument();
    const envios = llamadas.filter((l) => l.metodo === 'POST');
    expect(envios.map((l) => [l.ruta, l.cuerpo])).toEqual([[`/api/v1/operador/incidentes/${ID}/publicacion`, { estadoEsperado: 'EN_REVISION' }]]);
    const control2 = await abrirControl();
    expect(within(control2).getByText(/^Publicado hasta/)).toBeInTheDocument();
    expect(within(control2).getByRole('button', { name: 'Retirar' })).toBeInTheDocument();
  });

  it('publicar reservado exige motivo y lo envía', async () => {
    const { llamadas } = montar([resumen(publicacion())], () => json(201, { publicacion: { estado: 'VIGENTE', reservada: true, publicadaEn: 'x', venceEn: 'y' } }));
    renderizarApp(RUTA);
    const control = await abrirControl();
    await userEvent.click(within(control).getByRole('button', { name: 'Publicar en el mapa' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByLabelText(/caso reservado/));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Publicar en el mapa' }));
    expect(within(dialogo).getByText('Escribe un motivo de 10 a 500 caracteres.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), MOTIVO);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Publicar en el mapa' }));
    expect(await screen.findByText(/Incidente publicado/)).toBeInTheDocument();
    expect(llamadas.filter((l) => l.metodo === 'POST')[0]!.cuerpo).toEqual({ estadoEsperado: 'EN_REVISION', reservada: true, motivoReserva: MOTIVO });
  });

  it('sin verificar explica el requisito y no ofrece publicar', async () => {
    montar([resumen(publicacion({ noPublicable: 'NO_VERIFICADO', accionesPermitidas: [] }), { verificacion: 'SIN_VERIFICAR' })], () => json(500, {}));
    renderizarApp(RUTA);
    const control = await abrirControl();
    expect(within(control).getByText('Se publicará en el mapa ciudadano al marcarlo verificado.')).toBeInTheDocument();
    expect(within(control).queryByRole('button', { name: 'Publicar en el mapa' })).not.toBeInTheDocument();
  });

  it('retirar con motivo; un 409 se explica y recarga', async () => {
    const vigente = publicacion({ estado: 'VIGENTE', publicadaEn: '2026-11-26T10:10:00.000Z', accionesPermitidas: ['retirar'] });
    const retirada = publicacion({ estado: 'RETIRADA', causaRetiro: 'DECISION', accionesPermitidas: [] });
    const { llamadas } = montar([resumen(vigente), resumen(retirada)], () => json(409, { error: { code: 'NO_PUBLICADA' } }));
    renderizarApp(RUTA);
    const control = await abrirControl();
    await userEvent.click(within(control).getByRole('button', { name: 'Retirar' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), MOTIVO);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Retirar del mapa' }));
    expect(await screen.findByText('El incidente ya no tiene una publicación vigente.')).toBeInTheDocument();
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => [l.ruta, l.cuerpo])).toEqual([
      [`/api/v1/operador/incidentes/${ID}/publicacion/retiro`, { motivo: MOTIVO }],
    ]);
    const control2 = await abrirControl();
    expect(within(control2).getByText('No publicado: retirada por decisión de la institución principal')).toBeInTheDocument();
  });

  it('categoría sensible: la vista previa indica que solo cuenta en el total', async () => {
    montar([resumen(publicacion({ sensible: true }), { categoria: { id: 'agresion', nombre: 'Agresión' } })], () => json(500, {}));
    renderizarApp(RUTA);
    const control = await abrirControl();
    expect(within(control).getByText(/Categoría reservada: no se muestra como punto/)).toBeInTheDocument();
  });

  it('el diálogo de verificación avisa que verificar publica en el mapa', async () => {
    montar([resumen(publicacion({ noPublicable: 'NO_VERIFICADO', accionesPermitidas: [] }), { verificacion: 'SIN_VERIFICAR' })], () => json(500, {}));
    renderizarApp(RUTA);
    const control = await abrirControl();
    await userEvent.click(within(control).getByRole('button', { name: 'Registrar verificación' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Marcarlo verificado lo publica en el mapa ciudadano/)).toBeInTheDocument();
  });

  it('un apoyo no ve el bloque de publicación', async () => {
    montar([resumen(publicacion({ accionesPermitidas: [] }), { papel: 'simultanea' })], () => json(500, {}));
    renderizarApp(RUTA);
    await screen.findByRole('region', { name: 'Responsable y estado' });
    expect(screen.queryByText('Publicación en el mapa')).not.toBeInTheDocument();
  });
});
