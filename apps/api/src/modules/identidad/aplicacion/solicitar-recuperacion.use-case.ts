import { CuotaCorreoAgotadaError, ValidacionError } from '../dominio/errores';
import { PLAZO_ENVIO_MS } from '../dominio/envio-correo';
import { esCiudadanoActivo } from '../dominio/usuario';
import { validarSolicitudRecuperacion } from '../dominio/validacion';
import { aplicarLimites } from './limitar';
import type { PoliticaLimites } from './politica-limites';
import type { CuentasPort } from './puertos/cuentas.port';
import type { EnviosCorreoPort } from './puertos/envios-correo.port';
import type { LimitadorPort } from './puertos/limitador.port';
import type { RelojPort } from './puertos/reloj.port';

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

export interface SolicitarRecuperacionComando {
  readonly cuerpo: unknown;
  readonly ip: string;
}

/**
 * Solicitud de recuperacion de contrasena. La respuesta es la misma exista o no la cuenta (la
 * funcion no devuelve nada): solo una cuenta ciudadana activa genera un envio, que se entrega
 * despues del commit. Nunca se espera al proveedor de correo.
 */
export class SolicitarRecuperacionUseCase {
  constructor(
    private readonly cuentas: CuentasPort,
    private readonly envios: EnviosCorreoPort,
    private readonly limitador: LimitadorPort,
    private readonly reloj: RelojPort,
    private readonly politica: PoliticaLimites,
    /** Avisa a la cola que hay trabajo nuevo; no debe esperar ni fallar la solicitud. */
    private readonly despertarCola: () => void,
  ) {}

  async ejecutar(comando: SolicitarRecuperacionComando): Promise<void> {
    const validado = validarSolicitudRecuperacion(comando.cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const { correoNormalizado } = validado.valor;
    const ahora = this.reloj.ahora();

    // Se cuentan las solicitudes sintacticamente validas, exista o no la cuenta.
    await aplicarLimites(
      this.limitador,
      [
        { tipo: 'recuperacion_ip', identificador: comando.ip, maximo: this.politica.recuperacionPorIp },
        {
          tipo: 'recuperacion_correo_ip',
          identificador: `${correoNormalizado}|${comando.ip}`,
          maximo: this.politica.recuperacionPorCorreoIp,
        },
        {
          tipo: 'recuperacion_correo',
          identificador: correoNormalizado,
          maximo: this.politica.recuperacionPorCorreo,
          ventanaMs: HORA_MS,
        },
      ],
      ahora,
    );

    // Tope diario global: solo gasta cuota una solicitud que ya paso los limites por IP/correo.
    const cuota = await this.limitador.consumir(
      [{ tipo: 'correo_dia', identificador: 'global', maximo: this.politica.correoDiarioMax, ventanaMs: DIA_MS }],
      ahora,
    );
    if (!cuota.permitido) throw new CuotaCorreoAgotadaError(cuota.reintentarEnSegundos);

    const usuario = await this.cuentas.buscarPorCorreo(correoNormalizado);
    if (!usuario || !esCiudadanoActivo(usuario)) return;

    const encolado = await this.envios.encolar({
      usuarioId: usuario.id,
      tipo: 'recuperacion',
      creadoAt: ahora,
      venceAt: new Date(ahora.getTime() + PLAZO_ENVIO_MS.recuperacion),
    });
    if (encolado) this.despertarCola();
  }
}
