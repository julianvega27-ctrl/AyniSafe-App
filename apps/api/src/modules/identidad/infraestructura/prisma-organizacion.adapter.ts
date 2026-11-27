import { Prisma } from '../../../generated/prisma/client';
import type {
  DatosOperadorNuevo,
  DatosSedeNueva,
  EstadoDesignacion,
  OrganizacionPort,
  TransaccionOrganizacion,
} from '../aplicacion/puertos/organizacion.port';
import { CorreoEnUsoError, ServicioNoDisponibleError, ValidacionError } from '../dominio/errores';
import {
  ConflictoOrganizacionError,
  normalizarNombreSede,
  RecursoNoEncontradoError,
  requisitosFaltantes,
  RequisitosHabilitacionError,
  SedeExistenteError,
  type AmbitoOperador,
  type EstadoOperador,
  type Institucion,
  type OperadorSede,
  type Sede,
  type TipoInstitucion,
} from '../dominio/organizacion';
import type { CambiosInstitucionValidos, CambiosSedeValidos } from '../dominio/validacion-organizacion';
import type { PrismaClient } from './prisma-cliente';

type Cliente = Prisma.TransactionClient;

interface FilaSede {
  id: string;
  institucionId: TipoInstitucion;
  nombre: string;
  distritoUbicacionId: string | null;
  direccion: string | null;
  contacto: string | null;
  verificacion: 'sin_verificar' | 'verificada';
  fuenteVerificacion: string | null;
  verificadaEn: string | null;
  habilitadaAtencion: boolean;
  activa: boolean;
  esDemostracion: boolean;
  distritos: string[];
  categorias: string[];
}

interface FilaOperador {
  id: string;
  nombre: string;
  correo: string;
  estado: EstadoOperador;
  sedeId: string;
  esDemostracion: boolean;
}

/** Errores de dominio que deben atravesar el adaptador sin convertirse en 503. */
function esErrorDeDominio(error: unknown): boolean {
  return (
    error instanceof SedeExistenteError ||
    error instanceof ConflictoOrganizacionError ||
    error instanceof RequisitosHabilitacionError ||
    error instanceof RecursoNoEncontradoError ||
    error instanceof CorreoEnUsoError ||
    error instanceof ValidacionError ||
    error instanceof ServicioNoDisponibleError
  );
}

function esUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function aSede(f: FilaSede): Sede {
  return {
    id: f.id,
    institucionId: f.institucionId,
    nombre: f.nombre,
    distritoUbicacionId: f.distritoUbicacionId,
    direccion: f.direccion,
    contacto: f.contacto,
    verificacion: { estado: f.verificacion, fuente: f.fuenteVerificacion, fecha: f.verificadaEn },
    habilitadaAtencion: f.habilitadaAtencion,
    activa: f.activa,
    esDemostracion: f.esDemostracion,
    distritos: f.distritos,
    categorias: f.categorias,
  };
}

async function leerSedes(cliente: Cliente | PrismaClient, id?: string): Promise<Sede[]> {
  const filtro = id === undefined ? Prisma.empty : Prisma.sql`WHERE s.id = ${id}::uuid`;
  const filas = await cliente.$queryRaw<FilaSede[]>`
    SELECT s.id::text AS id,
           s.institucion_id AS "institucionId",
           s.nombre,
           s.distrito_ubicacion_id AS "distritoUbicacionId",
           s.direccion,
           s.contacto,
           s.verificacion,
           s.fuente_verificacion AS "fuenteVerificacion",
           to_char(s.verificada_en, 'YYYY-MM-DD') AS "verificadaEn",
           s.habilitada_atencion AS "habilitadaAtencion",
           s.activa,
           s.es_demostracion AS "esDemostracion",
           COALESCE((SELECT array_agg(c.distrito_id ORDER BY c.distrito_id)
                       FROM coberturas_sede c WHERE c.sede_id = s.id), '{}') AS distritos,
           COALESCE((SELECT array_agg(k.categoria_id ORDER BY k.categoria_id)
                       FROM competencias_sede k WHERE k.sede_id = s.id), '{}') AS categorias
      FROM sedes s
      ${filtro}
     ORDER BY s.institucion_id, s.nombre_normalizado`;
  return filas.map(aSede);
}

async function leerSede(cliente: Cliente | PrismaClient, id: string): Promise<Sede | null> {
  return (await leerSedes(cliente, id))[0] ?? null;
}

/** Bloqueo exclusivo de la sede: serializa habilitacion, conjuntos y suspension de operadores. */
async function bloquearSedeExclusiva(tx: Cliente, id: string): Promise<{ habilitada: boolean } | null> {
  const filas = await tx.$queryRaw<{ habilitada: boolean }[]>`
    SELECT habilitada_atencion AS habilitada FROM sedes WHERE id = ${id}::uuid FOR UPDATE`;
  return filas[0] ?? null;
}

class TransaccionPrisma implements TransaccionOrganizacion {
  constructor(private readonly tx: Cliente) {}

  get contexto(): Cliente {
    return this.tx;
  }

  async bloquearInstitucionActiva(id: TipoInstitucion): Promise<boolean> {
    const filas = await this.tx.$queryRaw<{ activa: boolean }[]>`
      SELECT activa FROM instituciones WHERE id = ${id} FOR SHARE`;
    return filas[0]?.activa === true;
  }

  async bloquearSede(id: string): Promise<boolean> {
    const filas = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM sedes WHERE id = ${id}::uuid FOR SHARE`;
    return filas.length > 0;
  }

  async insertarSede(d: DatosSedeNueva): Promise<string | null> {
    // ON CONFLICT en lugar de capturar la violacion: dos altas concurrentes del mismo nombre
    // esperan a la primera y la segunda no inserta nada.
    const filas = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO sedes (institucion_id, nombre, nombre_normalizado, distrito_ubicacion_id, direccion,
                         contacto, es_demostracion, creado_por)
      VALUES (${d.institucionId}, ${d.nombre}, ${d.nombreNormalizado}, ${d.distritoUbicacionId},
              ${d.direccion}, ${d.contacto}, ${d.esDemostracion}, ${d.creadoPor}::uuid)
      ON CONFLICT ON CONSTRAINT sedes_nombre_por_institucion DO NOTHING
      RETURNING id::text`;
    return filas[0]?.id ?? null;
  }

  async insertarOperadorPendiente(d: DatosOperadorNuevo): Promise<string | null> {
    // Igual que el registro ciudadano: ON CONFLICT evita que PostgreSQL registre el correo en su log.
    const filas = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
      VALUES (${d.nombre}, ${d.correoNormalizado}, NULL, 'operador', 'pendiente_activacion', now())
      ON CONFLICT (correo_normalizado) DO NOTHING
      RETURNING id::text`;
    const id = filas[0]?.id;
    if (id === undefined) return null;
    await this.tx.$executeRaw`
      INSERT INTO pertenencias_operador (usuario_id, sede_id, es_demostracion)
      VALUES (${id}::uuid, ${d.sedeId}::uuid, ${d.esDemostracion})`;
    return id;
  }

  async prepararReenvio(usuarioId: string): Promise<EstadoOperador | null> {
    const filas = await this.tx.$queryRaw<{ estado: EstadoOperador }[]>`
      SELECT u.estado::text AS estado
        FROM usuarios u JOIN pertenencias_operador p ON p.usuario_id = u.id
       WHERE u.id = ${usuarioId}::uuid AND u.rol = 'operador'
         FOR UPDATE OF u`;
    const estado = filas[0]?.estado;
    if (estado === undefined) return null;
    if (estado === 'pendiente_activacion') {
      await this.tx.$executeRaw`
        UPDATE tokens_cuenta SET invalidado_at = now()
         WHERE usuario_id = ${usuarioId}::uuid AND proposito = 'activacion'
           AND used_at IS NULL AND invalidado_at IS NULL`;
    }
    return estado;
  }
}

export class PrismaOrganizacionAdapter implements OrganizacionPort {
  constructor(private readonly prisma: PrismaClient) {}

  private async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (esErrorDeDominio(error)) throw error;
      throw new ServicioNoDisponibleError(error);
    }
  }

  private transaccion<T>(fn: (tx: Cliente) => Promise<T>): Promise<T> {
    return this.ejecutar(() => this.prisma.$transaction(fn));
  }

  enTransaccion<T>(fn: (tx: TransaccionOrganizacion) => Promise<T>): Promise<T> {
    return this.transaccion((tx) => fn(new TransaccionPrisma(tx)));
  }

  listarInstituciones(): Promise<Institucion[]> {
    return this.ejecutar(async () => {
      const filas = await this.prisma.institucion.findMany({ orderBy: { id: 'asc' } });
      return filas.map((f) => ({
        id: f.id as TipoInstitucion,
        tipo: f.tipo as TipoInstitucion,
        nombre: f.nombre,
        contacto: f.contacto,
        activa: f.activa,
      }));
    });
  }

  actualizarInstitucion(id: TipoInstitucion, cambios: CambiosInstitucionValidos): Promise<Institucion | null> {
    return this.transaccion(async (tx) => {
      const actual = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM instituciones WHERE id = ${id} FOR UPDATE`;
      if (actual.length === 0) return null;
      if (cambios.activa === false) {
        const habilitadas = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM sedes WHERE institucion_id = ${id} AND habilitada_atencion`;
        if ((habilitadas[0]?.n ?? 0) > 0) throw new ConflictoOrganizacionError('SEDE_HABILITADA');
      }
      const f = await tx.institucion.update({
        where: { id },
        data: { ...cambios, actualizadoEn: new Date() },
      });
      return { id, tipo: id, nombre: f.nombre, contacto: f.contacto, activa: f.activa };
    });
  }

  listarSedes(): Promise<Sede[]> {
    return this.ejecutar(() => leerSedes(this.prisma));
  }

  obtenerSede(id: string): Promise<Sede | null> {
    return this.ejecutar(() => leerSede(this.prisma, id));
  }

  actualizarSede(id: string, cambios: CambiosSedeValidos): Promise<Sede | null> {
    return this.transaccion(async (tx) => {
      const actual = await bloquearSedeExclusiva(tx, id);
      if (actual === null) return null;
      if (actual.habilitada && cambios.verificacion?.estado === 'sin_verificar') {
        throw new ConflictoOrganizacionError('SEDE_HABILITADA');
      }
      const v = cambios.verificacion;
      try {
        await tx.sede.update({
          where: { id },
          data: {
            ...(cambios.nombre !== undefined
              ? { nombre: cambios.nombre, nombreNormalizado: normalizarNombreSede(cambios.nombre) }
              : {}),
            ...(cambios.distritoUbicacionId !== undefined ? { distritoUbicacionId: cambios.distritoUbicacionId } : {}),
            ...(cambios.direccion !== undefined ? { direccion: cambios.direccion } : {}),
            ...(cambios.contacto !== undefined ? { contacto: cambios.contacto } : {}),
            // Suspender una sede la deshabilita para atencion.
            ...(cambios.activa !== undefined
              ? { activa: cambios.activa, ...(cambios.activa ? {} : { habilitadaAtencion: false }) }
              : {}),
            ...(v === undefined
              ? {}
              : v.estado === 'verificada'
                ? { verificacion: 'verificada', fuenteVerificacion: v.fuente, verificadaEn: new Date(`${v.fecha}T00:00:00.000Z`) }
                : { verificacion: 'sin_verificar', fuenteVerificacion: null, verificadaEn: null }),
            actualizadoEn: new Date(),
          },
        });
      } catch (error) {
        if (esUnicidad(error)) throw new SedeExistenteError();
        throw error;
      }
      return leerSede(tx, id);
    });
  }

  private reemplazar(id: string, ids: readonly string[], tipo: 'cobertura' | 'competencias'): Promise<Sede | null> {
    return this.transaccion(async (tx) => {
      const actual = await bloquearSedeExclusiva(tx, id);
      if (actual === null) return null;
      if (actual.habilitada && ids.length === 0) throw new ConflictoOrganizacionError('SEDE_HABILITADA');
      if (tipo === 'cobertura') {
        await tx.coberturaSede.deleteMany({ where: { sedeId: id } });
        await tx.coberturaSede.createMany({ data: ids.map((distritoId) => ({ sedeId: id, distritoId })) });
      } else {
        await tx.competenciaSede.deleteMany({ where: { sedeId: id } });
        await tx.competenciaSede.createMany({ data: ids.map((categoriaId) => ({ sedeId: id, categoriaId })) });
      }
      await tx.$executeRaw`UPDATE sedes SET actualizado_en = now() WHERE id = ${id}::uuid`;
      return leerSede(tx, id);
    });
  }

  reemplazarCobertura(id: string, distritos: readonly string[]): Promise<Sede | null> {
    return this.reemplazar(id, distritos, 'cobertura');
  }

  reemplazarCompetencias(id: string, categorias: readonly string[]): Promise<Sede | null> {
    return this.reemplazar(id, categorias, 'competencias');
  }

  habilitar(id: string): Promise<Sede | null> {
    return this.transaccion(async (tx) => {
      // Primero los bloqueos; despues, en otra sentencia, los conteos: en READ COMMITTED cada
      // sentencia toma una instantanea nueva y ve lo confirmado por quien tenia el bloqueo.
      if ((await bloquearSedeExclusiva(tx, id)) === null) return null;
      await tx.$queryRaw`
        SELECT i.id FROM instituciones i JOIN sedes s ON s.institucion_id = i.id
         WHERE s.id = ${id}::uuid FOR SHARE OF i`;
      const filas = await tx.$queryRaw<{
        institucionActiva: boolean; sedeActiva: boolean; verificada: boolean;
        distritos: number; categorias: number; operadoresActivos: number;
      }[]>`
        SELECT i.activa AS "institucionActiva",
               s.activa AS "sedeActiva",
               s.verificacion = 'verificada' AS verificada,
               (SELECT count(*)::int FROM coberturas_sede c WHERE c.sede_id = s.id) AS distritos,
               (SELECT count(*)::int FROM competencias_sede k WHERE k.sede_id = s.id) AS categorias,
               (SELECT count(*)::int FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
                 WHERE p.sede_id = s.id AND u.estado = 'activo') AS "operadoresActivos"
          FROM sedes s JOIN instituciones i ON i.id = s.institucion_id
         WHERE s.id = ${id}::uuid`;
      const estado = filas[0];
      if (!estado) return null;
      const faltantes = requisitosFaltantes(estado);
      if (faltantes.length > 0) throw new RequisitosHabilitacionError(faltantes);
      await tx.$executeRaw`
        UPDATE sedes SET habilitada_atencion = TRUE, actualizado_en = now() WHERE id = ${id}::uuid`;
      return leerSede(tx, id);
    });
  }

  deshabilitar(id: string): Promise<Sede | null> {
    return this.transaccion(async (tx) => {
      if ((await bloquearSedeExclusiva(tx, id)) === null) return null;
      await tx.$executeRaw`
        UPDATE sedes SET habilitada_atencion = FALSE, actualizado_en = now() WHERE id = ${id}::uuid`;
      return leerSede(tx, id);
    });
  }

  listarOperadores(sedeId: string): Promise<OperadorSede[] | null> {
    return this.ejecutar(async () => {
      if ((await leerSede(this.prisma, sedeId)) === null) return null;
      return this.prisma.$queryRaw<FilaOperador[]>`
        SELECT u.id::text AS id, u.nombre, u.correo_normalizado AS correo, u.estado::text AS estado,
               p.sede_id::text AS "sedeId", p.es_demostracion AS "esDemostracion"
          FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.sede_id = ${sedeId}::uuid
         ORDER BY lower(u.nombre), u.id`;
    });
  }

  cambiarEstadoOperador(id: string, estado: 'activo' | 'suspendido', ahora: Date): Promise<OperadorSede | null> {
    return this.transaccion(async (tx) => {
      const pertenencia = await tx.$queryRaw<{ sedeId: string }[]>`
        SELECT p.sede_id::text AS "sedeId" FROM pertenencias_operador p
          JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.usuario_id = ${id}::uuid AND u.rol = 'operador'`;
      const sedeId = pertenencia[0]?.sedeId;
      if (sedeId === undefined) return null;
      // Orden de bloqueo fijo (sede y luego cuenta) para no interbloquear con la habilitacion.
      const sede = await bloquearSedeExclusiva(tx, sedeId);
      const cuenta = await tx.$queryRaw<{ estado: EstadoOperador; activada: boolean }[]>`
        SELECT estado::text AS estado, password_hash IS NOT NULL AS activada
          FROM usuarios WHERE id = ${id}::uuid FOR UPDATE`;
      const actual = cuenta[0];
      if (!sede || !actual) return null;
      if (estado === 'suspendido' && actual.estado !== 'suspendido') {
        if (actual.estado === 'activo' && sede.habilitada) {
          const otros = await tx.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
             WHERE p.sede_id = ${sedeId}::uuid AND u.estado = 'activo' AND u.id <> ${id}::uuid`;
          if ((otros[0]?.n ?? 0) === 0) throw new ConflictoOrganizacionError('ULTIMO_OPERADOR_ACTIVO');
        }
        await tx.$executeRaw`UPDATE usuarios SET estado = 'suspendido', updated_at = now() WHERE id = ${id}::uuid`;
        await tx.$executeRaw`
          UPDATE sesiones SET revoked_at = ${ahora}::timestamptz
           WHERE usuario_id = ${id}::uuid AND revoked_at IS NULL`;
        // Una invitacion pendiente queda revocada: al reactivar hara falta reenviarla.
        await tx.$executeRaw`
          UPDATE tokens_cuenta SET invalidado_at = ${ahora}::timestamptz
           WHERE usuario_id = ${id}::uuid AND proposito = 'activacion'
             AND used_at IS NULL AND invalidado_at IS NULL`;
      } else if (estado === 'activo' && actual.estado === 'suspendido') {
        const nuevo = actual.activada ? 'activo' : 'pendiente_activacion';
        await tx.$executeRaw`
          UPDATE usuarios SET estado = ${nuevo}::"EstadoUsuario", updated_at = now() WHERE id = ${id}::uuid`;
      }
      const filas = await tx.$queryRaw<FilaOperador[]>`
        SELECT u.id::text AS id, u.nombre, u.correo_normalizado AS correo, u.estado::text AS estado,
               p.sede_id::text AS "sedeId", p.es_demostracion AS "esDemostracion"
          FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
         WHERE u.id = ${id}::uuid`;
      return filas[0] ?? null;
    });
  }

  ambitoDeOperador(usuarioId: string): Promise<AmbitoOperador | null> {
    return this.ejecutar(async () => {
      const filas = await this.prisma.$queryRaw<{
        institucionId: TipoInstitucion; institucionNombre: string; sedeId: string; sedeNombre: string;
        habilitadaAtencion: boolean; distritos: string[]; categorias: string[];
      }[]>`
        SELECT i.id AS "institucionId", i.nombre AS "institucionNombre",
               s.id::text AS "sedeId", s.nombre AS "sedeNombre",
               s.habilitada_atencion AS "habilitadaAtencion",
               COALESCE((SELECT array_agg(c.distrito_id ORDER BY c.distrito_id)
                           FROM coberturas_sede c WHERE c.sede_id = s.id), '{}') AS distritos,
               COALESCE((SELECT array_agg(k.categoria_id ORDER BY k.categoria_id)
                           FROM competencias_sede k WHERE k.sede_id = s.id), '{}') AS categorias
          FROM usuarios u
          JOIN pertenencias_operador p ON p.usuario_id = u.id
          JOIN sedes s ON s.id = p.sede_id
          JOIN instituciones i ON i.id = s.institucion_id
         WHERE u.id = ${usuarioId}::uuid AND u.rol = 'operador' AND u.estado = 'activo'
           AND s.activa AND i.activa`;
      const f = filas[0];
      if (!f) return null;
      return {
        institucion: { id: f.institucionId, nombre: f.institucionNombre },
        sede: { id: f.sedeId, nombre: f.sedeNombre },
        distritos: f.distritos,
        categorias: f.categorias,
        habilitadaAtencion: f.habilitadaAtencion,
      };
    });
  }

  sedesElegibles(institucion: TipoInstitucion, distritoId: string, categoriaId: string): Promise<string[]> {
    return this.ejecutar(async () => {
      const filas = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id::text AS id
          FROM sedes s
          JOIN instituciones i ON i.id = s.institucion_id AND i.activa
         WHERE s.institucion_id = ${institucion} AND s.activa AND s.habilitada_atencion
           AND EXISTS (SELECT 1 FROM coberturas_sede c WHERE c.sede_id = s.id AND c.distrito_id = ${distritoId})
           AND EXISTS (SELECT 1 FROM competencias_sede k WHERE k.sede_id = s.id AND k.categoria_id = ${categoriaId})
           AND EXISTS (SELECT 1 FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
                        WHERE p.sede_id = s.id AND u.rol = 'operador' AND u.estado = 'activo')
         ORDER BY s.id`;
      return filas.map((f) => f.id);
    });
  }

  estadoDesignacion(sedeId: string): Promise<EstadoDesignacion | null> {
    return this.ejecutar(async () => {
      const filas = await this.prisma.$queryRaw<{
        institucionId: TipoInstitucion; institucionActiva: boolean; sedeActiva: boolean;
        habilitadaAtencion: boolean; operadoresActivos: number;
      }[]>`
        SELECT s.institucion_id AS "institucionId", i.activa AS "institucionActiva", s.activa AS "sedeActiva",
               s.habilitada_atencion AS "habilitadaAtencion",
               (SELECT count(*)::int FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
                 WHERE p.sede_id = s.id AND u.rol = 'operador' AND u.estado = 'activo') AS "operadoresActivos"
          FROM sedes s JOIN instituciones i ON i.id = s.institucion_id
         WHERE s.id = ${sedeId}::uuid`;
      return filas[0] ?? null;
    });
  }
}
