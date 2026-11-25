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

/// Corte de red DESPUÉS del commit del alta. Se ejecuta contra un proxy que reenvía a la API y
/// descarta la respuesta de la primera alta (ver README, "Verificación de resultado incierto"):
///   flutter test integration_test/perdida_respuesta_test.dart -d emulator-5554 \
///     --dart-define=API_BASE_URL=http://10.0.2.2:3001
Future<void> esperar(
  WidgetTester tester,
  Finder finder, {
  Duration limite = const Duration(seconds: 30),
}) async {
  final fin = DateTime.now().add(limite);
  while (DateTime.now().isBefore(fin)) {
    await tester.pump(const Duration(milliseconds: 150));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('No apareció ${finder.describeMatch(Plurality.one)}');
}

Future<void> escribir(
  WidgetTester tester,
  String etiqueta,
  String texto,
) async {
  await tester.enterText(find.widgetWithText(TextField, etiqueta), texto);
  await tester.pump();
}

String campo(WidgetTester tester, String etiqueta) => tester
    .widget<TextField>(find.widgetWithText(TextField, etiqueta))
    .controller!
    .text;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'respuesta del alta perdida tras el commit: incierto, sin cuenta doble y acceso posterior correcto',
    (tester) async {
      await const FlutterSecureStorage().deleteAll();
      final correo =
          'perdida.${Random().nextInt(1 << 30).toRadixString(36)}@ejemplo.com';
      const clave = 'contraseña tras corte de red 789';

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
      // Navegación pública: la cuenta se abre desde la cabecera.
      await tester.tap(find.byTooltip('Iniciar sesión o crear cuenta'));
      await tester.pumpAndSettle();

      final enlace = find.widgetWithText(TextButton, 'Crear cuenta');
      await tester.ensureVisible(enlace);
      await tester.tap(enlace);
      await tester.pumpAndSettle();
      await escribir(tester, 'Nombre', 'Rosa Corte');
      await escribir(tester, 'Correo', correo);
      await escribir(tester, 'Contraseña', clave);
      final crear = find.widgetWithText(FilledButton, 'Crear cuenta');
      await tester.ensureVisible(crear);
      await tester.tap(crear);

      // La cuenta se creó en el servidor, pero la respuesta nunca llegó: resultado incierto.
      await esperar(
        tester,
        find.textContaining('No pudimos confirmar si tu cuenta se creó'),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Tu cuenta fue creada'),
        findsNothing,
      ); // no se afirma éxito
      expect(find.text('Reportar un incidente'), findsNothing);
      expect(campo(tester, 'Nombre'), 'Rosa Corte'); // se conservan los datos
      expect(campo(tester, 'Correo'), correo);

      // Sin reintento automático: pasa el tiempo y la pantalla sigue igual.
      await tester.pump(const Duration(seconds: 6));
      expect(
        find.textContaining('No pudimos confirmar si tu cuenta se creó'),
        findsOneWidget,
      );

      // Reintento manual: el correo ya existe, así que NO se crea una segunda cuenta (409).
      await tester.ensureVisible(crear);
      await tester.tap(crear);
      await esperar(
        tester,
        find.text('Este correo ya está registrado. Inicia sesión.'),
      );

      // Se vuelve al acceso con el correo y se inicia sesión con las credenciales correctas.
      final iniciar = find.widgetWithText(TextButton, 'Inicia sesión');
      await tester.ensureVisible(iniciar);
      await tester.tap(iniciar);
      await tester.pumpAndSettle();
      expect(campo(tester, 'Correo'), correo);
      expect(campo(tester, 'Contraseña'), isEmpty);
      await escribir(tester, 'Contraseña', clave);
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await esperar(tester, find.text('Reportar un incidente'));
      expect(find.text('Hola, Rosa Corte'), findsOneWidget);

      // Cierra para no dejar una sesión viva.
      await tester.tap(find.byTooltip('Abrir perfil'));
      await tester.pumpAndSettle();
      final cerrarSesion = find.text('Cerrar sesión');
      await tester.ensureVisible(cerrarSesion);
      await tester.tap(cerrarSesion);
      await esperar(tester, find.text('Cerraste sesión.'));
    },
  );
}
