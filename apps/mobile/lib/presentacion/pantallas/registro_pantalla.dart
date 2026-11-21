import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/registro_controlador.dart';
import '../../aplicacion/validacion.dart';
import '../../datos/auth_repositorio.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_contrasena.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/enlaces_publicos.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Resultado de cerrar el registro: el correo ingresado y si el alta fue confirmada.
typedef ResultadoPantallaRegistro = ({String correo, bool creada});

/// Registro ciudadano en una sola pantalla: nombre, correo y contraseña.
/// No pide DNI, teléfono, rol, ubicación ni notificaciones.
class RegistroPantalla extends StatefulWidget {
  const RegistroPantalla({super.key, required this.repositorio, this.ahora});

  final AuthRepositorio repositorio;
  final DateTime Function()? ahora;

  @override
  State<RegistroPantalla> createState() => _RegistroPantallaState();
}

class _RegistroPantallaState extends State<RegistroPantalla> {
  late final RegistroControlador _controlador = RegistroControlador(
    widget.repositorio,
    ahora: widget.ahora,
  );
  final _nombre = TextEditingController();
  final _correo = TextEditingController();
  final _contrasena = TextEditingController();

  @override
  void dispose() {
    // La contraseña solo existe mientras exista el formulario: se descarta al salir.
    _contrasena.clear();
    _contrasena.dispose();
    _nombre.dispose();
    _correo.dispose();
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _crearCuenta() async {
    final correoCreado = await _controlador.enviar(
      nombre: _nombre.text,
      correo: _correo.text,
      contrasena: _contrasena.text,
    );
    if (correoCreado != null && mounted) {
      TextInput.finishAutofillContext();
      Navigator.of(context)
          .pop<ResultadoPantallaRegistro>((correo: correoCreado, creada: true));
    }
  }

  void _irAIniciarSesion() {
    // Se vuelve al acceso con el correo escrito; la contraseña se descarta.
    Navigator.of(context).pop<ResultadoPantallaRegistro>((
      correo: correoNormalizado(_correo.text),
      creada: false,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _controlador,
      builder: (context, _) {
        final errores = _controlador.errores;
        final aviso = _controlador.aviso;
        return EstructuraPantalla(
          titulo: 'Crea tu cuenta',
          conBarra: true,
          hijos: [
            Text(
              'Solo necesitamos tu nombre, tu correo y una contraseña.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: Espaciado.s2),
            if (aviso != null) ...[
              MensajeAccesible(
                aviso: aviso,
                etiquetaAccion: aviso.accion == AccionAviso.iniciarSesion
                    ? 'Iniciar sesión'
                    : null,
                alAccionar: aviso.accion == AccionAviso.iniciarSesion
                    ? _irAIniciarSesion
                    : null,
              ),
              const SizedBox(height: Espaciado.s2),
            ],
            AutofillGroup(
              child: Column(
                children: [
                  CampoFormulario(
                    etiqueta: 'Nombre',
                    controlador: _nombre,
                    error: errores['nombre'],
                    tipoTeclado: TextInputType.name,
                    accionTeclado: TextInputAction.next,
                    capitalizacion: TextCapitalization.words,
                    pistasAutocompletar: const [AutofillHints.name],
                    alCambiar: (_) => _controlador.limpiarError('nombre'),
                  ),
                  const SizedBox(height: Espaciado.s2),
                  CampoFormulario(
                    etiqueta: 'Correo',
                    controlador: _correo,
                    error: errores['correo'],
                    tipoTeclado: TextInputType.emailAddress,
                    accionTeclado: TextInputAction.next,
                    pistasAutocompletar: const [AutofillHints.email],
                    alCambiar: (_) => _controlador.limpiarError('correo'),
                  ),
                  const SizedBox(height: Espaciado.s2),
                  CampoContrasena(
                    controlador: _contrasena,
                    nueva: true,
                    ayuda: ayudaContrasena,
                    error: errores['contrasena'],
                    accionTeclado: TextInputAction.done,
                    alCambiar: (_) => _controlador.limpiarError('contrasena'),
                    alEnviar: (_) => _crearCuenta(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Espaciado.s3),
            BotonPrincipal(
              texto: 'Crear cuenta',
              textoCargando: 'Creando cuenta…',
              cargando: _controlador.enviando,
              alPulsar: _crearCuenta,
            ),
            const SizedBox(height: Espaciado.s2),
            // Wrap: con texto ampliado el enlace baja de línea en vez de desbordar.
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: Espaciado.s1,
              children: [
                const Text('¿Ya tienes cuenta?'),
                TextButton(
                  onPressed: _irAIniciarSesion,
                  child: const Text('Inicia sesión'),
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
