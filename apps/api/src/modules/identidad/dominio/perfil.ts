import type { CambiosPerfilValidos, ErroresPorCampo, Resultado } from './validacion';

/** Parte editable del perfil tal como esta guardada. */
export interface EstadoPerfil {
  readonly nombre: string;
  readonly telefono: string | null;
  /** Fecha de la autorizacion de compartir el telefono; nulo si no esta autorizado. */
  readonly consentidoAt: Date | null;
}

/**
 * Reglas del perfil (puras). La autorizacion de compartir el telefono:
 * - exige un telefono registrado;
 * - se revoca al borrar el telefono y al cambiarlo, salvo que la misma solicitud la otorgue;
 * - revocarla no borra el numero.
 */
export function resolverPerfil(
  actual: EstadoPerfil,
  cambios: CambiosPerfilValidos,
  ahora: Date,
): Resultado<EstadoPerfil> {
  const nombre = cambios.nombre ?? actual.nombre;
  const telefono = cambios.telefono !== undefined ? cambios.telefono : actual.telefono;
  const telefonoCambio = telefono !== actual.telefono;
  const mantiene = actual.consentidoAt !== null && !telefonoCambio;
  const autorizado = cambios.compartirTelefono ?? mantiene;

  if (autorizado && telefono === null) {
    const campos: ErroresPorCampo = {
      compartirTelefono: 'Registra un teléfono antes de autorizar compartirlo.',
    };
    return { ok: false, campos };
  }
  const consentidoAt = !autorizado ? null : mantiene && actual.consentidoAt ? actual.consentidoAt : ahora;
  return { ok: true, valor: { nombre, telefono, consentidoAt } };
}
