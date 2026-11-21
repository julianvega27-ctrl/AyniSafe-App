import 'package:ayni_safe/aplicacion/aviso.dart';
import 'package:ayni_safe/presentacion/componentes/boton_principal.dart';
import 'package:ayni_safe/presentacion/componentes/campo_contrasena.dart';
import 'package:ayni_safe/presentacion/componentes/campo_formulario.dart';
import 'package:ayni_safe/presentacion/componentes/mensaje_accesible.dart';
import 'package:ayni_safe/presentacion/tema.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

void main() {
  group('CampoFormulario', () {
    testWidgets(
      'etiqueta persistente, ayuda y compatibilidad con autocompletado',
      (tester) async {
        final c = TextEditingController();
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: CampoFormulario(
                etiqueta: 'Correo',
                controlador: c,
                ayuda: 'Usa tu correo personal',
                tipoTeclado: TextInputType.emailAddress,
                pistasAutocompletar: const [AutofillHints.email],
              ),
            ),
          ),
        );
        // La etiqueta está visible con el campo vacío y sin foco (no es un texto de sugerencia).
        expect(find.text('Correo'), findsOneWidget);
        expect(find.text('Usa tu correo personal'), findsOneWidget);
        final campo = tester.widget<TextField>(find.byType(TextField));
        expect(campo.autofillHints, [AutofillHints.email]);
        expect(campo.decoration!.hintText, isNull);
        // Sigue visible después de escribir.
        await tester.enterText(find.byType(TextField), 'a@b.co');
        expect(find.text('Correo'), findsOneWidget);
      },
    );

    testWidgets(
      'admite pegar: el texto, con espacios y Unicode, se conserva exactamente',
      (tester) async {
        final c = TextEditingController();
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: CampoFormulario(etiqueta: 'Nombre', controlador: c),
            ),
          ),
        );
        final campo = tester.widget<TextField>(find.byType(TextField));
        expect(
          campo.enableInteractiveSelection,
          isTrue,
        ); // habilita seleccionar/pegar
        const pegado = '  Rosa \u{1F600} Quispe  ';
        await tester.enterText(find.byType(TextField), pegado);
        expect(c.text, pegado);
      },
    );

    testWidgets('el error muestra icono y texto, no solo color', (
      tester,
    ) async {
      await tester.pumpWidget(
        conTema(
          Scaffold(
            body: CampoFormulario(
              etiqueta: 'Correo',
              controlador: TextEditingController(),
              error: 'Ingresa un correo válido.',
            ),
          ),
        ),
      );
      expect(find.text('Ingresa un correo válido.'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('altura mínima de 48 y texto base de 16', (tester) async {
      await tester.pumpWidget(
        conTema(
          Scaffold(
            body: CampoFormulario(
              etiqueta: 'Correo',
              controlador: TextEditingController(),
            ),
          ),
        ),
      );
      expect(
        tester.getSize(find.byType(TextField)).height,
        greaterThanOrEqualTo(alturaMinimaControl),
      );
      final estilo = tester
          .widget<EditableText>(find.byType(EditableText))
          .style;
      expect(estilo.fontSize, tamanoTextoBase);
    });
  });

  group('CampoContrasena', () {
    testWidgets('Mostrar/Ocultar alterna la visibilidad sin perder el valor', (
      tester,
    ) async {
      final c = TextEditingController();
      await tester.pumpWidget(
        conTema(Scaffold(body: CampoContrasena(controlador: c))),
      );
      const clave = ' clave con espacios \u{1F600} ';
      await tester.enterText(find.byType(TextField), clave);

      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isTrue,
      );
      expect(find.text('Mostrar'), findsOneWidget);

      await tester.tap(find.text('Mostrar'));
      await tester.pump();
      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isFalse,
      );
      expect(find.text('Ocultar'), findsOneWidget);
      expect(c.text, clave);

      await tester.tap(find.text('Ocultar'));
      await tester.pump();
      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isTrue,
      );
      expect(c.text, clave);
    });

    testWidgets(
      'permite pegar y gestores de contraseñas; no sugiere ni autocorrige',
      (tester) async {
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: Column(
                children: [
                  CampoContrasena(
                    controlador: TextEditingController(),
                    etiqueta: 'Nueva',
                    nueva: true,
                  ),
                  CampoContrasena(
                    controlador: TextEditingController(),
                    etiqueta: 'Actual',
                  ),
                ],
              ),
            ),
          ),
        );
        final nueva = tester.widget<TextField>(
          find.widgetWithText(TextField, 'Nueva'),
        );
        final actual = tester.widget<TextField>(
          find.widgetWithText(TextField, 'Actual'),
        );
        expect(nueva.autofillHints, [AutofillHints.newPassword]);
        expect(actual.autofillHints, [AutofillHints.password]);
        for (final campo in [nueva, actual]) {
          expect(campo.enableInteractiveSelection, isTrue);
          expect(campo.autocorrect, isFalse);
          expect(campo.enableSuggestions, isFalse);
        }
      },
    );

    testWidgets(
      'el botón Mostrar/Ocultar tiene etiqueta accesible y objetivo de al menos 48',
      (tester) async {
        final semantica = tester.ensureSemantics();
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: CampoContrasena(controlador: TextEditingController()),
            ),
          ),
        );
        expect(find.bySemanticsLabel('Mostrar contraseña'), findsOneWidget);
        expect(
          tester.getSize(find.widgetWithText(TextButton, 'Mostrar')).height,
          greaterThanOrEqualTo(alturaMinimaControl),
        );
        await tester.tap(find.text('Mostrar'));
        await tester.pump();
        expect(find.bySemanticsLabel('Ocultar contraseña'), findsOneWidget);
        semantica.dispose();
      },
    );

    testWidgets(
      'la etiqueta del campo es accesible para lectores de pantalla',
      (tester) async {
        final semantica = tester.ensureSemantics();
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: CampoContrasena(
                controlador: TextEditingController(),
                etiqueta: 'Contraseña',
              ),
            ),
          ),
        );
        // Existe un nodo accesible con la etiqueta del campo (no depende de un texto de sugerencia).
        final nodo = find.bySemanticsLabel('Contraseña');
        expect(nodo, findsOneWidget);
        final datos = tester.getSemantics(nodo);
        expect(datos.label, 'Contraseña');
        expect(datos.getSemanticsData().flagsCollection.isTextField, isTrue);
        expect(datos.getSemanticsData().flagsCollection.isObscured, isTrue);
        semantica.dispose();
      },
    );
  });

  group('BotonPrincipal', () {
    testWidgets(
      'estados normal, cargando y deshabilitado; altura mínima de 48',
      (tester) async {
        var pulsaciones = 0;
        Widget boton({bool cargando = false, bool habilitado = true}) =>
            conTema(
              Scaffold(
                body: BotonPrincipal(
                  texto: 'Enviar',
                  cargando: cargando,
                  alPulsar: habilitado ? () => pulsaciones += 1 : null,
                ),
              ),
            );

        await tester.pumpWidget(boton());
        expect(
          tester.getSize(find.byType(FilledButton)).height,
          greaterThanOrEqualTo(alturaMinimaControl),
        );
        await tester.tap(find.text('Enviar'));
        expect(pulsaciones, 1);

        await tester.pumpWidget(boton(cargando: true));
        expect(find.text('Enviando…'), findsOneWidget);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        await tester.tap(find.byType(FilledButton), warnIfMissed: false);
        expect(pulsaciones, 1); // no acepta pulsaciones mientras carga

        await tester.pumpWidget(boton(habilitado: false));
        expect(
          tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
          isNull,
        );
      },
    );
  });

  group('MensajeAccesible', () {
    testWidgets(
      'muestra icono y texto para cada tipo y una acción cuando corresponde',
      (tester) async {
        var accion = 0;
        for (final (tipo, icono) in [
          (TipoAviso.error, Icons.error_outline),
          (TipoAviso.info, Icons.info_outline),
          (TipoAviso.exito, Icons.check_circle_outline),
        ]) {
          await tester.pumpWidget(
            conTema(
              Scaffold(
                body: MensajeAccesible(
                  aviso: Aviso(tipo, 'Texto del mensaje'),
                  etiquetaAccion: 'Continuar',
                  alAccionar: () => accion += 1,
                ),
              ),
            ),
          );
          expect(find.text('Texto del mensaje'), findsOneWidget);
          expect(find.byIcon(icono), findsOneWidget);
        }
        await tester.tap(find.text('Continuar'));
        expect(accion, 1);
      },
    );

    testWidgets(
      'se anuncia como región en vivo y la acción es alcanzable por accesibilidad',
      (tester) async {
        final semantica = tester.ensureSemantics();
        await tester.pumpWidget(
          conTema(
            Scaffold(
              body: MensajeAccesible(
                aviso: const Aviso(TipoAviso.error, 'Algo salió mal'),
                etiquetaAccion: 'Reintentar',
                alAccionar: () {},
              ),
            ),
          ),
        );
        expect(find.bySemanticsLabel('Error: Algo salió mal'), findsOneWidget);
        expect(find.bySemanticsLabel('Reintentar'), findsOneWidget);
        semantica.dispose();
      },
    );
  });
}
