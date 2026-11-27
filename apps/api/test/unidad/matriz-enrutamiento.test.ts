import { describe, expect, it } from '@jest/globals';
import { CATEGORIAS_PILOTO } from '../../src/modules/reportes';
import {
  CATEGORIAS_CON_REGLA,
  CategoriaSinReglaError,
  INSTITUCIONES_DESTINO,
  VERSION_MATRIZ,
  deduplicar,
  faltantesDesdeJson,
  planificar,
  planificarCondicionMedica,
  resolverDestinatarios,
  type InstitucionDestino,
  type Papel,
  type RespuestaMedica,
} from '../../src/modules/operaciones';

const RESPUESTAS: RespuestaMedica[] = ['si', 'no', 'no_se', null];
const resumen = (c: string, h: RespuestaMedica = null, a: RespuestaMedica = null) =>
  resolverDestinatarios(c, h, a).destinatarios.map((d) => `${d.institucion}:${d.papel}`);

describe('matriz de destinatarios (documento 09 §4)', () => {
  it('tiene una regla por cada una de las 16 categorias y ninguna extra', () => {
    expect([...CATEGORIAS_CON_REGLA].sort()).toEqual(CATEGORIAS_PILOTO.map((c) => c.id).sort());
  });

  it.each([
    ['acoso', 'pnp'], ['actividad-sospechosa', 'pnp'], ['agresion', 'pnp'], ['asalto', 'pnp'],
    ['danos-sismo', 'bomberos'], ['deslizamiento', 'bomberos'], ['emergencia-medica', 'samu'],
    ['incendio', 'bomberos'], ['inundacion', 'bomberos'], ['otra-emergencia', 'serenazgo'],
    ['otro-incidente-seguridad', 'pnp'], ['pelea', 'pnp'], ['robo', 'pnp'], ['vandalismo', 'pnp'],
    ['violencia', 'pnp'], ['accidente-transito', 'pnp'],
  ])('%s tiene principal %s (sin condicion medica)', (categoria, principal) => {
    const r = resolverDestinatarios(categoria, 'no', 'no');
    expect(r.version).toBe(VERSION_MATRIZ);
    expect(r.destinatarios.filter((d) => d.papel === 'principal')).toEqual([{ institucion: principal, papel: 'principal' }]);
  });

  it('actividad sospechosa y vandalismo notifican a Serenazgo como simultanea', () => {
    expect(resumen('actividad-sospechosa')).toEqual(['pnp:principal', 'serenazgo:simultanea']);
    expect(resumen('vandalismo')).toEqual(['pnp:principal', 'serenazgo:simultanea']);
  });

  it('sin apoyo local configurado, asalto solo llega a PNP', () => {
    expect(resumen('asalto', 'si', 'si')).toEqual(['pnp:principal']);
  });

  it('robo con heridos no anade SAMU', () => {
    expect(resumen('robo', 'si')).toEqual(['pnp:principal']);
    expect(resolverDestinatarios('robo', 'no_se', null).revisionMedicaPendiente).toBe(false);
  });

  describe('accidente de transito (RF57): 16 combinaciones', () => {
    const casos = RESPUESTAS.flatMap((h) => RESPUESTAS.map((a) => [h, a] as const));
    it.each(casos)('heridos=%s atencion=%s', (h, a) => {
      const r = resolverDestinatarios('accidente-transito', h, a);
      const resumenR = r.destinatarios.map((d) => `${d.institucion}:${d.papel}`);
      if (h === 'si' || a === 'si') {
        expect(resumenR).toEqual(['samu:principal', 'pnp:simultanea']);
        expect(r.revisionMedicaPendiente).toBe(false);
      } else {
        expect(resumenR).toEqual(['pnp:principal']);
        // Desconocido nunca equivale a «no».
        expect(r.revisionMedicaPendiente).toBe(!(h === 'no' && a === 'no'));
      }
    });
  });

  describe.each(['agresion', 'pelea', 'violencia'])('%s con SAMU condicionado', (categoria) => {
    it.each(RESPUESTAS)('heridos=%s', (h) => {
      const r = resolverDestinatarios(categoria, h, null);
      const res = r.destinatarios.map((d) => `${d.institucion}:${d.papel}`);
      if (h === 'si') expect(res).toEqual(['pnp:principal', 'samu:condicionada']);
      else expect(res).toEqual(['pnp:principal']);
      expect(r.revisionMedicaPendiente).toBe(h === 'no_se' || h === null);
    });
  });

  it('emergencia medica tiene a SAMU como principal aunque no haya heridos', () => {
    expect(resumen('emergencia-medica', 'no', 'no')).toEqual(['samu:principal']);
  });

  it('una categoria desconocida lanza un error, sin regla por defecto', () => {
    expect(() => resolverDestinatarios('ovni', null, null)).toThrow(CategoriaSinReglaError);
    expect(() => resolverDestinatarios('__proto__', null, null)).toThrow(CategoriaSinReglaError);
  });

  it('ninguna salida contiene instituciones fuera de las cuatro admitidas', () => {
    for (const c of CATEGORIAS_CON_REGLA) {
      for (const h of RESPUESTAS) {
        for (const a of RESPUESTAS) {
          for (const d of resolverDestinatarios(c, h, a).destinatarios) {
            expect(INSTITUCIONES_DESTINO).toContain(d.institucion);
          }
        }
      }
    }
  });

  it('deduplica por institucion conservando el papel de mayor rango', () => {
    expect(deduplicar([
      { institucion: 'serenazgo', papel: 'condicionada' },
      { institucion: 'pnp', papel: 'principal' },
      { institucion: 'serenazgo', papel: 'simultanea' },
    ])).toEqual([{ institucion: 'pnp', papel: 'principal' }, { institucion: 'serenazgo', papel: 'simultanea' }]);
    expect(() => deduplicar([{ institucion: 'ejercito' as never, papel: 'principal' }])).toThrow();
  });
});

describe('faltantes y resultado del enrutamiento', () => {
  const dest = resolverDestinatarios('accidente-transito', 'si', null).destinatarios;

  it('sin distrito, todas las instituciones faltan y no hay participaciones', () => {
    const p = planificar(dest, null, new Map([['samu', ['s1']]]));
    expect(p.resultado).toBe('ENRUTAMIENTO_PENDIENTE');
    expect(p.participaciones).toEqual([]);
    expect(p.faltantes).toEqual([
      { institucion: 'samu', papel: 'principal', motivo: 'sin_distrito' },
      { institucion: 'pnp', papel: 'simultanea', motivo: 'sin_distrito' },
    ]);
  });

  it('falta solo la principal: la simultanea participa igualmente', () => {
    const p = planificar(dest, 'huamanga', new Map([['pnp', ['p1']]]));
    expect(p.resultado).toBe('ENRUTAMIENTO_PENDIENTE');
    expect(p.participaciones).toEqual([{ sedeId: 'p1', institucion: 'pnp', papel: 'simultanea' }]);
    expect(p.faltantes).toEqual([{ institucion: 'samu', papel: 'principal', motivo: 'sin_sede_elegible' }]);
  });

  it('falta solo la simultanea', () => {
    const p = planificar(dest, 'huamanga', new Map([['samu', ['s1', 's1', 's2']]]));
    expect(p.participaciones.map((x) => x.sedeId)).toEqual(['s1', 's2']);
    expect(p.faltantes).toEqual([{ institucion: 'pnp', papel: 'simultanea', motivo: 'sin_sede_elegible' }]);
  });

  it('nada falta: ENRUTADO', () => {
    const p = planificar(dest, 'huamanga', new Map([['samu', ['s1']], ['pnp', ['p1', 'p2']]]));
    expect(p.resultado).toBe('ENRUTADO');
    expect(p.participaciones).toHaveLength(3);
    expect(p.faltantes).toEqual([]);
  });

  it('valida los faltantes leidos de la persistencia', () => {
    expect(faltantesDesdeJson([{ institucion: 'pnp', papel: 'principal', motivo: 'sin_distrito' }])).toHaveLength(1);
    expect(() => faltantesDesdeJson({})).toThrow();
    expect(() => faltantesDesdeJson([{ institucion: 'x', papel: 'principal', motivo: 'sin_distrito' }])).toThrow();
    expect(() => faltantesDesdeJson([null])).toThrow();
  });
});

describe('planificarCondicionMedica', () => {
  const presentes = (pares: [InstitucionDestino, Papel][]) => new Map(pares);

  it('accidente que pasa a SAMU: incorpora SAMU principal y PNP pasa a simultanea', () => {
    const plan = planificarCondicionMedica(presentes([['pnp', 'principal']]), resolverDestinatarios('accidente-transito', 'si', null));
    expect(plan).toEqual({
      incorporar: [{ institucion: 'samu', papel: 'principal' }],
      cambiosPapel: [{ institucion: 'pnp', papel: 'simultanea' }],
    });
  });

  it('agresion con heridos: SAMU condicionada sin cambiar la principal', () => {
    expect(planificarCondicionMedica(presentes([['pnp', 'principal']]), resolverDestinatarios('agresion', 'si', null))).toEqual({
      incorporar: [{ institucion: 'samu', papel: 'condicionada' }],
      cambiosPapel: [],
    });
  });

  it('sin SAMU en el objetivo no cambia nada, aunque SAMU ya participe', () => {
    const sinCambio = { incorporar: [], cambiosPapel: [] };
    expect(planificarCondicionMedica(presentes([['pnp', 'principal']]), resolverDestinatarios('accidente-transito', 'no', 'no'))).toEqual(sinCambio);
    expect(
      planificarCondicionMedica(
        presentes([['samu', 'principal'], ['pnp', 'simultanea']]),
        resolverDestinatarios('accidente-transito', 'no', 'no'),
      ),
    ).toEqual(sinCambio);
  });

  it('SAMU ya presente con el mismo papel: nada que hacer', () => {
    expect(
      planificarCondicionMedica(presentes([['samu', 'principal'], ['pnp', 'simultanea']]), resolverDestinatarios('accidente-transito', 'si', 'si')),
    ).toEqual({ incorporar: [], cambiosPapel: [] });
  });

  it('SAMU nunca baja de rango', () => {
    expect(
      planificarCondicionMedica(presentes([['pnp', 'principal'], ['samu', 'principal']]), resolverDestinatarios('pelea', 'si', null)).cambiosPapel,
    ).toEqual([]);
  });
});
