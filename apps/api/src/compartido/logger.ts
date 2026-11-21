/**
 * Registro estructurado con lista cerrada de campos. Solo se aceptan metadatos genericos
 * (identificador de solicitud, ruta, estado, duracion, nombre de error). Nunca cuerpos,
 * cabeceras, tokens, contrasenas, correos ni IP.
 */
export interface EventoLog {
  readonly evento: 'solicitud' | 'error_interno' | 'purga' | 'arranque';
  readonly requestId?: string;
  readonly metodo?: string;
  readonly ruta?: string;
  readonly estado?: number;
  readonly duracionMs?: number;
  readonly resultado?: string;
  /** Solo el nombre (o codigo) del error, nunca su mensaje ni su pila. */
  readonly error?: string;
  readonly detalle?: Readonly<Record<string, number | string>>;
}

export interface Logger {
  registrar(evento: EventoLog): void;
}

export class LoggerConsola implements Logger {
  registrar(evento: EventoLog): void {
    console.log(JSON.stringify({ t: new Date().toISOString(), ...evento }));
  }
}

/** Logger que descarta todo: para pruebas que no verifican la salida. */
export class LoggerSilencioso implements Logger {
  registrar(): void {
    /* sin salida */
  }
}
