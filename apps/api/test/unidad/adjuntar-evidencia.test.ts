import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  AdjuntarEvidenciaUseCase,
  AlmacenNoDisponibleError,
  CargaNoAutorizadaError,
  LimiteFotosError,
  type DependenciasCarga,
} from '../../src/modules/reportes/aplicacion/adjuntar-evidencia.use-case';
import { ConflictoIdempotenciaError } from '../../src/modules/reportes/aplicacion/registrar-incidente.use-case';
import type {
  EvidenciaRegistrada,
  EvidenciasRepositorio,
  NuevaEvidencia,
} from '../../src/modules/reportes/aplicacion/puertos/evidencias.port';
import type { ContextoTransaccional } from '../../src/compartido/transaccion';
import { MemoriaEvidenciasAdapter } from '../../src/modules/reportes/infraestructura/memoria-evidencias.adapter';
import { HmacSecretosAdapter } from '../../src/modules/reportes/infraestructura/hmac-secretos.adapter';

const AHORA = new Date('2026-11-27T12:00:00.000Z');
const INC = '11111111-1111-4111-8111-111111111111';
const AUTOR = '22222222-2222-4222-8222-222222222222';
const BYTES = Buffer.from('foto-original');
const tx = {} as ContextoTransaccional;

function escenario(opciones: { almacen?: 'memoria' | null; filas?: Partial<NuevaEvidencia & { estado: string }>[]; confirmarFalla?: boolean; uso?: { bytes: number; objetos: number } } = {}) {
  const pasos: string[] = [];
  const filas = new Map<string, NuevaEvidencia & { estado: string; confirmadaEn: Date | null }>();
  for (const f of opciones.filas ?? []) {
    const id = randomUUID();
    filas.set(id, { id, incidenteId: INC, ranura: 1, publicId: `aynisafe/${randomUUID()}`, proveedor: 'memoria', tipo: 'image/jpeg', bytes: 10, ancho: 1, alto: 1, sha256: 'a'.repeat(64), huellaCarga: 'h', clave: randomUUID(), modalidad: 'cuenta', autorUsuarioId: AUTOR, creadaEn: AHORA, estado: 'disponible', confirmadaEn: AHORA, ...f } as NuevaEvidencia & { estado: string; confirmadaEn: Date | null });
  }
  const aReg = (f: NuevaEvidencia & { estado: string; confirmadaEn: Date | null }): EvidenciaRegistrada => ({
    id: f.id, incidenteId: f.incidenteId, ranura: f.ranura, publicId: f.publicId, estado: f.estado as EvidenciaRegistrada['estado'], tipo: f.tipo, bytes: f.bytes, huellaCarga: f.huellaCarga, creadaEn: f.creadaEn, confirmadaEn: f.confirmadaEn,
  });
  const repo: Partial<EvidenciasRepositorio> = {
    async autoria() { return { modalidad: 'cuenta', autorUsuarioId: AUTOR }; },
    async leer() { return null; },
    async bloquearIncidente() { pasos.push('A:bloquear'); },
    async vigentePorClave(_t, _i, clave) {
      const f = [...filas.values()].find((x) => x.clave === clave && ['pendiente', 'disponible'].includes(x.estado));
      return f ? aReg(f) : null;
    },
    async ranurasOcupadas() { return [...filas.values()].filter((f) => f.estado !== 'eliminada').map((f) => f.ranura); },
    async uso() { return opciones.uso ?? { bytes: 0, objetos: 0 }; },
    async insertarPendiente(_t, n) { pasos.push('A:insertarPendiente'); filas.set(n.id, { ...n, estado: 'pendiente', confirmadaEn: null }); },
    async confirmar(id, ahora) {
      pasos.push('B:confirmar');
      if (opciones.confirmarFalla) throw new Error('bd caida');
      const f = filas.get(id)!;
      f.estado = 'disponible';
      f.confirmadaEn = ahora;
      return true;
    },
    async marcarEliminacion(id, motivo) { pasos.push(`marcarEliminacion:${motivo}`); filas.get(id)!.estado = 'eliminacion_pendiente'; },
  };
  const memoria = new MemoriaEvidenciasAdapter();
  const almacen = opciones.almacen === null ? null : memoria;
  const subirOriginal = memoria.subir.bind(memoria);
  memoria.subir = async (...a) => { pasos.push('subir'); return subirOriginal(...a); };
  const d: DependenciasCarga = {
    evidencias: repo as EvidenciasRepositorio,
    almacen,
    procesador: { async normalizar(b) { return { bytes: Buffer.concat([b, Buffer.from('-n')]), tipo: 'image/jpeg', ancho: 4, alto: 3, sha256: 'b'.repeat(64) }; } },
    incidentes: { async estados(ids) { return new Map(ids.map((i) => [i, { referencia: 'INC-X', estado: 'REGISTRADO' as const, registradoEn: AHORA }])); } },
    idPorReferencia: async () => INC,
    secretos: new HmacSecretosAdapter('s'.repeat(40)),
    limitador: { async consumir() { return { permitido: true, reintentarEnSegundos: 0 }; } },
    unidadDeTrabajo: { enTransaccion: (fn) => fn(tx) },
    cuota: { maxBytes: 1000, maxObjetos: 10 },
    ahora: () => AHORA,
    nuevoId: () => randomUUID(),
    sha256: (b) => createHash('sha256').update(b).digest('hex'),
  };
  return { caso: new AdjuntarEvidenciaUseCase(d), pasos, filas, memoria };
}

const carga = { incidenteId: INC, modalidad: 'cuenta' as const, autorUsuarioId: AUTOR };
const archivo = { bytes: BYTES, tipoDeclarado: 'image/jpeg' };

describe('AdjuntarEvidenciaUseCase', () => {
  it('orden: transaccion A -> subida -> transaccion B', async () => {
    const e = escenario();
    const r = await e.caso.adjuntar(carga, randomUUID(), archivo);
    expect(r.nueva).toBe(true);
    expect(e.pasos).toEqual(['A:bloquear', 'A:insertarPendiente', 'subir', 'B:confirmar']);
    expect([...e.filas.values()][0]!.publicId).toMatch(/^aynisafe\/[0-9a-f-]{36}$/);
    expect(e.memoria.cantidad).toBe(1);
  });

  it('fallo de la subida: eliminacion_pendiente y 503', async () => {
    const e = escenario();
    e.memoria.fallarSubida = 'antes';
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toMatchObject({ name: 'AlmacenNoDisponibleError', motivo: 'proveedor' });
    expect(e.pasos).toEqual(['A:bloquear', 'A:insertarPendiente', 'subir', 'marcarEliminacion:fallo_carga']);
  });

  it('respuesta perdida: el objeto existe pero queda registrado para eliminar', async () => {
    const e = escenario();
    e.memoria.fallarSubida = 'despues';
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toBeInstanceOf(AlmacenNoDisponibleError);
    const f = [...e.filas.values()][0]!;
    expect(e.memoria.existe(f.publicId)).toBe(true);
    expect(f.estado).toBe('eliminacion_pendiente');
  });

  it('fallo de la transaccion B: la fila queda pendiente', async () => {
    const e = escenario({ confirmarFalla: true });
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toMatchObject({ motivo: 'confirmacion' });
    expect([...e.filas.values()][0]!.estado).toBe('pendiente');
  });

  it('respuesta invalida del proveedor: eliminacion_pendiente', async () => {
    const e = escenario();
    e.memoria.subir = async () => { throw new Error('respuesta rara'); };
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toBeInstanceOf(AlmacenNoDisponibleError);
    expect([...e.filas.values()][0]!.estado).toBe('eliminacion_pendiente');
  });

  it('cuota local alcanzada: 503 sin llamar al almacen', async () => {
    const e = escenario({ uso: { bytes: 995, objetos: 0 } });
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toMatchObject({ motivo: 'cuota_local' });
    expect(e.pasos).not.toContain('subir');
    expect(e.filas.size).toBe(0);
  });

  it('proveedor deshabilitado: 503 en la autorizacion y en la carga', async () => {
    const e = escenario({ almacen: null });
    await expect(e.caso.autorizar({ tipo: 'ciudadano', usuarioId: AUTOR }, 'INC-X')).rejects.toMatchObject({ motivo: 'deshabilitado' });
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toMatchObject({ motivo: 'deshabilitado' });
  });

  it('tres ranuras ocupadas: limite', async () => {
    const e = escenario({ filas: [{ ranura: 1 }, { ranura: 2 }, { ranura: 3 }] });
    await expect(e.caso.adjuntar(carga, randomUUID(), archivo)).rejects.toBeInstanceOf(LimiteFotosError);
  });

  it('misma clave y mismo archivo devuelve la existente; otro archivo es conflicto', async () => {
    const e = escenario();
    const clave = randomUUID();
    const a = await e.caso.adjuntar(carga, clave, archivo);
    const b = await e.caso.adjuntar(carga, clave, archivo);
    expect(b).toEqual({ nueva: false, evidencia: a.evidencia });
    await expect(e.caso.adjuntar(carga, clave, { ...archivo, bytes: Buffer.from('otra') })).rejects.toBeInstanceOf(ConflictoIdempotenciaError);
    expect(e.memoria.cantidad).toBe(1);
  });

  it('autor ajeno no esta autorizado', async () => {
    const e = escenario();
    await expect(e.caso.autorizar({ tipo: 'ciudadano', usuarioId: randomUUID() }, 'INC-X')).rejects.toBeInstanceOf(CargaNoAutorizadaError);
  });
});
