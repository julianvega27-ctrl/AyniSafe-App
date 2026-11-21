import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../tema.dart';

/// Mensaje con icono y texto (nunca solo color) y, si corresponde, una acción para continuar.
/// El texto se anuncia como región en vivo; la acción es un botón independiente y accesible.
class MensajeAccesible extends StatelessWidget {
  const MensajeAccesible({
    super.key,
    required this.aviso,
    this.etiquetaAccion,
    this.alAccionar,
  });

  final Aviso aviso;
  final String? etiquetaAccion;
  final VoidCallback? alAccionar;

  ({IconData icono, Color color, Color fondo, String prefijo}) get _estilo =>
      switch (aviso.tipo) {
        TipoAviso.error => (
          icono: Icons.error_outline,
          color: Colores.error,
          fondo: Colores.fondoError,
          prefijo: 'Error',
        ),
        TipoAviso.info => (
          icono: Icons.info_outline,
          color: Colores.info,
          fondo: Colores.fondoInfo,
          prefijo: 'Información',
        ),
        TipoAviso.exito => (
          icono: Icons.check_circle_outline,
          color: Colores.exito,
          fondo: Colores.fondoExito,
          prefijo: 'Listo',
        ),
      };

  @override
  Widget build(BuildContext context) {
    final estilo = _estilo;
    return Container(
      padding: const EdgeInsets.all(Espaciado.s2),
      decoration: BoxDecoration(
        color: estilo.fondo,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: estilo.color, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            liveRegion: true,
            container: true,
            excludeSemantics: true,
            label: '${estilo.prefijo}: ${aviso.texto}',
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  estilo.icono,
                  color: estilo.color,
                  size: MediaQuery.textScalerOf(context).scale(24),
                ),
                const SizedBox(width: Espaciado.s1),
                Expanded(
                  child: Text(
                    aviso.texto,
                    style: TextStyle(
                      fontSize: tamanoTextoBase,
                      color: estilo.color,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (etiquetaAccion != null && alAccionar != null)
            TextButton(onPressed: alAccionar, child: Text(etiquetaAccion!)),
        ],
      ),
    );
  }
}
