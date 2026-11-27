import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';

import '../datos/consultas_guardadas.dart';
import '../datos/selector_fotos.dart';
import '../datos/contenido_repositorio.dart';
import '../datos/incidentes_repositorio.dart';
import '../datos/perfil_repositorio.dart';
import '../datos/ubicacion.dart';

/// Abre el marcador del teléfono con un número. Nunca inicia la llamada por sí solo: solo deja
/// el número cargado para que la persona decida llamar.
abstract interface class LanzadorMarcador {
  Future<bool> abrir(String numero);
}

/// `tel:` con el modo de aplicación externa: abre el marcador; no usa `CALL_PHONE`.
class LanzadorMarcadorSistema implements LanzadorMarcador {
  const LanzadorMarcadorSistema();

  @override
  Future<bool> abrir(String numero) async {
    try {
      return await launchUrl(
        Uri(scheme: 'tel', path: numero),
        mode: LaunchMode.externalApplication,
      );
    } on Object {
      return false;
    }
  }
}

/// Repositorios y servicios compartidos por las pantallas, disponibles por contexto. Las pantallas
/// públicas (antes del acceso) y las privadas usan el mismo contenido.
class Servicios extends InheritedWidget {
  const Servicios({
    super.key,
    required this.contenido,
    required this.perfil,
    required this.marcador,
    required this.incidentes,
    required this.ubicacion,
    required this.consultasGuardadas,
    this.selectorFotos,
    this.permisosCarga,
    this.mostrarTeselas = true,
    required super.child,
  });

  final ContenidoRepositorio contenido;
  final PerfilRepositorio perfil;
  final LanzadorMarcador marcador;

  /// Registro y seguimiento de incidentes (P4.1).
  final IncidentesRepositorio incidentes;
  final UbicacionPuerto ubicacion;

  /// Consultas de invitado guardadas en este teléfono (independientes de la sesión).
  final ConsultasGuardadas consultasGuardadas;

  /// Cámara y galería (P5.2). null: el del sistema.
  final SelectorFotos? selectorFotos;

  /// Permisos de carga del invitado (P5.2). null: almacenamiento seguro del sistema.
  final PermisosCarga? permisosCarga;

  /// Falso en pruebas: el selector de punto no consulta el proveedor de teselas.
  final bool mostrarTeselas;

  static Servicios of(BuildContext context) {
    final servicios = context.dependOnInheritedWidgetOfExactType<Servicios>();
    assert(servicios != null, 'Falta un Servicios sobre este contexto.');
    return servicios!;
  }

  @override
  bool updateShouldNotify(Servicios old) =>
      contenido != old.contenido ||
      perfil != old.perfil ||
      marcador != old.marcador ||
      incidentes != old.incidentes ||
      ubicacion != old.ubicacion ||
      consultasGuardadas != old.consultasGuardadas ||
      selectorFotos != old.selectorFotos ||
      permisosCarga != old.permisosCarga ||
      mostrarTeselas != old.mostrarTeselas;
}
