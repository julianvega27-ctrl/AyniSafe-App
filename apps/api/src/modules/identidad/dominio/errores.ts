import type { ErroresPorCampo } from './validacion';

/** El correo normalizado ya pertenece a otra cuenta. */
export class CorreoEnUsoError extends Error {
  constructor() {
    super('Correo ya registrado');
    this.name = 'CorreoEnUsoError';
  }
}

/**
 * Fallo de almacenamiento o de una dependencia interna. El detalle original se conserva solo
 * en `causa` para registro interno; nunca debe llegar a una respuesta.
 */
export class ServicioNoDisponibleError extends Error {
  constructor(readonly causa?: unknown) {
    super('Servicio no disponible');
    this.name = 'ServicioNoDisponibleError';
  }
}

/** Entrada invalida. `campos` nunca contiene los valores enviados. */
export class ValidacionError extends Error {
  constructor(readonly campos: ErroresPorCampo) {
    super('Datos invalidos');
    this.name = 'ValidacionError';
  }
}

/** Mismo error para correo desconocido, contrasena incorrecta, suspension o rol no ciudadano. */
export class CredencialesInvalidasError extends Error {
  constructor() {
    super('Correo o contrasena incorrectos');
    this.name = 'CredencialesInvalidasError';
  }
}

/** Token ausente, invalido, vencido, revocado o de una cuenta no habilitada. */
export class NoAutenticadoError extends Error {
  constructor() {
    super('No autenticado');
    this.name = 'NoAutenticadoError';
  }
}

/** Limite de intentos superado. */
export class LimiteExcedidoError extends Error {
  constructor(readonly reintentarEnSegundos: number) {
    super('Limite de solicitudes superado');
    this.name = 'LimiteExcedidoError';
  }
}

/** Token desconocido, alterado, de otro proposito o de una cuenta que ya no puede usarlo. */
export class TokenInvalidoError extends Error {
  constructor() {
    super('Token invalido');
    this.name = 'TokenInvalidoError';
  }
}

/** Token ya consumido o invalidado por uno posterior. */
export class TokenUsadoError extends Error {
  constructor() {
    super('Token usado');
    this.name = 'TokenUsadoError';
  }
}

/** Token cuyo plazo de vigencia termino. */
export class TokenVencidoError extends Error {
  constructor() {
    super('Token vencido');
    this.name = 'TokenVencidoError';
  }
}

/**
 * Se agoto el tope diario de correos. Es un estado global del servicio, igual para toda solicitud
 * valida, exista o no la cuenta: por eso puede informarse sin filtrar informacion de cuentas.
 */
export class CuotaCorreoAgotadaError extends Error {
  constructor(readonly reintentarEnSegundos: number) {
    super('Cuota diaria de correo agotada');
    this.name = 'CuotaCorreoAgotadaError';
  }
}

export type CodigoFalloCorreo =
  | 'CONEXION'
  | 'TIEMPO_AGOTADO'
  | 'AUTENTICACION'
  | 'RECHAZADO'
  | 'CUOTA'
  | 'DESCONOCIDO';

/**
 * Fallo al entregar un correo al proveedor. Solo lleva un codigo generico: nunca el texto del
 * proveedor, el destinatario, el cuerpo ni credenciales.
 */
export class FalloEnvioCorreoError extends Error {
  constructor(readonly codigo: CodigoFalloCorreo) {
    super('Fallo al enviar el correo');
    this.name = 'FalloEnvioCorreoError';
  }
}
