import 'package:flutter/material.dart';

import 'aplicacion/sesion_controlador.dart';
import 'datos/auth_repositorio.dart';
import 'presentacion/pantallas/acceso_pantalla.dart';
import 'presentacion/pantallas/estados_sesion.dart';
import 'presentacion/pantallas/sesion_iniciada_pantalla.dart';
import 'presentacion/tema.dart';

/// Raíz de la app ciudadana. La pantalla inicial depende únicamente del estado de la sesión:
/// el destino privado es la raíz de navegación (no una ruta apilada), de modo que al salir no
/// queda historial que vuelva a mostrar la identidad.
class AyniSafeApp extends StatefulWidget {
  const AyniSafeApp({
    super.key,
    required this.repositorio,
    required this.sesion,
    this.ahora,
  });

  final AuthRepositorio repositorio;
  final SesionControlador sesion;
  final DateTime Function()? ahora;

  @override
  State<AyniSafeApp> createState() => _AyniSafeAppState();
}

class _AyniSafeAppState extends State<AyniSafeApp> {
  final GlobalKey<NavigatorState> _navegador = GlobalKey<NavigatorState>();
  EstadoSesion? _anterior;

  @override
  void initState() {
    super.initState();
    _anterior = widget.sesion.estado;
    widget.sesion.addListener(_alCambiarSesion);
  }

  @override
  void dispose() {
    widget.sesion.removeListener(_alCambiarSesion);
    super.dispose();
  }

  void _alCambiarSesion() {
    final nuevo = widget.sesion.estado;
    final cambioDeTipo = _anterior.runtimeType != nuevo.runtimeType;
    _anterior = nuevo;
    // Al entrar o salir del área privada se descartan rutas apiladas (formularios, información).
    if (cambioDeTipo) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navegador.currentState?.popUntil((ruta) => ruta.isFirst);
      });
    }
  }

  Widget _pantalla(EstadoSesion estado) => switch (estado) {
    SesionRestaurando() => const VerificandoSesionPantalla(),
    SesionAnonima(:final aviso) => AccesoPantalla(
      key: const ValueKey('acceso'),
      repositorio: widget.repositorio,
      sesion: widget.sesion,
      avisoDeSesion: aviso,
      ahora: widget.ahora,
    ),
    SesionAutenticada() => SesionIniciadaPantalla(
      sesion: widget.sesion,
      estado: estado,
    ),
    SesionNoVerificable() => SesionSinVerificarPantalla(sesion: widget.sesion),
    SesionLimpiezaPendiente() => LimpiezaPendientePantalla(
      sesion: widget.sesion,
      estado: estado,
    ),
  };

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AyniSafe',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navegador,
      theme: crearTema(),
      home: ListenableBuilder(
        listenable: widget.sesion,
        builder: (context, _) => _pantalla(widget.sesion.estado),
      ),
    );
  }
}
