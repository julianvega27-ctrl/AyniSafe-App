import 'dotenv/config';
import type { PoliticaLimites } from '../modules/identidad/aplicacion/politica-limites';
import { POLITICA_LIMITES_POR_DEFECTO } from '../modules/identidad/aplicacion/politica-limites';

export interface Entorno {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly puerto: number;
  readonly saltosProxyConfianza: number;
  readonly urlBaseDeDatos: string;
  /** Secreto para derivar con HMAC las claves del limitador. Nunca se registra. */
  readonly secretoLimitador: string;
  readonly politicaLimites: PoliticaLimites;
  readonly hashMaxConcurrencia: number;
  readonly hashMaxCola: number;
}

const SECRETO_MIN = 32;

function entero(nombre: string, valor: string | undefined, defecto: number, min: number, max: number): number {
  if (valor === undefined || valor === '') return defecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Configuracion invalida: ${nombre} debe ser un entero entre ${min} y ${max}`);
  }
  return n;
}

function obligatoria(nombre: string, valor: string | undefined): string {
  if (valor === undefined || valor === '') {
    throw new Error(`Configuracion incompleta: falta ${nombre} (ver .env.example)`);
  }
  return valor;
}

/** Lee y valida la configuracion. Los mensajes de error nunca incluyen valores. */
export function cargarEntorno(env: NodeJS.ProcessEnv = process.env): Entorno {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('Configuracion invalida: NODE_ENV debe ser development, test o production');
  }
  const secretoLimitador = obligatoria('RATE_LIMIT_HMAC_SECRET', env.RATE_LIMIT_HMAC_SECRET);
  if (secretoLimitador.length < SECRETO_MIN) {
    throw new Error(`Configuracion invalida: RATE_LIMIT_HMAC_SECRET debe tener al menos ${SECRETO_MIN} caracteres`);
  }
  return {
    nodeEnv,
    puerto: entero('PORT', env.PORT, 3000, 1, 65535),
    saltosProxyConfianza: entero('TRUST_PROXY_HOPS', env.TRUST_PROXY_HOPS, 0, 0, 5),
    urlBaseDeDatos: obligatoria('DATABASE_URL', env.DATABASE_URL),
    secretoLimitador,
    politicaLimites: {
      registroPorIp: entero('RL_REGISTRO_IP_MAX', env.RL_REGISTRO_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.registroPorIp, 1, 100000),
      loginPorIp: entero('RL_LOGIN_IP_MAX', env.RL_LOGIN_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.loginPorIp, 1, 100000),
      loginPorCorreoIp: entero('RL_LOGIN_CORREO_IP_MAX', env.RL_LOGIN_CORREO_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.loginPorCorreoIp, 1, 100000),
    },
    hashMaxConcurrencia: entero('HASH_MAX_CONCURRENCIA', env.HASH_MAX_CONCURRENCIA, 4, 1, 64),
    hashMaxCola: entero('HASH_MAX_COLA', env.HASH_MAX_COLA, 16, 0, 1000),
  };
}
