import { expectConContexto } from '../expect-contexto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { validarContenido } from '../../src/modules/consultas/dominio/contenido';
import { crearModuloConsultas } from '../../src/modules/consultas';

const RUTA_FUENTE = resolve(__dirname, '../../src/modules/consultas/contenido/contenido-publico.json');
const fuente = JSON.parse(readFileSync(RUTA_FUENTE, 'utf8')) as Record<string, any>;
const copia = (): Record<string, any> => structuredClone(fuente);

/**
 * Huella del contenido por version. Si el contenido cambia, hay que subir `version` y registrar
 * aqui la huella nueva: un cambio sin nueva version falla esta prueba.
 */
const HUELLAS_POR_VERSION: Record<number, string> = {
  1: '550c4caffe4ee3f77b7c0f56f811c849',
  2: '032d1987ca9fa2224557c66cded418b2',
};

function huella(): string {
  // Sobre el JSON normalizado: no depende de espacios ni de finales de linea.
  return createHash('sha256').update(JSON.stringify(fuente)).digest('hex').slice(0, 32);
}

describe('fuente de contenido publico', () => {
  it('cumple el esquema', () => {
    const r = validarContenido(fuente);
    expect(r).toMatchObject({ ok: true });
  });

  it('no publica contactos ni numeros: lista vacia y estado pendiente', () => {
    expect(fuente.contactos).toEqual({ estado: 'pendiente', items: [] });
    expect(JSON.stringify(fuente)).not.toMatch(/\b105\b|\b911\b|\b116\b|\b115\b|\b100\b/);
  });

  it('el contenido no cambia sin subir la version (huella registrada)', () => {
    const esperada = HUELLAS_POR_VERSION[fuente.version];
    // Primera ejecucion: imprime la huella para registrarla. Despues debe coincidir.
    expectConContexto(esperada, `Registra la huella de la version ${fuente.version}: ${huella()}`).toBeDefined();
    expect(huella()).toBe(esperada);
  });

  it('alcance del piloto: pendiente y sin texto; la version es posterior a la 1', () => {
    expect(fuente.piloto).toEqual({ estado: 'pendiente' });
    expect(fuente.version).toBeGreaterThanOrEqual(2);
  });

  it('piloto: pendiente sin texto es valido; aprobado sin texto y pendiente con texto no lo son', () => {
    const ok = copia();
    expect(validarContenido(ok)).toMatchObject({ ok: true });
    const aprobadaSinTexto = copia();
    aprobadaSinTexto.piloto = { estado: 'aprobado' };
    expect(validarContenido(aprobadaSinTexto)).toMatchObject({ ok: false });
    const pendienteConTexto = copia();
    pendienteConTexto.piloto = { estado: 'pendiente', texto: 'texto no aprobado' };
    expect(validarContenido(pendienteConTexto)).toMatchObject({ ok: false });
    const sinSeccion = copia();
    delete sinSeccion.piloto;
    expect(validarContenido(sinSeccion)).toMatchObject({ ok: false });
    const aprobadaConTexto = copia();
    aprobadaConTexto.piloto = { estado: 'aprobado', texto: 'Alcance aprobado por el equipo.' };
    expect(validarContenido(aprobadaConTexto)).toMatchObject({ ok: true });
  });

  it('el arranque falla con una fuente invalida y el mensaje no incluye el contenido', () => {
    const mala = copia();
    mala.contactos = { estado: 'aprobado', items: [{ institucion: 'X', numero: '105' }] };
    expect(() => crearModuloConsultas(mala)).toThrow(/Contenido publico invalido/);
    try {
      crearModuloConsultas(mala);
    } catch (e) {
      expect((e as Error).message).not.toContain('"institucion"');
    }
  });
});

describe('validarContenido', () => {
  const errores = (c: unknown): string[] => {
    const r = validarContenido(c);
    return r.ok ? [] : [...r.errores];
  };

  it('un contacto sin fuente o sin fecha de verificacion invalida la fuente', () => {
    const completo = { institucion: 'PNP', numero: '105', cobertura: 'Ayacucho', fuente: 'Directorio oficial', verificadoAt: '2026-11-01' };
    const c1 = copia();
    c1.contactos = { estado: 'aprobado', items: [completo] };
    expect(errores(c1)).toEqual([]);
    for (const falta of ['fuente', 'verificadoAt', 'cobertura', 'institucion', 'numero']) {
      const c = copia();
      const item = { ...completo } as Record<string, unknown>;
      delete item[falta];
      c.contactos = { estado: 'aprobado', items: [item] };
      expectConContexto(errores(c).length, falta).toBeGreaterThan(0);
    }
    const c2 = copia();
    c2.contactos = { estado: 'aprobado', items: [{ ...completo, verificadoAt: '01/11/2026' }] };
    expect(errores(c2).length).toBeGreaterThan(0);
  });

  it('seccion pendiente sin texto; pendiente con texto y aprobada sin texto son invalidas', () => {
    const ok = copia();
    ok.privacidad = { estado: 'pendiente' };
    expect(errores(ok)).toEqual([]);
    const conTexto = copia();
    conTexto.privacidad = { estado: 'pendiente', secciones: [{ titulo: 'a', texto: 'b' }] };
    expect(errores(conTexto).length).toBeGreaterThan(0);
    const sinTexto = copia();
    sinTexto.privacidad = { estado: 'aprobado' };
    expect(errores(sinTexto).length).toBeGreaterThan(0);
    const appVacia = copia();
    appVacia.app = { estado: 'aprobado', finalidad: 'x' };
    expect(errores(appVacia).length).toBeGreaterThan(0);
    const devs = copia();
    devs.desarrolladores = { estado: 'aprobado', personas: [] };
    expect(errores(devs).length).toBeGreaterThan(0);
  });

  it('exige version entera >= 1, fecha valida y rechaza campos desconocidos', () => {
    for (const cambio of [{ version: 0 }, { version: 1.5 }, { version: '1' }, { actualizadoAt: '2026-13-40' }, { extra: 1 }]) {
      expect(errores({ ...copia(), ...cambio }).length).toBeGreaterThan(0);
    }
    const sinVersion = copia();
    delete sinVersion.version;
    expect(errores(sinVersion).length).toBeGreaterThan(0);
    expect(errores(null).length).toBeGreaterThan(0);
  });
});
