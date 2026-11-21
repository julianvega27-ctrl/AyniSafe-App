import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/contenido_repositorio.dart';
import '../componentes/bloque_contactos.dart';
import '../componentes/contenido_cargado.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Páginas informativas que muestran el contenido público versionado.
enum SeccionPublica {
  app('Acerca de AyniSafe'),
  desarrolladores('Desarrolladores'),
  privacidad('Privacidad'),
  contactos('Contactos de emergencia');

  const SeccionPublica(this.titulo);
  final String titulo;
}

/// Información pública a la que se accede sin sesión (y desde el perfil). Lee la fuente
/// versionada de la API; una sección no aprobada se declara «no disponible»: no se inventan
/// textos, personas ni teléfonos.
class ContenidoPublicoPantalla extends StatelessWidget {
  const ContenidoPublicoPantalla({super.key, required this.seccion});

  final SeccionPublica seccion;

  @override
  Widget build(BuildContext context) {
    return EstructuraPantalla(
      titulo: seccion.titulo,
      conBarra: true,
      hijos: [
        const SizedBox(height: Espaciado.s1),
        ContenidoCargado(constructor: _contenido),
      ],
    );
  }

  Widget _contenido(BuildContext context, ContenidoPublico contenido) {
    final tema = Theme.of(context).textTheme;
    Widget bloque(String titulo, String texto) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(header: true, child: Text(titulo, style: tema.titleMedium)),
        const SizedBox(height: Espaciado.s1),
        Text(texto, style: tema.bodyLarge),
        const SizedBox(height: Espaciado.s2),
      ],
    );
    Widget pendiente(String texto) =>
        MensajeAccesible(aviso: Aviso(TipoAviso.info, texto));

    switch (seccion) {
      case SeccionPublica.app:
        if (!contenido.appAprobada ||
            contenido.finalidad == null ||
            contenido.funcionamiento == null) {
          return pendiente(
            'La información sobre AyniSafe aún no está disponible en esta versión de la app.',
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            bloque('Finalidad', contenido.finalidad!),
            bloque('Cómo funciona', contenido.funcionamiento!),
          ],
        );
      case SeccionPublica.desarrolladores:
        if (!contenido.desarrolladoresAprobados ||
            contenido.desarrolladores.isEmpty) {
          return pendiente(
            'La información de los desarrolladores aún no está disponible en esta versión de la app.',
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final p in contenido.desarrolladores)
              bloque(p.nombre, p.rol),
          ],
        );
      case SeccionPublica.privacidad:
        if (!contenido.privacidadAprobada || contenido.privacidad.isEmpty) {
          return pendiente(
            'La información de privacidad aún no está disponible en esta versión de la app.',
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final s in contenido.privacidad) bloque(s.titulo, s.texto),
          ],
        );
      case SeccionPublica.contactos:
        return BloqueContactos(contenido: contenido);
    }
  }
}
