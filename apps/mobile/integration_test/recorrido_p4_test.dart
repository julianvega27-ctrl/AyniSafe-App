import 'dart:math';

import 'package:ayni_safe/app.dart';
import 'package:ayni_safe/aplicacion/sesion_controlador.dart';
import 'package:ayni_safe/datos/almacenamiento_sesion.dart';
import 'package:ayni_safe/datos/auth_repositorio.dart';
import 'package:ayni_safe/datos/cliente_http.dart';
import 'package:ayni_safe/datos/consultas_guardadas.dart';
import 'package:ayni_safe/datos/contenido_repositorio.dart';
import 'package:ayni_safe/datos/incidentes_repositorio.dart';
import 'package:ayni_safe/datos/perfil_repositorio.dart';
import 'package:ayni_safe/datos/ubicacion.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';

/// Recorrido P4.1 en Android (emulador) contra la API y PostgreSQL locales con cartografía activa.
/// El permiso de ubicación es el real del sistema; el escenario lo prepara `adb` antes de cada pasada:
///   invitado: `pm revoke` + `set-permission-flags user-fixed` (denegado sin diálogo);
///   cuenta:   `pm grant` + `adb emu geo fix` (GPS del emulador).
///   flutter drive --driver=test_driver/capturas_p4.dart --target=integration_test/recorrido_p4_test.dart \
///     -d emulator-5554 --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ESCENARIO=invitado|cuenta
/// Crea una cuenta `recorrido.<aleatorio>@ejemplo.com` en la base de desarrollo.
const String escenario = String.fromEnvironment(
  'ESCENARIO',
  defaultValue: 'invitado',
);

/// Cliente que deja llegar el primer POST /incidentes al servidor y descarta su respuesta: simula
/// la pérdida de conexión después de que el servidor registró el incidente (resultado incierto).
class ClientePierdeRespuesta extends http.BaseClient {
  ClientePierdeRespuesta(this._interno);
  final http.Client _interno;
  bool perderSiguienteEnvio = false;
  int enviosAlServidor = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final respuesta = await _interno.send(request);
    if (request.method == 'POST' && request.url.path.endsWith('/incidentes')) {
      enviosAlServidor += 1;
      if (perderSiguienteEnvio) {
        perderSiguienteEnvio = false;
        await respuesta.stream.drain<void>();
        throw http.ClientException('conexión perdida tras enviar');
      }
    }
    return respuesta;
  }
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final errores = <String>[];

  Future<void> esperar(
    WidgetTester tester,
    Finder f, {
    int segundos = 25,
  }) async {
    final fin = DateTime.now().add(Duration(seconds: segundos));
    while (DateTime.now().isBefore(fin)) {
      await tester.pump(const Duration(milliseconds: 150));
      if (f.evaluate().isNotEmpty) return;
    }
    await binding.takeScreenshot('movil-p4-diagnostico-$escenario');
    throw TestFailure('No apareció ${f.describeMatch(Plurality.one)}');
  }

  Future<void> capturar(WidgetTester tester, String nombre) async {
    await tester.pumpAndSettle();
    final ex = tester.takeException();
    if (ex != null) errores.add('$nombre: $ex');
    await binding.takeScreenshot('movil-p4-$nombre');
  }

  Future<void> tocar(WidgetTester tester, Finder f) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> escribir(
    WidgetTester tester,
    String etiqueta,
    String texto,
  ) async {
    final campo = find.widgetWithText(TextField, etiqueta);
    await tester.ensureVisible(campo);
    await tester.pumpAndSettle();
    await tester.enterText(campo, texto);
    await tester.pumpAndSettle();
  }

  Future<void> elegirCategoria(WidgetTester tester, String nombre) async {
    await esperar(tester, find.byKey(const Key('reporteCategoria')));
    await tocar(tester, find.byKey(const Key('reporteCategoria')));
    await tocar(tester, find.text(nombre).last);
  }

  Finder barra(String d) =>
      find.descendant(of: find.byType(NavigationBar), matching: find.text(d));

  Future<(SesionControlador, ClientePierdeRespuesta)> arrancar(
    WidgetTester tester,
  ) async {
    final red = ClientePierdeRespuesta(http.Client());
    final cliente = ClienteHttp(cliente: red);
    final repositorio = AuthRepositorio(cliente);
    final sesion = SesionControlador(
      repositorio: repositorio,
      almacenamiento: AlmacenamientoSeguro(),
    );
    await sesion.restaurar();
    await tester.pumpWidget(
      AyniSafeApp(
        repositorio: repositorio,
        sesion: sesion,
        contenido: ContenidoRepositorio(cliente),
        perfil: PerfilRepositorio(cliente),
        incidentes: IncidentesRepositorio(cliente),
        consultasGuardadas: ConsultasGuardadasSeguras(),
        ubicacion: const UbicacionGeolocator(),
      ),
    );
    await tester.pumpAndSettle();
    return (sesion, red);
  }

  testWidgets('recorrido P4.1 ($escenario)', (tester) async {
    // Android exige convertir la superficie antes de capturar.
    await binding.convertFlutterSurfaceToImage();
    // Estado limpio: sin sesión guardada.
    await AlmacenamientoSeguro().borrar();

    if (escenario == 'invitado') {
      await arrancar(tester);
      await esperar(tester, find.text('Consultar con código'));
      await capturar(tester, 'inicio-publico');
      await tocar(tester, barra('Reportar'));
      await esperar(tester, find.text('Nuevo reporte'));
      await capturar(tester, 'reporte-invitado-vacio');

      await elegirCategoria(tester, 'Accidente de tránsito');
      await escribir(
        tester,
        'Describe lo sucedido',
        'Choque entre una moto y un auto en la esquina',
      );
      await tocar(tester, find.text('¿Hay heridos?'));
      await capturar(tester, 'reporte-invitado-preguntas');
      await tocar(tester, find.text('No sé').first);

      // Permiso denegado por el sistema (preparado con adb): se explica y se ofrece el mapa.
      await tocar(tester, find.text('Usar mi ubicación'));
      await esperar(tester, find.textContaining('elegir el punto en el mapa'));
      await capturar(tester, 'ubicacion-denegada');
      expect(find.text('Describe lo sucedido'), findsWidgets);

      // Punto manual en el mapa: marcar y confirmar.
      final mapa = find.byType(FlutterMap);
      await tester.ensureVisible(mapa);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 3)); // teselas del mapa base
      await tester.tapAt(tester.getCenter(mapa));
      await tester.pump(const Duration(milliseconds: 600));
      await esperar(tester, find.text('Confirmar este punto'));
      await capturar(tester, 'punto-candidato');
      await tocar(tester, find.text('Confirmar este punto'));
      await esperar(tester, find.text('Punto elegido en el mapa'));

      await escribir(tester, 'Teléfono de contacto', '987 654 321');
      await capturar(tester, 'reporte-invitado-completo');
      await tocar(tester, find.text('Enviar reporte'));
      await esperar(tester, find.text('Tu código de seguimiento'));
      await capturar(tester, 'comprobante-invitado');
      expect(find.textContaining('Distrito: Ayacucho'), findsOneWidget);
      expect(
        find.textContaining('Lo guardamos de forma segura'),
        findsOneWidget,
      );

      // Consulta con código desde la consulta guardada.
      await tocar(tester, find.text('Consultar seguimiento'));
      await esperar(tester, find.text('Ver seguimiento'));
      await tocar(tester, find.text('Ver seguimiento').first);
      await esperar(tester, find.text('Pendiente de asignación.'));
      await capturar(tester, 'consulta-codigo');

      // Texto al 200 %: formulario y comprobante sin desbordes.
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      // Consultar con código es un destino del Drawer (sin barra inferior).
      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(ListTile, 'Reportar'));
      await tocar(tester, find.text('Hacer otro reporte'));
      await capturar(tester, 'reporte-invitado-200');
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    } else {
      // Cuenta nueva en la base de desarrollo; su sesión queda guardada antes de arrancar.
      final correo =
          'recorrido.${Random().nextInt(1 << 30).toRadixString(36)}@ejemplo.com';
      final http0 = ClienteHttp();
      const clave = 'contraseña del recorrido P4 suficientemente larga';
      final alta = await http0.enviar(
        'POST',
        '/auth/ciudadanos/registro',
        cuerpo: {
          'nombre': 'Recorrido P4',
          'correo': correo,
          'contrasena': clave,
        },
      );
      expect(alta.estado, 201);
      final login = await http0.enviar(
        'POST',
        '/auth/ciudadanos/sesiones',
        cuerpo: {'correo': correo, 'contrasena': clave},
      );
      expect(login.estado, 200);
      await AlmacenamientoSeguro().guardar(
        SesionGuardada(
          token: login.cuerpo!['token'] as String,
          expiresAt: DateTime.parse(login.cuerpo!['expiresAt'] as String),
        ),
      );

      final (_, red) = await arrancar(tester);
      await esperar(tester, find.text('Mis últimos reportes'));
      await esperar(tester, find.textContaining('Aún no tienes reportes'));
      await capturar(tester, 'inicio-cuenta-vacio');

      await tocar(tester, barra('Reportar'));
      await elegirCategoria(tester, 'Robo');
      await escribir(
        tester,
        'Describe lo sucedido',
        'Me arrebataron el celular frente al mercado',
      );
      expect(
        find.widgetWithText(TextField, 'Teléfono de contacto'),
        findsNothing,
      );

      // Permiso concedido (adb). En este emulador el proveedor fused de Google Play no entrega las
      // ubicaciones de prueba y la lectura agota su tiempo: se registra ese resultado y se continúa
      // con el punto manual, que no requiere permiso.
      await tocar(tester, find.text('Usar mi ubicación'));
      await esperar(
        tester,
        find.textContaining(
          RegExp('Punto de tu ubicación|No pudimos obtener tu ubicación'),
        ),
        segundos: 40,
      );
      if (find.text('Punto de tu ubicación').evaluate().isEmpty) {
        await capturar(tester, 'reporte-cuenta-gps-sin-lectura');
        final mapa = find.byType(FlutterMap);
        await tester.ensureVisible(mapa);
        await tester.pumpAndSettle();
        await tester.pump(const Duration(seconds: 3));
        await tester.tapAt(tester.getCenter(mapa));
        await tester.pump(const Duration(milliseconds: 600));
        await esperar(tester, find.text('Confirmar este punto'));
        await tocar(tester, find.text('Confirmar este punto'));
        await esperar(tester, find.text('Punto elegido en el mapa'));
      }
      await capturar(tester, 'reporte-cuenta-punto');

      // Se pierde la respuesta del primer envío: resultado incierto y reintento con la misma clave.
      red.perderSiguienteEnvio = true;
      await tocar(tester, find.text('Enviar reporte'));
      await esperar(
        tester,
        find.textContaining('No sabemos si tu reporte se registró'),
      );
      await tester.ensureVisible(find.text('Reintentar envío'));
      await tester.pumpAndSettle();
      await capturar(tester, 'envio-incierto');
      await tocar(tester, find.text('Reintentar envío'));
      await esperar(tester, find.text('Reporte registrado'));
      await capturar(tester, 'comprobante-cuenta');
      expect(red.enviosAlServidor, 2);
      expect(find.text('Tu código de seguimiento'), findsNothing);

      // Mis reportes: un solo incidente pese a los dos envíos.
      await tocar(tester, find.text('Ver Mis reportes'));
      await esperar(
        tester,
        find.text('Solo ves los incidentes que registraste con tu cuenta.'),
      );
      await esperar(tester, find.textContaining('INC-'));
      await capturar(tester, 'mis-reportes');
      expect(
        find.textContaining('INC-'),
        findsOneWidget,
        reason: 'el reintento no duplicó el incidente',
      );
      await tocar(tester, find.textContaining('INC-'));
      await esperar(tester, find.text('Pendiente de asignación.'));
      await capturar(tester, 'detalle-cuenta');
      await tester.pageBack();
      await tester.pumpAndSettle();
      // Mis reportes es un destino del Drawer (sin barra inferior).
      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(ListTile, 'Inicio'));
      await esperar(tester, find.text('Ver todos mis reportes'));
      await capturar(tester, 'inicio-cuenta-con-reporte');
    }
    expect(errores, isEmpty, reason: errores.join('\n'));
  });
}
