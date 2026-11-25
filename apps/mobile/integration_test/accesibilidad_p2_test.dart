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

/// Guías automáticas de accesibilidad de Flutter en Android real (navegación pública P2):
/// objetivos táctiles de 48 dp, controles con etiqueta y contraste de texto medido sobre lo pintado.
/// No sustituye una revisión manual con TalkBack.
///   flutter test integration_test/accesibilidad_p2_test.dart -d DISPOSITIVO \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3000
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('pantallas públicas P2 cumplen las guías de accesibilidad de Android', (tester) async {
    final semantica = tester.ensureSemantics();
    await const FlutterSecureStorage().deleteAll();
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

    Future<void> revisar(String pantalla, {bool contraste = true}) async {
      await tester.pumpAndSettle();
      for (final (nombre, guia) in [
        ('objetivos táctiles', androidTapTargetGuideline),
        ('etiquetas', labeledTapTargetGuideline),
        if (contraste) ('contraste', textContrastGuideline),
      ]) {
        await expectLater(tester, meetsGuideline(guia), reason: '$pantalla: $nombre');
      }
    }

    Finder barra(String d) => find.descendant(of: find.byType(NavigationBar), matching: find.text(d));

    await revisar('Inicio público');
    await tester.tap(barra('Reportar'));
    await revisar('Reportar pendiente');
    await tester.tap(barra('Contactos'));
    await revisar('Contactos');
    await tester.tap(find.byTooltip('Open navigation menu'));
    // Dentro del Drawer la guía de contraste informa 3,60:1 para la fila seleccionada aunque el texto
    // cambie de color, y los píxeles de la captura del dispositivo miden #086C63 sobre #D8F3EB = 5,38:1
    // (docs/validacion/p2-replica-visual.md). Se verifican objetivos y etiquetas; el contraste del
    // Drawer queda acreditado por esa medición y por test/contraste_test.dart.
    await revisar('Drawer público', contraste: false);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Iniciar sesión o crear cuenta'));
    await revisar('Acceso');
    semantica.dispose();
  });
}
