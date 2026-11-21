import 'package:flutter/material.dart';

import 'campo_formulario.dart';

/// Campo de contraseña con Mostrar/Ocultar. Permite pegar y usar gestores de contraseñas.
/// Alternar la visibilidad no modifica el contenido.
class CampoContrasena extends StatefulWidget {
  const CampoContrasena({
    super.key,
    required this.controlador,
    this.etiqueta = 'Contraseña',
    this.error,
    this.ayuda,
    this.nueva = false,
    this.accionTeclado,
    this.alCambiar,
    this.alEnviar,
    this.habilitado = true,
  });

  final TextEditingController controlador;
  final String etiqueta;
  final String? error;
  final String? ayuda;

  /// true en el registro (contraseña nueva); false al iniciar sesión.
  final bool nueva;
  final TextInputAction? accionTeclado;
  final ValueChanged<String>? alCambiar;
  final ValueChanged<String>? alEnviar;
  final bool habilitado;

  @override
  State<CampoContrasena> createState() => _CampoContrasenaState();
}

class _CampoContrasenaState extends State<CampoContrasena> {
  bool _oculta = true;

  @override
  Widget build(BuildContext context) {
    return CampoFormulario(
      etiqueta: widget.etiqueta,
      controlador: widget.controlador,
      error: widget.error,
      ayuda: widget.ayuda,
      ocultarTexto: _oculta,
      tipoTeclado: TextInputType.visiblePassword,
      accionTeclado: widget.accionTeclado,
      pistasAutocompletar: [
        widget.nueva ? AutofillHints.newPassword : AutofillHints.password,
      ],
      habilitado: widget.habilitado,
      alCambiar: widget.alCambiar,
      alEnviar: widget.alEnviar,
      sufijo: Semantics(
        button: true,
        label: _oculta ? 'Mostrar contraseña' : 'Ocultar contraseña',
        excludeSemantics: true,
        child: TextButton(
          onPressed: widget.habilitado
              ? () => setState(() => _oculta = !_oculta)
              : null,
          child: Text(_oculta ? 'Mostrar' : 'Ocultar'),
        ),
      ),
    );
  }
}
