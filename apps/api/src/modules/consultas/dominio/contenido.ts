/**
 * Contenido publico de AyniSafe y su validacion. Puro y sin dependencias: lo usan el arranque,
 * la ruta y las pruebas. Una seccion solo publica texto cuando esta aprobada; un contacto solo
 * se publica completo (institucion, numero, cobertura, fuente y fecha de verificacion).
 */
export type EstadoAprobacion = 'aprobado' | 'pendiente';

export interface Persona {
  readonly nombre: string;
  readonly rol: string;
}

export interface SeccionTexto {
  readonly titulo: string;
  readonly texto: string;
}

export interface ContactoEmergencia {
  readonly institucion: string;
  readonly numero: string;
  readonly cobertura: string;
  readonly fuente: string;
  /** Fecha (AAAA-MM-DD) en que se verifico el contacto. */
  readonly verificadoAt: string;
}

export interface ContenidoPublico {
  readonly version: number;
  readonly actualizadoAt: string;
  readonly app: { readonly estado: EstadoAprobacion; readonly finalidad?: string; readonly funcionamiento?: string };
  /** Alcance del piloto: pendiente y sin texto hasta que el equipo lo apruebe. */
  readonly piloto: { readonly estado: EstadoAprobacion; readonly texto?: string };
  readonly desarrolladores: { readonly estado: EstadoAprobacion; readonly personas?: readonly Persona[] };
  readonly privacidad: { readonly estado: EstadoAprobacion; readonly secciones?: readonly SeccionTexto[] };
  readonly contactos: { readonly estado: EstadoAprobacion; readonly items: readonly ContactoEmergencia[] };
}

export type ResultadoContenido =
  | { readonly ok: true; readonly contenido: ContenidoPublico }
  | { readonly ok: false; readonly errores: readonly string[] };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const NUMERO = /^\+?[0-9]{3,15}$/;

type Obj = Record<string, unknown>;

function esObjeto(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function textoNoVacio(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function fechaValida(v: unknown): v is string {
  return typeof v === 'string' && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

function claves(o: Obj, permitidas: readonly string[], donde: string, errores: string[]): void {
  for (const k of Object.keys(o)) if (!permitidas.includes(k)) errores.push(`${donde}: campo no admitido «${k}»`);
}

function estadoDe(o: Obj, donde: string, errores: string[]): EstadoAprobacion | undefined {
  if (o.estado === 'aprobado' || o.estado === 'pendiente') return o.estado;
  errores.push(`${donde}: estado debe ser «aprobado» o «pendiente»`);
  return undefined;
}

function lista(o: Obj, campo: string, donde: string, errores: string[]): unknown[] {
  const v = o[campo];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    errores.push(`${donde}.${campo}: debe ser una lista`);
    return [];
  }
  return v;
}

/** Valida la fuente completa. Devuelve todos los errores, sin lanzar. */
export function validarContenido(entrada: unknown): ResultadoContenido {
  const errores: string[] = [];
  if (!esObjeto(entrada)) return { ok: false, errores: ['el contenido debe ser un objeto'] };
  claves(entrada, ['version', 'actualizadoAt', 'app', 'piloto', 'desarrolladores', 'privacidad', 'contactos'], 'contenido', errores);

  if (!Number.isInteger(entrada.version) || (entrada.version as number) < 1) errores.push('version: entero >= 1 obligatorio');
  if (!fechaValida(entrada.actualizadoAt)) errores.push('actualizadoAt: fecha AAAA-MM-DD obligatoria');

  // app
  const app = entrada.app;
  if (!esObjeto(app)) errores.push('app: obligatoria');
  else {
    claves(app, ['estado', 'finalidad', 'funcionamiento'], 'app', errores);
    const estado = estadoDe(app, 'app', errores);
    const hayTexto = app.finalidad !== undefined || app.funcionamiento !== undefined;
    if (estado === 'aprobado' && !(textoNoVacio(app.finalidad) && textoNoVacio(app.funcionamiento))) {
      errores.push('app: aprobada exige finalidad y funcionamiento');
    }
    if (estado === 'pendiente' && hayTexto) errores.push('app: pendiente no lleva texto');
  }

  // piloto
  const piloto = entrada.piloto;
  if (!esObjeto(piloto)) errores.push('piloto: obligatoria');
  else {
    claves(piloto, ['estado', 'texto'], 'piloto', errores);
    const estado = estadoDe(piloto, 'piloto', errores);
    if (estado === 'aprobado' && !textoNoVacio(piloto.texto)) errores.push('piloto: aprobada exige texto');
    if (estado === 'pendiente' && piloto.texto !== undefined) errores.push('piloto: pendiente no lleva texto');
  }

  // desarrolladores
  const dev = entrada.desarrolladores;
  if (!esObjeto(dev)) errores.push('desarrolladores: obligatoria');
  else {
    claves(dev, ['estado', 'personas'], 'desarrolladores', errores);
    const estado = estadoDe(dev, 'desarrolladores', errores);
    const personas = lista(dev, 'personas', 'desarrolladores', errores);
    personas.forEach((p, i) => {
      if (!esObjeto(p) || !textoNoVacio(p.nombre) || !textoNoVacio(p.rol)) errores.push(`desarrolladores.personas[${i}]: exige nombre y rol`);
      else claves(p, ['nombre', 'rol'], `desarrolladores.personas[${i}]`, errores);
    });
    if (estado === 'aprobado' && personas.length === 0) errores.push('desarrolladores: aprobada exige al menos una persona');
    if (estado === 'pendiente' && personas.length > 0) errores.push('desarrolladores: pendiente no lleva personas');
  }

  // privacidad
  const priv = entrada.privacidad;
  if (!esObjeto(priv)) errores.push('privacidad: obligatoria');
  else {
    claves(priv, ['estado', 'secciones'], 'privacidad', errores);
    const estado = estadoDe(priv, 'privacidad', errores);
    const secciones = lista(priv, 'secciones', 'privacidad', errores);
    secciones.forEach((s, i) => {
      if (!esObjeto(s) || !textoNoVacio(s.titulo) || !textoNoVacio(s.texto)) errores.push(`privacidad.secciones[${i}]: exige titulo y texto`);
      else claves(s, ['titulo', 'texto'], `privacidad.secciones[${i}]`, errores);
    });
    if (estado === 'aprobado' && secciones.length === 0) errores.push('privacidad: aprobada exige al menos una seccion con texto');
    if (estado === 'pendiente' && secciones.length > 0) errores.push('privacidad: pendiente no lleva texto');
  }

  // contactos
  const con = entrada.contactos;
  if (!esObjeto(con)) errores.push('contactos: obligatoria');
  else {
    claves(con, ['estado', 'items'], 'contactos', errores);
    const estado = estadoDe(con, 'contactos', errores);
    if (!Array.isArray(con.items)) errores.push('contactos.items: debe ser una lista (vacia si no hay contactos aprobados)');
    const items = Array.isArray(con.items) ? con.items : [];
    items.forEach((c, i) => {
      const donde = `contactos.items[${i}]`;
      if (!esObjeto(c)) {
        errores.push(`${donde}: debe ser un objeto`);
        return;
      }
      claves(c, ['institucion', 'numero', 'cobertura', 'fuente', 'verificadoAt'], donde, errores);
      for (const campo of ['institucion', 'cobertura', 'fuente'] as const) {
        if (!textoNoVacio(c[campo])) errores.push(`${donde}: falta ${campo}`);
      }
      if (typeof c.numero !== 'string' || !NUMERO.test(c.numero)) errores.push(`${donde}: numero invalido`);
      if (!fechaValida(c.verificadoAt)) errores.push(`${donde}: falta la fecha de verificacion (AAAA-MM-DD)`);
    });
    if (estado === 'aprobado' && items.length === 0) errores.push('contactos: aprobado exige al menos un contacto');
    if (estado === 'pendiente' && items.length > 0) errores.push('contactos: pendiente no publica contactos');
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, contenido: entrada as unknown as ContenidoPublico };
}

/** Valida y devuelve el contenido, o lanza con todos los errores (sin datos sensibles). */
export function exigirContenidoValido(entrada: unknown): ContenidoPublico {
  const r = validarContenido(entrada);
  if (!r.ok) throw new Error(`Contenido publico invalido: ${r.errores.join('; ')}`);
  return r.contenido;
}
