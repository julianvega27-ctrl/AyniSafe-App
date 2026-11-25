import 'dart:async';

import 'package:ayni_safe/presentacion/pantallas/registro_pantalla.dart';
import 'package:ayni_safe/presentacion/tema.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

Future<ApiFalsa> abrirRegistro(
  WidgetTester tester, {
  AlmacenamientoEnMemoria? almacen,
}) async {
  final api = ApiFalsa();
  final sesion = crearSesion(api, almacen ?? AlmacenamientoEnMemoria());
  await sesion.restaurar();
  await tester.pumpWidget(appDePrueba(api, sesion));
  await irAlAcceso(tester);
  final enlace = find.widgetWithText(TextButton, 'Crear cuenta');
  await tester.ensureVisible(enlace);
  await tester.pumpAndSettle();
  await tester.tap(enlace);
  await tester.pumpAndSettle();
  expect(find.byType(RegistroPantalla), findsOneWidget);
  return api;
}

Future<void> llenar(
  WidgetTester tester, {
  String nombre = 'Rosa Quispe',
  String correo = 'rosa@ejemplo.com',
  String contrasena = claveValida,
}) async {
  await escribirEn(tester, 'Nombre', nombre);
  await escribirEn(tester, 'Correo', correo);
  await escribirEn(tester, 'Contraseña', contrasena);
}

Finder get botonCrear => find.widgetWithText(FilledButton, 'Crear cuenta');

void main() {
  group('formulario de registro (4.2)', () {
    testWidgets(
      'una sola pantalla con nombre, correo y contraseña; sin DNI, teléfono ni rol',
      (tester) async {
        await abrirRegistro(tester);
        expect(find.byType(TextField), findsNWidgets(3));
        for (final etiqueta in ['Nombre', 'Correo', 'Contraseña']) {
          expect(find.widgetWithText(TextField, etiqueta), findsOneWidget);
        }
        for (final prohibido in [
          RegExp('DNI', caseSensitive: false),
          RegExp('Tel[eé]fono', caseSensitive: false),
          RegExp(r'\bRol\b', caseSensitive: false),
          RegExp('Ubicaci[oó]n', caseSensitive: false),
          RegExp('Notificaciones', caseSensitive: false),
        ]) {
          expect(
            find.textContaining(prohibido),
            findsNothing,
            reason: 'no debe aparecer $prohibido',
          );
        }
        expect(
          find.widgetWithText(FilledButton, 'Crear cuenta'),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(TextButton, 'Inicia sesión'),
          findsOneWidget,
        );
        expect(find.widgetWithText(TextButton, 'Privacidad'), findsOneWidget);
        expect(
          find.widgetWithText(TextButton, 'Contactos de emergencia'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'ayuda visible: «Entre 15 y 128 caracteres. Puedes usar espacios»',
      (tester) async {
        await abrirRegistro(tester);
        expect(
          find.textContaining('Entre 15 y 128 caracteres'),
          findsOneWidget,
        );
        expect(find.textContaining('Puedes usar espacios'), findsOneWidget);
      },
    );

    testWidgets(
      'validación local equivalente a la API: errores junto a cada campo y ninguna solicitud',
      (tester) async {
        final api = await abrirRegistro(tester);
        await tester.tap(botonCrear);
        await tester.pump();
        expect(find.text('Ingresa tu nombre.'), findsOneWidget);
        expect(find.text('Ingresa un correo válido.'), findsOneWidget);
        expect(find.text('Ingresa tu contraseña.'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsNWidgets(3));
        expect(api.solicitudes, isEmpty);
      },
    );

    testWidgets(
      'límites de contraseña en puntos de código: 14 rechaza, 15 envía',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.siempre(() => respuestaJson(201, {'usuario': usuarioJson()}));
        await llenar(tester, contrasena: '\u{1F600}' * 14);
        await tester.tap(botonCrear);
        await tester.pump();
        expect(find.textContaining('entre 15 y 128'), findsOneWidget);
        expect(api.solicitudes, isEmpty);

        await escribirEn(tester, 'Contraseña', '\u{1F600}' * 15);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(api.contar('POST', '/auth/ciudadanos/registro'), 1);
      },
    );

    testWidgets(
      'la contraseña se envía exacta (espacios en extremos) y nombre/correo recortados',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.siempre(() => respuestaJson(201, {'usuario': usuarioJson()}));
        const clave = '  clave con espacios \u{1F600} y acentos ñá  ';
        await llenar(
          tester,
          nombre: '  Rosa Quispe ',
          correo: '  Rosa@Ejemplo.com ',
          contrasena: clave,
        );
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        final cuerpo = api.solicitudes.single.json!;
        expect(cuerpo['contrasena'], clave);
        expect(cuerpo['nombre'], 'Rosa Quispe');
        expect(cuerpo['correo'], 'Rosa@Ejemplo.com');
      },
    );

    testWidgets(
      'el cuerpo solo contiene nombre, correo y contraseña: nunca rol ni permisos',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.siempre(() => respuestaJson(201, {'usuario': usuarioJson()}));
        await llenar(tester);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(api.solicitudes.single.json!.keys.toSet(), {
          'nombre',
          'correo',
          'contrasena',
        });
      },
    );
  });

  group('estados del registro (4.3)', () {
    testWidgets(
      '201: vuelve al acceso con el correo precargado, contraseña vacía y alta confirmada',
      (tester) async {
        final almacen = AlmacenamientoEnMemoria();
        final api = await abrirRegistro(tester, almacen: almacen);
        api.siempre(
          () => respuestaJson(201, {
            'usuario': usuarioJson(correo: 'rosa@ejemplo.com'),
          }),
        );
        await llenar(tester, correo: ' Rosa@Ejemplo.com ');
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();

        expect(find.byType(RegistroPantalla), findsNothing);
        expect(find.textContaining('Tu cuenta fue creada'), findsOneWidget);
        expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
        expect(textoDe(tester, 'Contraseña'), isEmpty);
        // El alta no inicia sesión ni guarda nada en el dispositivo.
        expect(almacen.guardados, 0);
        expect(almacen.guardada, isNull);
        expect(api.contar('POST', '/auth/ciudadanos/sesiones'), 0);
      },
    );

    testWidgets('doble toque: una única solicitud en curso y estado de carga', (
      tester,
    ) async {
      final api = await abrirRegistro(tester);
      final espera = Completer<http.Response>();
      api.manejador = (_) => espera.future;
      await llenar(tester);

      await tester.tap(botonCrear);
      await tester.pump();
      expect(find.text('Creando cuenta…'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      // Enviar desde el teclado mientras espera tampoco duplica la solicitud.
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      expect(api.solicitudes, hasLength(1));

      espera.complete(respuestaJson(201, {'usuario': usuarioJson()}));
      await tester.pumpAndSettle();
      expect(api.solicitudes, hasLength(1));
    });

    testWidgets(
      'red caída: resultado incierto, sin repetir el envío y con los campos conservados',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.sinRed();
        await llenar(tester);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();

        expect(
          find.textContaining('No pudimos confirmar si tu cuenta se creó'),
          findsOneWidget,
        );
        expect(find.textContaining('Puede que ya exista'), findsOneWidget);
        expect(find.byIcon(Icons.info_outline), findsOneWidget);
        expect(
          find.widgetWithText(TextButton, 'Iniciar sesión'),
          findsOneWidget,
        );
        // No hay reintentos automáticos aunque pase el tiempo.
        await tester.pump(const Duration(minutes: 10));
        expect(api.solicitudes, hasLength(1));
        // Se conservan nombre, correo y (mientras exista el formulario) la contraseña.
        expect(textoDe(tester, 'Nombre'), 'Rosa Quispe');
        expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
        expect(textoDe(tester, 'Contraseña'), claveValida);
        // El botón vuelve a estar disponible para reintentar manualmente.
        expect(tester.widget<FilledButton>(botonCrear).onPressed, isNotNull);
      },
    );

    testWidgets(
      'resultado incierto: «Iniciar sesión» vuelve al acceso con el correo y sin afirmar que se creó',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.sinRed();
        await llenar(tester);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(TextButton, 'Iniciar sesión'));
        await tester.pumpAndSettle();

        expect(find.byType(RegistroPantalla), findsNothing);
        expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');
        expect(textoDe(tester, 'Contraseña'), isEmpty);
        expect(find.textContaining('Tu cuenta fue creada'), findsNothing);
      },
    );

    testWidgets(
      '409: error junto al correo, campos conservados y sin revelar más datos',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.siempre(() => respuestaJson(409, errorJson('EMAIL_IN_USE')));
        await llenar(tester);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(
          find.text('Este correo ya está registrado. Inicia sesión.'),
          findsOneWidget,
        );
        expect(textoDe(tester, 'Nombre'), 'Rosa Quispe');
        expect(textoDe(tester, 'Contraseña'), claveValida);
        expect(api.solicitudes, hasLength(1));
      },
    );

    testWidgets('400 del servidor: muestra los errores por campo', (
      tester,
    ) async {
      final api = await abrirRegistro(tester);
      api.siempre(
        () => respuestaJson(
          400,
          errorJson(
            'VALIDATION_ERROR',
            campos: {'correo': 'Ingresa un correo válido.'},
          ),
        ),
      );
      await llenar(tester);
      await tester.tap(botonCrear);
      await tester.pumpAndSettle();
      expect(find.text('Ingresa un correo válido.'), findsOneWidget);
    });

    testWidgets(
      '429: explica la espera y cuándo reintentar, sin reintentar automáticamente',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.siempre(
          () => respuestaJson(
            429,
            errorJson('RATE_LIMITED'),
            cabeceras: {'retry-after': '900'},
          ),
        );
        await llenar(tester);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(
          find.textContaining('Espera 15 minutos antes de volver a intentar'),
          findsOneWidget,
        );
        expect(
          find.textContaining('a las 15:15'),
          findsOneWidget,
        ); // reloj fijo: 15:00 UTC
        await tester.pump(const Duration(minutes: 20));
        expect(api.solicitudes, hasLength(1));
      },
    );

    testWidgets(
      '503 y 500: mensajes sin detalles internos; el 500 incluye el código de la solicitud',
      (tester) async {
        final api = await abrirRegistro(tester);
        api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
        await llenar(tester);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(
          find.textContaining('El servicio no está disponible por ahora'),
          findsOneWidget,
        );

        api.siempre(
          () => respuestaJson(
            500,
            errorJson('INTERNAL_ERROR', requestId: 'req-abc-1'),
          ),
        );
        // El mensaje anterior desplaza el botón: se lleva a la vista como haría la persona.
        await tester.ensureVisible(botonCrear);
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(find.textContaining('req-abc-1'), findsOneWidget);
        expect(find.textContaining('mensaje del servidor'), findsNothing);
      },
    );

    testWidgets(
      'abandonar el formulario descarta la contraseña: no se conserva al volver',
      (tester) async {
        final almacen = AlmacenamientoEnMemoria();
        await abrirRegistro(tester, almacen: almacen);
        await escribirEn(tester, 'Nombre', 'Rosa');
        await escribirEn(tester, 'Contraseña', claveValida);
        // Volver con la flecha del sistema.
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(find.byType(RegistroPantalla), findsNothing);
        expect(textoDe(tester, 'Contraseña'), isEmpty);
        // Al abrir de nuevo el registro, el formulario está vacío.
        final enlace = find.widgetWithText(TextButton, 'Crear cuenta');
        await tester.ensureVisible(enlace);
        await tester.tap(enlace);
        await tester.pumpAndSettle();
        expect(textoDe(tester, 'Nombre'), isEmpty);
        expect(textoDe(tester, 'Contraseña'), isEmpty);
        // Nada se persistió.
        expect(almacen.guardados, 0);
      },
    );

    testWidgets('al editar un campo con error, ese error desaparece', (
      tester,
    ) async {
      await abrirRegistro(tester);
      await tester.tap(botonCrear);
      await tester.pump();
      expect(find.text('Ingresa tu nombre.'), findsOneWidget);
      await escribirEn(tester, 'Nombre', 'R');
      await tester.pump();
      expect(find.text('Ingresa tu nombre.'), findsNothing);
      expect(find.text('Ingresa un correo válido.'), findsOneWidget);
    });
  });

  group('accesibilidad del formulario', () {
    testWidgets(
      'texto al 200 % en un teléfono estrecho: sin desbordes y el botón sigue alcanzable',
      (tester) async {
        tester.view.physicalSize = const Size(360 * 3, 640 * 3);
        tester.view.devicePixelRatio = 3;
        tester.platformDispatcher.textScaleFactorTestValue = 2.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
          tester.platformDispatcher.clearTextScaleFactorTestValue();
        });
        final api = await abrirRegistro(tester);
        api.siempre(() => respuestaJson(201, {'usuario': usuarioJson()}));
        expect(tester.takeException(), isNull); // sin overflow al abrir

        await llenar(tester);
        await tester.ensureVisible(botonCrear);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(botonCrear).height,
          greaterThanOrEqualTo(alturaMinimaControl),
        );
        await tester.tap(botonCrear);
        await tester.pumpAndSettle();
        expect(api.solicitudes, hasLength(1));
      },
    );

    testWidgets(
      'los errores también se anuncian como texto con icono, no solo por color',
      (tester) async {
        await abrirRegistro(tester);
        await tester.tap(botonCrear);
        await tester.pump();
        // Cada error de campo tiene icono + texto.
        expect(find.byIcon(Icons.error_outline), findsNWidgets(3));
      },
    );
  });
}
