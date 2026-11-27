import 'package:flutter/material.dart';

/// Pregunta de selección única sin opción preseleccionada (RF44). Volver a pulsar la opción marcada
/// la desmarca (sin respuesta). Extraída del formulario de reporte (P4.1) para reutilizarla en la
/// evaluación rápida y en su aclaración (P5.1).
class PreguntaSeleccion<T extends Object> extends StatelessWidget {
  const PreguntaSeleccion({
    super.key,
    required this.titulo,
    required this.opciones,
    required this.valor,
    required this.habilitada,
    required this.alResponder,
  });

  final String titulo;

  /// Valor y texto visible de cada opción, en orden.
  final List<(T, String)> opciones;
  final T? valor;
  final bool habilitada;
  final ValueChanged<T?> alResponder;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 4),
      SegmentedButton<T>(
        emptySelectionAllowed: true,
        segments: [
          for (final (v, texto) in opciones)
            ButtonSegment(value: v, label: Text(texto)),
        ],
        selected: {?valor},
        onSelectionChanged: habilitada
            ? (s) => alResponder(s.isEmpty ? null : s.first)
            : null,
      ),
    ],
  );
}
