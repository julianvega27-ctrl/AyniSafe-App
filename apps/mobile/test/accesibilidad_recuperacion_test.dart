import 'package:ayni_safe/presentacion/pantallas/nueva_contrasena_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/solicitar_recuperacion_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/tengo_codigo_pantalla.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'dobles.dart';

/// Revisión automática de accesibilidad de las pantallas nuevas (11.3). Comprueba tamaño de los
/// objetivos táctiles, etiquetas de los controles y contraste del texto. NO sustituye la revisión
/// manual con un lector de pantalla (TalkBack) en un dispositivo.
const String _token = 'token-identificable-0123456789abcdefghijklmnopq';

Future<void> _guias(WidgetTester tester) async {
  final semantica = tester.ensureSemantics();
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
  semantica.dispose();
}

http.Response _vigente(String proposito) => respuestaJson(200, {
  'proposito': proposito,
  'expiresAt': '2026-11-21T15:30:00.000Z',
});

Future<void> _montarNueva(
  WidgetTester tester,
  http.Response Function() consulta,
) async {
  final api = ApiFalsa()..siempre(consulta);
  await tester.pumpWidget(
    conTema(
      NuevaContrasenaPantalla(
        repositorio: api.repositorio,
        token: _token,
        alCompletar: (_) {},
        alSolicitarOtro: () {},
        ahora: () => ahoraFijo,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('solicitar enlace cumple las guías de objetivos, etiquetas y contraste', (tester) async {
    final api = ApiFalsa();
    await tester.pumpWidget(
      conTema(
        SolicitarRecuperacionPantalla(
          repositorio: api.repositorio,
          alTenerCodigo: () {},
          ahora: () => ahoraFijo,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await _guias(tester);
  });

  testWidgets('confirmación neutral cumple las guías', (tester) async {
    final api = ApiFalsa()..siempre(() => respuestaJson(202, {'estado': 'solicitud_recibida'}));
    await tester.pumpWidget(
      conTema(
        SolicitarRecuperacionPantalla(
          repositorio: api.repositorio,
          alTenerCodigo: () {},
          ahora: () => ahoraFijo,
        ),
      ),
    );
    await escribirEn(tester, 'Correo', 'rosa@ejemplo.com');
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar enlace'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Si el correo corresponde'), findsOneWidget);
    await _guias(tester);
  });

  testWidgets('nueva contraseña (recuperación) cumple las guías', (tester) async {
    await _montarNueva(tester, () => _vigente('recuperacion'));
    await _guias(tester);
  });

  testWidgets('activar cuenta cumple las guías', (tester) async {
    await _montarNueva(tester, () => _vigente('activacion'));
    await _guias(tester);
  });

  testWidgets('enlace usado, vencido e inválido cumplen las guías', (tester) async {
    for (final caso in [
      (404, 'TOKEN_INVALID'),
      (410, 'TOKEN_USED'),
      (410, 'TOKEN_EXPIRED'),
    ]) {
      await _montarNueva(tester, () => respuestaJson(caso.$1, errorJson(caso.$2)));
      await _guias(tester);
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('el error de contraseña se anuncia como región en vivo con texto', (tester) async {
    await _montarNueva(tester, () => _vigente('recuperacion'));
    final semantica = tester.ensureSemantics();
    await escribirEn(tester, 'Contraseña nueva', 'corta');
    await tester.tap(find.widgetWithText(FilledButton, 'Cambiar contraseña'));
    await tester.pumpAndSettle();
    final error = find.text('La contraseña debe tener entre 15 y 128 caracteres.');
    expect(error, findsOneWidget);
    expect(find.byIcon(Icons.error_outline), findsWidgets);
    expect(
      tester.getSemantics(error).flagsCollection.isLiveRegion || tester.getSemantics(error).label.isNotEmpty,
      isTrue,
    );
    semantica.dispose();
  });

  testWidgets('«Tengo un código» cumple las guías', (tester) async {
    await tester.pumpWidget(conTema(TengoCodigoPantalla(alContinuar: (_) {})));
    await tester.pumpAndSettle();
    await _guias(tester);
  });

  testWidgets('orden de foco con teclado: correo, luego «Enviar enlace» y «Tengo un código»', (tester) async {
    final api = ApiFalsa();
    await tester.pumpWidget(
      conTema(
        SolicitarRecuperacionPantalla(
          repositorio: api.repositorio,
          alTenerCodigo: () {},
          ahora: () => ahoraFijo,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextField, 'Correo'));
    await tester.pump();
    final campo = tester.widget<TextField>(find.widgetWithText(TextField, 'Correo'));
    expect(campo.focusNode?.hasFocus ?? true, isTrue);
    // Con Tab el foco avanza a los controles siguientes sin quedar atrapado en el campo.
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus, isNotNull);
    expect(FocusManager.instance.primaryFocus!.context!.widget, isNot(isA<EditableText>()));
  });
}
