import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilaBandeja, PendienteEnrutamiento, ResumenIncidente, Sede } from '../src/api/cliente';
import { olvidarBandeja } from '../src/paginas/incidentes/Bandeja';
import { admin, instalarApi, json, operador, renderizarApp, servidorFalso, type Manejador } from './api-falsa';

/** Bandeja del operador e Inicio del administrador (P4.2, tareas 8.2 y 8.3). */

// La bandeja recordada vive en memoria del modulo: cada prueba parte sin ella.
beforeEach(() => olvidarBandeja());
afterEach(() => {
  olvidarBandeja();
  vi.restoreAllMocks();
});

const fila = (n: number, extra: Partial<FilaBandeja> = {}): FilaBandeja => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  referencia: `INC-AAAA${n}-BBBBB`,
  categoria: { id: 'robo', nombre: 'Robo' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' },
  estado: 'REGISTRADO',
  registradoEn: `2026-11-26T1${n}:00:00.000Z`,
  papel: 'principal',
  condicionMedicaPorConfirmar: false,
  prioridad: 'SIN_EVALUAR',
  ...extra,
});

function conOperador(extra: Manejador): ReturnType<typeof instalarApi> {
  const s = servidorFalso({ sesion: operador });
  return instalarApi((l) => {
    if (l.ruta.startsWith('/api/v1/operador/incidentes')) return extra(l);
    return s.manejador(l);
  });
}

const nombresFilas = () =>
  within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getByRole('link').textContent);

describe('bandeja del operador', () => {
  it('muestra las filas en el orden recibido, con etiquetas de texto e icono, sin reordenar', async () => {
    // La API manda el orden: aunque el cliente pudiera ordenar por fecha, no lo hace.
    const filas = [
      fila(3, { categoria: { id: 'incendio', nombre: 'Incendio' }, papel: 'simultanea' }),
      fila(1, { condicionMedicaPorConfirmar: true }),
    ];
    conOperador(() => json(200, { elementos: filas, siguiente: null }));
    renderizarApp('/panel/operador/incidentes');
    expect(await screen.findByRole('heading', { name: 'Bandeja de incidentes', level: 1 })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(nombresFilas()).toEqual(['IncendioINC-AAAA3-BBBBB', 'RoboINC-AAAA1-BBBBB']);
    const [, f1, f2] = within(screen.getByRole('table')).getAllByRole('row');
    expect(f1).toHaveTextContent('Simultánea');
    expect(f1).toHaveTextContent('Prioridad: Sin evaluar');
    expect(f1).not.toHaveTextContent('Condición médica por confirmar');
    const aviso = within(f2!).getByText('Condición médica por confirmar').closest('.pill')!;
    expect(aviso.querySelector('svg')).not.toBeNull();
    expect(f2).toHaveTextContent('Registrado');
  });

  it('bandeja vacia: lo informa sin datos de ejemplo', async () => {
    conOperador(() => json(200, { elementos: [], siguiente: null }));
    renderizarApp('/panel/operador/incidentes');
    expect(await screen.findByText('No hay incidentes asignados a tu sede.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('«Cargar más» pide la pagina siguiente con el cursor y agrega las filas', async () => {
    const { llamadas } = conOperador((l) =>
      l.ruta.includes('cursor=c1') ? json(200, { elementos: [fila(2)], siguiente: null }) : json(200, { elementos: [fila(1)], siguiente: 'c1' }),
    );
    renderizarApp('/panel/operador/incidentes');
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(nombresFilas()).toHaveLength(2));
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/v1/operador/incidentes')).map((l) => l.ruta)).toEqual([
      '/api/v1/operador/incidentes',
      '/api/v1/operador/incidentes?cursor=c1',
    ]);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('«Actualizar» vuelve a pedir la primera pagina; no hay consultas periodicas', async () => {
    const intervalo = vi.spyOn(window, 'setInterval');
    const espera = vi.spyOn(window, 'setTimeout');
    let n = 1;
    const { llamadas } = conOperador(() => json(200, { elementos: [fila(n)], siguiente: null }));
    renderizarApp('/panel/operador/incidentes');
    await screen.findByRole('table');
    n = 2;
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(nombresFilas()).toEqual(['RoboINC-AAAA2-BBBBB']));
    expect(llamadas.filter((l) => l.ruta === '/api/v1/operador/incidentes')).toHaveLength(2);
    // Ninguna consulta programada: solo las esperas de hasta 1 s de las utilidades de prueba y el tiempo
    // maximo de 45 s de cada solicitud del cliente.
    const programados = [...intervalo.mock.calls, ...espera.mock.calls].map((c) => Number(c[1] ?? 0));
    expect(programados.filter((ms) => ms > 1000 && ms !== 45_000)).toEqual([]);
  });

  it('red caida: informa y «Reintentar» recupera, sin mostrar filas anteriores como actuales', async () => {
    let sinRed = true;
    conOperador(() => (sinRed ? 'red' : json(200, { elementos: [fila(1)], siguiente: null })));
    renderizarApp('/panel/operador/incidentes');
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    sinRed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('403: indica que no hay permiso, sin datos; 401: vuelve al acceso', async () => {
    conOperador(() => json(403, { error: { code: 'FORBIDDEN' } }));
    const { unmount } = renderizarApp('/panel/operador/incidentes');
    expect(await screen.findByText('No puedes consultar la bandeja')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();
    conOperador(() => json(401, { error: { code: 'UNAUTHENTICATED' } }));
    renderizarApp('/panel/operador/incidentes');
    expect(await screen.findByText('Tu sesión no es válida o venció')).toBeInTheDocument();
  });
});

describe('resumen del incidente', () => {
  const resumen: ResumenIncidente = {
    ...fila(1, { categoria: { id: 'accidente-transito', nombre: 'Accidente de tránsito' }, papel: 'simultanea', condicionMedicaPorConfirmar: true }),
    descripcion: 'Choque de dos autos en la avenida',
    ocurrencia: { modo: 'ahora', instante: '2026-11-26T10:58:00.000Z' },
    territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
    respuestasCiudadano: { heridos: 'si', atencionMedica: 'no_se' },
    condicionMedica: null,
    accesoSanitario: false,
    otrasInstituciones: ['samu'],
  };

  it('abre el resumen desde la fila y vuelve a la bandeja con las mismas filas', async () => {
    const { llamadas } = conOperador((l) =>
      l.ruta === '/api/v1/operador/incidentes' ? json(200, { elementos: [fila(1), fila(2)], siguiente: null }) : json(200, resumen),
    );
    renderizarApp('/panel/operador/incidentes');
    await userEvent.click(await screen.findByRole('link', { name: /Robo\s*INC-AAAA1-BBBBB/ }));
    expect(await screen.findByRole('heading', { name: 'Accidente de tránsito', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Choque de dos autos en la avenida')).toBeInTheDocument();
    expect(screen.getByText('Informado por el ciudadano')).toBeInTheDocument();
    expect(screen.getByText('No sabe')).toBeInTheDocument();
    expect(screen.getByText('SAMU')).toBeInTheDocument();
    // Sin acciones que la API no ofrece todavia.
    expect(screen.queryByRole('button', { name: /asumir|atender|cerrar caso|prioridad/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Volver a la bandeja' }));
    await screen.findByRole('table');
    expect(nombresFilas()).toHaveLength(2);
    expect(llamadas.filter((l) => l.ruta === '/api/v1/operador/incidentes')).toHaveLength(1);
  });

  it('404 en la ruta directa: «Incidente no disponible» sin datos', async () => {
    conOperador(() => json(404, { error: { code: 'NOT_FOUND' } }));
    renderizarApp('/panel/operador/incidentes/00000000-0000-4000-8000-000000000009');
    expect(await screen.findByText('Incidente no disponible')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la bandeja' })).toHaveAttribute('href', '/panel/operador/incidentes');
  });
});

describe('enrutamiento pendiente del administrador', () => {
  const pendiente: PendienteEnrutamiento = {
    incidenteId: '11111111-1111-4111-8111-111111111111',
    referencia: 'INC-PPPPP-QQQQQ',
    categoria: { id: 'accidente-transito', nombre: 'Accidente de tránsito' },
    territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
    registradoEn: '2026-11-26T10:00:00.000Z',
    faltantes: [{ institucion: 'samu', papel: 'principal', motivo: 'sin_sede_elegible' }],
  };
  const sede = (id: string, extra: Partial<Sede> = {}): Sede => ({
    id,
    institucionId: 'samu',
    nombre: `Base SAMU ${id}`,
    distritoUbicacionId: null,
    direccion: null,
    contacto: null,
    verificacion: { estado: 'verificada', fuente: 'Oficio', fecha: '2026-11-20' },
    habilitadaAtencion: true,
    activa: true,
    esDemostracion: false,
    distritos: ['DIS-05'],
    categorias: [],
    ...extra,
  });

  function conAdmin(designar: Manejador, opciones: { pendientes?: () => readonly PendienteEnrutamiento[] } = {}) {
    const s = servidorFalso({ sesion: admin });
    return instalarApi((l) => {
      if (l.ruta === '/api/v1/admin/enrutamientos-pendientes') return json(200, { elementos: opciones.pendientes?.() ?? [pendiente], siguiente: null });
      if (l.ruta.startsWith('/api/v1/admin/enrutamientos-pendientes/')) return designar(l);
      if (l.ruta === '/api/v1/administrador/organizacion/sedes') {
        return json(200, { sedes: [sede('a'), sede('b', { habilitadaAtencion: false }), sede('c', { institucionId: 'pnp' })] });
      }
      return s.manejador(l);
    });
  }

  it('lista los faltantes y designa una sede con motivo en una sola solicitud', async () => {
    let lista = [pendiente];
    const { llamadas } = conAdmin(
      () => {
        lista = [];
        return json(201, { enrutamiento: { incidenteId: pendiente.incidenteId, resultado: 'ENRUTADO', faltantes: [] } });
      },
      { pendientes: () => lista },
    );
    renderizarApp('/panel');
    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('SAMU · Principal');
    expect(tabla).toHaveTextContent('sin sede habilitada con cobertura y competencia');
    await userEvent.click(within(tabla).getByRole('button', { name: /Designar sede de SAMU para INC-PPPPP-QQQQQ/ }));
    const selector = await screen.findByRole('combobox', { name: 'Sede habilitada' });
    // Solo sedes SAMU activas y habilitadas.
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elige una sede', 'Base SAMU a']);
    await userEvent.selectOptions(selector, 'a');
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo de la designación' }), 'Sin cobertura SAMU en el distrito');
    const boton = screen.getByRole('button', { name: 'Designar sede' });
    await userEvent.dblClick(boton);
    expect(await screen.findByText('Sede designada para INC-PPPPP-QQQQQ')).toBeInTheDocument();
    const posts = llamadas.filter((l) => l.metodo === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.ruta).toBe(`/api/v1/admin/enrutamientos-pendientes/${pendiente.incidenteId}/designaciones`);
    expect(posts[0]!.cuerpo).toEqual({ institucion: 'samu', sedeId: 'a', motivo: 'Sin cobertura SAMU en el distrito' });
    expect(await screen.findByText('No hay casos sin asignar.')).toBeInTheDocument();
  });

  it('valida el motivo antes de enviar', async () => {
    const { llamadas } = conAdmin(() => json(500));
    renderizarApp('/panel');
    await userEvent.click(await screen.findByRole('button', { name: /Designar sede de SAMU/ }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Sede habilitada' }), 'a');
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo de la designación' }), 'corto');
    await userEvent.click(screen.getByRole('button', { name: 'Designar sede' }));
    expect(await screen.findByText('Escribe un motivo de 10 a 500 caracteres.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
  });

  it('409 SEDE_NO_DESIGNABLE: explica los requisitos sin presentar la designacion como hecha', async () => {
    conAdmin(() => json(409, { error: { code: 'SEDE_NO_DESIGNABLE', message: 'x', requisitos: ['operador_activo'], requestId: 'r' } }));
    renderizarApp('/panel');
    await userEvent.click(await screen.findByRole('button', { name: /Designar sede de SAMU/ }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Sede habilitada' }), 'a');
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo de la designación' }), 'Sin cobertura SAMU en el distrito');
    await userEvent.click(screen.getByRole('button', { name: 'Designar sede' }));
    expect(await screen.findByText('No se designó la sede')).toBeInTheDocument();
    expect(screen.getByText('La sede necesita al menos un operador activo.')).toBeInTheDocument();
    expect(screen.queryByText(/Sede designada/)).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('INC-PPPPP-QQQQQ');
  });

  it('«Reevaluar» informa si el caso sigue pendiente', async () => {
    const { llamadas } = conAdmin(() =>
      json(200, { enrutamiento: { incidenteId: pendiente.incidenteId, resultado: 'ENRUTAMIENTO_PENDIENTE', faltantes: pendiente.faltantes } }),
    );
    renderizarApp('/panel');
    await userEvent.click(await screen.findByRole('button', { name: /Reevaluar/ }));
    expect(await screen.findByText('El caso INC-PPPPP-QQQQQ sigue pendiente')).toBeInTheDocument();
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => l.ruta)).toEqual([
      `/api/v1/admin/enrutamientos-pendientes/${pendiente.incidenteId}/reevaluar`,
    ]);
  });
});
