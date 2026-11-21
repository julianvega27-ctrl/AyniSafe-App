import 'cliente_http.dart';

/// Perfil del propio ciudadano devuelto por `/perfil`. El correo es de solo lectura y nunca se
/// presenta como verificado. No contiene hash ni datos internos.
class PerfilCiudadano {
  const PerfilCiudadano({
    required this.id,
    required this.nombre,
    required this.correo,
    required this.telefono,
    required this.compartirTelefono,
  });

  final String id;
  final String nombre;
  final String correo;
  final String? telefono;

  /// Autorización vigente para compartir el teléfono. Por ahora solo se guarda: nadie lo recibe.
  final bool compartirTelefono;

  static PerfilCiudadano? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final id = json['id'];
    final nombre = json['nombre'];
    final correo = json['correo'];
    final telefono = json['telefono'];
    final compartir = json['compartirTelefono'];
    if (id is String &&
        nombre is String &&
        correo is String &&
        (telefono == null || telefono is String) &&
        compartir is bool) {
      return PerfilCiudadano(
        id: id,
        nombre: nombre,
        correo: correo,
        telefono: telefono as String?,
        compartirTelefono: compartir,
      );
    }
    return null;
  }
}

/// Resultados de GET y PATCH `/perfil`.
sealed class ResultadoPerfil {
  const ResultadoPerfil();
}

final class PerfilObtenido extends ResultadoPerfil {
  const PerfilObtenido(this.perfil);
  final PerfilCiudadano perfil;
}

/// 401: la sesión ya no es válida. La app debe volver al acceso.
final class PerfilSesionInvalida extends ResultadoPerfil {
  const PerfilSesionInvalida();
}

/// 400: errores por campo (`nombre`, `telefono`, `compartirTelefono`, `cuerpo`).
final class PerfilCamposInvalidos extends ResultadoPerfil {
  const PerfilCamposInvalidos(this.campos);
  final Map<String, String> campos;
}

final class PerfilSinConexion extends ResultadoPerfil {
  const PerfilSinConexion();
}

final class PerfilNoDisponible extends ResultadoPerfil {
  const PerfilNoDisponible();
}

final class PerfilErrorInesperado extends ResultadoPerfil {
  const PerfilErrorInesperado(this.requestId);
  final String? requestId;
}

/// Repositorio del perfil sobre la API REST. Sin reintentos automáticos. El teléfono y el
/// nombre nunca se registran.
class PerfilRepositorio {
  PerfilRepositorio(this._http);

  final ClienteHttp _http;

  Future<ResultadoPerfil> obtener(String token) =>
      _enviar('GET', token: token);

  /// Envía solo los campos presentes en [cambios] (`nombre`, `telefono`, `compartirTelefono`).
  /// `telefono: null` borra el teléfono.
  Future<ResultadoPerfil> actualizar(
    String token,
    Map<String, Object?> cambios,
  ) => _enviar('PATCH', token: token, cuerpo: cambios);

  Future<ResultadoPerfil> _enviar(
    String metodo, {
    required String token,
    Map<String, Object?>? cuerpo,
  }) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(metodo, '/perfil', token: token, cuerpo: cuerpo);
    } on Exception {
      return const PerfilSinConexion();
    }
    switch (r.estado) {
      case 200:
        final perfil = PerfilCiudadano.desdeJson(r.cuerpo);
        return perfil == null
            ? PerfilErrorInesperado(_requestId(r))
            : PerfilObtenido(perfil);
      case 400:
        final campos = _campos(r);
        return campos.isEmpty
            ? PerfilErrorInesperado(_requestId(r))
            : PerfilCamposInvalidos(campos);
      case 401:
        return const PerfilSesionInvalida();
      case 503:
        return const PerfilNoDisponible();
      default:
        return PerfilErrorInesperado(_requestId(r));
    }
  }

  Map<String, String> _campos(RespuestaApi r) {
    final error = r.cuerpo?['error'];
    final campos = error is Map<String, dynamic> ? error['fields'] : null;
    if (campos is! Map<String, dynamic>) return const {};
    return {
      for (final e in campos.entries)
        if (e.value is String) e.key: e.value as String,
    };
  }

  String? _requestId(RespuestaApi r) {
    final error = r.cuerpo?['error'];
    final id = error is Map<String, dynamic> ? error['requestId'] : null;
    return id is String ? id : null;
  }
}
