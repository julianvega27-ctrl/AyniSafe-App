import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DetalleSanitario, ResumenIncidente } from '../src/api/cliente';
import { instalarApi, json, operador, renderizarApp, servidorFalso, type Llamada } from './api-falsa';

/** P5.1, tareas 9.1 y 9.2: condicion medica, precision y evaluacion SAMU en el resumen del operador. */
afterEach(() => vi.restoreAllMocks());

const ID = '00000000-0000-4000-8000-000000000001';
const RUTA = `/panel/operador/incidentes/${ID}`;

const resumen = (extra: Partial<ResumenIncidente> = {}): ResumenIncidente => ({
  id: ID,
  referencia: 'INC-AAAA1-BBBBB',
  categoria: { id: 'accidente-transito', nombre: 'Accidente de tránsito' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' },
  estado: 'REGISTRADO',
  registradoEn: '2026-11-26T10:00:00.000Z',
  papel: 'principal',
  condicionMedicaPorConfirmar: true,
  verificacion: 'SIN_VERIFICAR',
  resultado: null,
  responsable: { asignado: false, esUsted: false },
  vinculado: false,
  prioridad: 'SIN_EVALUAR',
  descripcion: 'Choque de dos autos en la avenida',
  ocurrencia: { modo: 'ahora', instante: '2026-11-26T09:58:00.000Z' },
  territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
  respuestasCiudadano: { heridos: 'no_se', atencionMedica: null },
  condicionMedica: {
    heridos: 'no_se',
    atencionMedica: null,
    cantidadHeridos: null,
    revisionPendiente: true,
    version: 1,
    origen: 'ciudadano',
    institucion: null,
    informadaEn: '2026-11-26T10:00:00.000Z',
    observacionesInformadas: false,
  },
  accesoSanitario: false,
  otrasInstituciones: [],
  evidencias: [],
  atencion: null,
  ...extra,
});

const detalle: DetalleSanitario = {
  version: 3,
  informadaEn: '2026-11-26T11:00:00.000Z',
  pendiente: false,
  vigente: {
    heridos: 'si',
    atencionMedica: null,
    cantidadHeridos: 2,
    personaPrincipal: { signosVida: null, consciente: 'no', sangrado: null },
  },
  historial: [
    { version: 1, origen: 'ciudadano', institucion: null, instante: '2026-11-26T10:00:00.000Z', camposModificados: [], motivo: null },
    { version: 2, origen: 'operador', institucion: 'pnp', instante: '2026-11-26T10:30:00.000Z', camposModificados: ['heridos', 'cantidadHeridos'], motivo: 'Confirmado por llamada' },
    { version: 3, origen: 'operador', institucion: 'samu', instante: '2026-11-26T11:00:00.000Z', camposModificados: ['consciente'], motivo: 'Informe de la unidad' },
  ],
};

function montar(opciones: { resumenes: ResumenIncidente[]; precisar?: (l: Llamada) => ReturnType<typeof json>; evaluacion?: () => ReturnType<typeof json> }) {
  const s = servidorFalso({ sesion: operador });
  let i = 0;
  return instalarApi((l) => {
    if (l.ruta === `/api/v1/operador/incidentes/${ID}/evaluacion` && l.metodo === 'POST') {
      return opciones.precisar?.(l) ?? json(500, {});
    }
    if (l.ruta === `/api/v1/operador/incidentes/${ID}/evaluacion`) return opciones.evaluacion?.() ?? json(404, {});
    if (l.ruta === `/api/v1/operador/incidentes/${ID}`) return json(200, opciones.resumenes[Math.min(i++, opciones.resumenes.length - 1)]);
    return s.manejador(l);
  });
}

const condicion = () => screen.getByRole('region', { name: 'Condición médica' });

describe('condición médica en el resumen (9.1)', () => {
  it('muestra por separado la respuesta original y la condición vigente con su origen e institución', async () => {
    montar({
      resumenes: [
        resumen({
          condicionMedica: { ...resumen().condicionMedica!, heridos: 'si', cantidadHeridos: 3, origen: 'operador', institucion: 'pnp', version: 2, revisionPendiente: false },
        }),
      ],
    });
    renderizarApp(RUTA);
    await screen.findByRole('heading', { name: 'Condición médica' });
    const region = condicion();
    expect(within(region).getByRole('heading', { name: 'Condición vigente' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Versión 2 · Operador PNP');
    // La respuesta original del ciudadano se ve junto al valor vigente cuando difieren.
    const tarjetaHeridos = within(region).getByText('¿Hay personas heridas?').closest('li')!;
    expect(tarjetaHeridos).toHaveTextContent('Sí');
    expect(tarjetaHeridos).toHaveTextContent('Ciudadano informó: No sabe');
    expect(within(region).getByText('Personas heridas').closest('li')).toHaveTextContent('3');
    expect(within(region).getByText('Sin respuestas pendientes')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Evaluación rápida' })).not.toBeInTheDocument();
  });

  it('valida el motivo antes de enviar y no hace la solicitud', async () => {
    const { llamadas } = montar({ resumenes: [resumen()] });
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Precisar condición médica' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(within(dialogo).getByRole('group', { name: '¿Hay personas heridas?' })).getByRole('radio', { name: 'Sí' }));
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'corto');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(within(dialogo).getByText('Escribe un motivo de 10 a 500 caracteres.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
  });

  it('envía una sola solicitud con los campos cambiados, informa «SAMU fue incorporado» y recarga', async () => {
    const posteriores = resumen({ papel: 'simultanea', condicionMedicaPorConfirmar: false, otrasInstituciones: ['samu'] });
    const { llamadas } = montar({
      resumenes: [resumen(), posteriores],
      precisar: () => json(200, { version: 2, condicionMedica: { heridos: 'si', atencionMedica: null, cantidadHeridos: 2 }, samuIncorporado: true }),
    });
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Precisar condición médica' }));
    const dialogo = screen.getByRole('dialog');
    const heridos = within(dialogo).getByRole('group', { name: '¿Hay personas heridas?' });
    await userEvent.click(within(heridos).getByRole('radio', { name: 'Sí' }));
    await userEvent.click(within(dialogo).getByRole('radio', { name: '2' }));
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Confirmado por llamada al lugar');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Condición precisada. SAMU fue incorporado al caso.')).toBeInTheDocument();
    const envios = llamadas.filter((l) => l.metodo === 'POST');
    expect(envios).toHaveLength(1);
    expect(envios[0]!.cuerpo).toEqual({ heridos: 'si', cantidadHeridos: 2, motivo: 'Confirmado por llamada al lugar' });
    await waitFor(() => expect(screen.getByText('Simultánea')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('«Otra cantidad» empieza en 6 y se ajusta con − y + sin escribir', async () => {
    const { llamadas } = montar({
      resumenes: [resumen()],
      precisar: () => json(200, { version: 2, condicionMedica: { heridos: 'si', atencionMedica: null, cantidadHeridos: 7 }, samuIncorporado: false }),
    });
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Precisar condición médica' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(within(dialogo).getByRole('group', { name: '¿Hay personas heridas?' })).getByRole('radio', { name: 'Sí' }));
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Otra cantidad' }));
    expect(within(dialogo).getByText('6 personas heridas')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Restar una persona' })).toBeDisabled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sumar una persona' }));
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Confirmado por llamada al lugar');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Condición precisada.');
    expect(llamadas.find((l) => l.metodo === 'POST')!.cuerpo).toMatchObject({ cantidadHeridos: 7 });
  });

  it('409 y 404 se explican sin simular un éxito', async () => {
    let respuesta = json(409, { error: { code: 'EVALUACION_CERRADA' } });
    montar({ resumenes: [resumen()], precisar: () => respuesta });
    renderizarApp(RUTA);
    await userEvent.click(await screen.findByRole('button', { name: 'Precisar condición médica' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(within(dialogo).getByRole('group', { name: '¿Hay personas heridas?' })).getByRole('radio', { name: 'No' }));
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Confirmado por llamada al lugar');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialogo).findByText(/está cerrado/)).toBeInTheDocument();
    respuesta = json(404, { error: { code: 'NOT_FOUND' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialogo).findByText('Incidente no disponible')).toBeInTheDocument();
    expect(screen.queryByText(/Condición precisada/)).not.toBeInTheDocument();
  });

  it('operable con teclado: grupos con nombre y opción marcada anunciada', async () => {
    montar({ resumenes: [resumen()] });
    renderizarApp(RUTA);
    const abrir = await screen.findByRole('button', { name: 'Precisar condición médica' });
    abrir.focus();
    await userEvent.keyboard('{Enter}');
    const dialogo = screen.getByRole('dialog');
    const grupo = within(dialogo).getByRole('group', { name: '¿Hay personas heridas?' });
    await userEvent.tab();
    expect(within(grupo).getAllByRole('radio')).toContain(document.activeElement);
    await userEvent.keyboard('{ArrowRight}');
    expect(within(grupo).getByRole('radio', { checked: true })).toBeInTheDocument();
    expect(within(dialogo).getByRole('group', { name: '¿Se necesita atención médica?' })).toBeInTheDocument();
  });

  it('un robo (sin evaluación) no ofrece precisar', async () => {
    montar({ resumenes: [resumen({ categoria: { id: 'robo', nombre: 'Robo' }, condicionMedica: null, respuestasCiudadano: { heridos: null, atencionMedica: null } })] });
    renderizarApp(RUTA);
    await screen.findByRole('heading', { name: 'Condición médica' });
    expect(screen.queryByRole('button', { name: 'Precisar condición médica' })).not.toBeInTheDocument();
  });
});

describe('evaluación para el operador SAMU (9.2)', () => {
  it('SAMU ve la vigente, el historial ordenado y «Registrar aclaración»; las sin respuesta se muestran como tales', async () => {
    montar({ resumenes: [resumen({ accesoSanitario: true })], evaluacion: () => json(200, detalle) });
    renderizarApp(RUTA);
    const region = await screen.findByRole('region', { name: 'Evaluación rápida' });
    await within(region).findByText(/Versión 3 · informada el/);
    expect(within(region).getByText('Signos de vida').closest('li')).toHaveTextContent('Sin respuesta');
    expect(within(region).getByText('¿Está consciente?').closest('li')).toHaveTextContent('No');
    // Historial como línea de tiempo: de la versión más reciente a la más antigua.
    const historial = within(region).getByRole('list', { name: /Historial de versiones/ });
    const entradas = [...historial.children].map((li) => li.textContent ?? '');
    expect(entradas).toEqual([
      expect.stringContaining('Versión 3 · Operador SAMU'),
      expect.stringContaining('Versión 2 · Operador PNP'),
      expect.stringContaining('Versión 1 · Ciudadano'),
    ]);
    expect(entradas[0]).toContain('Motivo: Informe de la unidad');
    expect(entradas[2]).toContain('Registro inicial del reporte');
    expect(within(region).getByRole('button', { name: 'Registrar aclaración' })).toBeInTheDocument();
  });

  it('la aclaración SAMU envía las observaciones cambiadas con motivo', async () => {
    const { llamadas } = montar({
      resumenes: [resumen({ accesoSanitario: true })],
      evaluacion: () => json(200, detalle),
      precisar: () => json(200, { version: 4, condicionMedica: { heridos: 'si', atencionMedica: null, cantidadHeridos: 2 }, samuIncorporado: false }),
    });
    renderizarApp(RUTA);
    const region = await screen.findByRole('region', { name: 'Evaluación rápida' });
    await userEvent.click(await within(region).findByRole('button', { name: 'Registrar aclaración' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(within(dialogo).getByRole('group', { name: '¿Hay sangrado visible?' })).getByRole('radio', { name: 'Sí' }));
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Informe de la unidad en sitio');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Aclaración registrada.');
    expect(llamadas.find((l) => l.metodo === 'POST')!.cuerpo).toEqual({ personaPrincipal: { sangrado: 'si' }, motivo: 'Informe de la unidad en sitio' });
  });

  it('PNP no ve la sección ni hace la solicitud de evaluación', async () => {
    const { llamadas } = montar({ resumenes: [resumen()], evaluacion: () => json(200, detalle) });
    renderizarApp(RUTA);
    await screen.findByRole('heading', { name: 'Condición médica' });
    expect(screen.queryByRole('region', { name: 'Evaluación rápida' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Informe de la unidad|signos de vida/i)).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta.endsWith('/evaluacion'))).toBe(false);
  });

  it('un fallo o 404 de la evaluación muestra «no disponible» sin ocultar el resumen', async () => {
    montar({ resumenes: [resumen({ accesoSanitario: true })], evaluacion: () => json(503, {}) });
    renderizarApp(RUTA);
    expect(await screen.findByText('Evaluación no disponible')).toBeInTheDocument();
    expect(screen.getByText('Choque de dos autos en la avenida')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Condición médica' })).toBeInTheDocument();
  });
});
