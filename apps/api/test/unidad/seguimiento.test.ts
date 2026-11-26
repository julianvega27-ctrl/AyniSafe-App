import { describe, expect, it } from '@jest/globals';
import {
  ConsultaSeguimientoInvalidaError,
  LimiteSeguimientoError,
  SeguimientoCiudadano,
  SeguimientoNoDisponibleError,
  SeguimientoNoEncontradoError,
  type DependenciasSeguimiento,
} from '../../src/modules/consultas/aplicacion/seguimiento.use-case';
import { codificarCursor, decodificarCursor, validarConsultaInvitado } from '../../src/modules/consultas/dominio/seguimiento';

const INC = '11111111-1111-4111-8111-111111111111';
const AUTOR = '22222222-2222-4222-8222-222222222222';
const REF = 'INC-7K3M9-Q2TXA';
const RECIBIDO = new Date('2026-11-26T15:00:00.000Z');

function crear(opciones: { codigoValido?: boolean; permitido?: boolean; falla?: boolean } = {}) {
  const consumos: { tipo: string; identificador: string }[][] = [];
  const verificaciones: (string | null)[] = [];
  const deps: DependenciasSeguimiento = {
    envios: {
      async listarDeAutor() {
        if (opciones.falla) throw new Error('bd');
        return [{ incidenteId: INC, categoriaId: 'pelea', recibidoEn: RECIBIDO, territorio: { estado: 'resuelto', distritoId: 'DIS-01' } }];
      },
      async detalleDeAutor(usuarioId, incidenteId) {
        if (usuarioId !== AUTOR || incidenteId !== INC) return null;
        return {
          categoriaId: 'pelea',
          recibidoEn: RECIBIDO,
          territorio: { estado: 'pendiente', motivo: 'frontera' },
          descripcion: 'Pelea frente al mercado',
          ocurrencia: { modo: 'ahora', instante: RECIBIDO },
          heridos: 'no_se',
          atencionMedica: null,
        };
      },
      async verificarCodigo(incidenteId) {
        verificaciones.push(incidenteId);
        return incidenteId && opciones.codigoValido !== false ? { categoriaId: 'pelea', recibidoEn: RECIBIDO } : null;
      },
    },
    incidentes: {
      normalizarReferencia: (t) => (t.toUpperCase() === REF ? REF : null),
      porReferencia: async (r) => (r === REF ? { id: INC, referencia: REF, estado: 'REGISTRADO', registradoEn: RECIBIDO } : null),
      estados: async (ids) => new Map(ids.filter((i) => i === INC).map((i) => [i, { referencia: REF, estado: 'REGISTRADO', registradoEn: RECIBIDO }])),
    },
    categorias: { nombres: async () => new Map([['pelea', 'Pelea']]) },
    limitador: {
      async consumir(c) {
        consumos.push(c.map((x) => ({ tipo: x.tipo, identificador: x.identificador })));
        return { permitido: opciones.permitido ?? true, reintentarEnSegundos: 60 };
      },
    },
  };
  return { s: new SeguimientoCiudadano(deps), consumos, verificaciones };
}

describe('vistas con lista cerrada de campos', () => {
  it('historial del autor: referencia, categoria, estado, recepcion y territorio', async () => {
    const { s } = crear();
    const r = await s.historial(AUTOR, undefined);
    expect(Object.keys(r).sort()).toEqual(['elementos', 'siguiente']);
    expect(r.siguiente).toBeNull();
    expect(Object.keys(r.elementos[0]!).sort()).toEqual(['categoria', 'estado', 'recibidoEn', 'referencia', 'territorio']);
    expect(r.elementos[0]).toEqual({
      referencia: REF,
      categoria: { id: 'pelea', nombre: 'Pelea' },
      estado: 'REGISTRADO',
      recibidoEn: RECIBIDO.toISOString(),
      territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
    });
  });

  it('detalle del autor: originales propios, institucion pendiente y sin actuaciones inventadas', async () => {
    const { s } = crear();
    const d = await s.detalleDeAutor(AUTOR, 'inc-7k3m9-q2txa');
    expect(Object.keys(d).sort()).toEqual([
      'actuaciones', 'categoria', 'descripcion', 'estado', 'institucionResponsable', 'ocurrencia', 'recibidoEn', 'referencia', 'respuestas', 'territorio',
    ]);
    expect(d.institucionResponsable).toEqual({ estado: 'pendiente' });
    expect(d.actuaciones).toEqual([]);
    expect(d.respuestas).toEqual({ heridos: 'no_se', atencionMedica: null });
    expect(d.territorio).toEqual({ estado: 'pendiente', motivo: 'frontera' });
  });

  it('detalle ajeno, inexistente o con referencia invalida: el mismo no encontrado', async () => {
    const { s } = crear();
    await expect(s.detalleDeAutor('33333333-3333-4333-8333-333333333333', REF)).rejects.toThrow(SeguimientoNoEncontradoError);
    await expect(s.detalleDeAutor(AUTOR, 'INC-00000-00000')).rejects.toThrow(SeguimientoNoEncontradoError);
    await expect(s.detalleDeAutor(AUTOR, 'no-es-referencia')).rejects.toThrow(SeguimientoNoEncontradoError);
  });

  it('vista del invitado: sin descripcion, punto, distrito, telefono, respuestas sanitarias ni ids internos', async () => {
    const { s } = crear();
    const v = await s.vistaInvitado({ referencia: REF, codigo: 'AAAA-BBBB-CCCC-DDDD' }, '203.0.113.5');
    expect(Object.keys(v).sort()).toEqual(['actuaciones', 'categoria', 'estado', 'institucionResponsable', 'recibidoEn', 'referencia']);
    expect(JSON.stringify(v)).not.toContain(INC);
  });
});

describe('consulta del invitado', () => {
  it('consume los limites por origen y por referencia antes de verificar', async () => {
    const { s, consumos, verificaciones } = crear();
    await s.vistaInvitado({ referencia: 'inc-7k3m9-q2txa', codigo: 'x' }, '203.0.113.5');
    expect(consumos).toEqual([[{ tipo: 'seguimiento_ip', identificador: '203.0.113.5' }, { tipo: 'seguimiento_ref', identificador: REF }]]);
    expect(verificaciones).toEqual([INC]);
  });

  it('con el limite agotado responde 429 aunque el codigo sea correcto, sin verificar', async () => {
    const { s, verificaciones } = crear({ permitido: false });
    await expect(s.vistaInvitado({ referencia: REF, codigo: 'x' }, 'ip')).rejects.toThrow(LimiteSeguimientoError);
    expect(verificaciones).toEqual([]);
  });

  it('referencia inexistente y codigo incorrecto dan el mismo error, y ambos verifican', async () => {
    const inexistente = crear();
    await expect(inexistente.s.vistaInvitado({ referencia: 'INC-00000-00000', codigo: 'x' }, 'ip')).rejects.toThrow(SeguimientoNoEncontradoError);
    expect(inexistente.verificaciones).toEqual([null]);
    const incorrecto = crear({ codigoValido: false });
    await expect(incorrecto.s.vistaInvitado({ referencia: REF, codigo: 'x' }, 'ip')).rejects.toThrow(SeguimientoNoEncontradoError);
    expect(incorrecto.verificaciones).toEqual([INC]);
  });

  it('una referencia sin formato solo consume el limite por origen', async () => {
    const { s, consumos } = crear();
    await expect(s.vistaInvitado({ referencia: 'abc', codigo: 'x' }, 'ip')).rejects.toThrow(SeguimientoNoEncontradoError);
    expect(consumos).toEqual([[{ tipo: 'seguimiento_ip', identificador: 'ip' }]]);
  });

  it.each([
    [null],
    [{ referencia: REF }],
    [{ referencia: REF, codigo: 'x', extra: 1 }],
    [{ referencia: 1, codigo: 'x' }],
    [{ referencia: REF, codigo: 'x'.repeat(41) }],
  ])('rechaza el cuerpo %j sin consultar', async (cuerpo) => {
    const { s, consumos } = crear();
    await expect(s.vistaInvitado(cuerpo, 'ip')).rejects.toThrow(ConsultaSeguimientoInvalidaError);
    expect(consumos).toEqual([]);
    expect(validarConsultaInvitado(cuerpo)).toBeNull();
  });
});

describe('cursor y disponibilidad', () => {
  it('el cursor es opaco y reversible; uno manipulado se rechaza', async () => {
    const c = { recibidoEn: RECIBIDO, incidenteId: INC };
    const texto = codificarCursor(c);
    expect(texto).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursor(texto)).toEqual(c);
    for (const malo of ['', '***', Buffer.from('["x","y"]').toString('base64url'), Buffer.from('{}').toString('base64url'), 42]) {
      expect(decodificarCursor(malo)).toBeNull();
    }
    const { s } = crear();
    await expect(s.historial(AUTOR, 'no-valido!')).rejects.toThrow(ConsultaSeguimientoInvalidaError);
  });

  it('un fallo de almacenamiento se informa como no disponible', async () => {
    const { s } = crear({ falla: true });
    await expect(s.historial(AUTOR, undefined)).rejects.toThrow(SeguimientoNoDisponibleError);
  });
});
