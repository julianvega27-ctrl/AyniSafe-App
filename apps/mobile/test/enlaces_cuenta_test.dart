import 'dart:async';
import 'dart:io';

import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/enlaces_cuenta.dart';
import 'package:ayni_safe/datos/resultados_recuperacion.dart';
import 'package:ayni_safe/presentacion/pantallas/acceso_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/nueva_contrasena_pantalla.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

const String _token = 'token-identificable-0123456789abcdefghijklmnopq';
const String _otro = 'otro-token-identificable-abcdefghijklmnopqrstuv';

Uri _enlace(String ruta, String token) =>
    Uri.parse('https://api.ayinisafe.test$ruta#t=$token');

class FuenteFalsa implements FuenteDeEnlaces {
  final StreamController<Uri> controlador = StreamController<Uri>.broadcast();
  @override
  Stream<Uri> get recibidos => controlador.stream;
}

void main() {
  group('interpretarEnlace (9.1)', () {
    test('reconoce recuperación y activación con el token en el fragmento', () {
      final rec = interpretarEnlace(_enlace('/cuenta/restablecer', _token))!;
      expect(rec.esperado, PropositoToken.recuperacion);
      expect(rec.token, _token);
      final act = interpretarEnlace(_enlace('/cuenta/activar', _token))!;
      expect(act.esperado, PropositoToken.activacion);
    });

    test('rechaza lo que no tiene exactamente esa forma', () {
      for (final texto in [
        'http://api.ayinisafe.test/cuenta/restablecer#t=$_token', // no https
        'https://api.ayinisafe.test/cuenta/otra#t=$_token', // ruta ajena
        'https://api.ayinisafe.test/cuenta/restablecer', // sin fragmento
        'https://api.ayinisafe.test/cuenta/restablecer?t=$_token', // token en la consulta: no se acepta
        'https://api.ayinisafe.test/cuenta/restablecer#x=$_token', // clave distinta
        'https://api.ayinisafe.test/cuenta/restablecer#t=corto', // demasiado corto
        'https://api.ayinisafe.test/cuenta/restablecer#t=${'a' * 201}', // demasiado largo
        'https://api.ayinisafe.test/cuenta/restablecer#t=$_token&y=1', // parámetros extra
        'https://api.ayinisafe.test/cuenta/restablecer/#t=$_token', // ruta con barra final
        'https://api.ayinisafe.test/api/v1/cuenta/restablecer#t=$_token',
      ]) {
        expect(interpretarEnlace(Uri.parse(texto)), isNull, reason: texto);
      }
    });
  });

  group('la app abre el enlace del correo (9.1)', () {
    Future<({ApiFalsa api, FuenteFalsa fuente, List<String> consultados})> montar(
      WidgetTester tester, {
      bool restaurar = true,
    }) async {
      final api = ApiFalsa();
      final consultados = <String>[];
      api.manejador = (req) async {
        if (req.url.path.endsWith('/auth/tokens/consulta')) {
          consultados.add(req.body);
          return respuestaJson(200, {'proposito': 'recuperacion', 'expiresAt': '2026-11-21T15:30:00.000Z'});
        }
        return respuestaJson(500, null);
      };
      final fuente = FuenteFalsa();
      final sesion = crearSesion(api, AlmacenamientoEnMemoria());
      if (restaurar) await sesion.restaurar();
      await tester.pumpWidget(
        appDePrueba(api, sesion, enlaces: fuente),
      );
      await tester.pumpAndSettle();
      addTearDown(fuente.controlador.close);
      return (api: api, fuente: fuente, consultados: consultados);
    }

    testWidgets('con la app abierta: el enlace lleva a «nueva contraseña» con el token ya cargado y sin mostrarlo', (tester) async {
      final m = await montar(tester);
      expect(find.byType(AccesoPantalla), findsOneWidget);
      m.fuente.controlador.add(_enlace('/cuenta/restablecer', _token));
      await tester.pumpAndSettle();
      expect(find.byType(NuevaContrasenaPantalla), findsOneWidget);
      expect(find.text('Nueva contraseña'), findsOneWidget);
      expect(m.consultados, hasLength(1));
      expect(m.consultados.single, contains(_token));
      // El token nunca se muestra en pantalla.
      expect(find.textContaining(_token), findsNothing);
      expect(find.textContaining('token-identificable'), findsNothing);
    });

    testWidgets('arranque en frío: el enlace llega antes de verificar la sesión y se abre al terminar', (tester) async {
      final api = ApiFalsa();
      var consultas = 0;
      final liberar = Completer<void>();
      api.manejador = (req) async {
        if (req.url.path.endsWith('/auth/tokens/consulta')) {
          consultas += 1;
          return respuestaJson(200, {'proposito': 'recuperacion', 'expiresAt': '2026-11-21T15:30:00.000Z'});
        }
        await liberar.future; // GET /auth/sesion tarda
        return respuestaJson(401, errorJson('UNAUTHENTICATED'));
      };
      final fuente = FuenteFalsa();
      addTearDown(fuente.controlador.close);
      final almacen = AlmacenamientoEnMemoria(
        SesionGuardada(token: 'previo', expiresAt: ahoraFijo.add(const Duration(hours: 5))),
      );
      final sesion = crearSesion(api, almacen);
      unawaited(sesion.restaurar());
      await tester.pumpWidget(appDePrueba(api, sesion, enlaces: fuente));
      await tester.pump();

      fuente.controlador.add(_enlace('/cuenta/restablecer', _token));
      await tester.pump();
      expect(consultas, 0, reason: 'no se abre nada mientras se verifica la sesión');
      expect(find.byType(NuevaContrasenaPantalla), findsNothing);

      liberar.complete();
      await tester.pumpAndSettle();
      expect(find.byType(NuevaContrasenaPantalla), findsOneWidget);
      expect(consultas, 1);
    });

    testWidgets('el mismo enlace duplicado al arrancar se abre una sola vez', (tester) async {
      final m = await montar(tester);
      m.fuente.controlador.add(_enlace('/cuenta/restablecer', _token));
      m.fuente.controlador.add(_enlace('/cuenta/restablecer', _token));
      await tester.pumpAndSettle();
      expect(find.byType(NuevaContrasenaPantalla), findsOneWidget);
      expect(m.consultados, hasLength(1));
    });

    testWidgets('un enlace nuevo reemplaza al anterior en segundo plano', (tester) async {
      final m = await montar(tester);
      m.fuente.controlador.add(_enlace('/cuenta/restablecer', _token));
      await tester.pumpAndSettle();
      await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 4)));
      m.fuente.controlador.add(_enlace('/cuenta/restablecer', _otro));
      await tester.pumpAndSettle();
      expect(find.byType(NuevaContrasenaPantalla), findsOneWidget);
      expect(m.consultados, hasLength(2));
      expect(m.consultados.last, contains(_otro));
    });

    testWidgets('un enlace con otra forma se ignora sin consultar nada', (tester) async {
      final m = await montar(tester);
      m.fuente.controlador.add(Uri.parse('https://api.ayinisafe.test/cuenta/restablecer?t=$_token'));
      m.fuente.controlador.add(Uri.parse('https://api.ayinisafe.test/otra'));
      await tester.pumpAndSettle();
      expect(find.byType(AccesoPantalla), findsOneWidget);
      expect(m.api.solicitudes, isEmpty);
    });
  });

  group('configuración de Android (9.1)', () {
    final manifiesto = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

    test('el intent-filter de enlaces es verificado, https, navegable y limitado a /cuenta/', () {
      final bloque = RegExp(
        r'<intent-filter android:autoVerify="true">([\s\S]*?)</intent-filter>',
      ).firstMatch(manifiesto)!.group(1)!;
      expect(bloque, contains('android.intent.action.VIEW'));
      expect(bloque, contains('android.intent.category.DEFAULT'));
      expect(bloque, contains('android.intent.category.BROWSABLE'));
      expect(bloque, contains('android:scheme="https"'));
      expect(bloque, contains(r'android:host="${apiHost}"'));
      expect(bloque, contains('android:pathPrefix="/cuenta/"'));
      // No hay esquemas propios ni hosts fijos que puedan suplantarse.
      expect(RegExp('android:scheme="(?!https")').hasMatch(bloque), isFalse);
    });

    test('el host viene de ayni.api.host y, sin definirlo, de un host reservado que no coincide con nada', () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle, contains('manifestPlaceholders["apiHost"]'));
      expect(gradle, contains('ayni.api.host'));
      expect(gradle, contains('api.ayinisafe.invalid'));
    });

    test('sigue sin pedir permisos nuevos', () {
      final permisos = RegExp(r'uses-permission[^>]*android:name="([^"]+)"')
          .allMatches(manifiesto)
          .map((m) => m.group(1))
          .toList();
      expect(permisos, ['android.permission.INTERNET']);
    });

    test('declara solo la consulta del marcador (tel/DIAL), sin permiso de llamada', () {
      expect(manifiesto, contains('android.intent.action.DIAL'));
      expect(manifiesto, contains('android:scheme="tel"'));
      expect(manifiesto, isNot(contains('CALL_PHONE')));
      expect(manifiesto, isNot(contains('ACCESS_FINE_LOCATION')));
      expect(manifiesto, isNot(contains('POST_NOTIFICATIONS')));
    });
  });
}
