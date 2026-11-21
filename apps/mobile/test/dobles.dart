import 'dart:async';
import 'dart:convert';

import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/app.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/auth_repositorio.dart';
import 'package:ayni_safe/datos/enlaces_cuenta.dart';
import 'package:ayni_safe/datos/cliente_http.dart';
import 'package:ayni_safe/datos/contenido_repositorio.dart';
import 'package:ayni_safe/datos/perfil_repositorio.dart';
import 'package:ayni_safe/presentacion/servicios.dart';
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
    contenido = ContenidoRepositorio(cliente);
    perfil = PerfilRepositorio(cliente);
  }

  final List<SolicitudRegistrada> solicitudes = [];
  late final ClienteHttp cliente;
  late final AuthRepositorio repositorio;
  late final ContenidoRepositorio contenido;
  late final PerfilRepositorio perfil;

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

/// Marcador de pruebas: registra los números pedidos sin abrir nada.
class MarcadorFalso implements LanzadorMarcador {
  final List<String> abiertos = [];

  @override
  Future<bool> abrir(String numero) async {
    abiertos.add(numero);
    return true;
  }
}

/// App completa para pruebas de widgets.
Widget appDePrueba(
  ApiFalsa api,
  SesionControlador sesion, {
  LanzadorMarcador? marcador,
  FuenteDeEnlaces? enlaces,
}) => AyniSafeApp(
  repositorio: api.repositorio,
  sesion: sesion,
  contenido: api.contenido,
  perfil: api.perfil,
  marcador: marcador ?? MarcadorFalso(),
  ahora: () => ahoraFijo,
  enlaces: enlaces,
);

/// Monta solo un widget bajo el tema de la app.
Widget conTema(Widget hijo) => MaterialApp(theme: crearTema(), home: hijo);

/// Contenido público de prueba con las secciones aprobadas y sin contactos.
Map<String, Object?> contenidoJson({
  bool contactosAprobados = false,
  List<Map<String, Object?>> contactos = const [],
  bool privacidadAprobada = true,
}) => {
  'version': 1,
  'actualizadoAt': '2026-11-21',
  'app': {
    'estado': 'aprobado',
    'finalidad': 'Finalidad de prueba de AyniSafe.',
    'funcionamiento': 'Funcionamiento de prueba de AyniSafe.',
  },
  'desarrolladores': {
    'estado': 'aprobado',
    'personas': [
      {'nombre': 'Dev de Prueba', 'rol': 'Desarrollador'},
    ],
  },
  'privacidad': privacidadAprobada
      ? {
          'estado': 'aprobado',
          'secciones': [
            {'titulo': 'Datos de prueba', 'texto': 'Texto de privacidad de prueba.'},
          ],
        }
      : {'estado': 'pendiente'},
  'contactos': {
    'estado': contactosAprobados ? 'aprobado' : 'pendiente',
    'items': contactos,
  },
};

Map<String, Object?> perfilJson({
  String nombre = 'Rosa Quispe',
  String? telefono,
  bool compartir = false,
}) => {
  'id': '5482bbd9-ef53-4049-a095-19a9d0144eeb',
  'nombre': nombre,
  'correo': 'rosa@ejemplo.com',
  'telefono': telefono,
  'compartirTelefono': compartir,
};

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

/// Abre el perfil desde la cabecera y cierra sesión (el cierre de sesión vive en el perfil).
Future<void> cerrarSesionDesdePerfil(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Perfil'));
  await tester.pumpAndSettle();
  final cerrar = find.widgetWithText(FilledButton, 'Cerrar sesión');
  await tester.ensureVisible(cerrar);
  await tester.tap(cerrar);
  await tester.pumpAndSettle();
}

const String tokenSesionPrueba = 'token-guardado-de-prueba-0123456789abcdefghijklmn';

/// Servidor falso de perfil: aplica el PATCH como lo hace la API (lista cerrada de campos).
class ServidorPerfil {
  Map<String, Object?> perfil = perfilJson();
  Completer<void>? retenerPatch;

  Future<http.Response> responder(http.Request req) async {
    final ruta = req.url.path;
    if (ruta.endsWith('/auth/sesion')) {
      return req.method == 'DELETE'
          ? respuestaJson(204, null)
          : respuestaJson(200, {
              'usuario': usuarioJson(nombre: perfil['nombre']! as String),
              'expiresAt': ahoraFijo.add(const Duration(hours: 10)).toIso8601String(),
            });
    }
    if (ruta.endsWith('/perfil')) {
      if (req.method == 'GET') return respuestaJson(200, perfil);
      await retenerPatch?.future;
      final cuerpo = req.body.isEmpty ? <String, dynamic>{} : (jsonDecode(req.body) as Map<String, dynamic>);
      final nuevo = {...perfil};
      if (cuerpo.containsKey('nombre')) nuevo['nombre'] = cuerpo['nombre'];
      if (cuerpo.containsKey('telefono')) {
        if (cuerpo['telefono'] != nuevo['telefono']) nuevo['compartirTelefono'] = false;
        nuevo['telefono'] = cuerpo['telefono'];
      }
      if (cuerpo.containsKey('compartirTelefono')) nuevo['compartirTelefono'] = cuerpo['compartirTelefono'];
      if (nuevo['compartirTelefono'] == true && nuevo['telefono'] == null) {
        return respuestaJson(
          400,
          errorJson('VALIDATION_ERROR', campos: {'compartirTelefono': 'Registra un teléfono antes de autorizar compartirlo.'}),
        );
      }
      perfil = nuevo;
      return respuestaJson(200, perfil);
    }
    return respuestaJson(500, null);
  }
}

