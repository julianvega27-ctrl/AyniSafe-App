/**
 * Matriz de destinatarios del documento 09 §4 (P4.2). Reglas puras y versionadas: cada enrutamiento
 * guarda la version aplicada. Solo PNP, Bomberos, SAMU y Serenazgo. El apoyo local opcional de
 * Serenazgo («si esta habilitado») no se activa en la version 1 porque no existe su configuracion.
 */

export const INSTITUCIONES_DESTINO = ['pnp', 'bomberos', 'samu', 'serenazgo'] as const;
export type InstitucionDestino = (typeof INSTITUCIONES_DESTINO)[number];

export const PAPELES = ['principal', 'simultanea', 'condicionada'] as const;
export type Papel = (typeof PAPELES)[number];

/** Respuesta ciudadana a heridos o atencion medica; null si no se pregunto o no se respondio. */
export type RespuestaMedica = 'si' | 'no' | 'no_se' | null;

export const VERSION_MATRIZ = 'matriz-09-v1';

export interface Destinatario {
  readonly institucion: InstitucionDestino;
  readonly papel: Papel;
}

export interface ResolucionDestinatarios {
  readonly version: string;
  /** Una entrada por institucion, principal primero. */
  readonly destinatarios: readonly Destinatario[];
  /** Una respuesta desconocida exige revision; nunca equivale a «no». */
  readonly revisionMedicaPendiente: boolean;
}

export class CategoriaSinReglaError extends Error {
  constructor(categoriaId: string) {
    super(`Categoria sin regla de enrutamiento: ${categoriaId.slice(0, 60)}`);
    this.name = 'CategoriaSinReglaError';
  }
}

interface ReglaCategoria {
  readonly principal: InstitucionDestino;
  readonly simultaneas?: readonly InstitucionDestino[];
  /** SAMU condicionado por heridos `si` (agresion, pelea, violencia). */
  readonly samuSiHeridos?: boolean;
  /** Regla especial de accidentes (RF57). */
  readonly accidente?: boolean;
}

const MATRIZ_V1: Readonly<Record<string, ReglaCategoria>> = {
  'accidente-transito': { principal: 'pnp', accidente: true },
  acoso: { principal: 'pnp' },
  'actividad-sospechosa': { principal: 'pnp', simultaneas: ['serenazgo'] },
  agresion: { principal: 'pnp', samuSiHeridos: true },
  asalto: { principal: 'pnp' },
  'danos-sismo': { principal: 'bomberos' },
  deslizamiento: { principal: 'bomberos' },
  'emergencia-medica': { principal: 'samu' },
  incendio: { principal: 'bomberos' },
  inundacion: { principal: 'bomberos' },
  'otra-emergencia': { principal: 'serenazgo' },
  'otro-incidente-seguridad': { principal: 'pnp' },
  pelea: { principal: 'pnp', samuSiHeridos: true },
  robo: { principal: 'pnp' },
  vandalismo: { principal: 'pnp', simultaneas: ['serenazgo'] },
  violencia: { principal: 'pnp', samuSiHeridos: true },
};

export const CATEGORIAS_CON_REGLA: readonly string[] = Object.keys(MATRIZ_V1);

const RANGO: Readonly<Record<Papel, number>> = { principal: 0, simultanea: 1, condicionada: 2 };

const desconocida = (r: RespuestaMedica): boolean => r === null || r === 'no_se';

/** Resuelve los destinatarios de una categoria con las respuestas medicas informadas. */
export function resolverDestinatarios(
  categoriaId: string,
  heridos: RespuestaMedica,
  atencionMedica: RespuestaMedica,
): ResolucionDestinatarios {
  const regla = Object.prototype.hasOwnProperty.call(MATRIZ_V1, categoriaId) ? MATRIZ_V1[categoriaId] : undefined;
  if (!regla) throw new CategoriaSinReglaError(categoriaId);

  const lista: Destinatario[] = [];
  let revision = false;

  if (regla.accidente) {
    if (heridos === 'si' || atencionMedica === 'si') {
      lista.push({ institucion: 'samu', papel: 'principal' }, { institucion: 'pnp', papel: 'simultanea' });
    } else {
      lista.push({ institucion: 'pnp', papel: 'principal' });
      revision = desconocida(heridos) || desconocida(atencionMedica);
    }
  } else {
    lista.push({ institucion: regla.principal, papel: 'principal' });
    for (const s of regla.simultaneas ?? []) lista.push({ institucion: s, papel: 'simultanea' });
    if (regla.samuSiHeridos) {
      if (heridos === 'si') lista.push({ institucion: 'samu', papel: 'condicionada' });
      else revision = desconocida(heridos);
    }
  }

  return { version: VERSION_MATRIZ, destinatarios: deduplicar(lista), revisionMedicaPendiente: revision };
}

/** Una entrada por institucion con su papel de mayor rango; conserva el orden por rango. */
export function deduplicar(lista: readonly Destinatario[]): Destinatario[] {
  const mejor = new Map<InstitucionDestino, Papel>();
  for (const d of lista) {
    if (!(INSTITUCIONES_DESTINO as readonly string[]).includes(d.institucion)) {
      throw new Error('Institucion destinataria no admitida');
    }
    const actual = mejor.get(d.institucion);
    if (actual === undefined || RANGO[d.papel] < RANGO[actual]) mejor.set(d.institucion, d.papel);
  }
  return [...mejor.entries()]
    .map(([institucion, papel]) => ({ institucion, papel }))
    .sort((a, b) => RANGO[a.papel] - RANGO[b.papel]);
}

// ---------------------------------------------------------------------------------------------
// Faltantes y resultado

export const RESULTADOS_ENRUTAMIENTO = ['ENRUTADO', 'ENRUTAMIENTO_PENDIENTE'] as const;
export type ResultadoEnrutamiento = (typeof RESULTADOS_ENRUTAMIENTO)[number];

export type MotivoFaltante = 'sin_distrito' | 'sin_sede_elegible';

export interface Faltante {
  readonly institucion: InstitucionDestino;
  readonly papel: Papel;
  readonly motivo: MotivoFaltante;
}

export interface SedeParticipante {
  readonly sedeId: string;
  readonly institucion: InstitucionDestino;
  readonly papel: Papel;
}

export interface PlanEnrutamiento {
  readonly resultado: ResultadoEnrutamiento;
  readonly participaciones: readonly SedeParticipante[];
  readonly faltantes: readonly Faltante[];
}

/**
 * Combina los destinatarios con las sedes elegibles encontradas. Sin distrito, toda institucion es
 * faltante `sin_distrito` y no hay participaciones. Una institucion sin sedes es faltante
 * `sin_sede_elegible`; las encontradas participan igualmente.
 */
export function planificar(
  destinatarios: readonly Destinatario[],
  distritoId: string | null,
  sedesPorInstitucion: ReadonlyMap<InstitucionDestino, readonly string[]>,
): PlanEnrutamiento {
  const participaciones: SedeParticipante[] = [];
  const faltantes: Faltante[] = [];
  for (const d of destinatarios) {
    if (distritoId === null) {
      faltantes.push({ ...d, motivo: 'sin_distrito' });
      continue;
    }
    const sedes = [...new Set(sedesPorInstitucion.get(d.institucion) ?? [])];
    if (sedes.length === 0) faltantes.push({ ...d, motivo: 'sin_sede_elegible' });
    for (const sedeId of sedes) participaciones.push({ sedeId, ...d });
  }
  return { resultado: resultadoDe(faltantes), participaciones, faltantes };
}

export function resultadoDe(faltantes: readonly Faltante[]): ResultadoEnrutamiento {
  return faltantes.length === 0 ? 'ENRUTADO' : 'ENRUTAMIENTO_PENDIENTE';
}

/** Valida y normaliza la lista de faltantes leida de la persistencia. */
export function faltantesDesdeJson(valor: unknown): Faltante[] {
  if (!Array.isArray(valor)) throw new Error('Faltantes invalidos');
  return valor.map((v: unknown) => {
    const f = v as Record<string, unknown>;
    if (
      typeof f !== 'object' || f === null ||
      !(INSTITUCIONES_DESTINO as readonly unknown[]).includes(f.institucion) ||
      !(PAPELES as readonly unknown[]).includes(f.papel) ||
      (f.motivo !== 'sin_distrito' && f.motivo !== 'sin_sede_elegible')
    ) throw new Error('Faltante invalido');
    return { institucion: f.institucion as InstitucionDestino, papel: f.papel as Papel, motivo: f.motivo };
  });
}
