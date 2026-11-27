import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumenIncidente } from '../src/api/cliente';
import { instalarApi, json, operador, renderizarApp, servidorFalso } from './api-falsa';

/** P5.2, tarea 12.1: sección «Fotografías» del resumen del operador. */
const ID = '00000000-0000-4000-8000-000000000001';
const F1 = '00000000-0000-4000-8000-0000000000f1';
const F2 = '00000000-0000-4000-8000-0000000000f2';
const RUTA = `/panel/operador/incidentes/${ID}`;

const resumen = (evidencias: ResumenIncidente['evidencias']): ResumenIncidente => ({
  id: ID,
  referencia: 'INC-AAAA1-BBBBB',
  categoria: { id: 'robo', nombre: 'Robo' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' },
  estado: 'REGISTRADO',
  registradoEn: '2026-11-26T10:00:00.000Z',
  papel: 'principal',
  condicionMedicaPorConfirmar: false,
  prioridad: 'SIN_EVALUAR',
  descripcion: 'Me robaron el celular',
  ocurrencia: { modo: 'ahora', instante: '2026-11-26T09:58:00.000Z' },
  territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
  respuestasCiudadano: { heridos: null, atencionMedica: null },
  condicionMedica: null,
  accesoSanitario: false,
  otrasInstituciones: [],
  evidencias,
});

const foto = (id: string) => ({ id, tipo: 'image/jpeg' as const, bytes: 1200, adjuntadaEn: '2026-11-26T10:01:00.000Z' });

let creadas: string[];
let revocadas: string[];
beforeEach(() => {
  creadas = [];
  revocadas = [];
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => {
      const u = `blob:prueba/${++n}`;
      creadas.push(u);
      return u;
    }),
    revokeObjectURL: vi.fn((u: string) => revocadas.push(u)),
  }));
});
afterEach(() => vi.restoreAllMocks());

function montar(evidencias: ResumenIncidente['evidencias'], contenido: (id: string) => ReturnType<typeof json> = () => json(200, { bytes: 'imagen' })) {
  const s = servidorFalso({ sesion: operador });
  return instalarApi((l) => {
    const m = /\/evidencias\/([^/]+)\/contenido$/.exec(l.ruta);
    if (m) return contenido(m[1]!);
    if (l.ruta === `/api/v1/operador/incidentes/${ID}`) return json(200, resumen(evidencias));
    return s.manejador(l);
  });
}

const seccion = () => screen.getByRole('region', { name: 'Fotografías' });

describe('fotografías en el resumen (12.1)', () => {
  it('muestra cada imagen obtenida con la sesión, con texto alternativo e instante', async () => {
    const { llamadas } = montar([foto(F1), foto(F2)]);
    renderizarApp(RUTA);
    expect(await screen.findByRole('img', { name: 'Fotografía 1 enviada por el ciudadano' })).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    expect(screen.getByRole('img', { name: 'Fotografía 2 enviada por el ciudadano' })).toBeInTheDocument();
    expect(within(seccion()).getAllByText(/^Adjuntada /)).toHaveLength(2);
    const pedidas = llamadas.filter((l) => l.ruta.endsWith('/contenido'));
    expect(pedidas.map((l) => l.ruta).sort()).toEqual([
      `/api/v1/operador/incidentes/${ID}/evidencias/${F1}/contenido`,
      `/api/v1/operador/incidentes/${ID}/evidencias/${F2}/contenido`,
    ]);
    for (const l of pedidas) {
      expect(l.init.credentials).toBe('same-origin');
      expect(l.init.cache).toBe('no-store');
    }
    expect(seccion().innerHTML).not.toMatch(/cloudinary|aynisafe\/|https?:\/\//);
  });

  it('sin fotos indica que el ciudadano no adjuntó fotografías y no pide contenidos', async () => {
    const { llamadas } = montar([]);
    renderizarApp(RUTA);
    expect(await screen.findByText('El ciudadano no adjuntó fotografías.')).toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta.endsWith('/contenido'))).toBe(false);
  });

  it.each([404, 503])('una foto que responde %i se muestra no disponible sin ocultar el resumen', async (estado) => {
    montar([foto(F1), foto(F2)], (id) => (id === F2 ? json(estado, { error: { code: 'X' } }) : json(200, {})));
    renderizarApp(RUTA);
    expect(await screen.findByText('Fotografía 2 no disponible')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Fotografía 1 enviada por el ciudadano' })).toBeInTheDocument();
    expect(screen.getByText('Me robaron el celular')).toBeInTheDocument();
  });

  it('se amplía con Enter, se cierra con Escape y el foco vuelve a la miniatura', async () => {
    const u = userEvent.setup();
    montar([foto(F1)]);
    renderizarApp(RUTA);
    const abrir = await screen.findByRole('button', { name: 'Ampliar fotografía 1 enviada por el ciudadano' });
    abrir.focus();
    await u.keyboard('{Enter}');
    const dialogo = await screen.findByRole('dialog', { name: 'Fotografía 1 enviada por el ciudadano' });
    expect(within(dialogo).getByRole('img', { name: 'Fotografía 1 enviada por el ciudadano' })).toBeInTheDocument();
    dialogo.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(abrir).toHaveFocus();
  });

  it('revoca las URL de objeto al salir y no escribe en el almacenamiento del navegador', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    montar([foto(F1), foto(F2)]);
    const { unmount } = renderizarApp(RUTA);
    await screen.findByRole('img', { name: 'Fotografía 2 enviada por el ciudadano' });
    unmount();
    expect(revocadas.sort()).toEqual(creadas.sort());
    expect(local.mock.calls.filter(([clave]) => /foto|evidenc|blob/i.test(String(clave)))).toEqual([]);
  });
});
