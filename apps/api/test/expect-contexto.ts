import { expect } from '@jest/globals';

/** Conserva los diagnosticos del segundo argumento de expect de la suite anterior. */
export function expectConContexto<T>(actual: T, contexto: string) {
  return new Proxy(expect(actual), {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver);
      if (typeof member !== 'function') return member;
      return (...args: unknown[]) => {
        try { return Reflect.apply(member, target, args); }
        catch (error) {
          if (error instanceof Error) error.message = `${contexto}\n${error.message}`;
          throw error;
        }
      };
    },
  });
}
