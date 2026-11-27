import { describe, expect, it } from '@jest/globals';
import type { NuevoEvento, PublicadorEventos } from '../../src/compartido/eventos/eventos';
import type { ContextoTransaccional, UnidadDeTrabajo } from '../../src/compartido/transaccion';
import {
  ClaveDuplicadaError,
  type EnvioGuardado,
  type EnviosRepositorio,
  type IncidenteCreado,
  type IncidentesPort,
  type LimitadorEnviosPort,
  type NuevoEnvio,
  type SolicitudPrevia,
  type TerritorioEnvio,
  type TerritorioPort,
} from '../../src/modules/reportes/aplicacion/puertos/registro.port';
import {
  ClaveIdempotenciaRequeridaError,
  ConflictoIdempotenciaError,
  LimiteEnviosError,
  RegistrarIncidenteUseCase,
  RegistroNoDisponibleError,
  type DependenciasRegistro,
} from '../../src/modules/reportes/aplicacion/registrar-incidente.use-case';
import { FORMATO_CODIGO, ValidacionEnvioError } from '../../src/modules/reportes/dominio/envio';
import { HmacSecretosAdapter } from '../../src/modules/reportes/infraestructura/hmac-secretos.adapter';

const AHORA = new Date('2026-11-26T15:00:00.000Z');
const CLAVE = '0b9c1e4e-2f0a-4c55-9d8e-6f1a2b3c4d5e';
const TX = {} as ContextoTransaccional;
const RESUELTO: TerritorioEnvio = { estado: 'resuelto', distritoId: 'DIS-01', motivo: null, version: 'v'.repeat(64) };

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  categoriaId: 'robo',
  descripcion: 'Me arrebataron el celular',
  ocurrencia: { modo: 'ahora', instante: '2026-11-26T14:59:00Z' },
  punto: { latitud: -13.16, longitud: -74.22, origen: 'gps' },
  ...extra,
});
const deInvitado = (extra: Record<string, unknown> = {}) => cuerpo({ telefonoContacto: '987654321', ...extra });

/** Dobles en memoria que registran el orden de los pasos. */
function crear(opciones: { territorio?: () => Promise<TerritorioEnvio>; falloEn?: 'envio' | 'evento' | 'evaluacion'; permitido?: boolean } = {}) {
  const pasos: string[] = [];
  const solicitudes = new Map<string, SolicitudPrevia & { ambito: string }>();
  const envios = new Map<string, NuevoEnvio>();
  const incidentes = new Map<string, IncidenteCreado>();
  const eventos: NuevoEvento[] = [];
  const evaluaciones = new Map<string, Parameters<DependenciasRegistro['evaluaciones']['crear']>[1]>();
  let despertado = 0;
  let consumos = 0;
  let n = 0;
  const repo: EnviosRepositorio = {
    async buscarSolicitud(ambito, clave) {
      pasos.push('buscarSolicitud');
      return solicitudes.get(`${ambito}|${clave}`) ?? null;
    },
    async insertarSolicitud(_tx, ambito, clave, huella, incidenteId) {
      pasos.push('insertarSolicitud');
      if (solicitudes.has(`${ambito}|${clave}`)) throw new ClaveDuplicadaError();
      solicitudes.set(`${ambito}|${clave}`, { ambito, huellaContenido: huella, incidenteId });
    },
    async insertarEnvio(_tx, nuevo) {
      pasos.push('insertarEnvio');
      if (opciones.falloEn === 'envio') throw new Error('fallo envio');
      envios.set(nuevo.incidenteId, nuevo);
    },
    async leerEnvio(id): Promise<EnvioGuardado | null> {
      const e = envios.get(id);
      return e ? { incidenteId: id, modalidad: e.modalidad, territorio: e.territorio } : null;
    },
    async rotarCodigo(id, huella) {
      pasos.push('rotarCodigo');
      const e = envios.get(id)!;
      envios.set(id, { ...e, codigoHuella: huella });
    },
  };
  const incidentesPort: IncidentesPort = {
    async crear() {
      pasos.push('crearIncidente');
      n += 1;
      const inc = { id: `00000000-0000-4000-8000-00000000000${n}`, referencia: `INC-AAAAA-AAAA${n}`, estado: 'REGISTRADO', registradoEn: AHORA };
      incidentes.set(inc.id, inc);
      return inc;
    },
    async estados(ids) {
      return new Map(ids.filter((i) => incidentes.has(i)).map((i) => [i, incidentes.get(i)!]));
    },
  };
  const territorio: TerritorioPort = {
    resolver: opciones.territorio ?? (async () => RESUELTO),
    nombreDistrito: (id) => (id === 'DIS-01' ? 'Ayacucho' : null),
  };
  const limitador: LimitadorEnviosPort = {
    async consumir() {
      pasos.push('limitador');
      consumos += 1;
      return { permitido: opciones.permitido ?? true, reintentarEnSegundos: 120 };
    },
  };
  const publicador: PublicadorEventos = {
    async publicar(_tx, evento) {
      pasos.push('publicarEvento');
      if (opciones.falloEn === 'evento') throw new Error('fallo evento');
      eventos.push(evento);
      return 'evento-1';
    },
  };
  // La unidad de trabajo simula el rollback restaurando copias de los mapas.
  const uow: UnidadDeTrabajo = {
    async enTransaccion(fn) {
      const copia = { s: new Map(solicitudes), e: new Map(envios), i: new Map(incidentes), ev: [...eventos], evl: new Map(evaluaciones) };
      try {
        return await fn(TX);
      } catch (e) {
        solicitudes.clear();
        copia.s.forEach((v, k) => solicitudes.set(k, v));
        envios.clear();
        copia.e.forEach((v, k) => envios.set(k, v));
        incidentes.clear();
        copia.i.forEach((v, k) => incidentes.set(k, v));
        eventos.splice(0, eventos.length, ...copia.ev);
        evaluaciones.clear();
        copia.evl.forEach((v, k) => evaluaciones.set(k, v));
        throw e;
      }
    },
  };
  const secretos = new HmacSecretosAdapter('s'.repeat(40));
  const permisos = new Map<string, { huella: string; venceEn: Date }>();
  const deps: DependenciasRegistro = {
    categorias: { idsActivos: async () => new Set(['robo', 'pelea', 'accidente-transito']) },
    envios: repo,
    evaluaciones: {
      async crear(_tx, datos) {
        pasos.push('crearEvaluacion');
        if (opciones.falloEn === 'evaluacion') throw new Error('fallo evaluacion');
        evaluaciones.set(datos.incidenteId, datos);
      },
    },
    incidentes: incidentesPort,
    territorio,
    limitador,
    secretos,
    permisos: {
      async guardar(_tx, incidenteId, huella, _emitido, venceEn) {
        permisos.set(incidenteId, { huella, venceEn });
      },
      async leer(incidenteId) {
        return permisos.get(incidenteId) ?? null;
      },
    },
    eventos: publicador,
    unidadDeTrabajo: uow,
    ahora: () => AHORA,
    despertarEntregas: () => {
      despertado += 1;
    },
  };
  return {
    caso: new RegistrarIncidenteUseCase(deps),
    pasos,
    solicitudes,
    envios,
    evaluaciones,
    incidentes,
    eventos,
    secretos,
    get despertado() {
      return despertado;
    },
    get consumos() {
      return consumos;
    },
  };
}

const CUENTA = { modalidad: 'cuenta', usuarioId: '11111111-1111-4111-8111-111111111111' } as const;
const INVITADO = { modalidad: 'invitado', origenRed: '203.0.113.5' } as const;

describe('RegistrarIncidente', () => {
  it('registra en orden: clave previa, territorio, transaccion (incidente, clave, originales, evento) y despierta', async () => {
    const t = crear();
    const r = await t.caso.ejecutar(CUENTA, CLAVE, cuerpo());
    expect(t.pasos).toEqual(['buscarSolicitud', 'crearIncidente', 'insertarSolicitud', 'insertarEnvio', 'publicarEvento']);
    expect(r.nuevo).toBe(true);
    expect(r.comprobante).toMatchObject({
      referencia: 'INC-AAAAA-AAAA1',
      estado: 'REGISTRADO',
      modalidad: 'cuenta',
      territorio: RESUELTO,
      nombreDistrito: 'Ayacucho',
      codigoSeguimiento: null,
    });
    expect(t.despertado).toBe(1);
    expect(t.eventos).toEqual([
      { tipo: 'IncidenteRegistrado', version: 1, agregadoId: expect.any(String), carga: { incidenteId: expect.any(String), modalidad: 'cuenta' } },
    ]);
    const guardado = [...t.envios.values()][0]!;
    expect(guardado.autorUsuarioId).toBe(CUENTA.usuarioId);
    expect(guardado.codigoHuella).toBeNull();
  });

  it('el invitado consume el limite, recibe un codigo y solo se guarda su huella', async () => {
    const t = crear();
    const r = await t.caso.ejecutar(INVITADO, CLAVE, deInvitado());
    expect(t.pasos.slice(0, 2)).toEqual(['buscarSolicitud', 'limitador']);
    expect(r.comprobante.codigoSeguimiento).toMatch(FORMATO_CODIGO);
    const guardado = [...t.envios.values()][0]!;
    expect(guardado.autorUsuarioId).toBeNull();
    expect(guardado.codigoHuella).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(guardado)).not.toContain(r.comprobante.codigoSeguimiento!);
    expect(JSON.stringify(t.eventos)).not.toContain('987654321');
  });

  it('la repeticion devuelve el mismo incidente sin consumir el limite y rota el codigo del invitado', async () => {
    const t = crear({ permitido: true });
    const primero = await t.caso.ejecutar(INVITADO, CLAVE, deInvitado());
    const huellaAntes = [...t.envios.values()][0]!.codigoHuella;
    const segundo = await t.caso.ejecutar(INVITADO, CLAVE, deInvitado());
    expect(segundo.nuevo).toBe(false);
    expect(segundo.comprobante.referencia).toBe(primero.comprobante.referencia);
    expect(segundo.comprobante.codigoSeguimiento).not.toBe(primero.comprobante.codigoSeguimiento);
    expect([...t.envios.values()][0]!.codigoHuella).not.toBe(huellaAntes);
    expect(t.consumos).toBe(1);
    expect(t.incidentes.size).toBe(1);
  });

  it('una repeticion con el limite agotado no se bloquea', async () => {
    const t = crear();
    await t.caso.ejecutar(INVITADO, CLAVE, deInvitado());
    const bloqueado = crear({ permitido: false });
    // Comparte el estado: se reutiliza la misma instancia con limite negado en su doble.
    await expect(bloqueado.caso.ejecutar(INVITADO, CLAVE, deInvitado())).rejects.toThrow(LimiteEnviosError);
    expect(bloqueado.incidentes.size).toBe(0);
    const r = await t.caso.ejecutar(INVITADO, CLAVE, deInvitado());
    expect(r.nuevo).toBe(false);
  });

  it('la misma clave con otro contenido es conflicto y no modifica nada', async () => {
    const t = crear();
    await t.caso.ejecutar(CUENTA, CLAVE, cuerpo());
    await expect(t.caso.ejecutar(CUENTA, CLAVE, cuerpo({ descripcion: 'Otro contenido' }))).rejects.toThrow(ConflictoIdempotenciaError);
    expect(t.incidentes.size).toBe(1);
  });

  it('si otra solicitud gana la carrera de la clave, se resuelve como repeticion', async () => {
    const t = crear();
    const original = t.caso.ejecutar.bind(t.caso);
    // Inserta la clave "ganadora" justo despues de la busqueda inicial.
    await original(CUENTA, CLAVE, cuerpo());
    const ganadora = [...t.solicitudes.values()][0]!;
    t.solicitudes.clear();
    let primera = true;
    const repoBuscar = t.caso['d'].envios.buscarSolicitud;
    t.caso['d'].envios.buscarSolicitud = async (ambito: string, clave: string) => {
      if (primera) {
        primera = false;
        t.solicitudes.set(`${ambito}|${clave}`, ganadora);
        return null;
      }
      return repoBuscar(ambito, clave);
    };
    const r = await t.caso.ejecutar(CUENTA, CLAVE, cuerpo());
    expect(r.nuevo).toBe(false);
    expect(t.incidentes.size).toBe(1);
  });

  it('sin clave o con clave invalida no consulta nada', async () => {
    const t = crear();
    await expect(t.caso.ejecutar(CUENTA, undefined, cuerpo())).rejects.toThrow(ClaveIdempotenciaRequeridaError);
    await expect(t.caso.ejecutar(CUENTA, 'abc', cuerpo())).rejects.toThrow(ClaveIdempotenciaRequeridaError);
    expect(t.pasos).toEqual([]);
  });

  it('un cuerpo invalido no consume el limite ni crea nada', async () => {
    const t = crear();
    await expect(t.caso.ejecutar(INVITADO, CLAVE, cuerpo())).rejects.toThrow(ValidacionEnvioError);
    expect(t.consumos).toBe(0);
    expect(t.incidentes.size).toBe(0);
  });

  it('sin cartografia activa se registra con distrito pendiente sin_cartografia', async () => {
    const t = crear({ territorio: async () => ({ estado: 'pendiente', distritoId: null, motivo: 'sin_cartografia', version: null }) });
    const r = await t.caso.ejecutar(CUENTA, CLAVE, cuerpo());
    expect(r.comprobante.territorio).toEqual({ estado: 'pendiente', distritoId: null, motivo: 'sin_cartografia', version: null });
    expect(r.comprobante.nombreDistrito).toBeNull();
  });

  it('otro fallo territorial responde no disponible sin registrar', async () => {
    const t = crear({ territorio: async () => Promise.reject(new Error('bd caida')) });
    await expect(t.caso.ejecutar(CUENTA, CLAVE, cuerpo())).rejects.toThrow(RegistroNoDisponibleError);
    expect(t.incidentes.size).toBe(0);
    expect(t.despertado).toBe(0);
  });

  it.each(['envio', 'evento'] as const)('un fallo en %s revierte todo y no despierta el procesador', async (falloEn) => {
    const t = crear({ falloEn });
    await expect(t.caso.ejecutar(CUENTA, CLAVE, cuerpo())).rejects.toThrow(RegistroNoDisponibleError);
    expect(t.incidentes.size).toBe(0);
    expect(t.solicitudes.size).toBe(0);
    expect(t.envios.size).toBe(0);
    expect(t.eventos).toHaveLength(0);
    expect(t.despertado).toBe(0);
  });

  it('una pelea con heridos crea la version 1 de la evaluacion antes del evento, con cantidad no_se', async () => {
    const t = crear();
    await t.caso.ejecutar(CUENTA, CLAVE, cuerpo({ categoriaId: 'pelea', heridos: 'si', evaluacion: { personaPrincipal: { consciente: 'si' } } }));
    expect(t.pasos.slice(-3)).toEqual(['insertarEnvio', 'crearEvaluacion', 'publicarEvento']);
    const [datos] = [...t.evaluaciones.values()];
    expect(datos).toMatchObject({
      samuRequerido: true,
      actorUsuarioId: CUENTA.usuarioId,
      instantanea: { heridos: 'si', cantidadHeridos: 'no_se', consciente: 'si', signosVida: null, sangrado: null },
    });
  });

  it('un robo no crea evaluacion y el invitado queda sin actor', async () => {
    const t = crear();
    await t.caso.ejecutar(CUENTA, CLAVE, cuerpo());
    expect(t.evaluaciones.size).toBe(0);
    const i = crear();
    await i.caso.ejecutar({ modalidad: 'invitado', origenRed: '203.0.113.7' }, CLAVE, deInvitado({ categoriaId: 'pelea', heridos: 'no_se' }));
    expect([...i.evaluaciones.values()][0]).toMatchObject({ actorUsuarioId: null, samuRequerido: false });
  });

  it('un fallo al crear la evaluacion revierte todo sin consumir la clave', async () => {
    const t = crear({ falloEn: 'evaluacion' });
    await expect(t.caso.ejecutar(CUENTA, CLAVE, cuerpo({ categoriaId: 'pelea', heridos: 'si' }))).rejects.toThrow(RegistroNoDisponibleError);
    expect(t.incidentes.size).toBe(0);
    expect(t.solicitudes.size).toBe(0);
    expect(t.evaluaciones.size).toBe(0);
    expect(t.eventos).toHaveLength(0);
  });

  it('la misma clave en dos cuentas crea dos incidentes', async () => {
    const t = crear();
    await t.caso.ejecutar(CUENTA, CLAVE, cuerpo());
    const r = await t.caso.ejecutar({ modalidad: 'cuenta', usuarioId: '22222222-2222-4222-8222-222222222222' }, CLAVE, cuerpo());
    expect(r.nuevo).toBe(true);
    expect(t.incidentes.size).toBe(2);
  });
});
