import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/sesion_controlador.dart';
import '../componentes/bloque_contactos.dart';
import '../componentes/contenido_cargado.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Inicio orientado a acciones. «Reportar un incidente» aún no existe: se muestra deshabilitado
/// y declarado como «Disponible próximamente», sin abrir un flujo ni simular reportes.
class InicioPantalla extends StatelessWidget {
  const InicioPantalla({super.key, required this.estado});

  final SesionAutenticada estado;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    return EstructuraPantalla(
      titulo: 'Hola, ${estado.usuario.nombre}',
      hijos: [
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(Espaciado.s2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const FilledButton(
                  // Sin acción: el reporte de incidentes llega en una entrega posterior.
                  onPressed: null,
                  child: Text('Reportar un incidente'),
                ),
                const SizedBox(height: Espaciado.s1),
                Row(
                  children: [
                    ExcludeSemantics(
                      child: Icon(
                        Icons.schedule,
                        size: MediaQuery.textScalerOf(context).scale(20),
                        color: Colores.textoSecundario,
                      ),
                    ),
                    const SizedBox(width: Espaciado.s1),
                    const Expanded(
                      child: Text(
                        'Disponible próximamente',
                        style: TextStyle(
                          color: Colores.textoSecundario,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: Espaciado.s3),
        Semantics(
          header: true,
          child: Text('Mis últimos reportes', style: tema.titleMedium),
        ),
        const SizedBox(height: Espaciado.s1),
        const MensajeAccesible(
          aviso: Aviso(
            TipoAviso.info,
            'Aún no disponible: tus reportes aparecerán aquí cuando puedas enviarlos.',
          ),
        ),
        const SizedBox(height: Espaciado.s3),
        Semantics(
          header: true,
          child: Text('Contactos de emergencia', style: tema.titleMedium),
        ),
        const SizedBox(height: Espaciado.s1),
        ContenidoCargado(
          constructor: (_, contenido) => BloqueContactos(contenido: contenido),
        ),
        const SizedBox(height: Espaciado.s2),
      ],
    );
  }
}
