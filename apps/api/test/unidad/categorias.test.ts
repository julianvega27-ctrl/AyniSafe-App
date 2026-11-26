import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { CATEGORIAS_PILOTO, crearModuloReportes, type Categoria } from '../../src/modules/reportes';

const filas: Categoria[] = CATEGORIAS_PILOTO.map((c) => ({ ...c, activa: true }));

function app(listar: () => Promise<readonly Categoria[]>) {
  const a = express();
  a.use('/api/v1', crearModuloReportes({ listar }).router);
  return a;
}

describe('catalogo de categorias (dominio)', () => {
  it('contiene exactamente las 16 categorias del documento 09 con identificadores estables', () => {
    expect(CATEGORIAS_PILOTO).toHaveLength(16);
    expect(CATEGORIAS_PILOTO.map((c) => c.id)).toEqual([
      'accidente-transito', 'acoso', 'actividad-sospechosa', 'agresion', 'asalto', 'danos-sismo',
      'deslizamiento', 'emergencia-medica', 'incendio', 'inundacion', 'otra-emergencia',
      'otro-incidente-seguridad', 'pelea', 'robo', 'vandalismo', 'violencia',
    ]);
    expect(CATEGORIAS_PILOTO.map((c) => c.nombre)).toContain('Otro incidente de seguridad');
    expect(CATEGORIAS_PILOTO.map((c) => c.orden)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    for (const c of CATEGORIAS_PILOTO) expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('ConsultarCategorias', () => {
  it('ordena por orden, conserva inactivas en la lista y solo ofrece IDs activos como referenciables', async () => {
    const desordenadas = [...filas].reverse().map((c) => (c.id === 'robo' ? { ...c, activa: false } : c));
    const modulo = crearModuloReportes({ listar: async () => desordenadas });
    const lista = await modulo.categorias.listar();
    expect(lista.map((c) => c.orden)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const activos = await modulo.categorias.idsActivos();
    expect(activos.has('robo')).toBe(false);
    expect(activos.size).toBe(15);
  });

  it('traduce cualquier fallo del repositorio a no disponible', async () => {
    const modulo = crearModuloReportes({ listar: async () => { throw new Error('detalle interno'); } });
    await expect(modulo.categorias.listar()).rejects.toMatchObject({ name: 'CatalogoNoDisponibleError' });
  });
});

describe('ruta publica /publico/categorias', () => {
  it('200 solo con id, nombre, orden y activa, sin reglas, prioridades ni destinatarios', async () => {
    const r = await request(app(async () => filas)).get('/api/v1/publico/categorias');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.categorias).toHaveLength(16);
    for (const c of r.body.categorias) expect(Object.keys(c).sort()).toEqual(['activa', 'id', 'nombre', 'orden']);
    expect(JSON.stringify(r.body)).not.toMatch(/prioridad|principal|institucion|regla/i);
  });

  it('405 con Allow para escrituras, 400 con parametros y 503 sin detalles ante fallo', async () => {
    const a = app(async () => filas);
    for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
      const r = await request(a)[metodo]('/api/v1/publico/categorias');
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET, HEAD');
    }
    expect((await request(a).head('/api/v1/publico/categorias')).status).toBe(200);
    expect((await request(a).get('/api/v1/publico/categorias').query({ activa: 'true' })).status).toBe(400);
    const rota = await request(app(async () => { throw new Error('secreto SQL'); })).get('/api/v1/publico/categorias');
    expect(rota.status).toBe(503);
    expect(rota.text).not.toContain('secreto');
  });
});
