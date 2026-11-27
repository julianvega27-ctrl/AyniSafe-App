import 'dart:convert';

import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/presentacion/pantallas/seguimiento_pantallas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

final png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

const idA = '00000000-0000-4000-8000-00000000000a';
const idB = '00000000-0000-4000-8000-00000000000b';

Map<String, Object?> detalle({List<String> fotos = const [idA, idB]}) => {
  'referencia': 'INC-7K3M9-Q2TXA',
  'categoria': {'id': 'robo', 'nombre': 'Robo'},
  'estado': 'REGISTRADO',
  'recibidoEn': '2026-11-26T15:00:01.123Z',
  'territorio': {'estado': 'pendiente', 'motivo': 'sin_cartografia'},
  'descripcion': 'Me robaron el celular',
  'ocurrencia': {'modo': 'ahora', 'instante': '2026-11-26T14:59:00Z'},
  'respuestas': {'heridos': null, 'atencionMedica': null},
  'evaluacion': null,
  'institucionResponsable': {'estado': 'pendiente'},
  'actuaciones': <Object>[],
  'evidencias': [
    for (final id in fotos) {'id': id, 'tipo': 'image/png', 'bytes': png.length, 'adjuntadaEn': '2026-11-26T15:00:05.000Z'},
  ],
};

Widget pantalla(ApiFalsa api) => conTema(
  DetalleIncidentePantalla(
    repositorio: api.incidentes,
    referencia: 'INC-7K3M9-Q2TXA',
    obtenerToken: () => 'tok',
    cuandoSesionInvalida: () {},
  ),
);

void main() {
  testWidgets('el autor ve sus dos fotos con la sesión y puede ampliarlas', (tester) async {
    final api = ApiFalsa()
      ..manejador = (req) async => req.url.path.endsWith('/contenido')
          ? http.Response.bytes(png, 200, headers: {'content-type': 'image/png'})
          : respuestaJson(200, detalle());
    await tester.pumpWidget(pantalla(api));
    await tester.pumpAndSettle();
    final semantica = tester.ensureSemantics();
    expect(find.text('Tus fotos'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Foto 1 de 2 que enviaste')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Foto 2 de 2 que enviaste')), findsOneWidget);
    final cargas = api.solicitudes.where((s) => s.ruta.endsWith('/contenido')).toList();
    expect(cargas.map((s) => s.ruta), containsAll([
      '/api/v1/ciudadano/incidentes/INC-7K3M9-Q2TXA/evidencias/$idA/contenido',
      '/api/v1/ciudadano/incidentes/INC-7K3M9-Q2TXA/evidencias/$idB/contenido',
    ]));
    for (final s in cargas) {
      final auth = s.cabeceras.entries.firstWhere((e) => e.key.toLowerCase() == 'authorization').value;
      expect(auth, 'Bearer tok');
    }
    await tester.ensureVisible(find.bySemanticsLabel(RegExp(r'^Foto 1 de 2')));
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Foto 1 de 2')));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Foto 1 que enviaste, ampliada'), findsOneWidget);
    await tester.tap(find.text('Cerrar'));
    await tester.pumpAndSettle();
    semantica.dispose();
  });

  for (final estado in [404, 503]) {
    testWidgets('una foto que responde $estado se muestra como no disponible sin ocultar el detalle', (tester) async {
      final api = ApiFalsa()
        ..manejador = (req) async {
          if (req.url.path.endsWith('$idB/contenido')) return respuestaJson(estado, errorJson('X'));
          if (req.url.path.endsWith('/contenido')) {
            return http.Response.bytes(png, 200, headers: {'content-type': 'image/png'});
          }
          return respuestaJson(200, detalle());
        };
      await tester.pumpWidget(pantalla(api));
      await tester.pumpAndSettle();
      final semantica = tester.ensureSemantics();
      expect(find.bySemanticsLabel('Foto 2 de 2 no disponible'), findsOneWidget);
      expect(find.text('No disponible'), findsOneWidget);
      expect(find.text('Me robaron el celular'), findsOneWidget);
      semantica.dispose();
    });
  }

  testWidgets('sin fotos no aparece la sección ni se piden contenidos', (tester) async {
    final api = ApiFalsa()..siempre(() => respuestaJson(200, detalle(fotos: const [])));
    await tester.pumpWidget(pantalla(api));
    await tester.pumpAndSettle();
    expect(find.text('Tus fotos'), findsNothing);
    expect(api.solicitudes.where((s) => s.ruta.endsWith('/contenido')), isEmpty);
  });

  testWidgets('la consulta con código no muestra fotos', (tester) async {
    final api = ApiFalsa()
      ..siempre(() => respuestaJson(200, {
            'referencia': 'INC-7K3M9-Q2TXA',
            'categoria': {'id': 'robo', 'nombre': 'Robo'},
            'estado': 'REGISTRADO',
            'recibidoEn': '2026-11-26T15:00:01.123Z',
            'institucionResponsable': {'estado': 'pendiente'},
            'actuaciones': <Object>[],
          }));
    final guardadas = ConsultasGuardadasEnMemoria();
    await guardadas.guardar(ConsultaGuardada(referencia: 'INC-7K3M9-Q2TXA', codigo: 'AAAA-BBBB-CCCC-DDDD', guardadaEn: DateTime.utc(2026, 11, 26)));
    await tester.pumpWidget(conTema(Scaffold(body: ConsultarCodigoPantalla(repositorio: api.incidentes, guardadas: guardadas))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Ver seguimiento'));
    await tester.tap(find.text('Ver seguimiento'));
    await tester.pumpAndSettle();
    expect(find.text('Estado: Registrado'), findsOneWidget);
    expect(find.text('Tus fotos'), findsNothing);
    expect(api.solicitudes.where((s) => s.ruta.contains('/evidencias')), isEmpty);
  });
}
