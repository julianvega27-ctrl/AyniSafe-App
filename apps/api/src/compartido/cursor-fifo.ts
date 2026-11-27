/**
 * Cursor opaco de listas en orden de llegada (P4.2): base64url de [instante ISO, id]. Lo comparten
 * la lista de pendientes del administrador (Operaciones) y la bandeja del operador (Consultas).
 */
export interface CursorFifo {
  readonly instante: Date;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function codificarCursorFifo(c: CursorFifo): string {
  return Buffer.from(JSON.stringify([c.instante.toISOString(), c.id]), 'utf8').toString('base64url');
}

/** Null si el cursor no es valido (el llamador responde 400). */
export function decodificarCursorFifo(texto: unknown): CursorFifo | null {
  if (typeof texto !== 'string' || texto.length > 200 || !/^[A-Za-z0-9_-]+$/.test(texto)) return null;
  try {
    const valor: unknown = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));
    if (!Array.isArray(valor) || valor.length !== 2) return null;
    const [instante, id] = valor as unknown[];
    if (typeof instante !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
    const fecha = new Date(instante);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString() !== instante) return null;
    return { instante: fecha, id };
  } catch {
    return null;
  }
}
