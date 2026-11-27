import { PLAZO_HUERFANA_MS, esperaReintento } from '../dominio/evidencia';
import type { AlmacenEvidenciasPort, EvidenciasRepositorio } from './puertos/evidencias.port';

/** Tiempo maximo que un proceso retiene un lote antes de que otro pueda retomarlo. */
const ARRIENDO_MS = 5 * 60 * 1000;

export interface ResultadoLimpieza {
  readonly eliminadas: number;
  readonly reprogramadas: number;
}

/**
 * Limpieza persistente de evidencias (P5.2; design, decision 7). La fila es la tarea: las pendientes
 * no confirmadas en 15 min pasan a eliminacion y las marcadas se borran del proveedor SOLO por su
 * public_id registrado. Cada lote se toma con FOR UPDATE SKIP LOCKED, asi dos procesos no borran la
 * misma evidencia. P9 reutiliza este mecanismo para los plazos de conservacion.
 */
export class LimpiezaEvidencias {
  private enCurso: Promise<ResultadoLimpieza> | null = null;

  constructor(
    private readonly d: {
      readonly evidencias: EvidenciasRepositorio;
      readonly almacen: AlmacenEvidenciasPort | null;
      readonly ahora: () => Date;
      readonly lote?: number;
    },
  ) {}

  /** Procesa un lote. Si ya hay uno en curso en esta instancia, devuelve ese mismo. */
  ejecutar(): Promise<ResultadoLimpieza> {
    this.enCurso ??= this.lote().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async lote(): Promise<ResultadoLimpieza> {
    const almacen = this.d.almacen;
    // Sin almacen no se puede borrar: las tareas se conservan hasta que vuelva a estar configurado.
    if (!almacen) return { eliminadas: 0, reprogramadas: 0 };
    const limite = this.d.lote ?? 20;
    const ahora = this.d.ahora();
    // Arriendo: si este proceso cae a mitad del lote, las tareas vuelven a estar disponibles al vencer.
    const tareas = await this.d.evidencias.tomarTareas(
      ahora,
      new Date(ahora.getTime() - PLAZO_HUERFANA_MS),
      limite,
      new Date(ahora.getTime() + ARRIENDO_MS),
    );
    let eliminadas = 0;
    let reprogramadas = 0;
    for (const t of tareas) {
      // El public_id viene de la tabla; el adaptador vuelve a exigir el prefijo aynisafe/.
      let borrado = false;
      try {
        await almacen.eliminar(t.publicId);
        borrado = true;
      } catch {
        const intentos = t.intentos + 1;
        await this.d.evidencias.reprogramar(t.id, intentos, new Date(this.d.ahora().getTime() + esperaReintento(intentos)));
        reprogramadas += 1;
      }
      if (borrado) {
        await this.d.evidencias.marcarEliminada(t.id, this.d.ahora());
        eliminadas += 1;
      }
    }
    return { eliminadas, reprogramadas };
  }
}

/** Ejecuta al arrancar y cada `intervaloMs` con un temporizador `unref`. Devuelve la funcion de parada. */
export function programarLimpieza(limpieza: LimpiezaEvidencias, intervaloMs: number, alFallar: (e: unknown) => void): () => void {
  const correr = () => {
    limpieza.ejecutar().catch(alFallar);
  };
  correr();
  const t = setInterval(correr, intervaloMs);
  t.unref();
  return () => clearInterval(t);
}
