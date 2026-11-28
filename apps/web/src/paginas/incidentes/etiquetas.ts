import type {
  CampoEvaluacion,
  CantidadHeridos,
  EstadoIncidente,
  Faltante,
  PapelInstitucion,
  RespuestaCiudadano,
  Prioridad,
  ResultadoCierre,
  SignosVida,
  TerritorioVista,
  TipoInstitucion,
  Verificacion,
} from '../../api/cliente';

/** Textos de negocio de AyniSafe para la bandeja y los pendientes (P4.2). Sin valores inventados. */

export const INSTITUCION: Record<TipoInstitucion, string> = {
  pnp: 'PNP',
  bomberos: 'Bomberos',
  samu: 'SAMU',
  serenazgo: 'Serenazgo',
};

export const PAPEL: Record<PapelInstitucion, string> = {
  principal: 'Principal',
  simultanea: 'Simultánea',
  condicionada: 'Condicionada',
};

export const ESTADO: Record<EstadoIncidente, string> = {
  REGISTRADO: 'Registrado',
  EN_REVISION: 'En revisión',
  EN_ATENCION: 'En atención',
  CERRADO: 'Cerrado',
};

// --- Prioridad (P6 grupo C): texto, icono y color; nunca ordena la bandeja ---------------------

export const PRIORIDAD: Record<Prioridad, { readonly texto: string; readonly clase: string; readonly icono: 'reloj' | 'info' | 'aviso' }> = {
  SIN_EVALUAR: { texto: 'Sin evaluar', clase: 'priority-badge--unknown', icono: 'reloj' },
  NORMAL: { texto: 'Normal', clase: 'priority-badge--normal', icono: 'info' },
  ALTA: { texto: 'Alta', clase: 'priority-badge--high', icono: 'aviso' },
  URGENTE: { texto: 'Urgente', clase: 'priority-badge--urgent', icono: 'aviso' },
};

// --- Atencion institucional (P6) -------------------------------------------------------------

export const VERIFICACION: Record<Verificacion, string> = {
  SIN_VERIFICAR: 'Sin verificar',
  VERIFICADO: 'Verificado',
  NO_VERIFICADO: 'No verificado',
};

export const RESULTADO: Record<ResultadoCierre, string> = {
  ATENDIDO: 'Atendido',
  DESCARTADO: 'Descartado',
};

/** Mensajes de los conflictos y permisos de la atencion, sin presentar la accion como hecha. */
export const CONFLICTO_ATENCION: Record<string, string> = {
  CASO_ASUMIDO: 'Otro operador de tu institución ya es responsable de este caso.',
  ESTADO_CAMBIADO: 'El estado del incidente cambió mientras lo revisabas. El resumen se actualizó.',
  TRANSICION_NO_PERMITIDA: 'Esa acción no corresponde al estado actual del incidente.',
  INCIDENTE_CERRADO: 'El incidente ya está cerrado.',
  INCIDENTE_VINCULADO: 'El incidente está vinculado a otro reporte del mismo hecho y se atiende desde ese caso.',
  ASIGNACION_REQUERIDA: 'Asume el caso antes de realizar esta acción.',
  NO_PRINCIPAL: 'Solo la institución principal puede realizar esta acción.',
  DESTINO_NO_VALIDO: 'El operador elegido no puede recibir este caso.',
  ASIGNACION_INACTIVA: 'La asignación ya no está activa.',
  VINCULO_NO_PERMITIDO: 'No se puede vincular a ese incidente: ya es duplicado, tiene duplicados, está cerrado o es el mismo caso.',
  NO_VERIFICADO: 'Solo se publican incidentes verificados.',
  FUERA_DE_VIGENCIA: 'El incidente ocurrió hace más de 7 días y ya no se puede publicar.',
  DISTRITO_PENDIENTE: 'El distrito del incidente está pendiente; no se puede publicar.',
  NO_PUBLICADA: 'El incidente ya no tiene una publicación vigente.',
};

/** Causa del retiro de una publicacion (P7). */
export const CAUSA_RETIRO: Record<string, string> = {
  DECISION: 'retirada por decisión de la institución principal',
  CIERRE: 'retirada al cerrar el caso',
  NO_VERIFICADO: 'retirada al corregir la verificación',
  DUPLICADO: 'retirada al vincularlo como duplicado',
};

/** Texto del historial operativo, sin actores. */
export function textoHistorial(h: { accion: string; institucion: TipoInstitucion; actorTipo?: string; valorAnterior: string | null; valorNuevo: string | null }): string {
  const inst = INSTITUCION[h.institucion];
  switch (h.accion) {
    case 'asumir':
      return h.actorTipo === 'sistema'
        ? `${inst}: asignado automáticamente al único operador activo de la sede`
        : `${inst}: un operador tomó el caso`;
    case 'transicion': {
      const nuevo = h.valorNuevo ?? '';
      if (nuevo.startsWith('CERRADO:')) return `${inst}: cerrado como ${(RESULTADO[nuevo.slice(8) as ResultadoCierre] ?? nuevo).toLowerCase()}`;
      return `${inst}: ${ESTADO[h.valorAnterior as EstadoIncidente] ?? h.valorAnterior} → ${ESTADO[nuevo as EstadoIncidente] ?? nuevo}`;
    }
    case 'verificacion':
      return `${inst}: verificación «${VERIFICACION[h.valorNuevo as Verificacion] ?? h.valorNuevo}»`;
    case 'liberar':
      return `Administración liberó la asignación de ${inst}`;
    case 'reasignar':
      return `Administración reasignó el caso dentro de ${inst}`;
    case 'prioridad':
      return `${inst}: prioridad ${(PRIORIDAD[h.valorAnterior as Prioridad]?.texto ?? h.valorAnterior)} → ${(PRIORIDAD[h.valorNuevo as Prioridad]?.texto ?? h.valorNuevo)}`;
    case 'vincular':
      return `${inst}: vinculado como duplicado de otro reporte del mismo hecho`;
    case 'publicar':
      return `${inst}: publicado en el mapa ciudadano`;
    case 'retirar':
      return `${inst}: publicación ${CAUSA_RETIRO[h.valorNuevo ?? ''] ?? 'retirada'}`;
    case 'reservar':
      return h.valorNuevo === 'true' ? `${inst}: caso marcado como reservado` : `${inst}: reserva quitada`;
    default:
      return `${inst}: ${h.accion}`;
  }
}

export const MOTIVO_FALTANTE: Record<Faltante['motivo'], string> = {
  sin_distrito: 'sin distrito resuelto',
  sin_sede_elegible: 'sin sede habilitada con cobertura y competencia',
};

const MOTIVO_TERRITORIAL: Record<string, string> = {
  frontera: 'Punto en el límite entre distritos',
  solapamiento: 'Punto en una zona de solapamiento',
  fuera_area: 'Fuera del área del piloto',
  sin_cartografia: 'Sin cartografía activa al registrar',
  sin_distrito: 'Sin distrito resuelto',
};

export function textoTerritorio(t: TerritorioVista): string {
  if (t.estado === 'resuelto') return t.distrito.nombre ?? t.distrito.id;
  return `Pendiente: ${MOTIVO_TERRITORIAL[t.motivo] ?? 'sin distrito resuelto'}`;
}

const RESPUESTA: Record<Exclude<RespuestaCiudadano, null>, string> = { si: 'Sí', no: 'No', no_se: 'No sabe' };
export const textoRespuesta = (r: RespuestaCiudadano): string => (r === null ? 'Sin respuesta' : RESPUESTA[r]);

const FORMATO_FECHA = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
export const fecha = (iso: string): string => FORMATO_FECHA.format(new Date(iso));

export const REQUISITO_DESIGNACION: Record<string, string> = {
  sede_existente: 'La sede ya no existe.',
  misma_institucion: 'La sede debe pertenecer a la institución que falta.',
  institucion_activa: 'La institución debe estar activa.',
  sede_activa: 'La sede debe estar activa.',
  sede_habilitada: 'La sede debe estar habilitada para atención.',
  operador_activo: 'La sede necesita al menos un operador activo.',
};

// --- Evaluacion rapida (P5.1) ---------------------------------------------------------------

export const SIGNOS_VIDA: Record<Exclude<SignosVida, null>, string> = {
  observados: 'Se observan',
  no_observados: 'No se han observado',
  no_se: 'No sabe',
};
export const textoSignos = (s: SignosVida): string => (s === null ? 'Sin respuesta' : SIGNOS_VIDA[s]);

export function textoCantidad(c: CantidadHeridos): string {
  if (c === null) return 'Sin respuesta';
  return c === 'no_se' ? 'No sabe' : String(c);
}

export const CAMPO_EVALUACION: Record<CampoEvaluacion, string> = {
  heridos: 'heridos',
  atencionMedica: 'atención médica',
  cantidadHeridos: 'cantidad de heridos',
  signosVida: 'signos de vida',
  consciente: 'conciencia',
  sangrado: 'sangrado visible',
};

/** Quien informo la version: el ciudadano o el operador de una institucion (sin nombres). */
export function textoOrigen(origen: 'ciudadano' | 'operador', institucion: TipoInstitucion | null): string {
  return origen === 'ciudadano' ? 'Ciudadano' : `Operador ${institucion ? INSTITUCION[institucion] : ''}`.trim();
}
