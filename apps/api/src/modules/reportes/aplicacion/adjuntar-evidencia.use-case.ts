import type { UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  cabeEnCuota,
  dentroDePlazoCarga,
  nuevoPublicId,
  ranuraLibre,
  type CuotaLocal,
  type TipoMedio,
} from '../dominio/evidencia';
import { validarClaveIdempotencia } from '../dominio/envio';
import {
  CuotaProveedorError,
  type AlmacenEvidenciasPort,
  type EvidenciasRepositorio,
  type ProcesadorImagenPort,
} from './puertos/evidencias.port';
import type { IncidentesPort, LimitadorEnviosPort } from './puertos/registro.port';
import type { SecretosPort } from './puertos/secretos.port';
import { ClaveIdempotenciaRequeridaError, ConflictoIdempotenciaError, LimiteEnviosError } from './registrar-incidente.use-case';

/** Incidente ajeno, inexistente, fuera de plazo, cerrado o permiso invalido: el mismo 404. */
export class CargaNoAutorizadaError extends Error {
  constructor() {
    super('Incidente no disponible para cargas');
    this.name = 'CargaNoAutorizadaError';
  }
}

/** Ya hay tres fotos vigentes (409). */
export class LimiteFotosError extends Error {
  constructor() {
    super('Limite de fotografias alcanzado');
    this.name = 'LimiteFotosError';
  }
}

/** Almacen deshabilitado, sin cuota local o del proveedor, o fallo del proveedor (503). */
export class AlmacenNoDisponibleError extends Error {
  constructor(readonly motivo: 'deshabilitado' | 'cuota_local' | 'cuota_proveedor' | 'proveedor' | 'confirmacion' | 'en_curso') {
    super('Almacen de evidencias no disponible');
    this.name = 'AlmacenNoDisponibleError';
  }
}

export type SolicitanteCarga =
  | { readonly tipo: 'ciudadano'; readonly usuarioId: string }
  | { readonly tipo: 'invitado'; readonly permiso: string; readonly origenRed: string };

/** Resultado de autorizar antes de leer el archivo (para no procesar cargas ajenas). */
export interface CargaAutorizada {
  readonly incidenteId: string;
  readonly modalidad: 'cuenta' | 'invitado';
  readonly autorUsuarioId: string | null;
}

export interface EvidenciaAdjuntada {
  readonly id: string;
  readonly tipo: TipoMedio;
  readonly bytes: number;
  readonly adjuntadaEn: Date;
}

export interface ResultadoCarga {
  readonly nueva: boolean;
  readonly evidencia: EvidenciaAdjuntada;
}

export interface DependenciasCarga {
  readonly evidencias: EvidenciasRepositorio;
  /** null = almacen deshabilitado por configuracion. */
  readonly almacen: AlmacenEvidenciasPort | null;
  readonly procesador: ProcesadorImagenPort;
  readonly incidentes: Pick<IncidentesPort, 'estados'>;
  readonly idPorReferencia: (texto: string) => Promise<string | null>;
  readonly secretos: Pick<SecretosPort, 'huellaPermisoEvidencias' | 'iguales'>;
  readonly limitador: LimitadorEnviosPort;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly cuota: CuotaLocal;
  readonly ahora: () => Date;
  readonly nuevoId: () => string;
  readonly sha256: (bytes: Buffer) => string;
  readonly limiteInvitado?: { readonly maximo: number; readonly ventanaMs: number };
}

const LIMITE_INVITADO_POR_DEFECTO = { maximo: 20, ventanaMs: 60 * 60 * 1000 };

/**
 * Adjuntar una foto a un incidente ya registrado (P5.2; design, decisiones 1, 4 y 5). El public_id se
 * registra en la transaccion A antes de subir; la subida ocurre fuera de toda transaccion y la
 * transaccion B confirma. Cualquier resultado incierto deja la fila bloqueada para la limpieza.
 */
export class AdjuntarEvidenciaUseCase {
  private readonly limiteInvitado: { readonly maximo: number; readonly ventanaMs: number };

  constructor(private readonly d: DependenciasCarga) {
    this.limiteInvitado = d.limiteInvitado ?? LIMITE_INVITADO_POR_DEFECTO;
  }

  /** Paso previo a leer el cuerpo: identidad, plazo, estado, limite de invitado y almacen habilitado. */
  async autorizar(solicitante: SolicitanteCarga, referencia: string): Promise<CargaAutorizada> {
    const ahora = this.d.ahora();
    const incidenteId = await this.d.idPorReferencia(referencia);
    if (!incidenteId) throw new CargaNoAutorizadaError();
    const [autoria, estados] = await Promise.all([this.d.evidencias.autoria(incidenteId), this.d.incidentes.estados([incidenteId])]);
    const estado = estados.get(incidenteId);
    if (!autoria || !estado || estado.estado === 'CERRADO' || !dentroDePlazoCarga(estado.registradoEn, ahora)) {
      throw new CargaNoAutorizadaError();
    }
    if (solicitante.tipo === 'ciudadano') {
      if (autoria.modalidad !== 'cuenta' || autoria.autorUsuarioId !== solicitante.usuarioId) throw new CargaNoAutorizadaError();
    } else {
      // El limite se cuenta antes de verificar el permiso, como en el seguimiento por codigo.
      const r = await this.d.limitador.consumir(
        [{ tipo: 'carga_evidencia_ip', identificador: solicitante.origenRed, ...this.limiteInvitado }],
        ahora,
      );
      if (!r.permitido) throw new LimiteEnviosError(r.reintentarEnSegundos);
      const guardado = await this.d.evidencias.leer(incidenteId);
      const huella = this.d.secretos.huellaPermisoEvidencias(incidenteId, solicitante.permiso);
      if (autoria.modalidad !== 'invitado' || !guardado || guardado.venceEn.getTime() <= ahora.getTime() || !this.d.secretos.iguales(guardado.huella, huella)) {
        throw new CargaNoAutorizadaError();
      }
    }
    if (!this.d.almacen) throw new AlmacenNoDisponibleError('deshabilitado');
    return { incidenteId, modalidad: autoria.modalidad, autorUsuarioId: autoria.autorUsuarioId };
  }

  async adjuntar(carga: CargaAutorizada, claveCruda: unknown, archivo: { readonly bytes: Buffer; readonly tipoDeclarado: string }): Promise<ResultadoCarga> {
    const clave = validarClaveIdempotencia(claveCruda);
    if (!clave) throw new ClaveIdempotenciaRequeridaError();
    const almacen = this.d.almacen;
    if (!almacen) throw new AlmacenNoDisponibleError('deshabilitado');
    const huellaCarga = this.d.sha256(archivo.bytes);
    const foto = await this.d.procesador.normalizar(archivo.bytes, archivo.tipoDeclarado);
    const ahora = this.d.ahora();
    const id = this.d.nuevoId();
    const publicId = nuevoPublicId(this.d.nuevoId());

    // Transaccion A: serializa las cargas del incidente, resuelve la idempotencia y registra el public_id.
    const previa = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      await this.d.evidencias.bloquearIncidente(tx, carga.incidenteId);
      const existente = await this.d.evidencias.vigentePorClave(tx, carga.incidenteId, clave);
      if (existente) {
        if (existente.huellaCarga !== huellaCarga) throw new ConflictoIdempotenciaError();
        return existente;
      }
      const ranura = ranuraLibre(await this.d.evidencias.ranurasOcupadas(tx, carga.incidenteId));
      if (ranura === null) throw new LimiteFotosError();
      if (!cabeEnCuota(await this.d.evidencias.uso(tx), foto.bytes.length, this.d.cuota)) throw new AlmacenNoDisponibleError('cuota_local');
      await this.d.evidencias.insertarPendiente(tx, {
        id,
        incidenteId: carga.incidenteId,
        ranura,
        publicId,
        proveedor: almacen.proveedor,
        tipo: foto.tipo,
        bytes: foto.bytes.length,
        ancho: foto.ancho,
        alto: foto.alto,
        sha256: foto.sha256,
        huellaCarga,
        clave,
        modalidad: carga.modalidad,
        autorUsuarioId: carga.autorUsuarioId,
        creadaEn: ahora,
      });
      return null;
    });
    if (previa) {
      // Repeticion: la misma foto ya disponible, o aun en curso (reintentable).
      if (previa.estado !== 'disponible' || !previa.confirmadaEn) throw new AlmacenNoDisponibleError('en_curso');
      return { nueva: false, evidencia: { id: previa.id, tipo: previa.tipo, bytes: previa.bytes, adjuntadaEn: previa.confirmadaEn } };
    }

    try {
      await almacen.subir(publicId, foto.bytes, foto.tipo);
    } catch (e) {
      await this.d.evidencias.marcarEliminacion(id, 'fallo_carga', this.d.ahora()).catch(() => undefined);
      throw new AlmacenNoDisponibleError(e instanceof CuotaProveedorError ? 'cuota_proveedor' : 'proveedor');
    }

    // Transaccion B. Si falla, la fila queda pendiente y la limpieza la trata como huerfana.
    const confirmadaEn = this.d.ahora();
    let confirmada: boolean;
    try {
      confirmada = await this.d.evidencias.confirmar(id, confirmadaEn);
    } catch {
      throw new AlmacenNoDisponibleError('confirmacion');
    }
    if (!confirmada) throw new AlmacenNoDisponibleError('confirmacion');
    return { nueva: true, evidencia: { id, tipo: foto.tipo, bytes: foto.bytes.length, adjuntadaEn: confirmadaEn } };
  }
}
