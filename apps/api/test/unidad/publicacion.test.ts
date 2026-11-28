import { describe, expect, it } from '@jest/globals';
import {
  accionesPublicacion,
  CATEGORIAS_SENSIBLES,
  celdaDe,
  esSensible,
  noPublicable,
  PASO_LAT,
  PASO_LON,
  validarPublicar,
  validarReserva,
  validarRetiro,
  vencimientoDe,
  VIGENCIA_MS,
} from '../../src/modules/operaciones/dominio/publicacion';
import { ValidacionAtencionError } from '../../src/modules/operaciones/dominio/atencion';

/** P7, tarea A1.3: reglas puras de la publicacion (documento 11 §5). */
const MOTIVO = 'Caso con riesgo de reidentificación';

const campos = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidacionAtencionError) return Object.keys(e.campos).sort();
    throw e;
  }
  return [];
};

describe('celdaDe (cuadricula fija de 300 m)', () => {
  it('dos puntos de la misma celda dan el mismo centro y nunca el punto original', () => {
    const a = celdaDe(-13.1601, -74.2251);
    const b = celdaDe(-13.1602, -74.2252);
    expect(a).toEqual(b);
    expect(a).not.toEqual({ lat: -13.1601, lon: -74.2251 });
  });

  it('el centro esta a menos de media celda del punto en cada eje', () => {
    const p = { lat: -13.15872, lon: -74.22213 };
    const c = celdaDe(p.lat, p.lon);
    expect(Math.abs(c.lat - p.lat)).toBeLessThanOrEqual(PASO_LAT / 2 + 1e-7);
    expect(Math.abs(c.lon - p.lon)).toBeLessThanOrEqual(PASO_LON / 2 + 1e-7);
  });

  it('el lado de la celda mide unos 300 m', () => {
    expect(PASO_LAT * 111_320).toBeCloseTo(300, 5);
    expect(PASO_LON * 111_320 * Math.cos((13.16 * Math.PI) / 180)).toBeCloseTo(300, 5);
  });

  it('puntos a ambos lados de un borde caen en celdas distintas', () => {
    const borde = Math.floor(-13.16 / PASO_LAT) * PASO_LAT;
    expect(celdaDe(borde + 1e-6, -74.2)).not.toEqual(celdaDe(borde - 1e-6, -74.2));
  });

  it('rechaza coordenadas no finitas', () => {
    expect(() => celdaDe(Number.NaN, 0)).toThrow(RangeError);
  });
});

describe('vigencia y sensibles', () => {
  it('vence 7 dias despues de la ocurrencia', () => {
    const o = new Date('2026-11-20T10:00:00Z');
    expect(vencimientoDe(o).getTime() - o.getTime()).toBe(VIGENCIA_MS);
  });

  it('las cuatro categorias sensibles del documento 11', () => {
    expect([...CATEGORIAS_SENSIBLES].sort()).toEqual(['acoso', 'agresion', 'emergencia-medica', 'violencia']);
    expect(esSensible('robo')).toBe(false);
  });
});

describe('noPublicable', () => {
  const ahora = new Date('2026-11-27T12:00:00Z');
  const base = {
    estado: 'EN_ATENCION' as const,
    verificacion: 'VERIFICADO' as const,
    vinculado: false,
    distritoId: 'DIS-01',
    ocurridoEn: new Date('2026-11-27T10:00:00Z'),
    ahora,
  };

  it('publicable', () => expect(noPublicable(base)).toBeNull());
  it('cerrado', () => expect(noPublicable({ ...base, estado: 'CERRADO' })).toBe('INCIDENTE_CERRADO'));
  it('vinculado', () => expect(noPublicable({ ...base, vinculado: true })).toBe('INCIDENTE_VINCULADO'));
  it('sin verificar', () => expect(noPublicable({ ...base, verificacion: 'SIN_VERIFICAR' })).toBe('NO_VERIFICADO'));
  it('no verificado', () => expect(noPublicable({ ...base, verificacion: 'NO_VERIFICADO' })).toBe('NO_VERIFICADO'));
  it('distrito pendiente', () => expect(noPublicable({ ...base, distritoId: null })).toBe('DISTRITO_PENDIENTE'));
  it('fuera de vigencia justo al vencer', () => {
    expect(noPublicable({ ...base, ocurridoEn: new Date(ahora.getTime() - VIGENCIA_MS) })).toBe('FUERA_DE_VIGENCIA');
  });
});

describe('accionesPublicacion', () => {
  const base = { papel: 'principal' as const, esResponsable: true, publicable: true, vigente: false, reservada: false };
  it('el responsable publica', () => expect(accionesPublicacion(base)).toEqual(['publicar']));
  it('no publicable: sin acciones', () => expect(accionesPublicacion({ ...base, publicable: false })).toEqual([]));
  it('vigente: retirar y reservar', () => expect(accionesPublicacion({ ...base, vigente: true })).toEqual(['retirar', 'reservar']));
  it('vigente reservada: quitar reserva', () => {
    expect(accionesPublicacion({ ...base, vigente: true, reservada: true })).toEqual(['retirar', 'quitar_reserva']);
  });
  it('operador de la principal no responsable solo retira', () => {
    expect(accionesPublicacion({ ...base, esResponsable: false })).toEqual([]);
    expect(accionesPublicacion({ ...base, esResponsable: false, vigente: true })).toEqual(['retirar']);
  });
  it('un apoyo no tiene acciones', () => {
    expect(accionesPublicacion({ ...base, papel: 'simultanea', vigente: true })).toEqual([]);
  });
});

describe('validacion', () => {
  it('publicar sin reserva', () => {
    expect(validarPublicar({ estadoEsperado: 'EN_REVISION' })).toEqual({ estadoEsperado: 'EN_REVISION', reservada: false, motivoReserva: null });
  });
  it('publicar reservado exige motivo', () => {
    expect(campos(() => validarPublicar({ estadoEsperado: 'EN_REVISION', reservada: true }))).toEqual(['motivoReserva']);
    expect(validarPublicar({ estadoEsperado: 'EN_REVISION', reservada: true, motivoReserva: ` ${MOTIVO} ` }).motivoReserva).toBe(MOTIVO);
  });
  it('publicar rechaza estado, tipos y campos ajenos', () => {
    expect(campos(() => validarPublicar({ estadoEsperado: 'X', reservada: 'si', otro: 1 }))).toEqual(['estadoEsperado', 'otro', 'reservada']);
    expect(campos(() => validarPublicar({ estadoEsperado: 'EN_REVISION', motivoReserva: MOTIVO }))).toEqual(['motivoReserva']);
    expect(campos(() => validarPublicar(null))).toEqual(['cuerpo']);
  });
  it('retiro con motivo de 10 a 500', () => {
    expect(validarRetiro({ motivo: MOTIVO })).toEqual({ motivo: MOTIVO });
    expect(campos(() => validarRetiro({ motivo: 'corto' }))).toEqual(['motivo']);
    expect(campos(() => validarRetiro({ motivo: 'x'.repeat(501) }))).toEqual(['motivo']);
  });
  it('reserva', () => {
    expect(validarReserva({ reservada: false, motivo: MOTIVO })).toEqual({ reservada: false, motivo: MOTIVO });
    expect(campos(() => validarReserva({ reservada: 'no' }))).toEqual(['motivo', 'reservada']);
  });
});
