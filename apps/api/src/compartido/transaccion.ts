/**
 * Contexto transaccional opaco compartido entre modulos (P4). Permite que un caso de uso coordine
 * escrituras de varios modulos en una sola transaccion sin conocer la tecnologia de persistencia:
 * cada adaptador convierte el contexto a su cliente transaccional. Ningun modulo lee ni escribe
 * tablas ajenas: solo recibe el contexto a traves de la fachada del dueno de los datos.
 */
declare const marca: unique symbol;
export interface ContextoTransaccional {
  readonly [marca]: 'ContextoTransaccional';
}

export interface UnidadDeTrabajo {
  /**
   * Ejecuta `fn` en una transaccion. Si `fn` lanza, todo se revierte y el error se propaga sin
   * transformar: el llamador decide su traduccion.
   */
  enTransaccion<T>(fn: (tx: ContextoTransaccional) => Promise<T>): Promise<T>;
}
