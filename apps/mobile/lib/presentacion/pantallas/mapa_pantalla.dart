import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../aplicacion/aviso.dart';
import '../../config/entorno.dart';
import '../../datos/incidentes_repositorio.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/selector_punto.dart' show centroInicial;
import '../tema.dart';

/// Mapa público de la app (P7, spec `movil/mapa-publico`; `map_view.dart` del origen). Muestra las
/// publicaciones vigentes como zonas aproximadas de 300 m sobre las teselas configurables, con los
/// límites distritales, filtros y una lista accesible. No solicita ubicación ni notificaciones. Si
/// fallan las teselas siguen los límites y la lista; si falla la API, un error con reintento.
class MapaPantalla extends StatefulWidget {
  const MapaPantalla({
    super.key,
    required this.incidentes,
    this.mostrarTeselas = true,
  });

  final IncidentesRepositorio incidentes;

  /// Falso en pruebas: no consulta el proveedor de teselas.
  final bool mostrarTeselas;

  @override
  State<MapaPantalla> createState() => _MapaPantallaState();
}

class _MapaPantallaState extends State<MapaPantalla> {
  List<DistritoCatalogo> _distritos = const [];
  List<CategoriaIncidente> _categorias = const [];
  List<ContornoDistrito> _contornos = const [];
  bool _contornosFallidos = false;
  bool _teselasFallidas = false;

  String? _distritoId;
  String? _categoriaId;
  PeriodoMapa _periodo = PeriodoMapa.semana;

  Consulta<MapaPublico>? _mapa;
  int _generacion = 0;

  @override
  void initState() {
    super.initState();
    _cargarCatalogos();
    _consultar();
  }

  Future<void> _cargarCatalogos() async {
    final repo = widget.incidentes;
    final resultados = await Future.wait([
      repo.distritos(),
      repo.categorias(),
      repo.contornos(),
    ]);
    if (!mounted) return;
    setState(() {
      if (resultados[0] case ConsultaObtenida<List<DistritoCatalogo>>(
        :final valor,
      )) {
        _distritos = valor;
      }
      if (resultados[1] case ConsultaObtenida<List<CategoriaIncidente>>(
        :final valor,
      )) {
        _categorias = valor;
      }
      final contornos = resultados[2] as List<ContornoDistrito>;
      _contornos = contornos;
      _contornosFallidos = contornos.isEmpty;
    });
  }

  Future<void> _consultar() async {
    final generacion = ++_generacion;
    setState(() => _mapa = null);
    final r = await widget.incidentes.mapaPublico(
      distritoId: _distritoId,
      categoriaId: _categoriaId,
      periodo: _periodo,
    );
    if (!mounted || generacion != _generacion) return;
    setState(() => _mapa = r);
  }

  void _alFallarTesela() {
    if (_teselasFallidas) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _teselasFallidas = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final mapa = _mapa;
    // Columna desplazable: la lista vigente es corta (7 días, tope de 500 en la API) y se lee completa
    // con lector de pantalla.
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text('Mapa de incidentes', style: tema.headlineSmall),
          ),
          const SizedBox(height: Espaciado.s1),
          Text(
            'Incidentes verificados que las instituciones decidieron publicar. Las ubicaciones son aproximadas: '
            'se muestran zonas de unos 300 m, nunca el lugar exacto.',
            style: tema.bodyLarge,
          ),
          const SizedBox(height: Espaciado.s2),
          _filtros(),
          const SizedBox(height: Espaciado.s2),
          if (!widget.mostrarTeselas || _teselasFallidas)
            _aviso(
              Icons.layers_clear_outlined,
              _contornosFallidos
                  ? 'El mapa base no está disponible. Puedes consultar la lista de incidentes debajo.'
                  : 'El mapa base no está disponible: se muestran los límites de los distritos y las zonas.',
            ),
          _lienzo(mapa is ConsultaObtenida<MapaPublico> ? mapa.valor : null),
          if (widget.mostrarTeselas && !_teselasFallidas)
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
          const SizedBox(height: Espaciado.s2),
          ..._resultado(tema, mapa),
        ],
      ),
    );
  }

  Widget _aviso(IconData icono, String texto) => Padding(
    padding: const EdgeInsets.only(bottom: Espaciado.s1),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExcludeSemantics(child: Icon(icono, color: Colores.info)),
        const SizedBox(width: Espaciado.s1),
        Expanded(child: Text(texto)),
      ],
    ),
  );

  Widget _filtros() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String?>(
          key: const Key('mapaDistrito'),
          initialValue: _distritoId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Distrito'),
          items: [
            const DropdownMenuItem(
              value: null,
              child: Text('Todos los distritos'),
            ),
            for (final d in _distritos)
              DropdownMenuItem(value: d.id, child: Text(d.nombre)),
          ],
          onChanged: (v) {
            _distritoId = v;
            _consultar();
          },
        ),
        const SizedBox(height: Espaciado.s1),
        DropdownButtonFormField<String?>(
          key: const Key('mapaCategoria'),
          initialValue: _categoriaId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Categoría'),
          items: [
            const DropdownMenuItem(
              value: null,
              child: Text('Todas las categorías'),
            ),
            for (final c in _categorias)
              DropdownMenuItem(value: c.id, child: Text(c.nombre)),
          ],
          onChanged: (v) {
            _categoriaId = v;
            _consultar();
          },
        ),
        const SizedBox(height: Espaciado.s1),
        Text('Período', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        Wrap(
          spacing: Espaciado.s1,
          runSpacing: Espaciado.s1,
          children: [
            for (final p in PeriodoMapa.values)
              ChoiceChip(
                label: Text(p.texto),
                selected: _periodo == p,
                onSelected: (_) {
                  if (_periodo == p) return;
                  setState(() => _periodo = p);
                  _consultar();
                },
              ),
          ],
        ),
      ],
    );
  }

  Widget _lienzo(MapaPublico? datos) {
    final sinMapaBase = !widget.mostrarTeselas || _teselasFallidas;
    final distrito = _distritoId;
    return ExcludeSemantics(
      // El mapa es complementario: la misma información está en la lista accesible.
      child: SizedBox(
        height: 300,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: ColoredBox(
            color: Colores.fondo,
            child: FlutterMap(
              options: const MapOptions(
                initialCenter: centroInicial,
                initialZoom: 12,
              ),
              children: [
                if (!sinMapaBase)
                  TileLayer(
                    urlTemplate: urlTeselas,
                    userAgentPackageName: 'pe.edu.unsch.ayni_safe',
                    errorTileCallback: (_, _, _) => _alFallarTesela(),
                  ),
                if (_contornos.isNotEmpty)
                  PolygonLayer(
                    polygons: [
                      for (final d in _contornos)
                        for (final anillo in d.anillos)
                          Polygon(
                            points: [
                              for (final (lat, lon) in anillo) LatLng(lat, lon),
                            ],
                            borderColor: Colores.principal,
                            borderStrokeWidth: d.id == distrito ? 3 : 1.5,
                            color: Colores.principal.withValues(
                              alpha: d.id == distrito ? .10 : .03,
                            ),
                          ),
                    ],
                  ),
                if (datos != null)
                  CircleLayer(
                    circles: [
                      for (final p in datos.puntos)
                        CircleMarker(
                          point: LatLng(p.latitud, p.longitud),
                          radius: datos.radioZonaM,
                          useRadiusInMeter: true,
                          color: Colores.secundario.withValues(alpha: .22),
                          borderColor: Colores.secundario,
                          borderStrokeWidth: 2,
                        ),
                    ],
                  ),
                if (!sinMapaBase)
                  const RichAttributionWidget(
                    alignment: AttributionAlignment.bottomLeft,
                    attributions: [TextSourceAttribution(atribucionTeselas)],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _resultado(TextTheme tema, Consulta<MapaPublico>? mapa) {
    switch (mapa) {
      case null:
        return const [
          LinearProgressIndicator(
            semanticsLabel: 'Cargando incidentes publicados',
          ),
        ];
      case ConsultaObtenida(:final valor):
        return [
          Semantics(
            header: true,
            child: Text(
              valor.puntos.isEmpty
                  ? 'Sin incidentes publicados'
                  : valor.puntos.length == 1
                  ? '1 incidente publicado'
                  : '${valor.puntos.length} incidentes publicados',
              style: tema.titleMedium,
            ),
          ),
          const SizedBox(height: Espaciado.s1),
          if (valor.puntos.isEmpty)
            Text(
              'No hay incidentes publicados para estos filtros. Solo se muestran hechos verificados y vigentes '
              '(hasta 7 días desde que ocurrieron).',
              style: tema.bodyLarge,
            ),
          for (final p in valor.puntos)
            Card(
              child: MergeSemantics(
                child: ListTile(
                  leading: const ExcludeSemantics(
                    child: Icon(
                      Icons.place_outlined,
                      color: Colores.secundario,
                    ),
                  ),
                  title: Text(p.categoria),
                  subtitle: Text(
                    '${p.distrito} · ${p.estadoTexto} · ${p.antiguedadTexto} · zona aproximada',
                  ),
                ),
              ),
            ),
          if (valor.reservados.isNotEmpty) ...[
            const SizedBox(height: Espaciado.s2),
            Semantics(
              header: true,
              child: Text('Casos reservados', style: tema.titleSmall),
            ),
            const SizedBox(height: 4),
            Text(
              'Por privacidad, algunos casos no se muestran en el mapa. Se informa solo su total por distrito y mes.',
              style: tema.bodyMedium,
            ),
            for (final r in valor.reservados)
              Text(
                '${r.distrito}, ${r.mes}: ${r.total} casos',
                style: tema.bodyLarge,
              ),
          ],
        ];
      case ConsultaSinConexion():
        return [
          MensajeAccesible(
            aviso: const Aviso(
              TipoAviso.error,
              'Sin conexión. No se pudieron cargar los incidentes publicados.',
            ),
            etiquetaAccion: 'Reintentar',
            alAccionar: _consultar,
          ),
        ];
      default:
        return [
          MensajeAccesible(
            aviso: const Aviso(
              TipoAviso.error,
              'El mapa no está disponible en este momento.',
            ),
            etiquetaAccion: 'Reintentar',
            alAccionar: _consultar,
          ),
        ];
    }
  }
}
