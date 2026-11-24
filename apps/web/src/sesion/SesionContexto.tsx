import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type Resultado, type UsuarioInstitucional } from '../api/cliente';

/**
 * Estado de la sesion de la web. La fuente de verdad es SIEMPRE el servidor: se consulta al cargar y
 * nunca se persiste nada en el navegador (la cookie es HttpOnly). Decidir permisos con este estado es
 * solo experiencia de usuario; la API vuelve a comprobarlo en cada peticion.
 */
export type EstadoSesion =
  | { readonly estado: 'cargando' }
  /** `causa: 'cierre'`: la persona cerro sesion a proposito (el guard la lleva a la portada, no al acceso). */
  | { readonly estado: 'anonimo'; readonly causa?: 'cierre' }
  | { readonly estado: 'autenticado'; readonly usuario: UsuarioInstitucional }
  /** No se pudo saber si hay sesion (red o servicio): no se asume ni valida ni invalida. */
  | { readonly estado: 'error'; readonly causa: 'red' | 'servicio' };

interface ContextoSesion {
  readonly sesion: EstadoSesion;
  /** Vuelve a consultar al servidor. */
  readonly restaurar: () => Promise<void>;
  readonly ingresar: (correo: string, contrasena: string) => Promise<Resultado<UsuarioInstitucional>>;
  /** Revoca la sesion en el servidor; solo descarta la local si el servidor lo confirmo. */
  readonly salir: () => Promise<Resultado<undefined>>;
  /** La API respondio 401 durante el uso: la sesion ya no es valida. */
  readonly expirar: () => void;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: 'cargando' });
  const generacion = useRef(0);

  const restaurar = useCallback(async () => {
    const mia = ++generacion.current;
    setSesion({ estado: 'cargando' });
    const r = await api.consultarSesion();
    if (mia !== generacion.current) return; // una operacion mas reciente (ingresar/salir) manda
    if (r.tipo === 'ok') setSesion({ estado: 'autenticado', usuario: r.datos.usuario });
    else if (r.tipo === 'error' && r.estado === 401) setSesion({ estado: 'anonimo' });
    else if (r.tipo === 'red') setSesion({ estado: 'error', causa: 'red' });
    else setSesion({ estado: 'error', causa: 'servicio' });
  }, []);

  useEffect(() => {
    // Consulta inicial al cargar o refrescar el navegador.
    void restaurar();
  }, [restaurar]);

  const ingresar = useCallback(async (correo: string, contrasena: string): Promise<Resultado<UsuarioInstitucional>> => {
    const r = await api.iniciarSesion(correo, contrasena);
    if (r.tipo === 'ok') {
      generacion.current++;
      setSesion({ estado: 'autenticado', usuario: r.datos.usuario });
      return { tipo: 'ok', datos: r.datos.usuario };
    }
    return r;
  }, []);

  const salir = useCallback(async (): Promise<Resultado<undefined>> => {
    const r = await api.cerrarSesion();
    // Solo se descarta la sesion local si el servidor confirmo la revocacion (204).
    if (r.tipo === 'ok') {
      generacion.current++;
      setSesion({ estado: 'anonimo', causa: 'cierre' });
    }
    return r;
  }, []);

  const expirar = useCallback(() => {
    generacion.current++;
    setSesion({ estado: 'anonimo' });
  }, []);

  const valor = useMemo(() => ({ sesion, restaurar, ingresar, salir, expirar }), [sesion, restaurar, ingresar, salir, expirar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return c;
}
