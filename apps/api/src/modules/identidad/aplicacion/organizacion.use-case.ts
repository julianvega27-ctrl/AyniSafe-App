import { ServicioNoDisponibleError, ValidacionError } from '../dominio/errores';
import {
  ConflictoOrganizacionError,
  CorreoOperadorEnUsoError,
  normalizarNombreSede,
  RecursoNoEncontradoError,
  requisitosDesignacion,
  type RequisitoDesignacion,
  SedeExistenteError,
  TIPOS_INSTITUCION,
  type AmbitoOperador,
  type Institucion,
  type OperadorSede,
  type Sede,
  type TipoInstitucion,
} from '../dominio/organizacion';
import type { ErroresPorCampo, Resultado } from '../dominio/validacion';
import {
  esUuid,
  validarAltaOperador,
  validarAltaSede,
  validarCambioOperador,
  validarCambiosInstitucion,
  validarCambiosSede,
  validarConjunto,
} from '../dominio/validacion-organizacion';
import type { InvitarCuentaUseCase } from './invitar-cuenta.use-case';
import type { CatalogoIdsPort, OperadorAtencionVista, OrganizacionPort } from './puertos/organizacion.port';
import type { RelojPort } from './puertos/reloj.port';

function exigir<T>(r: Resultado<T>): T {
  if (!r.ok) throw new ValidacionError(r.campos);
  return r.valor;
}

function exigirEncontrado<T>(valor: T | null): T {
  if (valor === null) throw new RecursoNoEncontradoError();
  return valor;
}

function idDeRecurso(id: string): string {
  if (!esUuid(id)) throw new RecursoNoEncontradoError();
  return id.toLowerCase();
}

function idDeInstitucion(id: string): TipoInstitucion {
  if (!(TIPOS_INSTITUCION as readonly string[]).includes(id)) throw new RecursoNoEncontradoError();
  return id as TipoInstitucion;
}

/** Comprueba que cada ID exista en el catalogo del modulo propietario; si no, 400 sin cambios. */
async function exigirEnCatalogo(
  catalogo: CatalogoIdsPort,
  ids: readonly string[],
  campo: string,
  mensaje: string,
): Promise<void> {
  if (ids.length === 0) return;
  let validos: ReadonlySet<string>;
  try {
    validos = await catalogo.idsValidos();
  } catch (error) {
    throw new ServicioNoDisponibleError(error);
  }
  if (ids.some((id) => !validos.has(id))) {
    const campos: ErroresPorCampo = { [campo]: mensaje };
    throw new ValidacionError(campos);
  }
}

/**
 * Alta atomica de sede con su operador inicial (RF29, EQ-12). Sede, cuenta pendiente, pertenencia
 * e invitacion se confirman juntas o no queda nada. El correo se entrega despues del commit.
 */
export class CrearSedeConOperadorUseCase {
  constructor(
    private readonly organizacion: OrganizacionPort,
    private readonly invitar: InvitarCuentaUseCase,
    private readonly distritos: CatalogoIdsPort,
    private readonly despertarEnvios: () => void,
  ) {}

  async ejecutar(cuerpo: unknown, administradorId: string): Promise<{ sede: Sede; operador: OperadorSede }> {
    const alta = exigir(validarAltaSede(cuerpo));
    if (alta.distritoUbicacionId) {
      await exigirEnCatalogo(this.distritos, [alta.distritoUbicacionId], 'distritoUbicacionId', 'Indica un distrito del catálogo.');
    }
    const { sedeId, operadorId } = await this.organizacion.enTransaccion(async (tx) => {
      if (!(await tx.bloquearInstitucionActiva(alta.institucionId))) {
        throw new ValidacionError({ institucionId: 'La institución está inactiva.' });
      }
      const nuevaSede = await tx.insertarSede({
        institucionId: alta.institucionId,
        nombre: alta.nombre,
        nombreNormalizado: normalizarNombreSede(alta.nombre),
        distritoUbicacionId: alta.distritoUbicacionId,
        direccion: alta.direccion,
        contacto: alta.contacto,
        esDemostracion: alta.esDemostracion,
        creadoPor: administradorId,
      });
      if (nuevaSede === null) throw new SedeExistenteError();
      const nuevoOperador = await tx.insertarOperadorPendiente({
        nombre: alta.operador.nombre,
        correoNormalizado: alta.operador.correoNormalizado,
        sedeId: nuevaSede,
        esDemostracion: alta.esDemostracion,
      });
      if (nuevoOperador === null) throw new CorreoOperadorEnUsoError();
      await this.invitar.ejecutar(nuevoOperador, tx.contexto);
      return { sedeId: nuevaSede, operadorId: nuevoOperador };
    });
    this.despertarEnvios();
    const sede = exigirEncontrado(await this.organizacion.obtenerSede(sedeId));
    return {
      sede,
      operador: {
        id: operadorId,
        nombre: alta.operador.nombre,
        correo: alta.operador.correoNormalizado,
        estado: 'pendiente_activacion',
        sedeId,
        esDemostracion: alta.esDemostracion,
      },
    };
  }
}

/** Operador adicional en una sede existente: cuenta pendiente, pertenencia e invitacion atomicas. */
export class AgregarOperadorUseCase {
  constructor(
    private readonly organizacion: OrganizacionPort,
    private readonly invitar: InvitarCuentaUseCase,
    private readonly despertarEnvios: () => void,
  ) {}

  async ejecutar(sedeIdCrudo: string, cuerpo: unknown): Promise<OperadorSede> {
    const sedeId = idDeRecurso(sedeIdCrudo);
    const alta = exigir(validarAltaOperador(cuerpo));
    const id = await this.organizacion.enTransaccion(async (tx) => {
      if (!(await tx.bloquearSede(sedeId))) throw new RecursoNoEncontradoError();
      const nuevo = await tx.insertarOperadorPendiente({
        nombre: alta.nombre,
        correoNormalizado: alta.correoNormalizado,
        sedeId,
        esDemostracion: alta.esDemostracion,
      });
      if (nuevo === null) throw new CorreoOperadorEnUsoError();
      await this.invitar.ejecutar(nuevo, tx.contexto);
      return nuevo;
    });
    this.despertarEnvios();
    return {
      id,
      nombre: alta.nombre,
      correo: alta.correoNormalizado,
      estado: 'pendiente_activacion',
      sedeId,
      esDemostracion: alta.esDemostracion,
    };
  }
}

/** Reenvio de la invitacion de un operador pendiente: invalida el enlace anterior y encola otro. */
export class ReenviarInvitacionUseCase {
  constructor(
    private readonly organizacion: OrganizacionPort,
    private readonly invitar: InvitarCuentaUseCase,
    private readonly despertarEnvios: () => void,
  ) {}

  async ejecutar(operadorIdCrudo: string): Promise<void> {
    const operadorId = idDeRecurso(operadorIdCrudo);
    await this.organizacion.enTransaccion(async (tx) => {
      const estado = await tx.prepararReenvio(operadorId);
      if (estado === null) throw new RecursoNoEncontradoError();
      if (estado !== 'pendiente_activacion') throw new ConflictoOrganizacionError('INVITACION_NO_APLICABLE');
      // Si ya hay un envio activo, `encolar` no lo duplica: ese envio generara el enlace nuevo.
      await this.invitar.ejecutar(operadorId, tx.contexto);
    });
    this.despertarEnvios();
  }
}

/** Lectura y mantenimiento de instituciones, sedes, coberturas, competencias y operadores. */
export class AdministrarOrganizacionUseCase {
  constructor(
    private readonly organizacion: OrganizacionPort,
    private readonly distritos: CatalogoIdsPort,
    private readonly categorias: CatalogoIdsPort,
    private readonly reloj: RelojPort,
  ) {}

  listarInstituciones(): Promise<Institucion[]> {
    return this.organizacion.listarInstituciones();
  }

  async actualizarInstitucion(id: string, cuerpo: unknown): Promise<Institucion> {
    const institucion = idDeInstitucion(id);
    const cambios = exigir(validarCambiosInstitucion(cuerpo));
    return exigirEncontrado(await this.organizacion.actualizarInstitucion(institucion, cambios));
  }

  listarSedes(): Promise<Sede[]> {
    return this.organizacion.listarSedes();
  }

  async actualizarSede(id: string, cuerpo: unknown): Promise<Sede> {
    const sedeId = idDeRecurso(id);
    const cambios = exigir(validarCambiosSede(cuerpo));
    if (cambios.distritoUbicacionId) {
      await exigirEnCatalogo(this.distritos, [cambios.distritoUbicacionId], 'distritoUbicacionId', 'Indica un distrito del catálogo.');
    }
    return exigirEncontrado(await this.organizacion.actualizarSede(sedeId, cambios));
  }

  async reemplazarCobertura(id: string, cuerpo: unknown): Promise<Sede> {
    const sedeId = idDeRecurso(id);
    const distritos = exigir(validarConjunto(cuerpo, 'distritos'));
    await exigirEnCatalogo(this.distritos, distritos, 'distritos', 'Contiene distritos que no están en el catálogo.');
    return exigirEncontrado(await this.organizacion.reemplazarCobertura(sedeId, distritos));
  }

  async reemplazarCompetencias(id: string, cuerpo: unknown): Promise<Sede> {
    const sedeId = idDeRecurso(id);
    const categorias = exigir(validarConjunto(cuerpo, 'categorias'));
    await exigirEnCatalogo(this.categorias, categorias, 'categorias', 'Contiene categorías que no están en el catálogo.');
    return exigirEncontrado(await this.organizacion.reemplazarCompetencias(sedeId, categorias));
  }

  async habilitar(id: string): Promise<Sede> {
    return exigirEncontrado(await this.organizacion.habilitar(idDeRecurso(id)));
  }

  async deshabilitar(id: string): Promise<Sede> {
    return exigirEncontrado(await this.organizacion.deshabilitar(idDeRecurso(id)));
  }

  async listarOperadores(sedeId: string): Promise<OperadorSede[]> {
    return exigirEncontrado(await this.organizacion.listarOperadores(idDeRecurso(sedeId)));
  }

  async cambiarEstadoOperador(id: string, cuerpo: unknown): Promise<OperadorSede> {
    const operadorId = idDeRecurso(id);
    const { estado } = exigir(validarCambioOperador(cuerpo));
    return exigirEncontrado(await this.organizacion.cambiarEstadoOperador(operadorId, estado, this.reloj.ahora()));
  }
}

/**
 * Contrato interno de ambito del operador para P4/P6. Se lee en cada llamada (sin cache): un cambio
 * de cobertura se refleja en la siguiente consulta.
 */
export class ConsultarAmbitoOperadorUseCase {
  constructor(private readonly organizacion: OrganizacionPort) {}

  ejecutar(usuarioId: string): Promise<AmbitoOperador | null> {
    return this.organizacion.ambitoDeOperador(usuarioId);
  }
}

/**
 * Contrato interno de sedes para el enrutamiento de Operaciones (P4.2). Lee siempre la configuracion
 * vigente, sin cache.
 */
export class SedesEnrutamientoUseCase {
  constructor(private readonly organizacion: OrganizacionPort) {}

  /** Sedes elegibles; vacio si la institucion no es una de las cuatro admitidas. */
  elegibles(institucion: string, distritoId: string, categoriaId: string): Promise<string[]> {
    if (!esTipoInstitucion(institucion)) return Promise.resolve([]);
    return this.organizacion.sedesElegibles(institucion, distritoId, categoriaId);
  }

  /** Requisitos incumplidos para designar la sede a la institucion; vacio si es designable. */
  async designable(sedeId: string, institucion: string): Promise<RequisitoDesignacion[]> {
    if (!esTipoInstitucion(institucion)) return ['misma_institucion'];
    if (!esUuid(sedeId)) return ['sede_existente'];
    return requisitosDesignacion(await this.organizacion.estadoDesignacion(sedeId), institucion);
  }

  /** Nombres visibles de las instituciones (para el seguimiento ciudadano). */
  async nombresInstituciones(): Promise<ReadonlyMap<string, string>> {
    return new Map((await this.organizacion.listarInstituciones()).map((i) => [i.id, i.nombre]));
  }
}

/**
 * Contrato interno de operadores para la atencion de Operaciones (P6): descripcion por id y
 * operadores de sedes participantes. Sin correo ni telefono.
 */
export class OperadoresAtencionUseCase {
  constructor(private readonly organizacion: OrganizacionPort) {}

  async describir(ids: readonly string[]): Promise<ReadonlyMap<string, OperadorAtencionVista>> {
    const validos = [...new Set(ids)].filter(esUuid);
    return new Map((await this.organizacion.describirOperadores(validos)).map((o) => [o.usuarioId, o]));
  }

  deSedes(sedeIds: readonly string[]): Promise<OperadorAtencionVista[]> {
    return this.organizacion.operadoresDeSedes([...new Set(sedeIds)].filter(esUuid));
  }
}

function esTipoInstitucion(valor: string): valor is TipoInstitucion {
  return (TIPOS_INSTITUCION as readonly string[]).includes(valor);
}
