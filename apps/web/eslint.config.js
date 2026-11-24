import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // La web nunca debe guardar sesion ni secretos en el navegador (ver specs web/panel-institucional).
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage', 'indexedDB'],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'No se guarda nada en el navegador.' },
        { object: 'window', property: 'sessionStorage', message: 'No se guarda nada en el navegador.' },
        { object: 'window', property: 'indexedDB', message: 'No se guarda nada en el navegador.' },
        { object: 'document', property: 'cookie', message: 'La sesion es HttpOnly: no se toca desde JavaScript.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Las pruebas si inspeccionan el almacenamiento para comprobar que esta vacio.
    files: ['test/**/*.{ts,tsx}', 'vitest.setup.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // Scripts de Node y la prueba e2e local (el codigo dentro de `page.evaluate` corre en el navegador).
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
