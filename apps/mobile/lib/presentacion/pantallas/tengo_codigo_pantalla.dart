import 'package:flutter/material.dart';

import '../componentes/boton_principal.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/estructura_pantalla.dart';
import '../tema.dart';

/// Alternativa manual al enlace: pegar el código que llegó en el correo. El código solo vive en
/// memoria; se descarta al salir.
class TengoCodigoPantalla extends StatefulWidget {
  const TengoCodigoPantalla({super.key, required this.alContinuar});

  /// Recibe el código sin espacios en los extremos.
  final void Function(String codigo) alContinuar;

  @override
  State<TengoCodigoPantalla> createState() => _TengoCodigoPantallaState();
}

class _TengoCodigoPantallaState extends State<TengoCodigoPantalla> {
  final TextEditingController _codigo = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _codigo.clear();
    _codigo.dispose();
    super.dispose();
  }

  void _continuar() {
    final codigo = _codigo.text.trim();
    if (codigo.isEmpty) {
      setState(() => _error = 'Pega el código del correo.');
      return;
    }
    setState(() => _error = null);
    widget.alContinuar(codigo);
  }

  @override
  Widget build(BuildContext context) {
    return EstructuraPantalla(
      titulo: 'Tengo un código',
      conBarra: true,
      hijos: [
        const Text(
          'Si el enlace del correo no abrió la app, copia el código que aparece en el mensaje y pégalo aquí.',
        ),
        const SizedBox(height: Espaciado.s2),
        CampoFormulario(
          etiqueta: 'Código',
          controlador: _codigo,
          error: _error,
          tipoTeclado: TextInputType.visiblePassword,
          accionTeclado: TextInputAction.done,
          alCambiar: (_) {
            if (_error != null) setState(() => _error = null);
          },
          alEnviar: (_) => _continuar(),
        ),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(texto: 'Continuar', alPulsar: _continuar),
      ],
    );
  }
}
