import 'package:app_links/app_links.dart';

import 'resultados_recuperacion.dart';

/// Enlace de recuperación o activación recibido del correo. Solo existe en memoria.
class EnlaceCuenta {
  const EnlaceCuenta({required this.esperado, required this.token});

  /// Propósito que anuncia la ruta del enlace. La verdad la confirma el servidor al consultar.
  final PropositoToken esperado;

  /// Token del fragmento. Nunca se registra, se guarda ni se muestra.
  final String token;
}

final RegExp _fragmento = RegExp(r'^t=([A-Za-z0-9_-]{20,200})$');

/// Interpreta un enlace `https://<api>/cuenta/(restablecer|activar)#t=<token>`. Devuelve null si no
/// tiene esa forma. No valida el host: el sistema solo entrega a la app los enlaces de su dominio
/// verificado, y el servidor decide si el token es válido.
EnlaceCuenta? interpretarEnlace(Uri uri) {
  if (uri.scheme != 'https') return null;
  final PropositoToken esperado;
  switch (uri.path) {
    case '/cuenta/restablecer':
      esperado = PropositoToken.recuperacion;
    case '/cuenta/activar':
      esperado = PropositoToken.activacion;
    default:
      return null;
  }
  final token = _fragmento.firstMatch(uri.fragment)?.group(1);
  if (token == null) return null;
  return EnlaceCuenta(esperado: esperado, token: token);
}

/// Origen de los enlaces entrantes (App Links de Android). Abstracto para poder probarlo.
abstract class FuenteDeEnlaces {
  /// Incluye el enlace con el que se abrió la app (arranque en frío) y los siguientes.
  Stream<Uri> get recibidos;
}

/// Implementación real sobre `app_links`.
class FuenteDeEnlacesAppLinks implements FuenteDeEnlaces {
  FuenteDeEnlacesAppLinks([AppLinks? enlaces]) : _enlaces = enlaces ?? AppLinks();

  final AppLinks _enlaces;

  @override
  Stream<Uri> get recibidos => _enlaces.uriLinkStream;
}
