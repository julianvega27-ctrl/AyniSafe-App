import { describe, expect, it } from '@jest/globals';
import {
  accionesPermitidas,
  destinoTransicion,
  validarMotivoAdmin,
  validarTransicion,
  validarVerificacion,
  ValidacionAtencionError,
} from '../../src/modules/operaciones/dominio/atencion';

/** P6, tarea A1.3: reglas puras de la atencion institucional (documento 11 §2). */
const MOTIVO = 'Confirmado por llamada al lugar';
const RESUMEN = 'La PNP atendió el caso en el lugar.';

const campos = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidacionAtencionError) return Object.keys(e.campos).sort();
    throw e;
  }
  return [];
};

describe('transiciones permitidas', () => {
  it('iniciar atención solo desde EN_REVISION', () => {
    expect(destinoTransicion('EN_REVISION', 'iniciar_atencion')).toBe('EN_ATENCION');
    for (const e of ['REGISTRADO', 'EN_ATENCION', 'CERRADO'] as const) expect(destinoTransicion(e, 'iniciar_atencion')).toBeNull();
  });

  it('atendido solo desde EN_ATENCION y descartado sin pasar por atención', () => {
    expect(destinoTransicion('EN_ATENCION', 'cerrar', 'ATENDIDO')).toBe('CERRADO');
    expect(destinoTransicion('EN_REVISION', 'cerrar', 'ATENDIDO')).toBeNull();
    expect(destinoTransicion('REGISTRADO', 'cerrar', 'DESCARTADO')).toBe('CERRADO');
    expect(destinoTransicion('EN_REVISION', 'cerrar', 'DESCARTADO')).toBe('CERRADO');
    expect(destinoTransicion('EN_ATENCION', 'cerrar', 'DESCARTADO')).toBeNull();
    expect(destinoTransicion('CERRADO', 'cerrar', 'ATENDIDO')).toBeNull();
  });
});

describe('acciones permitidas', () => {
  const base = { papel: 'principal' as const, institucionConResponsable: true, esResponsable: true };

  it('sin responsable solo se puede asumir', () => {
    expect(accionesPermitidas({ ...base, estado: 'REGISTRADO', institucionConResponsable: false, esResponsable: false })).toEqual(['asumir']);
  });

  it('el responsable de la principal en revisión puede iniciar, descartar y verificar, no cerrar atendido', () => {
    expect(accionesPermitidas({ ...base, estado: 'EN_REVISION' })).toEqual(['iniciar_atencion', 'descartar', 'verificar', 'vincular']);
    expect(accionesPermitidas({ ...base, estado: 'EN_ATENCION' })).toEqual(['cerrar_atendido', 'verificar', 'vincular']);
  });

  it('un apoyo con responsable no cambia el estado', () => {
    expect(accionesPermitidas({ ...base, papel: 'simultanea', estado: 'EN_REVISION' })).toEqual([]);
  });

  it('otro operador de la institución con responsable no tiene acciones', () => {
    expect(accionesPermitidas({ ...base, esResponsable: false, estado: 'EN_ATENCION' })).toEqual([]);
  });

  it('cerrado o vinculado no admite acciones de estado', () => {
    expect(accionesPermitidas({ ...base, estado: 'CERRADO', institucionConResponsable: false })).toEqual([]);
    expect(accionesPermitidas({ ...base, estado: 'EN_REVISION', vinculado: true })).toEqual([]);
  });
});

describe('validación de cuerpos', () => {
  it('cerrar exige resultado, motivo y resumen ciudadano', () => {
    expect(campos(() => validarTransicion({ accion: 'cerrar', estadoEsperado: 'EN_ATENCION' }))).toEqual(['motivo', 'resultado', 'resumenCiudadano']);
    expect(validarTransicion({ accion: 'cerrar', estadoEsperado: 'EN_ATENCION', resultado: 'ATENDIDO', motivo: MOTIVO, resumenCiudadano: RESUMEN }))
      .toEqual({ accion: 'cerrar', estadoEsperado: 'EN_ATENCION', resultado: 'ATENDIDO', motivo: MOTIVO, resumenCiudadano: RESUMEN });
  });

  it('iniciar atención no admite campos de cierre y exige estado esperado', () => {
    expect(campos(() => validarTransicion({ accion: 'iniciar_atencion', motivo: MOTIVO }))).toEqual(['estadoEsperado', 'motivo']);
    expect(campos(() => validarTransicion({ accion: 'reabrir', estadoEsperado: 'CERRADO' }))).toEqual(['accion']);
    expect(campos(() => validarTransicion([]))).toEqual(['cuerpo']);
  });

  it('verificación sin SIN_VERIFICAR y con motivo; motivo administrativo con operador', () => {
    expect(campos(() => validarVerificacion({ valor: 'SIN_VERIFICAR', motivo: 'corto', estadoEsperado: 'EN_REVISION' }))).toEqual(['motivo', 'valor']);
    expect(campos(() => validarMotivoAdmin({ motivo: MOTIVO, operadorId: 'x' }, true))).toEqual(['operadorId']);
    expect(campos(() => validarMotivoAdmin({ motivo: MOTIVO, extra: 1 }, false))).toEqual(['extra']);
  });
});
