import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Información pública a la que se accede sin sesión. Mientras no exista contenido aprobado
/// para publicar, la pantalla lo declara como no disponible: no se inventan teléfonos ni textos.
class ContenidoPublicoPantalla extends StatelessWidget {
  const ContenidoPublicoPantalla({
    super.key,
    required this.titulo,
    required this.explicacion,
  });

  final String titulo;
  final String explicacion;

  static ContenidoPublicoPantalla privacidad() =>
      const ContenidoPublicoPantalla(
        titulo: 'Privacidad',
        explicacion: 'La información de privacidad aún no está disponible en esta versión de la app.',
      );

  static ContenidoPublicoPantalla contactos() => const ContenidoPublicoPantalla(
    titulo: 'Contactos de emergencia',
    explicacion:
        'Los contactos de emergencia aún no están disponibles en esta versión de la app. '
        'AyniSafe no despacha emergencias: en una situación urgente comunícate con los '
        'servicios de emergencia de tu localidad.',
  );

  @override
  Widget build(BuildContext context) {
    return EstructuraPantalla(
      titulo: titulo,
      conBarra: true,
      hijos: [
        const SizedBox(height: Espaciado.s1),
        MensajeAccesible(aviso: Aviso(TipoAviso.info, explicacion)),
      ],
    );
  }
}
