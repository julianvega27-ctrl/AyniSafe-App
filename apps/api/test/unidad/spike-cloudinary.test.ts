import { describe, expect, it } from '@jest/globals';
import { alterarFirma, ejecutarSpike, type AdminCloudinary, type DependenciasSpike } from '../../scripts/spike-cloudinary';
import type { ClienteCloudinary } from '../../src/modules/reportes/infraestructura/cloudinary-evidencias.adapter';

/** Prueba en seco del spike con un proveedor simulado: sin red ni credenciales reales. */
const CRED = { cloudName: 'nube-seca-NO-IMPRIMIR', apiKey: 'KEY-seca-NO-IMPRIMIR', apiSecret: 'SECRET-seco-NO-IMPRIMIR' };
const FIRMA = 's--ABCDEFGH--';

function proveedorSimulado(opciones: { privado?: boolean; borrar?: boolean } = {}) {
  const privado = opciones.privado ?? true;
  const borrar = opciones.borrar ?? true;
  const objetos = new Map<string, { bytes: Buffer; derivados: number }>();
  const ajenos = 4; // recursos de otro proyecto con la etiqueta (no deben tocarse)
  const cliente: ClienteCloudinary = {
    async subirStream(o, bytes) {
      objetos.set(String(o.public_id), { bytes, derivados: 0 });
      return { public_id: o.public_id, type: 'authenticated', resource_type: 'image', format: 'jpg', bytes: bytes.length, asset_folder: 'aynisafe', tags: ['aynisafe'] };
    },
    async destruir(pid) {
      if (!borrar) return { result: 'ok' };
      return { result: objetos.delete(pid) ? 'ok' : 'not found' };
    },
    url(pid, o) {
      const t = o.width ? `w_${String(o.width)}/` : '';
      return `https://res.simulado/${CRED.cloudName}/image/${String(o.type)}/${o.sign_url ? `${FIRMA}/` : ''}${t}${pid}.jpg?k=${CRED.apiKey}`;
    },
  };
  const fetchSimulado: typeof fetch = async (entrada) => {
    const url = String(entrada);
    const m = /\/image\/(\w+)\/(s--[A-Za-z0-9_-]{8}--\/)?(w_\d+\/)?(aynisafe\/[0-9a-f-]+)\.jpg/.exec(url);
    if (url.includes('/descarga/')) return new Response(null, { status: url.includes('vencida') ? 401 : 200 });
    if (!m) return new Response(null, { status: 404 });
    const [, tipo, firma, derivado, pid] = m;
    const obj = objetos.get(pid!);
    if (!obj || tipo !== 'authenticated') return new Response(null, { status: 404 });
    if (privado && firma !== `${FIRMA}/`) return new Response(null, { status: 401 });
    if (derivado) obj.derivados += 1;
    return new Response(new Uint8Array(obj.bytes), { status: 200 });
  };
  const admin: AdminCloudinary = {
    async recurso(pid) {
      const o = objetos.get(pid);
      return o ? { derivados: o.derivados } : 'no_existe';
    },
    async contarEtiqueta() {
      return ajenos + objetos.size;
    },
    async uso() {
      return { http: 401 };
    },
    descargaPrivada(pid, _f, expira) {
      return `https://api.simulado/descarga/${pid}?${expira * 1000 < Date.now() ? 'vencida' : 'vigente'}&s=${CRED.apiSecret}`;
    },
  };
  return { cliente, fetchSimulado, admin, objetos };
}

async function correr(opciones: { privado?: boolean; borrar?: boolean } = {}) {
  const sim = proveedorSimulado(opciones);
  const lineas: string[] = [];
  const guardado: Record<string, unknown> = {};
  let reloj = Date.now();
  const d: DependenciasSpike = {
    cred: CRED,
    cliente: sim.cliente,
    admin: sim.admin,
    fetch: sim.fetchSimulado,
    esperar: async (ms) => {
      reloj += ms;
    },
    ahora: () => reloj,
    log: (l) => lineas.push(l),
    guardar: (n, c) => {
      guardado[n] = c;
    },
    topeSondeoMs: 30_000,
    intervaloSondeoMs: 10_000,
  };
  const r = await ejecutarSpike(d);
  return { ...r, lineas, guardado, sim };
}

function sinSecretosNiUrls(texto: string) {
  expect(texto).not.toContain(CRED.cloudName);
  expect(texto).not.toContain(CRED.apiKey);
  expect(texto).not.toContain(CRED.apiSecret);
  expect(texto).not.toContain('https://');
  expect(texto).not.toContain(FIRMA);
}

describe('spike de Cloudinary en seco', () => {
  it('con un proveedor que cumple, aprueba S1-S6 y deja la etiqueta como estaba', async () => {
    const r = await correr();
    expect(r.validado).toBe(true);
    expect(r.puntos.find((p) => p.id === 'S1')!.observaciones.modoCarpetas).toBe('dinamico');
    expect(r.sim.objetos.size).toBe(0);
  });

  it('nunca imprime ni guarda credenciales, URLs ni firmas', async () => {
    const r = await correr();
    sinSecretosNiUrls(r.lineas.join('\n'));
    sinSecretosNiUrls(JSON.stringify(r.guardado));
  });

  it('si el proveedor sirve sin firma, S2 falla y no se valida', async () => {
    const r = await correr({ privado: false });
    expect(r.puntos.find((p) => p.id === 'S2')!.estado).toBe('fallido');
    expect(r.validado).toBe(false);
  });

  it('si destroy no borra, S5 falla, se respeta el tope y no se valida', async () => {
    const r = await correr({ borrar: false });
    expect(r.puntos.find((p) => p.id === 'S5')!.estado).toBe('fallido');
    expect(r.validado).toBe(false);
  });

  it('alterarFirma cambia la firma sin tocar el resto', () => {
    const u = 'https://x/image/authenticated/s--ABCDEFGH--/v1/aynisafe/a.jpg';
    const a = alterarFirma(u);
    expect(a).not.toBe(u);
    expect(a.replace(/s--[^-]+--/, '')).toBe(u.replace(/s--[^-]+--/, ''));
  });
});
