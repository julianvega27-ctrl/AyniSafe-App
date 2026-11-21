import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/contenido_repositorio.dart';
import '../tema.dart';
import 'contacto_emergencia.dart';
import 'mensaje_accesible.dart';

/// Texto cuando no hay contactos aprobados: no se inventan números.
const String textoContactosNoDisponibles =
    'Los contactos de emergencia aún no están disponibles en esta versión de la app. '
    'AyniSafe no despacha emergencias: en una situación urgente comunícate con los '
    'servicios de emergencia de tu localidad.';

const String textoNoDespacha =
    'AyniSafe no despacha emergencias: en una situación urgente comunícate con '
    'los servicios de emergencia de tu localidad.';

/// Contactos de emergencia aprobados, o el aviso de que aún no los hay.
class BloqueContactos extends StatelessWidget {
  const BloqueContactos({super.key, required this.contenido});

  final ContenidoPublico contenido;

  @override
  Widget build(BuildContext context) {
    if (!contenido.contactosAprobados || contenido.contactos.isEmpty) {
      return const MensajeAccesible(
        aviso: Aviso(TipoAviso.info, textoContactosNoDisponibles),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final contacto in contenido.contactos) ...[
          ContactoEmergenciaTarjeta(contacto: contacto),
          const SizedBox(height: Espaciado.s1),
        ],
        const Text(
          textoNoDespacha,
          style: TextStyle(color: Colores.textoSecundario),
        ),
      ],
    );
  }
}
