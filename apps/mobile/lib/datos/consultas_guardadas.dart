import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Referencia y código de un envío de invitado guardados en este dispositivo. Es la única forma de
/// consultar su seguimiento: no se vinculan a una cuenta ni se envían al servidor salvo para consultar.
class ConsultaGuardada {
  const ConsultaGuardada({
    required this.referencia,
    required this.codigo,
    required this.guardadaEn,
  });
  final String referencia;
  final String codigo;
  final DateTime guardadaEn;

  Map<String, String> aJson() => {
    'referencia': referencia,
    'codigo': codigo,
    'guardadaEn': guardadaEn.toUtc().toIso8601String(),
  };

  static ConsultaGuardada? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final fecha = json['guardadaEn'] is String
        ? DateTime.tryParse(json['guardadaEn'] as String)
        : null;
    if (json['referencia'] is! String ||
        json['codigo'] is! String ||
        fecha == null) {
      return null;
    }
    return ConsultaGuardada(
      referencia: json['referencia'] as String,
      codigo: json['codigo'] as String,
      guardadaEn: fecha,
    );
  }
}

class ConsultasGuardadasFallo implements Exception {
  const ConsultasGuardadasFallo();
}

/// Consultas de invitado guardadas. Separadas de la sesión: cerrar sesión no las borra.
abstract interface class ConsultasGuardadas {
  Future<List<ConsultaGuardada>> listar();
  Future<void> guardar(ConsultaGuardada consulta);
  Future<void> olvidar(String referencia);
}

/// Almacén seguro del sistema (Keystore / Keychain), nunca preferencias simples.
class ConsultasGuardadasSeguras implements ConsultasGuardadas {
  ConsultasGuardadasSeguras([FlutterSecureStorage? almacen])
    : _almacen = almacen ?? const FlutterSecureStorage();

  static const String clave = 'ayni.consultas.invitado';
  final FlutterSecureStorage _almacen;

  @override
  Future<List<ConsultaGuardada>> listar() async {
    try {
      final texto = await _almacen.read(key: clave);
      if (texto == null) return [];
      final lista = jsonDecode(texto);
      if (lista is! List) return [];
      return [for (final e in lista) ?ConsultaGuardada.desdeJson(e)];
    } on Exception {
      throw const ConsultasGuardadasFallo();
    }
  }

  @override
  Future<void> guardar(ConsultaGuardada consulta) async {
    final actuales = await listar();
    final nuevas = [
      consulta,
      ...actuales.where((c) => c.referencia != consulta.referencia),
    ];
    await _escribir(nuevas);
  }

  @override
  Future<void> olvidar(String referencia) async {
    final actuales = await listar();
    await _escribir(actuales.where((c) => c.referencia != referencia).toList());
  }

  Future<void> _escribir(List<ConsultaGuardada> consultas) async {
    try {
      if (consultas.isEmpty) {
        await _almacen.delete(key: clave);
      } else {
        await _almacen.write(
          key: clave,
          value: jsonEncode([for (final c in consultas) c.aJson()]),
        );
      }
    } on Exception {
      throw const ConsultasGuardadasFallo();
    }
  }
}

/// Implementación en memoria (pruebas y entornos sin almacén seguro).
class ConsultasGuardadasEnMemoria implements ConsultasGuardadas {
  final List<ConsultaGuardada> _consultas = [];

  @override
  Future<List<ConsultaGuardada>> listar() async => List.of(_consultas);

  @override
  Future<void> guardar(ConsultaGuardada consulta) async {
    _consultas
      ..removeWhere((c) => c.referencia == consulta.referencia)
      ..insert(0, consulta);
  }

  @override
  Future<void> olvidar(String referencia) async =>
      _consultas.removeWhere((c) => c.referencia == referencia);
}
