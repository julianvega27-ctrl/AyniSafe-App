import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/login_controlador.dart';
import '../../aplicacion/sesion_controlador.dart';
import '../../datos/auth_repositorio.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_contrasena.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/enlaces_publicos.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../flujo_recuperacion.dart';
import '../tema.dart';
import 'registro_pantalla.dart';

/// Inicio de sesión con correo y contraseña. El enlace «Olvidé mi contraseña» abre la recuperación
/// por correo; el acceso ciudadano no exige haber verificado el correo.
class AccesoPantalla extends StatefulWidget {
  const AccesoPantalla({
    super.key,
    required this.repositorio,
    required this.sesion,
    this.avisoDeSesion,
    this.ahora,
  });

  final AuthRepositorio repositorio;
  final SesionControlador sesion;

  /// Aviso de la sesión (por ejemplo, «Cerraste sesión»). El aviso propio del formulario tiene prioridad.
  final Aviso? avisoDeSesion;
  final DateTime Function()? ahora;

  static const String textoOlvide = 'Olvidé mi contraseña';

  @override
  State<AccesoPantalla> createState() => _AccesoPantallaState();
}

class _AccesoPantallaState extends State<AccesoPantalla> {
  late final LoginControlador _login = LoginControlador(
    widget.repositorio,
    ahora: widget.ahora,
  );
  final _correo = TextEditingController();
  final _contrasena = TextEditingController();
  bool _guardando = false;

  @override
  void dispose() {
    _contrasena.clear();
    _contrasena.dispose();
    _correo.dispose();
    _login.dispose();
    super.dispose();
  }

  Future<void> _ingresar() async {
    if (_login.enviando || _guardando) return;
    final emitida = await _login.enviar(
      correo: _correo.text,
      contrasena: _contrasena.text,
    );
    if (emitida == null || !mounted) return;
    setState(() => _guardando = true);
    TextInput.finishAutofillContext();
    // Si el guardado seguro falla, la sesión informa el motivo y no se habilita el acceso privado.
    await widget.sesion.iniciar(emitida);
    if (mounted) setState(() => _guardando = false);
  }

  Future<void> _irARegistro() async {
    final resultado = await Navigator.of(context)
        .push<ResultadoPantallaRegistro>(
          MaterialPageRoute<ResultadoPantallaRegistro>(
            builder: (_) => RegistroPantalla(
              repositorio: widget.repositorio,
              ahora: widget.ahora,
            ),
          ),
        );
    if (resultado == null || !mounted) return;
    // Correo precargado y contraseña vacía.
    _correo.text = resultado.correo;
    _contrasena.clear();
    if (resultado.creada) {
      _login.mostrarAviso(
        const Aviso(
          TipoAviso.exito,
          'Tu cuenta fue creada. Inicia sesión con tu correo y tu contraseña.',
        ),
      );
    }
  }

  void _irARecuperacion() {
    FlujoRecuperacion(
      repositorio: widget.repositorio,
      sesion: widget.sesion,
      ahora: widget.ahora,
    ).abrirSolicitud(Navigator.of(context), correoInicial: _correo.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _login,
      builder: (context, _) {
        final errores = _login.errores;
        final aviso = _login.aviso ?? widget.avisoDeSesion;
        return EstructuraPantalla(
          titulo: 'Inicia sesión',
          hijos: [
            if (aviso != null) ...[
              MensajeAccesible(aviso: aviso),
              const SizedBox(height: Espaciado.s2),
            ],
            AutofillGroup(
              child: Column(
                children: [
                  CampoFormulario(
                    etiqueta: 'Correo',
                    controlador: _correo,
                    error: errores['correo'],
                    tipoTeclado: TextInputType.emailAddress,
                    accionTeclado: TextInputAction.next,
                    pistasAutocompletar: const [AutofillHints.email],
                    alCambiar: (_) => _login.limpiarError('correo'),
                  ),
                  const SizedBox(height: Espaciado.s2),
                  CampoContrasena(
                    controlador: _contrasena,
                    error: errores['contrasena'],
                    accionTeclado: TextInputAction.done,
                    alCambiar: (_) => _login.limpiarError('contrasena'),
                    alEnviar: (_) => _ingresar(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Espaciado.s3),
            BotonPrincipal(
              texto: 'Ingresar',
              textoCargando: 'Ingresando…',
              cargando: _login.enviando || _guardando,
              alPulsar: _ingresar,
            ),
            const SizedBox(height: Espaciado.s2),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: _irARecuperacion,
                child: const Text(AccesoPantalla.textoOlvide),
              ),
            ),
            const SizedBox(height: Espaciado.s1),
            // Wrap: con texto ampliado el enlace baja de línea en vez de desbordar.
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: Espaciado.s1,
              children: [
                const Text('¿No tienes cuenta?'),
                TextButton(
                  onPressed: _irARegistro,
                  child: const Text('Crear cuenta'),
                ),
              ],
            ),
            const SizedBox(height: Espaciado.s1),
            const EnlacesPublicos(),
          ],
        );
      },
    );
  }
}
