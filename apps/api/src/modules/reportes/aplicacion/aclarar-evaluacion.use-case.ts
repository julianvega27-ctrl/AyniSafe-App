import type { PublicadorEventos } from '../../../compartido/eventos/eventos';
import type { UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  aplicarCambios,
  validarAclaracion,
  ValidacionEvaluacionError,
  type Instantanea,
  type OrigenVersion,
} from '../dominio/evaluacion';
import type { CondicionMedicaPort, EvaluacionesRepositorio } from './puertos/evaluacion.port';
import type { IncidentesPort } from './puertos/registro.port';

export const EVENTO_EVALUACION_ACTUALIZADA = 'EvaluacionActualizada';
/** Estado operativo en que la evaluacion ya no admite aclaraciones. */
const ESTADO_CERRADO = 'CERRADO';

/** Incidente inexistente o sin evaluacion: la ruta responde 404 uniforme. */
export class EvaluacionNoEncontradaError extends Error {
  constructor() {
    super('Evaluacion no encontrada');
    this.name = 'EvaluacionNoEncontradaError';
  }
}

export class EvaluacionCerradaError extends Error {
  constructor() {
    super('El incidente esta cerrado');
    this.name = 'EvaluacionCerradaError';
  }
}

/** Fallo de almacenamiento o del recalculo: nada se confirmo (503, reintentable). */
export class AclaracionNoDisponibleError extends Error {
  constructor(readonly causa?: unknown) {
    super('Aclaracion no disponible');
    this.name = 'AclaracionNoDisponibleError';
  }
}

export interface AutorAclaracionCompleto {
  readonly origen: OrigenVersion;
  /** Institucion del operador; null para el ciudadano. */
  readonly institucion: string | null;
  readonly usuarioId: string;
}

export interface ResultadoAclaracion {
  /** false si la aclaracion coincidia con la vigente (sin version nueva). */
  readonly nueva: boolean;
  readonly version: number;
  readonly instantanea: Instantanea;
  readonly samuIncorporado: boolean;
}

export interface DependenciasAclaracion {
  readonly evaluaciones: EvaluacionesRepositorio;
  readonly incidentes: Pick<IncidentesPort, 'estados'>;
  readonly condicion: CondicionMedicaPort;
  readonly eventos: PublicadorEventos;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly despertarEntregas: () => void;
}

/**
 * Aclaracion de la evaluacion por el autor o un operador (design, decision 5). En una transaccion:
 * bloquea la cabecera, crea la version si hay cambios, publica EvaluacionActualizada y recalcula el
 * enrutamiento en Operaciones. Orden de bloqueos: evaluacion y despues enrutamiento.
 */
export class AclararEvaluacion {
  constructor(private readonly d: DependenciasAclaracion) {}

  async ejecutar(incidenteId: string, autor: AutorAclaracionCompleto, entrada: unknown): Promise<ResultadoAclaracion> {
    const estado = (await this.protegido(() => this.d.incidentes.estados([incidenteId]))).get(incidenteId);
    if (!estado) throw new EvaluacionNoEncontradaError();
    if (estado.estado === ESTADO_CERRADO) throw new EvaluacionCerradaError();

    let resultado: ResultadoAclaracion;
    try {
      resultado = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
        const actual = await this.d.evaluaciones.bloquear(tx, incidenteId);
        if (!actual) throw new EvaluacionNoEncontradaError();
        const { cambios, motivo } = validarAclaracion(entrada, actual.categoriaId, autor);
        const r = aplicarCambios(actual.instantanea, cambios, actual.categoriaId, actual.samuRequerido);
        if (r.modificados.length === 0) {
          return { nueva: false, version: actual.versionVigente, instantanea: actual.instantanea, samuIncorporado: false };
        }
        const version = actual.versionVigente + 1;
        await this.d.evaluaciones.agregarVersion(tx, {
          incidenteId,
          version,
          instantanea: r.instantanea,
          samuRequerido: r.samuRequerido,
          origen: autor.origen,
          actorUsuarioId: autor.usuarioId,
          institucion: autor.origen === 'operador' ? autor.institucion : null,
          modificados: r.modificados,
          motivo,
        });
        await this.d.eventos.publicar(tx, {
          tipo: EVENTO_EVALUACION_ACTUALIZADA,
          version: 1,
          agregadoId: incidenteId,
          carga: { incidenteId, version, origen: autor.origen },
        });
        const { samuIncorporado } = await this.d.condicion.aplicar(tx, {
          incidenteId,
          heridos: r.instantanea.heridos,
          atencionMedica: r.instantanea.atencionMedica,
          versionEvaluacion: version,
          actor: { tipo: autor.origen, usuarioId: autor.usuarioId },
        });
        return { nueva: true, version, instantanea: r.instantanea, samuIncorporado };
      });
    } catch (e) {
      if (e instanceof ValidacionEvaluacionError || e instanceof EvaluacionNoEncontradaError) throw e;
      throw new AclaracionNoDisponibleError(e);
    }
    if (resultado.nueva) this.d.despertarEntregas();
    return resultado;
  }

  private async protegido<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new AclaracionNoDisponibleError(e);
    }
  }
}
