import 'package:flutter/foundation.dart';

import '../datos/auth_repositorio.dart';
import 'aviso.dart';
import 'validacion.dart';

/// Estado de presentación de la solicitud de recuperación. No guarda nada de forma persistente.
///
/// Una sola solicitud en curso y ningún reintento automático. La confirmación es neutral: no
/// afirma que el correo corresponda a una cuenta.
class SolicitudRecuperacionControlador extends ChangeNotifier {
  SolicitudRecuperacionControlador(this._repo, {DateTime Function()? ahora})
    : _ahora = ahora ?? DateTime.now;

  final AuthRepositorio _repo;
  final DateTime Function() _ahora;

  bool _enviando = false;
  bool _aceptada = false;
  bool _cerrado = false;
  Map<String, String> _errores = const {};
  Aviso? _aviso;

  bool get enviando => _enviando;

  /// El servidor aceptó la solicitud (202). No confirma que exista una cuenta.
  bool get aceptada => _aceptada;
  Map<String, String> get errores => _errores;
  Aviso? get aviso => _aviso;

  void limpiarError(String campo) {
    if (!_errores.containsKey(campo)) return;
    _errores = {..._errores}..remove(campo);
    _notificar();
  }

  /// Vuelve al formulario para usar otro correo.
  void reiniciar() {
    _aceptada = false;
    _aviso = null;
    _errores = const {};
    _notificar();
  }

  Future<void> enviar({required String correo}) async {
    if (_enviando) return;

    final error = errorDeCorreo(correo);
    if (error != null) {
      _errores = {'correo': error};
      _aviso = null;
      _notificar();
      return;
    }

    _enviando = true;
    _errores = const {};
    _aviso = null;
    _notificar();

    final resultado = await _repo.solicitarRecuperacion(
      correo: correoNormalizado(correo),
    );

    _enviando = false;
    switch (resultado) {
      case SolicitudAceptada():
        _aceptada = true;
      case SolicitudInvalida(:final campos):
        _errores = {
          for (final e in campos.entries)
            if (e.key != 'cuerpo') e.key: e.value,
        };
        if (_errores.isEmpty) {
          _aviso = const Aviso(TipoAviso.error, 'Revisa los datos ingresados.');
        }
      case SolicitudLimite(:final esperaSegundos):
        _aviso = Aviso(
          TipoAviso.error,
          'Hiciste demasiados intentos. ${textoDeEspera(esperaSegundos, _ahora())}',
        );
      case SolicitudSinCupoDiario():
        _aviso = const Aviso(
          TipoAviso.error,
          'Hoy no podemos enviar más correos. Inténtalo de nuevo mañana.',
        );
      case SolicitudNoDisponible():
        _aviso = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      case SolicitudSinConexion():
        // No se sabe si la solicitud llegó: se informa sin afirmar éxito ni reenviar por cuenta propia.
        _aviso = const Aviso(
          TipoAviso.error,
          'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
        );
      case SolicitudErrorInesperado(:final requestId):
        _aviso = Aviso(TipoAviso.error, textoErrorInesperado(requestId));
    }
    _notificar();
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
