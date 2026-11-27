import { describe, expect, it } from '@jest/globals';
import {
  CATEGORIAS_ATENCION_MEDICA,
  CATEGORIAS_HERIDOS,
  codigoDesdeBytes,
  contenidoCanonico,
  FORMATO_CODIGO,
  normalizarCodigo,
  validarClaveIdempotencia,
  validarEnvio,
  ValidacionEnvioError,
  type Modalidad,
} from '../../src/modules/reportes/dominio/envio';
import { HmacSecretosAdapter } from '../../src/modules/reportes/infraestructura/hmac-secretos.adapter';
import { CATEGORIAS_PILOTO } from '../../src/modules/reportes';

const AHORA = new Date('2026-11-26T15:00:00.000Z');
const CATEGORIAS = new Set(CATEGORIAS_PILOTO.map((c) => c.id));
const PUNTO = { latitud: -13.1588, longitud: -74.2232, origen: 'gps', precisionM: 12 };

function cuerpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoriaId: 'robo',
    descripcion: 'Me arrebataron el celular en la esquina',
    ocurrencia: { modo: 'ahora', instante: '2026-11-26T10:00:00-05:00' },
    punto: PUNTO,
    ...extra,
  };
}
const invitado = (extra: Record<string, unknown> = {}) => cuerpo({ telefonoContacto: '987 654 321', ...extra });

function errores(entrada: unknown, modalidad: Modalidad = 'cuenta'): Record<string, string> {
  try {
    validarEnvio(entrada, modalidad, CATEGORIAS, AHORA);
  } catch (e) {
    if (e instanceof ValidacionEnvioError) return e.campos;
    throw e;
  }
  throw new Error('Se esperaba un error de validacion');
}

describe('validarEnvio: datos originales', () => {
  it('acepta un envio de cuenta completo y normaliza descripcion, ocurrencia y punto', () => {
    const v = validarEnvio(cuerpo({ descripcion: '  Me arrebataron el celular  ' }), 'cuenta', CATEGORIAS, AHORA);
    expect(v).toEqual({
      categoriaId: 'robo',
      descripcion: 'Me arrebataron el celular',
      ocurrencia: { modo: 'ahora', instante: new Date('2026-11-26T15:00:00.000Z') },
      punto: { latitud: -13.1588, longitud: -74.2232, origen: 'gps', precisionM: 12 },
      heridos: null,
      atencionMedica: null,
      telefonoContacto: null,
      evaluacion: null,
    });
  });

  it.each([
    ['inexistente', 'secuestro'],
    ['no texto', 7],
    ['ausente', undefined],
  ])('rechaza una categoria %s', (_n, categoriaId) => {
    expect(errores(cuerpo({ categoriaId }))).toHaveProperty('categoriaId');
  });

  it('rechaza una categoria inactiva', () => {
    expect(() => validarEnvio(cuerpo(), 'cuenta', new Set(['acoso']), AHORA)).toThrow(ValidacionEnvioError);
  });

  it.each([
    ['vacia', ''],
    ['solo espacios', '     '],
    ['de 4 caracteres', 'Robo'],
    ['de 1001 caracteres', 'a'.repeat(1001)],
    ['no texto', 12345],
  ])('rechaza una descripcion %s', (_n, descripcion) => {
    expect(errores(cuerpo({ descripcion }))).toHaveProperty('descripcion');
  });

  it('cuenta caracteres, no unidades UTF-16, en el limite de 1000', () => {
    expect(() => validarEnvio(cuerpo({ descripcion: '\u{1F6A8}'.repeat(1000) }), 'cuenta', CATEGORIAS, AHORA)).not.toThrow();
  });

  it('Otra emergencia exige descripcion con la misma politica', () => {
    expect(errores(cuerpo({ categoriaId: 'otra-emergencia', descripcion: '' }))).toHaveProperty('descripcion');
    const v = validarEnvio(cuerpo({ categoriaId: 'otra-emergencia', descripcion: 'Cable de alta tension caido' }), 'cuenta', CATEGORIAS, AHORA);
    expect(v.descripcion).toBe('Cable de alta tension caido');
  });

  it.each([
    ['futura mas alla de la tolerancia', { modo: 'ahora', instante: '2026-11-26T15:06:00Z' }],
    ['anterior a 30 dias', { modo: 'antes', instante: '2026-10-26T14:59:00Z' }],
    ['sin zona horaria', { modo: 'antes', instante: '2026-11-26T10:00:00' }],
    ['con modo desconocido', { modo: 'ayer', instante: '2026-11-26T10:00:00Z' }],
    ['con campos extra', { modo: 'ahora', instante: '2026-11-26T10:00:00Z', x: 1 }],
    ['ausente', undefined],
    ['con fecha imposible', { modo: 'antes', instante: '2026-11-31T10:00:00Z' }],
  ])('rechaza una ocurrencia %s', (_n, ocurrencia) => {
    expect(errores(cuerpo({ ocurrencia }))).toHaveProperty('ocurrencia');
  });

  it('acepta instantes con microsegundos como los que emite Dart (toIso8601String)', () => {
    const v = validarEnvio(cuerpo({ ocurrencia: { modo: 'ahora', instante: '2026-11-26T14:59:00.123456Z' } }), 'cuenta', CATEGORIAS, AHORA);
    expect(v.ocurrencia.instante.toISOString()).toBe('2026-11-26T14:59:00.123Z');
    expect(errores(cuerpo({ ocurrencia: { modo: 'ahora', instante: '2026-11-26T14:59:00.1234567890Z' } }))).toHaveProperty('ocurrencia');
  });

  it('acepta la ocurrencia dentro de la tolerancia futura y en el limite de antiguedad', () => {
    expect(() => validarEnvio(cuerpo({ ocurrencia: { modo: 'ahora', instante: '2026-11-26T15:04:59Z' } }), 'cuenta', CATEGORIAS, AHORA)).not.toThrow();
    expect(() => validarEnvio(cuerpo({ ocurrencia: { modo: 'antes', instante: '2026-10-27T15:00:00Z' } }), 'cuenta', CATEGORIAS, AHORA)).not.toThrow();
  });

  it.each([
    ['institucion', { institucion: 'pnp' }],
    ['sede', { sedeId: 'x' }],
    ['prioridad', { prioridad: 'Urgente' }],
    ['estado', { estado: 'CERRADO' }],
    ['distrito', { distritoId: 'DIS-01' }],
    ['autor', { autorId: 'otro' }],
    ['referencia', { referencia: 'INC-00000-00000' }],
  ])('rechaza el campo reservado %s', (_n, extra) => {
    expect(errores(cuerpo(extra))).toHaveProperty('cuerpo');
  });

  it('rechaza cuerpos que no son objeto', () => {
    expect(errores([])).toEqual({ cuerpo: expect.any(String) });
    expect(errores(null)).toEqual({ cuerpo: expect.any(String) });
  });

  it('los mensajes no repiten los valores enviados', () => {
    const e = errores(cuerpo({ descripcion: 'abc', categoriaId: 'valor-secreto-xyz' }));
    expect(JSON.stringify(e)).not.toContain('valor-secreto-xyz');
  });
});

describe('validarEnvio: punto obligatorio', () => {
  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['con latitud fuera de rango', { ...PUNTO, latitud: 91 }],
    ['con longitud fuera de rango', { ...PUNTO, longitud: -181 }],
    ['con latitud texto', { ...PUNTO, latitud: '-13.1' }],
    ['no finito', { ...PUNTO, latitud: Number.NaN }],
    ['con origen desconocido', { ...PUNTO, origen: 'red' }],
    ['con precision negativa', { ...PUNTO, precisionM: -1 }],
    ['con campos extra', { ...PUNTO, distritoId: 'DIS-01' }],
  ])('rechaza un punto %s', (_n, punto) => {
    expect(errores(cuerpo({ punto }))).toHaveProperty('punto');
  });

  it('acepta un punto manual sin precision', () => {
    const v = validarEnvio(cuerpo({ punto: { latitud: -13.16, longitud: -74.22, origen: 'manual' } }), 'cuenta', CATEGORIAS, AHORA);
    expect(v.punto).toEqual({ latitud: -13.16, longitud: -74.22, origen: 'manual', precisionM: null });
  });
});

describe('validarEnvio: respuestas para SAMU', () => {
  it('las categorias de heridos y de atencion medica son las del contrato', () => {
    expect([...CATEGORIAS_HERIDOS].sort()).toEqual(['accidente-transito', 'agresion', 'emergencia-medica', 'pelea', 'violencia']);
    expect([...CATEGORIAS_ATENCION_MEDICA]).toEqual(['accidente-transito']);
  });

  it('accidente conserva no_se y sin respuesta, sin convertirlos en no', () => {
    const v = validarEnvio(cuerpo({ categoriaId: 'accidente-transito', heridos: 'no_se' }), 'cuenta', CATEGORIAS, AHORA);
    expect(v.heridos).toBe('no_se');
    expect(v.atencionMedica).toBeNull();
  });

  it('pelea con heridos si se conserva como dato original', () => {
    expect(validarEnvio(cuerpo({ categoriaId: 'pelea', heridos: 'si' }), 'cuenta', CATEGORIAS, AHORA).heridos).toBe('si');
  });

  it('rechaza preguntas no aplicables: robo con heridos y agresion o emergencia medica con atencion medica', () => {
    expect(errores(cuerpo({ heridos: 'no' }))).toHaveProperty('heridos');
    expect(errores(cuerpo({ categoriaId: 'agresion', atencionMedica: 'si' }))).toHaveProperty('atencionMedica');
    expect(errores(cuerpo({ categoriaId: 'emergencia-medica', atencionMedica: 'si' }))).toHaveProperty('atencionMedica');
  });

  it('emergencia medica admite heridos (decision del 26/11/2026)', () => {
    expect(validarEnvio(cuerpo({ categoriaId: 'emergencia-medica', heridos: 'no' }), 'cuenta', CATEGORIAS, AHORA).heridos).toBe('no');
  });

  it.each([['No'], ['si ']])('rechaza el valor %j', (valor) => {
    expect(errores(cuerpo({ categoriaId: 'accidente-transito', heridos: valor }))).toHaveProperty('heridos');
  });

  it.each([[true], [0], ['desconocido']])('rechaza el valor no textual o desconocido %j', (valor) => {
    expect(errores(cuerpo({ categoriaId: 'accidente-transito', heridos: valor }))).toHaveProperty('heridos');
  });
});

describe('validarEnvio: telefono segun modalidad', () => {
  it('el invitado exige telefono valido y se normaliza', () => {
    expect(validarEnvio(invitado(), 'invitado', CATEGORIAS, AHORA).telefonoContacto).toBe('987654321');
    expect(errores(cuerpo(), 'invitado')).toHaveProperty('telefonoContacto');
    expect(errores(invitado({ telefonoContacto: '12345' }), 'invitado')).toHaveProperty('telefonoContacto');
    expect(errores(invitado({ telefonoContacto: '98765432a' }), 'invitado')).toHaveProperty('telefonoContacto');
  });

  it('con cuenta se rechaza un telefono en el cuerpo', () => {
    expect(errores(invitado(), 'cuenta')).toHaveProperty('telefonoContacto');
  });
});

describe('validarEnvio: evaluacion rapida', () => {
  it('pelea con heridos y evaluacion parcial', () => {
    const v = validarEnvio(
      cuerpo({ categoriaId: 'pelea', heridos: 'si', evaluacion: { cantidadHeridos: 2, personaPrincipal: { consciente: 'si' } } }),
      'cuenta',
      CATEGORIAS,
      AHORA,
    );
    expect(v.evaluacion).toEqual({ cantidadHeridos: 2, personaPrincipal: { signosVida: null, consciente: 'si', sangrado: null } });
  });

  it('sin evaluacion en el cuerpo queda null', () => {
    expect(validarEnvio(cuerpo({ categoriaId: 'pelea', heridos: 'si' }), 'cuenta', CATEGORIAS, AHORA).evaluacion).toBeNull();
  });

  it('rechaza la evaluacion cuando SAMU no interviene y la cantidad sin heridos', () => {
    expect(errores(cuerpo({ evaluacion: {} }))).toHaveProperty('evaluacion');
    expect(errores(cuerpo({ categoriaId: 'pelea', heridos: 'no_se', evaluacion: {} }))).toHaveProperty('evaluacion');
    expect(errores(cuerpo({ categoriaId: 'emergencia-medica', heridos: 'no', evaluacion: { cantidadHeridos: 1 } }))).toHaveProperty([
      'evaluacion.cantidadHeridos',
    ]);
  });
});

describe('contenido canonico e idempotencia', () => {
  const secretos = new HmacSecretosAdapter('s'.repeat(40));
  const huella = (entrada: unknown, modalidad: Modalidad = 'invitado') =>
    secretos.huellaContenido(contenidoCanonico(modalidad, validarEnvio(entrada, modalidad, CATEGORIAS, AHORA)));

  it('la huella no depende del orden de las claves, la zona horaria ni el formato del telefono', () => {
    const a = invitado();
    const b = Object.fromEntries(
      Object.entries(
        invitado({ telefonoContacto: '987-654-321', ocurrencia: { instante: '2026-11-26T15:00:00Z', modo: 'ahora' } }),
      ).reverse(),
    );
    expect(huella(a)).toBe(huella(b));
    expect(huella(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia con el contenido o la modalidad', () => {
    expect(huella(invitado())).not.toBe(huella(invitado({ descripcion: 'Otro texto distinto' })));
    expect(huella(cuerpo(), 'cuenta')).not.toBe(huella(invitado()));
  });

  it('un envio sin evaluacion conserva el contenido canonico de P4', () => {
    const v = validarEnvio(invitado(), 'invitado', CATEGORIAS, AHORA);
    expect(contenidoCanonico('invitado', v)).toBe(
      JSON.stringify([
        'invitado',
        'robo',
        'Me arrebataron el celular en la esquina',
        'ahora',
        '2026-11-26T15:00:00.000Z',
        -13.1588,
        -74.2232,
        'gps',
        12,
        null,
        null,
        '987654321',
      ]),
    );
  });

  it('dos evaluaciones distintas producen huellas distintas', () => {
    const conEvaluacion = (consciente: string) =>
      invitado({ categoriaId: 'pelea', heridos: 'si', evaluacion: { personaPrincipal: { consciente } } });
    expect(huella(conEvaluacion('si'))).not.toBe(huella(conEvaluacion('no')));
    expect(huella(conEvaluacion('si'))).not.toBe(huella(invitado({ categoriaId: 'pelea', heridos: 'si' })));
  });

  it('otro secreto produce otra huella', () => {
    const otro = new HmacSecretosAdapter('t'.repeat(40));
    const c = contenidoCanonico('cuenta', validarEnvio(cuerpo(), 'cuenta', CATEGORIAS, AHORA));
    expect(otro.huellaContenido(c)).not.toBe(secretos.huellaContenido(c));
  });

  it('la clave de idempotencia es un UUID normalizado', () => {
    expect(validarClaveIdempotencia('0B9C1E4E-2F0A-4C55-9D8E-6F1A2B3C4D5E')).toBe('0b9c1e4e-2f0a-4c55-9d8e-6f1a2b3c4d5e');
    for (const v of [undefined, '', 'abc', '0b9c1e4e2f0a4c559d8e6f1a2b3c4d5e', 'x'.repeat(36)]) {
      expect(validarClaveIdempotencia(v)).toBeNull();
    }
  });
});

describe('codigo secreto', () => {
  const secretos = new HmacSecretosAdapter('s'.repeat(40));

  it('tiene 16 simbolos Crockford en cuatro grupos y no se repite', () => {
    const codigos = Array.from({ length: 500 }, () => secretos.nuevoCodigo());
    expect(codigos.every((c) => FORMATO_CODIGO.test(c))).toBe(true);
    expect(new Set(codigos).size).toBe(500);
    expect(codigoDesdeBytes(new Uint8Array(10))).toBe('0000-0000-0000-0000');
  });

  it('se normaliza al escribirlo y rechaza longitudes o simbolos invalidos', () => {
    expect(normalizarCodigo('ab12-cd34-ef56-gh78')).toBe('AB12CD34EF56GH78');
    expect(normalizarCodigo('AB12 CD34 EF56 GHO8')).toBe('AB12CD34EF56GH08');
    expect(normalizarCodigo('AB12-CD34-EF56')).toBeNull();
    expect(normalizarCodigo('UB12-CD34-EF56-GH78')).toBeNull();
    expect(normalizarCodigo(null)).toBeNull();
  });

  it('la huella del codigo depende del incidente y se compara en tiempo constante', () => {
    const h1 = secretos.huellaCodigo('inc-1', 'AB12CD34EF56GH78');
    expect(secretos.iguales(h1, secretos.huellaCodigo('inc-1', 'AB12CD34EF56GH78'))).toBe(true);
    expect(secretos.iguales(h1, secretos.huellaCodigo('inc-2', 'AB12CD34EF56GH78'))).toBe(false);
    expect(secretos.iguales(h1, 'ab')).toBe(false);
    expect(secretos.iguales('', '')).toBe(false);
  });

  it('exige un secreto de al menos 32 caracteres', () => {
    expect(() => new HmacSecretosAdapter('corto')).toThrow();
  });
});
