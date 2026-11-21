import type { RedactorCorreo } from '../aplicacion/procesar-envios-correo.use-case';
import { VIGENCIA_TOKEN_MS, type PropositoToken } from '../dominio/token-cuenta';

/** Ruta de la pagina de respaldo y de los App Links para cada proposito. */
export const RUTA_ENLACE: Readonly<Record<PropositoToken, string>> = {
  recuperacion: '/cuenta/restablecer',
  activacion: '/cuenta/activar',
};

function vigenciaEnTexto(proposito: PropositoToken): string {
  const minutos = VIGENCIA_TOKEN_MS[proposito] / 60_000;
  return minutos >= 120 ? `${minutos / 60} horas` : `${minutos} minutos`;
}

/**
 * Redacta correos de texto plano, sin HTML ni seguimiento. El token viaja en el fragmento del
 * enlace (`#t=`), que no se envia al servidor ni queda en sus registros de acceso, y tambien como
 * codigo para pegarlo a mano si el enlace no abre la app.
 */
export class RedactorCorreoTextoPlano implements RedactorCorreo {
  /** `urlBase` es el origen publico de la API, sin barra final (por ejemplo https://api.ejemplo.pe). */
  constructor(private readonly urlBase: string) {}

  redactar(d: {
    tipo: PropositoToken;
    nombre: string;
    token: string;
    expiresAt: Date;
  }): { asunto: string; texto: string } {
    const enlace = `${this.urlBase}${RUTA_ENLACE[d.tipo]}#t=${d.token}`;
    const vigencia = vigenciaEnTexto(d.tipo);
    if (d.tipo === 'recuperacion') {
      return {
        asunto: 'Restablece tu contraseña de AyniSafe',
        texto: [
          `Hola, ${d.nombre}:`,
          '',
          'Recibimos una solicitud para restablecer la contraseña de tu cuenta de AyniSafe.',
          '',
          `Abre este enlace para elegir una contraseña nueva. Vale ${vigencia} y solo se puede usar una vez:`,
          enlace,
          '',
          'Si el enlace no abre la app, copia este código y pégalo en «Tengo un código», dentro de la pantalla de recuperación:',
          d.token,
          '',
          'Solo el enlace más reciente es válido. Si no pediste este cambio, ignora este mensaje: tu contraseña no cambiará.',
          '',
          'AyniSafe',
        ].join('\n'),
      };
    }
    return {
      asunto: 'Activa tu cuenta de AyniSafe',
      texto: [
        `Hola, ${d.nombre}:`,
        '',
        'Se creó una cuenta para ti en AyniSafe. Para activarla, elige tu contraseña desde este enlace. Vale ' +
          `${vigencia} y solo se puede usar una vez:`,
        enlace,
        '',
        'Si el enlace no se abre, copia este código y úsalo en la pantalla de activación:',
        d.token,
        '',
        'Solo el enlace más reciente es válido. Si no esperabas esta invitación, ignora este mensaje: nadie podrá entrar con tu correo sin activar la cuenta.',
        '',
        'AyniSafe',
      ].join('\n'),
    };
  }
}
