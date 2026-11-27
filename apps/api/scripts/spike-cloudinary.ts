/**
 * Spike de P5.2 sobre la cuenta real de Cloudinary (design, decision 9). Se ejecuta a mano con
 * `npm run evidencias:spike` y nunca en CI.
 *
 * Reglas:
 * - Lee CLOUDINARY_* del .env y nunca las imprime, ni a ellas ni a ninguna URL (firmada o no).
 * - Solo crea imagenes sinteticas bajo `aynisafe/`, con carpeta y etiqueta `aynisafe`.
 * - Registra cada public_id en un manifiesto ANTES de subirlo y solo borra los del manifiesto, uno a
 *   uno con destroy. No usa ningun borrado masivo.
 * - El informe guarda codigos HTTP y tiempos, sin credenciales ni URLs.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import {
  CloudinaryEvidenciasAdapter,
  clienteSdk,
  type ClienteCloudinary,
  type CredencialesCloudinary,
} from '../src/modules/reportes/infraestructura/cloudinary-evidencias.adapter';
import { SharpProcesadorAdapter } from '../src/modules/reportes/infraestructura/sharp-procesador.adapter';
import { PublicIdInvalidoError, nuevoPublicId } from '../src/modules/reportes/dominio/evidencia';

export type Estado = 'aprobado' | 'fallido' | 'no_ejecutado' | 'informativo';
export interface Punto {
  readonly id: string;
  readonly titulo: string;
  estado: Estado;
  readonly observaciones: Record<string, unknown>;
}

/** Operaciones del Admin API usadas por el spike (inyectables para la prueba en seco). */
export interface AdminCloudinary {
  /** Cantidad de derivados del recurso, o 'no_existe' si el Admin API responde 404. */
  recurso(publicId: string): Promise<{ derivados: number; carpeta?: unknown; folder?: unknown; limite?: unknown } | 'no_existe'>;
  /** Recursos con la etiqueta `aynisafe` (cualquier tipo de entrega). */
  contarEtiqueta(): Promise<number>;
  /** Resultado de /usage: se espera un rechazo con esta key. */
  uso(): Promise<{ http: number | 'ok' }>;
  descargaPrivada(publicId: string, formato: string, expiraEnSegundosUnix: number): string;
}

export interface DependenciasSpike {
  readonly cred: CredencialesCloudinary;
  readonly cliente: ClienteCloudinary;
  readonly admin: AdminCloudinary;
  readonly fetch: typeof fetch;
  readonly esperar: (ms: number) => Promise<void>;
  readonly ahora: () => number;
  readonly log: (linea: string) => void;
  readonly guardar: (nombre: string, contenido: unknown) => void;
  /** Tope de sondeo tras destroy (por defecto 10 min). */
  readonly topeSondeoMs?: number;
  readonly intervaloSondeoMs?: number;
}

const ETIQUETA_SPIKE = 'aynisafe';

/** Imagen sintetica con EXIF GPS ficticio, sin personas ni datos reales. */
export async function imagenSintetica(): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 200, channels: 3, background: { r: 30, g: 110, b: 90 } } })
    .withExif({
      IFD0: { Make: 'AyniSafeSpike', Model: 'Sintetica' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '13/1 9/1 30/1', GPSLongitudeRef: 'W', GPSLongitude: '74/1 13/1 20/1' },
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function estadoHttp(f: typeof fetch, url: string): Promise<{ estado: number | 'red'; bytes?: Buffer }> {
  try {
    const r = await f(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const bytes = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : undefined;
    if (r.status !== 200) await r.body?.cancel().catch(() => undefined);
    return bytes ? { estado: r.status, bytes } : { estado: r.status };
  } catch {
    return { estado: 'red' };
  }
}

/** Altera un caracter de la firma `s--XXXXXXXX--` sin imprimirla. */
export function alterarFirma(url: string): string {
  return url.replace(/s--([A-Za-z0-9_-]{8})--/, (_m, firma: string) => `s--${firma[0] === 'A' ? 'B' : 'A'}${firma.slice(1)}--`);
}

export async function ejecutarSpike(d: DependenciasSpike): Promise<{ puntos: Punto[]; validado: boolean }> {
  const puntos: Punto[] = [
    { id: 'S1', titulo: 'Subida authenticated con prefijo, carpeta y etiqueta', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S2', titulo: 'Original: sin firma, firma alterada, tipo upload y firma valida', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S3', titulo: 'Derivado sin firma y firmado', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S4', titulo: 'EXIF ausente en la imagen entregada', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S5', titulo: 'destroy con invalidate: original y derivados', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S6', titulo: 'Aislamiento: prefijo, etiqueta y borrado solo por registro', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S7', titulo: 'Cuota: /usage y consumo propio', estado: 'no_ejecutado', observaciones: {} },
    { id: 'S8', titulo: 'Descarga privada con expires_at (referencia)', estado: 'no_ejecutado', observaciones: {} },
  ];
  const p = (id: string) => puntos.find((x) => x.id === id)!;
  const manifiesto: { publicId: string; estado: 'registrado' | 'subido' | 'eliminado' | 'no_existe' | 'fallo_eliminar' }[] = [];
  const guardarManifiesto = () => d.guardar('spike-cloudinary-manifiesto.json', { publicIds: manifiesto });
  const llamadasDestroy: string[] = [];
  let respuestaSubida: Record<string, unknown> | undefined;
  const cliente: ClienteCloudinary = {
    subirStream: async (o, b) => {
      respuestaSubida = await d.cliente.subirStream(o, b);
      return respuestaSubida;
    },
    destruir: async (pid, o) => {
      llamadasDestroy.push(pid);
      return d.cliente.destruir(pid, o);
    },
    url: (pid, o) => d.cliente.url(pid, o),
  };
  const almacen = new CloudinaryEvidenciasAdapter(d.cred, cliente, d.fetch);
  const base = { cloud_name: d.cred.cloudName, api_key: d.cred.apiKey, api_secret: d.cred.apiSecret, secure: true, resource_type: 'image' };
  const publicId = nuevoPublicId(randomUUID());

  try {
    const etiquetaInicial = await d.admin.contarEtiqueta();
    p('S6').observaciones.etiquetaInicial = etiquetaInicial;
    d.log(`Recursos con la etiqueta ${ETIQUETA_SPIKE} al inicio: ${etiquetaInicial}`);

    // S1. Registrar antes de subir.
    const foto = await new SharpProcesadorAdapter().normalizar(await imagenSintetica(), 'image/jpeg');
    manifiesto.push({ publicId, estado: 'registrado' });
    guardarManifiesto();
    const subido = await almacen.subir(publicId, foto.bytes, 'image/jpeg');
    manifiesto[0]!.estado = 'subido';
    guardarManifiesto();
    const r = respuestaSubida ?? {};
    const etiquetas = Array.isArray(r.tags) ? r.tags : [];
    Object.assign(p('S1').observaciones, {
      publicIdConPrefijo: String(r.public_id).startsWith('aynisafe/'),
      tipo: r.type,
      assetFolder: r.asset_folder ?? null,
      folder: r.folder ?? null,
      modoCarpetas: r.asset_folder !== undefined ? 'dinamico' : 'fijo',
      etiquetas,
      bytes: subido.bytes,
    });
    p('S1').estado =
      String(r.public_id) === publicId && r.type === 'authenticated' && etiquetas.includes('aynisafe') &&
      (r.asset_folder === 'aynisafe' || (r.asset_folder === undefined && String(r.public_id).startsWith('aynisafe/')))
        ? 'aprobado'
        : 'fallido';
    d.log(`S1 ${p('S1').estado}`);

    // S2. Original.
    const firmada = d.cliente.url(publicId, { ...base, type: 'authenticated', sign_url: true, format: 'jpg' });
    const sinFirma = d.cliente.url(publicId, { ...base, type: 'authenticated', sign_url: false, format: 'jpg' });
    const tipoUpload = d.cliente.url(publicId, { ...base, type: 'upload', sign_url: false, format: 'jpg' });
    const alterada = alterarFirma(firmada);
    const [eSin, eAlt, eUp, eOk] = [
      await estadoHttp(d.fetch, sinFirma),
      await estadoHttp(d.fetch, alterada),
      await estadoHttp(d.fetch, tipoUpload),
      await estadoHttp(d.fetch, firmada),
    ];
    Object.assign(p('S2').observaciones, {
      sinFirma: eSin.estado,
      firmaAlterada: eAlt.estado,
      firmaAlteradaDistinta: alterada !== firmada,
      tipoUpload: eUp.estado,
      firmaValida: eOk.estado,
      bytesIgualesAlSubido: eOk.bytes ? eOk.bytes.equals(foto.bytes) : false,
    });
    p('S2').estado = eOk.estado === 200 && eSin.estado !== 200 && eAlt.estado !== 200 && eUp.estado !== 200 && alterada !== firmada ? 'aprobado' : 'fallido';
    d.log(`S2 ${p('S2').estado}`);

    // S4. EXIF de lo entregado.
    if (eOk.bytes) {
      const meta = await sharp(eOk.bytes).metadata();
      Object.assign(p('S4').observaciones, {
        exif: meta.exif !== undefined,
        xmp: meta.xmp !== undefined,
        iptc: meta.iptc !== undefined,
        marcaFabricante: eOk.bytes.toString('latin1').includes('AyniSafeSpike'),
      });
      p('S4').estado = !meta.exif && !meta.xmp && !meta.iptc && !eOk.bytes.toString('latin1').includes('AyniSafeSpike') ? 'aprobado' : 'fallido';
    }
    d.log(`S4 ${p('S4').estado}`);

    // S3. Derivado.
    const derivadoSinFirma = d.cliente.url(publicId, { ...base, type: 'authenticated', sign_url: false, width: 64, crop: 'scale', format: 'jpg' });
    const derivadoFirmado = d.cliente.url(publicId, { ...base, type: 'authenticated', sign_url: true, width: 64, crop: 'scale', format: 'jpg' });
    const dSin = await estadoHttp(d.fetch, derivadoSinFirma);
    const dOk = await estadoHttp(d.fetch, derivadoFirmado);
    const recurso = await d.admin.recurso(publicId);
    Object.assign(p('S3').observaciones, {
      derivadoSinFirma: dSin.estado,
      derivadoFirmado: dOk.estado,
      derivadosListados: recurso === 'no_existe' ? 'no_existe' : recurso.derivados,
      limiteAdminApi: recurso === 'no_existe' ? null : (recurso.limite ?? null),
    });
    p('S3').estado = dSin.estado !== 200 && dOk.estado === 200 && recurso !== 'no_existe' && recurso.derivados >= 1 ? 'aprobado' : 'fallido';
    d.log(`S3 ${p('S3').estado}`);

    // S8. Descarga privada con expires_at (solo referencia; no cambia la decision 8).
    const ahoraSeg = Math.floor(d.ahora() / 1000);
    const vencida = await estadoHttp(d.fetch, d.admin.descargaPrivada(publicId, 'jpg', ahoraSeg - 60));
    const vigente = await estadoHttp(d.fetch, d.admin.descargaPrivada(publicId, 'jpg', ahoraSeg + 120));
    Object.assign(p('S8').observaciones, { vencida: vencida.estado, vigente: vigente.estado });
    p('S8').estado = 'informativo';
    d.log(`S8 vencida=${vencida.estado} vigente=${vigente.estado}`);

    // S7. Cuota.
    const uso = await d.admin.uso();
    Object.assign(p('S7').observaciones, { usage: uso.http, bytesPropios: subido.bytes, objetosPropios: 1 });
    p('S7').estado = uso.http === 'ok' ? 'informativo' : 'aprobado';
    d.log(`S7 /usage=${uso.http}`);

    // S6 (parte 1). Un public_id ajeno no llega al proveedor.
    const antes = llamadasDestroy.length;
    let rechazado = false;
    try {
      await almacen.eliminar('otro-proyecto/3f2b8c1e-5a4d-4e6f-9b7a-0c1d2e3f4a5b');
    } catch (e) {
      rechazado = e instanceof PublicIdInvalidoError;
    }
    p('S6').observaciones.ajenoRechazadoSinLlamar = rechazado && llamadasDestroy.length === antes;

    // S5. destroy e invalidacion.
    const inicio = d.ahora();
    const resultado = await almacen.eliminar(publicId);
    manifiesto[0]!.estado = resultado;
    guardarManifiesto();
    const despues = await d.admin.recurso(publicId);
    const tope = d.topeSondeoMs ?? 10 * 60_000;
    const intervalo = d.intervaloSondeoMs ?? 10_000;
    let originalCae: number | null = null;
    let derivadoCae: number | null = null;
    let ultimoOriginal: number | 'red' = 0;
    let ultimoDerivado: number | 'red' = 0;
    for (;;) {
      const transcurrido = d.ahora() - inicio;
      if (originalCae === null) {
        ultimoOriginal = (await estadoHttp(d.fetch, firmada)).estado;
        if (ultimoOriginal !== 200) originalCae = transcurrido;
      }
      if (derivadoCae === null) {
        ultimoDerivado = (await estadoHttp(d.fetch, derivadoFirmado)).estado;
        if (ultimoDerivado !== 200) derivadoCae = transcurrido;
      }
      if ((originalCae !== null && derivadoCae !== null) || transcurrido >= tope) break;
      await d.esperar(intervalo);
    }
    Object.assign(p('S5').observaciones, {
      resultadoDestroy: resultado,
      adminTrasDestroy: despues === 'no_existe' ? 404 : 'existe',
      originalDejaDeServirseMs: originalCae,
      derivadoDejaDeServirseMs: derivadoCae,
      ultimoEstadoOriginal: ultimoOriginal,
      ultimoEstadoDerivado: ultimoDerivado,
      topeSondeoMs: tope,
    });
    p('S5').estado = resultado === 'eliminado' && despues === 'no_existe' && originalCae !== null && derivadoCae !== null ? 'aprobado' : 'fallido';
    d.log(`S5 ${p('S5').estado}`);

    // S6 (parte 2). Etiqueta de vuelta al inicio y destroy solo de lo registrado.
    const etiquetaFinal = await d.admin.contarEtiqueta();
    const registrados = new Set(manifiesto.map((m) => m.publicId));
    Object.assign(p('S6').observaciones, {
      etiquetaFinal,
      destroySoloRegistrados: llamadasDestroy.every((x) => registrados.has(x)),
      llamadasDestroy: llamadasDestroy.length,
    });
    p('S6').estado =
      p('S6').observaciones.ajenoRechazadoSinLlamar === true && etiquetaFinal === etiquetaInicial && p('S6').observaciones.destroySoloRegistrados === true
        ? 'aprobado'
        : 'fallido';
    d.log(`S6 ${p('S6').estado}`);
  } catch (e) {
    const actual = puntos.find((x) => x.estado === 'no_ejecutado');
    if (actual) {
      actual.estado = 'fallido';
      actual.observaciones.error = e instanceof Error ? e.name : 'desconocido';
      // Solo la causa ya saneada por el adaptador (p. ej. http_401), nunca el mensaje del SDK.
      const causa = (e as { causa?: unknown; motivo?: unknown }).causa ?? (e as { motivo?: unknown }).motivo;
      if (typeof causa === 'string') actual.observaciones.causa = causa;
    }
    d.log(`Spike interrumpido en ${actual?.id ?? '?'} (${e instanceof Error ? e.name : 'error'}${typeof actual?.observaciones.causa === 'string' ? `, ${actual.observaciones.causa}` : ''})`);
  } finally {
    // Limpieza: solo lo registrado en el manifiesto y aun no eliminado.
    for (const m of manifiesto) {
      if (m.estado === 'eliminado' || m.estado === 'no_existe') continue;
      try {
        m.estado = await almacen.eliminar(m.publicId);
      } catch {
        m.estado = 'fallo_eliminar';
      }
    }
    guardarManifiesto();
  }
  const validado = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].every((id) => p(id).estado === 'aprobado');
  d.guardar('spike-cloudinary.json', {
    fecha: new Date(d.ahora()).toISOString(),
    validado,
    puntos,
    manifiesto: manifiesto.map((m) => ({ estado: m.estado })),
  });
  d.log(validado ? 'Spike: S1-S6 aprobados.' : 'Spike: hay puntos fallidos o no ejecutados; el proveedor sigue pendiente.');
  return { puntos, validado };
}

function codigoHttp(e: unknown): number | undefined {
  const c = (e as { http_code?: unknown; error?: { http_code?: unknown } } | null) ?? {};
  const v = c.http_code ?? c.error?.http_code;
  return typeof v === 'number' ? v : undefined;
}

export function adminReal(cred: CredencialesCloudinary): AdminCloudinary {
  const o = { cloud_name: cred.cloudName, api_key: cred.apiKey, api_secret: cred.apiSecret };
  return {
    async recurso(publicId) {
      try {
        const r = (await cloudinary.api.resource(publicId, { ...o, resource_type: 'image', type: 'authenticated' })) as Record<string, unknown>;
        return {
          derivados: Array.isArray(r.derived) ? r.derived.length : 0,
          carpeta: r.asset_folder,
          folder: r.folder,
          limite: { permitido: r.rate_limit_allowed, restante: r.rate_limit_remaining },
        };
      } catch (e) {
        if (codigoHttp(e) === 404) return 'no_existe';
        throw new Error(`Admin API resource http_${codigoHttp(e) ?? 'sin_codigo'}`);
      }
    },
    async contarEtiqueta() {
      let total = 0;
      let cursor: string | undefined;
      do {
        const r = (await cloudinary.api.resources_by_tag(ETIQUETA_SPIKE, {
          ...o,
          resource_type: 'image',
          max_results: 500,
          ...(cursor ? { next_cursor: cursor } : {}),
        })) as { resources?: unknown[]; next_cursor?: string };
        total += r.resources?.length ?? 0;
        cursor = r.next_cursor;
      } while (cursor);
      return total;
    },
    async uso() {
      try {
        await cloudinary.api.usage(o);
        return { http: 'ok' };
      } catch (e) {
        return { http: codigoHttp(e) ?? 0 };
      }
    },
    descargaPrivada(publicId, formato, expira) {
      return cloudinary.utils.private_download_url(publicId, formato, { ...o, type: 'authenticated', expires_at: expira });
    },
  };
}

async function principal(): Promise<number> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET en el .env (no se muestran valores).');
    return 1;
  }
  const cred = { cloudName, apiKey, apiSecret };
  const carpeta = resolve(__dirname, '../../../docs/validacion/p5');
  mkdirSync(carpeta, { recursive: true });
  const { validado } = await ejecutarSpike({
    cred,
    cliente: clienteSdk,
    admin: adminReal(cred),
    fetch,
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
    ahora: () => Date.now(),
    log: (l) => console.log(l),
    guardar: (nombre, contenido) => writeFileSync(resolve(carpeta, nombre), `${JSON.stringify(contenido, null, 2)}\n`),
  });
  return validado ? 0 : 2;
}

if (require.main === module) {
  principal().then(
    (c) => (process.exitCode = c),
    (e) => {
      console.error(`Spike fallido: ${e instanceof Error ? e.name : 'error'}`);
      process.exitCode = 1;
    },
  );
}
