import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Guarda las capturas de `integration_test/capturas_p2_test.dart` en la evidencia P2.
Future<void> main() => integrationDriver(
  onScreenshot: (nombre, bytes, [argumentos]) async {
    final archivo = File('../../docs/validacion/p2/capturas/$nombre.png');
    archivo.createSync(recursive: true);
    archivo.writeAsBytesSync(bytes);
    return true;
  },
);
