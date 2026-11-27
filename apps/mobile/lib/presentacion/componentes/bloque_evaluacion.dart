import 'package:flutter/material.dart';

import '../../datos/evaluacion.dart';
import '../tema.dart';
import 'pregunta_seleccion.dart';

final List<(Respuesta, String)> opcionesRespuesta = [
  for (final r in Respuesta.values) (r, r.texto),
];
final List<(SignosVida, String)> _opcionesSignos = [
  for (final s in SignosVida.values) (s, s.texto),
];

/// Bloque «Evaluación rápida para SAMU» (composición de `triageBlock` del origen): tarjeta con
/// título, nota de respuesta opcional, cantidad de heridos sin teclado y observaciones de una sola
/// persona principal. Se usa en el formulario y en la aclaración desde Mis reportes.
class BloqueEvaluacion extends StatelessWidget {
  const BloqueEvaluacion({
    super.key,
    required this.respuestas,
    required this.mostrarCantidad,
    required this.habilitado,
    required this.alCambiarCantidad,
    required this.alCambiarSignosVida,
    required this.alCambiarConsciente,
    required this.alCambiarSangrado,
  });

  final RespuestasEvaluacion respuestas;
  final bool mostrarCantidad;
  final bool habilitado;
  final ValueChanged<CantidadHeridos?> alCambiarCantidad;
  final ValueChanged<SignosVida?> alCambiarSignosVida;
  final ValueChanged<Respuesta?> alCambiarConsciente;
  final ValueChanged<Respuesta?> alCambiarSangrado;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    return Card(
      key: const Key('evaluacionSamu'),
      // Sin contenedor semántico: cada pregunta es un nodo propio y solo el título es encabezado.
      semanticContainer: false,
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                'Evaluación rápida para SAMU',
                style: tema.titleMedium,
              ),
            ),
            const Text(
              'Opcional. Responde lo que sepas: puedes enviar con información pendiente.',
            ),
            if (mostrarCantidad) ...[
              const SizedBox(height: Espaciado.s2),
              SelectorCantidad(
                valor: respuestas.cantidad,
                habilitado: habilitado,
                alCambiar: alCambiarCantidad,
              ),
            ],
            const SizedBox(height: Espaciado.s2),
            Text(
              'Sobre una sola persona, la más afectada. Si hay varias, no hace falta describirlas a todas.',
              style: tema.bodyMedium?.copyWith(color: Colores.textoSecundario),
            ),
            const SizedBox(height: Espaciado.s2),
            PreguntaSeleccion<SignosVida>(
              key: const Key('evaluacionSignosVida'),
              titulo: '¿Se observan signos de vida?',
              opciones: _opcionesSignos,
              valor: respuestas.signosVida,
              habilitada: habilitado,
              alResponder: alCambiarSignosVida,
            ),
            const SizedBox(height: Espaciado.s2),
            PreguntaSeleccion<Respuesta>(
              key: const Key('evaluacionConsciente'),
              titulo: '¿Está consciente?',
              opciones: opcionesRespuesta,
              valor: respuestas.consciente,
              habilitada: habilitado,
              alResponder: alCambiarConsciente,
            ),
            const SizedBox(height: Espaciado.s2),
            PreguntaSeleccion<Respuesta>(
              key: const Key('evaluacionSangrado'),
              titulo: '¿Hay sangrado visible?',
              opciones: opcionesRespuesta,
              valor: respuestas.sangrado,
              habilitada: habilitado,
              alResponder: alCambiarSangrado,
            ),
          ],
        ),
      ),
    );
  }
}

/// Cantidad de heridos con accesos rápidos 1–5, «Otra cantidad» con − y + (6 a 999) y «No sé»,
/// sin preselección ni teclado (RF44). «5» no significa «5 o más».
class SelectorCantidad extends StatelessWidget {
  const SelectorCantidad({
    super.key,
    required this.valor,
    required this.habilitado,
    required this.alCambiar,
  });

  final CantidadHeridos? valor;
  final bool habilitado;
  final ValueChanged<CantidadHeridos?> alCambiar;

  @override
  Widget build(BuildContext context) {
    final v = valor;
    final otra = v != null && !v.esNoSe && v.valor! >= cantidadMinimaOtra;
    final n = otra ? v.valor! : cantidadMinimaOtra;
    void elegir(CantidadHeridos? nueva) =>
        alCambiar(nueva == valor ? null : nueva);
    Widget chip(
      String texto,
      bool marcado,
      VoidCallback alPulsar, {
      Key? key,
    }) => ChoiceChip(
      key: key,
      label: Text(texto),
      selected: marcado,
      onSelected: habilitado ? (_) => alPulsar() : null,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          '¿Cuántas personas heridas hay?',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        Wrap(
          spacing: Espaciado.s1,
          runSpacing: Espaciado.s1,
          children: [
            for (var i = 1; i <= 5; i++)
              chip(
                '$i',
                v?.valor == i,
                () => elegir(CantidadHeridos.conocida(i)),
                key: Key('cantidad-$i'),
              ),
            chip(
              'Otra cantidad',
              otra,
              () => elegir(
                otra ? v : const CantidadHeridos.conocida(cantidadMinimaOtra),
              ),
              key: const Key('cantidad-otra'),
            ),
            chip(
              'No sé',
              v?.esNoSe ?? false,
              () => elegir(const CantidadHeridos.noSe()),
              key: const Key('cantidad-no-se'),
            ),
          ],
        ),
        if (otra) ...[
          const SizedBox(height: Espaciado.s1),
          Row(
            children: [
              IconButton.outlined(
                key: const Key('cantidad-restar'),
                tooltip: 'Restar una persona',
                onPressed: habilitado && n > cantidadMinimaOtra
                    ? () => alCambiar(CantidadHeridos.conocida(n - 1))
                    : null,
                icon: const Icon(Icons.remove),
              ),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  label: '$n personas heridas',
                  excludeSemantics: true,
                  child: Text(
                    '$n',
                    key: const Key('cantidad-valor'),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
              ),
              IconButton.outlined(
                key: const Key('cantidad-sumar'),
                tooltip: 'Sumar una persona',
                onPressed: habilitado && n < cantidadMaxima
                    ? () => alCambiar(CantidadHeridos.conocida(n + 1))
                    : null,
                icon: const Icon(Icons.add),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
