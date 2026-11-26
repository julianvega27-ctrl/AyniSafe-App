import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Guarda las capturas de `integration_test/recorrido_p4_test.dart` en la evidencia P4.1.
Future<void> main() => integrationDriver(
  onScreenshot: (nombre, bytes, [argumentos]) async {
    final archivo = File('../../docs/validacion/p4/capturas/$nombre.png');
    archivo.createSync(recursive: true);
    archivo.writeAsBytesSync(bytes);
    return true;
  },
);
