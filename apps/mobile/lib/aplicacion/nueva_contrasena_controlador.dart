import 'package:flutter/foundation.dart';

import '../datos/auth_repositorio.dart';
import 'aviso.dart';
import 'validacion.dart';

/// Fase de la pantalla de nueva contraseña.
enum FaseNuevaContrasena {
  /// Consultando el estado del enlace (no consume el token).
  verificando,

  /// Enlace vigente: se puede elegir la contraseña.
  formulario,
  enlaceUsado,
  enlaceVencido,
  enlaceInvalido,

  /// No se pudo consultar (red, 429, 503…): se ofrece reintentar sin perder el código.
  noVerificable,
}

/// Estado de presentación de «nueva contraseña» (recuperación) y «activar cuenta» (invitación).
///
/// El token solo vive en memoria mientras la pantalla está abierta y la contraseña nunca se
/// retiene: llega como argumento y no se guarda. Una sola solicitud en curso, sin reintentos
/// automáticos.
class NuevaContrasenaControlador extends ChangeNotifier {
  NuevaContrasenaControlador(
    this._repo, {
    required String token,
    DateTime Function()? ahora,
  }) : _token = token, // ignore: prefer_initializing_formals
       _ahora = ahora ?? DateTime.now;

  final AuthRepositorio _repo;
  final DateTime Function() _ahora;

  String? _token;
  bool _cerrado = false;
  bool _enviando = false;
  FaseNuevaContrasena _fase = FaseNuevaContrasena.verificando;
  PropositoToken? _proposito;
  Map<String, String> _errores = const {};
  Aviso? _aviso;

  FaseNuevaContrasena get fase => _fase;
  bool get enviando => _enviando;

  /// Propósito confirmado por el servidor; null hasta consultar un enlace vigente.
  PropositoToken? get proposito => _proposito;
  Map<String, String> get errores => _errores;
  Aviso? get aviso => _aviso;

  void limpiarError(String campo) {
    if (!_errores.containsKey(campo)) return;
    _errores = {..._errores}..remove(campo);
    _notificar();
  }

  /// Consulta el estado del enlace. No consume el token.
  Future<void> consultar() async {
    final token = _token;
    if (token == null || _fase == FaseNuevaContrasena.formulario) return;
    _fase = FaseNuevaContrasena.verificando;
    _aviso = null;
    _notificar();

    final resultado = await _repo.consultarToken(token);
    if (_cerrado) return;
    switch (resultado) {
      case TokenVigente(:final proposito):
        _proposito = proposito;
        _fase = FaseNuevaContrasena.formulario;
      case TokenInvalido():
        _fase = FaseNuevaContrasena.enlaceInvalido;
      case TokenUsado():
        _fase = FaseNuevaContrasena.enlaceUsado;
      case TokenVencido():
        _fase = FaseNuevaContrasena.enlaceVencido;
      case ConsultaTokenLimite(:final esperaSegundos):
        _fase = FaseNuevaContrasena.noVerificable;
        _aviso = Aviso(
          TipoAviso.error,
          'Hiciste demasiados intentos. ${textoDeEspera(esperaSegundos, _ahora())}',
        );
      case ConsultaTokenNoDisponible():
        _fase = FaseNuevaContrasena.noVerificable;
        _aviso = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      case ConsultaTokenSinConexion():
        _fase = FaseNuevaContrasena.noVerificable;
        _aviso = const Aviso(
          TipoAviso.error,
          'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
        );
      case ConsultaTokenErrorInesperado(:final requestId):
        _fase = FaseNuevaContrasena.noVerificable;
        _aviso = Aviso(TipoAviso.error, textoErrorInesperado(requestId));
    }
    _notificar();
  }

  /// Define la contraseña. Devuelve el propósito cumplido si el servidor respondió 204.
  /// No inicia sesión: quien llama vuelve al acceso.
  Future<PropositoToken?> enviar(String contrasena) async {
    final token = _token;
    final proposito = _proposito;
    if (_enviando ||
        token == null ||
        proposito == null ||
        _fase != FaseNuevaContrasena.formulario) {
      return null;
    }

    final error = errorDeContrasena(contrasena);
    if (error != null) {
      _errores = {'contrasena': error};
      _aviso = null;
      _notificar();
      return null;
    }

    _enviando = true;
    _errores = const {};
    _aviso = null;
    _notificar();

    final resultado = switch (proposito) {
      PropositoToken.recuperacion => await _repo.restablecerContrasena(
        token: token,
        contrasena: contrasena,
      ),
      PropositoToken.activacion => await _repo.activarCuenta(
        token: token,
        contrasena: contrasena,
      ),
    };

    _enviando = false;
    PropositoToken? cumplido;
    switch (resultado) {
      case CambioExitoso():
        cumplido = proposito;
        // El token ya no sirve: se descarta de la memoria.
        _token = null;
      case CambioCamposInvalidos(:final campos):
        _errores = {
          for (final e in campos.entries)
            if (e.key != 'cuerpo' && e.key != 'token') e.key: e.value,
        };
        if (_errores.isEmpty) {
          _aviso = const Aviso(TipoAviso.error, 'Revisa los datos ingresados.');
        }
      case CambioTokenInvalido():
        _fase = FaseNuevaContrasena.enlaceInvalido;
      case CambioTokenUsado():
        _fase = FaseNuevaContrasena.enlaceUsado;
      case CambioTokenVencido():
        _fase = FaseNuevaContrasena.enlaceVencido;
      case CambioLimite(:final esperaSegundos):
        _aviso = Aviso(
          TipoAviso.error,
          'Hiciste demasiados intentos. ${textoDeEspera(esperaSegundos, _ahora())}',
        );
      case CambioNoDisponible():
        _aviso = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      case CambioIncierto():
        // El cambio podría haberse aplicado: no se afirma éxito ni se descarta, y no se reintenta solo.
        _aviso = const Aviso(
          TipoAviso.info,
          'No pudimos confirmar el cambio. Si no se completó, inténtalo de nuevo. '
          'Si ya se aplicó, el enlace aparecerá como usado y podrás iniciar sesión con tu contraseña nueva.',
        );
      case CambioErrorInesperado(:final requestId):
        _aviso = Aviso(TipoAviso.error, textoErrorInesperado(requestId));
    }
    _notificar();
    return cumplido;
  }

  void _notificar() {
    if (!_cerrado) notifyListeners();
  }

  @override
  void dispose() {
    _cerrado = true;
    _token = null;
    super.dispose();
  }
}
