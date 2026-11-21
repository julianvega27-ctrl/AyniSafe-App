import type { Logger } from '../../../compartido/logger';
import type { ProcesarEnviosCorreoUseCase } from '../aplicacion/procesar-envios-correo.use-case';
import type { EnviosCorreoPort } from '../aplicacion/puertos/envios-correo.port';
import type { RelojPort } from '../aplicacion/puertos/reloj.port';

/** setTimeout no admite esperas mayores a ~24,8 dias. */
const ESPERA_MAXIMA_MS = 2 ** 31 - 1;
/** Reintento tras un fallo al consultar la base: solo existe mientras haya un error. */
const ESPERA_TRAS_ERROR_MS = 60_000;

/**
 * Hace funcionar la cola de correos dentro de la API sin sondear en reposo (Neon y Render): trabaja
 * al arrancar, cuando alguien llama a `despertar()` tras encolar y solo programa un temporizador
 * mientras existan envios pendientes (el siguiente reintento). Sin envios activos no hay timer.
 *
 * Quien encola dentro de la transaccion de otro modulo debe llamar a `despertar()` despues del
 * commit: la cola no se consulta sola.
 */
export class GestorEnvios {
  private ejecutando = false;
  private otraVez = false;
  private detenido = false;
  private temporizador: NodeJS.Timeout | undefined;
  private enCurso: Promise<void> = Promise.resolve();

  constructor(
    private readonly procesar: ProcesarEnviosCorreoUseCase,
    private readonly envios: EnviosCorreoPort,
    private readonly reloj: RelojPort,
    private readonly logger: Logger,
  ) {}

  /** Barrido de arranque: retoma lo que quedo pendiente antes de un reinicio. */
  iniciar(): void {
    this.despertar();
  }

  /** Programa una pasada inmediata (si ya hay una en curso, repite al terminar). */
  despertar(): void {
    if (this.detenido) return;
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

  /** Para pruebas y apagado: espera a que termine la pasada en curso y cancela el temporizador. */
  async detener(): Promise<void> {
    this.detenido = true;
    this.limpiarTemporizador();
    await this.enCurso;
  }

  /** Espera a que termine la pasada en curso (sirve a las pruebas). */
  async esperarReposo(): Promise<void> {
    await this.enCurso;
  }

  /** Indica si hay un reintento programado. Sin envios activos debe ser falso. */
  hayTemporizador(): boolean {
    return this.temporizador !== undefined;
  }

  private async correr(): Promise<void> {
    let espera: number | null = null;
    try {
      do {
        this.otraVez = false;
        await this.procesar.ejecutar();
      } while (this.otraVez && !this.detenido);
      const cuando = await this.envios.proximoMomento();
      if (cuando) espera = Math.max(0, cuando.getTime() - this.reloj.ahora().getTime());
    } catch (error) {
      this.logger.registrar({
        evento: 'error_interno',
        resultado: 'cola_correo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
      espera = ESPERA_TRAS_ERROR_MS;
    } finally {
      this.ejecutando = false;
    }
    if (espera !== null && !this.detenido) this.programar(espera);
  }

  private programar(esperaMs: number): void {
    this.limpiarTemporizador();
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.despertar();
    }, Math.min(esperaMs, ESPERA_MAXIMA_MS));
    // No debe impedir que el proceso termine.
    this.temporizador.unref();
  }

  private limpiarTemporizador(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = undefined;
  }
}
