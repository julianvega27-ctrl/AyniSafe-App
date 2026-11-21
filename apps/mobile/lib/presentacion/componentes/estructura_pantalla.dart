import 'package:flutter/material.dart';

import '../tema.dart';

/// Estructura común: contenido desplazable (para texto ampliado al 200 %), ancho máximo
/// cómodo y margen lateral de 16.
///
/// Usa un desplazamiento simple con todo el contenido construido (no una lista perezosa):
/// así ningún campo ni botón desaparece del árbol al quedar fuera de pantalla, los campos no
/// pierden el foco al desplazarse y los lectores de pantalla pueden recorrerlo completo.
class EstructuraPantalla extends StatelessWidget {
  const EstructuraPantalla({
    super.key,
    required this.titulo,
    required this.hijos,
    this.conBarra = false,
  });

  final String titulo;
  final List<Widget> hijos;

  /// Muestra una barra superior con el título y el botón de retorno (pantallas secundarias).
  final bool conBarra;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: conBarra ? AppBar(title: Text(titulo)) : null,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Espaciado.s2),
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!conBarra) ...[
                    const SizedBox(height: Espaciado.s2),
                    Semantics(
                      header: true,
                      child: Text(
                        titulo,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const SizedBox(height: Espaciado.s2),
                  ],
                  ...hijos,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
