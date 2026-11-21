import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/solicitud_recuperacion_controlador.dart';
import '../../datos/auth_repositorio.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Solicitud del enlace de recuperación. Tras el 202 muestra una confirmación neutral: no afirma
/// que el correo corresponda a una cuenta.
class SolicitarRecuperacionPantalla extends StatefulWidget {
  const SolicitarRecuperacionPantalla({
    super.key,
    required this.repositorio,
    this.correoInicial = '',
    this.ahora,
    this.alTenerCodigo,
  });

  final AuthRepositorio repositorio;
  final String correoInicial;
  final DateTime Function()? ahora;

  /// Abre la pantalla para pegar el código manualmente. Opcional: la define quien arma la navegación.
  final VoidCallback? alTenerCodigo;

  static const String textoConfirmacion =
      'Si el correo corresponde a una cuenta, te enviaremos instrucciones para elegir una contraseña nueva. '
      'Revisa también la carpeta de spam. El enlace vale 30 minutos y solo se puede usar una vez.';

  @override
  State<SolicitarRecuperacionPantalla> createState() =>
      _SolicitarRecuperacionPantallaState();
}

class _SolicitarRecuperacionPantallaState
    extends State<SolicitarRecuperacionPantalla> {
  late final SolicitudRecuperacionControlador _controlador =
      SolicitudRecuperacionControlador(widget.repositorio, ahora: widget.ahora);
  late final TextEditingController _correo = TextEditingController(
    text: widget.correoInicial,
  );

  @override
  void dispose() {
    _correo.dispose();
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _enviar() => _controlador.enviar(correo: _correo.text);

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _controlador,
      builder: (context, _) {
        if (_controlador.aceptada) return _confirmacion(context);
        final errores = _controlador.errores;
        final aviso = _controlador.aviso;
        return EstructuraPantalla(
          titulo: 'Recuperar contraseña',
          conBarra: true,
          hijos: [
            const Text(
              'Ingresa el correo de tu cuenta. Si corresponde a una cuenta, te enviaremos un enlace '
              'para elegir una contraseña nueva.',
            ),
            const SizedBox(height: Espaciado.s2),
            if (aviso != null) ...[
              MensajeAccesible(aviso: aviso),
              const SizedBox(height: Espaciado.s2),
            ],
            CampoFormulario(
              etiqueta: 'Correo',
              controlador: _correo,
              error: errores['correo'],
              tipoTeclado: TextInputType.emailAddress,
              accionTeclado: TextInputAction.done,
              pistasAutocompletar: const [AutofillHints.email],
              alCambiar: (_) => _controlador.limpiarError('correo'),
              alEnviar: (_) => _enviar(),
            ),
            const SizedBox(height: Espaciado.s3),
            BotonPrincipal(
              texto: 'Enviar enlace',
              textoCargando: 'Enviando…',
              cargando: _controlador.enviando,
              alPulsar: _enviar,
            ),
            if (widget.alTenerCodigo != null) ...[
              const SizedBox(height: Espaciado.s1),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: widget.alTenerCodigo,
                  child: const Text('Tengo un código'),
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _confirmacion(BuildContext context) {
    return EstructuraPantalla(
      titulo: 'Revisa tu correo',
      conBarra: true,
      hijos: [
        const MensajeAccesible(
          aviso: Aviso(
            TipoAviso.info,
            SolicitarRecuperacionPantalla.textoConfirmacion,
          ),
        ),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(
          texto: 'Volver a iniciar sesión',
          alPulsar: () => Navigator.of(context).maybePop(),
        ),
        const SizedBox(height: Espaciado.s1),
        if (widget.alTenerCodigo != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: widget.alTenerCodigo,
              child: const Text('Tengo un código'),
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: _controlador.reiniciar,
            child: const Text('Usar otro correo'),
          ),
        ),
      ],
    );
  }
}
