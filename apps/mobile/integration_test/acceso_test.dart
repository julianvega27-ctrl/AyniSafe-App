import 'dart:math';

import 'package:ayni_safe/app.dart';
import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/auth_repositorio.dart';
import 'package:ayni_safe/datos/cliente_http.dart';
import 'package:ayni_safe/datos/contenido_repositorio.dart';
import 'package:ayni_safe/datos/perfil_repositorio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Acceptance en Android real: UI + API + PostgreSQL reales + almacén seguro del sistema.
/// Requiere la API en http://10.0.2.2:3000 (emulador) con su base de datos de desarrollo.
///   flutter test integration_test/acceso_test.dart -d emulator-5554
Future<void> esperar(
  WidgetTester tester,
  Finder finder, {
  Duration limite = const Duration(seconds: 25),
}) async {
  final fin = DateTime.now().add(limite);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 150));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure(
    'No apareció ${finder.describeMatch(Plurality.one)} en ${limite.inSeconds}s',
  );
}

Future<SesionControlador> arrancar(WidgetTester tester) async {
  final http = ClienteHttp();
  final repositorio = AuthRepositorio(http);
  final sesion = SesionControlador(
    repositorio: repositorio,
    almacenamiento: AlmacenamientoSeguro(),
  );
  await sesion.restaurar();
  await tester.pumpWidget(
    AyniSafeApp(
      repositorio: repositorio,
      sesion: sesion,
      contenido: ContenidoRepositorio(http),
      perfil: PerfilRepositorio(http),
    ),
  );
  await tester.pumpAndSettle();
  return sesion;
}

Future<void> escribir(
  WidgetTester tester,
  String etiqueta,
  String texto,
) async {
  await tester.enterText(find.widgetWithText(TextField, etiqueta), texto);
  await tester.pump();
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'registro, inicio de sesión, restauración tras reinicio y cierre en Android real',
    (tester) async {
      const almacen = FlutterSecureStorage();
      await almacen.deleteAll();

      final sufijo = Random().nextInt(1 << 30).toRadixString(36);
      final correo = 'integracion.$sufijo@ejemplo.com';
      const clave = '  contraseña integración con espacios \u{1F600}  '; // espacios en extremos y Unicode no BMP

      await arrancar(tester);
      expect(find.text('Inicia sesión'), findsWidgets);

      // 1. Registro desde la UI.
      final crear = find.widgetWithText(TextButton, 'Crear cuenta');
      await tester.ensureVisible(crear);
      await tester.tap(crear);
      await tester.pumpAndSettle();
      await escribir(tester, 'Nombre', 'Rosa Integración');
      await escribir(
        tester,
        'Correo',
        correo.toUpperCase(),
      ); // el servidor normaliza a minúsculas
      await escribir(tester, 'Contraseña', clave);
      final botonCrear = find.widgetWithText(FilledButton, 'Crear cuenta');
      await tester.ensureVisible(botonCrear);
      await tester.tap(botonCrear);
      await esperar(tester, find.textContaining('Tu cuenta fue creada'));
      await tester.pumpAndSettle();

      // Vuelve al acceso con el correo precargado (normalizado) y la contraseña vacía.
      expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'Correo'))
            .controller!
            .text,
        correo.toLowerCase(),
      );
      expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'Contraseña'))
            .controller!
            .text,
        isEmpty,
      );
      // El alta no deja nada en el almacén del dispositivo.
      expect(await almacen.readAll(), isEmpty);

      // 2. Contraseña errónea: mensaje uniforme.
      await escribir(tester, 'Contraseña', 'una contraseña incorrecta larga');
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await esperar(tester, find.text('Correo o contraseña incorrectos.'));
      await tester.pumpAndSettle();

      // 3. Contraseña con un espacio de menos en los extremos: no autentica.
      await escribir(tester, 'Contraseña', clave.trim());
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await tester.pumpAndSettle();
      await esperar(tester, find.text('Correo o contraseña incorrectos.'));

      // 4. Contraseña exacta: acceso inmediato, sin verificar el correo.
      await escribir(tester, 'Contraseña', clave);
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await esperar(tester, find.text('Reportar un incidente'));
      await tester.pumpAndSettle();
      expect(find.text('Hola, Rosa Integración'), findsOneWidget);
      expect(find.textContaining(correo.toLowerCase()), findsOneWidget);

      // 5. En el almacén seguro solo hay token y vencimiento; la contraseña nunca.
      final guardado = await almacen.readAll();
      expect(guardado.keys.toSet(), {
        'ayni.sesion.token',
        'ayni.sesion.expira',
      });
      expect(
        guardado['ayni.sesion.token'],
        matches(RegExp(r'^[A-Za-z0-9_-]{43}$')),
      );
      expect(guardado.values.join('|'), isNot(contains('contraseña')));
      final token = guardado['ayni.sesion.token']!;

      // 6. "Reinicio" de la app: nueva instancia que lee el almacén real y verifica con el servidor.
      await tester.pumpWidget(const SizedBox.shrink());
      final reiniciada = await arrancar(tester);
      await esperar(tester, find.text('Reportar un incidente'));
      expect(reiniciada.estado, isA<SesionAutenticada>());
      expect(find.text('Hola, Rosa Integración'), findsOneWidget);
      expect((await almacen.readAll())['ayni.sesion.token'], token);

      // 7. Cierre de sesión: revoca, limpia el almacén y vuelve al acceso público.
      await tester.tap(find.byTooltip('Perfil'));
      await tester.pumpAndSettle();
      final cerrarSesion = find.widgetWithText(FilledButton, 'Cerrar sesión');
      await tester.ensureVisible(cerrarSesion);
      await tester.tap(cerrarSesion);
      await esperar(tester, find.text('Cerraste sesión.'));
      await tester.pumpAndSettle();
      expect(await almacen.readAll(), isEmpty);
      expect(find.text('Hola, Rosa Integración'), findsNothing);

      // 8. El token revocado ya no sirve: una app nueva con ese token recibe 401 y limpia.
      await almacen.write(key: 'ayni.sesion.token', value: token);
      await almacen.write(
        key: 'ayni.sesion.expira',
        value: DateTime.now()
            .toUtc()
            .add(const Duration(hours: 1))
            .toIso8601String(),
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await arrancar(tester);
      await esperar(tester, find.textContaining('Tu sesión terminó'));
      expect(await almacen.readAll(), isEmpty);
      expect(find.text('Hola, Rosa Integración'), findsNothing);
    },
  );
}
