import 'package:ayni_safe/datos/evaluacion.dart';
import 'package:ayni_safe/presentacion/componentes/bloque_evaluacion.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

/// Las 16 categorías del catálogo (documento 09 §4).
const categorias = [
  'accidente-transito',
  'acoso',
  'actividad-sospechosa',
  'agresion',
  'asalto',
  'danos-sismo',
  'deslizamiento',
  'emergencia-medica',
  'incendio',
  'inundacion',
  'otra-emergencia',
  'otro-incidente-seguridad',
  'pelea',
  'robo',
  'vandalismo',
  'violencia',
];

/// Misma regla que `samuRequerido` de la API, escrita como tabla independiente: SAMU interviene en
/// emergencia médica siempre; en accidente con heridos o atención «Sí»; en agresión, pelea o
/// violencia con heridos «Sí».
bool esperado(String c, Respuesta? h, Respuesta? a) => switch (c) {
  'emergencia-medica' => true,
  'accidente-transito' => h == Respuesta.si || a == Respuesta.si,
  'agresion' || 'pelea' || 'violencia' => h == Respuesta.si,
  _ => false,
};

void main() {
  group('samuInterviene (misma tabla que la API)', () {
    const respuestas = [Respuesta.si, Respuesta.no, Respuesta.noSe, null];
    for (final c in categorias) {
      test(c, () {
        for (final h in respuestas) {
          for (final a in respuestas) {
            // Las respuestas solo existen en las categorías que las preguntan, como en el envío.
            final heridos = categoriasConEvaluacion.contains(c) ? h : null;
            final atencion = c == 'accidente-transito' ? a : null;
            expect(
              samuInterviene(c, heridos, atencion),
              esperado(c, heridos, atencion),
              reason: '$c heridos=$heridos atencion=$atencion',
            );
          }
        }
      });
    }
  });

  group('RespuestasEvaluacion', () {
    test(
      'cuerpo del envío: solo lo respondido y la cantidad solo con heridos Sí',
      () {
        expect(
          const RespuestasEvaluacion(heridos: Respuesta.si).cuerpoEnvio(),
          isNull,
        );
        expect(
          const RespuestasEvaluacion(
            heridos: Respuesta.si,
            cantidad: CantidadHeridos.noSe(),
            consciente: Respuesta.noSe,
          ).cuerpoEnvio(),
          {
            'cantidadHeridos': 'no_se',
            'personaPrincipal': {'consciente': 'no_se'},
          },
        );
        expect(
          const RespuestasEvaluacion(
            heridos: Respuesta.no,
            cantidad: CantidadHeridos.conocida(3),
            signosVida: SignosVida.noObservados,
          ).cuerpoEnvio(),
          {
            'personaPrincipal': {'signosVida': 'no_observados'},
          },
        );
      },
    );

    test('cambios de una aclaración: solo lo que cambia, nunca null', () {
      const antes = RespuestasEvaluacion(
        heridos: Respuesta.noSe,
        consciente: Respuesta.si,
      );
      const despues = RespuestasEvaluacion(
        heridos: Respuesta.si,
        cantidad: CantidadHeridos.conocida(2),
        consciente: Respuesta.si,
        sangrado: Respuesta.no,
      );
      expect(despues.cambiosDesde(antes), {
        'heridos': 'si',
        'cantidadHeridos': 2,
        'personaPrincipal': {'sangrado': 'no'},
      });
      expect(antes.cambiosDesde(antes), isEmpty);
    });

    test('lectura del JSON del servidor', () {
      final r = RespuestasEvaluacion.desdeJson({
        'heridos': 'si',
        'atencionMedica': null,
        'cantidadHeridos': 'no_se',
        'personaPrincipal': {
          'signosVida': 'observados',
          'consciente': null,
          'sangrado': 'no',
        },
      });
      expect(r.cantidad, const CantidadHeridos.noSe());
      expect(r.signosVida, SignosVida.observados);
      expect(r.consciente, isNull);
      expect(r.tieneObservaciones, isTrue);
    });
  });

  group('BloqueEvaluacion', () {
    Future<_Estado> montar(WidgetTester tester, {bool cantidad = true}) async {
      final e = _Estado();
      await tester.pumpWidget(
        conTema(
          Scaffold(
            body: SingleChildScrollView(
              child: StatefulBuilder(
                builder: (context, setState) => BloqueEvaluacion(
                  respuestas: e.r,
                  mostrarCantidad: cantidad,
                  habilitado: true,
                  alCambiarCantidad: (c) => setState(
                    () => e.r = e.r.copiar(
                      cantidad: c,
                      limpiarCantidad: c == null,
                    ),
                  ),
                  alCambiarSignosVida: (s) => setState(
                    () => e.r = RespuestasEvaluacion(
                      cantidad: e.r.cantidad,
                      signosVida: s,
                      consciente: e.r.consciente,
                      sangrado: e.r.sangrado,
                    ),
                  ),
                  alCambiarConsciente: (v) =>
                      setState(() => e.r = e.r.copiar(consciente: v)),
                  alCambiarSangrado: (v) =>
                      setState(() => e.r = e.r.copiar(sangrado: v)),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return e;
    }

    testWidgets('ninguna opción preseleccionada y «No sé» distinto de «No»', (
      tester,
    ) async {
      await montar(tester);
      for (final b in tester.widgetList<SegmentedButton<Respuesta>>(
        find.byType(SegmentedButton<Respuesta>),
      )) {
        expect(b.selected, isEmpty);
        expect(b.segments.map((s) => (s.label as Text).data), [
          'Sí',
          'No',
          'No sé',
        ]);
      }
      final signos = tester.widget<SegmentedButton<SignosVida>>(
        find.byType(SegmentedButton<SignosVida>),
      );
      expect(signos.selected, isEmpty);
      for (final c in tester.widgetList<ChoiceChip>(find.byType(ChoiceChip))) {
        expect(c.selected, isFalse);
      }
      expect(
        find.text(
          'Sobre una sola persona, la más afectada. Si hay varias, no hace falta describirlas a todas.',
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      '«Otra cantidad» empieza en 6, − deshabilitado en 6, + suma, sin teclado',
      (tester) async {
        final e = await montar(tester);
        await tester.tap(find.byKey(const Key('cantidad-otra')));
        await tester.pumpAndSettle();
        expect(e.r.cantidad, const CantidadHeridos.conocida(6));
        final restar = tester.widget<IconButton>(
          find.byKey(const Key('cantidad-restar')),
        );
        expect(restar.onPressed, isNull);
        await tester.tap(find.byKey(const Key('cantidad-sumar')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('cantidad-sumar')));
        await tester.pumpAndSettle();
        expect(e.r.cantidad, const CantidadHeridos.conocida(8));
        expect(find.text('8'), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(tester.testTextInput.isVisible, isFalse);
      },
    );

    testWidgets(
      '«No sé» y los accesos rápidos reemplazan la cantidad; volver a pulsar la marcada la desmarca',
      (tester) async {
        final e = await montar(tester);
        await tester.tap(find.byKey(const Key('cantidad-otra')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('cantidad-no-se')));
        await tester.pumpAndSettle();
        expect(e.r.cantidad, const CantidadHeridos.noSe());
        await tester.tap(find.byKey(const Key('cantidad-no-se')));
        await tester.pumpAndSettle();
        expect(e.r.cantidad, isNull);
        await tester.tap(find.byKey(const Key('cantidad-3')));
        await tester.pumpAndSettle();
        expect(e.r.cantidad, const CantidadHeridos.conocida(3));
        expect(find.byKey(const Key('cantidad-sumar')), findsNothing);
      },
    );

    testWidgets('el + está deshabilitado en el máximo', (tester) async {
      await tester.pumpWidget(
        conTema(
          Scaffold(
            body: SelectorCantidad(
              valor: const CantidadHeridos.conocida(cantidadMaxima),
              habilitado: true,
              alCambiar: (_) {},
            ),
          ),
        ),
      );
      expect(
        tester
            .widget<IconButton>(find.byKey(const Key('cantidad-sumar')))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<IconButton>(find.byKey(const Key('cantidad-restar')))
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('semántica: botones con nombre y cantidad anunciada', (
      tester,
    ) async {
      final semantica = tester.ensureSemantics();
      await montar(tester);
      await tester.tap(find.byKey(const Key('cantidad-otra')));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('6 personas heridas'), findsOneWidget);
      // El encabezado es solo el título: la tarjeta no fusiona sus preguntas en un único nodo.
      expect(
        tester.getSemantics(find.text('Evaluación rápida para SAMU')).label,
        'Evaluación rápida para SAMU',
      );
      expect(find.byTooltip('Sumar una persona'), findsOneWidget);
      expect(find.byTooltip('Restar una persona'), findsOneWidget);
      expect(
        tester.getSize(find.byKey(const Key('cantidad-sumar'))).height,
        greaterThanOrEqualTo(48),
      );
      semantica.dispose();
    });

    testWidgets('sin heridos Sí no se muestra la cantidad', (tester) async {
      await montar(tester, cantidad: false);
      expect(find.text('¿Cuántas personas heridas hay?'), findsNothing);
      expect(find.text('¿Está consciente?'), findsOneWidget);
    });
  });
}

class _Estado {
  RespuestasEvaluacion r = const RespuestasEvaluacion(heridos: Respuesta.si);
}
