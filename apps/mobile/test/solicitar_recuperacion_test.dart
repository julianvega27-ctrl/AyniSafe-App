import 'dart:async';

import 'package:ayni_safe/presentacion/pantallas/solicitar_recuperacion_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

Finder get botonEnviar => find.widgetWithText(FilledButton, 'Enviar enlace');

Future<ApiFalsa> abrir(
  WidgetTester tester, {
  String correo = '',
  VoidCallback? alTenerCodigo,
}) async {
  final api = ApiFalsa();
  await tester.pumpWidget(
    conTema(
      SolicitarRecuperacionPantalla(
        repositorio: api.repositorio,
        correoInicial: correo,
        ahora: () => ahoraFijo,
        alTenerCodigo: alTenerCodigo,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

Future<void> enviar(WidgetTester tester, String correo) async {
  await escribirEn(tester, 'Correo', correo);
  await tester.tap(botonEnviar);
  await tester.pumpAndSettle();
}

void main() {
  group('solicitud de recuperación (8.2)', () {
    testWidgets('tras el 202 muestra una confirmación neutral, sin afirmar que la cuenta exista ni repetir el correo', (tester) async {
      final api = await abrir(tester);
      api.siempre(() => respuestaJson(202, {'estado': 'solicitud_recibida'}));
      await enviar(tester, 'desconocida@ejemplo.com');

      expect(api.contar('POST', '/auth/recuperaciones'), 1);
      expect(find.textContaining('Si el correo corresponde a una cuenta'), findsOneWidget);
      expect(find.textContaining('spam'), findsOneWidget);
      expect(find.textContaining('desconocida@ejemplo.com'), findsNothing);
      expect(find.byIcon(Icons.info_outline), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Volver a iniciar sesión'), findsOneWidget);
    });

    testWidgets('un solo envío en curso con doble toque y estado de carga', (tester) async {
      final api = await abrir(tester);
      final espera = Completer<http.Response>();
      api.manejador = (_) => espera.future;
      await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
      await tester.tap(botonEnviar);
      await tester.pump();
      expect(find.text('Enviando…'), findsOneWidget);
      // El botón está deshabilitado: nuevas pulsaciones no generan otra solicitud.
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.pump();
      expect(api.contar('POST', '/auth/recuperaciones'), 1);
      espera.complete(respuestaJson(202, {'estado': 'solicitud_recibida'}));
      await tester.pumpAndSettle();
      expect(api.contar('POST', '/auth/recuperaciones'), 1);
    });

    testWidgets('el correo inválido se rechaza junto al campo, sin solicitud', (tester) async {
      final api = await abrir(tester);
      await enviar(tester, 'no-es-correo');
      expect(find.text('Ingresa un correo válido.'), findsOneWidget);
      expect(api.solicitudes, isEmpty);
    });

    testWidgets('429: explica la espera y no reintenta sola', (tester) async {
      final api = await abrir(tester);
      api.siempre(() => respuestaJson(429, errorJson('RATE_LIMITED'), cabeceras: {'retry-after': '900'}));
      await enviar(tester, 'rosa@ejemplo.com');
      expect(find.textContaining('Espera 15 minutos'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsWidgets);
      await tester.pump(const Duration(minutes: 20));
      expect(api.contar('POST', '/auth/recuperaciones'), 1);
    });

    testWidgets('503 y cupo diario agotado se explican sin prometer el envío', (tester) async {
      final api = await abrir(tester);
      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      await enviar(tester, 'rosa@ejemplo.com');
      expect(find.textContaining('no está disponible por ahora'), findsOneWidget);
      expect(find.textContaining('Si el correo corresponde'), findsNothing);

      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE'), cabeceras: {'retry-after': '43200'}));
      await tester.tap(botonEnviar);
      await tester.pumpAndSettle();
      expect(find.textContaining('Hoy no podemos enviar más correos'), findsOneWidget);
    });

    testWidgets('sin red no se afirma éxito y se conserva el correo escrito', (tester) async {
      final api = await abrir(tester);
      api.sinRed();
      await enviar(tester, 'rosa@ejemplo.com');
      expect(find.textContaining('No pudimos conectar'), findsOneWidget);
      expect(find.textContaining('Si el correo corresponde'), findsNothing);
      expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
      expect(api.contar('POST', '/auth/recuperaciones'), 1);
    });

    testWidgets('«Usar otro correo» vuelve al formulario', (tester) async {
      final api = await abrir(tester);
      api.siempre(() => respuestaJson(202, {'estado': 'solicitud_recibida'}));
      await enviar(tester, 'rosa@ejemplo.com');
      await tester.tap(find.widgetWithText(TextButton, 'Usar otro correo'));
      await tester.pumpAndSettle();
      expect(botonEnviar, findsOneWidget);
      expect(find.textContaining('Si el correo corresponde'), findsNothing);
    });

    testWidgets('el correo inicial se precarga y «Tengo un código» solo aparece si hay destino', (tester) async {
      await abrir(tester, correo: 'rosa@ejemplo.com');
      expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
      expect(find.text('Tengo un código'), findsNothing);

      var abierto = false;
      await abrir(tester, alTenerCodigo: () => abierto = true);
      await tester.tap(find.widgetWithText(TextButton, 'Tengo un código'));
      expect(abierto, isTrue);
    });

    testWidgets('sin DNI, teléfono ni contraseña, y los botones miden al menos 48', (tester) async {
      await abrir(tester);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.textContaining(RegExp('DNI|Tel[eé]fono', caseSensitive: false)), findsNothing);
      expect(tester.getSize(botonEnviar).height, greaterThanOrEqualTo(48));
    });

    testWidgets('texto al 200 % en un teléfono estrecho: sin desbordes y el botón sigue alcanzable', (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ApiFalsa();
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2), size: Size(360, 640)),
          child: conTema(SolicitarRecuperacionPantalla(repositorio: api.repositorio, ahora: () => ahoraFijo)),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(botonEnviar);
      expect(tester.takeException(), isNull);
      expect(botonEnviar, findsOneWidget);
    });
  });
}
