import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/presentacion/pantallas/seguimiento_pantallas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

Map<String, Object?> elemento(int i) => {
  'referencia': 'INC-AAAAA-AAA${i.toString().padLeft(2, '0')}',
  'categoria': {'id': 'robo', 'nombre': 'Robo'},
  'estado': 'REGISTRADO',
  'recibidoEn': '2026-11-26T15:00:00.000Z',
  'territorio': {'estado': 'pendiente', 'motivo': 'sin_cartografia'},
};

Map<String, Object?> vistaInvitado() => {
  'referencia': 'INC-7K3M9-Q2TXA',
  'categoria': {'id': 'pelea', 'nombre': 'Pelea'},
  'estado': 'REGISTRADO',
  'recibidoEn': '2026-11-26T15:00:01.123Z',
  'institucionResponsable': {'estado': 'pendiente'},
  'actuaciones': <Object>[],
};

Future<void> pulsar(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  for (final estado in ['pendiente', 'asignada', 'desconocido']) {
    for (final invitado in [false, true]) {
      testWidgets(
        'responsable $estado en ${invitado ? "invitado" : "detalle propio"}, sin confirmar atención',
        (tester) async {
          final responsable = {
            'estado': estado,
            'institucion': {'id': 'samu', 'nombre': 'SAMU'},
          };
          final api = ApiFalsa()
            ..siempre(
              () => respuestaJson(200, {
                ...vistaInvitado(),
                'descripcion': 'Accidente informado por el ciudadano',
                'ocurrencia': {
                  'modo': 'ahora',
                  'instante': '2026-11-26T14:59:00Z',
                },
                'territorio': {
                  'estado': 'pendiente',
                  'motivo': 'sin_cartografia',
                },
                'institucionResponsable': responsable,
              }),
            );
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
          if (invitado) await pulsar(tester, find.text('Ver seguimiento'));
          final bloque = find
              .descendant(
                of: find.byType(BloquePendienteAtencion),
                matching: find.byType(ListTile),
              )
              .first;
          await tester.ensureVisible(bloque);
          expect(
            find.descendant(
              of: bloque,
              matching: find.text(
                estado == 'asignada' ? 'SAMU' : 'Pendiente de asignación.',
              ),
            ),
            findsOneWidget,
          );
          expect(
            find.descendant(
              of: bloque,
              matching: find.byIcon(Icons.account_balance_outlined),
            ),
            findsOneWidget,
          );
          expect(find.text('Estado: Registrado'), findsOneWidget);
          expect(find.textContaining('En atención'), findsNothing);
          expect(find.textContaining('Recibido por'), findsNothing);
          expect(
            find.text('Aún no hay actuaciones registradas.'),
            findsOneWidget,
          );
        },
      );
    }
  }

  group('Mis reportes', () {
    testWidgets(
      'lista los propios del servidor, carga más con el cursor y abre el detalle con institución pendiente',
      (tester) async {
        final api = ApiFalsa();
        api.manejador = (req) async {
          if (req.url.path.endsWith('/ciudadano/incidentes')) {
            return req.url.queryParameters['cursor'] == 'p2'
                ? respuestaJson(200, {
                    'elementos': [elemento(3)],
                    'siguiente': null,
                  })
                : respuestaJson(200, {
                    'elementos': [elemento(1), elemento(2)],
                    'siguiente': 'p2',
                  });
          }
          return respuestaJson(200, {
            ...elemento(1),
            'descripcion': 'Me arrebataron el celular',
            'ocurrencia': {
              'modo': 'ahora',
              'instante': '2026-11-26T14:58:00.000Z',
            },
            'respuestas': {'heridos': null, 'atencionMedica': null},
            'institucionResponsable': {'estado': 'pendiente'},
            'actuaciones': <Object>[],
          });
        };
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: MisReportesPantalla(
                repositorio: api.incidentes,
                obtenerToken: () => 'tok',
                cuandoSesionInvalida: () {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('INC-AAAAA-AAA01'), findsOneWidget);
        expect(find.text('Estado: Registrado'), findsNWidgets(2));
        await pulsar(tester, find.text('Cargar más'));
        expect(find.text('INC-AAAAA-AAA03'), findsOneWidget);
        expect(find.text('Cargar más'), findsNothing);
        await pulsar(tester, find.text('INC-AAAAA-AAA01'));
        expect(find.text('Me arrebataron el celular'), findsOneWidget);
        expect(find.text('Pendiente de asignación.'), findsOneWidget);
        expect(
          find.text('Aún no hay actuaciones registradas.'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'sin reportes: estado vacío con acceso a Reportar; error: reintento',
      (tester) async {
        final api = ApiFalsa()
          ..siempre(
            () => respuestaJson(200, {
              'elementos': <Object>[],
              'siguiente': null,
            }),
          );
        var reportar = 0;
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: MisReportesPantalla(
                repositorio: api.incidentes,
                obtenerToken: () => 'tok',
                cuandoSesionInvalida: () {},
                alReportar: () => reportar += 1,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Aún no tienes reportes registrados con tu cuenta.'),
          findsOneWidget,
        );
        await pulsar(tester, find.text('Reportar un incidente'));
        expect(reportar, 1);

        final caida = ApiFalsa()..sinRed();
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: MisReportesPantalla(
                key: UniqueKey(),
                repositorio: caida.incidentes,
                obtenerToken: () => 'tok',
                cuandoSesionInvalida: () {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.textContaining('Sin conexión'), findsOneWidget);
        expect(find.text('Reintentar'), findsOneWidget);
      },
    );

    testWidgets('sesión vencida: avisa al controlador de sesión', (
      tester,
    ) async {
      final api = ApiFalsa()
        ..siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
      var invalidas = 0;
      await tester.pumpWidget(
        conTema(
          Scaffold(
            body: MisReportesPantalla(
              repositorio: api.incidentes,
              obtenerToken: () => 'tok',
              cuandoSesionInvalida: () => invalidas += 1,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(invalidas, 1);
    });
  });

  group('Consultar con código', () {
    testWidgets(
      'abre una consulta guardada sin reescribir el código y muestra solo estado y resumen',
      (tester) async {
        final api = ApiFalsa()
          ..siempre(() => respuestaJson(200, vistaInvitado()));
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
            Scaffold(
              body: ConsultarCodigoPantalla(
                repositorio: api.incidentes,
                guardadas: guardadas,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await pulsar(tester, find.text('Ver seguimiento'));
        expect(api.solicitudes.single.json, {
          'referencia': 'INC-7K3M9-Q2TXA',
          'codigo': 'AAAA-BBBB-CCCC-DDDD',
        });
        expect(find.text('Estado: Registrado'), findsOneWidget);
        expect(find.text('Pelea'), findsOneWidget);
        expect(find.text('Pendiente de asignación.'), findsOneWidget);
      },
    );

    testWidgets(
      '404 muestra un único mensaje genérico; 429 indica cuándo reintentar',
      (tester) async {
        final api = ApiFalsa()
          ..siempre(() => respuestaJson(404, errorJson('TRACKING_NOT_FOUND')));
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: ConsultarCodigoPantalla(
                repositorio: api.incidentes,
                guardadas: ConsultasGuardadasEnMemoria(),
                ahora: () => ahoraFijo,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await escribirEn(tester, 'Referencia', 'INC-00000-00000');
        await escribirEn(
          tester,
          'Código de seguimiento',
          'AAAA-BBBB-CCCC-DDDD',
        );
        await pulsar(tester, find.text('Consultar'));
        expect(find.text('Referencia o código incorrectos.'), findsOneWidget);
        api.siempre(
          () => respuestaJson(
            429,
            errorJson('RATE_LIMITED'),
            cabeceras: {'retry-after': '60'},
          ),
        );
        await pulsar(tester, find.text('Consultar'));
        expect(find.textContaining('Espera 1 minuto'), findsOneWidget);
      },
    );

    testWidgets('olvidar una consulta la borra del almacenamiento', (
      tester,
    ) async {
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
          Scaffold(
            body: ConsultarCodigoPantalla(
              repositorio: ApiFalsa().incidentes,
              guardadas: guardadas,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await pulsar(tester, find.text('Olvidar'));
      expect(await guardadas.listar(), isEmpty);
      expect(find.text('INC-7K3M9-Q2TXA'), findsNothing);
    });
  });

  testWidgets(
    'al volver a Inicio se releen los últimos reportes (incluido uno recién enviado) sin rehacer Inicio',
    (tester) async {
      final api = ApiFalsa();
      final servidor = ServidorPerfil();
      api.manejador = (req) async {
        if (req.url.path.endsWith('/publico/contenido')) {
          return respuestaJson(200, contenidoJson());
        }
        return servidor.responder(req);
      };
      final almacen = AlmacenamientoEnMemoria(
        SesionGuardada(
          token: tokenSesionPrueba,
          expiresAt: ahoraFijo.add(const Duration(hours: 10)),
        ),
      );
      final sesion = crearSesion(api, almacen);
      await sesion.restaurar();
      addTearDown(sesion.dispose);
      await tester.pumpWidget(appDePrueba(api, sesion));
      await tester.pumpAndSettle();
      expect(find.textContaining('Aún no tienes reportes'), findsOneWidget);
      servidor.incidentes = [elemento(7)];
      Finder barra(String d) => find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text(d),
      );
      await pulsar(tester, barra('Reportar'));
      await pulsar(tester, barra('Inicio'));
      expect(find.text('INC-AAAAA-AAA07'), findsOneWidget);
    },
  );

  testWidgets(
    'las consultas guardadas siguen disponibles tras iniciar y cerrar sesión, sin aparecer en Mis reportes',
    (tester) async {
      final api = ApiFalsa();
      final servidor = ServidorPerfil();
      api.manejador = (req) async {
        if (req.url.path.endsWith('/publico/contenido')) {
          return respuestaJson(200, contenidoJson());
        }
        return servidor.responder(req);
      };
      final guardadas = ConsultasGuardadasEnMemoria();
      await guardadas.guardar(
        ConsultaGuardada(
          referencia: 'INC-7K3M9-Q2TXA',
          codigo: 'AAAA-BBBB-CCCC-DDDD',
          guardadaEn: DateTime.utc(2026, 11, 26),
        ),
      );
      final almacen = AlmacenamientoEnMemoria(
        SesionGuardada(
          token: tokenSesionPrueba,
          expiresAt: ahoraFijo.add(const Duration(hours: 10)),
        ),
      );
      final sesion = crearSesion(api, almacen);
      await sesion.restaurar();
      addTearDown(sesion.dispose);
      await tester.pumpWidget(appDePrueba(api, sesion, consultas: guardadas));
      await tester.pumpAndSettle();
      // Con sesión, Mis reportes no incluye la consulta de invitado.
      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      await pulsar(tester, find.widgetWithText(ListTile, 'Mis reportes'));
      expect(find.text('INC-7K3M9-Q2TXA'), findsNothing);
      await cerrarSesionDesdePerfil(tester);
      expect(sesion.estado, isA<SesionAnonima>());
      await pulsar(tester, find.text('Consultar con código'));
      expect(find.text('INC-7K3M9-Q2TXA'), findsOneWidget);
      expect((await guardadas.listar()).single.codigo, 'AAAA-BBBB-CCCC-DDDD');
    },
  );
}
