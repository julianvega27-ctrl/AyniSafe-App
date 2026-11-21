import 'package:flutter/foundation.dart';

import '../datos/almacenamiento_sesion.dart';
import '../datos/auth_repositorio.dart';
import 'aviso.dart';

/// Estado de la sesión del ciudadano en la app.
sealed class EstadoSesion {
  const EstadoSesion();
}

/// Verificando la sesión guardada con el servidor. No se muestra contenido privado.
final class SesionRestaurando extends EstadoSesion {
  const SesionRestaurando();
}

/// Sin sesión: acceso público (login, registro, información y contactos).
final class SesionAnonima extends EstadoSesion {
  const SesionAnonima({this.aviso});
  final Aviso? aviso;
}

final class SesionAutenticada extends EstadoSesion {
  const SesionAutenticada({required this.usuario, required this.expiresAt});
  final UsuarioSesion usuario;
  final DateTime expiresAt;
}

/// No se pudo verificar con el servidor (sin red o 503). El token se conserva; no hay acceso privado.
final class SesionNoVerificable extends EstadoSesion {
  const SesionNoVerificable();
}

/// El borrado seguro del token falló: no se afirma un cierre completo ni se restaura el acceso
/// hasta que la limpieza se complete.
final class SesionLimpiezaPendiente extends EstadoSesion {
  const SesionLimpiezaPendiente({required this.revocadaEnServidor});
  final bool revocadaEnServidor;
}

/// Orquesta restauración, inicio y cierre de sesión. El token solo se guarda en el
/// almacenamiento seguro y en memoria durante la sesión; jamás la contraseña.
class SesionControlador extends ChangeNotifier {
  SesionControlador({
    required AuthRepositorio repositorio,
    required AlmacenamientoSesion almacenamiento,
    DateTime Function()? ahora,
  }) : _repo = repositorio,
       _almacen = almacenamiento,
       _ahora = ahora ?? DateTime.now;

  final AuthRepositorio _repo;
  final AlmacenamientoSesion _almacen;
  final DateTime Function() _ahora;

  EstadoSesion _estado = const SesionRestaurando();
  String? _token;
  bool _cerrado = false;
  Future<void>? _restauracion;

  EstadoSesion get estado => _estado;

  void _fijar(EstadoSesion nuevo) {
    _estado = nuevo;
    if (!_cerrado) notifyListeners();
  }

  /// Verifica con el servidor la sesión guardada antes de habilitar el acceso privado.
  /// Llamadas simultáneas comparten una sola restauración.
  ///
  /// Si hay una limpieza de cierre pendiente (el borrado seguro falló), no se restaura nada:
  /// primero debe completarse la limpieza con [reintentarLimpieza].
  Future<void> restaurar() {
    if (_estado is SesionLimpiezaPendiente) return Future<void>.value();
    return _restauracion ??= _restaurar().whenComplete(
      () => _restauracion = null,
    );
  }

  Future<void> _restaurar() async {
    _fijar(const SesionRestaurando());

    final SesionGuardada? guardada;
    try {
      guardada = await _almacen.leer();
    } on AlmacenamientoSesionFallo {
      // Sin poder leer el almacén no hay sesión que restaurar.
      _token = null;
      _fijar(const SesionAnonima());
      return;
    }
    if (guardada == null) {
      _fijar(const SesionAnonima());
      return;
    }
    if (!guardada.expiresAt.isAfter(_ahora())) {
      await _descartarLocal(
        const Aviso(
          TipoAviso.info,
          'Tu sesión venció. Inicia sesión de nuevo.',
        ),
      );
      return;
    }

    _token = guardada.token;
    switch (await _repo.consultarSesion(guardada.token)) {
      case ConsultaVigente(:final usuario, :final expiresAt):
        _fijar(SesionAutenticada(usuario: usuario, expiresAt: expiresAt));
      case ConsultaInvalida():
        // 401: el token ya no sirve. Se elimina y se pide iniciar sesión.
        await _descartarLocal(
          const Aviso(
            TipoAviso.info,
            'Tu sesión terminó. Inicia sesión de nuevo.',
          ),
        );
      case _:
        // Red o 503: no es una credencial inválida; no se borra el token ni se habilita acceso.
        _fijar(const SesionNoVerificable());
    }
  }

  Future<void> _descartarLocal(Aviso aviso) async {
    _token = null;
    try {
      await _almacen.borrar();
      _fijar(SesionAnonima(aviso: aviso));
    } on AlmacenamientoSesionFallo {
      _fijar(const SesionLimpiezaPendiente(revocadaEnServidor: false));
    }
  }

  /// Guarda la sesión emitida por la API. Devuelve false si no pudo guardarse de forma segura:
  /// en ese caso no se habilita el acceso privado, se descarta el token y se intenta revocarlo.
  Future<bool> iniciar(LoginExitoso login) async {
    try {
      await _almacen.guardar(
        SesionGuardada(token: login.token, expiresAt: login.expiresAt),
      );
    } on AlmacenamientoSesionFallo {
      _token = null;
      try {
        await _almacen.borrar();
      } on AlmacenamientoSesionFallo {
        // Se informa igualmente; el token en memoria ya se descartó.
      }
      // La revocación requiere conectividad: si falla, la sesión vence en su plazo.
      await _repo.cerrarSesion(login.token);
      _fijar(
        const SesionAnonima(
          aviso: Aviso(
            TipoAviso.error,
            'No pudimos guardar tu sesión de forma segura en este dispositivo. '
            'Inténtalo de nuevo.',
          ),
        ),
      );
      return false;
    }
    _token = login.token;
    _fijar(
      SesionAutenticada(usuario: login.usuario, expiresAt: login.expiresAt),
    );
    return true;
  }

  /// Cierra la sesión: intenta revocarla en el servidor y limpia el almacenamiento local aunque
  /// no haya red. Informa si la revocación remota no pudo confirmarse.
  Future<void> cerrar() async {
    final token = _token;
    final revocada = token == null ? true : await _repo.cerrarSesion(token);
    _token = null;
    try {
      await _almacen.borrar();
    } on AlmacenamientoSesionFallo {
      _fijar(SesionLimpiezaPendiente(revocadaEnServidor: revocada));
      return;
    }
    _fijar(SesionAnonima(aviso: _avisoDeCierre(revocada)));
  }

  /// Tras definir una contraseña nueva (recuperación o activación) el servidor revoca todas las
  /// sesiones de la cuenta y no emite ninguna nueva: se descarta el token local y se vuelve al
  /// acceso con un aviso. No se inicia sesión automáticamente.
  Future<void> alDefinirContrasena(PropositoToken proposito) async {
    _token = null;
    final aviso = switch (proposito) {
      PropositoToken.recuperacion => const Aviso(
        TipoAviso.exito,
        'Cambiaste tu contraseña. Cerramos tus otras sesiones: inicia sesión con la nueva.',
      ),
      PropositoToken.activacion => const Aviso(
        TipoAviso.exito,
        'Tu cuenta quedó activada. Inicia sesión con tu contraseña nueva.',
      ),
    };
    try {
      await _almacen.borrar();
    } on AlmacenamientoSesionFallo {
      _fijar(const SesionLimpiezaPendiente(revocadaEnServidor: true));
      return;
    }
    _fijar(SesionAnonima(aviso: aviso));
  }

  /// Reintenta el borrado seguro tras un fallo. Hasta lograrlo no se restaura ninguna sesión.
  Future<void> reintentarLimpieza() async {
    final actual = _estado;
    final revocada = actual is SesionLimpiezaPendiente
        ? actual.revocadaEnServidor
        : false;
    try {
      await _almacen.borrar();
    } on AlmacenamientoSesionFallo {
      _fijar(SesionLimpiezaPendiente(revocadaEnServidor: revocada));
      return;
    }
    _fijar(SesionAnonima(aviso: _avisoDeCierre(revocada)));
  }

  Aviso _avisoDeCierre(bool revocada) => revocada
      ? const Aviso(TipoAviso.exito, 'Cerraste sesión.')
      : const Aviso(
          TipoAviso.info,
          'Saliste de este dispositivo, pero no pudimos cerrar la sesión en el servidor. '
          'Vencerá automáticamente a las 24 horas de haberla iniciado.',
        );

  @override
  void dispose() {
    _cerrado = true;
    super.dispose();
  }
}
