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

/// Evidencia renderizada P2 (Android real, API y PostgreSQL reales). Guarda capturas del dispositivo
/// mediante el driver `test_driver/capturas.dart`:
///   flutter drive --driver=test_driver/capturas.dart \
///     --target=integration_test/capturas_p2_test.dart -d DISPOSITIVO \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3000
/// Crea una cuenta ciudadana de prueba (`capturas.<aleatorio>@ejemplo.com`) en la base de desarrollo.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> esperar(WidgetTester tester, Finder f) async {
    final fin = DateTime.now().add(const Duration(seconds: 25));
    while (DateTime.now().isBefore(fin)) {
      await tester.pump(const Duration(milliseconds: 150));
      if (f.evaluate().isNotEmpty) return;
    }
    await binding.takeScreenshot('movil-diagnostico-fallo');
    throw TestFailure('No apareció ${f.describeMatch(Plurality.one)}');
  }

  final errores = <String>[];
  Future<void> capturar(WidgetTester tester, String nombre) async {
    await tester.pumpAndSettle();
    final ex = tester.takeException();
    if (ex != null) errores.add('$nombre: $ex');
    await binding.takeScreenshot('movil-destino-$nombre');
  }

  Future<void> tocar(WidgetTester tester, Finder f) async {
    // El teclado real reduce el área visible: se cierra antes de localizar el control.
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> menu(WidgetTester tester, String titulo) async {
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tocar(tester, find.widgetWithText(ListTile, titulo));
  }

  Finder barra(String d) =>
      find.descendant(of: find.byType(NavigationBar), matching: find.text(d));

  Future<SesionControlador> arrancar(WidgetTester tester) async {
    final http = ClienteHttp();
    final repositorio = AuthRepositorio(http);
    final sesion = SesionControlador(repositorio: repositorio, almacenamiento: AlmacenamientoSeguro());
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

  // Una sola alta por ejecución: la API limita las altas por IP y la segunda pasada reutiliza la cuenta.
  final correo = 'capturas.${Random().nextInt(1 << 30).toRadixString(36)}@ejemplo.com';

  Future<void> recorrido(WidgetTester tester, {required String sufijo, required bool registrar}) async {
    const almacen = FlutterSecureStorage();
    await almacen.deleteAll();
    const clave = 'contraseña de capturas P2 segura';

    await arrancar(tester);
    await esperar(tester, find.byTooltip('Iniciar sesión o crear cuenta'));
    await capturar(tester, 'publico-inicio$sufijo');
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await capturar(tester, 'publico-drawer$sufijo');
    await tester.binding.handlePopRoute(); // el retroceso cierra el Drawer
    await tester.pumpAndSettle();
    await tocar(tester, barra('Reportar'));
    await capturar(tester, 'publico-reportar$sufijo');
    await tocar(tester, barra('Contactos'));
    await capturar(tester, 'publico-contactos$sufijo');
    await menu(tester, 'Conoce AyniSafe');
    await capturar(tester, 'publico-informacion$sufijo');

    // Cuenta: acceso, error de credenciales y registro.
    await tocar(tester, find.byTooltip('Iniciar sesión o crear cuenta'));
    await capturar(tester, 'publico-acceso$sufijo');
    await tester.enterText(find.widgetWithText(TextField, 'Correo'), correo);
    await tester.enterText(find.widgetWithText(TextField, 'Contraseña'), 'no es la contraseña correcta');
    await tocar(tester, find.widgetWithText(FilledButton, 'Ingresar'));
    await esperar(tester, find.text('Correo o contraseña incorrectos.'));
    await capturar(tester, 'publico-acceso-error$sufijo');
    await tocar(tester, find.widgetWithText(TextButton, 'Crear cuenta'));
    await capturar(tester, 'publico-registro$sufijo');
    if (registrar) {
      await tester.enterText(find.widgetWithText(TextField, 'Nombre'), 'Rosa Capturas');
      await tester.enterText(find.widgetWithText(TextField, 'Correo'), correo);
      await tester.enterText(find.widgetWithText(TextField, 'Contraseña'), clave);
      await tocar(tester, find.widgetWithText(FilledButton, 'Crear cuenta'));
      await esperar(tester, find.textContaining('Tu cuenta fue creada'));
    } else {
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Correo'), correo);
    }
    await tester.enterText(find.widgetWithText(TextField, 'Contraseña'), clave);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Ingresar'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
    // Estado de carga real mientras el servidor verifica la contraseña (sin esperar la respuesta).
    await tester.pump(const Duration(milliseconds: 16));
    expect(find.text('Ingresando…'), findsOneWidget);
    await binding.takeScreenshot('movil-destino-publico-acceso-carga$sufijo');
    await esperar(tester, find.text('Hola, Rosa Capturas'));

    // Navegación autenticada.
    await capturar(tester, 'cuenta-inicio$sufijo');
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await capturar(tester, 'cuenta-drawer$sufijo');
    await tocar(tester, find.widgetWithText(ListTile, 'Mis reportes'));
    await capturar(tester, 'cuenta-mis-reportes$sufijo');
    await tocar(tester, find.byTooltip('Abrir perfil'));
    await esperar(tester, find.text(correo));
    await capturar(tester, 'cuenta-perfil$sufijo');
    await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
    await capturar(tester, 'cuenta-editar$sufijo');
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Cierre: vuelve a Inicio público con aviso.
    await tocar(tester, find.text('Cerrar sesión'));
    await esperar(tester, find.text('Cerraste sesión.'));
    await capturar(tester, 'publico-tras-cierre$sufijo');
    expect(await almacen.readAll(), isEmpty);
  }

  testWidgets('capturas P2 en Android a escala 1,0', (tester) async {
    await binding.convertFlutterSurfaceToImage();
    await recorrido(tester, sufijo: '', registrar: true);
    expect(errores, isEmpty, reason: errores.join('\n'));
  });

  testWidgets('capturas P2 en Android con texto al 200 %', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await binding.convertFlutterSurfaceToImage();
    await recorrido(tester, sufijo: '-texto200', registrar: false);
    expect(errores, isEmpty, reason: errores.join('\n'));
  });
}
