/**
 * Base32 de Crockford: 32 simbolos sin I, L, O ni U para evitar confusiones al leer o dictar.
 * Funciones puras; la aleatoriedad llega como bytes desde quien llama.
 */
export const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Codifica los primeros `simbolos * 5` bits de `bytes`. Exige bytes suficientes. */
export function aCrockford(bytes: Uint8Array, simbolos: number): string {
  if (bytes.length * 8 < simbolos * 5) throw new RangeError('Bytes insuficientes para la longitud pedida');
  let salida = '';
  let acumulado = 0;
  let bits = 0;
  let i = 0;
  while (salida.length < simbolos) {
    if (bits < 5) {
      acumulado = ((acumulado << 8) | bytes[i++]!) & 0xffff;
      bits += 8;
    }
    salida += ALFABETO_CROCKFORD[(acumulado >> (bits - 5)) & 31];
    bits -= 5;
  }
  return salida;
}

/**
 * Normaliza lo que escribe una persona: mayusculas, sin espacios ni guiones, O→0 e I/L→1.
 * Devuelve null si queda algun simbolo fuera del alfabeto.
 */
export function normalizarCrockford(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]*$/.test(limpio) ? limpio : null;
}
