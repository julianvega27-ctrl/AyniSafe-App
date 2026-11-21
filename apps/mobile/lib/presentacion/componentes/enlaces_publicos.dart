import 'package:flutter/material.dart';

import '../pantallas/contenido_publico_pantalla.dart';
import '../tema.dart';

/// Accesos a información pública (sin sesión): privacidad y contactos de emergencia.
class EnlacesPublicos extends StatelessWidget {
  const EnlacesPublicos({super.key});

  void _abrir(BuildContext context, Widget pantalla) {
    Navigator.of(context)
        .push<void>(MaterialPageRoute<void>(builder: (_) => pantalla));
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: Espaciado.s1,
      runSpacing: Espaciado.s1,
      children: [
        TextButton(
          onPressed: () =>
              _abrir(context, ContenidoPublicoPantalla.privacidad()),
          child: const Text('Privacidad'),
        ),
        TextButton(
          onPressed: () =>
              _abrir(context, ContenidoPublicoPantalla.contactos()),
          child: const Text('Contactos de emergencia'),
        ),
      ],
    );
  }
}
