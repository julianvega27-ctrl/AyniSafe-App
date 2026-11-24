import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// axe prueba iconos con un canvas que jsdom no implementa: se declara sin contexto para evitar el aviso.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
});
