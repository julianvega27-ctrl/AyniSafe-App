import 'dart:convert';

import 'package:ayni_safe/presentacion/pantallas/seguimiento_pantallas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

/// P5.1, tarea 8.3: evaluación propia en Mis reportes y aclaración desde la app.
const referencia = 'INC-7K3M9-Q2TXA';

Map<String, Object?> evaluacion({
  bool solicitud = false,
  bool puedeAclarar = true,
  String? heridos = 'no_se',
  Object? cantidad,
  int version = 1,
}) => {
  'version': version,
  'respuestas': {
    'heridos': heridos,
    'atencionMedica': null,
    'cantidadHeridos': cantidad,
    'personaPrincipal': {
      'signosVida': null,
      'consciente': null,
      'sangrado': null,
    },
  },
  'informadaEn': '2026-11-26T15:00:00.000Z',
  'puedeAclarar': puedeAclarar,
  'solicitudCompletar': solicitud,
};

Map<String, Object?> detalle(Map<String, Object?>? ev) => {
  'referencia': referencia,
  'categoria': {'id': 'accidente-transito', 'nombre': 'Accidente de tránsito'},
  'estado': 'REGISTRADO',
  'recibidoEn': '2026-11-26T15:00:01.123Z',
  'territorio': {'estado': 'pendiente', 'motivo': 'sin_cartografia'},
  'descripcion': 'Choque en la avenida principal',
  'ocurrencia': {'modo': 'ahora', 'instante': '2026-11-26T14:59:00Z'},
  'respuestas': {'heridos': 'no_se', 'atencionMedica': null},
  'evaluacion': ev,
  'institucionResponsable': {'estado': 'pendiente'},
  'actuaciones': <Object>[],
};

Future<void> pulsar(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Finder opcion(String pregunta, String texto) =>
    find.descendant(of: find.byKey(Key(pregunta)), matching: find.text(texto));

class Escenario {
  Escenario(this.respuestas);

  /// Respuestas sucesivas del servidor: detalle, aclaración, detalle recargado…
  final List<http.Response Function()> respuestas;
  final ApiFalsa api = ApiFalsa();
  int sesionesVencidas = 0;

  Future<void> montar(WidgetTester tester) async {
    var i = 0;
    api.manejador = (_) async =>
        respuestas[i < respuestas.length ? i++ : respuestas.length - 1]();
    await tester.pumpWidget(
      conTema(
        DetalleIncidentePantalla(
          repositorio: api.incidentes,
          referencia: referencia,
          obtenerToken: () => 'tok',
          cuandoSesionInvalida: () => sesionesVencidas++,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  List<Map<String, Object?>> get aclaraciones => [
    for (final s in api.solicitudes)
      if (s.metodo == 'POST' && s.ruta.endsWith('/evaluacion'))
        jsonDecode(s.cuerpo) as Map<String, Object?>,
  ];
}

void main() {
  testWidgets('solicitud de completar: aviso con texto e icono y acción', (
    tester,
  ) async {
    final e = Escenario([
      () => respuestaJson(200, detalle(evaluacion(solicitud: true))),
    ]);
    await e.montar(tester);
    expect(find.text('Tu evaluación para SAMU'), findsOneWidget);
    expect(find.textContaining('SAMU interviene en este caso'), findsOneWidget);
    expect(find.byIcon(Icons.medical_services_outlined), findsOneWidget);
    expect(find.text('Completar evaluación'), findsOneWidget);
    expect(find.text('Aclarar evaluación'), findsNothing);
  });

  testWidgets(
    'respuestas con «Informado el» y las omitidas como «Sin respuesta»',
    (tester) async {
      final e = Escenario([() => respuestaJson(200, detalle(evaluacion()))]);
      await e.montar(tester);
      expect(find.textContaining('Informado el'), findsOneWidget);
      expect(find.textContaining('no el estado actual'), findsOneWidget);
      expect(find.text('No sé'), findsOneWidget);
      expect(find.text('Sin respuesta'), findsNWidgets(4));
      expect(find.text('Aclarar evaluación'), findsOneWidget);
    },
  );

  testWidgets(
    'aclaración enviada: una solicitud con los cambios y el detalle recargado',
    (tester) async {
      final e = Escenario([
        () => respuestaJson(200, detalle(evaluacion())),
        () => respuestaJson(200, {
          'evaluacion': evaluacion(heridos: 'si', cantidad: 2, version: 2),
        }),
        () => respuestaJson(
          200,
          detalle(evaluacion(heridos: 'si', cantidad: 2, version: 2)),
        ),
      ]);
      await e.montar(tester);
      await pulsar(tester, find.text('Aclarar evaluación'));
      expect(
        find.text('Aclarar evaluación'),
        findsOneWidget,
      ); // título de la pantalla
      await pulsar(tester, opcion('aclararHeridos', 'Sí'));
      await pulsar(tester, find.byKey(const Key('cantidad-2')));
      await pulsar(tester, find.text('Enviar aclaración'));
      expect(e.aclaraciones, [
        {'heridos': 'si', 'cantidadHeridos': 2},
      ]);
      expect(e.api.contar('GET', '/ciudadano/incidentes/$referencia'), 2);
      expect(find.text('Tu evaluación para SAMU'), findsOneWidget);
      expect(find.text('Personas heridas'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
    },
  );

  testWidgets('sin cambios no se envía nada', (tester) async {
    final e = Escenario([() => respuestaJson(200, detalle(evaluacion()))]);
    await e.montar(tester);
    await pulsar(tester, find.text('Aclarar evaluación'));
    await pulsar(tester, find.text('Enviar aclaración'));
    expect(e.aclaraciones, isEmpty);
    expect(find.text('No cambiaste ninguna respuesta.'), findsOneWidget);
  });

  testWidgets(
    'sin conexión: se informa y lo marcado se conserva para reintentar',
    (tester) async {
      final e = Escenario([
        () => respuestaJson(200, detalle(evaluacion())),
        () => throw http.ClientException('sin red'),
      ]);
      await e.montar(tester);
      await pulsar(tester, find.text('Aclarar evaluación'));
      await pulsar(tester, opcion('aclararHeridos', 'Sí'));
      await pulsar(tester, find.text('Enviar aclaración'));
      expect(find.textContaining('problema de conexión'), findsOneWidget);
      final heridos = tester.widget<SegmentedButton<Object>>(
        find.descendant(
          of: find.byKey(const Key('aclararHeridos')),
          matching: find.byWidgetPredicate((w) => w is SegmentedButton),
        ),
      );
      expect(heridos.selected.single.toString(), contains('si'));
      expect(find.text('Enviar aclaración'), findsOneWidget);
    },
  );

  testWidgets('404 y sesión vencida', (tester) async {
    final e = Escenario([
      () => respuestaJson(200, detalle(evaluacion())),
      () => respuestaJson(404, {
        'error': {'code': 'NOT_FOUND'},
      }),
      () => respuestaJson(401, {
        'error': {'code': 'UNAUTHENTICATED'},
      }),
    ]);
    await e.montar(tester);
    await pulsar(tester, find.text('Aclarar evaluación'));
    await pulsar(tester, opcion('aclararHeridos', 'Sí'));
    await pulsar(tester, find.text('Enviar aclaración'));
    expect(
      find.text('No encontramos este reporte en tu cuenta.'),
      findsOneWidget,
    );
    await pulsar(tester, find.text('Enviar aclaración'));
    expect(e.sesionesVencidas, 1);
    expect(find.text('Enviar aclaración'), findsNothing);
  });

  testWidgets('incidente cerrado: sin acción de aclarar', (tester) async {
    final e = Escenario([
      () => respuestaJson(200, detalle(evaluacion(puedeAclarar: false))),
    ]);
    await e.montar(tester);
    expect(find.text('Tu evaluación para SAMU'), findsOneWidget);
    expect(find.text('Aclarar evaluación'), findsNothing);
    expect(find.text('Completar evaluación'), findsNothing);
  });

  testWidgets('sin evaluación no se muestra la sección', (tester) async {
    final e = Escenario([() => respuestaJson(200, detalle(null))]);
    await e.montar(tester);
    expect(find.text('Tu evaluación para SAMU'), findsNothing);
  });
}
