/** Hash de contrasenas. Las implementaciones no deben recortar, normalizar ni truncar el secreto. */
export interface HashContrasenaPort {
  /** Devuelve el hash codificado (con algoritmo, parametros y sal individual). */
  hash(contrasena: string): Promise<string>;
  /** Comprueba la contrasena exacta contra un hash. Un hash ilegible cuenta como no coincidente. */
  verificar(hashCodificado: string, contrasena: string): Promise<boolean>;
  /**
   * Ejecuta una verificacion de costo equivalente contra un hash ficticio y devuelve siempre
   * false. Se usa para cuentas inexistentes o no admitidas, reduciendo diferencias de tiempo.
   */
  verificarFicticio(contrasena: string): Promise<false>;
}
