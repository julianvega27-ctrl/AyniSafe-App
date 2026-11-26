import 'dart:convert';

import 'package:ayni_safe/aplicacion/reporte_controlador.dart';
import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/datos/incidentes_repositorio.dart';
import 'package:ayni_safe/presentacion/componentes/selector_punto.dart';
import 'package:ayni_safe/datos/ubicacion.dart';
import 'package:ayni_safe/presentacion/pantallas/reporte_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

/// Ubicación falsa: cuenta las solicitudes y devuelve el resultado configurado.
class UbicacionFalsa implements UbicacionPuerto {
  UbicacionFalsa([this.resultado = const UbicacionDenegada(permanente: false)]);
  ResultadoUbicacion resultado;
  int solicitudes = 0;

  @override
  Future<ResultadoUbicacion> obtener() async {
    solicitudes += 1;
    return resultado;
  }
}

final List<Map<String, Object?>> categoriasJson = [
  for (final (id, nombre) in const [
    ('accidente-transito', 'Accidente de tránsito'),
    ('otra-emergencia', 'Otra emergencia'),
    ('pelea', 'Pelea'),
    ('robo', 'Robo'),
  ])
    {'id': id, 'nombre': nombre, 'orden': 1, 'activa': true},
];

Map<String, Object?> comprobante({String? codigo}) => {
  'referencia': 'INC-7K3M9-Q2TXA',
  'estado': 'REGISTRADO',
  'recibidoEn': '2026-11-26T15:00:01.123Z',
  'modalidad': codigo == null ? 'cuenta' : 'invitado',
  'territorio': {
    'estado': 'resuelto',
    'distrito': {'id': 'DIS-01', 'nombre': 'Ayacucho'},
  },
  'codigoSeguimiento': ?codigo,
};

class Montaje {
  Montaje({String? token, ResultadoUbicacion? ubicacion}) : token = token {
    this.ubicacion = UbicacionFalsa(
      ubicacion ?? const UbicacionDenegada(permanente: false),
    );
    api.manejador = (req) async {
      if (req.url.path.endsWith('/publico/categorias')) {
        return respuestaJson(200, {'categorias': categoriasJson});
      }
      return responderEnvio(req);
    };
    controlador = ReporteControlador(
      repositorio: api.incidentes,
      ubicacion: this.ubicacion,
      guardadas: guardadas,
      obtenerToken: () => token,
      nuevaClave: () => 'clave-${++claves}',
      ahora: () => DateTime.utc(2026, 11, 26, 15),
    );
  }

  final String? token;
  final ApiFalsa api = ApiFalsa();
  late final UbicacionFalsa ubicacion;
  final ConsultasGuardadasEnMemoria guardadas = ConsultasGuardadasEnMemoria();
  late final ReporteControlador controlador;
  int claves = 0;
  Future<http.Response> Function(http.Request) responderEnvio = (_) async =>
      respuestaJson(201, comprobante());

  List<SolicitudRegistrada> get envios =>
      api.solicitudes.where((s) => s.ruta.endsWith('/incidentes')).toList();

  Widget widget() => conTema(
    Scaffold(
      body: ReportePantalla(
        controlador: controlador,
        cargarContornos: () async => const [],
        mostrarTeselas: false,
        alVerMisReportes: () {},
        alConsultarCodigo: () {},
      ),
    ),
  );
}

Future<void> elegirCategoria(WidgetTester tester, String nombre) async {
  await pulsar(tester, find.byKey(const Key('reporteCategoria')));
  await tester.tap(find.text(nombre).last);
  await tester.pumpAndSettle();
}

/// Escribe en un campo y deja que el formulario se reconstruya antes del siguiente gesto.
Future<void> escribir(
  WidgetTester tester,
  String etiqueta,
  String texto,
) async {
  await tester.ensureVisible(find.widgetWithText(TextField, etiqueta));
  await tester.pumpAndSettle();
  await escribirEn(tester, etiqueta, texto);
  await tester.pumpAndSettle();
}

/// Pulsa un control visible (desplaza la lista si hace falta).
Future<void> pulsar(WidgetTester tester, Finder control) async {
  await tester.ensureVisible(control);
  await tester.pumpAndSettle();
  await tester.tap(control);
  await tester.pumpAndSettle();
}

Future<void> marcarYConfirmarPunto(WidgetTester tester) async {
  final mapa = find.byType(FlutterMap);
  await tester.ensureVisible(mapa);
  await tester.pumpAndSettle();
  await tester.tapAt(tester.getCenter(mapa));
  // El mapa confirma el toque al vencer la espera de doble toque (~300 ms).
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pumpAndSettle();
  final confirmar = find.text('Confirmar este punto');
  await tester.ensureVisible(confirmar);
  await tester.tap(confirmar);
  await tester.pumpAndSettle();
}

Future<void> completarBasico(
  WidgetTester tester, {
  String categoria = 'Robo',
  bool invitado = false,
}) async {
  await elegirCategoria(tester, categoria);
  await escribir(tester, 'Describe lo sucedido', 'Me arrebataron el celular');
  await marcarYConfirmarPunto(tester);
  if (invitado) {
    await tester.ensureVisible(
      find.widgetWithText(TextField, 'Teléfono de contacto'),
    );
    await escribir(tester, 'Teléfono de contacto', '987 654 321');
  }
}

Future<void> enviar(WidgetTester tester, [String texto = 'Enviar reporte']) =>
    pulsar(tester, find.text(texto));

void main() {
  group('formulario', () {
    testWidgets(
      'con cuenta: sin teléfono, sin categoría preseleccionada y «Ahora» marcado',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(TextField, 'Teléfono de contacto'),
          findsNothing,
        );
        expect(m.controlador.categoriaId, isNull);
        final segmentos = tester.widget<SegmentedButton<ModoOcurrencia>>(
          find.byType(SegmentedButton<ModoOcurrencia>),
        );
        expect(segmentos.selected, {ModoOcurrencia.ahora});
      },
    );

    testWidgets(
      'como invitado: teléfono obligatorio con su explicación de uso restringido',
      (tester) async {
        final m = Montaje();
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(TextField, 'Teléfono de contacto'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Solo lo verá el personal competente de tu caso'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'Otra emergencia cambia el rótulo de la descripción y la sigue exigiendo',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await elegirCategoria(tester, 'Otra emergencia');
        expect(
          find.widgetWithText(
            TextField,
            '¿Qué otra emergencia está ocurriendo?',
          ),
          findsOneWidget,
        );
        await marcarYConfirmarPunto(tester);
        await enviar(tester);
        expect(m.envios, isEmpty);
        expect(
          find.textContaining('Explica qué otra emergencia está ocurriendo'),
          findsOneWidget,
        );
      },
    );
  });

  group('preguntas para SAMU', () {
    testWidgets(
      'accidente muestra las dos preguntas sin opción marcada; enviar sin responder no las envía',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await completarBasico(tester, categoria: 'Accidente de tránsito');
        expect(find.text('¿Hay heridos?'), findsOneWidget);
        expect(find.text('¿Se necesita atención médica?'), findsOneWidget);
        for (final b in tester.widgetList<SegmentedButton<Respuesta>>(
          find.byType(SegmentedButton<Respuesta>),
        )) {
          expect(b.selected, isEmpty);
          expect(b.segments.map((s) => s.value), Respuesta.values);
        }
        await enviar(tester);
        final cuerpo = m.envios.single.json!;
        expect(cuerpo.containsKey('heridos'), isFalse);
        expect(cuerpo.containsKey('atencionMedica'), isFalse);
      },
    );

    testWidgets(
      'pelea: «No sé» se envía como no_se y cambiar a Robo retira las preguntas',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await completarBasico(tester, categoria: 'Pelea');
        expect(find.text('¿Se necesita atención médica?'), findsNothing);
        await pulsar(tester, find.text('No sé'));
        expect(m.controlador.heridos, Respuesta.noSe);
        await elegirCategoria(tester, 'Robo');
        expect(find.text('¿Hay heridos?'), findsNothing);
        await enviar(tester);
        expect(m.envios.single.json!.containsKey('heridos'), isFalse);
      },
    );
  });

  group('ubicación', () {
    testWidgets(
      'no se pide ubicación al abrir; al denegar se explica y se ofrece el mapa sin perder lo escrito',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        expect(m.ubicacion.solicitudes, 0);
        await escribir(tester, 'Describe lo sucedido', 'Texto que se conserva');
        await pulsar(tester, find.text('Usar mi ubicación'));
        expect(m.ubicacion.solicitudes, 1);
        expect(
          find.textContaining(
            'No diste permiso de ubicación. Elige el punto en el mapa',
          ),
          findsOneWidget,
        );
        expect(
          textoDe(tester, 'Describe lo sucedido'),
          'Texto que se conserva',
        );
        expect(m.controlador.punto, isNull);
      },
    );

    testWidgets(
      'servicio apagado y permiso bloqueado tienen su propio motivo',
      (tester) async {
        final m = Montaje(
          token: 'tok',
          ubicacion: const UbicacionServicioApagado(),
        );
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await pulsar(tester, find.text('Usar mi ubicación'));
        expect(
          find.textContaining('La ubicación del teléfono está apagada'),
          findsOneWidget,
        );
        m.ubicacion.resultado = const UbicacionDenegada(permanente: true);
        await pulsar(tester, find.text('Usar mi ubicación'));
        expect(find.textContaining('bloqueado'), findsOneWidget);
      },
    );

    testWidgets('con permiso: punto GPS con su precisión', (tester) async {
      final m = Montaje(
        token: 'tok',
        ubicacion: const UbicacionObtenida(
          PuntoUbicado(latitud: -13.16, longitud: -74.22, precisionM: 12),
        ),
      );
      await tester.pumpWidget(m.widget());
      await tester.pumpAndSettle();
      await pulsar(tester, find.text('Usar mi ubicación'));
      expect(find.text('Punto de tu ubicación'), findsOneWidget);
      expect(find.textContaining('Precisión estimada: 12 m'), findsOneWidget);
    });

    testWidgets(
      'el punto manual se marca en el mapa y se confirma; queda con origen manual',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await marcarYConfirmarPunto(tester);
        expect(m.controlador.punto?.manual, isTrue);
        expect(find.text('Punto elegido en el mapa'), findsOneWidget);
        expect(m.ubicacion.solicitudes, 0);
      },
    );

    testWidgets(
      'sin punto no se envía: se explica junto a la ubicación y se conserva el formulario',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await elegirCategoria(tester, 'Robo');
        await escribir(
          tester,
          'Describe lo sucedido',
          'Me arrebataron el celular',
        );
        await enviar(tester);
        expect(m.envios, isEmpty);
        expect(
          find.textContaining('Falta el punto del incidente'),
          findsOneWidget,
        );
        expect(
          textoDe(tester, 'Describe lo sucedido'),
          'Me arrebataron el celular',
        );
      },
    );

    testWidgets(
      'sin mapa base dibuja los límites distritales y permite marcar el punto',
      (tester) async {
        ({double latitud, double longitud})? marcado;
        var cargas = 0;
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: SelectorPunto(
                punto: null,
                candidato: null,
                alMarcar: (lat, lon) => marcado = (latitud: lat, longitud: lon),
                mostrarTeselas: false,
                cargarContornos: () async {
                  cargas += 1;
                  return const [
                    ContornoDistrito(
                      id: 'DIS-01',
                      nombre: 'Ayacucho',
                      anillos: [
                        [
                          (-13.17, -74.23),
                          (-13.17, -74.21),
                          (-13.15, -74.21),
                          (-13.15, -74.23),
                          (-13.17, -74.23),
                        ],
                      ],
                    ),
                  ];
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(cargas, 1);
        expect(find.byType(PolygonLayer), findsOneWidget);
        expect(find.byType(TileLayer), findsNothing);
        expect(
          find.textContaining('se muestran solo los límites de los distritos'),
          findsOneWidget,
        );
        await tester.tapAt(tester.getCenter(find.byType(FlutterMap)));
        await tester.pump(const Duration(milliseconds: 500));
        expect(marcado, isNotNull);
      },
    );

    testWidgets('con mapa base muestra la atribución y no carga los límites', (
      tester,
    ) async {
      var cargas = 0;
      await tester.pumpWidget(
        conTema(
          Scaffold(
            body: SelectorPunto(
              punto: null,
              candidato: null,
              alMarcar: (_, _) {},
              cargarContornos: () async {
                cargas += 1;
                return const [];
              },
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byType(TileLayer), findsOneWidget);
      expect(
        find.textContaining('Mapa base: © OpenStreetMap contributors'),
        findsOneWidget,
      );
      expect(cargas, 0);
    });

    testWidgets(
      'sin mapa base se informa y, sin límites, se ofrece usar la ubicación',
      (tester) async {
        final m = Montaje(token: 'tok');
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        expect(
          find.textContaining('El mapa base no está disponible'),
          findsOneWidget,
        );
      },
    );
  });

  group('envío', () {
    testWidgets(
      'el error de campo del servidor aparece junto al teléfono y el resto se conserva',
      (tester) async {
        final m = Montaje();
        m.responderEnvio = (_) async => respuestaJson(
          400,
          errorJson(
            'VALIDATION_ERROR',
            campos: {
              'telefonoContacto': 'Teléfono no válido según el servidor.',
            },
          ),
        );
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await completarBasico(tester, invitado: true);
        await enviar(tester);
        expect(
          find.text('Teléfono no válido según el servidor.'),
          findsOneWidget,
        );
        expect(
          textoDe(tester, 'Describe lo sucedido'),
          'Me arrebataron el celular',
        );
      },
    );

    testWidgets(
      'conexión perdida: resultado incierto, reintento con la misma clave y mismo comprobante',
      (tester) async {
        final m = Montaje(token: 'tok');
        var intentos = 0;
        m.responderEnvio = (_) async {
          intentos += 1;
          if (intentos == 1) throw http.ClientException('sin red');
          return respuestaJson(200, comprobante());
        };
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await completarBasico(tester);
        await enviar(tester);
        expect(
          find.textContaining('No sabemos si tu reporte se registró'),
          findsOneWidget,
        );
        expect(
          textoDe(tester, 'Describe lo sucedido'),
          'Me arrebataron el celular',
        );
        await enviar(tester, 'Reintentar envío');
        expect(m.envios, hasLength(2));
        expect(
          m.envios[0].cabeceras['Idempotency-Key'],
          m.envios[1].cabeceras['Idempotency-Key'],
        );
        expect(m.envios[0].cuerpo, m.envios[1].cuerpo);
        expect(find.text('Reporte registrado'), findsOneWidget);
        expect(find.textContaining('INC-7K3M9-Q2TXA'), findsOneWidget);
      },
    );

    testWidgets('editar tras un fallo genera una clave nueva', (tester) async {
      final m = Montaje(token: 'tok');
      m.responderEnvio = (_) async => throw http.ClientException('sin red');
      await tester.pumpWidget(m.widget());
      await tester.pumpAndSettle();
      await completarBasico(tester);
      await enviar(tester);
      await escribir(
        tester,
        'Describe lo sucedido',
        'Me arrebataron el celular y la billetera',
      );
      await enviar(tester);
      expect(
        m.envios[0].cabeceras['Idempotency-Key'],
        isNot(m.envios[1].cabeceras['Idempotency-Key']),
      );
    });

    testWidgets('429: indica cuándo reintentar y conserva el formulario', (
      tester,
    ) async {
      final m = Montaje();
      m.responderEnvio = (_) async => respuestaJson(
        429,
        errorJson('RATE_LIMITED'),
        cabeceras: {'retry-after': '120'},
      );
      await tester.pumpWidget(m.widget());
      await tester.pumpAndSettle();
      await completarBasico(tester, invitado: true);
      await enviar(tester);
      expect(find.textContaining('Espera 2 minutos'), findsOneWidget);
      expect(textoDe(tester, 'Teléfono de contacto'), '987 654 321');
    });
  });

  test('el instante se envía en UTC con milisegundos, sin microsegundos', () {
    expect(
      instanteIso(DateTime.utc(2026, 11, 26, 15, 0, 1, 123, 456)),
      '2026-11-26T15:00:01.123Z',
    );
  });

  group('comprobante', () {
    testWidgets(
      'invitado: código visible con advertencia y guardado en el almacenamiento seguro',
      (tester) async {
        final m = Montaje();
        m.responderEnvio = (_) async =>
            respuestaJson(201, comprobante(codigo: 'AAAA-BBBB-CCCC-DDDD'));
        await tester.pumpWidget(m.widget());
        await tester.pumpAndSettle();
        await completarBasico(tester, invitado: true);
        await enviar(tester);
        expect(find.text('AAAA-BBBB-CCCC-DDDD'), findsOneWidget);
        expect(
          find.textContaining(
            'Es la única forma de consultar el seguimiento sin cuenta',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('Lo guardamos de forma segura'),
          findsOneWidget,
        );
        final guardadas = await m.guardadas.listar();
        expect(guardadas.single.referencia, 'INC-7K3M9-Q2TXA');
        expect(guardadas.single.codigo, 'AAAA-BBBB-CCCC-DDDD');
        expect(jsonEncode(m.envios.single.json), contains('987 654 321'));
      },
    );

    testWidgets('con cuenta: referencia y acceso a Mis reportes, sin código', (
      tester,
    ) async {
      final m = Montaje(token: 'tok');
      await tester.pumpWidget(m.widget());
      await tester.pumpAndSettle();
      await completarBasico(tester);
      await enviar(tester);
      expect(find.textContaining('INC-7K3M9-Q2TXA'), findsOneWidget);
      expect(find.text('Ver Mis reportes'), findsOneWidget);
      expect(find.text('Tu código de seguimiento'), findsNothing);
      expect(await m.guardadas.listar(), isEmpty);
    });
  });
}
