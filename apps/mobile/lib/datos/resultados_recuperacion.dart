/// Resultados de la recuperación de contraseña y la activación de cuentas contra la API.
/// Ningún resultado conserva la contraseña ni el token en claro.
library;

/// Para qué sirve un enlace o código.
enum PropositoToken { recuperacion, activacion }

/// POST /auth/recuperaciones. El 202 es uniforme: no confirma que exista una cuenta.
sealed class ResultadoSolicitudRecuperacion {
  const ResultadoSolicitudRecuperacion();
}

final class SolicitudAceptada extends ResultadoSolicitudRecuperacion {
  const SolicitudAceptada();
}

final class SolicitudInvalida extends ResultadoSolicitudRecuperacion {
  const SolicitudInvalida(this.campos);
  final Map<String, String> campos;
}

final class SolicitudLimite extends ResultadoSolicitudRecuperacion {
  const SolicitudLimite(this.esperaSegundos);
  final int esperaSegundos;
}

/// 503 con Retry-After: se agotó el tope diario de correos del servicio (no depende de la cuenta).
final class SolicitudSinCupoDiario extends ResultadoSolicitudRecuperacion {
  const SolicitudSinCupoDiario(this.esperaSegundos);
  final int esperaSegundos;
}

final class SolicitudNoDisponible extends ResultadoSolicitudRecuperacion {
  const SolicitudNoDisponible();
}

/// Sin red o timeout: no se afirma que la solicitud llegó.
final class SolicitudSinConexion extends ResultadoSolicitudRecuperacion {
  const SolicitudSinConexion();
}

final class SolicitudErrorInesperado extends ResultadoSolicitudRecuperacion {
  const SolicitudErrorInesperado(this.requestId);
  final String? requestId;
}

/// POST /auth/tokens/consulta. Consultar no consume el token.
sealed class ResultadoConsultaToken {
  const ResultadoConsultaToken();
}

final class TokenVigente extends ResultadoConsultaToken {
  const TokenVigente({required this.proposito, required this.expiresAt});
  final PropositoToken proposito;
  final DateTime expiresAt;
}

/// 404: desconocido, alterado, de otro propósito o de una cuenta que ya no puede usarlo.
final class TokenInvalido extends ResultadoConsultaToken {
  const TokenInvalido();
}

/// 410 TOKEN_USED: ya se usó o lo reemplazó un enlace más reciente.
final class TokenUsado extends ResultadoConsultaToken {
  const TokenUsado();
}

/// 410 TOKEN_EXPIRED.
final class TokenVencido extends ResultadoConsultaToken {
  const TokenVencido();
}

final class ConsultaTokenLimite extends ResultadoConsultaToken {
  const ConsultaTokenLimite(this.esperaSegundos);
  final int esperaSegundos;
}

final class ConsultaTokenNoDisponible extends ResultadoConsultaToken {
  const ConsultaTokenNoDisponible();
}

final class ConsultaTokenSinConexion extends ResultadoConsultaToken {
  const ConsultaTokenSinConexion();
}

final class ConsultaTokenErrorInesperado extends ResultadoConsultaToken {
  const ConsultaTokenErrorInesperado(this.requestId);
  final String? requestId;
}

/// POST /auth/contrasena/restablecer y POST /auth/activaciones.
sealed class ResultadoCambioContrasena {
  const ResultadoCambioContrasena();
}

/// 204: contraseña definida. No hay sesión: se vuelve al acceso.
final class CambioExitoso extends ResultadoCambioContrasena {
  const CambioExitoso();
}

final class CambioCamposInvalidos extends ResultadoCambioContrasena {
  const CambioCamposInvalidos(this.campos);
  final Map<String, String> campos;
}

final class CambioTokenInvalido extends ResultadoCambioContrasena {
  const CambioTokenInvalido();
}

final class CambioTokenUsado extends ResultadoCambioContrasena {
  const CambioTokenUsado();
}

final class CambioTokenVencido extends ResultadoCambioContrasena {
  const CambioTokenVencido();
}

final class CambioLimite extends ResultadoCambioContrasena {
  const CambioLimite(this.esperaSegundos);
  final int esperaSegundos;
}

final class CambioNoDisponible extends ResultadoCambioContrasena {
  const CambioNoDisponible();
}

/// La respuesta no llegó (red, timeout): el cambio podría haberse aplicado o no.
final class CambioIncierto extends ResultadoCambioContrasena {
  const CambioIncierto();
}

final class CambioErrorInesperado extends ResultadoCambioContrasena {
  const CambioErrorInesperado(this.requestId);
  final String? requestId;
}
