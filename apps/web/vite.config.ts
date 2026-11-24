import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// La web y la API comparten origen: en produccion Vercel reescribe /api/* hacia Render (vercel.json) y en
// desarrollo este proxy cumple la misma funcion. El navegador nunca hace una peticion entre origenes, asi que
// la API no necesita CORS. El proxy conserva la cabecera Origin (changeOrigin: false), que la API exige.
const API_DEV = process.env.API_DEV_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // El servidor de desarrollo de Vite habilita CORS abierto por defecto: se desactiva para que el entorno
    // local se comporte como produccion (mismo origen, sin cabeceras Access-Control-*).
    cors: false,
    proxy: {
      '/api': { target: API_DEV, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: true,
    restoreMocks: true,
  },
});
