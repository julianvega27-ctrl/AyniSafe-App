import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/entorno.dart';

/// Respuesta HTTP ya decodificada. Nunca se registra su cuerpo.
class RespuestaApi {
  RespuestaApi(this.estado, this.cuerpo, this.cabeceras);

  final int estado;
  final Map<String, dynamic>? cuerpo;
  final Map<String, String> cabeceras;
}

/// Adaptador HTTP hacia la API. Sin reintentos automaticos: cada llamada es una
/// sola solicitud con timeout.
class ClienteHttp {
  ClienteHttp({http.Client? cliente, String? baseUrl, Duration? timeout})
    : _cliente = cliente ?? http.Client(),
      _baseUrl = baseUrl ?? apiBaseUrl,
      _timeout = timeout ?? const Duration(seconds: 20);

  final http.Client _cliente;
  final String _baseUrl;
  final Duration _timeout;

  Uri _uri(String ruta) => Uri.parse('$_baseUrl$apiPrefijo$ruta');

  Future<RespuestaApi> enviar(
    String metodo,
    String ruta, {
    Map<String, Object?>? cuerpo,
    String? token,
    Map<String, String> cabeceras = const {},
  }) async {
    final solicitud = http.Request(metodo, _uri(ruta));
    solicitud.headers['Accept'] = 'application/json';
    solicitud.headers.addAll(cabeceras);
    if (cuerpo != null) {
      solicitud.headers['Content-Type'] = 'application/json';
      solicitud.body = jsonEncode(cuerpo);
    }
    if (token != null) {
      solicitud.headers['Authorization'] = 'Bearer $token';
    }
    final flujo = await _cliente.send(solicitud).timeout(_timeout);
    final respuesta = await http.Response.fromStream(flujo).timeout(_timeout);
    Map<String, dynamic>? json;
    if (respuesta.body.isNotEmpty) {
      try {
        final decodificado = jsonDecode(respuesta.body);
        if (decodificado is Map<String, dynamic>) json = decodificado;
      } on FormatException {
        json = null;
      }
    }
    return RespuestaApi(respuesta.statusCode, json, respuesta.headers);
  }
}
