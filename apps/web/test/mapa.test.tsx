import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElementoMapaOperativo, MapaOperativo } from '../src/api/cliente';
import { instalarApi, json, operador, renderizarApp, servidorFalso, type Llamada } from './api-falsa';

/**
 * P7, tarea B3: sección Mapa del operador. El lienzo Leaflet se sustituye por un doble (jsdom no
 * dibuja teselas); un modo lo hace fallar para comprobar que la consulta sigue disponible.
 */
const lienzo = vi.hoisted(() => ({ fallar: false, elementos: 0 }));
vi.mock('../src/paginas/incidentes/MapaLeaflet', () => ({
  default: ({ elementos }: { elementos: readonly unknown[] }) => {
    if (lienzo.fallar) throw new Error('leaflet roto');
    lienzo.elementos = elementos.length;
    return <div data-testid="lienzo">{elementos.length} marcadores</div>;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  lienzo.fallar = false;
});

const elemento = (extra: Partial<ElementoMapaOperativo> = {}): ElementoMapaOperativo => ({
  id: '00000000-0000-4000-8000-000000000001',
  referencia: 'INC-AAAA1-BBBBB',
  categoria: { id: 'robo', nombre: 'Robo' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' },
  estado: 'EN_REVISION',
  prioridad: 'ALTA',
  registradoEn: '2026-11-27T10:00:00.000Z',
  punto: { lat: -13.16, lon: -74.22 },
  publicacion: { vigente: true, reservada: false },
  ...extra,
});

const mapa = (elementos: ElementoMapaOperativo[], truncado = false): MapaOperativo => ({
  filtros: { distrito: null, categoria: null, periodo: '7d' },
  truncado,
  elementos,
});

function montar(respuesta: (l: Llamada) => ReturnType<typeof json>) {
  const s = servidorFalso({ sesion: operador });
  return instalarApi((l) => {
    if (l.ruta.startsWith('/api/v1/operador/mapa')) return respuesta(l);
    if (l.ruta === '/api/v1/publico/territorio/distritos') return json(200, { estado: 'pendiente', version: null, distritos: [{ id: 'DIS-01', nombre: 'Ayacucho', ubigeo: null }, { id: 'DIS-02', nombre: 'Carmen Alto', ubigeo: null }] });
    if (l.ruta === '/api/v1/publico/categorias') return json(200, { categorias: [{ id: 'robo', nombre: 'Robo' }, { id: 'incendio', nombre: 'Incendio' }] });
    if (l.ruta === '/api/v1/publico/territorio/limites') return json(503, { error: { code: 'TERRITORY_UNAVAILABLE' } });
    return s.manejador(l);
  });
}

describe('sección Mapa del operador', () => {
  it('muestra resumen, leyenda, lienzo y una lista con enlace al detalle', async () => {
    montar(() => json(200, mapa([elemento(), elemento({ id: '00000000-0000-4000-8000-000000000002', referencia: 'INC-CCCC2-DDDDD', estado: 'CERRADO', publicacion: { vigente: false, reservada: false } })])));
    renderizarApp('/panel/operador/mapa');
    expect(await screen.findByRole('heading', { name: 'Mapa de incidencias', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('2 incidentes visibles')).toBeInTheDocument();
    expect(screen.getByText('1 en seguimiento')).toBeInTheDocument();
    expect(screen.getByText('1 publicados en el mapa ciudadano')).toBeInTheDocument();
    expect(await screen.findByTestId('lienzo')).toHaveTextContent('2 marcadores');
    const enlace = screen.getByRole('link', { name: 'INC-AAAA1-BBBBB' });
    expect(enlace).toHaveAttribute('href', '/panel/operador/incidentes/00000000-0000-4000-8000-000000000001');
    expect(within(screen.getByLabelText('Tipos de incidentes visibles')).getByRole('button', { name: /Robo/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('los filtros vuelven a consultar con distrito, categoría y período', async () => {
    const { llamadas } = montar(() => json(200, mapa([])));
    renderizarApp('/panel/operador/mapa');
    expect(await screen.findByText('Sin incidentes para estos filtros.')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Carmen Alto' });
    await userEvent.selectOptions(screen.getByLabelText('Distrito'), 'DIS-02');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de incidente'), 'robo');
    await userEvent.selectOptions(screen.getByLabelText('Período'), '24h');
    await waitFor(() => {
      const rutas = llamadas.filter((l) => l.ruta.startsWith('/api/v1/operador/mapa')).map((l) => l.ruta);
      expect(rutas.at(-1)).toBe('/api/v1/operador/mapa?distrito=DIS-02&categoria=robo&periodo=24h');
    });
  });

  it('si el mapa falla, la lista y los filtros siguen disponibles', async () => {
    lienzo.fallar = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    montar(() => json(200, mapa([elemento()])));
    renderizarApp('/panel/operador/mapa');
    expect(await screen.findByText('El mapa no está disponible')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'INC-AAAA1-BBBBB' })).toBeInTheDocument();
    expect(screen.getByLabelText('Distrito')).toBeEnabled();
  });

  it('un error de la API se muestra con reintento', async () => {
    let n = 0;
    montar(() => (n++ === 0 ? json(503, {}) : json(200, mapa([elemento()], true))));
    renderizarApp('/panel/operador/mapa');
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('1 incidente visible')).toBeInTheDocument();
    expect(screen.getByText('Se muestran los 500 más recientes')).toBeInTheDocument();
  });
});
