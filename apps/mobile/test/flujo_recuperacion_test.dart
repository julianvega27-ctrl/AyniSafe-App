import 'package:ayni_safe/presentacion/pantallas/acceso_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

const String _token = 'token-identificable-0123456789abcdefghijklmnopq';
const String _nueva = 'contraseña nueva identificable 4d1';

void main() {
  testWidgets('recorrido completo: Olvidé mi contraseña → Tengo un código → nueva contraseña → acceso con aviso', (tester) async {
    final api = ApiFalsa();
    api.manejador = (req) async {
      final ruta = req.url.path;
      if (ruta.endsWith('/auth/recuperaciones')) return respuestaJson(202, {'estado': 'solicitud_recibida'});
      if (ruta.endsWith('/auth/tokens/consulta')) {
        return respuestaJson(200, {'proposito': 'recuperacion', 'expiresAt': '2026-11-21T15:30:00.000Z'});
      }
      if (ruta.endsWith('/auth/contrasena/restablecer')) return respuestaJson(204, null);
      return respuestaJson(500, null);
    };
    final sesion = crearSesion(api, AlmacenamientoEnMemoria());
    await sesion.restaurar();
    await tester.pumpWidget(appDePrueba(api, sesion));
    await tester.pumpAndSettle();

    await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
    await tester.tap(find.widgetWithText(TextButton, 'Olvidé mi contraseña'));
    await tester.pumpAndSettle();
    expect(textoDe(tester, 'Correo'), 'rosa@ejemplo.com');

    await tester.tap(find.widgetWithText(FilledButton, 'Enviar enlace'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Si el correo corresponde a una cuenta'), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, 'Tengo un código'));
    await tester.pumpAndSettle();
    await escribirEn(tester, 'Código', _token);
    await tester.tap(find.widgetWithText(FilledButton, 'Continuar'));
    await tester.pumpAndSettle();

    expect(find.text('Nueva contraseña'), findsOneWidget);
    await escribirEn(tester, 'Contraseña nueva', _nueva);
    await tester.tap(find.widgetWithText(FilledButton, 'Cambiar contraseña'));
    await tester.pumpAndSettle();

    // De vuelta en el acceso, con aviso y sin iniciar sesión.
    expect(find.byType(AccesoPantalla), findsOneWidget);
    expect(find.textContaining('Cambiaste tu contraseña'), findsOneWidget);
    expect(textoDe(tester, 'Contraseña'), isEmpty);
    expect(api.contar('POST', '/auth/ciudadanos/sesiones'), 0);
    expect(api.contar('POST', '/auth/recuperaciones'), 1);
    expect(api.contar('POST', '/auth/contrasena/restablecer'), 1);
    // Ninguna solicitud lleva el token en la URL ni la contraseña fuera del cuerpo del cambio.
    for (final s in api.solicitudes) {
      expect(s.consulta, isEmpty);
      expect(s.ruta, isNot(contains(_token)));
    }
  });

  testWidgets('enlace vencido: «Solicitar otro enlace» abre la solicitud sin pedir antes una contraseña', (tester) async {
    final api = ApiFalsa();
    api.manejador = (req) async => req.url.path.endsWith('/auth/tokens/consulta')
        ? respuestaJson(410, errorJson('TOKEN_EXPIRED'))
        : respuestaJson(202, {'estado': 'solicitud_recibida'});
    final sesion = crearSesion(api, AlmacenamientoEnMemoria());
    await sesion.restaurar();
    await tester.pumpWidget(appDePrueba(api, sesion));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(TextButton, 'Olvidé mi contraseña'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar enlace'));
    await tester.pumpAndSettle();
    // El correo vacío no se envía; se escribe uno válido.
    await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar enlace'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Tengo un código'));
    await tester.pumpAndSettle();
    await escribirEn(tester, 'Código', _token);
    await tester.tap(find.widgetWithText(FilledButton, 'Continuar'));
    await tester.pumpAndSettle();

    expect(find.textContaining('venció'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.widgetWithText(FilledButton, 'Solicitar otro enlace'));
    await tester.pumpAndSettle();
    expect(find.text('Recuperar contraseña'), findsOneWidget);
  });
}
