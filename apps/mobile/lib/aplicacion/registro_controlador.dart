import 'package:flutter/foundation.dart';

import '../datos/auth_repositorio.dart';
import 'aviso.dart';
import 'validacion.dart';

/// Estado de presentación del registro. No guarda la contraseña: solo la recibe al enviar y
/// la entrega a la API. La contraseña vive únicamente en el campo del formulario.
class RegistroControlador extends ChangeNotifier {
  RegistroControlador(this._repo, {DateTime Function()? ahora})
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

  /// Quita el error de un campo cuando la persona lo edita.
  void limpiarError(String campo) {
    if (!_errores.containsKey(campo)) return;
    _errores = {..._errores}..remove(campo);
    _notificar();
  }

  /// Envía el alta. Devuelve el correo de la cuenta creada, o null si no se creó/confirmó.
  /// Una sola solicitud en curso: pulsaciones repetidas se ignoran. Sin reintentos automáticos.
  Future<String?> enviar({
    required String nombre,
    required String correo,
    required String contrasena,
  }) async {
    if (_enviando) return null;

    final locales = <String, String>{
      'nombre': ?errorDeNombre(nombre),
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

    final resultado = await _repo.registrar(
      nombre: nombreNormalizado(nombre),
      correo: correoNormalizado(correo),
      contrasena: contrasena,
    );

    _enviando = false;
    String? correoCreado;
    switch (resultado) {
      case RegistroExitoso(:final usuario):
        correoCreado = usuario.correo;
      case RegistroInvalido(:final campos):
        _errores = {
          for (final e in campos.entries)
            if (e.key != 'cuerpo') e.key: e.value,
        };
        if (_errores.isEmpty) {
          _aviso = const Aviso(TipoAviso.error, 'Revisa los datos ingresados.');
        }
      case RegistroCorreoEnUso():
        _errores = {'correo': 'Este correo ya está registrado. Inicia sesión.'};
      case RegistroLimite(:final esperaSegundos):
        _aviso = Aviso(
          TipoAviso.error,
          'Hiciste demasiados intentos. ${textoDeEspera(esperaSegundos, _ahora())}',
        );
      case RegistroNoDisponible():
        _aviso = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      case RegistroIncierto():
        _aviso = const Aviso(
          TipoAviso.info,
          'No pudimos confirmar si tu cuenta se creó. Puede que ya exista. '
          'Prueba iniciar sesión con tu correo y contraseña; si no puedes entrar, '
          'vuelve a pulsar «Crear cuenta».',
          accion: AccionAviso.iniciarSesion,
        );
      case RegistroErrorInesperado(:final requestId):
        _aviso = Aviso(TipoAviso.error, textoErrorInesperado(requestId));
    }
    _notificar();
    return correoCreado;
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
