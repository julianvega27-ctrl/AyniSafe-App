import 'package:flutter/material.dart';

import '../../aplicacion/sesion_controlador.dart';
import '../componentes/boton_principal.dart';
import '../componentes/estructura_pantalla.dart';
import '../tema.dart';

/// Destino autenticado mínimo. No implementa Inicio, Reportes, Mapa ni Alertas: solo muestra
/// la identidad del propietario y permite cerrar sesión.
class SesionIniciadaPantalla extends StatefulWidget {
  const SesionIniciadaPantalla({
    super.key,
    required this.sesion,
    required this.estado,
  });

  final SesionControlador sesion;
  final SesionAutenticada estado;

  @override
  State<SesionIniciadaPantalla> createState() => _SesionIniciadaPantallaState();
}

class _SesionIniciadaPantallaState extends State<SesionIniciadaPantalla> {
  bool _cerrando = false;

  String _vencimiento(DateTime fecha) {
    final l = fecha.toLocal();
    String d2(int n) => n.toString().padLeft(2, '0');
    return '${d2(l.day)}/${d2(l.month)}/${l.year} a las ${d2(l.hour)}:${d2(l.minute)}';
  }

  Future<void> _cerrar() async {
    if (_cerrando) return;
    setState(() => _cerrando = true);
    await widget.sesion.cerrar();
    if (mounted) setState(() => _cerrando = false);
  }

  @override
  Widget build(BuildContext context) {
    final usuario = widget.estado.usuario;
    return EstructuraPantalla(
      titulo: 'Sesión iniciada',
      hijos: [
        Text(
          'Hola, ${usuario.nombre}',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: Espaciado.s1),
        Text('Correo: ${usuario.correo}'),
        const SizedBox(height: Espaciado.s1),
        Text('Tu sesión vence el ${_vencimiento(widget.estado.expiresAt)}.'),
        const SizedBox(height: Espaciado.s2),
        const Text(
          'Esta versión solo incluye el acceso a tu cuenta. '
          'Por ahora no hay otras funciones disponibles.',
          style: TextStyle(color: Colores.textoSecundario),
        ),
        const SizedBox(height: Espaciado.s3),
        BotonPrincipal(
          texto: 'Cerrar sesión',
          textoCargando: 'Cerrando sesión…',
          cargando: _cerrando,
          alPulsar: _cerrar,
        ),
      ],
    );
  }
}
