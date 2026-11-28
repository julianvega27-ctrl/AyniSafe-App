import 'package:ayni_safe/datos/incidentes_repositorio.dart';
import 'package:ayni_safe/presentacion/pantallas/mapa_pantalla.dart';
import 'package:ayni_safe/presentacion/tema.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

/// P7, tareas A4.3 y A4.4: mapa público de la app (spec `movil/mapa-publico`).
Map<String, Object?> punto({
  String id = '0268d5b7-c102-479d-92a3-93a212ad55f3',
  String categoriaId = 'robo',
  String categoria = 'Robo',
  String distritoId = 'DIS-01',
  String distrito = 'Ayacucho',
  String estado = 'EN_REVISION',
  int horas = 3,
}) => {
  'id': id,
  'categoria': {'id': categoriaId, 'nombre': categoria},
  'distrito': {'id': distritoId, 'nombre': distrito},
  'zona': {'lat': -13.1601, 'lon': -74.2251, 'aproximada': true},
  'estado': estado,
  'ocurridoEn': '2026-11-27T09:00:00.000Z',
  'antiguedadHoras': horas,
};

Map<String, Object?> mapaJson(List<Map<String, Object?>> elementos, {List<Map<String, Object?>> reservados = const []}) => {
  'filtros': {'distrito': null, 'categoria': null, 'periodo': '7d'},
  'generadoEn': '2026-11-27T12:00:00.000Z',
  'radioZonaM': 150,
  'elementos': elementos,
  'reservados': reservados,
};

Future<ApiFalsa> montar(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) mapa,
}) async {
  final api = ApiFalsa();
  api.manejador = (req) async {
    final ruta = req.url.path;
    if (ruta.endsWith('/publico/mapa')) return mapa(req);
    if (ruta.endsWith('/publico/territorio/distritos')) {
      return respuestaJson(200, {
        'estado': 'pendiente',
        'version': null,
        'distritos': [
          {'id': 'DIS-01', 'nombre': 'Ayacucho', 'ubigeo': null},
          {'id': 'DIS-02', 'nombre': 'Carmen Alto', 'ubigeo': null},
        ],
      });
    }
    if (ruta.endsWith('/publico/categorias')) {
      return respuestaJson(200, {
        'categorias': [
          {'id': 'robo', 'nombre': 'Robo', 'orden': 1},
          {'id': 'incendio', 'nombre': 'Incendio', 'orden': 2},
        ],
      });
    }
    return respuestaJson(503, null);
  };
  await tester.pumpWidget(
    MaterialApp(
      theme: crearTema(),
      home: Scaffold(body: MapaPantalla(incidentes: api.incidentes, mostrarTeselas: false)),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

void main() {
  testWidgets('muestra las zonas publicadas en la lista, con aviso de aproximación y sin permisos', (tester) async {
    final api = await montar(tester, mapa: (_) async => respuestaJson(200, mapaJson([punto(), punto(id: 'b', estado: 'EN_ATENCION', horas: 30)])));
    expect(find.text('Mapa de incidentes'), findsOneWidget);
    expect(find.textContaining('nunca el lugar exacto'), findsOneWidget);
    expect(find.text('2 incidentes publicados'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Ayacucho · En atención · hace 1 día · zona aproximada'), 200);
    expect(find.text('Ayacucho · En revisión · hace 3 horas · zona aproximada'), findsOneWidget);
    expect(api.contar('GET', '/publico/mapa'), 1);
    expect(api.solicitudes.singleWhere((s) => s.ruta.endsWith('/publico/mapa')).consulta, 'periodo=7d');
    // Sin teselas: aviso de mapa base no disponible.
    expect(find.textContaining('El mapa base no está disponible'), findsOneWidget);
  });

  testWidgets('filtrar por distrito y período vuelve a consultar con los filtros', (tester) async {
    final api = await montar(tester, mapa: (_) async => respuestaJson(200, mapaJson([])));
    expect(find.text('Sin incidentes publicados'), findsOneWidget);
    await tester.tap(find.byKey(const Key('mapaDistrito')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Carmen Alto').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Últimas 24 horas'));
    await tester.pumpAndSettle();
    final consultas = [for (final s in api.solicitudes) if (s.ruta.endsWith('/publico/mapa')) s.consulta];
    expect(consultas, ['periodo=7d', 'distrito=DIS-02&periodo=7d', 'distrito=DIS-02&periodo=24h']);
  });

  testWidgets('los casos reservados se informan solo como total por distrito y mes', (tester) async {
    await montar(
      tester,
      mapa: (_) async => respuestaJson(200, mapaJson([], reservados: [
        {'distrito': {'id': 'DIS-01', 'nombre': 'Ayacucho'}, 'mes': '2026-11', 'total': 6},
      ])),
    );
    await tester.scrollUntilVisible(find.text('Ayacucho, 2026-11: 6 casos'), 200);
    expect(find.text('Casos reservados'), findsOneWidget);
  });

  testWidgets('si falla la API se ofrece reintentar sin bloquear los filtros', (tester) async {
    var llamadas = 0;
    final api = await montar(tester, mapa: (_) async {
      llamadas++;
      return llamadas == 1 ? respuestaJson(503, {'error': {'code': 'MAPA_NO_DISPONIBLE'}}) : respuestaJson(200, mapaJson([punto()]));
    });
    expect(find.text('El mapa no está disponible en este momento.'), findsOneWidget);
    expect(find.byKey(const Key('mapaCategoria')), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Reintentar'), 200);
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();
    expect(find.text('1 incidente publicado'), findsOneWidget);
    expect(api.contar('GET', '/publico/mapa'), 2);
  });

  testWidgets('sin red: aviso de conexión con reintento', (tester) async {
    await montar(tester, mapa: (_) async => throw http.ClientException('sin red'));
    expect(find.textContaining('Sin conexión'), findsOneWidget);
  });

  testWidgets('cada elemento de la lista se anuncia con categoría, distrito, estado y antigüedad', (tester) async {
    final semantica = tester.ensureSemantics();
    await montar(tester, mapa: (_) async => respuestaJson(200, mapaJson([punto()])));
    await tester.scrollUntilVisible(find.text('Robo'), 200);
    expect(
      find.bySemanticsLabel(RegExp(r'Robo.*Ayacucho · En revisión · hace 3 horas', dotAll: true)),
      findsOneWidget,
    );
    semantica.dispose();
  });

  testWidgets('con texto ampliado y pantalla estrecha no hay desbordes', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    await montar(tester, mapa: (_) async => respuestaJson(200, mapaJson([punto()])));
    expect(tester.takeException(), isNull);
  });

  test('el modelo rechaza un elemento incompleto', () {
    expect(MapaPublico.desdeJson(mapaJson([{'id': 'x'}])), isNull);
    expect(PuntoMapa.desdeJson(punto())!.antiguedadTexto, 'hace 3 horas');
    expect(PuntoMapa.desdeJson(punto(horas: 0))!.antiguedadTexto, 'hace menos de 1 hora');
    expect(PuntoMapa.desdeJson(punto(horas: 1))!.antiguedadTexto, 'hace 1 hora');
    expect(PuntoMapa.desdeJson(punto(horas: 50))!.antiguedadTexto, 'hace 2 días');
  });
}
