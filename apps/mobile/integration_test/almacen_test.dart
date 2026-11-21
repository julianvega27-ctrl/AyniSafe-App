import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Deja un token identificable en el almacén seguro REAL del dispositivo (sin borrarlo) para
/// que se inspeccione después el almacenamiento de la app con `adb run-as` y se compruebe que
/// no hay texto plano en preferencias ni archivos. Ver apps/mobile/README.md.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('guarda un token identificable en el almacén seguro', (
    tester,
  ) async {
    final almacen = AlmacenamientoSeguro();
    await almacen.borrar();
    await almacen.guardar(
      SesionGuardada(
        token: 'TOKEN-IDENTIFICABLE-ZZ9-plaintext-check-0123456789',
        expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
      ),
    );
    final leida = await almacen.leer();
    expect(leida?.token, 'TOKEN-IDENTIFICABLE-ZZ9-plaintext-check-0123456789');
  });
}
