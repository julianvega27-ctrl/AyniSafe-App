import 'dart:async';
import 'dart:io';

import 'package:ayni_safe/presentacion/pantallas/acceso_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/registro_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

Future<ApiFalsa> abrirAcceso(
  WidgetTester tester, {
  AlmacenamientoEnMemoria? almacen,
}) async {
  final api = ApiFalsa();
  final sesion = crearSesion(api, almacen ?? AlmacenamientoEnMemoria());
  await sesion.restaurar();
  await tester.pumpWidget(appDePrueba(api, sesion));
  await tester.pumpAndSettle();
  expect(find.byType(AccesoPantalla), findsOneWidget);
  return api;
}

Finder get botonIngresar => find.widgetWithText(FilledButton, 'Ingresar');

Future<void> ingresar(
  WidgetTester tester, {
  String correo = 'rosa@ejemplo.com',
  String contrasena = claveValida,
}) async {
  await escribirEn(tester, 'Correo', correo);
  await escribirEn(tester, 'Contraseña', contrasena);
  await tester.tap(botonIngresar);
  await tester.pumpAndSettle();
}

void main() {
  group('pantalla de acceso (4.4)', () {
    testWidgets(
      'campos de correo y contraseña, acción Ingresar y enlaces Crear cuenta, privacidad y contactos',
      (tester) async {
        await abrirAcceso(tester);
        expect(find.byType(TextField), findsNWidgets(2));
        expect(find.widgetWithText(TextField, 'Correo'), findsOneWidget);
        expect(find.widgetWithText(TextField, 'Contraseña'), findsOneWidget);
        expect(find.text('Mostrar'), findsOneWidget);
        expect(botonIngresar, findsOneWidget);
        expect(find.widgetWithText(TextButton, 'Crear cuenta'), findsOneWidget);
        expect(find.widgetWithText(TextButton, 'Privacidad'), findsOneWidget);
        expect(
          find.widgetWithText(TextButton, 'Contactos de emergencia'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'sin DNI, teléfono ni rol, y sin solicitudes de ubicación o notificaciones',
      (tester) async {
        await abrirAcceso(tester);
        for (final prohibido in [
          RegExp('DNI', caseSensitive: false),
          RegExp('Tel[eé]fono', caseSensitive: false),
          RegExp(r'\bRol\b', caseSensitive: false),
          RegExp('Ubicaci[oó]n', caseSensitive: false),
          RegExp('Notificaciones', caseSensitive: false),
        ]) {
          expect(find.textContaining(prohibido), findsNothing);
        }
      },
    );

    testWidgets(
      'el manifiesto de Android solo declara INTERNET: no pide ubicación ni notificaciones',
      (tester) async {
        final principal = File('android/app/src/main/AndroidManifest.xml')
            .readAsStringSync();
        final permisos = RegExp(r'uses-permission[^>]*android:name="([^"]+)"')
            .allMatches(principal)
            .map((m) => m.group(1))
            .toList();
        expect(permisos, ['android.permission.INTERNET']);
        expect(principal, isNot(contains('LOCATION')));
        expect(principal, isNot(contains('POST_NOTIFICATIONS')));
      },
    );

    testWidgets(
      '«Olvidé mi contraseña» es un enlace interactivo de al menos 48 de alto y ya no aparece «próximamente»',
      (tester) async {
        final api = await abrirAcceso(tester);
        final enlace = find.widgetWithText(TextButton, 'Olvidé mi contraseña');
        expect(enlace, findsOneWidget);
        expect(find.textContaining('próximamente'), findsNothing);
        expect(tester.getSize(enlace).height, greaterThanOrEqualTo(48));
        // Abrir la pantalla no envía nada: la solicitud solo se hace al pulsar «Enviar enlace».
        await tester.tap(enlace);
        await tester.pumpAndSettle();
        expect(find.text('Recuperar contraseña'), findsOneWidget);
        expect(api.solicitudes, isEmpty);
      },
    );

    testWidgets(
      'el correo escrito se precarga al abrir la recuperación y el acceso no pide verificar el correo',
      (tester) async {
        await abrirAcceso(tester);
        await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
        await tester.tap(find.widgetWithText(TextButton, 'Olvidé mi contraseña'));
        await tester.pumpAndSettle();
        expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
        expect(find.textContaining('verific'), findsNothing);
      },
    );

    testWidgets('«Crear cuenta» abre el registro y «Inicia sesión» vuelve', (
      tester,
    ) async {
      await abrirAcceso(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Crear cuenta'));
      await tester.pumpAndSettle();
      expect(find.byType(RegistroPantalla), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Inicia sesión'));
      await tester.pumpAndSettle();
      expect(find.byType(RegistroPantalla), findsNothing);
      expect(find.byType(AccesoPantalla), findsOneWidget);
    });

    testWidgets(
      'privacidad y contactos: contenido público de la API, sin sesión, sin inventar teléfonos',
      (tester) async {
        final api = await abrirAcceso(tester);
        api.siempre(() => respuestaJson(200, contenidoJson()));
        await tester.tap(find.widgetWithText(TextButton, 'Privacidad'));
        await tester.pumpAndSettle();
        expect(find.text('Texto de privacidad de prueba.'), findsOneWidget);
        // Información pública: sin Bearer ni sesión.
        expect(api.solicitudes.last.ruta, endsWith('/publico/contenido'));
        expect(api.solicitudes.last.cabeceras.containsKey('Authorization'), isFalse);
        expect(api.solicitudes.last.cabeceras.containsKey('authorization'), isFalse);
        await tester.pageBack();
        await tester.pumpAndSettle();

        await tester.tap(
          find.widgetWithText(TextButton, 'Contactos de emergencia'),
        );
        await tester.pumpAndSettle();
        expect(find.textContaining('aún no están disponibles'), findsOneWidget);
        // No se inventan teléfonos ni se promete despacho.
        expect(find.textContaining(RegExp(r'\d{3,}')), findsNothing);
        expect(find.textContaining('no despacha emergencias'), findsOneWidget);
      },
    );

    testWidgets('privacidad pendiente: se declara no disponible, sin texto supuesto', (
      tester,
    ) async {
      final api = await abrirAcceso(tester);
      api.siempre(() => respuestaJson(200, contenidoJson(privacidadAprobada: false)));
      await tester.tap(find.widgetWithText(TextButton, 'Privacidad'));
      await tester.pumpAndSettle();
      expect(find.textContaining('aún no está disponible'), findsOneWidget);
      expect(find.text('Texto de privacidad de prueba.'), findsNothing);
    });

    testWidgets('sin conexión: error con «Reintentar» y sin contenido supuesto', (
      tester,
    ) async {
      final api = await abrirAcceso(tester);
      api.sinRed();
      await tester.tap(find.widgetWithText(TextButton, 'Privacidad'));
      await tester.pumpAndSettle();
      expect(find.textContaining('No hay conexión'), findsOneWidget);
      expect(find.text('Texto de privacidad de prueba.'), findsNothing);
      api.siempre(() => respuestaJson(200, contenidoJson()));
      await tester.tap(find.widgetWithText(TextButton, 'Reintentar'));
      await tester.pumpAndSettle();
      expect(find.text('Texto de privacidad de prueba.'), findsOneWidget);
    });

    testWidgets('validación local: sin solicitudes y errores junto al campo', (
      tester,
    ) async {
      final api = await abrirAcceso(tester);
      await tester.tap(botonIngresar);
      await tester.pump();
      expect(find.text('Ingresa un correo válido.'), findsOneWidget);
      expect(find.text('Ingresa tu contraseña.'), findsOneWidget);
      expect(api.solicitudes, isEmpty);
    });
  });

  group('errores de acceso (4.4)', () {
    testWidgets(
      'credenciales incorrectas: un único mensaje general, sin distinguir la causa',
      (tester) async {
        final api = await abrirAcceso(tester);
        api.siempre(() => respuestaJson(401, errorJson('INVALID_CREDENTIALS')));
        await ingresar(tester);
        expect(find.text('Correo o contraseña incorrectos.'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
        // No se atribuye el error a un campo concreto ni se revela si el correo existe.
        expect(find.textContaining('no existe'), findsNothing);
        expect(find.textContaining('no está registrado'), findsNothing);
        // Se conservan los datos escritos para corregirlos.
        expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
      },
    );

    testWidgets(
      '429: espera y hora de reintento, sin reintentar automáticamente',
      (tester) async {
        final api = await abrirAcceso(tester);
        api.siempre(
          () => respuestaJson(
            429,
            errorJson('RATE_LIMITED'),
            cabeceras: {'retry-after': '600'},
          ),
        );
        await ingresar(tester);
        expect(
          find.textContaining('Espera 10 minutos antes de volver a intentar'),
          findsOneWidget,
        );
        expect(find.textContaining('a las 15:10'), findsOneWidget);
        await tester.pump(const Duration(minutes: 30));
        expect(api.solicitudes, hasLength(1));
      },
    );

    testWidgets('503: mensaje temporal y reintento manual', (tester) async {
      final api = await abrirAcceso(tester);
      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      await ingresar(tester);
      expect(
        find.textContaining('El servicio no está disponible por ahora'),
        findsOneWidget,
      );
      expect(api.solicitudes, hasLength(1));
      // Reintento manual: el botón vuelve a estar activo.
      expect(tester.widget<FilledButton>(botonIngresar).onPressed, isNotNull);
      await tester.tap(botonIngresar);
      await tester.pumpAndSettle();
      expect(api.solicitudes, hasLength(2));
    });

    testWidgets('sin conexión: informa el problema y no afirma éxito', (
      tester,
    ) async {
      final api = await abrirAcceso(tester);
      api.sinRed();
      await ingresar(tester);
      expect(
        find.textContaining('No pudimos conectar con el servidor'),
        findsOneWidget,
      );
      expect(find.text('Sesión iniciada'), findsNothing);
      expect(api.solicitudes, hasLength(1));
    });

    testWidgets('500: código de la solicitud sin detalles internos', (
      tester,
    ) async {
      final api = await abrirAcceso(tester);
      api.siempre(
        () => respuestaJson(
          500,
          errorJson('INTERNAL_ERROR', requestId: 'req-xyz-9'),
        ),
      );
      await ingresar(tester);
      expect(find.textContaining('req-xyz-9'), findsOneWidget);
      expect(find.textContaining('mensaje del servidor'), findsNothing);
    });

    testWidgets('doble toque en Ingresar: una única solicitud', (tester) async {
      final api = await abrirAcceso(tester);
      final espera = Completer<http.Response>();
      api.manejador = (_) => espera.future;
      await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
      await escribirEn(tester, 'Contraseña', claveValida);
      await tester.tap(botonIngresar);
      await tester.pump();
      expect(find.text('Ingresando…'), findsOneWidget);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      expect(api.solicitudes, hasLength(1));
      espera.complete(respuestaJson(401, errorJson('INVALID_CREDENTIALS')));
      await tester.pumpAndSettle();
      expect(api.solicitudes, hasLength(1));
    });

    testWidgets('el cuerpo enviado solo lleva correo y contraseña', (
      tester,
    ) async {
      final api = await abrirAcceso(tester);
      api.siempre(() => respuestaJson(401, errorJson('INVALID_CREDENTIALS')));
      await ingresar(
        tester,
        correo: ' Rosa@Ejemplo.com ',
        contrasena: '  espacios exactos aqui  ',
      );
      final cuerpo = api.solicitudes.single.json!;
      expect(cuerpo.keys.toSet(), {'correo', 'contrasena'});
      expect(cuerpo['contrasena'], '  espacios exactos aqui  ');
      expect(cuerpo['correo'], 'Rosa@Ejemplo.com');
    });
  });
}
