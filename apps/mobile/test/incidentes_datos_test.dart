import 'dart:async';

import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/datos/incidentes_repositorio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

Map<String, Object?> comprobanteJson({String? codigo}) => {
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const cuerpo = <String, Object?>{'categoriaId': 'robo'};
  const clave = '0b9c1e4e-2f0a-4c55-9d8e-6f1a2b3c4d5e';

  group('IncidentesRepositorio.registrar', () {
    test(
      'envía Idempotency-Key, Bearer solo con cuenta, y traduce 201 y 200',
      () async {
        final api = ApiFalsa()
          ..siempre(() => respuestaJson(201, comprobanteJson()));
        final r = await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
          token: 'tok',
        );
        expect(
          r,
          isA<EnvioConfirmado>().having((e) => e.repetido, 'repetido', false),
        );
        expect(api.solicitudes.single.cabeceras['Idempotency-Key'], clave);
        expect(api.solicitudes.single.cabeceras['Authorization'], 'Bearer tok');
        api.siempre(
          () => respuestaJson(
            200,
            comprobanteJson(codigo: 'AAAA-BBBB-CCCC-DDDD'),
          ),
        );
        final repetido = await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
        );
        expect(
          repetido,
          isA<EnvioConfirmado>().having((e) => e.repetido, 'repetido', true),
        );
        expect(
          (repetido as EnvioConfirmado).comprobante.codigoSeguimiento,
          'AAAA-BBBB-CCCC-DDDD',
        );
        expect(
          api.solicitudes.last.cabeceras.containsKey('Authorization'),
          isFalse,
        );
      },
    );

    test('sin red, tiempo agotado o 5xx: resultado incierto (no se sabe si se registró)', () async {
      final api = ApiFalsa()..sinRed();
      expect(
        await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
        ),
        isA<EnvioIncierto>(),
      );
      api.manejador = (_) async => throw TimeoutException('lento');
      expect(
        await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
        ),
        isA<EnvioIncierto>(),
      );
      for (final estado in [500, 502, 503]) {
        api.siempre(
          () => respuestaJson(estado, errorJson('SERVICE_UNAVAILABLE')),
        );
        expect(
          await api.incidentes.registrar(
            cuerpo: cuerpo,
            claveIdempotencia: clave,
          ),
          isA<EnvioIncierto>(),
        );
      }
    });

    test('400 con campos se asigna a errores de campo; 429 trae su Retry-After; 401 y 409', () async {
      final api = ApiFalsa()
        ..siempre(
          () => respuestaJson(
            400,
            errorJson(
              'VALIDATION_ERROR',
              campos: {'telefonoContacto': 'Ingresa un teléfono.'},
            ),
          ),
        );
      expect(
        await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
        ),
        isA<EnvioCamposInvalidos>().having((e) => e.campos, 'campos', {
          'telefonoContacto': 'Ingresa un teléfono.',
        }),
      );
      api.siempre(
        () => respuestaJson(
          429,
          errorJson('RATE_LIMITED'),
          cabeceras: {'retry-after': '120'},
        ),
      );
      expect(
        await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
        ),
        isA<EnvioLimite>().having((e) => e.segundos, 's', 120),
      );
      api.siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
      expect(
        await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
          token: 't',
        ),
        isA<EnvioSesionInvalida>(),
      );
      api.siempre(() => respuestaJson(409, errorJson('IDEMPOTENCY_CONFLICT')));
      expect(
        await api.incidentes.registrar(
          cuerpo: cuerpo,
          claveIdempotencia: clave,
        ),
        isA<EnvioConflicto>(),
      );
    });
  });

  group('seguimiento', () {
    test('la consulta del invitado lleva referencia y código en el cuerpo, nunca en la URL', () async {
      final api = ApiFalsa()
        ..siempre(
          () => respuestaJson(200, {
            'referencia': 'INC-7K3M9-Q2TXA',
            'categoria': {'id': 'robo', 'nombre': 'Robo'},
            'estado': 'REGISTRADO',
            'recibidoEn': '2026-11-26T15:00:01.123Z',
            'institucionResponsable': {'estado': 'pendiente'},
            'actuaciones': <Object>[],
          }),
        );
      final r = await api.incidentes.consultarInvitado(
        'INC-7K3M9-Q2TXA',
        'AAAA-BBBB-CCCC-DDDD',
      );
      expect(r, isA<ConsultaObtenida<VistaInvitado>>());
      final s = api.solicitudes.single;
      expect(s.consulta, isEmpty);
      expect(s.json, {
        'referencia': 'INC-7K3M9-Q2TXA',
        'codigo': 'AAAA-BBBB-CCCC-DDDD',
      });
    });

    test('404, 429 y sin red se distinguen', () async {
      final api = ApiFalsa()
        ..siempre(() => respuestaJson(404, errorJson('TRACKING_NOT_FOUND')));
      expect(
        await api.incidentes.consultarInvitado('r', 'c'),
        isA<ConsultaNoEncontrada<VistaInvitado>>(),
      );
      api.siempre(
        () => respuestaJson(
          429,
          errorJson('RATE_LIMITED'),
          cabeceras: {'retry-after': '30'},
        ),
      );
      expect(
        await api.incidentes.consultarInvitado('r', 'c'),
        isA<ConsultaLimite<VistaInvitado>>().having((e) => e.segundos, 's', 30),
      );
      api.sinRed();
      expect(
        await api.incidentes.consultarInvitado('r', 'c'),
        isA<ConsultaSinConexion<VistaInvitado>>(),
      );
    });

    test(
      'el historial propio envía el cursor y conserva el siguiente',
      () async {
        final api = ApiFalsa()
          ..siempre(
            () => respuestaJson(200, {
              'elementos': [
                {
                  'referencia': 'INC-7K3M9-Q2TXA',
                  'categoria': {'id': 'robo', 'nombre': 'Robo'},
                  'estado': 'REGISTRADO',
                  'recibidoEn': '2026-11-26T15:00:01.123Z',
                  'territorio': {
                    'estado': 'pendiente',
                    'motivo': 'sin_cartografia',
                  },
                },
              ],
              'siguiente': 'abc',
            }),
          );
        final r = await api.incidentes.misIncidentes('tok', cursor: 'xyz');
        expect(api.solicitudes.single.consulta, 'cursor=xyz');
        final pagina = (r as ConsultaObtenida<PaginaHistorial>).valor;
        expect(pagina.siguiente, 'abc');
        expect(pagina.elementos.single.territorio, isA<TerritorioPendiente>());
        api.siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
        expect(
          await api.incidentes.misIncidentes('tok'),
          isA<ConsultaSesionInvalida<PaginaHistorial>>(),
        );
      },
    );
  });

  group('consultas guardadas en el almacén seguro', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    test('guardar, listar y olvidar; el más reciente primero y sin duplicar referencias', () async {
      final almacen = ConsultasGuardadasSeguras();
      final a = ConsultaGuardada(
        referencia: 'INC-AAAAA-AAAAA',
        codigo: 'AAAA-BBBB-CCCC-DDDD',
        guardadaEn: DateTime.utc(2026, 11, 26),
      );
      final b = ConsultaGuardada(
        referencia: 'INC-BBBBB-BBBBB',
        codigo: 'EEEE-FFFF-GGGG-HHHH',
        guardadaEn: DateTime.utc(2026, 11, 26, 1),
      );
      await almacen.guardar(a);
      await almacen.guardar(b);
      await almacen.guardar(
        ConsultaGuardada(
          referencia: a.referencia,
          codigo: 'NUEV-OCOD-IGOX-XXXX',
          guardadaEn: DateTime.utc(2026, 11, 26, 2),
        ),
      );
      final lista = await almacen.listar();
      expect(lista.map((c) => c.referencia), [a.referencia, b.referencia]);
      expect(lista.first.codigo, 'NUEV-OCOD-IGOX-XXXX');
      await almacen.olvidar(a.referencia);
      expect((await almacen.listar()).map((c) => c.referencia), [b.referencia]);
      await almacen.olvidar(b.referencia);
      expect(await almacen.listar(), isEmpty);
      expect(
        await const FlutterSecureStorage().read(
          key: ConsultasGuardadasSeguras.clave,
        ),
        isNull,
      );
    });
  });
}
