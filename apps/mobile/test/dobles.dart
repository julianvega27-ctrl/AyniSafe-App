import 'dart:convert';

import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/app.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/auth_repositorio.dart';
import 'package:ayni_safe/datos/cliente_http.dart';
import 'package:ayni_safe/presentacion/tema.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Solicitud capturada por la API falsa. Los cuerpos pueden contener contraseñas de prueba.
class SolicitudRegistrada {
  SolicitudRegistrada(
    this.metodo,
    this.ruta,
    this.consulta,
    this.cabeceras,
    this.cuerpo,
  );

  final String metodo;
  final String ruta;
  final String consulta;
  final Map<String, String> cabeceras;
  final String cuerpo;

  Map<String, dynamic>? get json =>
      cuerpo.isEmpty ? null : jsonDecode(cuerpo) as Map<String, dynamic>;
}

http.Response respuestaJson(
  int estado,
  Object? cuerpo, {
  Map<String, String> cabeceras = const {},
}) {
  return http.Response.bytes(
    utf8.encode(cuerpo == null ? '' : jsonEncode(cuerpo)),
    estado,
    headers: {'content-type': 'application/json; charset=utf-8', ...cabeceras},
  );
}

Map<String, Object?> usuarioJson({
  String correo = 'rosa@ejemplo.com',
  String nombre = 'Rosa Quispe',
}) => {
  'id': '5482bbd9-ef53-4049-a095-19a9d0144eeb',
  'nombre': nombre,
  'correo': correo,
  'rol': 'ciudadano',
};

Map<String, Object?> errorJson(
  String code, {
  Map<String, String>? campos,
  String requestId = 'req-123',
}) => {
  'error': {
    'code': code,
    'message': 'mensaje del servidor',
    'fields': ?campos,
    'requestId': requestId,
  },
};

/// API falsa: registra cada solicitud y responde con el manejador configurado.
class ApiFalsa {
  ApiFalsa() {
    cliente = ClienteHttp(
      cliente: MockClient((req) async {
        solicitudes.add(
          SolicitudRegistrada(
            req.method,
            req.url.path,
            req.url.query,
            Map.of(req.headers),
            req.body,
          ),
        );
        return manejador(req);
      }),
      baseUrl: 'http://api.test',
      timeout: const Duration(seconds: 5),
    );
    repositorio = AuthRepositorio(cliente);
  }

  final List<SolicitudRegistrada> solicitudes = [];
  late final ClienteHttp cliente;
  late final AuthRepositorio repositorio;

  Future<http.Response> Function(http.Request) manejador = (_) async =>
      respuestaJson(500, null);

  /// Atajo: responde siempre con la misma respuesta.
  void siempre(http.Response Function() respuesta) {
    manejador = (_) async => respuesta();
  }

  /// Atajo: lanza una falla de red.
  void sinRed() {
    manejador = (_) async => throw http.ClientException('sin red');
  }

  int contar(String metodo, String ruta) => solicitudes
      .where((s) => s.metodo == metodo && s.ruta.endsWith(ruta))
      .length;
}

/// Almacenamiento en memoria con fallos configurables y registro de operaciones.
class AlmacenamientoEnMemoria implements AlmacenamientoSesion {
  AlmacenamientoEnMemoria([this.guardada]);

  SesionGuardada? guardada;
  bool fallarLeer = false;
  bool fallarGuardar = false;
  bool fallarBorrar = false;
  int borrados = 0;
  int guardados = 0;

  @override
  Future<SesionGuardada?> leer() async {
    if (fallarLeer) throw const AlmacenamientoSesionFallo();
    return guardada;
  }

  @override
  Future<void> guardar(SesionGuardada sesion) async {
    if (fallarGuardar) throw const AlmacenamientoSesionFallo();
    guardados += 1;
    guardada = sesion;
  }

  @override
  Future<void> borrar() async {
    if (fallarBorrar) throw const AlmacenamientoSesionFallo();
    borrados += 1;
    guardada = null;
  }
}

final DateTime ahoraFijo = DateTime.utc(2026, 11, 21, 15, 0);

SesionControlador crearSesion(
  ApiFalsa api,
  AlmacenamientoSesion almacen, {
  DateTime Function()? ahora,
}) => SesionControlador(
  repositorio: api.repositorio,
  almacenamiento: almacen,
  ahora: ahora ?? () => ahoraFijo,
);

/// App completa para pruebas de widgets.
Widget appDePrueba(ApiFalsa api, SesionControlador sesion) => AyniSafeApp(
  repositorio: api.repositorio,
  sesion: sesion,
  ahora: () => ahoraFijo,
);

/// Monta solo un widget bajo el tema de la app.
Widget conTema(Widget hijo) => MaterialApp(theme: crearTema(), home: hijo);

/// Escribe en un campo identificado por su etiqueta.
Future<void> escribirEn(
  WidgetTester tester,
  String etiqueta,
  String texto,
) async {
  final campo = find.widgetWithText(TextField, etiqueta);
  expect(campo, findsOneWidget, reason: 'campo "$etiqueta"');
  await tester.enterText(campo, texto);
}

TextField campoPorEtiqueta(WidgetTester tester, String etiqueta) =>
    tester.widget<TextField>(find.widgetWithText(TextField, etiqueta));

String textoDe(WidgetTester tester, String etiqueta) =>
    campoPorEtiqueta(tester, etiqueta).controller!.text;

const String claveValida = 'una contraseña de ejemplo';
