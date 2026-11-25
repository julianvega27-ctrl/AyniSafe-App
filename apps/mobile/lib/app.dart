import 'dart:async';

import 'package:flutter/material.dart';

import 'aplicacion/sesion_controlador.dart';
import 'datos/auth_repositorio.dart';
import 'datos/contenido_repositorio.dart';
import 'datos/perfil_repositorio.dart';
import 'datos/enlaces_cuenta.dart';
import 'presentacion/flujo_recuperacion.dart';
import 'presentacion/pantallas/estados_sesion.dart';
import 'presentacion/navegacion/shell_ciudadano.dart';
import 'presentacion/servicios.dart';
import 'presentacion/tema.dart';

/// Raíz de la app ciudadana. La pantalla inicial depende únicamente del estado de la sesión:
/// el destino privado es la raíz de navegación (no una ruta apilada), de modo que al salir no
/// queda historial que vuelva a mostrar la identidad.
class AyniSafeApp extends StatefulWidget {
  const AyniSafeApp({
    super.key,
    required this.repositorio,
    required this.sesion,
    required this.contenido,
    required this.perfil,
    this.marcador = const LanzadorMarcadorSistema(),
    this.ahora,
    this.enlaces,
  });

  final AuthRepositorio repositorio;
  final SesionControlador sesion;

  /// Contenido público (sin sesión) y perfil propio (con sesión). Los repositorios se inyectan.
  final ContenidoRepositorio contenido;
  final PerfilRepositorio perfil;
  final LanzadorMarcador marcador;
  final DateTime Function()? ahora;

  /// Enlaces entrantes del correo (recuperación y activación). Opcional: sin él solo funciona el
  /// código pegado a mano.
  final FuenteDeEnlaces? enlaces;

  @override
  State<AyniSafeApp> createState() => _AyniSafeAppState();
}

class _AyniSafeAppState extends State<AyniSafeApp> {
  final GlobalKey<NavigatorState> _navegador = GlobalKey<NavigatorState>();
  EstadoSesion? _anterior;
  StreamSubscription<Uri>? _suscripcionEnlaces;

  /// Token del enlace pendiente de abrir (solo en memoria). Espera a que termine la restauración.
  String? _tokenPendiente;
  String? _ultimoToken;
  DateTime? _ultimoMomento;

  late final FlujoRecuperacion _flujo = FlujoRecuperacion(
    repositorio: widget.repositorio,
    sesion: widget.sesion,
    ahora: widget.ahora,
  );

  @override
  void initState() {
    super.initState();
    _anterior = widget.sesion.estado;
    widget.sesion.addListener(_alCambiarSesion);
    _suscripcionEnlaces = widget.enlaces?.recibidos.listen(_alRecibirEnlace);
  }

  @override
  void dispose() {
    _suscripcionEnlaces?.cancel();
    _tokenPendiente = null;
    widget.sesion.removeListener(_alCambiarSesion);
    super.dispose();
  }

  void _alRecibirEnlace(Uri uri) {
    // Nunca se registra el enlace: contiene el token.
    final enlace = interpretarEnlace(uri);
    if (enlace == null) return;
    // Al arrancar en frío el mismo enlace puede llegar dos veces: se ignora el duplicado inmediato.
    final ahora = DateTime.now();
    if (enlace.token == _ultimoToken &&
        _ultimoMomento != null &&
        ahora.difference(_ultimoMomento!) < const Duration(seconds: 3)) {
      return;
    }
    _ultimoToken = enlace.token;
    _ultimoMomento = ahora;
    _tokenPendiente = enlace.token;
    _abrirEnlacePendiente();
  }

  void _abrirEnlacePendiente() {
    final token = _tokenPendiente;
    if (token == null) return;
    // No se abre nada mientras se verifica la sesión guardada: se retoma al terminar.
    if (widget.sesion.estado is SesionRestaurando) return;
    final navegador = _navegador.currentState;
    if (navegador == null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _abrirEnlacePendiente(),
      );
      return;
    }
    _tokenPendiente = null;
    navegador.popUntil((ruta) => ruta.isFirst);
    _flujo.abrirNuevaContrasena(navegador, token);
  }

  void _alCambiarSesion() {
    final nuevo = widget.sesion.estado;
    final cambioDeTipo = _anterior.runtimeType != nuevo.runtimeType;
    _anterior = nuevo;
    // Al entrar o salir del área privada se descartan rutas apiladas (formularios, información).
    // El enlace pendiente se abre después de ese retorno a la raíz, no antes: si no, se cerraría.
    if (cambioDeTipo) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navegador.currentState?.popUntil((ruta) => ruta.isFirst);
        _abrirEnlacePendiente();
      });
    } else if (nuevo is! SesionRestaurando) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _abrirEnlacePendiente(),
      );
    }
  }

  Widget _pantalla(EstadoSesion estado) => switch (estado) {
    SesionRestaurando() => const VerificandoSesionPantalla(),
    // Navegación pública sin cuenta: una instancia por estado anónimo (cada aviso la reinicia).
    SesionAnonima() => ShellCiudadano(
      key: ObjectKey(estado),
      sesion: widget.sesion,
      estado: estado,
      repositorio: widget.repositorio,
      ahora: widget.ahora,
    ),
    // Variante autenticada: una instancia por persona; cambiar de cuenta descarta el estado privado.
    SesionAutenticada(:final usuario) => ShellCiudadano(
      key: ValueKey('cuenta-${usuario.id}'),
      sesion: widget.sesion,
      estado: estado,
      repositorio: widget.repositorio,
      ahora: widget.ahora,
    ),
    SesionNoVerificable() => SesionSinVerificarPantalla(sesion: widget.sesion),
    SesionLimpiezaPendiente() => LimpiezaPendientePantalla(
      sesion: widget.sesion,
      estado: estado,
    ),
  };

  @override
  Widget build(BuildContext context) {
    // Los servicios quedan sobre el navegador: lo usan las pantallas públicas y las privadas.
    return Servicios(
      contenido: widget.contenido,
      perfil: widget.perfil,
      marcador: widget.marcador,
      child: MaterialApp(
        title: 'AyniSafe',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navegador,
        theme: crearTema(),
        home: ListenableBuilder(
          listenable: widget.sesion,
          builder: (context, _) => _pantalla(widget.sesion.estado),
        ),
      ),
    );
  }
}
