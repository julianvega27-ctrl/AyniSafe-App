import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/sesion_controlador.dart';
import '../componentes/boton_principal.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';

/// Verificando con el servidor la sesión guardada. No se muestra contenido privado.
class VerificandoSesionPantalla extends StatelessWidget {
  const VerificandoSesionPantalla({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Semantics(
            liveRegion: true,
            label: 'Verificando tu sesión',
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: Espaciado.s2),
                Text('Verificando tu sesión…'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// No se pudo verificar (sin red o servicio no disponible). Se conserva el token guardado,
/// pero no se habilita el acceso privado.
class SesionSinVerificarPantalla extends StatefulWidget {
  const SesionSinVerificarPantalla({super.key, required this.sesion});

  final SesionControlador sesion;

  @override
  State<SesionSinVerificarPantalla> createState() =>
      _SesionSinVerificarPantallaState();
}

class _SesionSinVerificarPantallaState
    extends State<SesionSinVerificarPantalla> {
  bool _reintentando = false;

  Future<void> _reintentar() async {
    if (_reintentando) return;
    setState(() => _reintentando = true);
    await widget.sesion.restaurar();
    if (mounted) setState(() => _reintentando = false);
  }

  @override
  Widget build(BuildContext context) {
    return EstructuraPantalla(
      titulo: 'No pudimos verificar tu sesión',
      hijos: [
        const MensajeAccesible(
          aviso: Aviso(
            TipoAviso.info,
            'No hay conexión con el servidor o no está disponible por ahora. '
            'Tu sesión sigue guardada en este dispositivo, pero no puedes ver tu cuenta '
            'hasta verificarla.',
          ),
        ),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(
          texto: 'Reintentar',
          textoCargando: 'Verificando…',
          cargando: _reintentando,
          alPulsar: _reintentar,
        ),
        const SizedBox(height: Espaciado.s1),
        TextButton(
          onPressed: _reintentando ? null : widget.sesion.cerrar,
          child: const Text('Cerrar sesión en este dispositivo'),
        ),
      ],
    );
  }
}

/// El borrado seguro del token falló: no se afirma el cierre completo ni se restaura la sesión.
class LimpiezaPendientePantalla extends StatefulWidget {
  const LimpiezaPendientePantalla({
    super.key,
    required this.sesion,
    required this.estado,
  });

  final SesionControlador sesion;
  final SesionLimpiezaPendiente estado;

  @override
  State<LimpiezaPendientePantalla> createState() =>
      _LimpiezaPendientePantallaState();
}

class _LimpiezaPendientePantallaState extends State<LimpiezaPendientePantalla> {
  bool _reintentando = false;

  Future<void> _reintentar() async {
    if (_reintentando) return;
    setState(() => _reintentando = true);
    await widget.sesion.reintentarLimpieza();
    if (mounted) setState(() => _reintentando = false);
  }

  @override
  Widget build(BuildContext context) {
    final remoto = widget.estado.revocadaEnServidor
        ? 'La sesión sí se cerró en el servidor.'
        : 'Tampoco pudimos cerrarla en el servidor: vencerá automáticamente a las 24 horas de iniciada.';
    return EstructuraPantalla(
      titulo: 'Falta terminar de cerrar tu sesión',
      hijos: [
        MensajeAccesible(
          aviso: Aviso(
            TipoAviso.error,
            'No pudimos borrar tu sesión de este dispositivo. Por seguridad no puedes continuar '
            'hasta completar la limpieza. $remoto',
          ),
        ),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(
          texto: 'Reintentar',
          textoCargando: 'Limpiando…',
          cargando: _reintentando,
          alPulsar: _reintentar,
        ),
      ],
    );
  }
}
