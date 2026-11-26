import { createHmac } from 'node:crypto';

/** Cuota local por instancia. No conserva IP ni coordenadas en claro. */
export class LimitadorTerritorial {
  private readonly ventanas = new Map<string, { inicio: number; cantidad: number }>();
  constructor(private readonly secreto: string, private readonly ahora: () => number = Date.now,
    private readonly maximoClaves = 10000) {}
  consumir(ip: string): number | null {
    const ahora = this.ahora();
    for (const [k, v] of this.ventanas) if (ahora >= v.inicio + 60000) this.ventanas.delete(k);
    const clave = createHmac('sha256', this.secreto).update(`territorio:${ip}`).digest('hex');
    let v = this.ventanas.get(clave);
    if (!v) {
      if (this.ventanas.size >= this.maximoClaves) {
        const vence = Math.min(...[...this.ventanas.values()].map(x => x.inicio + 60000));
        return Math.max(1, Math.ceil((vence - ahora) / 1000));
      }
      v = { inicio: ahora, cantidad: 0 };
      this.ventanas.set(clave, v);
    }
    if (v.cantidad >= 60) return Math.max(1, Math.ceil((v.inicio + 60000 - ahora) / 1000));
    v.cantidad++;
    return null;
  }
}
