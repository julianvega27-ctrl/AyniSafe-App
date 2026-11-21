import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';

import '../datos/contenido_repositorio.dart';
import '../datos/perfil_repositorio.dart';

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
    required super.child,
  });

  final ContenidoRepositorio contenido;
  final PerfilRepositorio perfil;
  final LanzadorMarcador marcador;

  static Servicios of(BuildContext context) {
    final servicios = context.dependOnInheritedWidgetOfExactType<Servicios>();
    assert(servicios != null, 'Falta un Servicios sobre este contexto.');
    return servicios!;
  }

  @override
  bool updateShouldNotify(Servicios old) =>
      contenido != old.contenido ||
      perfil != old.perfil ||
      marcador != old.marcador;
}
