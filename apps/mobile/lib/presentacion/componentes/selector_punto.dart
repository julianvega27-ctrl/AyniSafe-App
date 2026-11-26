import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../aplicacion/reporte_controlador.dart';
import '../../config/entorno.dart';
import '../../datos/incidentes_repositorio.dart';
import '../tema.dart';

/// Centro inicial del mapa: área metropolitana de Ayacucho (mismo valor que el origen).
const LatLng centroInicial = LatLng(-13.16, -74.22);

/// Mapa del formulario (`FlutterMap` de `report.dart` del origen). Tocar el mapa marca un punto
/// candidato que se confirma con un botón; no requiere permiso de ubicación. Si las teselas del mapa
/// base fallan, dibuja los límites distritales del catálogo para poder elegir igual. La atribución
/// del mapa base es visible. Un distrito elegido nunca reemplaza el punto: el backend lo calcula.
class SelectorPunto extends StatefulWidget {
  const SelectorPunto({
    super.key,
    required this.punto,
    required this.candidato,
    required this.alMarcar,
    required this.cargarContornos,
    this.mostrarTeselas = true,
  });

  final PuntoReporte? punto;
  final ({double latitud, double longitud})? candidato;
  final void Function(double latitud, double longitud) alMarcar;

  /// Límites distritales para el respaldo sin mapa base (se cargan solo si hacen falta).
  final Future<List<ContornoDistrito>> Function() cargarContornos;

  /// Falso en pruebas o cuando no se debe consultar el proveedor de teselas.
  final bool mostrarTeselas;

  @override
  State<SelectorPunto> createState() => _SelectorPuntoState();
}

class _SelectorPuntoState extends State<SelectorPunto> {
  final MapController _mapa = MapController();
  bool _teselasFallidas = false;
  List<ContornoDistrito>? _contornos;
  bool _cargandoContornos = false;

  bool get _sinMapaBase => !widget.mostrarTeselas || _teselasFallidas;

  @override
  void initState() {
    super.initState();
    if (_sinMapaBase) _cargarContornos();
  }

  Future<void> _cargarContornos() async {
    if (_cargandoContornos || _contornos != null) return;
    _cargandoContornos = true;
    final c = await widget.cargarContornos();
    if (!mounted) return;
    setState(() {
      _contornos = c;
      _cargandoContornos = false;
    });
  }

  void _alFallarTesela() {
    if (_teselasFallidas) return;
    // El aviso se aplica tras el cuadro actual: el error llega durante la construcción del mapa.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _teselasFallidas = true);
      _cargarContornos();
    });
  }

  @override
  Widget build(BuildContext context) {
    final punto = widget.punto;
    final candidato = widget.candidato;
    final contornos = _contornos ?? const <ContornoDistrito>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_sinMapaBase)
          Padding(
            padding: const EdgeInsets.only(bottom: Espaciado.s1),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ExcludeSemantics(
                  child: Icon(Icons.layers_clear_outlined, color: Colores.info),
                ),
                const SizedBox(width: Espaciado.s1),
                Expanded(
                  child: Text(
                    _cargandoContornos
                        ? 'El mapa base no está disponible. Cargando los límites de los distritos…'
                        : contornos.isEmpty
                        ? 'El mapa base no está disponible y los límites de los distritos tampoco. Usa tu ubicación o inténtalo más tarde; lo que escribiste se conserva.'
                        : 'El mapa base no está disponible: se muestran solo los límites de los distritos para que elijas el punto.',
                  ),
                ),
              ],
            ),
          ),
        Semantics(
          label: 'Mapa para elegir el punto del incidente. Toca el lugar y luego confirma el punto.',
          child: SizedBox(
            height: 280,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: ColoredBox(
                color: Colores.fondo,
                child: FlutterMap(
                  mapController: _mapa,
                  options: MapOptions(
                    initialCenter: punto != null
                        ? LatLng(punto.latitud, punto.longitud)
                        : centroInicial,
                    initialZoom: 13,
                    onTap: (_, lugar) =>
                        widget.alMarcar(lugar.latitude, lugar.longitude),
                  ),
                  children: [
                    if (!_sinMapaBase)
                      TileLayer(
                        urlTemplate: urlTeselas,
                        userAgentPackageName: 'pe.edu.unsch.ayni_safe',
                        errorTileCallback: (_, _, _) => _alFallarTesela(),
                      ),
                    if (_sinMapaBase && contornos.isNotEmpty)
                      PolygonLayer(
                        polygons: [
                          for (final d in contornos)
                            for (final anillo in d.anillos)
                              Polygon(
                                points: [
                                  for (final (lat, lon) in anillo)
                                    LatLng(lat, lon),
                                ],
                                borderColor: Colores.principal,
                                borderStrokeWidth: 2,
                                color: Colores.principal.withValues(alpha: .06),
                                label: d.nombre,
                              ),
                        ],
                      ),
                    MarkerLayer(
                      markers: [
                        if (punto != null)
                          Marker(
                            point: LatLng(punto.latitud, punto.longitud),
                            width: 42,
                            height: 42,
                            child: const Icon(
                              Icons.location_on,
                              color: Colores.error,
                              size: 42,
                            ),
                          ),
                        if (candidato != null)
                          Marker(
                            point: LatLng(
                              candidato.latitud,
                              candidato.longitud,
                            ),
                            width: 42,
                            height: 42,
                            child: const Icon(
                              Icons.add_location_alt,
                              color: Colores.secundario,
                              size: 42,
                            ),
                          ),
                      ],
                    ),
                    if (!_sinMapaBase)
                      const RichAttributionWidget(
                        alignment: AttributionAlignment.bottomLeft,
                        attributions: [
                          TextSourceAttribution(atribucionTeselas),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (!_sinMapaBase)
          // Atribución siempre legible (además del botón del mapa).
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Mapa base: $atribucionTeselas',
              style: const TextStyle(
                fontSize: 12,
                color: Colores.textoSecundario,
              ),
            ),
          ),
      ],
    );
  }
}
