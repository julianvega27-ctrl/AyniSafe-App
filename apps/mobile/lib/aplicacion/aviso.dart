/// Mensaje general de un formulario (texto + tipo; la UI añade el icono, no solo color).
enum TipoAviso { error, info, exito }

/// Acción opcional que acompaña a un aviso.
enum AccionAviso { iniciarSesion }

class Aviso {
  const Aviso(this.tipo, this.texto, {this.accion});

  final TipoAviso tipo;
  final String texto;
  final AccionAviso? accion;
}

/// Texto de espera para respuestas 429: cuánto esperar y cuándo se podrá reintentar.
String textoDeEspera(int segundos, DateTime ahora) {
  final cuando = ahora.add(Duration(seconds: segundos));
  final hh = cuando.hour.toString().padLeft(2, '0');
  final mm = cuando.minute.toString().padLeft(2, '0');
  final String cuanto;
  if (segundos < 60) {
    cuanto = '$segundos segundos';
  } else {
    final minutos = (segundos / 60).ceil();
    cuanto = minutos == 1 ? '1 minuto' : '$minutos minutos';
  }
  return 'Espera $cuanto antes de volver a intentar. Podrás reintentar a las $hh:$mm.';
}

String textoErrorInesperado(String? requestId) {
  final base = 'Ocurrió un error inesperado.';
  return requestId == null
      ? '$base Inténtalo de nuevo.'
      : '$base Si persiste, indica este código: $requestId.';
}

const String textoServicioNoDisponible =
    'El servicio no está disponible por ahora. Inténtalo de nuevo en unos minutos.';
