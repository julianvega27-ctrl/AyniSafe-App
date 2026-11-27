import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Límites de fotos (RF52, documento 11 §7). Deben coincidir con la API.
const int maxFotos = 3;
const int maxBytesFoto = 5 * 1024 * 1024;

/// Tipo real por las primeras bytes (JPEG, PNG o WebP); null si no es una foto admitida.
String? tipoDeImagen(Uint8List b) {
  if (b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) {
    return 'image/jpeg';
  }
  if (b.length >= 8 &&
      b[0] == 0x89 &&
      b[1] == 0x50 &&
      b[2] == 0x4E &&
      b[3] == 0x47) {
    return 'image/png';
  }
  if (b.length >= 12 &&
      ascii.decode(b.sublist(0, 4), allowInvalid: true) == 'RIFF' &&
      ascii.decode(b.sublist(8, 12), allowInvalid: true) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/// Metadatos de una foto disponible (sin URL ni identificadores del proveedor).
class EvidenciaVista {
  const EvidenciaVista({
    required this.id,
    required this.tipo,
    required this.bytes,
    required this.adjuntadaEn,
  });
  final String id;
  final String tipo;
  final int bytes;
  final DateTime adjuntadaEn;

  static EvidenciaVista? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final fecha = json['adjuntadaEn'] is String
        ? DateTime.tryParse(json['adjuntadaEn'] as String)
        : null;
    if (json['id'] is! String ||
        json['tipo'] is! String ||
        json['bytes'] is! int ||
        fecha == null) {
      return null;
    }
    return EvidenciaVista(
      id: json['id'] as String,
      tipo: json['tipo'] as String,
      bytes: json['bytes'] as int,
      adjuntadaEn: fecha,
    );
  }

  static List<EvidenciaVista> listaDesdeJson(Object? json) => json is List
      ? [for (final e in json) ?EvidenciaVista.desdeJson(e)]
      : const [];
}

/// Permiso de carga del invitado (P5.2): solo sirve para subir fotos a su incidente durante 24 h.
/// Nunca se muestra en pantalla ni se registra.
class PermisoCarga {
  const PermisoCarga({required this.valor, required this.venceEn});
  final String valor;
  final DateTime venceEn;

  static PermisoCarga? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final vence = json['venceEn'] is String
        ? DateTime.tryParse(json['venceEn'] as String)
        : null;
    if (json['valor'] is! String || vence == null) return null;
    return PermisoCarga(valor: json['valor'] as String, venceEn: vence);
  }

  Map<String, String> aJson() => {
    'valor': valor,
    'venceEn': venceEn.toUtc().toIso8601String(),
  };
}

/// Resultado de subir una foto.
sealed class ResultadoFoto {
  const ResultadoFoto();
}

final class FotoAdjuntada extends ResultadoFoto {
  const FotoAdjuntada(this.evidencia);
  final EvidenciaVista evidencia;
}

/// 413/422/409 por límite: no tiene sentido reintentar automáticamente.
final class FotoRechazada extends ResultadoFoto {
  const FotoRechazada(this.motivo);
  final MotivoRechazoFoto motivo;
}

enum MotivoRechazoFoto { grande, formato, limite }

/// Sin respuesta, 5xx o 503: reintentable con la misma clave.
final class FotoReintentable extends ResultadoFoto {
  const FotoReintentable();
}

/// 404: el plazo de carga venció, el permiso ya no vale o el incidente no admite fotos.
final class FotoNoAdmitida extends ResultadoFoto {
  const FotoNoAdmitida();
}

final class FotoSesionInvalida extends ResultadoFoto {
  const FotoSesionInvalida();
}

final class FotoLimiteFrecuencia extends ResultadoFoto {
  const FotoLimiteFrecuencia(this.segundos);
  final int segundos;
}

class PermisosCargaFallo implements Exception {
  const PermisosCargaFallo();
}

/// Permisos de carga del invitado por referencia, en el almacenamiento seguro del dispositivo.
abstract interface class PermisosCarga {
  Future<void> guardar(String referencia, PermisoCarga permiso);
  Future<PermisoCarga?> leer(String referencia);
  Future<void> olvidar(String referencia);
}

class PermisosCargaSeguros implements PermisosCarga {
  PermisosCargaSeguros([FlutterSecureStorage? almacen])
    : _almacen = almacen ?? const FlutterSecureStorage();

  final FlutterSecureStorage _almacen;
  static String _clave(String referencia) => 'ayni.permiso.fotos.$referencia';

  @override
  Future<void> guardar(String referencia, PermisoCarga permiso) async {
    try {
      await _almacen.write(
        key: _clave(referencia),
        value: jsonEncode(permiso.aJson()),
      );
    } on Exception {
      throw const PermisosCargaFallo();
    }
  }

  @override
  Future<PermisoCarga?> leer(String referencia) async {
    try {
      final t = await _almacen.read(key: _clave(referencia));
      return t == null ? null : PermisoCarga.desdeJson(jsonDecode(t));
    } on Exception {
      throw const PermisosCargaFallo();
    }
  }

  @override
  Future<void> olvidar(String referencia) async {
    try {
      await _almacen.delete(key: _clave(referencia));
    } on Exception {
      throw const PermisosCargaFallo();
    }
  }
}

class PermisosCargaEnMemoria implements PermisosCarga {
  final Map<String, PermisoCarga> permisos = {};

  @override
  Future<void> guardar(String referencia, PermisoCarga permiso) async =>
      permisos[referencia] = permiso;

  @override
  Future<PermisoCarga?> leer(String referencia) async => permisos[referencia];

  @override
  Future<void> olvidar(String referencia) async => permisos.remove(referencia);
}
