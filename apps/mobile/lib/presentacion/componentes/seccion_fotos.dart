import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/reporte_controlador.dart';
import '../../datos/evidencias.dart';
import '../../datos/selector_fotos.dart';
import '../tema.dart';
import 'mensaje_accesible.dart';

/// «Fotos (opcional)» del formulario (P5.2). Composición del origen (`report.dart`): un botón
/// «Adjuntar foto opcional» que abre una hoja con galería y cámara, y el texto de ayuda. Admite hasta
/// tres miniaturas, cada una con «Quitar».
class SeccionFotos extends StatelessWidget {
  const SeccionFotos({super.key, required this.controlador, required this.habilitada});

  final ReporteControlador controlador;
  final bool habilitada;

  Future<void> _elegirOrigen(BuildContext context) async {
    final origen = await showModalBottomSheet<OrigenFoto>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Elegir de galería'),
              onTap: () => Navigator.pop(context, OrigenFoto.galeria),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Tomar foto'),
              onTap: () => Navigator.pop(context, OrigenFoto.camara),
            ),
          ],
        ),
      ),
    );
    if (origen != null) await controlador.agregarFoto(origen);
  }

  @override
  Widget build(BuildContext context) {
    final c = controlador;
    final tema = Theme.of(context).textTheme;
    return Column(
      key: const Key('seccionFotos'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: Text('Fotos (opcional)', style: tema.titleSmall)),
        const SizedBox(height: Espaciado.s1),
        if (c.fotos.isNotEmpty) ...[
          Wrap(
            spacing: Espaciado.s1,
            runSpacing: Espaciado.s1,
            children: [
              for (var i = 0; i < c.fotos.length; i++)
                _Miniatura(
                  foto: c.fotos[i],
                  indice: i,
                  total: c.fotos.length,
                  alQuitar: habilitada ? () => c.quitarFoto(i) : null,
                ),
            ],
          ),
          const SizedBox(height: Espaciado.s1),
        ],
        OutlinedButton.icon(
          key: const Key('adjuntarFoto'),
          onPressed: habilitada && c.puedeAgregarFoto ? () => _elegirOrigen(context) : null,
          icon: const Icon(Icons.add_a_photo_outlined),
          label: Text(
            c.fotos.length >= maxFotos
                ? 'Ya elegiste 3 fotos'
                : c.fotos.isEmpty
                ? 'Adjuntar foto opcional'
                : 'Adjuntar otra foto (${c.fotos.length} de $maxFotos)',
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Hasta 3 fotos JPEG, PNG o WebP de 5 MB. Se envían después de registrar el reporte, sin su ubicación ni otros datos ocultos. Puedes enviar sin fotos.',
        ),
        if (c.avisoFotos != null) ...[
          const SizedBox(height: Espaciado.s1),
          MensajeAccesible(aviso: Aviso(TipoAviso.error, c.avisoFotos!)),
        ],
      ],
    );
  }
}

class _Miniatura extends StatelessWidget {
  const _Miniatura({required this.foto, required this.indice, required this.total, this.alQuitar});

  final FotoReporte foto;
  final int indice;
  final int total;
  final VoidCallback? alQuitar;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Foto ${indice + 1} de $total',
      child: SizedBox(
        width: 96,
        child: Column(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(Radios.control),
              child: ExcludeSemantics(
                child: Image.memory(foto.bytes, width: 96, height: 96, fit: BoxFit.cover, gaplessPlayback: true),
              ),
            ),
            if (alQuitar != null)
              TextButton.icon(
                style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: alQuitar,
                icon: const Icon(Icons.close, size: 18),
                label: Text('Quitar', semanticsLabel: 'Quitar foto ${indice + 1}'),
              ),
          ],
        ),
      ),
    );
  }
}

/// Estado de cada foto tras el comprobante, con reintentar o continuar sin ella.
class EstadoFotosVista extends StatelessWidget {
  const EstadoFotosVista({super.key, required this.controlador});
  final ReporteControlador controlador;

  @override
  Widget build(BuildContext context) {
    final c = controlador;
    if (c.fotos.isEmpty) return const SizedBox.shrink();
    final tema = Theme.of(context).textTheme;
    final hayFallidas = c.fotos.any((f) => f.estado == EstadoFoto.fallida);
    return Card(
      key: const Key('estadoFotos'),
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text('Fotos', style: tema.titleMedium)),
            const SizedBox(height: Espaciado.s1),
            for (var i = 0; i < c.fotos.length; i++)
              _FilaEstado(
                foto: c.fotos[i],
                indice: i,
                total: c.fotos.length,
                alContinuarSin: c.fotos[i].estado == EstadoFoto.fallida && !c.subiendoFotos
                    ? () => c.descartarFoto(i)
                    : null,
              ),
            if (hayFallidas) ...[
              const SizedBox(height: Espaciado.s1),
              FilledButton.tonalIcon(
                onPressed: c.subiendoFotos ? null : c.reintentarFotos,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar fotos'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FilaEstado extends StatelessWidget {
  const _FilaEstado({required this.foto, required this.indice, required this.total, this.alContinuarSin});
  final FotoReporte foto;
  final int indice;
  final int total;
  final VoidCallback? alContinuarSin;

  @override
  Widget build(BuildContext context) {
    final (icono, color, texto) = switch (foto.estado) {
      EstadoFoto.lista => (Icons.schedule, Colores.textoSecundario, 'Pendiente de enviar'),
      EstadoFoto.subiendo => (Icons.cloud_upload_outlined, Colores.info, 'Enviando…'),
      EstadoFoto.adjuntada => (Icons.check_circle_outline, Colores.exito, 'Adjuntada'),
      EstadoFoto.fallida => (Icons.error_outline, Colores.error, 'No se adjuntó'),
      EstadoFoto.rechazada => (Icons.block, Colores.error, 'Rechazada'),
      EstadoFoto.noAdmitida => (Icons.timer_off_outlined, Colores.error, 'Fuera de plazo'),
    };
    return Semantics(
      container: true,
      liveRegion: true,
      label: 'Foto ${indice + 1} de $total: $texto${foto.mensaje == null ? '' : '. ${foto.mensaje}'}',
      child: ExcludeSemantics(
        excluding: true,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(Radios.control),
                child: Image.memory(foto.bytes, width: 56, height: 56, fit: BoxFit.cover),
              ),
              const SizedBox(width: Espaciado.s1),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Icon(icono, color: color, size: 20),
                      const SizedBox(width: 4),
                      Flexible(child: Text('Foto ${indice + 1}: $texto', style: TextStyle(color: color, fontWeight: FontWeight.w600))),
                    ]),
                    if (foto.mensaje != null) Text(foto.mensaje!),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ).withAction(alContinuarSin, indice);
  }
}

extension on Widget {
  /// Añade «Continuar sin esta foto» debajo de la fila cuando corresponde, fuera de la región excluida.
  Widget withAction(VoidCallback? accion, int indice) => accion == null
      ? this
      : Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            this,
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: accion,
                child: Text('Continuar sin esta foto', semanticsLabel: 'Continuar sin la foto ${indice + 1}'),
              ),
            ),
          ],
        );
}
