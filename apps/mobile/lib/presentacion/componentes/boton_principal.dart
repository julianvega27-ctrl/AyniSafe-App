import 'package:flutter/material.dart';

import '../tema.dart';

/// Botón de acción principal con estados normal, pulsado, cargando y deshabilitado.
/// Mientras `cargando` es true no acepta nuevas pulsaciones.
class BotonPrincipal extends StatelessWidget {
  const BotonPrincipal({
    super.key,
    required this.texto,
    required this.alPulsar,
    this.cargando = false,
    this.textoCargando = 'Enviando…',
  });

  final String texto;
  final VoidCallback? alPulsar;
  final bool cargando;
  final String textoCargando;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: cargando ? null : alPulsar,
      child: cargando
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  // El botón queda deshabilitado (como en el origen): el indicador usa su primer plano,
                  // porque el blanco no se distinguía sobre el fondo gris.
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: Espaciado.s1),
                Text(textoCargando),
              ],
            )
          : Text(texto),
    );
  }
}
