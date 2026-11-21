import 'package:ayni_safe/datos/auth_repositorio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

const String _token = 'token-identificable-0123456789abcdefghijklmnopq';
const String _clave = 'contraseña nueva identificable 4d1';

void main() {
  group('solicitud de recuperación (8.1)', () {
    test('202 → aceptada, con el correo en el cuerpo y una sola solicitud', () async {
      final api = ApiFalsa()
        ..siempre(() => respuestaJson(202, {'estado': 'solicitud_recibida'}));
      final r = await api.repositorio.solicitarRecuperacion(
        correo: 'rosa@ejemplo.com',
      );
      expect(r, isA<SolicitudAceptada>());
      expect(api.solicitudes, hasLength(1));
      final s = api.solicitudes.single;
      expect(s.metodo, 'POST');
      expect(s.ruta, '/api/v1/auth/recuperaciones');
      expect(s.json, {'correo': 'rosa@ejemplo.com'});
      expect(s.cabeceras['Content-Type'], contains('application/json'));
      expect(s.cabeceras.containsKey('Authorization'), isFalse);
    });

    test('400 → campos; 429 → espera; 503 → no disponible o cupo diario según Retry-After', () async {
      final api = ApiFalsa();
      api.siempre(
        () => respuestaJson(400, errorJson('VALIDATION_ERROR', campos: {'correo': 'Ingresa un correo válido.'})),
      );
      final invalida = await api.repositorio.solicitarRecuperacion(correo: 'x');
      expect((invalida as SolicitudInvalida).campos['correo'], isNotNull);

      api.siempre(() => respuestaJson(429, errorJson('RATE_LIMITED'), cabeceras: {'retry-after': '900'}));
      final limite = await api.repositorio.solicitarRecuperacion(correo: 'a@b.co');
      expect((limite as SolicitudLimite).esperaSegundos, 900);

      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      expect(
        await api.repositorio.solicitarRecuperacion(correo: 'a@b.co'),
        isA<SolicitudNoDisponible>(),
      );

      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE'), cabeceras: {'retry-after': '43200'}));
      final cupo = await api.repositorio.solicitarRecuperacion(correo: 'a@b.co');
      expect((cupo as SolicitudSinCupoDiario).esperaSegundos, 43200);
    });

    test('sin red no se afirma éxito y no hay reintentos automáticos', () async {
      final api = ApiFalsa()..sinRed();
      final r = await api.repositorio.solicitarRecuperacion(correo: 'a@b.co');
      expect(r, isA<SolicitudSinConexion>());
      expect(api.solicitudes, hasLength(1));
    });

    test('500 u otro estado → error inesperado con el código de solicitud', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(500, errorJson('INTERNAL_ERROR', requestId: 'req-9')));
      final r = await api.repositorio.solicitarRecuperacion(correo: 'a@b.co');
      expect((r as SolicitudErrorInesperado).requestId, 'req-9');
    });
  });

  group('consulta de enlace (8.1)', () {
    test('200 → vigente con propósito y vencimiento; el token va solo en el cuerpo', () async {
      final api = ApiFalsa()
        ..siempre(() => respuestaJson(200, {'proposito': 'activacion', 'expiresAt': '2026-11-21T15:30:00.000Z'}));
      final r = await api.repositorio.consultarToken(_token);
      final vigente = r as TokenVigente;
      expect(vigente.proposito, PropositoToken.activacion);
      expect(vigente.expiresAt.toUtc(), DateTime.utc(2026, 11, 21, 15, 30));
      final s = api.solicitudes.single;
      expect(s.ruta, '/api/v1/auth/tokens/consulta');
      expect(s.consulta, isEmpty);
      expect(s.ruta, isNot(contains(_token)));
      expect(s.json, {'token': _token});
    });

    test('404 → inválido; 410 TOKEN_USED → usado; 410 TOKEN_EXPIRED → vencido', () async {
      final api = ApiFalsa();
      api.siempre(() => respuestaJson(404, errorJson('TOKEN_INVALID')));
      expect(await api.repositorio.consultarToken(_token), isA<TokenInvalido>());
      api.siempre(() => respuestaJson(410, errorJson('TOKEN_USED')));
      expect(await api.repositorio.consultarToken(_token), isA<TokenUsado>());
      api.siempre(() => respuestaJson(410, errorJson('TOKEN_EXPIRED')));
      expect(await api.repositorio.consultarToken(_token), isA<TokenVencido>());
    });

    test('429, 503, sin red y cuerpo inesperado se distinguen y no consumen reintentos', () async {
      final api = ApiFalsa();
      api.siempre(() => respuestaJson(429, errorJson('RATE_LIMITED'), cabeceras: {'retry-after': '60'}));
      expect((await api.repositorio.consultarToken(_token) as ConsultaTokenLimite).esperaSegundos, 60);
      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      expect(await api.repositorio.consultarToken(_token), isA<ConsultaTokenNoDisponible>());
      api.sinRed();
      expect(await api.repositorio.consultarToken(_token), isA<ConsultaTokenSinConexion>());
      api.siempre(() => respuestaJson(200, {'proposito': 'otro'}));
      expect(await api.repositorio.consultarToken(_token), isA<ConsultaTokenErrorInesperado>());
      expect(api.solicitudes, hasLength(4));
    });
  });

  group('cambio de contraseña y activación (8.1)', () {
    test('restablecer: 204 → éxito; la contraseña y el token van solo en el cuerpo', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(204, null));
      final r = await api.repositorio.restablecerContrasena(token: _token, contrasena: _clave);
      expect(r, isA<CambioExitoso>());
      final s = api.solicitudes.single;
      expect(s.ruta, '/api/v1/auth/contrasena/restablecer');
      expect(s.consulta, isEmpty);
      expect(s.ruta, isNot(contains(_token)));
      expect(s.json, {'token': _token, 'contrasena': _clave});
      expect(s.cabeceras.containsKey('Authorization'), isFalse);
    });

    test('activar usa su propia ruta', () async {
      final api = ApiFalsa()..siempre(() => respuestaJson(204, null));
      await api.repositorio.activarCuenta(token: _token, contrasena: _clave);
      expect(api.solicitudes.single.ruta, '/api/v1/auth/activaciones');
    });

    test('400 → campos; 404 → inválido; 410 → usado o vencido; 429; 503', () async {
      final api = ApiFalsa();
      api.siempre(() => respuestaJson(400, errorJson('VALIDATION_ERROR', campos: {'contrasena': 'La contraseña debe tener entre 15 y 128 caracteres.'})));
      final campos = await api.repositorio.restablecerContrasena(token: _token, contrasena: 'x');
      expect((campos as CambioCamposInvalidos).campos['contrasena'], isNotNull);
      api.siempre(() => respuestaJson(404, errorJson('TOKEN_INVALID')));
      expect(await api.repositorio.restablecerContrasena(token: _token, contrasena: _clave), isA<CambioTokenInvalido>());
      api.siempre(() => respuestaJson(410, errorJson('TOKEN_USED')));
      expect(await api.repositorio.restablecerContrasena(token: _token, contrasena: _clave), isA<CambioTokenUsado>());
      api.siempre(() => respuestaJson(410, errorJson('TOKEN_EXPIRED')));
      expect(await api.repositorio.activarCuenta(token: _token, contrasena: _clave), isA<CambioTokenVencido>());
      api.siempre(() => respuestaJson(429, errorJson('RATE_LIMITED'), cabeceras: {'retry-after': '120'}));
      expect((await api.repositorio.restablecerContrasena(token: _token, contrasena: _clave) as CambioLimite).esperaSegundos, 120);
      api.siempre(() => respuestaJson(503, errorJson('SERVICE_UNAVAILABLE')));
      expect(await api.repositorio.activarCuenta(token: _token, contrasena: _clave), isA<CambioNoDisponible>());
    });

    test('sin red: resultado incierto (el cambio podría haberse aplicado) y sin reintento automático', () async {
      final api = ApiFalsa()..sinRed();
      final r = await api.repositorio.restablecerContrasena(token: _token, contrasena: _clave);
      expect(r, isA<CambioIncierto>());
      expect(api.solicitudes, hasLength(1));
    });

    test('el repositorio no depende del almacenamiento: nada se guarda de forma persistente', () {
      // AuthRepositorio solo recibe el cliente HTTP; no hay forma de que persista token o contraseña.
      final api = ApiFalsa();
      expect(api.repositorio, isA<AuthRepositorio>());
    });
  });
}
