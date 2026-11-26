import { it, expect } from '@jest/globals';
import { LimitadorTerritorial } from '../../src/modules/consultas/infraestructura/limitador-territorial';

it('cuota territorial por IP, ventana, capacidad y expiración con claves HMAC', () => {
  let ahora = 0;
  const l = new LimitadorTerritorial('secreto de pruebas', () => ahora, 2);
  for (let i = 0; i < 60; i++) expect(l.consumir('192.0.2.1')).toBeNull();
  expect(l.consumir('192.0.2.1')).toBe(60);
  expect(l.consumir('192.0.2.2')).toBeNull();
  expect(l.consumir('192.0.2.3')).toBe(60);
  expect(JSON.stringify(l)).not.toContain('192.0.2');
  ahora = 59001;
  expect(l.consumir('192.0.2.1')).toBe(1);
  ahora = 60000;
  expect(l.consumir('192.0.2.1')).toBeNull();
  expect(l.consumir('192.0.2.3')).toBeNull();
});
