import { describe, expect, it } from '@jest/globals';
import { CATEGORIAS_PILOTO } from '../../src/modules/reportes';
import { configuracionValida, propuestaPrioridad, TABLA_PRIORIDAD, VERSION_PRIORIDAD } from '../../src/modules/operaciones';

/** P6 grupo C, tarea C3: tabla prioridad-categoria-v1 del documento 11 §4 y configuracion invalida. */
const categorias = CATEGORIAS_PILOTO.map((c) => c.id);

describe('tabla prioridad-categoria-v1', () => {
  it('cubre exactamente las 16 categorias del catalogo con los valores aprobados', () => {
    expect(Object.keys(TABLA_PRIORIDAD).sort()).toEqual([...categorias].sort());
    const por = (v: string) => Object.entries(TABLA_PRIORIDAD).filter(([, p]) => p === v).map(([k]) => k).sort();
    expect(por('URGENTE')).toEqual(['emergencia-medica', 'incendio']);
    expect(por('NORMAL')).toEqual(['actividad-sospechosa', 'otra-emergencia', 'otro-incidente-seguridad', 'vandalismo']);
    expect(por('ALTA')).toHaveLength(10);
    expect(configuracionValida({ version: VERSION_PRIORIDAD, tabla: TABLA_PRIORIDAD }, categorias)).toBe(true);
  });

  it('propone el valor con su version', () => {
    expect(propuestaPrioridad('incendio')).toEqual({ valor: 'URGENTE', version: 'prioridad-categoria-v1' });
    expect(propuestaPrioridad('otra-emergencia')).toEqual({ valor: 'NORMAL', version: 'prioridad-categoria-v1' });
  });

  it('sin configuracion valida no propone nada (queda SIN_EVALUAR, nunca NORMAL)', () => {
    const sinUna = Object.fromEntries(Object.entries(TABLA_PRIORIDAD).filter(([k]) => k !== 'robo'));
    expect(propuestaPrioridad('incendio', { version: VERSION_PRIORIDAD, tabla: sinUna }, categorias)).toBeNull();
    expect(propuestaPrioridad('robo', { version: VERSION_PRIORIDAD, tabla: { ...TABLA_PRIORIDAD, robo: 'BAJA' } }, categorias)).toBeNull();
    expect(propuestaPrioridad('robo', { version: 'V 1', tabla: TABLA_PRIORIDAD }, categorias)).toBeNull();
    expect(propuestaPrioridad('robo', null, categorias)).toBeNull();
    expect(propuestaPrioridad('inexistente')).toBeNull();
  });
});
