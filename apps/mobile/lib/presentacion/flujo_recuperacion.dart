import 'package:flutter/material.dart';

import '../aplicacion/sesion_controlador.dart';
import '../datos/auth_repositorio.dart';
import 'pantallas/nueva_contrasena_pantalla.dart';
import 'pantallas/solicitar_recuperacion_pantalla.dart';
import 'pantallas/tengo_codigo_pantalla.dart';

/// Navegación compartida de la recuperación y la activación. La usan el acceso (pantallas
/// «Olvidé mi contraseña» y «Tengo un código») y el enlace del correo.
///
/// Al definir la contraseña se vuelve a la raíz (el acceso) y se le avisa a la sesión: el servidor
/// ya revocó todas las sesiones de la cuenta y no se inicia sesión automáticamente.
class FlujoRecuperacion {
  const FlujoRecuperacion({
    required this.repositorio,
    required this.sesion,
    this.ahora,
  });

  final AuthRepositorio repositorio;
  final SesionControlador sesion;
  final DateTime Function()? ahora;

  /// «Olvidé mi contraseña»: pide el enlace.
  void abrirSolicitud(NavigatorState navegador, {String correoInicial = ''}) {
    navegador.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => SolicitarRecuperacionPantalla(
          repositorio: repositorio,
          correoInicial: correoInicial,
          ahora: ahora,
          alTenerCodigo: () => abrirTengoCodigo(navegador),
        ),
      ),
    );
  }

  /// «Tengo un código»: pega el código del correo y continúa como con el enlace.
  void abrirTengoCodigo(NavigatorState navegador) {
    navegador.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => TengoCodigoPantalla(
          alContinuar: (codigo) => abrirNuevaContrasena(navegador, codigo),
        ),
      ),
    );
  }

  /// Enlace o código ya disponible: consulta su estado y permite elegir la contraseña.
  void abrirNuevaContrasena(NavigatorState navegador, String token) {
    navegador.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => NuevaContrasenaPantalla(
          repositorio: repositorio,
          token: token,
          ahora: ahora,
          alSolicitarOtro: () => abrirSolicitud(navegador),
          alCompletar: (proposito) {
            navegador.popUntil((ruta) => ruta.isFirst);
            sesion.alDefinirContrasena(proposito);
          },
        ),
      ),
    );
  }
}
