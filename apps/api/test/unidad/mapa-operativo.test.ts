import { describe, expect, it } from '@jest/globals';
import { BandejaInstitucional, LIMITE_MAPA_OPERATIVO, type FilaOperaciones } from '../../src/modules/consultas/aplicacion/bandeja.use-case';
import { FiltroMapaInvalidoError } from '../../src/modules/consultas/aplicacion/mapa.use-case';

/** P7, tarea B1: truncado y filtros del mapa operativo con dobles de los puertos. */
const fila = (i: number): FilaOperaciones => ({
  incidenteId: `id-${i}`,
  referencia: `INC-${i}`,
  estado: 'EN_REVISION',
  registradoEn: new Date('2026-11-27T10:00:00Z'),
  categoriaId: 'robo',
  distritoId: 'DIS-01',
  revisionMedicaPendiente: false,
  papel: 'principal',
});

function bandeja(total: number, sinPunto: readonly string[] = []) {
  let filtroRecibido: unknown = null;
  const b = new BandejaInstitucional({
    ambito: { de: async () => ({ sedeId: 's', distritos: ['DIS-01'], categorias: ['robo'], habilitadaAtencion: true }) },
    participaciones: { bandeja: async () => [], participacionDe: async () => null },
    originales: { resumenOperativo: async () => new Map() },
    categorias: { nombres: async () => new Map([['robo', 'Robo']]) },
    ahora: () => new Date('2026-11-28T00:00:00Z'),
    mapaOperativo: {
      participaciones: async (_a, filtro, limite) => {
        filtroRecibido = filtro;
        return Array.from({ length: Math.min(total, limite) }, (_, i) => fila(i));
      },
      puntos: async (ids) => new Map(ids.filter((id) => !sinPunto.includes(id)).map((id) => [id, { latitud: -13.16, longitud: -74.22 }])),
      publicaciones: async () => new Map([['id-0', { reservada: true, venceEn: new Date() }]]),
    },
  });
  return { b, filtro: () => filtroRecibido };
}

describe('mapa operativo', () => {
  it('trunca a 500 e indica truncado', async () => {
    const { b } = bandeja(LIMITE_MAPA_OPERATIVO + 10);
    const r = await b.mapa('u', {});
    expect(r.elementos).toHaveLength(LIMITE_MAPA_OPERATIVO);
    expect(r.truncado).toBe(true);
    expect(r.elementos[0]!.publicacion).toEqual({ vigente: true, reservada: true });
  });

  it('sin truncado y omite elementos sin punto', async () => {
    const { b } = bandeja(3, ['id-1']);
    const r = await b.mapa('u', { periodo: '24h', distrito: 'DIS-01', categoria: 'robo' });
    expect(r.truncado).toBe(false);
    expect(r.elementos.map((e) => e.id)).toEqual(['id-0', 'id-2']);
  });

  it('periodo por defecto 7 dias y filtros nulos', async () => {
    const { b, filtro } = bandeja(0);
    await b.mapa('u', {});
    expect(filtro()).toEqual({ desde: new Date('2026-11-21T00:00:00Z'), distritoId: null, categoriaId: null });
  });

  it('filtros invalidos', async () => {
    const { b } = bandeja(0);
    await expect(b.mapa('u', { periodo: '3d', categoria: 'nada', distrito: '', x: 1 })).rejects.toBeInstanceOf(FiltroMapaInvalidoError);
  });
});
