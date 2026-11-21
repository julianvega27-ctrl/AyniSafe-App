import 'package:flutter/material.dart';

import '../../datos/contenido_repositorio.dart' as datos;
import '../servicios.dart';
import '../tema.dart';

/// Tarjeta de un contacto de emergencia aprobado con acción «Llamar», que abre el marcador con
/// el número cargado. No inicia la llamada ni pide permisos.
class ContactoEmergenciaTarjeta extends StatelessWidget {
  const ContactoEmergenciaTarjeta({super.key, required this.contacto});

  final datos.ContactoEmergencia contacto;

  @override
  Widget build(BuildContext context) {
    final marcador = Servicios.of(context).marcador;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(
                contacto.institucion,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: Espaciado.s1),
            Text('Número: ${contacto.numero}'),
            Text('Cobertura: ${contacto.cobertura}'),
            Text(
              'Fuente: ${contacto.fuente} · verificado el ${contacto.verificadoAt}',
              style: const TextStyle(
                fontSize: 14,
                color: Colores.textoSecundario,
              ),
            ),
            const SizedBox(height: Espaciado.s1),
            Semantics(
              button: true,
              label: 'Llamar a ${contacto.institucion}, número ${contacto.numero}',
              excludeSemantics: true,
              child: OutlinedButton.icon(
                onPressed: () => marcador.abrir(contacto.numero),
                icon: const Icon(Icons.call_outlined),
                label: const Text('Llamar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
