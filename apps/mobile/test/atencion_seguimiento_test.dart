import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/presentacion/pantallas/seguimiento_pantallas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

/// P6, tarea A4.4: hitos, resultado de cierre y coordinación en Mis reportes y en la consulta con
/// código, tal como los informa el servidor.
Map<String, Object?> vista({
  required String estado,
  List<Map<String, Object?>> actuaciones = const [],
  Map<String, Object?>? cierre,
  String? coordinacion,
}) => {
  'referencia': 'INC-7K3M9-Q2TXA',
  'categoria': {'id': 'robo', 'nombre': 'Robo'},
  'estado': estado,
  'recibidoEn': '2026-11-26T15:00:01.123Z',
  'institucionResponsable': {
    'estado': 'asignada',
    'institucion': {'id': 'pnp', 'nombre': 'PNP'},
  },
  'actuaciones': actuaciones,
  'cierre': cierre,
  'coordinacion': coordinacion,
  'descripcion': 'Me arrebataron el celular',
  'ocurrencia': {'modo': 'ahora', 'instante': '2026-11-26T14:59:00Z'},
  'territorio': {'estado': 'pendiente', 'motivo': 'sin_cartografia'},
};

const hitos = [
  {
    'tipo': 'EN_REVISION',
    'texto': 'En revisión',
    'instante': '2026-11-26T15:05:00Z',
  },
  {
    'tipo': 'EN_ATENCION',
    'texto': 'En atención por PNP',
    'instante': '2026-11-26T15:10:00Z',
  },
  {
    'tipo': 'CERRADO',
    'texto': 'Cerrado: atendido',
    'instante': '2026-11-26T15:40:00Z',
  },
];

Future<void> montar(
  WidgetTester tester,
  Map<String, Object?> cuerpo, {
  required bool invitado,
}) async {
  final api = ApiFalsa()..siempre(() => respuestaJson(200, cuerpo));
  final guardadas = ConsultasGuardadasEnMemoria();
  await guardadas.guardar(
    ConsultaGuardada(
      referencia: 'INC-7K3M9-Q2TXA',
      codigo: 'AAAA-BBBB-CCCC-DDDD',
      guardadaEn: DateTime.utc(2026, 11, 26),
    ),
  );
  await tester.pumpWidget(
    conTema(
      invitado
          ? Scaffold(
              body: ConsultarCodigoPantalla(
                repositorio: api.incidentes,
                guardadas: guardadas,
              ),
            )
          : DetalleIncidentePantalla(
              repositorio: api.incidentes,
              referencia: 'INC-7K3M9-Q2TXA',
              obtenerToken: () => 'tok',
              cuandoSesionInvalida: () {},
            ),
    ),
  );
  await tester.pumpAndSettle();
  if (invitado) {
    final ver = find.text('Ver seguimiento');
    await tester.ensureVisible(ver);
    await tester.pumpAndSettle();
    await tester.tap(ver);
    await tester.pumpAndSettle();
  }
}

void main() {
  for (final invitado in [false, true]) {
    final donde = invitado ? 'consulta con código' : 'Mis reportes';

    testWidgets('$donde: caso atendido con hitos y resumen', (tester) async {
      await montar(
        tester,
        vista(
          estado: 'CERRADO',
          actuaciones: hitos,
          cierre: {
            'resultado': 'ATENDIDO',
            'resumenCiudadano': 'La PNP acudió y atendió el caso.',
          },
        ),
        invitado: invitado,
      );
      final cierre = find.byKey(const Key('cierre'));
      await tester.ensureVisible(cierre);
      expect(
        find.descendant(of: cierre, matching: find.text('Atendido')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: cierre, matching: find.byIcon(Icons.task_alt)),
        findsOneWidget,
      );
      expect(find.text('La PNP acudió y atendió el caso.'), findsOneWidget);
      for (final h in [
        'En revisión',
        'En atención por PNP',
        'Cerrado: atendido',
      ]) {
        expect(find.text(h), findsOneWidget);
      }
      expect(find.text('Aún no hay actuaciones registradas.'), findsNothing);
    });

    testWidgets('$donde: descartado no se presenta como atendido', (
      tester,
    ) async {
      await montar(
        tester,
        vista(
          estado: 'CERRADO',
          actuaciones: [
            hitos.first,
            {
              'tipo': 'CERRADO',
              'texto': 'Cerrado: descartado',
              'instante': '2026-11-26T15:20:00Z',
            },
          ],
          cierre: {
            'resultado': 'DESCARTADO',
            'resumenCiudadano': 'El hecho no pudo confirmarse.',
          },
        ),
        invitado: invitado,
      );
      final cierre = find.byKey(const Key('cierre'));
      await tester.ensureVisible(cierre);
      expect(
        find.descendant(of: cierre, matching: find.text('Descartado')),
        findsOneWidget,
      );
      expect(find.text('Atendido'), findsNothing);
      expect(find.text('El hecho no pudo confirmarse.'), findsOneWidget);
    });

    testWidgets('$donde: duplicado coordinado y sin hitos sigue pendiente', (
      tester,
    ) async {
      await montar(
        tester,
        vista(
          estado: 'EN_REVISION',
          coordinacion: 'Coordinado con otro reporte del mismo hecho',
        ),
        invitado: invitado,
      );
      final c = find.byKey(const Key('coordinacion'));
      await tester.ensureVisible(c);
      expect(
        find.text('Coordinado con otro reporte del mismo hecho'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('cierre')), findsNothing);
      expect(find.text('Aún no hay actuaciones registradas.'), findsOneWidget);
    });
  }
}
