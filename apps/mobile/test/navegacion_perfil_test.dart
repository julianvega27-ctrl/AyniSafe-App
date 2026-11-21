import 'dart:async';

import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/presentacion/pantallas/acceso_pantalla.dart';
import 'package:ayni_safe/presentacion/pantallas/inicio_pantalla.dart';
import 'package:ayni_safe/presentacion/tema.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

typedef Montaje = ({
  ApiFalsa api,
  ServidorPerfil servidor,
  AlmacenamientoEnMemoria almacen,
  SesionControlador sesion,
  MarcadorFalso marcador,
});

Future<Montaje> montar(
  WidgetTester tester, {
  Map<String, Object?>? contenido,
  Map<String, Object?>? perfil,
  bool conSesion = true,
}) async {
  final api = ApiFalsa();
  final servidor = ServidorPerfil();
  if (perfil != null) servidor.perfil = perfil;
  final cont = contenido ?? contenidoJson();
  api.manejador = (req) async {
    if (req.url.path.endsWith('/publico/contenido')) return respuestaJson(200, cont);
    return servidor.responder(req);
  };
  final almacen = AlmacenamientoEnMemoria(
    conSesion
        ? SesionGuardada(token: tokenSesionPrueba, expiresAt: ahoraFijo.add(const Duration(hours: 10)))
        : null,
  );
  final sesion = crearSesion(api, almacen);
  await sesion.restaurar();
  final marcador = MarcadorFalso();
  await tester.pumpWidget(appDePrueba(api, sesion, marcador: marcador));
  await tester.pumpAndSettle();
  addTearDown(sesion.dispose);
  return (api: api, servidor: servidor, almacen: almacen, sesion: sesion, marcador: marcador);
}

Future<void> abrirPerfil(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Perfil'));
  await tester.pumpAndSettle();
}

Future<void> tocar(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Finder get botonReportar => find.widgetWithText(FilledButton, 'Reportar un incidente');
NavigationBar barra(WidgetTester t) => t.widget<NavigationBar>(find.byType(NavigationBar));

void main() {
  group('navegación principal (6.1)', () {
    testWidgets('tras iniciar sesión: Inicio con cuatro destinos y el perfil en la cabecera', (tester) async {
      await montar(tester);
      expect(find.byType(InicioPantalla), findsOneWidget);
      for (final destino in ['Inicio', 'Mapa', 'Mis reportes', 'Alertas']) {
        expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(destino)), findsOneWidget);
      }
      expect(barra(tester).selectedIndex, 0);
      expect(find.byTooltip('Perfil'), findsOneWidget);
      expect(tester.getSize(find.byTooltip('Perfil')).shortestSide, greaterThanOrEqualTo(alturaMinimaControl));
      expect(tester.getSize(find.byType(NavigationBar)).height, greaterThanOrEqualTo(alturaMinimaControl));
    });

    testWidgets('el destino activo se reconoce (índice y estado seleccionado) y cada pestaña conserva su estado', (tester) async {
      await montar(tester);
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Mapa')));
      await tester.pumpAndSettle();
      expect(barra(tester).selectedIndex, 1);
      expect(find.text('Aún no disponible'), findsWidgets);
      final inicio = tester.element(find.byType(InicioPantalla, skipOffstage: false));
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Inicio')));
      await tester.pumpAndSettle();
      // IndexedStack: Inicio no se reconstruyó, conserva su estado.
      expect(tester.element(find.byType(InicioPantalla, skipOffstage: false)), same(inicio));
    });

    testWidgets('el retroceso del sistema desde Mapa vuelve a Inicio y no sale de la app', (tester) async {
      await montar(tester);
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Mapa')));
      await tester.pumpAndSettle();
      final manejado = await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(manejado, isTrue);
      expect(barra(tester).selectedIndex, 0);
      expect(find.byType(NavigationBar), findsOneWidget);
    });

    testWidgets('sin sesión verificada no se muestra el shell', (tester) async {
      await montar(tester, conSesion: false);
      expect(find.byType(AccesoPantalla), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.byTooltip('Perfil'), findsNothing);
    });

    testWidgets('sesión que vence o se revoca: sale del shell y no deja historial', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await m.sesion.alSesionInvalida();
      await tester.pumpAndSettle();
      expect(find.byType(AccesoPantalla), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.text('Hola, Rosa Quispe'), findsNothing);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Hola, Rosa Quispe'), findsNothing);
    });
  });

  group('Inicio y destinos pendientes (6.2)', () {
    testWidgets('«Reportar un incidente» está deshabilitado con «Disponible próximamente» y no hace nada', (tester) async {
      final m = await montar(tester);
      expect(find.text('Hola, Rosa Quispe'), findsOneWidget);
      expect(tester.widget<FilledButton>(botonReportar).onPressed, isNull);
      expect(find.text('Disponible próximamente'), findsOneWidget);
      final antes = m.api.solicitudes.length;
      await tester.tap(botonReportar, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(m.api.solicitudes.length, antes);
      expect(find.byType(InicioPantalla), findsOneWidget);
      expect(find.text('Disponible próximamente'), findsOneWidget);
    });

    testWidgets('los últimos reportes y el contenido están declarados pendientes, sin datos de ejemplo', (tester) async {
      await montar(tester);
      expect(find.textContaining('tus reportes aparecerán aquí cuando puedas enviarlos'), findsOneWidget);
      expect(find.text('Mis últimos reportes'), findsOneWidget);
      expect(find.textContaining('aún no están disponibles'), findsOneWidget);
      expect(find.textContaining('no despacha emergencias'), findsOneWidget);
      expect(find.textContaining(RegExp(r'\d{3,}')), findsNothing);
    });

    testWidgets('Mapa, Mis reportes y Alertas dicen que aún no están disponibles, sin permisos ni datos', (tester) async {
      final m = await montar(tester);
      final antes = m.api.solicitudes.length;
      for (final destino in ['Mapa', 'Mis reportes', 'Alertas']) {
        await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(destino)));
        await tester.pumpAndSettle();
        expect(find.text('Aún no disponible'), findsOneWidget, reason: destino);
        expect(find.byIcon(Icons.map_outlined), destino == 'Mapa' ? findsWidgets : findsWidgets);
      }
      expect(find.textContaining('ubicación'), findsNothing);
      expect(find.textContaining('notificaciones'), findsNothing);
      expect(m.api.solicitudes.length, antes, reason: 'estos destinos no piden nada al servidor');
    });

    testWidgets('con contactos aprobados: se muestran y «Llamar» abre el marcador sin llamar ni pedir permisos', (tester) async {
      final m = await montar(
        tester,
        contenido: contenidoJson(
          contactosAprobados: true,
          contactos: [
            {'institucion': 'Institución de prueba', 'numero': '123', 'cobertura': 'Zona de prueba', 'fuente': 'Fuente de prueba', 'verificadoAt': '2026-11-01'},
          ],
        ),
      );
      expect(find.text('Institución de prueba'), findsOneWidget);
      expect(find.textContaining('aún no están disponibles'), findsNothing);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Llamar'));
      expect(m.marcador.abiertos, ['123']);
      expect(m.api.solicitudes.where((s) => s.metodo == 'POST'), isEmpty);
    });

    testWidgets('el contenido de prueba no forma parte de la fuente real (ver pruebas de la API)', (tester) async {
      // Sin contactos aprobados no existe ninguna acción de llamada.
      await montar(tester);
      expect(find.widgetWithText(OutlinedButton, 'Llamar'), findsNothing);
    });
  });

  group('perfil (6.3)', () {
    testWidgets('muestra datos, correo de solo lectura, preferencias pendientes y accesos informativos', (tester) async {
      await montar(tester, perfil: perfilJson(telefono: '987654321', compartir: true));
      await abrirPerfil(tester);
      expect(find.text('Rosa Quispe'), findsOneWidget);
      expect(find.text('rosa@ejemplo.com'), findsOneWidget);
      expect(find.textContaining('Solo lectura'), findsOneWidget);
      expect(find.textContaining('verificado'), findsNothing);
      expect(find.text('987654321'), findsOneWidget);
      expect(find.text('Autorizado'), findsOneWidget);
      expect(find.textContaining('Por ahora no se comparte con ninguna institución'), findsOneWidget);
      expect(find.byType(TextField), findsNothing, reason: 'el correo no tiene control de edición');
      expect(find.textContaining('aquí podrás elegir qué alertas recibir'), findsOneWidget);
      for (final enlace in ['Privacidad', 'Acerca de AyniSafe', 'Desarrolladores']) {
        expect(find.widgetWithText(ListTile, enlace), findsOneWidget);
      }
      expect(find.widgetWithText(FilledButton, 'Cerrar sesión'), findsOneWidget);
    });

    testWidgets('sin teléfono: «No registrado» y autorización «No autorizado»', (tester) async {
      await montar(tester);
      await abrirPerfil(tester);
      expect(find.text('No registrado'), findsOneWidget);
      expect(find.text('No autorizado'), findsOneWidget);
    });

    testWidgets('error al cargar: mensaje con «Reintentar» y sin datos supuestos', (tester) async {
      final m = await montar(tester);
      final previo = m.api.manejador;
      m.api.manejador = (req) async {
        if (req.url.path.endsWith('/perfil')) throw Exception('sin red');
        return previo(req);
      };
      await abrirPerfil(tester);
      expect(find.textContaining('No hay conexión'), findsOneWidget);
      expect(find.text('Datos personales'), findsOneWidget);
      expect(find.text('rosa@ejemplo.com'), findsNothing);
      m.api.manejador = previo;
      await tocar(tester, find.widgetWithText(TextButton, 'Reintentar'));
      expect(find.text('rosa@ejemplo.com'), findsOneWidget);
    });

    testWidgets('editar nombre: persiste, el perfil lo confirma y el saludo de Inicio cambia', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      await escribirEn(tester, 'Nombre', '  Rosa Nueva ');
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(find.text('Guardamos tus cambios.'), findsOneWidget);
      expect(find.text('Rosa Nueva'), findsOneWidget);
      expect(m.servidor.perfil['nombre'], 'Rosa Nueva');
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Hola, Rosa Nueva'), findsOneWidget);
    });

    testWidgets('el formulario no ofrece editar el correo, DNI ni rol y el teléfono es opcional', (tester) async {
      await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      expect(find.widgetWithText(TextField, 'Nombre'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Teléfono (opcional)'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Correo'), findsNothing);
      expect(find.textContaining(RegExp('DNI|Rol', caseSensitive: false)), findsNothing);
    });

    testWidgets('teléfono vacío es válido; sin teléfono la autorización está deshabilitada', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged, isNull);
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(find.text('Guardamos tus cambios.'), findsOneWidget);
      expect(m.servidor.perfil['telefono'], isNull);
    });

    testWidgets('otorgar y revocar la autorización: el teléfono se conserva al revocar', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      await escribirEn(tester, 'Teléfono (opcional)', '+51 987-654-321');
      await tester.pumpAndSettle();
      await tocar(tester, find.byType(SwitchListTile));
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(m.servidor.perfil, containsPair('compartirTelefono', true));
      expect(m.servidor.perfil['telefono'], '+51987654321');
      expect(find.text('Autorizado'), findsOneWidget);

      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isTrue);
      await tocar(tester, find.byType(SwitchListTile));
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(m.servidor.perfil, containsPair('compartirTelefono', false));
      expect(m.servidor.perfil['telefono'], '+51987654321');
      expect(find.text('No autorizado'), findsOneWidget);
    });

    testWidgets('cambiar o borrar el número apaga la autorización y hay que volver a decidir', (tester) async {
      await montar(tester, perfil: perfilJson(telefono: '987654321', compartir: true));
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isTrue);
      await escribirEn(tester, 'Teléfono (opcional)', '912345678');
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isFalse);
      await escribirEn(tester, 'Teléfono (opcional)', '');
      await tester.pumpAndSettle();
      final interruptor = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
      expect(interruptor.value, isFalse);
      expect(interruptor.onChanged, isNull);
    });

    testWidgets('el aviso del consentimiento dice que aún no se comparte con nadie', (tester) async {
      await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      expect(find.textContaining('Por ahora no se comparte con ninguna institución'), findsOneWidget);
      expect(find.textContaining('Puedes revocarlo cuando quieras'), findsOneWidget);
    });

    testWidgets('errores: teléfono inválido junto al campo, y fallo del servidor sin afirmar que se guardó', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      await escribirEn(tester, 'Teléfono (opcional)', 'abc');
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(find.textContaining('Ingresa un teléfono de 7 a 15 dígitos'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsWidgets);
      expect(m.api.contar('PATCH', '/perfil'), 0);

      await escribirEn(tester, 'Teléfono (opcional)', '987654321');
      await escribirEn(tester, 'Nombre', 'Nombre editado');
      final previo = m.api.manejador;
      m.api.manejador = (req) async {
        if (req.method == 'PATCH') throw Exception('sin red');
        return previo(req);
      };
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(find.textContaining('No hay conexión'), findsOneWidget);
      expect(find.textContaining('No se guardó'), findsOneWidget);
      expect(find.text('Guardamos tus cambios.'), findsNothing);
      expect(textoDe(tester, 'Nombre'), 'Nombre editado');
      expect(textoDe(tester, 'Teléfono (opcional)'), '987654321');
      expect(find.text('Editar datos'), findsWidgets, reason: 'sigue en el formulario');
    });

    testWidgets('un solo envío: varios toques durante la solicitud emiten una sola', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      m.servidor.retenerPatch = Completer<void>();
      await escribirEn(tester, 'Nombre', 'Otro nombre');
      final guardar = find.widgetWithText(FilledButton, 'Guardar cambios');
      await tester.ensureVisible(guardar);
      await tester.tap(guardar);
      await tester.pump();
      expect(find.text('Guardando…'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Guardando…'), warnIfMissed: false);
      await tester.pump();
      expect(m.api.contar('PATCH', '/perfil'), 1);
      m.servidor.retenerPatch!.complete();
      await tester.pumpAndSettle();
      expect(m.api.contar('PATCH', '/perfil'), 1);
    });

    testWidgets('401 al guardar: vuelve al acceso sin mostrar datos privados', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      m.api.siempre(() => respuestaJson(401, errorJson('UNAUTHENTICATED')));
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      expect(find.byType(AccesoPantalla), findsOneWidget);
      expect(find.text('rosa@ejemplo.com'), findsNothing);
      expect(m.almacen.guardada, isNull);
    });

    testWidgets('perfil propio frente a otro usuario: nunca se pide un perfil por identificador', (tester) async {
      final m = await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Editar datos'));
      await tocar(tester, find.widgetWithText(FilledButton, 'Guardar cambios'));
      for (final s in m.api.solicitudes.where((s) => s.ruta.contains('/perfil'))) {
        expect(s.ruta, endsWith('/api/v1/perfil'));
        expect(s.consulta, isEmpty);
      }
      final patch = m.api.solicitudes.firstWhere((s) => s.metodo == 'PATCH');
      expect(patch.json!.keys, isNot(contains('id')));
      expect(patch.json!.keys, isNot(contains('correo')));
    });
  });

  group('contenido público desde el perfil y salida (6.4, 6.6)', () {
    testWidgets('Privacidad, Acerca de y Desarrolladores muestran el contenido publicado', (tester) async {
      await montar(tester);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(ListTile, 'Privacidad'));
      expect(find.text('Texto de privacidad de prueba.'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(ListTile, 'Acerca de AyniSafe'));
      expect(find.text('Finalidad de prueba de AyniSafe.'), findsOneWidget);
      expect(find.text('Funcionamiento de prueba de AyniSafe.'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(ListTile, 'Desarrolladores'));
      expect(find.text('Dev de Prueba'), findsOneWidget);
    });

    testWidgets('secciones sin aprobar: se declara que no están disponibles, sin texto supuesto', (tester) async {
      final contenido = contenidoJson();
      contenido['desarrolladores'] = {'estado': 'pendiente'};
      contenido['app'] = {'estado': 'pendiente'};
      await montar(tester, contenido: contenido);
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(ListTile, 'Desarrolladores'));
      expect(find.textContaining('aún no está disponible'), findsOneWidget);
      expect(find.text('Dev de Prueba'), findsNothing);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(ListTile, 'Acerca de AyniSafe'));
      expect(find.textContaining('aún no está disponible'), findsOneWidget);
    });

    testWidgets('cerrar sesión desde el perfil: acceso sin historial y sin datos del perfil en pantalla', (tester) async {
      final m = await montar(tester, perfil: perfilJson(telefono: '987654321'));
      await abrirPerfil(tester);
      expect(find.text('987654321'), findsOneWidget);
      await tocar(tester, find.widgetWithText(FilledButton, 'Cerrar sesión'));
      expect(find.byType(AccesoPantalla), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('987654321'), findsNothing);
      expect(find.text('rosa@ejemplo.com'), findsNothing);
      expect(find.byType(NavigationBar), findsNothing);
      expect(m.almacen.guardada, isNull);
      final navegador = tester.state<NavigatorState>(find.byType(Navigator));
      expect(navegador.canPop(), isFalse);
    });

    testWidgets('otra persona que inicia sesión después no ve el perfil anterior', (tester) async {
      final m = await montar(tester, perfil: perfilJson(nombre: 'Persona A', telefono: '987654321'));
      await abrirPerfil(tester);
      await tocar(tester, find.widgetWithText(FilledButton, 'Cerrar sesión'));
      m.servidor.perfil = perfilJson(nombre: 'Persona B');
      m.almacen.guardada = SesionGuardada(token: tokenSesionPrueba, expiresAt: ahoraFijo.add(const Duration(hours: 5)));
      await m.sesion.restaurar();
      await tester.pumpAndSettle();
      await abrirPerfil(tester);
      expect(find.text('Persona B'), findsOneWidget);
      expect(find.text('Persona A'), findsNothing);
      expect(find.text('987654321'), findsNothing);
    });
  });

  group('accesibilidad (6.6)', () {
    testWidgets('texto al 200 % en un teléfono estrecho: Inicio, destinos, perfil y edición sin desbordes', (tester) async {
      tester.view.physicalSize = const Size(360 * 3, 640 * 3);
      tester.view.devicePixelRatio = 3;
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      await montar(tester, perfil: perfilJson(telefono: '987654321', compartir: true));
      expect(tester.takeException(), isNull);
      expect(find.text('Mis reportes'), findsOneWidget);
      for (final destino in ['Mapa', 'Mis reportes', 'Alertas']) {
        await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(destino)));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: destino);
      }
      await abrirPerfil(tester);
      expect(tester.takeException(), isNull);
      final editar = find.widgetWithText(OutlinedButton, 'Editar datos');
      await tester.ensureVisible(editar);
      expect(tester.getSize(editar).height, greaterThanOrEqualTo(alturaMinimaControl));
      await tocar(tester, editar);
      expect(tester.takeException(), isNull);
      final guardar = find.widgetWithText(FilledButton, 'Guardar cambios');
      await tester.ensureVisible(guardar);
      await tester.pumpAndSettle();
      expect(tester.getSize(guardar).height, greaterThanOrEqualTo(alturaMinimaControl));
      expect(tester.takeException(), isNull);
    });

    testWidgets('semántica: perfil, destinos y estado pendiente tienen etiquetas anunciables', (tester) async {
      final semantica = tester.ensureSemantics();
      await montar(tester);
      final nodo = tester.getSemantics(find.byTooltip('Perfil')).getSemanticsData();
      expect('${nodo.label} ${nodo.tooltip}', contains('Perfil'));
      expect(nodo.flagsCollection.isButton, isTrue);
      expect(find.bySemanticsLabel(RegExp('Reportar un incidente')), findsWidgets);
      expect(find.bySemanticsLabel(RegExp('Disponible próximamente')), findsWidgets);
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Alertas')));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel(RegExp('Aún no disponible')), findsWidgets);
      semantica.dispose();
    });
  });
}
