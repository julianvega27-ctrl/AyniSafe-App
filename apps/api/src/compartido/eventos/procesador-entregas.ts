import type { PrismaClient } from '../../generated/prisma/client';
import type { Logger } from '../logger';
import type { ConsumidorEventos, EventoPersistido } from './eventos';

export interface OpcionesProcesador {
  /** Entregas tomadas por pasada. */
  readonly lote?: number;
  /** Duracion del bloqueo de una entrega en proceso; al vencer, otra pasada puede retomarla. */
  readonly bloqueoMs?: number;
  /** Intentos antes de marcar la entrega como fallida. */
  readonly maxIntentos?: number;
  /** Espera base del reintento: base * 2^(intentos-1), con tope `esperaMaxMs`. */
  readonly esperaBaseMs?: number;
  readonly esperaMaxMs?: number;
}

/** setTimeout no admite esperas mayores a ~24,8 dias. */
const ESPERA_MAXIMA_TIMER_MS = 2 ** 31 - 1;
const ESPERA_TRAS_ERROR_MS = 60_000;
const NOMBRE_CONSUMIDOR = /^[a-z][a-z0-9.-]*$/;

interface Tomada {
  readonly evento_id: string;
  readonly consumidor: string;
  readonly intentos: number;
  readonly bloqueado_hasta: Date;
}

/** Codigo corto y sin datos del error de un consumidor (nunca su mensaje ni su pila). */
function codigoDeError(error: unknown): string {
  const nombre = error instanceof Error ? error.name : 'desconocido';
  return nombre.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 200) || 'desconocido';
}

/**
 * Procesa las entregas de eventos dentro de la API (ADR-004). Igual que la cola de correos, no sondea
 * en reposo: trabaja al arrancar, cuando se llama a `despertar()` tras confirmar un evento y solo
 * programa un temporizador mientras hay entregas pendientes o en proceso con bloqueo.
 *
 * Cada pasada: (1) materializa las entregas que falten para cada consumidor registrado, incluidos
 * eventos anteriores a su registro; (2) toma un lote con `FOR UPDATE SKIP LOCKED` (varios procesadores
 * no toman la misma entrega) y lo bloquea; (3) ejecuta el consumidor y marca procesada, o reprograma
 * con espera creciente hasta quedar fallida. La marca se condiciona al bloqueo tomado: si el bloqueo
 * vencio y otra pasada la retomo, la marca tardia no se aplica.
 */
export class ProcesadorEntregas {
  private readonly lote: number;
  private readonly bloqueoMs: number;
  private readonly maxIntentos: number;
  private readonly esperaBaseMs: number;
  private readonly esperaMaxMs: number;
  private readonly porNombre: ReadonlyMap<string, ConsumidorEventos>;
  private ejecutando = false;
  private otraVez = false;
  private detenido = false;
  private temporizador: NodeJS.Timeout | undefined;
  private enCurso: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaClient,
    consumidores: readonly ConsumidorEventos[],
    private readonly logger: Logger,
    opciones: OpcionesProcesador = {},
  ) {
    const mapa = new Map<string, ConsumidorEventos>();
    for (const c of consumidores) {
      if (!NOMBRE_CONSUMIDOR.test(c.nombre) || c.nombre.length > 60) throw new Error(`Nombre de consumidor invalido: ${c.nombre}`);
      if (mapa.has(c.nombre)) throw new Error(`Consumidor duplicado: ${c.nombre}`);
      mapa.set(c.nombre, c);
    }
    this.porNombre = mapa;
    this.lote = opciones.lote ?? 20;
    this.bloqueoMs = opciones.bloqueoMs ?? 60_000;
    this.maxIntentos = opciones.maxIntentos ?? 8;
    this.esperaBaseMs = opciones.esperaBaseMs ?? 5_000;
    this.esperaMaxMs = opciones.esperaMaxMs ?? 600_000;
  }

  /** Barrido de arranque: retoma entregas pendientes o interrumpidas antes de un reinicio. */
  iniciar(): void {
    this.despertar();
  }

  /** Programa una pasada inmediata (si ya hay una en curso, repite al terminar). */
  despertar(): void {
    if (this.detenido || this.porNombre.size === 0) return;
    this.limpiarTemporizador();
    if (this.ejecutando) {
      this.otraVez = true;
      return;
    }
    this.ejecutando = true;
    this.enCurso = new Promise<void>((resolver) => {
      setImmediate(() => void this.correr().finally(resolver));
    });
  }

  async detener(): Promise<void> {
    this.detenido = true;
    this.limpiarTemporizador();
    await this.enCurso;
  }

  async esperarReposo(): Promise<void> {
    await this.enCurso;
  }

  hayTemporizador(): boolean {
    return this.temporizador !== undefined;
  }

  /** Una pasada completa (materializar + lotes hasta vaciar lo vencido). Devuelve entregas tomadas. */
  async procesarPendientes(): Promise<number> {
    if (this.porNombre.size === 0) return 0;
    await this.materializar();
    let total = 0;
    for (;;) {
      const tomadas = await this.tomarLote();
      if (tomadas.length === 0) return total;
      total += tomadas.length;
      const eventos = await this.leerEventos(tomadas.map((t) => t.evento_id));
      for (const tomada of tomadas) {
        if (this.detenido) return total;
        await this.ejecutar(tomada, eventos.get(tomada.evento_id));
      }
    }
  }

  private async correr(): Promise<void> {
    let espera: number | null = null;
    try {
      do {
        this.otraVez = false;
        await this.procesarPendientes();
      } while (this.otraVez && !this.detenido);
      const cuando = await this.proximoMomento();
      if (cuando) espera = Math.max(0, cuando.getTime() - Date.now());
    } catch (error) {
      this.logger.registrar({ evento: 'error_interno', resultado: 'procesador_eventos', error: codigoDeError(error) });
      espera = ESPERA_TRAS_ERROR_MS;
    } finally {
      this.ejecutando = false;
    }
    if (espera !== null && !this.detenido) this.programar(espera);
  }

  private async materializar(): Promise<void> {
    for (const c of this.porNombre.values()) {
      if (c.tipos.length === 0) continue;
      await this.prisma.$executeRaw`
        INSERT INTO entregas_evento (evento_id, consumidor)
        SELECT e.id, ${c.nombre} FROM eventos e
         WHERE e.tipo = ANY(${[...c.tipos]}::text[])
           AND NOT EXISTS (SELECT 1 FROM entregas_evento d WHERE d.evento_id = e.id AND d.consumidor = ${c.nombre})
        ON CONFLICT DO NOTHING`;
    }
  }

  private tomarLote(): Promise<Tomada[]> {
    const nombres = [...this.porNombre.keys()];
    return this.prisma.$queryRaw<Tomada[]>`
      UPDATE entregas_evento d
         SET estado = 'en_proceso',
             bloqueado_hasta = clock_timestamp() + make_interval(secs => ${this.bloqueoMs / 1000}::float8)
        FROM (SELECT evento_id, consumidor FROM entregas_evento
               WHERE consumidor = ANY(${nombres}::text[])
                 AND ((estado = 'pendiente' AND proximo_intento_en <= clock_timestamp())
                   OR (estado = 'en_proceso' AND bloqueado_hasta < clock_timestamp()))
               ORDER BY proximo_intento_en, evento_id
               LIMIT ${this.lote}
               FOR UPDATE SKIP LOCKED) s
       WHERE d.evento_id = s.evento_id AND d.consumidor = s.consumidor
      RETURNING d.evento_id, d.consumidor, d.intentos, d.bloqueado_hasta`;
  }

  private async leerEventos(ids: readonly string[]): Promise<Map<string, EventoPersistido>> {
    const filas = await this.prisma.evento.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(
      filas.map((f) => [
        f.id,
        {
          id: f.id,
          tipo: f.tipo,
          version: f.version,
          agregadoId: f.agregadoId,
          carga: f.carga as EventoPersistido['carga'],
          ocurridoEn: f.ocurridoEn,
        },
      ]),
    );
  }

  private async ejecutar(tomada: Tomada, evento: EventoPersistido | undefined): Promise<void> {
    const consumidor = this.porNombre.get(tomada.consumidor);
    try {
      if (!consumidor || !evento) throw new Error('EntregaSinDestino');
      await consumidor.manejar(evento);
    } catch (error) {
      await this.registrarFallo(tomada, codigoDeError(error));
      return;
    }
    const filas = await this.prisma.$executeRaw`
      UPDATE entregas_evento
         SET estado = 'procesada', procesada_en = clock_timestamp(), bloqueado_hasta = NULL,
             intentos = intentos + 1, ultimo_error = NULL
       WHERE evento_id = ${tomada.evento_id}::uuid AND consumidor = ${tomada.consumidor}
         AND estado = 'en_proceso' AND bloqueado_hasta = ${tomada.bloqueado_hasta}`;
    if (filas === 1 && tomada.intentos > 0) {
      this.registrar('recuperada', tomada, tomada.intentos + 1);
    }
  }

  private async registrarFallo(tomada: Tomada, codigo: string): Promise<void> {
    const intentos = tomada.intentos + 1;
    const definitivo = intentos >= this.maxIntentos;
    const esperaMs = Math.min(this.esperaBaseMs * 2 ** (intentos - 1), this.esperaMaxMs);
    await this.prisma.$executeRaw`
      UPDATE entregas_evento
         SET estado = ${definitivo ? 'fallida' : 'pendiente'}, intentos = ${intentos}, bloqueado_hasta = NULL,
             ultimo_error = ${codigo},
             proximo_intento_en = clock_timestamp() + make_interval(secs => ${esperaMs / 1000}::float8)
       WHERE evento_id = ${tomada.evento_id}::uuid AND consumidor = ${tomada.consumidor}
         AND estado = 'en_proceso' AND bloqueado_hasta = ${tomada.bloqueado_hasta}`;
    this.registrar(definitivo ? 'fallida' : 'reintento', tomada, intentos, codigo);
  }

  private registrar(resultado: string, tomada: Tomada, intentos: number, codigo?: string): void {
    this.logger.registrar({
      evento: 'entrega_evento',
      resultado,
      ...(codigo ? { error: codigo } : {}),
      detalle: { eventoId: tomada.evento_id, consumidor: tomada.consumidor, intentos },
    });
  }

  /** Momento del siguiente trabajo: proximo reintento pendiente o vencimiento de un bloqueo. */
  private async proximoMomento(): Promise<Date | null> {
    const nombres = [...this.porNombre.keys()];
    const [fila] = await this.prisma.$queryRaw<{ cuando: Date | null }[]>`
      SELECT min(CASE WHEN estado = 'pendiente' THEN proximo_intento_en ELSE bloqueado_hasta END) AS cuando
        FROM entregas_evento
       WHERE consumidor = ANY(${nombres}::text[]) AND estado IN ('pendiente', 'en_proceso')`;
    return fila?.cuando ?? null;
  }

  private programar(esperaMs: number): void {
    this.limpiarTemporizador();
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.despertar();
    }, Math.min(Math.max(esperaMs, 50), ESPERA_MAXIMA_TIMER_MS));
    this.temporizador.unref();
  }

  private limpiarTemporizador(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = undefined;
  }
}
