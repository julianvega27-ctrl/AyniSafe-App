import 'package:flutter/material.dart';

import '../tema.dart';

/// `MessageCard` y `ScreenPadding` del origen (screens/common.dart): tarjeta blanca del tema con icono y
/// texto. El icono acompaña al texto; nunca transmite el significado por sí solo.
class TarjetaMensaje extends StatelessWidget {
  const TarjetaMensaje({
    super.key,
    required this.child,
    this.icono = Icons.info_outline,
    this.colorIcono,
  });

  final Widget child;
  final IconData icono;
  final Color? colorIcono;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icono,
            color: colorIcono ?? Theme.of(context).colorScheme.primary,
            size: MediaQuery.textScalerOf(context).scale(24),
          ),
          const SizedBox(width: 12),
          Expanded(child: child),
        ],
      ),
    ),
  );
}

/// Margen de 16 de las pantallas del origen.
class MargenPantalla extends StatelessWidget {
  const MargenPantalla({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.all(Espaciado.s2), child: child);
}
