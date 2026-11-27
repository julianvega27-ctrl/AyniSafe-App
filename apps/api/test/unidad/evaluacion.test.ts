import { describe, expect, it } from '@jest/globals';
import {
  aplicarCambios,
  CATEGORIAS_CON_ATENCION_MEDICA,
  CATEGORIAS_CON_EVALUACION,
  instantaneaInicial,
  PERSONA_SIN_RESPUESTA,
  resumenHeridos,
  samuRequerido,
  tieneObservaciones,
  validarAclaracion,
  validarEvaluacionEnvio,
  ValidacionEvaluacionError,
  type Instantanea,
  type RespuestaSiNo,
} from '../../src/modules/reportes/dominio/evaluacion';
import { CATEGORIAS_CON_REGLA, resolverDestinatarios } from '../../src/modules/operaciones/dominio/matriz';

function erroresEnvio(entrada: unknown, categoria: string, heridos: RespuestaSiNo | null, atencion: RespuestaSiNo | null = null) {
  const campos: Record<string, string> = {};
  const r = validarEvaluacionEnvio(entrada, categoria, heridos, atencion, campos);
  return { r, campos };
}

function errorDe(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidacionEvaluacionError) return e.campos;
    throw e;
  }
  throw new Error('Se esperaba un error de validacion');
}

const VACIA: Instantanea = { heridos: null, atencionMedica: null, cantidadHeridos: null, ...PERSONA_SIN_RESPUESTA };

describe('samuRequerido', () => {
  it.each([
    ['emergencia-medica', null, null, true],
    ['emergencia-medica', 'no', null, true],
    ['accidente-transito', 'si', 'no', true],
    ['accidente-transito', 'no', 'si', true],
    ['accidente-transito', 'no_se', null, false],
    ['accidente-transito', 'no', 'no', false],
    ['agresion', 'si', null, true],
    ['pelea', 'no_se', null, false],
    ['violencia', 'si', null, true],
    ['robo', 'si', null, false],
  ] as const)('%s heridos=%s atencion=%s -> %s', (cat, h, a, esperado) => {
    expect(samuRequerido(cat, h, a)).toBe(esperado);
  });
});

describe('validarEvaluacionEnvio', () => {
  it('sin evaluacion devuelve null sin errores', () => {
    expect(erroresEnvio(undefined, 'pelea', 'si')).toEqual({ r: null, campos: {} });
  });

  it('persona principal parcial: lo omitido queda sin respuesta', () => {
    const { r, campos } = erroresEnvio({ personaPrincipal: { consciente: 'si' } }, 'pelea', 'si');
    expect(campos).toEqual({});
    expect(r).toEqual({ cantidadHeridos: 'no_se', personaPrincipal: { signosVida: null, consciente: 'si', sangrado: null } });
  });

  it('rechaza una segunda persona o un campo de nombre', () => {
    expect(erroresEnvio({ personas: [{}] }, 'pelea', 'si').campos).toEqual({ evaluacion: expect.any(String) });
    expect(erroresEnvio({ personaPrincipal: { nombre: 'Ana' } }, 'pelea', 'si').campos).toEqual({
      'evaluacion.personaPrincipal': expect.any(String),
    });
    expect(erroresEnvio({ personaPrincipal: [{ consciente: 'si' }] }, 'pelea', 'si').campos).toHaveProperty(['evaluacion.personaPrincipal']);
  });

  it('heridos si sin cantidad deja no_se, nunca cero', () => {
    expect(erroresEnvio({}, 'agresion', 'si').r?.cantidadHeridos).toBe('no_se');
  });

  it.each([['no'], ['no_se'], [null]] as const)('rechaza cantidad con heridos %s', (h) => {
    // atencion `si` hace intervenir a SAMU: el rechazo se debe solo a la cantidad.
    expect(erroresEnvio({ cantidadHeridos: 2 }, 'accidente-transito', h, 'si').campos).toEqual({
      'evaluacion.cantidadHeridos': expect.any(String),
    });
  });

  it.each([
    [0, false],
    [1, true],
    [999, true],
    [1000, false],
    [2.5, false],
    ['3', false],
    ['no_se', true],
  ])('cantidad %p valida=%p', (cantidad, valida) => {
    const { campos } = erroresEnvio({ cantidadHeridos: cantidad }, 'pelea', 'si');
    expect(Object.keys(campos).length === 0).toBe(valida);
  });

  it('accidente sin condicion medica: no aplica', () => {
    expect(erroresEnvio({ personaPrincipal: { consciente: 'si' } }, 'accidente-transito', 'no', 'no').campos).toEqual({
      evaluacion: expect.any(String),
    });
  });

  it('emergencia medica con heridos no admite observaciones del paciente', () => {
    const { r, campos } = erroresEnvio({ personaPrincipal: { signosVida: 'observados' } }, 'emergencia-medica', 'no');
    expect(campos).toEqual({});
    expect(r?.cantidadHeridos).toBeNull();
    expect(r?.personaPrincipal.signosVida).toBe('observados');
  });

  it('valores fuera de catalogo', () => {
    const { campos } = erroresEnvio({ personaPrincipal: { signosVida: 'si', sangrado: 'tal vez' } }, 'pelea', 'si');
    expect(Object.keys(campos).sort()).toEqual(['evaluacion.personaPrincipal.sangrado', 'evaluacion.personaPrincipal.signosVida']);
  });

  it('instantanea inicial', () => {
    expect(instantaneaInicial('no_se', null, null)).toEqual({ ...VACIA, heridos: 'no_se' });
    expect(instantaneaInicial('si', 'no', null)).toEqual({ ...VACIA, heridos: 'si', atencionMedica: 'no', cantidadHeridos: 'no_se' });
  });
});

describe('validarAclaracion', () => {
  const ciudadano = { origen: 'ciudadano', institucion: null } as const;
  const pnp = { origen: 'operador', institucion: 'pnp' } as const;
  const samu = { origen: 'operador', institucion: 'samu' } as const;

  it('ciudadano: cambios parciales sin motivo', () => {
    expect(validarAclaracion({ heridos: 'si', cantidadHeridos: 2 }, 'accidente-transito', ciudadano)).toEqual({
      cambios: { heridos: 'si', cantidadHeridos: 2 },
      motivo: null,
    });
  });

  it('ciudadano no puede enviar motivo; null no se admite', () => {
    expect(errorDe(() => validarAclaracion({ heridos: 'si', motivo: 'x' }, 'pelea', ciudadano))).toHaveProperty('cuerpo');
    expect(errorDe(() => validarAclaracion({ heridos: null }, 'pelea', ciudadano))).toHaveProperty('heridos');
  });

  it('cuerpo vacio', () => {
    expect(errorDe(() => validarAclaracion({}, 'pelea', ciudadano))).toEqual({ cuerpo: expect.any(String) });
  });

  it('atencion medica solo en accidente', () => {
    expect(errorDe(() => validarAclaracion({ atencionMedica: 'si' }, 'pelea', ciudadano))).toHaveProperty('atencionMedica');
  });

  it('operador exige motivo de 10 a 500 caracteres', () => {
    expect(errorDe(() => validarAclaracion({ heridos: 'si', motivo: 'corto' }, 'pelea', pnp))).toHaveProperty('motivo');
    expect(errorDe(() => validarAclaracion({ heridos: 'si', motivo: 'x'.repeat(501) }, 'pelea', pnp))).toHaveProperty('motivo');
    expect(validarAclaracion({ heridos: 'si', motivo: '  Confirmado por llamada  ' }, 'pelea', pnp).motivo).toBe('Confirmado por llamada');
  });

  it('operador no SAMU no envia observaciones', () => {
    expect(errorDe(() => validarAclaracion({ personaPrincipal: { consciente: 'si' }, motivo: 'Confirmado en sitio' }, 'pelea', pnp))).toEqual({
      personaPrincipal: expect.any(String),
    });
  });

  it('operador SAMU envia observaciones', () => {
    expect(validarAclaracion({ personaPrincipal: { consciente: 'no' }, motivo: 'Reporte de la unidad' }, 'pelea', samu).cambios).toEqual({
      consciente: 'no',
    });
  });
});

describe('aplicarCambios', () => {
  const base: Instantanea = { ...VACIA, heridos: 'si', cantidadHeridos: 3 };

  it('aclaracion identica no modifica nada', () => {
    expect(aplicarCambios(base, { heridos: 'si', cantidadHeridos: 3 }, 'pelea', true).modificados).toEqual([]);
  });

  it('cambiar heridos a no elimina la cantidad y la lista como modificada', () => {
    const r = aplicarCambios(base, { heridos: 'no' }, 'pelea', true);
    expect(r.instantanea.cantidadHeridos).toBeNull();
    expect(r.modificados).toEqual(['heridos', 'cantidadHeridos']);
  });

  it('enviar cantidad con heridos distinto de si se rechaza', () => {
    expect(errorDe(() => aplicarCambios(VACIA, { cantidadHeridos: 2 }, 'pelea', false))).toHaveProperty('cantidadHeridos');
    expect(errorDe(() => aplicarCambios(base, { heridos: 'no_se', cantidadHeridos: 2 }, 'pelea', true))).toHaveProperty('cantidadHeridos');
  });

  it('heridos pasa a si sin cantidad: no_se', () => {
    const r = aplicarCambios({ ...VACIA, heridos: 'no_se' }, { heridos: 'si' }, 'pelea', false);
    expect(r.instantanea.cantidadHeridos).toBe('no_se');
    expect(r.samuRequerido).toBe(true);
    expect(r.modificados).toEqual(['heridos', 'cantidadHeridos']);
  });

  it('observaciones no aplicables sin SAMU', () => {
    expect(errorDe(() => aplicarCambios({ ...VACIA, heridos: 'no_se' }, { consciente: 'si' }, 'pelea', false))).toHaveProperty('personaPrincipal');
  });

  it('observaciones admitidas tras correccion negativa si SAMU ya intervino', () => {
    const r = aplicarCambios(base, { heridos: 'no', consciente: 'si' }, 'pelea', true);
    expect(r.samuRequerido).toBe(true);
    expect(r.instantanea.consciente).toBe('si');
  });

  it('observaciones y heridos si en la misma aclaracion', () => {
    const r = aplicarCambios({ ...VACIA, heridos: 'no_se' }, { heridos: 'si', sangrado: 'si' }, 'agresion', false);
    expect(r.instantanea).toMatchObject({ heridos: 'si', sangrado: 'si', cantidadHeridos: 'no_se' });
  });

  it('tieneObservaciones y resumenHeridos', () => {
    expect(tieneObservaciones(VACIA)).toBe(false);
    expect(tieneObservaciones({ ...VACIA, sangrado: 'no_se' })).toBe(true);
    expect(resumenHeridos({ ...base, consciente: 'si' })).toEqual({ heridos: 'si', atencionMedica: null, cantidadHeridos: 3 });
  });
});

describe('samuRequerido coincide con la matriz de enrutamiento', () => {
  const respuestas = ['si', 'no', 'no_se', null] as const;
  const casos = CATEGORIAS_CON_REGLA.flatMap((cat) => respuestas.flatMap((h) => respuestas.map((a) => [cat, h, a] as const)));

  it.each(casos)('%s heridos=%s atencion=%s', (cat, h, a) => {
    // Las respuestas solo existen en las categorias que las preguntan, como en el envio.
    const heridos = CATEGORIAS_CON_EVALUACION.has(cat) ? h : null;
    const atencion = CATEGORIAS_CON_ATENCION_MEDICA.has(cat) ? a : null;
    const samuEnMatriz = resolverDestinatarios(cat, heridos, atencion).destinatarios.some((d) => d.institucion === 'samu');
    expect(samuRequerido(cat, heridos, atencion)).toBe(samuEnMatriz);
  });
});
