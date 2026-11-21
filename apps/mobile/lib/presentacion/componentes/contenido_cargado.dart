import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/contenido_repositorio.dart';
import '../servicios.dart';
import '../tema.dart';
import 'mensaje_accesible.dart';

/// Carga el contenido público y muestra carga, error con «Reintentar» o el contenido. Si no se
/// pudo actualizar pero hay una versión recibida en esta ejecución, la muestra con un aviso.
/// Nunca muestra contenido supuesto.
class ContenidoCargado extends StatefulWidget {
  const ContenidoCargado({super.key, required this.constructor});

  final Widget Function(BuildContext contexto, ContenidoPublico contenido)
  constructor;

  @override
  State<ContenidoCargado> createState() => _ContenidoCargadoState();
}

class _ContenidoCargadoState extends State<ContenidoCargado> {
  Future<ResultadoContenido>? _futuro;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _futuro ??= Servicios.of(context).contenido.obtener();
  }

  void _reintentar() {
    final nuevo = Servicios.of(context).contenido.obtener();
    setState(() {
      _futuro = nuevo;
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ResultadoContenido>(
      future: _futuro,
      builder: (context, instantanea) {
        final resultado = instantanea.data;
        if (resultado == null) {
          if (instantanea.hasError) {
            return _error(textoServicioNoDisponible);
          }
          return Semantics(
            label: 'Cargando información',
            child: const Padding(
              padding: EdgeInsets.all(Espaciado.s3),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }
        return switch (resultado) {
          ContenidoSinConexion() => _error(
            'No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.',
          ),
          ContenidoNoDisponible() => _error(textoServicioNoDisponible),
          ContenidoDisponible(:final contenido, :final desactualizado) =>
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (desactualizado) ...[
                  MensajeAccesible(
                    aviso: const Aviso(
                      TipoAviso.info,
                      'No pudimos actualizar esta información. Mostramos la última versión que recibimos.',
                    ),
                    etiquetaAccion: 'Reintentar',
                    alAccionar: _reintentar,
                  ),
                  const SizedBox(height: Espaciado.s2),
                ],
                widget.constructor(context, contenido),
              ],
            ),
        };
      },
    );
  }

  Widget _error(String texto) => MensajeAccesible(
    aviso: Aviso(TipoAviso.error, texto),
    etiquetaAccion: 'Reintentar',
    alAccionar: _reintentar,
  );
}
