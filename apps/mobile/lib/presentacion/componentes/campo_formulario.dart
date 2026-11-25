import 'package:flutter/material.dart';

import '../tema.dart';

/// Campo con etiqueta persistente, ayuda, error (texto + icono) y compatibilidad con
/// autocompletado y pegado. Altura mínima de 48 y texto base de 16 vía el tema.
class CampoFormulario extends StatelessWidget {
  const CampoFormulario({
    super.key,
    required this.etiqueta,
    required this.controlador,
    this.error,
    this.ayuda,
    this.tipoTeclado,
    this.accionTeclado,
    this.pistasAutocompletar,
    this.capitalizacion = TextCapitalization.none,
    this.ocultarTexto = false,
    this.sufijo,
    this.habilitado = true,
    this.alCambiar,
    this.alEnviar,
  });

  final String etiqueta;
  final TextEditingController controlador;
  final String? error;
  final String? ayuda;
  final TextInputType? tipoTeclado;
  final TextInputAction? accionTeclado;
  final Iterable<String>? pistasAutocompletar;
  final TextCapitalization capitalizacion;
  final bool ocultarTexto;
  final Widget? sufijo;
  final bool habilitado;
  final ValueChanged<String>? alCambiar;
  final ValueChanged<String>? alEnviar;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controlador,
      enabled: habilitado,
      obscureText: ocultarTexto,
      keyboardType: tipoTeclado,
      textInputAction: accionTeclado,
      autofillHints: pistasAutocompletar,
      textCapitalization: capitalizacion,
      // Las contraseñas no se autocorrigen ni se sugieren; el pegado siempre está permitido.
      autocorrect: !ocultarTexto,
      enableSuggestions: !ocultarTexto,
      enableInteractiveSelection: true,
      onChanged: alCambiar,
      onSubmitted: alEnviar,
      decoration: InputDecoration(
        labelText: etiqueta,
        helperText: ayuda,
        // Posición del botón de visibilidad del origen (suffixIcon): no aumenta el alto del campo.
        suffixIcon: sufijo == null
            ? null
            : Padding(padding: const EdgeInsets.only(right: 8), child: sufijo),
        // El error combina icono y texto: no depende solo del color.
        error: error == null ? null : _ErrorDeCampo(error!),
      ),
    );
  }
}

class _ErrorDeCampo extends StatelessWidget {
  const _ErrorDeCampo(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Icon(
              Icons.error_outline,
              // El icono crece con el texto ampliado.
              size: MediaQuery.textScalerOf(context).scale(20),
              color: Colores.error,
            ),
          ),
          const SizedBox(width: Espaciado.s1),
          Expanded(
            child: Text(
              texto,
              style: const TextStyle(
                fontSize: 14,
                color: Colores.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
