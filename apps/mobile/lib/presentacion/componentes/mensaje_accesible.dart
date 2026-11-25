import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../tema.dart';
import 'tarjeta_mensaje.dart';

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
    // Lenguaje de MessageCard del origen: tarjeta blanca, icono de color y texto del tema.
    return TarjetaMensaje(
      icono: estilo.icono,
      colorIcono: estilo.color,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            liveRegion: true,
            container: true,
            excludeSemantics: true,
            label: '${estilo.prefijo}: ${aviso.texto}',
            child: Text(
              aviso.texto,
              style: TextStyle(
                fontSize: tamanoTextoBase,
                height: 1.35,
                color: aviso.tipo == TipoAviso.error ? estilo.color : null,
                fontWeight: aviso.tipo == TipoAviso.error
                    ? FontWeight.w600
                    : null,
              ),
            ),
          ),
          if (etiquetaAccion != null && alAccionar != null)
            TextButton(onPressed: alAccionar, child: Text(etiquetaAccion!)),
        ],
      ),
    );
  }
}
