import type { PublicadorEventos } from '../../../compartido/eventos/eventos';
import type { UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  contenidoCanonico,
  normalizarCodigo,
  validarClaveIdempotencia,
  validarEnvio,
  type Modalidad,
} from '../dominio/envio';
import type { ConsultarCategorias } from './categorias.use-case';
import {
  ClaveDuplicadaError,
  type EnviosRepositorio,
  type IncidenteCreado,
  type IncidentesPort,
  type LimitadorEnviosPort,
  type SolicitudPrevia,
  type TerritorioEnvio,
  type TerritorioPort,
} from './puertos/registro.port';
import type { SecretosPort } from './puertos/secretos.port';
import type { EvaluacionesRepositorio } from './puertos/evaluacion.port';
import { CATEGORIAS_CON_EVALUACION, instantaneaInicial, samuRequerido } from '../dominio/evaluacion';

/** Falta la cabecera Idempotency-Key o no es un UUID. */
export class ClaveIdempotenciaRequeridaError extends Error {
  constructor() {
    super('Idempotency-Key requerida');
    this.name = 'ClaveIdempotenciaRequeridaError';
  }
}

/** La clave ya se uso con otro contenido. */
export class ConflictoIdempotenciaError extends Error {
  constructor() {
    super('Clave reutilizada con otro contenido');
    this.name = 'ConflictoIdempotenciaError';
  }
}

export class LimiteEnviosError extends Error {
  constructor(readonly reintentarEnSegundos: number) {
    super('Limite de envios superado');
    this.name = 'LimiteEnviosError';
  }
}

/** Fallo de almacenamiento o de un modulo dependiente: el envio no se registro (503, reintentable). */
export class RegistroNoDisponibleError extends Error {
  constructor(readonly causa?: unknown) {
    super('Registro no disponible');
    this.name = 'RegistroNoDisponibleError';
  }
}

export type SolicitanteEnvio =
  | { readonly modalidad: 'cuenta'; readonly usuarioId: string }
  | { readonly modalidad: 'invitado'; readonly origenRed: string };

export interface Comprobante {
  readonly referencia: string;
  readonly estado: string;
  readonly recibidoEn: Date;
  readonly modalidad: Modalidad;
  readonly territorio: TerritorioEnvio;
  readonly nombreDistrito: string | null;
  /** Solo invitado: se muestra una unica vez y nunca se guarda en claro. */
  readonly codigoSeguimiento: string | null;
}

export interface ResultadoRegistro {
  /** false cuando es la repeticion idempotente de un envio ya registrado. */
  readonly nuevo: boolean;
  readonly comprobante: Comprobante;
}

export interface DependenciasRegistro {
  readonly categorias: Pick<ConsultarCategorias, 'idsActivos'>;
  readonly envios: EnviosRepositorio;
  /** Version 1 de la evaluacion en la transaccion del registro (P5.1). */
  readonly evaluaciones: Pick<EvaluacionesRepositorio, 'crear'>;
  readonly incidentes: IncidentesPort;
  readonly territorio: TerritorioPort;
  readonly limitador: LimitadorEnviosPort;
  readonly secretos: SecretosPort;
  readonly eventos: PublicadorEventos;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly ahora: () => Date;
  /** Despierta el procesador de entregas tras confirmar el registro. */
  readonly despertarEntregas: () => void;
  readonly limiteInvitado?: { readonly maximo: number; readonly ventanaMs: number };
}

const LIMITE_INVITADO_POR_DEFECTO = { maximo: 10, ventanaMs: 60 * 60 * 1000 };

/**
 * Registro del envio ciudadano (design §3). Crea en una sola transaccion el incidente (Operaciones),
 * la clave de idempotencia, los originales y la version 1 de la evaluacion (Reportes) y el evento
 * IncidenteRegistrado. No espera a
 * consumidores ni a avisos: tras el commit solo despierta el procesador de entregas.
 */
export class RegistrarIncidenteUseCase {
  private readonly limiteInvitado: { readonly maximo: number; readonly ventanaMs: number };

  constructor(private readonly d: DependenciasRegistro) {
    this.limiteInvitado = d.limiteInvitado ?? LIMITE_INVITADO_POR_DEFECTO;
  }

  async ejecutar(solicitante: SolicitanteEnvio, claveCruda: unknown, cuerpo: unknown): Promise<ResultadoRegistro> {
    const clave = validarClaveIdempotencia(claveCruda);
    if (!clave) throw new ClaveIdempotenciaRequeridaError();
    const ahora = this.d.ahora();
    const categorias = await this.protegido(() => this.d.categorias.idsActivos());
    const envio = validarEnvio(cuerpo, solicitante.modalidad, categorias, ahora);
    const huella = this.d.secretos.huellaContenido(contenidoCanonico(solicitante.modalidad, envio));
    const ambito = solicitante.modalidad === 'cuenta' ? `cuenta:${solicitante.usuarioId}` : 'invitado';

    // La repeticion se resuelve antes del limite: un reintento de un envio ya creado no se bloquea.
    const previa = await this.protegido(() => this.d.envios.buscarSolicitud(ambito, clave));
    if (previa) return this.repetir(previa, huella);

    if (solicitante.modalidad === 'invitado') {
      const r = await this.protegido(() =>
        this.d.limitador.consumir(
          [{ tipo: 'incidente_invitado_ip', identificador: solicitante.origenRed, ...this.limiteInvitado }],
          ahora,
        ),
      );
      if (!r.permitido) throw new LimiteEnviosError(r.reintentarEnSegundos);
    }

    const territorio = await this.protegido(() => this.d.territorio.resolver(envio.punto.latitud, envio.punto.longitud));
    const codigo = solicitante.modalidad === 'invitado' ? this.d.secretos.nuevoCodigo() : null;

    let incidente: IncidenteCreado;
    try {
      incidente = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
        const creado = await this.d.incidentes.crear(tx);
        await this.d.envios.insertarSolicitud(tx, ambito, clave, huella, creado.id);
        await this.d.envios.insertarEnvio(tx, {
          incidenteId: creado.id,
          modalidad: solicitante.modalidad,
          autorUsuarioId: solicitante.modalidad === 'cuenta' ? solicitante.usuarioId : null,
          envio,
          territorio,
          codigoHuella: codigo ? this.d.secretos.huellaCodigo(creado.id, normalizarCodigo(codigo)!) : null,
          recibidoEn: creado.registradoEn,
        });
        if (CATEGORIAS_CON_EVALUACION.has(envio.categoriaId)) {
          await this.d.evaluaciones.crear(tx, {
            incidenteId: creado.id,
            instantanea: instantaneaInicial(envio.heridos, envio.atencionMedica, envio.evaluacion),
            samuRequerido: samuRequerido(envio.categoriaId, envio.heridos, envio.atencionMedica),
            actorUsuarioId: solicitante.modalidad === 'cuenta' ? solicitante.usuarioId : null,
            creadaEn: creado.registradoEn,
          });
        }
        await this.d.eventos.publicar(tx, {
          tipo: 'IncidenteRegistrado',
          version: 1,
          agregadoId: creado.id,
          carga: { incidenteId: creado.id, modalidad: solicitante.modalidad },
        });
        return creado;
      });
    } catch (e) {
      // Otra solicitud con la misma clave confirmo primero: se resuelve como repeticion.
      if (e instanceof ClaveDuplicadaError) {
        const ganadora = await this.protegido(() => this.d.envios.buscarSolicitud(ambito, clave));
        if (ganadora) return this.repetir(ganadora, huella);
      }
      throw new RegistroNoDisponibleError(e);
    }
    this.d.despertarEntregas();
    return {
      nuevo: true,
      comprobante: {
        referencia: incidente.referencia,
        estado: incidente.estado,
        recibidoEn: incidente.registradoEn,
        modalidad: solicitante.modalidad,
        territorio,
        nombreDistrito: territorio.distritoId ? this.d.territorio.nombreDistrito(territorio.distritoId) : null,
        codigoSeguimiento: codigo,
      },
    };
  }

  /** Repeticion idempotente: mismo incidente; el invitado recibe un codigo nuevo que invalida el anterior. */
  private async repetir(previa: SolicitudPrevia, huella: string): Promise<ResultadoRegistro> {
    if (!this.d.secretos.iguales(previa.huellaContenido, huella)) throw new ConflictoIdempotenciaError();
    const [guardado, estados] = await this.protegido(() =>
      Promise.all([this.d.envios.leerEnvio(previa.incidenteId), this.d.incidentes.estados([previa.incidenteId])]),
    );
    const estado = estados.get(previa.incidenteId);
    if (!guardado || !estado) throw new RegistroNoDisponibleError();
    let codigo: string | null = null;
    if (guardado.modalidad === 'invitado') {
      codigo = this.d.secretos.nuevoCodigo();
      const huellaCodigo = this.d.secretos.huellaCodigo(previa.incidenteId, normalizarCodigo(codigo)!);
      await this.protegido(() => this.d.envios.rotarCodigo(previa.incidenteId, huellaCodigo, this.d.ahora()));
    }
    return {
      nuevo: false,
      comprobante: {
        referencia: estado.referencia,
        estado: estado.estado,
        recibidoEn: estado.registradoEn,
        modalidad: guardado.modalidad,
        territorio: guardado.territorio,
        nombreDistrito: guardado.territorio.distritoId ? this.d.territorio.nombreDistrito(guardado.territorio.distritoId) : null,
        codigoSeguimiento: codigo,
      },
    };
  }

  private async protegido<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new RegistroNoDisponibleError(e);
    }
  }
}
