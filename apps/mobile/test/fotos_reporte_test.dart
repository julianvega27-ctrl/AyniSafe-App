import 'dart:convert';
import 'dart:typed_data';

import 'package:ayni_safe/aplicacion/reporte_controlador.dart';
import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/datos/incidentes_repositorio.dart';
import 'package:ayni_safe/datos/selector_fotos.dart';
import 'package:ayni_safe/datos/ubicacion.dart';
import 'package:ayni_safe/presentacion/pantallas/reporte_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

/// PNG 1×1 válido: se puede dibujar en las pruebas de widgets.
final Uint8List png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

/// Selector falso: devuelve en orden los resultados configurados.
class SelectorFalso implements SelectorFotos {
  SelectorFalso([List<SeleccionFoto>? resultados]) : resultados = resultados ?? [];
  final List<SeleccionFoto> resultados;
  final List<OrigenFoto> pedidos = [];

  @override
  Future<SeleccionFoto> elegir(OrigenFoto origen) async {
    pedidos.add(origen);
    return resultados.isEmpty ? FotoElegida(png) : resultados.removeAt(0);
  }
}

class UbicacionFija implements UbicacionPuerto {
  @override
  Future<ResultadoUbicacion> obtener() async =>
      const UbicacionObtenida(PuntoUbicado(latitud: -13.16, longitud: -74.22, precisionM: 8));
}

final DateTime ahora = DateTime.utc(2026, 11, 26, 15);

Map<String, Object?> comprobante({bool invitado = false, DateTime? vence}) => {
  'referencia': 'INC-7K3M9-Q2TXA',
  'estado': 'REGISTRADO',
  'recibidoEn': '2026-11-26T15:00:01.123Z',
  'modalidad': invitado ? 'invitado' : 'cuenta',
  'territorio': {
    'estado': 'resuelto',
    'distrito': {'id': 'DIS-01', 'nombre': 'Ayacucho'},
  },
  if (invitado) 'codigoSeguimiento': '7K3M-9Q2T-XAB4-CD5E',
  if (invitado)
    'permisoEvidencias': {
      'valor': 'q3Vb8kQ0mZt1Xx9JcN2pLr4sW6yUe7Ai5Hd0Gf3Kj1M',
      'venceEn': (vence ?? ahora.add(const Duration(hours: 24))).toIso8601String(),
    },
};

Map<String, Object?> evidencia(int n) => {
  'id': '00000000-0000-4000-8000-00000000000$n',
  'tipo': 'image/png',
  'bytes': 70,
  'adjuntadaEn': '2026-11-26T15:00:05.000Z',
};

class Escenario {
  Escenario({this.token, List<SeleccionFoto>? seleccion, DateTime? vence}) {
    selector = SelectorFalso(seleccion);
    api.manejador = (req) async {
      final ruta = req.url.path;
      if (ruta.endsWith('/publico/categorias')) {
        return respuestaJson(200, {
          'categorias': [
            {'id': 'robo', 'nombre': 'Robo', 'orden': 1, 'activa': true},
          ],
        });
      }
      if (ruta.endsWith('/evidencias')) return responderFoto(req);
      return respuestaJson(201, comprobante(invitado: token == null, vence: vence));
    };
    controlador = ReporteControlador(
      repositorio: api.incidentes,
      ubicacion: UbicacionFija(),
      guardadas: ConsultasGuardadasEnMemoria(),
      obtenerToken: () => token,
      nuevaClave: () => 'clave-${++claves}',
      ahora: () => ahora,
      selector: selector,
      permisos: permisos,
    );
  }

  final String? token;
  final ApiFalsa api = ApiFalsa();
  late final SelectorFalso selector;
  final PermisosCargaEnMemoria permisos = PermisosCargaEnMemoria();
  late final ReporteControlador controlador;
  int claves = 0;
  int fotosSubidas = 0;
  Future<http.Response> Function(http.Request) responderFoto = (_) async => respuestaJson(201, evidencia(1));

  List<SolicitudRegistrada> get cargas => api.solicitudes.where((s) => s.ruta.endsWith('/evidencias')).toList();

  /// Completa el formulario mínimo válido.
  Future<void> completar() async {
    await controlador.cargarCategorias();
    controlador.elegirCategoria('robo');
    controlador.cambiarDescripcion('Me robaron el celular');
    await controlador.usarMiUbicacion();
    if (token == null) controlador.cambiarTelefono('987654321');
  }

  Widget widget() => conTema(
    Scaffold(
      body: ReportePantalla(
        controlador: controlador,
        cargarContornos: () async => const [],
        mostrarTeselas: false,
      ),
    ),
  );
}

/// Cabecera sin distinguir mayúsculas (la API falsa conserva el nombre tal como se envió).
String? cab(SolicitudRegistrada s, String nombre) {
  for (final e in s.cabeceras.entries) {
    if (e.key.toLowerCase() == nombre) return e.value;
  }
  return null;
}

void main() {
  group('sección de fotos en el formulario (11.1)', () {
    testWidgets('va después de la evaluación y antes del teléfono, vacía al abrir', (tester) async {
      final e = Escenario();
      await e.controlador.cargarCategorias();
      await tester.pumpWidget(e.widget());
      await tester.pumpAndSettle();
      final fotos = tester.getTopLeft(find.text('Fotos (opcional)')).dy;
      final telefono = tester.getTopLeft(find.text('Teléfono de contacto')).dy;
      final descripcion = tester.getTopLeft(find.text('Describe lo sucedido')).dy;
      expect(descripcion < fotos, isTrue);
      expect(fotos < telefono, isTrue);
      expect(find.text('Adjuntar foto opcional'), findsOneWidget);
      expect(e.controlador.fotos, isEmpty);
    });

    testWidgets('permiso de cámara denegado: explica y deja enviar sin fotos', (tester) async {
      final e = Escenario(token: 't', seleccion: [const SeleccionDenegada()]);
      await e.completar();
      await tester.pumpWidget(e.widget());
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('adjuntarFoto')));
      await tester.tap(find.byKey(const Key('adjuntarFoto')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tomar foto'));
      await tester.pumpAndSettle();
      expect(find.textContaining('No diste permiso para usar la cámara'), findsOneWidget);
      await e.controlador.enviar();
      expect(e.controlador.estado, isA<EnvioListo>());
      expect(e.cargas, isEmpty);
    });

    testWidgets('tres fotos deshabilitan la acción y se anuncian como Foto N de M', (tester) async {
      final e = Escenario(token: 't');
      await e.controlador.cargarCategorias();
      for (var i = 0; i < 3; i++) {
        await e.controlador.agregarFoto(OrigenFoto.galeria);
      }
      await tester.pumpWidget(e.widget());
      await tester.pumpAndSettle();
      final boton = tester.widget<OutlinedButton>(
        find.ancestor(of: find.text('Ya elegiste 3 fotos'), matching: find.byWidgetPredicate((w) => w is OutlinedButton)),
      );
      expect(boton.onPressed, isNull);
      final semantica = tester.ensureSemantics();
      expect(find.bySemanticsLabel('Foto 1 de 3'), findsOneWidget);
      expect(find.bySemanticsLabel('Foto 3 de 3'), findsOneWidget);
      expect(find.bySemanticsLabel('Quitar foto 2'), findsOneWidget);
      semantica.dispose();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      expect(e.controlador.fotos, hasLength(3));
    });

    testWidgets('una foto de más de 5 MB se rechaza localmente sin perder el formulario', (tester) async {
      final grande = Uint8List(5 * 1024 * 1024 + 1)..setRange(0, png.length, png);
      final e = Escenario(token: 't', seleccion: [FotoElegida(grande)]);
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await tester.pumpWidget(e.widget());
      await tester.pumpAndSettle();
      expect(find.textContaining('supera 5 MB'), findsOneWidget);
      expect(e.controlador.fotos, isEmpty);
      expect(e.controlador.descripcion, 'Me robaron el celular');
    });

    test('un archivo que no es JPEG, PNG ni WebP se rechaza localmente', () async {
      final e = Escenario(token: 't', seleccion: [FotoElegida(Uint8List.fromList(utf8.encode('%PDF-1.4 falso')))]);
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      expect(e.controlador.fotos, isEmpty);
      expect(e.controlador.avisoFotos, contains('no es JPEG'));
    });

    test('quitar una foto antes de enviar', () async {
      final e = Escenario(token: 't');
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.agregarFoto(OrigenFoto.camara);
      e.controlador.quitarFoto(0);
      expect(e.controlador.fotos, hasLength(1));
      expect(e.selector.pedidos, [OrigenFoto.galeria, OrigenFoto.camara]);
    });
  });

  group('cola de cargas tras el comprobante (11.2)', () {
    test('con cuenta: tres fotos adjuntadas, una clave por foto y sesión Bearer', () async {
      final e = Escenario(token: 'token-ciudadano');
      await e.completar();
      for (var i = 0; i < 3; i++) {
        await e.controlador.agregarFoto(OrigenFoto.galeria);
      }
      await e.controlador.enviar();
      expect(e.controlador.estado, isA<EnvioListo>());
      expect(e.controlador.fotos.map((f) => f.estado), everyElement(EstadoFoto.adjuntada));
      expect(e.cargas, hasLength(3));
      expect(e.cargas.map((s) => cab(s, 'idempotency-key')).toSet(), hasLength(3));
      for (final s in e.cargas) {
        expect(s.ruta, endsWith('/incidentes/INC-7K3M9-Q2TXA/evidencias'));
        expect(cab(s, 'authorization'), 'Bearer token-ciudadano');
        expect((cab(s, 'x-permiso-evidencias') != null), isFalse);
        expect(cab(s, 'content-type'), startsWith('multipart/form-data'));
        expect(s.cuerpo, contains('name="foto"'));
      }
    });

    test('503: queda fallida y el reintento usa la misma clave; el comprobante se conserva', () async {
      final e = Escenario(token: 't');
      e.responderFoto = (_) async => respuestaJson(503, errorJson('EVIDENCE_STORAGE_UNAVAILABLE'));
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      final foto = e.controlador.fotos.single;
      expect(foto.estado, EstadoFoto.fallida);
      expect(foto.mensaje, contains('reintentar'));
      expect(e.controlador.estado, isA<EnvioListo>());
      e.responderFoto = (_) async => respuestaJson(200, evidencia(1));
      await e.controlador.reintentarFotos();
      expect(foto.estado, EstadoFoto.adjuntada);
      expect(e.cargas.map((s) => cab(s, 'idempotency-key')).toSet(), {foto.clave});
    });

    test('sin conexión: fallida y continuar sin ella la descarta', () async {
      final e = Escenario(token: 't');
      e.responderFoto = (_) async => throw http.ClientException('sin red');
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      expect(e.controlador.fotos.single.estado, EstadoFoto.fallida);
      await e.controlador.descartarFoto(0);
      expect(e.controlador.fotos, isEmpty);
      expect(e.controlador.estado, isA<EnvioListo>());
    });

    test('413 y 422 se rechazan sin reintento automático', () async {
      final e = Escenario(token: 't');
      var n = 0;
      e.responderFoto = (_) async => ++n == 1
          ? respuestaJson(413, errorJson('PAYLOAD_TOO_LARGE'))
          : respuestaJson(422, errorJson('INVALID_IMAGE'));
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      expect(e.controlador.fotos.map((f) => f.estado), [EstadoFoto.rechazada, EstadoFoto.rechazada]);
      expect(e.controlador.fotos[0].mensaje, contains('5 MB'));
      expect(e.controlador.fotos[1].mensaje, contains('JPEG'));
      await e.controlador.reintentarFotos();
      expect(e.cargas, hasLength(2));
    });

    test('invitado: usa el permiso del comprobante, lo guarda mientras sube y lo borra al terminar', () async {
      final e = Escenario();
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      final carga = e.cargas.single;
      expect(cab(carga, 'x-permiso-evidencias'), 'q3Vb8kQ0mZt1Xx9JcN2pLr4sW6yUe7Ai5Hd0Gf3Kj1M');
      expect((cab(carga, 'authorization') != null), isFalse);
      expect(e.controlador.fotos.single.estado, EstadoFoto.adjuntada);
      expect(e.permisos.permisos, isEmpty);
    });

    test('invitado con una foto fallida conserva el permiso hasta continuar sin ella', () async {
      final e = Escenario();
      e.responderFoto = (_) async => respuestaJson(503, errorJson('EVIDENCE_STORAGE_UNAVAILABLE'));
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      expect(e.permisos.permisos.keys, ['INC-7K3M9-Q2TXA']);
      await e.controlador.descartarFoto(0);
      expect(e.permisos.permisos, isEmpty);
    });

    test('invitado sin fotos no guarda el permiso', () async {
      final e = Escenario();
      await e.completar();
      await e.controlador.enviar();
      expect(e.permisos.permisos, isEmpty);
    });

    test('permiso vencido: fuera de plazo sin llamar a la API, y el comprobante se conserva', () async {
      final e = Escenario(vence: ahora.subtract(const Duration(minutes: 1)));
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      expect(e.cargas, isEmpty);
      expect(e.controlador.fotos.single.estado, EstadoFoto.noAdmitida);
      expect(e.controlador.estado, isA<EnvioListo>());
      expect(e.permisos.permisos, isEmpty);
    });

    test('404 del servidor: fuera de plazo', () async {
      final e = Escenario(token: 't');
      e.responderFoto = (_) async => respuestaJson(404, errorJson('NOT_FOUND'));
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      expect(e.controlador.fotos.single.estado, EstadoFoto.noAdmitida);
    });

    test('un nuevo reporte descarta las fotos en memoria', () async {
      final e = Escenario(token: 't');
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await e.controlador.enviar();
      e.controlador.reiniciar();
      expect(e.controlador.fotos, isEmpty);
    });

    testWidgets('el comprobante muestra el estado de cada foto con reintentar y continuar sin ella', (tester) async {
      final e = Escenario(token: 't');
      e.responderFoto = (_) async => respuestaJson(503, errorJson('EVIDENCE_STORAGE_UNAVAILABLE'));
      await e.completar();
      await e.controlador.agregarFoto(OrigenFoto.galeria);
      await tester.pumpWidget(e.widget());
      await tester.runAsync(e.controlador.enviar);
      await tester.pumpAndSettle();
      expect(find.text('Reporte registrado'), findsOneWidget);
      expect(find.text('Foto 1: No se adjuntó'), findsOneWidget);
      expect(find.text('Reintentar fotos'), findsOneWidget);
      expect(find.text('Continuar sin esta foto'), findsOneWidget);
    });
  });
}
