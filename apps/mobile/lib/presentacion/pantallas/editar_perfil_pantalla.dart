import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/perfil_controlador.dart';
import '../../aplicacion/validacion.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Edición de nombre y teléfono (opcional) con la autorización de compartirlo. El correo no se
/// edita. Devuelve `true` al volver solo si el servidor confirmó el guardado.
class EditarPerfilPantalla extends StatefulWidget {
  const EditarPerfilPantalla({super.key, required this.controlador});

  final PerfilControlador controlador;

  @override
  State<EditarPerfilPantalla> createState() => _EditarPerfilPantallaState();
}

class _EditarPerfilPantallaState extends State<EditarPerfilPantalla> {
  late final TextEditingController _nombre;
  late final TextEditingController _telefono;
  late bool _compartir;
  late final String _telefonoOriginal;

  @override
  void initState() {
    super.initState();
    final perfil = widget.controlador.perfil;
    _nombre = TextEditingController(text: perfil?.nombre ?? '');
    _telefono = TextEditingController(text: perfil?.telefono ?? '');
    _compartir = perfil?.compartirTelefono ?? false;
    _telefonoOriginal = perfil?.telefono ?? '';
  }

  @override
  void dispose() {
    _nombre.dispose();
    _telefono.dispose();
    super.dispose();
  }

  bool get _hayTelefono {
    final normal = telefonoNormalizado(_telefono.text);
    return normal != null && normal.isNotEmpty;
  }

  void _alCambiarTelefono(String _) {
    widget.controlador.limpiarError('telefono');
    widget.controlador.limpiarError('compartirTelefono');
    final normal = telefonoNormalizado(_telefono.text);
    setState(() {
      // La autorización se dio para otro número: si cambia o se borra, hay que volver a decidir.
      if (normal != _telefonoOriginal) _compartir = false;
      if (!_hayTelefono) _compartir = false;
    });
  }

  Future<void> _guardar() async {
    final guardo = await widget.controlador.guardar(
      nombre: _nombre.text,
      telefono: _telefono.text,
      compartirTelefono: _compartir,
    );
    if (guardo && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controlador,
      builder: (context, _) {
        final c = widget.controlador;
        final errores = c.errores;
        final errorCompartir = errores['compartirTelefono'];
        return EstructuraPantalla(
          titulo: 'Editar datos',
          conBarra: true,
          hijos: [
            if (c.avisoEdicion != null) ...[
              MensajeAccesible(aviso: c.avisoEdicion!),
              const SizedBox(height: Espaciado.s2),
            ],
            CampoFormulario(
              etiqueta: 'Nombre',
              controlador: _nombre,
              error: errores['nombre'],
              tipoTeclado: TextInputType.name,
              accionTeclado: TextInputAction.next,
              capitalizacion: TextCapitalization.words,
              pistasAutocompletar: const [AutofillHints.name],
              habilitado: !c.guardando,
              alCambiar: (_) => c.limpiarError('nombre'),
            ),
            const SizedBox(height: Espaciado.s2),
            CampoFormulario(
              etiqueta: 'Teléfono (opcional)',
              controlador: _telefono,
              error: errores['telefono'],
              ayuda: ayudaTelefono,
              tipoTeclado: TextInputType.phone,
              accionTeclado: TextInputAction.done,
              pistasAutocompletar: const [AutofillHints.telephoneNumber],
              habilitado: !c.guardando,
              alCambiar: _alCambiarTelefono,
            ),
            const SizedBox(height: Espaciado.s2),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              minTileHeight: alturaMinimaControl,
              title: const Text('Autorizo compartir mi teléfono'),
              subtitle: const Text(
                'Por ahora no se comparte con ninguna institución. Si autorizas, solo se '
                'usaría, con tu consentimiento, para las instituciones del caso que reportes. '
                'Puedes revocarlo cuando quieras. Si cambias o borras el número, deberás volver a autorizarlo.',
              ),
              value: _compartir,
              onChanged: (_hayTelefono && !c.guardando)
                  ? (v) {
                      setState(() => _compartir = v);
                      c.limpiarError('compartirTelefono');
                    }
                  : null,
            ),
            if (errorCompartir != null) ...[
              const SizedBox(height: Espaciado.s1),
              MensajeAccesible(aviso: Aviso(TipoAviso.error, errorCompartir)),
            ],
            const SizedBox(height: Espaciado.s3),
            BotonPrincipal(
              texto: 'Guardar cambios',
              textoCargando: 'Guardando…',
              cargando: c.guardando,
              alPulsar: _guardar,
            ),
            const SizedBox(height: Espaciado.s2),
          ],
        );
      },
    );
  }
}
