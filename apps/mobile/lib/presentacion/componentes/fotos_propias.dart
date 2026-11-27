import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../datos/incidentes_repositorio.dart';
import '../tema.dart';

/// Fotos propias en el detalle de Mis reportes (P5.2). Se piden con la sesión del autor y viven
/// solo en memoria mientras la pantalla está abierta; no se guardan en el dispositivo.
class FotosPropias extends StatefulWidget {
  const FotosPropias({
    super.key,
    required this.evidencias,
    required this.cargar,
  });

  final List<EvidenciaVista> evidencias;

  /// Obtiene los bytes de una foto (con la sesión del autor).
  final Future<Consulta<Uint8List>> Function(String evidenciaId) cargar;

  @override
  State<FotosPropias> createState() => _FotosPropiasState();
}

class _FotosPropiasState extends State<FotosPropias> {
  final Map<String, Consulta<Uint8List>> _fotos = {};

  @override
  void initState() {
    super.initState();
    for (final e in widget.evidencias) {
      widget.cargar(e.id).then((r) {
        if (mounted) setState(() => _fotos[e.id] = r);
      });
    }
  }

  void _ampliar(int indice, Uint8List bytes) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              label: 'Foto ${indice + 1} que enviaste, ampliada',
              image: true,
              child: InteractiveViewer(child: Image.memory(bytes, fit: BoxFit.contain)),
            ),
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: () => Navigator.pop(context),
              child: const Text('Cerrar'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.evidencias.isEmpty) return const SizedBox.shrink();
    final tema = Theme.of(context).textTheme;
    final total = widget.evidencias.length;
    return Card(
      key: const Key('fotosPropias'),
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text('Tus fotos', style: tema.titleMedium)),
            const SizedBox(height: Espaciado.s1),
            Wrap(
              spacing: Espaciado.s1,
              runSpacing: Espaciado.s1,
              children: [
                for (var i = 0; i < total; i++)
                  _foto(i, total, _fotos[widget.evidencias[i].id]),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _foto(int i, int total, Consulta<Uint8List>? r) {
    const lado = 96.0;
    return switch (r) {
      null => Semantics(
        label: 'Cargando foto ${i + 1} de $total',
        child: const SizedBox(
          width: lado,
          height: lado,
          child: Center(child: CircularProgressIndicator()),
        ),
      ),
      ConsultaObtenida(valor: final bytes) => Semantics(
        button: true,
        image: true,
        label: 'Foto ${i + 1} de $total que enviaste. Toca para ampliar',
        child: InkWell(
          onTap: () => _ampliar(i, bytes),
          borderRadius: BorderRadius.circular(Radios.control),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(Radios.control),
            child: ExcludeSemantics(
              child: Image.memory(bytes, width: lado, height: lado, fit: BoxFit.cover),
            ),
          ),
        ),
      ),
      _ => Semantics(
        container: true,
        label: 'Foto ${i + 1} de $total no disponible',
        child: ExcludeSemantics(
          child: Container(
            width: lado,
            height: lado,
            decoration: BoxDecoration(
              color: Colores.fondoError,
              borderRadius: BorderRadius.circular(Radios.control),
            ),
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.broken_image_outlined, color: Colores.error),
                Text('No disponible', textAlign: TextAlign.center, style: TextStyle(color: Colores.error, fontSize: 12)),
              ],
            ),
          ),
        ),
      ),
    };
  }
}
