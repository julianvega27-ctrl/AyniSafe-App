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
