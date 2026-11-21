import 'dart:async';

import 'package:ayni_safe/aplicacion/perfil_controlador.dart';
import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/aplicacion/validacion.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/contenido_repositorio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

const String _token = tokenSesionPrueba;

Future<(ApiFalsa, ServidorPerfil, AlmacenamientoEnMemoria, SesionControlador, PerfilControlador)> montarPerfil() async {
  final api = ApiFalsa();
  final servidor = ServidorPerfil();
  api.manejador = servidor.responder;
  final almacen = AlmacenamientoEnMemoria(
    SesionGuardada(token: _token, expiresAt: ahoraFijo.add(const Duration(hours: 10))),
  );
  final sesion = crearSesion(api, almacen);
  await sesion.restaurar();
  final perfil = PerfilControlador(
    repositorio: api.perfil,
    obtenerToken: () => sesion.token,
    cuandoSesionInvalida: sesion.alSesionInvalida,
    cuandoCambiaUsuario: sesion.actualizarUsuario,
  );
  addTearDown(perfil.dispose);
  addTearDown(sesion.dispose);
  return (api, servidor, almacen, sesion, perfil);
}

void main() {
  group('PerfilControlador (5.1)', () {
    test('carga el perfil propio con el Bearer de la sesión y sin parámetros', () async {
      final (api, _, _, _, perfil) = await montarPerfil();
      await perfil.cargar();
      expect(perfil.carga, CargaPerfil.listo);
      expect(perfil.perfil?.correo, 'rosa@ejemplo.com');
      final get = api.solicitudes.where((s) => s.ruta.endsWith('/perfil')).single;
      expect(get.cabeceras['Authorization'], 'Bearer $_token');
      expect(get.consulta, isEmpty);
    });

    test('guardar: solo envía nombre, telefono y compartirTelefono (nunca el correo) y actualiza la sesión', () async {
      final (api, servidor, _, sesion, perfil) = await montarPerfil();
      await perfil.cargar();
      final ok = await perfil.guardar(nombre: '  Rosa Nueva ', telefono: '+51 987-654-321', compartirTelefono: true);
      expect(ok, isTrue);
      final patch = api.solicitudes.singleWhere((s) => s.metodo == 'PATCH');
      expect(patch.json!.keys.toSet(), {'nombre', 'telefono', 'compartirTelefono'});
      expect(patch.json, {'nombre': 'Rosa Nueva', 'telefono': '+51987654321', 'compartirTelefono': true});
      expect(patch.cabeceras['Authorization'], 'Bearer $_token');
      expect(servidor.perfil['nombre'], 'Rosa Nueva');
      expect(perfil.perfil?.telefono, '+51987654321');
      expect(perfil.perfil?.compartirTelefono, isTrue);
      expect((sesion.estado as SesionAutenticada).usuario.nombre, 'Rosa Nueva');
    });

    test('teléfono vacío se envía como null y la autorización puede revocarse sin borrarlo', () async {
      final (api, servidor, _, _, perfil) = await montarPerfil();
      servidor.perfil = perfilJson(telefono: '987654321', compartir: true);
      await perfil.cargar();
      expect(await perfil.guardar(nombre: 'Rosa Quispe', telefono: '987654321', compartirTelefono: false), isTrue);
      expect(perfil.perfil?.telefono, '987654321');
      expect(perfil.perfil?.compartirTelefono, isFalse);
      expect(await perfil.guardar(nombre: 'Rosa Quispe', telefono: '   ', compartirTelefono: false), isTrue);
      expect(api.solicitudes.last.json!['telefono'], isNull);
      expect(perfil.perfil?.telefono, isNull);
    });

    test('validación local: nombre vacío, teléfono inválido y autorización sin teléfono no hacen solicitud', () async {
      final (api, _, _, _, perfil) = await montarPerfil();
      await perfil.cargar();
      final antes = api.solicitudes.length;
      expect(await perfil.guardar(nombre: '  ', telefono: '123', compartirTelefono: false), isFalse);
      expect(perfil.errores.keys, containsAll(['nombre', 'telefono']));
      expect(await perfil.guardar(nombre: 'Rosa', telefono: '', compartirTelefono: true), isFalse);
      expect(perfil.errores['compartirTelefono'], isNotNull);
      expect(api.solicitudes.length, antes);
    });

    test('400 del servidor: errores por campo, nada se da por guardado y el perfil queda igual', () async {
      final (api, _, _, _, perfil) = await montarPerfil();
      await perfil.cargar();
      api.siempre(() => respuestaJson(400, errorJson('VALIDATION_ERROR', campos: {'telefono': 'Ingresa un teléfono válido.'})));
      expect(await perfil.guardar(nombre: 'Otra', telefono: '987654321', compartirTelefono: false), isFalse);
      expect(perfil.errores['telefono'], 'Ingresa un teléfono válido.');
      expect(perfil.perfil?.nombre, 'Rosa Quispe');
      expect(perfil.guardando, isFalse);
    });

    test('sin conexión y 503: informa sin afirmar que se guardó', () async {
      final (api, _, _, _, perfil) = await montarPerfil();
      await perfil.cargar();
      api.sinRed();
      expect(await perfil.guardar(nombre: 'Otra', telefono: '', compartirTelefono: false), isFalse);
      expect(perfil.avisoEdicion?.texto, contains('No hay conexión'));
      expect(perfil.avisoEdicion?.texto, contains('No se guardó'));
      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      expect(await perfil.guardar(nombre: 'Otra', telefono: '', compartirTelefono: false), isFalse);
      expect(perfil.avisoEdicion?.texto, contains('no está disponible'));
      expect(perfil.perfil?.nombre, 'Rosa Quispe');
    });

    test('un solo envío en curso: pulsaciones repetidas emiten una sola solicitud', () async {
      final (api, servidor, _, _, perfil) = await montarPerfil();
      await perfil.cargar();
      servidor.retenerPatch = Completer<void>();
      final primera = perfil.guardar(nombre: 'Otra', telefono: '', compartirTelefono: false);
      final segunda = perfil.guardar(nombre: 'Otra', telefono: '', compartirTelefono: false);
      await Future<void>.delayed(Duration.zero);
      expect(perfil.guardando, isTrue);
      servidor.retenerPatch!.complete();
      expect(await primera, isTrue);
      expect(await segunda, isFalse);
      expect(api.contar('PATCH', '/perfil'), 1);
    });

    test('401 al cargar o guardar: se descarta el token y se vuelve al acceso', () async {
      final (api, _, almacen, sesion, perfil) = await montarPerfil();
      await perfil.cargar();
      api.siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
      expect(await perfil.guardar(nombre: 'Otra', telefono: '', compartirTelefono: false), isFalse);
      expect(sesion.estado, isA<SesionAnonima>());
      expect(almacen.guardada, isNull);
      expect((sesion.estado as SesionAnonima).aviso?.texto, contains('Tu sesión terminó'));

      final (api2, _, almacen2, sesion2, perfil2) = await montarPerfil();
      api2.siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
      await perfil2.cargar();
      expect(sesion2.estado, isA<SesionAnonima>());
      expect(almacen2.guardada, isNull);
    });

    test('carga con falla: sin perfil previo es error con reintento; con perfil previo lo conserva', () async {
      final (api, _, _, _, perfil) = await montarPerfil();
      api.sinRed();
      await perfil.cargar();
      expect(perfil.carga, CargaPerfil.error);
      expect(perfil.perfil, isNull);
      expect(perfil.avisoCarga, isNotNull);
      api.manejador = ServidorPerfil().responder;
      await perfil.cargar();
      expect(perfil.carga, CargaPerfil.listo);
      api.sinRed();
      await perfil.cargar();
      expect(perfil.perfil, isNotNull);
      expect(perfil.carga, CargaPerfil.listo);
      expect(perfil.avisoCarga, isNotNull);
    });

    test('no guarda nada en disco: el almacén de sesión solo conserva el token', () async {
      final (_, _, almacen, _, perfil) = await montarPerfil();
      await perfil.cargar();
      await perfil.guardar(nombre: 'Rosa Quispe', telefono: '987654321', compartirTelefono: true);
      expect(almacen.guardados, 0);
      expect(almacen.guardada?.token, _token);
    });
  });

  group('validación de teléfono (equivale a la API)', () {
    test('7 a 15 dígitos, separadores y + inicial', () {
      expect(telefonoNormalizado('1234567'), '1234567');
      expect(telefonoNormalizado('+51 987-654-321'), '+51987654321');
      expect(telefonoNormalizado('(064) 123 456'), '064123456');
      expect(telefonoNormalizado(''), '');
      expect(telefonoNormalizado('123456'), isNull);
      expect(telefonoNormalizado('1234567890123456'), isNull);
      expect(telefonoNormalizado('98765432a'), isNull);
      expect(telefonoNormalizado('+'), isNull);
    });
  });

  group('ContenidoRepositorio (5.2)', () {
    test('contenido completo: secciones aprobadas y contactos vacíos; sin Bearer', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(200, contenidoJson()));
      final r = await api.contenido.obtener();
      final c = (r as ContenidoDisponible).contenido;
      expect(c.appAprobada && c.desarrolladoresAprobados && c.privacidadAprobada, isTrue);
      expect(c.desarrolladores.single.nombre, 'Dev de Prueba');
      expect(c.contactosAprobados, isFalse);
      expect(c.contactos, isEmpty);
      expect(api.solicitudes.single.cabeceras.containsKey('Authorization'), isFalse);
      expect(api.solicitudes.single.ruta, endsWith('/publico/contenido'));
    });

    test('contactos aprobados con todos sus campos', () async {
      final api = ApiFalsa()
        ..siempre(
          () => respuestaJson(
            200,
            contenidoJson(
              contactosAprobados: true,
              contactos: [
                {'institucion': 'Institución de prueba', 'numero': '123', 'cobertura': 'Zona de prueba', 'fuente': 'Fuente de prueba', 'verificadoAt': '2026-11-01'},
              ],
            ),
          ),
        );
      final c = ((await api.contenido.obtener()) as ContenidoDisponible).contenido;
      expect(c.contactosAprobados, isTrue);
      expect(c.contactos.single.numero, '123');
    });

    test('sección pendiente: llega sin texto', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(200, contenidoJson(privacidadAprobada: false)));
      final c = ((await api.contenido.obtener()) as ContenidoDisponible).contenido;
      expect(c.privacidadAprobada, isFalse);
      expect(c.privacidad, isEmpty);
    });

    test('red, 503 y cuerpo inválido sin contenido previo: error, nunca contenido supuesto', () async {
      final api = ApiFalsa()..sinRed();
      expect(await api.contenido.obtener(), isA<ContenidoSinConexion>());
      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      expect(await api.contenido.obtener(), isA<ContenidoNoDisponible>());
      api.siempre(() => respuestaJson(200, {'version': 'x'}));
      expect(await api.contenido.obtener(), isA<ContenidoNoDisponible>());
    });

    test('con una versión previa y una falla: la muestra como desactualizada', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(200, contenidoJson()));
      await api.contenido.obtener();
      api.sinRed();
      final r = await api.contenido.obtener();
      expect(r, isA<ContenidoDisponible>());
      expect((r as ContenidoDisponible).desactualizado, isTrue);
    });

    test('llamadas simultáneas comparten una sola solicitud', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(200, contenidoJson()));
      await Future.wait([api.contenido.obtener(), api.contenido.obtener(), api.contenido.obtener()]);
      expect(api.solicitudes, hasLength(1));
    });
  });
}
