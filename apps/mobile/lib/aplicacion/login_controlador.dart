import 'package:flutter/foundation.dart';

import '../datos/auth_repositorio.dart';
import 'aviso.dart';
import 'validacion.dart';

/// Estado de presentación del inicio de sesión. No retiene la contraseña.
class LoginControlador extends ChangeNotifier {
  LoginControlador(this._repo, {DateTime Function()? ahora})
    : _ahora = ahora ?? DateTime.now;

  final AuthRepositorio _repo;
  final DateTime Function() _ahora;

  bool _enviando = false;
  bool _cerrado = false;
  Map<String, String> _errores = const {};
  Aviso? _aviso;

  bool get enviando => _enviando;
  Map<String, String> get errores => _errores;
  Aviso? get aviso => _aviso;

  void limpiarError(String campo) {
    if (!_errores.containsKey(campo)) return;
    _errores = {..._errores}..remove(campo);
    _notificar();
  }

  /// Aviso externo (por ejemplo, alta confirmada o fallo al guardar la sesión).
  void mostrarAviso(Aviso aviso) {
    _aviso = aviso;
    _notificar();
  }

  /// Devuelve la sesión emitida o null. Una sola solicitud en curso; sin reintentos automáticos.
  Future<LoginExitoso?> enviar({
    required String correo,
    required String contrasena,
  }) async {
    if (_enviando) return null;

    final locales = <String, String>{
      'correo': ?errorDeCorreo(correo),
      'contrasena': ?errorDeContrasena(contrasena),
    };
    if (locales.isNotEmpty) {
      _errores = locales;
      _aviso = null;
      _notificar();
      return null;
    }

    _enviando = true;
    _errores = const {};
    _aviso = null;
    _notificar();

    final resultado = await _repo.iniciarSesion(
      correo: correoNormalizado(correo),
      contrasena: contrasena,
    );

    _enviando = false;
    LoginExitoso? sesion;
    switch (resultado) {
      case LoginExitoso():
        sesion = resultado;
      case LoginCamposInvalidos(:final campos):
        _errores = {
          for (final e in campos.entries)
            if (e.key != 'cuerpo') e.key: e.value,
        };
        if (_errores.isEmpty) {
          _aviso = const Aviso(TipoAviso.error, 'Revisa los datos ingresados.');
        }
      case LoginCredencialesInvalidas():
        // Mensaje uniforme: no distingue correo desconocido, clave incorrecta ni cuenta no admitida.
        _aviso = const Aviso(
          TipoAviso.error,
          'Correo o contraseña incorrectos.',
        );
      case LoginLimite(:final esperaSegundos):
        _aviso = Aviso(
          TipoAviso.error,
          'Hiciste demasiados intentos. ${textoDeEspera(esperaSegundos, _ahora())}',
        );
      case LoginNoDisponible():
        _aviso = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      case LoginSinConexion():
        _aviso = const Aviso(
          TipoAviso.error,
          'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
        );
      case LoginErrorInesperado(:final requestId):
        _aviso = Aviso(TipoAviso.error, textoErrorInesperado(requestId));
    }
    _notificar();
    return sesion;
  }

  void _notificar() {
    if (!_cerrado) notifyListeners();
  }

  @override
  void dispose() {
    _cerrado = true;
    super.dispose();
  }
}
