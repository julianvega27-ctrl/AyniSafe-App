import 'dart:async';

import 'package:ayni_safe/aplicacion/nueva_contrasena_controlador.dart';
import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/auth_repositorio.dart';
import 'package:ayni_safe/presentacion/pantallas/acceso_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/nueva_contrasena_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/tengo_codigo_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

const String _token = 'token-identificable-0123456789abcdefghijklmnopq';
const String _nueva = 'contraseña nueva identificable 4d1';

http.Response _vigente(String proposito) => respuestaJson(200, {
  'proposito': proposito,
  'expiresAt': '2026-11-21T15:30:00.000Z',
});

/// API falsa que responde por ruta: la consulta del enlace y el cambio de contraseña.
void _api(
  ApiFalsa api, {
  http.Response Function()? consulta,
  http.Response Function()? cambio,
}) {
  api.manejador = (req) async {
    if (req.url.path.endsWith('/auth/tokens/consulta')) {
      return (consulta ?? () => _vigente('recuperacion'))();
    }
    return (cambio ?? () => respuestaJson(204, null))();
  };
}

Finder get botonCambiar => find.widgetWithText(FilledButton, 'Cambiar contraseña');

Future<({ApiFalsa api, List<PropositoToken> completados, List<int> otros})> abrir(
  WidgetTester tester, {
  http.Response Function()? consulta,
  http.Response Function()? cambio,
}) async {
  final api = ApiFalsa();
  _api(api, consulta: consulta, cambio: cambio);
  final completados = <PropositoToken>[];
  final otros = <int>[];
  await tester.pumpWidget(
    conTema(
      NuevaContrasenaPantalla(
        // Clave nueva: sin ella Flutter reutilizaría el estado de una pantalla anterior del mismo tipo.
        key: UniqueKey(),
        repositorio: api.repositorio,
        token: _token,
        ahora: () => ahoraFijo,
        alCompletar: completados.add,
        alSolicitarOtro: () => otros.add(1),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (api: api, completados: completados, otros: otros);
}

Future<void> escribirClave(WidgetTester tester, String clave) =>
    escribirEn(tester, 'Contraseña nueva', clave);

void main() {
  group('nueva contraseña por recuperación (8.3)', () {
    testWidgets('consulta el enlace al abrir (sin consumirlo) y muestra el formulario con ayuda y Mostrar/Ocultar', (tester) async {
      final r = await abrir(tester);
      expect(r.api.contar('POST', '/auth/tokens/consulta'), 1);
      expect(r.api.contar('POST', '/auth/contrasena/restablecer'), 0);
      expect(r.api.solicitudes.first.json, {'token': _token});
      expect(find.text('Nueva contraseña'), findsOneWidget);
      expect(find.text('Entre 15 y 128 caracteres. Puedes usar espacios.'), findsOneWidget);
      expect(botonCambiar, findsOneWidget);
      expect(tester.getSize(botonCambiar).height, greaterThanOrEqualTo(48));
      // Mostrar/Ocultar no altera el contenido.
      await escribirClave(tester, _nueva);
      expect(campoPorEtiqueta(tester, 'Contraseña nueva').obscureText, isTrue);
      await tester.tap(find.text('Mostrar'));
      await tester.pump();
      expect(campoPorEtiqueta(tester, 'Contraseña nueva').obscureText, isFalse);
      expect(textoDe(tester, 'Contraseña nueva'), _nueva);
      expect(find.text('Ocultar'), findsOneWidget);
    });

    testWidgets('límites de contraseña 14/15/128/129 con espacios y caracteres fuera del plano básico', (tester) async {
      final r = await abrir(tester);
      for (final invalida in ['a' * 14, 'a' * 129, '😀' * 14]) {
        await escribirClave(tester, invalida);
        await tester.tap(botonCambiar);
        await tester.pumpAndSettle();
        expect(find.text('La contraseña debe tener entre 15 y 128 caracteres.'), findsOneWidget);
      }
      expect(r.api.contar('POST', '/auth/contrasena/restablecer'), 0);
      expect(r.completados, isEmpty);

      await escribirClave(tester, '  ${'é' * 13}  '); // 17 puntos de código con espacios en los extremos
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(r.completados, [PropositoToken.recuperacion]);
      // La contraseña viaja exacta: sin recortar ni normalizar.
      expect(r.api.solicitudes.last.json!['contrasena'], '  ${'é' * 13}  ');
    });

    testWidgets('acepta exactamente 15 y 128 puntos de código', (tester) async {
      for (final valida in ['a' * 15, '😀' * 128]) {
        final r = await abrir(tester);
        await escribirClave(tester, valida);
        await tester.tap(botonCambiar);
        await tester.pumpAndSettle();
        expect(r.completados, [PropositoToken.recuperacion]);
      }
    });

    testWidgets('204 → completa con el propósito; no se envía nada más ni se inicia sesión', (tester) async {
      final r = await abrir(tester);
      await escribirClave(tester, _nueva);
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(r.completados, [PropositoToken.recuperacion]);
      expect(r.api.contar('POST', '/auth/contrasena/restablecer'), 1);
      expect(r.api.contar('POST', '/auth/ciudadanos/sesiones'), 0);
      final cambio = r.api.solicitudes.last;
      expect(cambio.ruta, '/api/v1/auth/contrasena/restablecer');
      expect(cambio.consulta, isEmpty);
      expect(cambio.json, {'token': _token, 'contrasena': _nueva});
    });

    testWidgets('un solo envío con doble toque y sin reintentos automáticos', (tester) async {
      final api = ApiFalsa();
      final espera = Completer<http.Response>();
      api.manejador = (req) => req.url.path.endsWith('/auth/tokens/consulta')
          ? Future.value(_vigente('recuperacion'))
          : espera.future;
      await tester.pumpWidget(conTema(NuevaContrasenaPantalla(
        repositorio: api.repositorio,
        token: _token,
        alCompletar: (_) {},
        ahora: () => ahoraFijo,
      )));
      await tester.pumpAndSettle();
      await escribirClave(tester, _nueva);
      await tester.tap(botonCambiar);
      await tester.pump();
      expect(find.text('Guardando…'), findsOneWidget);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.pump();
      expect(api.contar('POST', '/auth/contrasena/restablecer'), 1);
      espera.complete(respuestaJson(204, null));
      await tester.pumpAndSettle();
      expect(api.contar('POST', '/auth/contrasena/restablecer'), 1);
    });

    for (final caso in [
      (estado: 404, codigo: 'TOKEN_INVALID', texto: 'no es válido'),
      (estado: 410, codigo: 'TOKEN_USED', texto: 'ya se usó o fue reemplazado'),
      (estado: 410, codigo: 'TOKEN_EXPIRED', texto: 'venció'),
    ]) {
      testWidgets('enlace ${caso.codigo} al abrir: explica con texto e icono y ofrece solicitar otro, sin pedir contraseña', (tester) async {
        final r = await abrir(tester, consulta: () => respuestaJson(caso.estado, errorJson(caso.codigo)));
        expect(find.textContaining(caso.texto), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(find.textContaining('Contraseña nueva'), findsNothing);
        await tester.tap(find.widgetWithText(FilledButton, 'Solicitar otro enlace'));
        expect(r.otros, [1]);
        expect(r.api.contar('POST', '/auth/contrasena/restablecer'), 0);
      });
    }

    testWidgets('si el enlace se usa mientras se escribe, el cambio responde 410 y la pantalla pasa a «enlace usado»', (tester) async {
      final r = await abrir(tester, cambio: () => respuestaJson(410, errorJson('TOKEN_USED')));
      await escribirClave(tester, _nueva);
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(find.textContaining('ya se usó o fue reemplazado'), findsOneWidget);
      expect(r.completados, isEmpty);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('400 del servidor se muestra junto al campo', (tester) async {
      await abrir(tester, cambio: () => respuestaJson(400, errorJson('VALIDATION_ERROR', campos: {'contrasena': 'La contraseña debe tener entre 15 y 128 caracteres.'})));
      await escribirClave(tester, _nueva);
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(find.text('La contraseña debe tener entre 15 y 128 caracteres.'), findsOneWidget);
    });

    testWidgets('429, 503 y respuesta perdida se explican sin afirmar éxito ni reintentar', (tester) async {
      final r = await abrir(tester, cambio: () => respuestaJson(429, errorJson('RATE_LIMITED'), cabeceras: {'retry-after': '900'}));
      await escribirClave(tester, _nueva);
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(find.textContaining('Espera 15 minutos'), findsOneWidget);

      r.api.manejador = (req) async => req.url.path.endsWith('/auth/tokens/consulta')
          ? _vigente('recuperacion')
          : respuestaJson(503, errorJson('SERVICE_UNAVAILABLE'));
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(find.textContaining('no está disponible por ahora'), findsOneWidget);

      r.api.manejador = (req) async => req.url.path.endsWith('/auth/tokens/consulta')
          ? _vigente('recuperacion')
          : throw http.ClientException('sin red');
      await tester.tap(botonCambiar);
      await tester.pumpAndSettle();
      expect(find.textContaining('No pudimos confirmar el cambio'), findsOneWidget);
      expect(r.completados, isEmpty);
      expect(r.api.contar('POST', '/auth/contrasena/restablecer'), 3);
      // Se conserva lo escrito para poder reintentar a mano.
      expect(textoDe(tester, 'Contraseña nueva'), _nueva);
    });

    testWidgets('sin conexión al consultar: ofrece reintentar y luego continúa', (tester) async {
      final api = ApiFalsa()..sinRed();
      await tester.pumpWidget(conTema(NuevaContrasenaPantalla(
        repositorio: api.repositorio,
        token: _token,
        alCompletar: (_) {},
        ahora: () => ahoraFijo,
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('No pudimos conectar'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      _api(api);
      await tester.tap(find.widgetWithText(FilledButton, 'Reintentar'));
      await tester.pumpAndSettle();
      expect(botonCambiar, findsOneWidget);
      expect(api.contar('POST', '/auth/tokens/consulta'), 2);
    });

    testWidgets('texto al 200 % en un teléfono estrecho: sin desbordes y el botón sigue alcanzable', (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ApiFalsa();
      _api(api);
      await tester.pumpWidget(MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2), size: Size(360, 640)),
        child: conTema(NuevaContrasenaPantalla(repositorio: api.repositorio, token: _token, alCompletar: (_) {}, ahora: () => ahoraFijo)),
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(botonCambiar);
      expect(tester.takeException(), isNull);
    });
  });

  group('activación de cuenta invitada (8.4)', () {
    testWidgets('el servidor indica el propósito: título, botón y endpoint de activación, sin crear cuentas ni sesión', (tester) async {
      final r = await abrir(tester, consulta: () => _vigente('activacion'));
      expect(find.text('Activa tu cuenta'), findsOneWidget);
      expect(find.text('Elige la contraseña con la que ingresarás a AyniSafe.'), findsOneWidget);
      await escribirClave(tester, _nueva);
      await tester.tap(find.widgetWithText(FilledButton, 'Activar cuenta'));
      await tester.pumpAndSettle();
      expect(r.completados, [PropositoToken.activacion]);
      expect(r.api.solicitudes.last.ruta, '/api/v1/auth/activaciones');
      expect(r.api.contar('POST', '/auth/ciudadanos/sesiones'), 0);
      expect(r.api.contar('POST', '/auth/ciudadanos/registro'), 0);
      expect(r.api.contar('POST', '/auth/contrasena/restablecer'), 0);
    });
  });

  group('«Tengo un código» (8.3)', () {
    testWidgets('exige pegar el código y lo entrega sin espacios en los extremos', (tester) async {
      final recibidos = <String>[];
      await tester.pumpWidget(conTema(TengoCodigoPantalla(alContinuar: recibidos.add)));
      await tester.tap(find.widgetWithText(FilledButton, 'Continuar'));
      await tester.pump();
      expect(find.text('Pega el código del correo.'), findsOneWidget);
      expect(recibidos, isEmpty);
      await escribirEn(tester, 'Código', '   $_token \n');
      await tester.tap(find.widgetWithText(FilledButton, 'Continuar'));
      await tester.pump();
      expect(recibidos, [_token]);
    });
  });

  group('controlador: token y contraseña solo en memoria (8.3)', () {
    test('al salir se descarta el token: ya no se puede enviar nada', () async {
      final api = ApiFalsa();
      _api(api);
      final c = NuevaContrasenaControlador(api.repositorio, token: _token);
      await c.consultar();
      expect(c.fase, FaseNuevaContrasena.formulario);
      c.dispose();
      expect(await c.enviar(_nueva), isNull);
      expect(api.contar('POST', '/auth/contrasena/restablecer'), 0);
    });

    test('tras el éxito el token se descarta y un segundo envío no hace nada', () async {
      final api = ApiFalsa();
      _api(api);
      final c = NuevaContrasenaControlador(api.repositorio, token: _token);
      await c.consultar();
      expect(await c.enviar(_nueva), PropositoToken.recuperacion);
      expect(await c.enviar(_nueva), isNull);
      expect(api.contar('POST', '/auth/contrasena/restablecer'), 1);
    });
  });

  group('de vuelta al acceso y sesiones (8.3, 8.5)', () {
    test('al definir la contraseña se borra el token local y se vuelve al acceso con aviso, sin iniciar sesión', () async {
      final api = ApiFalsa();
      api.siempre(() => respuestaJson(200, {
        'usuario': usuarioJson(),
        'expiresAt': ahoraFijo.add(const Duration(hours: 5)).toIso8601String(),
      }));
      final almacen = AlmacenamientoEnMemoria(
        SesionGuardada(token: 'token-previo', expiresAt: ahoraFijo.add(const Duration(hours: 5))),
      );
      final sesion = crearSesion(api, almacen);
      await sesion.restaurar();
      expect(sesion.estado, isA<SesionAutenticada>());

      await sesion.alDefinirContrasena(PropositoToken.recuperacion);

      expect(sesion.estado, isA<SesionAnonima>());
      expect((sesion.estado as SesionAnonima).aviso!.texto, contains('Cambiaste tu contraseña'));
      expect((sesion.estado as SesionAnonima).aviso!.texto, contains('Cerramos tus otras sesiones'));
      expect(almacen.guardada, isNull);
      expect(almacen.borrados, 1);
      expect(api.contar('POST', '/auth/ciudadanos/sesiones'), 0);
    });

    test('si el borrado seguro falla no se afirma el cierre local: queda la limpieza pendiente', () async {
      final api = ApiFalsa();
      final almacen = AlmacenamientoEnMemoria()..fallarBorrar = true;
      final sesion = crearSesion(api, almacen);
      await sesion.alDefinirContrasena(PropositoToken.activacion);
      expect(sesion.estado, isA<SesionLimpiezaPendiente>());
    });

    test('segundo dispositivo: la sesión revocada devuelve 401, se borra el token y se pide iniciar sesión sin mostrar datos privados', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
      final almacen = AlmacenamientoEnMemoria(
        SesionGuardada(token: 'token-revocado', expiresAt: ahoraFijo.add(const Duration(hours: 5))),
      );
      final sesion = crearSesion(api, almacen);
      await sesion.restaurar();
      expect(sesion.estado, isA<SesionAnonima>());
      expect((sesion.estado as SesionAnonima).aviso!.texto, contains('Inicia sesión de nuevo'));
      expect(almacen.guardada, isNull);
      expect(api.contar('GET', '/auth/sesion'), 1);
    });

    testWidgets('el acceso muestra el aviso y deja la contraseña vacía', (tester) async {
      final api = ApiFalsa();
      final sesion = crearSesion(api, AlmacenamientoEnMemoria());
      await sesion.restaurar();
      await sesion.alDefinirContrasena(PropositoToken.recuperacion);
      await tester.pumpWidget(appDePrueba(api, sesion));
      await tester.pumpAndSettle();
      expect(find.byType(AccesoPantalla), findsOneWidget);
      expect(find.textContaining('Cambiaste tu contraseña'), findsOneWidget);
      expect(textoDe(tester, 'Contraseña'), isEmpty);
    });
  });
}
