import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/nueva_contrasena_controlador.dart';
import '../../aplicacion/validacion.dart';
import '../../datos/auth_repositorio.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_contrasena.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Elegir una contraseña nueva con un enlace o código: recuperación de contraseña y activación de
/// una cuenta invitada (el servidor indica cuál es). Al terminar, [alCompletar] vuelve al acceso;
/// esta pantalla nunca inicia sesión.
class NuevaContrasenaPantalla extends StatefulWidget {
  const NuevaContrasenaPantalla({
    super.key,
    required this.repositorio,
    required this.token,
    required this.alCompletar,
    this.alSolicitarOtro,
    this.ahora,
  });

  final AuthRepositorio repositorio;

  /// Token del enlace o código pegado; solo vive en memoria mientras la pantalla está abierta.
  final String token;

  /// Se llama tras el 204, con el propósito cumplido.
  final void Function(PropositoToken proposito) alCompletar;

  /// Abre la solicitud de un enlace nuevo (enlace usado, vencido o inválido).
  final VoidCallback? alSolicitarOtro;
  final DateTime Function()? ahora;

  @override
  State<NuevaContrasenaPantalla> createState() =>
      _NuevaContrasenaPantallaState();
}

class _NuevaContrasenaPantallaState extends State<NuevaContrasenaPantalla> {
  late final NuevaContrasenaControlador _controlador =
      NuevaContrasenaControlador(
        widget.repositorio,
        token: widget.token,
        ahora: widget.ahora,
      );
  final TextEditingController _contrasena = TextEditingController();

  @override
  void initState() {
    super.initState();
    _controlador.consultar();
  }

  @override
  void dispose() {
    // La contraseña y el token se descartan de la memoria al salir; nunca se guardan.
    _contrasena.clear();
    _contrasena.dispose();
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final cumplido = await _controlador.enviar(_contrasena.text);
    if (cumplido == null || !mounted) return;
    _contrasena.clear();
    widget.alCompletar(cumplido);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _controlador,
      builder: (context, _) => switch (_controlador.fase) {
        FaseNuevaContrasena.verificando => _verificando(),
        FaseNuevaContrasena.formulario => _formulario(),
        FaseNuevaContrasena.noVerificable => _noVerificable(),
        FaseNuevaContrasena.enlaceUsado => _enlaceNoVigente(
          'Este enlace ya se usó o fue reemplazado por uno más reciente.',
        ),
        FaseNuevaContrasena.enlaceVencido => _enlaceNoVigente(
          'Este enlace venció. Los enlaces valen un tiempo limitado.',
        ),
        FaseNuevaContrasena.enlaceInvalido => _enlaceNoVigente(
          'Este enlace o código no es válido. Revisa que esté completo.',
        ),
      },
    );
  }

  Widget _verificando() {
    return Scaffold(
      appBar: AppBar(title: const Text('Verificando enlace')),
      body: SafeArea(
        child: Center(
          child: Semantics(
            liveRegion: true,
            label: 'Verificando el enlace',
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: Espaciado.s2),
                Text('Verificando el enlace…'),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _formulario() {
    final activando = _controlador.proposito == PropositoToken.activacion;
    final errores = _controlador.errores;
    final aviso = _controlador.aviso;
    return EstructuraPantalla(
      titulo: activando ? 'Activa tu cuenta' : 'Nueva contraseña',
      conBarra: true,
      hijos: [
        Text(
          activando
              ? 'Elige la contraseña con la que ingresarás a AyniSafe.'
              : 'Elige una contraseña nueva para tu cuenta. Al cambiarla cerraremos tus otras sesiones.',
        ),
        const SizedBox(height: Espaciado.s2),
        if (aviso != null) ...[
          MensajeAccesible(aviso: aviso),
          const SizedBox(height: Espaciado.s2),
        ],
        CampoContrasena(
          controlador: _contrasena,
          etiqueta: 'Contraseña nueva',
          ayuda: ayudaContrasena,
          nueva: true,
          error: errores['contrasena'],
          accionTeclado: TextInputAction.done,
          alCambiar: (_) => _controlador.limpiarError('contrasena'),
          alEnviar: (_) => _enviar(),
        ),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(
          texto: activando ? 'Activar cuenta' : 'Cambiar contraseña',
          textoCargando: 'Guardando…',
          cargando: _controlador.enviando,
          alPulsar: _enviar,
        ),
      ],
    );
  }

  Widget _noVerificable() {
    final aviso = _controlador.aviso;
    return EstructuraPantalla(
      titulo: 'No pudimos verificar el enlace',
      conBarra: true,
      hijos: [
        if (aviso != null) MensajeAccesible(aviso: aviso),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(
          texto: 'Reintentar',
          alPulsar: _controlador.consultar,
        ),
      ],
    );
  }

  Widget _enlaceNoVigente(String texto) {
    return EstructuraPantalla(
      titulo: 'Enlace no disponible',
      conBarra: true,
      hijos: [
        MensajeAccesible(aviso: Aviso(TipoAviso.error, texto)),
        const SizedBox(height: Espaciado.s3),
        if (widget.alSolicitarOtro != null)
          BotonPrincipal(
            texto: 'Solicitar otro enlace',
            alPulsar: widget.alSolicitarOtro,
          ),
        const SizedBox(height: Espaciado.s2),
        const Text(
          'Si recibiste una invitación para activar tu cuenta, pide que te envíen una nueva.',
        ),
      ],
    );
  }
}
