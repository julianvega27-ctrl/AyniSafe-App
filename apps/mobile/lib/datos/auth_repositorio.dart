import 'cliente_http.dart';
import 'resultados_recuperacion.dart';

export 'resultados_recuperacion.dart';

/// Identidad básica del ciudadano devuelta por la API. Nunca incluye hash ni datos internos.
class UsuarioSesion {
  const UsuarioSesion({
    required this.id,
    required this.nombre,
    required this.correo,
  });

  final String id;
  final String nombre;
  final String correo;

  static UsuarioSesion? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final id = json['id'];
    final nombre = json['nombre'];
    final correo = json['correo'];
    if (id is String && nombre is String && correo is String) {
      return UsuarioSesion(id: id, nombre: nombre, correo: correo);
    }
    return null;
  }
}

/// Resultados de POST /auth/ciudadanos/registro.
sealed class ResultadoRegistro {
  const ResultadoRegistro();
}

final class RegistroExitoso extends ResultadoRegistro {
  const RegistroExitoso(this.usuario);
  final UsuarioSesion usuario;
}

final class RegistroInvalido extends ResultadoRegistro {
  const RegistroInvalido(this.campos);
  final Map<String, String> campos;
}

final class RegistroCorreoEnUso extends ResultadoRegistro {
  const RegistroCorreoEnUso();
}

final class RegistroLimite extends ResultadoRegistro {
  const RegistroLimite(this.esperaSegundos);
  final int esperaSegundos;
}

final class RegistroNoDisponible extends ResultadoRegistro {
  const RegistroNoDisponible();
}

/// La respuesta no llegó (red, timeout): la cuenta podría haberse creado o no.
final class RegistroIncierto extends ResultadoRegistro {
  const RegistroIncierto();
}

final class RegistroErrorInesperado extends ResultadoRegistro {
  const RegistroErrorInesperado(this.requestId);
  final String? requestId;
}

/// Resultados de POST /auth/ciudadanos/sesiones.
sealed class ResultadoLogin {
  const ResultadoLogin();
}

final class LoginExitoso extends ResultadoLogin {
  const LoginExitoso({
    required this.token,
    required this.expiresAt,
    required this.usuario,
  });
  final String token;
  final DateTime expiresAt;
  final UsuarioSesion usuario;
}

final class LoginCamposInvalidos extends ResultadoLogin {
  const LoginCamposInvalidos(this.campos);
  final Map<String, String> campos;
}

final class LoginCredencialesInvalidas extends ResultadoLogin {
  const LoginCredencialesInvalidas();
}

final class LoginLimite extends ResultadoLogin {
  const LoginLimite(this.esperaSegundos);
  final int esperaSegundos;
}

final class LoginNoDisponible extends ResultadoLogin {
  const LoginNoDisponible();
}

final class LoginSinConexion extends ResultadoLogin {
  const LoginSinConexion();
}

final class LoginErrorInesperado extends ResultadoLogin {
  const LoginErrorInesperado(this.requestId);
  final String? requestId;
}

/// Resultados de GET /auth/sesion.
sealed class ResultadoConsultaSesion {
  const ResultadoConsultaSesion();
}

final class ConsultaVigente extends ResultadoConsultaSesion {
  const ConsultaVigente({required this.usuario, required this.expiresAt});
  final UsuarioSesion usuario;
  final DateTime expiresAt;
}

/// 401: token inválido, vencido, revocado o cuenta no habilitada.
final class ConsultaInvalida extends ResultadoConsultaSesion {
  const ConsultaInvalida();
}

/// Sin red, timeout o 5xx: no se puede decidir. No equivale a credenciales inválidas.
final class ConsultaNoVerificable extends ResultadoConsultaSesion {
  const ConsultaNoVerificable();
}

/// Repositorio de autenticación sobre la API REST. Sin reintentos automáticos.
class AuthRepositorio {
  AuthRepositorio(this._http);

  final ClienteHttp _http;

  static const int _esperaPorDefectoSegundos = 900;

  int _espera(RespuestaApi r) =>
      int.tryParse(r.cabeceras['retry-after'] ?? '') ??
      _esperaPorDefectoSegundos;

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

  Future<ResultadoRegistro> registrar({
    required String nombre,
    required String correo,
    required String contrasena,
  }) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        '/auth/ciudadanos/registro',
        cuerpo: {'nombre': nombre, 'correo': correo, 'contrasena': contrasena},
      );
    } on Exception {
      // No se distingue "no llegó" de "se perdió la respuesta": se trata como incierto.
      return const RegistroIncierto();
    }
    switch (r.estado) {
      case 201:
        final usuario = UsuarioSesion.desdeJson(r.cuerpo?['usuario']);
        return usuario == null
            ? const RegistroIncierto()
            : RegistroExitoso(usuario);
      case 400:
        return RegistroInvalido(_campos(r));
      case 409:
        return const RegistroCorreoEnUso();
      case 429:
        return RegistroLimite(_espera(r));
      case 503:
        return const RegistroNoDisponible();
      default:
        return RegistroErrorInesperado(_requestId(r));
    }
  }

  Future<ResultadoLogin> iniciarSesion({
    required String correo,
    required String contrasena,
  }) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        '/auth/ciudadanos/sesiones',
        cuerpo: {'correo': correo, 'contrasena': contrasena},
      );
    } on Exception {
      return const LoginSinConexion();
    }
    switch (r.estado) {
      case 200:
        final token = r.cuerpo?['token'];
        final vence = r.cuerpo?['expiresAt'];
        final usuario = UsuarioSesion.desdeJson(r.cuerpo?['usuario']);
        final expiresAt = vence is String ? DateTime.tryParse(vence) : null;
        if (token is String && expiresAt != null && usuario != null) {
          return LoginExitoso(
            token: token,
            expiresAt: expiresAt,
            usuario: usuario,
          );
        }
        return LoginErrorInesperado(_requestId(r));
      case 400:
        return LoginCamposInvalidos(_campos(r));
      case 401:
        return const LoginCredencialesInvalidas();
      case 429:
        return LoginLimite(_espera(r));
      case 503:
        return const LoginNoDisponible();
      default:
        return LoginErrorInesperado(_requestId(r));
    }
  }

  Future<ResultadoConsultaSesion> consultarSesion(String token) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar('GET', '/auth/sesion', token: token);
    } on Exception {
      return const ConsultaNoVerificable();
    }
    if (r.estado == 200) {
      final usuario = UsuarioSesion.desdeJson(r.cuerpo?['usuario']);
      final vence = r.cuerpo?['expiresAt'];
      final expiresAt = vence is String ? DateTime.tryParse(vence) : null;
      if (usuario != null && expiresAt != null) {
        return ConsultaVigente(usuario: usuario, expiresAt: expiresAt);
      }
      return const ConsultaNoVerificable();
    }
    if (r.estado == 401) return const ConsultaInvalida();
    return const ConsultaNoVerificable();
  }

  String? _codigoDeError(RespuestaApi r) {
    final error = r.cuerpo?['error'];
    final codigo = error is Map<String, dynamic> ? error['code'] : null;
    return codigo is String ? codigo : null;
  }

  /// Pide el enlace de recuperación. La respuesta 202 es la misma exista o no la cuenta; no se
  /// reintenta automáticamente y un fallo de red no se presenta como solicitud enviada.
  Future<ResultadoSolicitudRecuperacion> solicitarRecuperacion({
    required String correo,
  }) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        '/auth/recuperaciones',
        cuerpo: {'correo': correo},
      );
    } on Exception {
      return const SolicitudSinConexion();
    }
    switch (r.estado) {
      case 202:
        return const SolicitudAceptada();
      case 400:
        return SolicitudInvalida(_campos(r));
      case 429:
        return SolicitudLimite(_espera(r));
      case 503:
        // Retry-After solo viene cuando se agotó el tope diario de correos.
        final espera = int.tryParse(r.cabeceras['retry-after'] ?? '');
        return espera == null
            ? const SolicitudNoDisponible()
            : SolicitudSinCupoDiario(espera);
      default:
        return SolicitudErrorInesperado(_requestId(r));
    }
  }

  /// Consulta el estado de un enlace o código sin consumirlo. El token viaja en el cuerpo.
  Future<ResultadoConsultaToken> consultarToken(String token) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        '/auth/tokens/consulta',
        cuerpo: {'token': token},
      );
    } on Exception {
      return const ConsultaTokenSinConexion();
    }
    switch (r.estado) {
      case 200:
        final proposito = switch (r.cuerpo?['proposito']) {
          'recuperacion' => PropositoToken.recuperacion,
          'activacion' => PropositoToken.activacion,
          _ => null,
        };
        final vence = r.cuerpo?['expiresAt'];
        final expiresAt = vence is String ? DateTime.tryParse(vence) : null;
        if (proposito != null && expiresAt != null) {
          return TokenVigente(proposito: proposito, expiresAt: expiresAt);
        }
        return ConsultaTokenErrorInesperado(_requestId(r));
      case 404:
        return const TokenInvalido();
      case 410:
        return _codigoDeError(r) == 'TOKEN_EXPIRED'
            ? const TokenVencido()
            : const TokenUsado();
      case 429:
        return ConsultaTokenLimite(_espera(r));
      case 503:
        return const ConsultaTokenNoDisponible();
      default:
        return ConsultaTokenErrorInesperado(_requestId(r));
    }
  }

  /// Cambia la contraseña con un token de recuperación. No inicia sesión.
  Future<ResultadoCambioContrasena> restablecerContrasena({
    required String token,
    required String contrasena,
  }) => _cambiarContrasena('/auth/contrasena/restablecer', token, contrasena);

  /// Activa una cuenta invitada y define su contraseña. No inicia sesión.
  Future<ResultadoCambioContrasena> activarCuenta({
    required String token,
    required String contrasena,
  }) => _cambiarContrasena('/auth/activaciones', token, contrasena);

  Future<ResultadoCambioContrasena> _cambiarContrasena(
    String ruta,
    String token,
    String contrasena,
  ) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        ruta,
        cuerpo: {'token': token, 'contrasena': contrasena},
      );
    } on Exception {
      // No se distingue "no llegó" de "se perdió la respuesta": el cambio podría haberse aplicado.
      return const CambioIncierto();
    }
    switch (r.estado) {
      case 204:
        return const CambioExitoso();
      case 400:
        return CambioCamposInvalidos(_campos(r));
      case 404:
        return const CambioTokenInvalido();
      case 410:
        return _codigoDeError(r) == 'TOKEN_EXPIRED'
            ? const CambioTokenVencido()
            : const CambioTokenUsado();
      case 429:
        return CambioLimite(_espera(r));
      case 503:
        return const CambioNoDisponible();
      default:
        return CambioErrorInesperado(_requestId(r));
    }
  }

  /// Intenta revocar la sesión actual. `true` solo si el servidor confirmó (204).
  Future<bool> cerrarSesion(String token) async {
    try {
      final r = await _http.enviar('DELETE', '/auth/sesion', token: token);
      return r.estado == 204;
    } on Exception {
      return false;
    }
  }
}
