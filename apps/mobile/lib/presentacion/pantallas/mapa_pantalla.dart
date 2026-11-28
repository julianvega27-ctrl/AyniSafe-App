import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../aplicacion/aviso.dart';
import '../../config/entorno.dart';
import '../../datos/incidentes_repositorio.dart';
import '../../datos/ubicacion.dart';
import '../componentes/icono_categoria.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/selector_punto.dart' show centroInicial;
import '../tema.dart';

/// Mapa público de la app (P7, spec `movil/mapa-publico`; `map_view.dart` del origen). Muestra las
/// publicaciones vigentes en su ubicación exacta (decisión del 27/11/2026) sobre las teselas
/// configurables, con los límites distritales, filtros y una lista accesible. Al abrir no pide
/// permisos; «Mi ubicación» pide el permiso al pulsarlo, muestra la posición y la distancia a cada
/// incidente calculada en el teléfono: la posición nunca se envía al servidor ni se guarda.
String distanciaTexto(double metros) {
  if (metros < 1000) return 'a ${(metros / 10).round() * 10} m';
  final km = (metros / 100).round() / 10;
  return 'a ${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}

class MapaPantalla extends StatefulWidget {
  const MapaPantalla({
    super.key,
    required this.incidentes,
    required this.ubicacion,
    this.mostrarTeselas = true,
  });

  final IncidentesRepositorio incidentes;

  /// Solo se usa al pulsar «Mi ubicación».
  final UbicacionPuerto ubicacion;

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

  final MapController _controlMapa = MapController();
  PuntoUbicado? _mia;
  bool _ubicando = false;
  String? _avisoUbicacion;
  static const Distance _distancia = Distance();

  @override
  void dispose() {
    _controlMapa.dispose();
    super.dispose();
  }

  /// Pide la posición solo al pulsar el botón. Se queda en memoria del teléfono.
  Future<void> _miUbicacion() async {
    if (_ubicando) return;
    setState(() {
      _ubicando = true;
      _avisoUbicacion = null;
    });
    final r = await widget.ubicacion.obtener();
    if (!mounted) return;
    setState(() {
      _ubicando = false;
      switch (r) {
        case UbicacionObtenida(:final punto):
          _mia = punto;
        case UbicacionDenegada(:final permanente):
          _avisoUbicacion = permanente
              ? 'El permiso de ubicación está bloqueado. Puedes activarlo en Ajustes; el mapa sigue sin distancias.'
              : 'Sin permiso de ubicación no se muestran distancias. El mapa y la lista siguen disponibles.';
        case UbicacionServicioApagado():
          _avisoUbicacion = 'La ubicación del teléfono está apagada. Actívala para ver las distancias.';
        case UbicacionNoDisponible():
          _avisoUbicacion =
              'No se pudo obtener tu ubicación. Inténtalo de nuevo.';
      }
    });
    final mia = _mia;
    if (mia != null) {
      try {
        _controlMapa.move(LatLng(mia.latitud, mia.longitud), 14);
      } on Object {
        // El mapa aún no está dibujado: la posición se ve igual en la lista.
      }
    }
  }

  /// Al tocar un marcador: si hay varios incidentes en el mismo punto se elige uno (como el origen) y
  /// se abre su detalle breve. Nunca la descripción ni datos de quien reportó (documento 11 §5).
  Future<void> _seleccionar(List<PuntoMapa> grupo) async {
    PuntoMapa? elegido = grupo.first;
    if (grupo.length > 1) {
      elegido = await showModalBottomSheet<PuntoMapa>(
        context: context,
        builder: (context) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.all(Espaciado.s2),
                child: Text(
                  '${grupo.length} incidentes en este lugar',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              for (final p in grupo)
                ListTile(
                  leading: Icon(
                    iconoCategoria(p.categoriaId),
                    color: Colores.principal,
                  ),
                  title: Text(p.categoria),
                  subtitle: Text('${p.estadoTexto} · ${p.antiguedadTexto}'),
                  onTap: () => Navigator.pop(context, p),
                ),
            ],
          ),
        ),
      );
    }
    if (!mounted || elegido == null) return;
    final p = elegido;
    final metros = _metrosA(p);
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => DetalleIncidenteMapa(punto: p, metros: metros),
    );
  }

  double? _metrosA(PuntoMapa p) {
    final mia = _mia;
    if (mia == null) return null;
    return _distancia.as(
      LengthUnit.Meter,
      LatLng(mia.latitud, mia.longitud),
      LatLng(p.latitud, p.longitud),
    );
  }

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
            'Incidentes reportados que una institución ya verificó, en el lugar informado. '
            'Pulsa «Mi ubicación» para ver qué tan cerca están; tu ubicación no se envía ni se guarda.',
            style: tema.bodyLarge,
          ),
          const SizedBox(height: Espaciado.s2),
          _filtros(),
          const SizedBox(height: Espaciado.s2),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              key: const Key('mapaMiUbicacion'),
              onPressed: _ubicando ? null : _miUbicacion,
              icon: _ubicando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location),
              label: Text(
                _mia == null ? 'Mi ubicación' : 'Actualizar mi ubicación',
              ),
            ),
          ),
          if (_avisoUbicacion != null)
            Padding(
              padding: const EdgeInsets.only(top: Espaciado.s1),
              child: _aviso(Icons.location_disabled_outlined, _avisoUbicacion!),
            ),
          const SizedBox(height: Espaciado.s2),
          if (!widget.mostrarTeselas || _teselasFallidas)
            _aviso(
              Icons.layers_clear_outlined,
              _contornosFallidos
                  ? 'El mapa base no está disponible. Puedes consultar la lista de incidentes debajo.'
                  : 'El mapa base no está disponible: se muestran los límites de los distritos y los incidentes.',
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
              mapController: _controlMapa,
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
                MarkerLayer(
                  markers: [
                    if (datos != null)
                      for (final grupo in _agrupados(datos.puntos))
                        Marker(
                          point: LatLng(
                            grupo.first.latitud,
                            grupo.first.longitud,
                          ),
                          width: 48,
                          height: 48,
                          child: _Marcador(
                            grupo: grupo,
                            alTocar: () => _seleccionar(grupo),
                          ),
                        ),
                    if (_mia case final mia?)
                      Marker(
                        point: LatLng(mia.latitud, mia.longitud),
                        width: 28,
                        height: 28,
                        child: const Icon(
                          Icons.my_location,
                          color: Colores.principal,
                          size: 28,
                        ),
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

  /// Incidentes en el mismo punto exacto: un solo marcador con su número (como el origen).
  List<List<PuntoMapa>> _agrupados(List<PuntoMapa> puntos) {
    final grupos = <String, List<PuntoMapa>>{};
    for (final p in puntos) {
      grupos.putIfAbsent('${p.latitud},${p.longitud}', () => []).add(p);
    }
    return grupos.values.toList();
  }

  /// Con posición, del más cercano al más lejano; sin ella, el orden de la API (más recientes).
  List<PuntoMapa> _ordenados(List<PuntoMapa> puntos) {
    if (_mia == null) return puntos;
    return [...puntos]..sort((a, b) => _metrosA(a)!.compareTo(_metrosA(b)!));
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
          if (_mia != null && valor.puntos.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: Espaciado.s1),
              child: Text(
                'Ordenados del más cercano al más lejano.',
                style: tema.bodyMedium,
              ),
            ),
          for (final p in _ordenados(valor.puntos))
            Card(
              child: MergeSemantics(
                child: ListTile(
                  onTap: () => _seleccionar([p]),
                  leading: ExcludeSemantics(
                    child: Icon(
                      iconoCategoria(p.categoriaId),
                      color: Colores.principal,
                    ),
                  ),
                  title: Text(p.categoria),
                  subtitle: Text(
                    [
                      p.distrito,
                      p.estadoTexto,
                      p.antiguedadTexto,
                      if (_metrosA(p) case final m?) distanciaTexto(m),
                    ].join(' · '),
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

/// Marcador del origen: círculo del color principal con el icono de la categoría o el número de
/// incidentes en el mismo punto. Es un botón con etiqueta para lectores de pantalla.
class _Marcador extends StatelessWidget {
  const _Marcador({required this.grupo, required this.alTocar});

  final List<PuntoMapa> grupo;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final primero = grupo.first;
    final etiqueta = grupo.length > 1
        ? '${grupo.length} incidentes en este lugar. Elegir uno'
        : '${primero.categoria}, ${primero.estadoTexto.toLowerCase()}. Ver detalle';
    return Semantics(
      button: true,
      label: etiqueta,
      excludeSemantics: true,
      child: Tooltip(
        message: etiqueta,
        child: Material(
          color: Colores.principal,
          shape: const CircleBorder(
            side: BorderSide(color: Colores.superficie, width: 2),
          ),
          elevation: 3,
          child: InkWell(
            key: Key('mapaMarcador-${primero.id}'),
            customBorder: const CircleBorder(),
            onTap: alTocar,
            child: Center(
              child: grupo.length > 1
                  ? Text(
                      '${grupo.length}',
                      style: const TextStyle(
                        color: Colores.superficie,
                        fontWeight: FontWeight.bold,
                      ),
                    )
                  : Icon(
                      iconoCategoria(primero.categoriaId),
                      color: Colores.superficie,
                      size: 24,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

String _fechaHora(DateTime d) {
  final l = d.toLocal();
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(l.day)}/${dos(l.month)}/${l.year} ${dos(l.hour)}:${dos(l.minute)}';
}

/// Detalle breve de un incidente publicado (hoja inferior, como `PublicIncidentSheet` del origen):
/// categoría, estado, distrito, fecha y antigüedad, y la distancia si se pidió «Mi ubicación». La
/// API pública no expone la descripción, las fotos ni datos de quien reportó.
class DetalleIncidenteMapa extends StatelessWidget {
  const DetalleIncidenteMapa({super.key, required this.punto, this.metros});

  final PuntoMapa punto;
  final double? metros;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    Widget fila(IconData icono, String texto) => Padding(
      padding: const EdgeInsets.only(top: Espaciado.s1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Icon(icono, size: 20, color: Colores.textoSecundario),
          ),
          const SizedBox(width: Espaciado.s1),
          Expanded(child: Text(texto, style: tema.bodyLarge)),
        ],
      ),
    );
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                ExcludeSemantics(
                  child: CircleAvatar(
                    backgroundColor: Colores.principal,
                    foregroundColor: Colores.superficie,
                    child: Icon(iconoCategoria(punto.categoriaId)),
                  ),
                ),
                const SizedBox(width: Espaciado.s2),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(punto.categoria, style: tema.titleLarge),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Espaciado.s1),
            fila(Icons.flag_outlined, 'Estado: ${punto.estadoTexto}'),
            fila(Icons.map_outlined, 'Distrito: ${punto.distrito}'),
            fila(
              Icons.schedule,
              'Ocurrió el ${_fechaHora(punto.ocurridoEn)} (${punto.antiguedadTexto})',
            ),
            if (metros case final m?)
              fila(
                Icons.near_me_outlined,
                'Está ${distanciaTexto(m)} de tu ubicación',
              ),
            fila(
              Icons.verified_outlined,
              'Verificado por la institución que lo atiende.',
            ),
            const SizedBox(height: Espaciado.s2),
            Text(
              'Por privacidad no se muestran la descripción, las fotos ni los datos de quien reportó.',
              style: tema.bodySmall?.copyWith(color: Colores.textoSecundario),
            ),
            const SizedBox(height: Espaciado.s1),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cerrar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
