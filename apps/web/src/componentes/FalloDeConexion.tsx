import { Boton } from './Boton';
import { Mensaje } from './Mensaje';

interface Props {
  readonly tipo: 'red' | 'servicio';
  readonly onReintentar: () => void;
  readonly ocupado?: boolean;
}

/**
 * Problema de conexion o de servicio: se explica con texto e icono y se ofrece «Reintentar». Nunca
 * afirma que una accion se completo ni reintenta por su cuenta.
 */
export function FalloDeConexion({ tipo, onReintentar, ocupado }: Props) {
  const accion = (
    <Boton variante="secundario" onClick={onReintentar} cargando={ocupado}>
      Reintentar
    </Boton>
  );
  if (tipo === 'red') {
    return (
      <Mensaje tipo="error" titulo="Sin conexión" accion={accion}>
        No pudimos conectar con AyniSafe. Revisa tu conexión a internet e inténtalo de nuevo.
      </Mensaje>
    );
  }
  return (
    <Mensaje tipo="aviso" titulo="El servicio no está disponible" accion={accion}>
      El servicio puede estar iniciándose y tardar hasta un minuto en responder. Inténtalo de nuevo en unos momentos.
    </Mensaje>
  );
}
