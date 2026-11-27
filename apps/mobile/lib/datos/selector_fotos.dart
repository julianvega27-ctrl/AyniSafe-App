import 'dart:io';

import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

enum OrigenFoto { camara, galeria }

/// Resultado de pedir una foto al sistema.
sealed class SeleccionFoto {
  const SeleccionFoto();
}

final class FotoElegida extends SeleccionFoto {
  const FotoElegida(this.bytes);
  final Uint8List bytes;
}

final class SeleccionCancelada extends SeleccionFoto {
  const SeleccionCancelada();
}

final class SeleccionDenegada extends SeleccionFoto {
  const SeleccionDenegada();
}

final class SeleccionFallida extends SeleccionFoto {
  const SeleccionFallida();
}

/// Cámara o galería. La implementación comprime en el dispositivo; las pruebas usan un doble.
abstract interface class SelectorFotos {
  Future<SeleccionFoto> elegir(OrigenFoto origen);
}

/// `image_picker` con compresión en el dispositivo: lado mayor 2048 px y calidad 80, lo que en
/// Android re-codifica a JPEG (incluidas las HEIC cuando el sistema las decodifica). El archivo
/// temporal que crea el plugin se borra tras leer los bytes: la foto solo queda en memoria.
class SelectorFotosSistema implements SelectorFotos {
  SelectorFotosSistema([ImagePicker? picker]) : _picker = picker ?? ImagePicker();
  final ImagePicker _picker;

  @override
  Future<SeleccionFoto> elegir(OrigenFoto origen) async {
    try {
      final archivo = await _picker.pickImage(
        source: origen == OrigenFoto.camara ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 2048,
        maxHeight: 2048,
        imageQuality: 80,
        requestFullMetadata: false,
      );
      if (archivo == null) return const SeleccionCancelada();
      final bytes = await archivo.readAsBytes();
      try {
        await File(archivo.path).delete();
      } on FileSystemException {
        // El plugin puede reutilizar o haber borrado su copia; no afecta a la foto en memoria.
      }
      return FotoElegida(bytes);
    } on PlatformException catch (e) {
      return e.code.contains('access_denied') || e.code.contains('permission')
          ? const SeleccionDenegada()
          : const SeleccionFallida();
    } on Exception {
      return const SeleccionFallida();
    }
  }
}
