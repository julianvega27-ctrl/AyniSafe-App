import 'package:flutter/material.dart';

import '../tema.dart';
import 'tarjeta_mensaje.dart';

/// Destino que aún no se construyó. Lo declara con texto e icono, sin mapas, reportes, avisos ni
/// cifras de ejemplo, y sin pedir permisos.
class DestinoPendiente extends StatelessWidget {
  const DestinoPendiente({
    super.key,
    required this.titulo,
    required this.icono,
    required this.explicacion,
  });

  final String titulo;
  final IconData icono;
  final String explicacion;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: Espaciado.s2),
              Semantics(
                header: true,
                child: Text(
                  titulo,
                  style: Theme.of(context).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: Espaciado.s2),
              TarjetaMensaje(
                icono: icono,
                child: Semantics(
                  container: true,
                  excludeSemantics: true,
                  label: 'Aún no disponible: $explicacion',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Aún no disponible',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: Espaciado.s1),
                      Text(explicacion, style: const TextStyle(height: 1.35)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
