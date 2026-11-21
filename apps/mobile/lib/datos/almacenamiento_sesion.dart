import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token y vencimiento guardados en el dispositivo. Nunca incluye la contraseña.
class SesionGuardada {
  const SesionGuardada({required this.token, required this.expiresAt});

  final String token;
  final DateTime expiresAt;
}

/// Falla al leer, escribir o borrar el almacenamiento seguro.
class AlmacenamientoSesionFallo implements Exception {
  const AlmacenamientoSesionFallo();
}

/// Puerto de almacenamiento de la sesión. La implementación real usa el almacén seguro del
/// sistema (Android Keystore / iOS Keychain), nunca preferencias simples.
abstract interface class AlmacenamientoSesion {
  Future<SesionGuardada?> leer();
  Future<void> guardar(SesionGuardada sesion);
  Future<void> borrar();
}

class AlmacenamientoSeguro implements AlmacenamientoSesion {
  AlmacenamientoSeguro([FlutterSecureStorage? almacen])
    : _almacen = almacen ?? const FlutterSecureStorage();

  static const String _claveToken = 'ayni.sesion.token';
  static const String _claveVence = 'ayni.sesion.expira';

  final FlutterSecureStorage _almacen;

  @override
  Future<SesionGuardada?> leer() async {
    try {
      final token = await _almacen.read(key: _claveToken);
      final vence = await _almacen.read(key: _claveVence);
      if (token == null || vence == null) return null;
      final expiresAt = DateTime.tryParse(vence);
      if (expiresAt == null) return null;
      return SesionGuardada(token: token, expiresAt: expiresAt);
    } on Exception {
      throw const AlmacenamientoSesionFallo();
    }
  }

  @override
  Future<void> guardar(SesionGuardada sesion) async {
    try {
      await _almacen.write(key: _claveToken, value: sesion.token);
      await _almacen.write(
        key: _claveVence,
        value: sesion.expiresAt.toUtc().toIso8601String(),
      );
    } on Exception {
      throw const AlmacenamientoSesionFallo();
    }
  }

  @override
  Future<void> borrar() async {
    try {
      await _almacen.delete(key: _claveToken);
      await _almacen.delete(key: _claveVence);
    } on Exception {
      throw const AlmacenamientoSesionFallo();
    }
  }
}
