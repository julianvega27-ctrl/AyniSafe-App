import 'dart:async';
import 'dart:io';

import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/presentacion/pantallas/acceso_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

const String tokenGuardado =
    'token-guardado-de-prueba-0123456789abcdefghijklmn';

SesionGuardada guardadaVigente() => SesionGuardada(
  token: tokenGuardado,
  expiresAt: ahoraFijo.add(const Duration(hours: 10)),
);

/// Respuestas típicas de la API para sesión: login, consulta y cierre.
http.Response sesionVigenteJson() => respuestaJson(200, {
  'usuario': usuarioJson(),
  'expiresAt': ahoraFijo.add(const Duration(hours: 10)).toIso8601String(),
});

void responderLoginYSesion(ApiFalsa api) {
  api.manejador = (req) async {
    if (req.method == 'POST' &&
        req.url.path.endsWith('/auth/ciudadanos/sesiones')) {
      return respuestaJson(200, {
        'token': 'token-emitido-por-la-api-0123456789abcdefghijklm',
        'expiresAt': ahoraFijo.add(const Duration(hours: 24)).toIso8601String(),
        'usuario': usuarioJson(),
      });
    }
    if (req.method == 'GET') return sesionVigenteJson();
    if (req.method == 'DELETE') return respuestaJson(204, null);
    return respuestaJson(500, null);
  };
}

Future<(ApiFalsa, AlmacenamientoEnMemoria, SesionControlador)> montar(
  WidgetTester tester, {
  SesionGuardada? guardada,
  void Function(ApiFalsa)? configurar,
  bool restaurar = true,
}) async {
  final api = ApiFalsa();
  final almacen = AlmacenamientoEnMemoria(guardada);
  final sesion = crearSesion(api, almacen);
  (configurar ?? responderLoginYSesion)(api);
  if (restaurar) await sesion.restaurar();
  await tester.pumpWidget(appDePrueba(api, sesion));
  await tester.pumpAndSettle();
  return (api, almacen, sesion);
}

void main() {
  group('almacenamiento seguro (5.1)', () {
    test(
      'guarda token y vencimiento en el almacén seguro, y nada más',
      () async {
        FlutterSecureStorage.setMockInitialValues({});
        final almacen = AlmacenamientoSeguro();
        final vence = DateTime.utc(2026, 11, 22, 12);
        await almacen.guardar(
          SesionGuardada(token: 'tok-123', expiresAt: vence),
        );

        const lector = FlutterSecureStorage();
        final todo = await lector.readAll();
        expect(todo.keys.toSet(), {'ayni.sesion.token', 'ayni.sesion.expira'});
        expect(todo.values.join(' '), isNot(contains('contraseña')));

        final leida = await almacen.leer();
        expect(leida?.token, 'tok-123');
        expect(leida?.expiresAt.toUtc(), vence);

        await almacen.borrar();
        expect(await almacen.leer(), isNull);
        expect(await lector.readAll(), isEmpty);
      },
    );

    test('el proyecto no usa preferencias simples para la sesión', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      expect(pubspec, contains('flutter_secure_storage'));
      expect(pubspec, isNot(contains('shared_preferences')));
      final fuentes = Directory('lib')
          .listSync(recursive: true)
          .whereType<File>();
      for (final f in fuentes) {
        expect(
          f.readAsStringSync(),
          isNot(contains('SharedPreferences')),
          reason: f.path,
        );
      }
    });

    testWidgets(
      'inicio correcto: guarda token y vencimiento, nunca la contraseña, y abre el destino mínimo',
      (tester) async {
        final (api, almacen, _) = await montar(tester);
        await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
        await escribirEn(tester, 'Contraseña', claveValida);
        await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
        await tester.pumpAndSettle();

        expect(find.text('Sesión iniciada'), findsOneWidget);
        expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
        expect(
          almacen.guardada?.token,
          'token-emitido-por-la-api-0123456789abcdefghijklm',
        );
        expect(
          almacen.guardada?.expiresAt,
          ahoraFijo.add(const Duration(hours: 24)),
        );
        // Sin funcionalidades posteriores ni permisos.
        expect(find.textContaining('Reportar'), findsNothing);
        expect(find.textContaining('Mapa'), findsNothing);
        expect(find.textContaining('Alertas'), findsNothing);
        expect(find.textContaining('solo incluye el acceso'), findsOneWidget);
        // La contraseña solo viajó en el cuerpo del login.
        expect(
          api.solicitudes.where((s) => s.cuerpo.contains(claveValida)),
          hasLength(1),
        );
      },
    );

    testWidgets(
      'si falla la escritura segura: no hay destino privado, se descarta el token y se intenta revocar',
      (tester) async {
        final (api, almacen, _) = await montar(tester);
        almacen.fallarGuardar = true;
        await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
        await escribirEn(tester, 'Contraseña', claveValida);
        await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
        await tester.pumpAndSettle();

        expect(find.text('Sesión iniciada'), findsNothing);
        expect(find.byType(AccesoPantalla), findsOneWidget);
        expect(
          find.textContaining('No pudimos guardar tu sesión de forma segura'),
          findsOneWidget,
        );
        expect(find.textContaining('Inténtalo de nuevo'), findsOneWidget);
        expect(almacen.guardada, isNull);
        // Se intenta revocar la sesión emitida con su token.
        final delete = api.solicitudes
            .where((s) => s.metodo == 'DELETE')
            .single;
        expect(
          delete.cabeceras['Authorization'],
          'Bearer token-emitido-por-la-api-0123456789abcdefghijklm',
        );
      },
    );

    testWidgets(
      'si además no hay red para revocar, igualmente informa y no habilita el acceso privado',
      (tester) async {
        final (api, almacen, _) = await montar(tester);
        almacen.fallarGuardar = true;
        final base = api.manejador;
        api.manejador = (req) async {
          if (req.method == 'DELETE') throw http.ClientException('sin red');
          return base(req);
        };
        await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
        await escribirEn(tester, 'Contraseña', claveValida);
        await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
        await tester.pumpAndSettle();
        expect(find.text('Sesión iniciada'), findsNothing);
        expect(
          find.textContaining('No pudimos guardar tu sesión'),
          findsOneWidget,
        );
      },
    );
  });

  group('restauración (5.2)', () {
    testWidgets(
      'con token guardado verifica con el servidor antes de mostrar el destino privado',
      (tester) async {
        final api = ApiFalsa();
        final almacen = AlmacenamientoEnMemoria(guardadaVigente());
        final sesion = crearSesion(api, almacen);
        final espera = Completer<http.Response>();
        api.manejador = (_) => espera.future;
        final restauracion = sesion.restaurar();
        await tester.pumpWidget(appDePrueba(api, sesion));
        await tester.pump();

        // Mientras el servidor no responde: solo "verificando", nada privado.
        expect(find.text('Verificando tu sesión…'), findsOneWidget);
        expect(find.text('Hola, Rosa Quispe'), findsNothing);
        expect(find.byType(AccesoPantalla), findsNothing);

        espera.complete(sesionVigenteJson());
        await restauracion;
        await tester.pumpAndSettle();
        expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
        final get = api.solicitudes.single;
        expect(get.metodo, 'GET');
        expect(get.cabeceras['Authorization'], 'Bearer $tokenGuardado');
        // Sin parámetros: no se puede elegir la identidad de otra persona.
        expect(get.consulta, isEmpty);
        expect(get.ruta, endsWith('/auth/sesion'));
      },
    );

    testWidgets(
      'sesión vigente tras reinicios: una app nueva con el mismo almacén la recupera',
      (tester) async {
        final (_, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
        );
        expect(find.text('Hola, Rosa Quispe'), findsOneWidget);

        // "Reinicio": nueva app, nueva API (también reiniciada) y el mismo almacén del dispositivo.
        final api2 = ApiFalsa()..manejador = (_) async => sesionVigenteJson();
        final sesion2 = crearSesion(api2, almacen);
        await sesion2.restaurar();
        await tester.pumpWidget(appDePrueba(api2, sesion2));
        await tester.pumpAndSettle();
        expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
        expect(almacen.guardada?.token, tokenGuardado);
      },
    );

    testWidgets(
      '401: elimina el token, vuelve al acceso y no muestra datos privados',
      (tester) async {
        final (_, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
          configurar: (api) => api.siempre(
            () => respuestaJson(401, errorJson('UNAUTHENTICATED')),
          ),
        );
        expect(almacen.guardada, isNull);
        expect(find.byType(AccesoPantalla), findsOneWidget);
        expect(find.textContaining('Tu sesión terminó'), findsOneWidget);
        expect(find.text('Hola, Rosa Quispe'), findsNothing);
      },
    );

    testWidgets(
      'sin red: conserva el token, no habilita el acceso privado y permite reintentar',
      (tester) async {
        var hayRed = false;
        final (api, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
          configurar: (api) => api.manejador = (_) async {
            if (!hayRed) throw http.ClientException('sin red');
            return sesionVigenteJson();
          },
        );
        expect(find.text('No pudimos verificar tu sesión'), findsOneWidget);
        expect(find.text('Hola, Rosa Quispe'), findsNothing);
        expect(find.byType(AccesoPantalla), findsNothing);
        // No se interpreta como credencial inválida: no se borra el token.
        expect(almacen.guardada?.token, tokenGuardado);
        expect(almacen.borrados, 0);
        expect(find.textContaining('Tu sesión terminó'), findsNothing);

        // Reintento manual con red.
        hayRed = true;
        await tester.tap(find.widgetWithText(FilledButton, 'Reintentar'));
        await tester.pumpAndSettle();
        expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
        expect(api.solicitudes.where((s) => s.metodo == 'GET'), hasLength(2));
      },
    );

    testWidgets(
      '503: mismo tratamiento que la falta de red (token conservado, sin acceso privado)',
      (tester) async {
        final (_, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
          configurar: (api) => api.siempre(
            () => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')),
          ),
        );
        expect(find.text('No pudimos verificar tu sesión'), findsOneWidget);
        expect(almacen.guardada, isNotNull);
        expect(almacen.borrados, 0);
      },
    );

    testWidgets('token vencido según su fecha: se elimina sin habilitar nada', (
      tester,
    ) async {
      final (api, almacen, _) = await montar(
        tester,
        guardada: SesionGuardada(
          token: tokenGuardado,
          expiresAt: ahoraFijo.subtract(const Duration(minutes: 1)),
        ),
      );
      expect(find.textContaining('Tu sesión venció'), findsOneWidget);
      expect(almacen.guardada, isNull);
      expect(find.text('Hola, Rosa Quispe'), findsNothing);
      expect(api.solicitudes, isEmpty);
    });

    testWidgets(
      'sin sesión guardada o con el almacén ilegible: acceso público',
      (tester) async {
        await montar(tester);
        expect(find.byType(AccesoPantalla), findsOneWidget);

        final api = ApiFalsa();
        final almacen = AlmacenamientoEnMemoria(guardadaVigente())
          ..fallarLeer = true;
        final sesion = crearSesion(api, almacen);
        await sesion.restaurar();
        await tester.pumpWidget(appDePrueba(api, sesion));
        await tester.pumpAndSettle();
        expect(find.byType(AccesoPantalla), findsOneWidget);
        expect(api.solicitudes, isEmpty);
      },
    );
  });

  group('cierre de sesión (5.3)', () {
    Future<void> cerrar(WidgetTester tester) async {
      await tester.tap(find.widgetWithText(FilledButton, 'Cerrar sesión'));
      await tester.pumpAndSettle();
    }

    testWidgets(
      'con conexión: revoca, borra los datos locales y vuelve al acceso público',
      (tester) async {
        final (api, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
        );
        expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
        await cerrar(tester);

        final delete = api.solicitudes
            .where((s) => s.metodo == 'DELETE')
            .single;
        expect(delete.cabeceras['Authorization'], 'Bearer $tokenGuardado');
        expect(almacen.guardada, isNull);
        expect(find.byType(AccesoPantalla), findsOneWidget);
        expect(find.text('Cerraste sesión.'), findsOneWidget);
        expect(find.text('Hola, Rosa Quispe'), findsNothing);
        expect(textoDe(tester, 'Contraseña'), isEmpty);
      },
    );

    testWidgets(
      'sin conexión: borra lo local y distingue la salida local de la revocación no confirmada',
      (tester) async {
        final (api, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
        );
        final base = api.manejador;
        api.manejador = (req) async {
          if (req.method == 'DELETE') throw http.ClientException('sin red');
          return base(req);
        };
        await cerrar(tester);

        expect(almacen.guardada, isNull);
        expect(find.byType(AccesoPantalla), findsOneWidget);
        expect(
          find.textContaining('no pudimos cerrar la sesión en el servidor'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Vencerá automáticamente a las 24 horas'),
          findsOneWidget,
        );
        expect(find.text('Cerraste sesión.'), findsNothing);
      },
    );

    testWidgets(
      'el servidor responde 204 aunque la sesión ya estuviera revocada: sin error',
      (tester) async {
        final (api, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
        );
        final base = api.manejador;
        // Otra salida ya la revocó: el servidor sigue respondiendo 204 (idempotente).
        api.manejador = (req) async =>
            req.method == 'DELETE' ? respuestaJson(204, null) : base(req);
        await cerrar(tester);
        expect(find.text('Cerraste sesión.'), findsOneWidget);
        expect(almacen.guardada, isNull);
      },
    );

    testWidgets(
      'si falla el borrado seguro: bloquea el acceso, no afirma el cierre y permite reintentar',
      (tester) async {
        final (api, almacen, _) = await montar(
          tester,
          guardada: guardadaVigente(),
        );
        almacen.fallarBorrar = true;
        await cerrar(tester);

        expect(find.text('Falta terminar de cerrar tu sesión'), findsOneWidget);
        expect(
          find.textContaining(
            'No pudimos borrar tu sesión de este dispositivo',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('Por seguridad no puedes continuar'),
          findsOneWidget,
        );
        expect(find.text('Cerraste sesión.'), findsNothing);
        expect(find.byType(AccesoPantalla), findsNothing);
        expect(find.text('Hola, Rosa Quispe'), findsNothing);
        // El token sigue en el dispositivo, pero no hay acceso privado.
        expect(almacen.guardada, isNotNull);

        // Reintento fallido: sigue bloqueado.
        await tester.tap(find.widgetWithText(FilledButton, 'Reintentar'));
        await tester.pumpAndSettle();
        expect(find.text('Falta terminar de cerrar tu sesión'), findsOneWidget);

        // Antes de limpiar no se restaura ninguna sesión.
        final getsAntes = api.solicitudes
            .where((s) => s.metodo == 'GET')
            .length;

        // Reintento correcto: se completa la limpieza y vuelve el acceso público.
        almacen.fallarBorrar = false;
        await tester.tap(find.widgetWithText(FilledButton, 'Reintentar'));
        await tester.pumpAndSettle();
        expect(almacen.guardada, isNull);
        expect(find.byType(AccesoPantalla), findsOneWidget);
        expect(find.text('Cerraste sesión.'), findsOneWidget);
        expect(
          api.solicitudes.where((s) => s.metodo == 'GET').length,
          getsAntes,
        );
      },
    );

    test(
      'no restaura la sesión mientras haya una limpieza de cierre pendiente',
      () async {
        final api = ApiFalsa();
        responderLoginYSesion(api);
        final almacen = AlmacenamientoEnMemoria(guardadaVigente());
        final sesion = crearSesion(api, almacen);
        await sesion.restaurar();
        expect(sesion.estado, isA<SesionAutenticada>());
        almacen.fallarBorrar = true;
        await sesion.cerrar();
        expect(sesion.estado, isA<SesionLimpiezaPendiente>());

        final getsAntes = api.contar('GET', '/auth/sesion');
        await sesion.restaurar();
        expect(sesion.estado, isA<SesionLimpiezaPendiente>());
        expect(api.contar('GET', '/auth/sesion'), getsAntes);
      },
    );
  });

  group('navegación pública y privada (5.4)', () {
    testWidgets('las rutas públicas están disponibles sin sesión', (
      tester,
    ) async {
      await montar(tester);
      await tester.tap(
        find.widgetWithText(TextButton, 'Contactos de emergencia'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Contactos de emergencia'), findsWidgets);
      expect(
        find.byType(AccesoPantalla),
        findsNothing,
      ); // pantalla pública secundaria
    });

    testWidgets('tras salir, volver atrás no revela la identidad', (
      tester,
    ) async {
      await montar(tester, guardada: guardadaVigente());
      expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Cerrar sesión'));
      await tester.pumpAndSettle();

      // Intentos de volver: gesto/botón atrás del sistema y de la barra.
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Hola, Rosa Quispe'), findsNothing);
      expect(find.textContaining('rosa@ejemplo.com'), findsNothing);
      expect(find.text('Sesión iniciada'), findsNothing);
      expect(find.byType(AccesoPantalla), findsOneWidget);
      // El destino privado es la raíz: no queda una ruta que se pueda reabrir.
      final navegador = tester.state<NavigatorState>(find.byType(Navigator));
      expect(navegador.canPop(), isFalse);
    });

    testWidgets(
      'el destino privado muestra solo la identidad que el servidor asocia al token almacenado',
      (tester) async {
        await montar(
          tester,
          guardada: SesionGuardada(
            token: 'token-de-beto',
            expiresAt: ahoraFijo.add(const Duration(hours: 5)),
          ),
          configurar: (api) => api.manejador = (req) async {
            final autorizacion = req.headers['Authorization'];
            final usuario = autorizacion == 'Bearer token-de-ana'
                ? usuarioJson(nombre: 'Ana', correo: 'ana@ejemplo.com')
                : usuarioJson(nombre: 'Beto', correo: 'beto@ejemplo.com');
            return respuestaJson(200, {
              'usuario': usuario,
              'expiresAt': ahoraFijo
                  .add(const Duration(hours: 5))
                  .toIso8601String(),
            });
          },
        );
        expect(find.text('Hola, Beto'), findsOneWidget);
        expect(find.textContaining('Ana'), findsNothing);
        expect(find.textContaining('ana@ejemplo.com'), findsNothing);
      },
    );

    testWidgets(
      'el destino privado es la raíz de navegación: no hay rutas apiladas que reabrir',
      (tester) async {
        await montar(tester, guardada: guardadaVigente());
        final navegador = tester.state<NavigatorState>(find.byType(Navigator));
        expect(navegador.canPop(), isFalse);
      },
    );
  });
}
