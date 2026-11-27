import { v2 as cloudinary } from 'cloudinary';
import { MAX_BYTES_FOTO, exigirPublicId, type TipoMedio } from '../dominio/evidencia';
import {
  CuotaProveedorError,
  ProveedorNoDisponibleError,
  RespuestaInvalidaError,
  type AlmacenEvidenciasPort,
  type ObjetoAlmacenado,
} from '../aplicacion/puertos/evidencias.port';

/** Credenciales: nunca se registran ni se incluyen en errores. */
export interface CredencialesCloudinary {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

/** Lo minimo del SDK que usa el adaptador; inyectable para pruebas sin red. */
export interface ClienteCloudinary {
  subirStream(opciones: Record<string, unknown>, bytes: Buffer): Promise<Record<string, unknown>>;
  destruir(publicId: string, opciones: Record<string, unknown>): Promise<Record<string, unknown>>;
  url(publicId: string, opciones: Record<string, unknown>): string;
}

export const clienteSdk: ClienteCloudinary = {
  subirStream: (opciones, bytes) =>
    new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(opciones, (error, r) => (error ? reject(error) : resolve((r ?? {}) as Record<string, unknown>)));
      stream.once('error', reject);
      stream.end(bytes);
    }),
  destruir: (publicId, opciones) => cloudinary.uploader.destroy(publicId, opciones) as Promise<Record<string, unknown>>,
  url: (publicId, opciones) => cloudinary.url(publicId, opciones),
};

const EXTENSION: Readonly<Record<TipoMedio, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FORMATO: Readonly<Record<string, TipoMedio>> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const CARPETA = 'aynisafe';
export const ETIQUETA = 'aynisafe';
const TIMEOUT_MS = 15_000;

/** Solo el codigo HTTP, nunca el mensaje (puede contener la URL o la cuenta). */
function causaDe(e: unknown): string {
  const c = (e as { http_code?: unknown; error?: { http_code?: unknown } } | null) ?? {};
  const codigo = typeof c.http_code === 'number' ? c.http_code : typeof c.error?.http_code === 'number' ? c.error.http_code : undefined;
  return codigo === undefined ? 'sin_codigo' : `http_${codigo}`;
}

function esCuota(e: unknown): boolean {
  const c = (e as { http_code?: unknown; message?: unknown; error?: { http_code?: unknown; message?: unknown } } | null) ?? {};
  const codigo = c.http_code ?? c.error?.http_code;
  const mensaje = String(c.message ?? c.error?.message ?? '');
  return codigo === 420 || /quota|limit exceeded|usage limit|plan limit/i.test(mensaje);
}

/**
 * Almacen privado en Cloudinary (ADR-006; design, decision 3). Cuenta compartida: todo objeto vive
 * bajo `aynisafe/`, en la carpeta `aynisafe` y con la etiqueta `aynisafe`. Entrega `authenticated`:
 * la URL firmada se usa solo aqui para descargar y nunca sale del servidor. Se borra solo por
 * `public_id`; este modulo no expone ni usa borrado por prefijo, etiqueta o carpeta.
 */
export class CloudinaryEvidenciasAdapter implements AlmacenEvidenciasPort {
  readonly proveedor = 'cloudinary' as const;
  private readonly base: Record<string, unknown>;

  constructor(
    cred: CredencialesCloudinary,
    private readonly cliente: ClienteCloudinary = clienteSdk,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = { cloud_name: cred.cloudName, api_key: cred.apiKey, api_secret: cred.apiSecret, secure: true };
  }

  async subir(publicId: string, bytes: Buffer, tipo: TipoMedio): Promise<ObjetoAlmacenado> {
    exigirPublicId(publicId);
    let r: Record<string, unknown>;
    try {
      r = await this.cliente.subirStream(
        {
          ...this.base,
          resource_type: 'image',
          type: 'authenticated',
          public_id: publicId,
          asset_folder: CARPETA,
          tags: [ETIQUETA],
          overwrite: false,
          unique_filename: false,
          use_filename: false,
          timeout: TIMEOUT_MS,
        },
        bytes,
      );
    } catch (e) {
      if (esCuota(e)) throw new CuotaProveedorError();
      throw new ProveedorNoDisponibleError(causaDe(e));
    }
    if (r.public_id !== publicId) throw new RespuestaInvalidaError('public_id');
    if (r.type !== 'authenticated') throw new RespuestaInvalidaError('tipo');
    if (r.resource_type !== undefined && r.resource_type !== 'image') throw new RespuestaInvalidaError('recurso');
    const formato = typeof r.format === 'string' ? FORMATO[r.format] : undefined;
    if (formato !== tipo) throw new RespuestaInvalidaError('formato');
    const tamano = typeof r.bytes === 'number' ? r.bytes : -1;
    if (tamano < 1 || tamano > MAX_BYTES_FOTO) throw new RespuestaInvalidaError('bytes');
    return { publicId, tipo, bytes: tamano };
  }

  async obtener(publicId: string, tipo: TipoMedio): Promise<Buffer> {
    exigirPublicId(publicId);
    const url = this.cliente.url(publicId, {
      ...this.base,
      resource_type: 'image',
      type: 'authenticated',
      sign_url: true,
      format: EXTENSION[tipo],
    });
    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    } catch {
      throw new ProveedorNoDisponibleError('red');
    }
    if (!respuesta.ok) throw new ProveedorNoDisponibleError(`http_${respuesta.status}`);
    const declarado = Number(respuesta.headers.get('content-length') ?? '0');
    if (declarado > MAX_BYTES_FOTO) throw new ProveedorNoDisponibleError('demasiado_grande');
    if (!respuesta.body) throw new ProveedorNoDisponibleError('sin_cuerpo');
    const partes: Buffer[] = [];
    let total = 0;
    try {
      for await (const parte of respuesta.body as unknown as AsyncIterable<Uint8Array>) {
        total += parte.length;
        if (total > MAX_BYTES_FOTO) throw new ProveedorNoDisponibleError('demasiado_grande');
        partes.push(Buffer.from(parte));
      }
    } catch (e) {
      if (e instanceof ProveedorNoDisponibleError) throw e;
      throw new ProveedorNoDisponibleError('lectura');
    }
    return Buffer.concat(partes);
  }

  async eliminar(publicId: string): Promise<'eliminado' | 'no_existe'> {
    exigirPublicId(publicId);
    let r: Record<string, unknown>;
    try {
      r = await this.cliente.destruir(publicId, {
        ...this.base,
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
        timeout: TIMEOUT_MS,
      });
    } catch (e) {
      throw new ProveedorNoDisponibleError(causaDe(e));
    }
    if (r.result === 'ok') return 'eliminado';
    if (r.result === 'not found') return 'no_existe';
    throw new RespuestaInvalidaError('destroy');
  }
}
