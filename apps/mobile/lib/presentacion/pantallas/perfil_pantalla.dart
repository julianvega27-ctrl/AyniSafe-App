import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/perfil_controlador.dart';
import '../../aplicacion/sesion_controlador.dart';
import '../../datos/perfil_repositorio.dart';
import '../componentes/estructura_pantalla.dart';
import '../componentes/mensaje_accesible.dart';
import '../tema.dart';
import 'contenido_publico_pantalla.dart';
import 'editar_perfil_pantalla.dart';

/// Perfil del ciudadano, abierto desde la cabecera. Agrupa datos personales (el correo es de solo
/// lectura y no se presenta como verificado), preferencias (aún no disponibles), privacidad,
/// información sobre AyniSafe y cierre de sesión.
class PerfilPantalla extends StatefulWidget {
  const PerfilPantalla({
    super.key,
    required this.controlador,
    required this.sesion,
  });

  final PerfilControlador controlador;
  final SesionControlador sesion;

  @override
  State<PerfilPantalla> createState() => _PerfilPantallaState();
}

class _PerfilPantallaState extends State<PerfilPantalla> {
  bool _cerrando = false;
  bool _guardado = false;

  @override
  void initState() {
    super.initState();
    widget.controlador.cargar();
  }

  Future<void> _editar() async {
    widget.controlador.reiniciarEdicion();
    final guardo = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => EditarPerfilPantalla(controlador: widget.controlador),
      ),
    );
    if (mounted) setState(() => _guardado = guardo ?? false);
  }

  void _abrir(SeccionPublica seccion) {
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => ContenidoPublicoPantalla(seccion: seccion),
      ),
    );
  }

  Future<void> _cerrar() async {
    if (_cerrando) return;
    setState(() => _cerrando = true);
    await widget.sesion.cerrar();
    if (mounted) setState(() => _cerrando = false);
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    return ListenableBuilder(
      listenable: widget.controlador,
      builder: (context, _) {
        final c = widget.controlador;
        return EstructuraPantalla(
          titulo: 'Perfil',
          conBarra: true,
          hijos: [
            // Composición de screens/profile.dart del origen: «Mi perfil», tarjetas con icono y salida.
            Semantics(
              header: true,
              child: Text('Mi perfil', style: tema.headlineMedium),
            ),
            const SizedBox(height: Espaciado.s3),
            Semantics(
              header: true,
              child: Text('Datos personales', style: tema.titleMedium),
            ),
            const SizedBox(height: Espaciado.s1),
            if (_guardado) ...[
              const MensajeAccesible(
                aviso: Aviso(TipoAviso.exito, 'Guardamos tus cambios.'),
              ),
              const SizedBox(height: Espaciado.s1),
            ],
            if (c.avisoCarga != null) ...[
              MensajeAccesible(
                aviso: c.avisoCarga!,
                etiquetaAccion: 'Reintentar',
                alAccionar: c.cargar,
              ),
              const SizedBox(height: Espaciado.s1),
            ],
            if (c.carga == CargaPerfil.cargando)
              Semantics(
                label: 'Cargando tu perfil',
                child: const Padding(
                  padding: EdgeInsets.all(Espaciado.s2),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (c.perfil != null)
              _Datos(perfil: c.perfil!, alEditar: _editar),
            const SizedBox(height: Espaciado.s3),
            Semantics(
              header: true,
              child: Text('Preferencias', style: tema.titleMedium),
            ),
            const SizedBox(height: Espaciado.s1),
            const MensajeAccesible(
              aviso: Aviso(
                TipoAviso.info,
                'Aún no disponible: aquí podrás elegir qué alertas recibir.',
              ),
            ),
            const SizedBox(height: Espaciado.s3),
            Semantics(
              header: true,
              child: Text('Información', style: tema.titleMedium),
            ),
            const SizedBox(height: Espaciado.s1),
            _Enlace(
              texto: 'Privacidad',
              icono: Icons.lock_outline,
              alPulsar: () => _abrir(SeccionPublica.privacidad),
            ),
            _Enlace(
              texto: 'Acerca de AyniSafe',
              icono: Icons.info_outline,
              alPulsar: () => _abrir(SeccionPublica.app),
            ),
            _Enlace(
              texto: 'Desarrolladores',
              icono: Icons.groups_outlined,
              alPulsar: () => _abrir(SeccionPublica.desarrolladores),
            ),
            _Enlace(
              texto: 'Contactos de emergencia',
              icono: Icons.call_outlined,
              alPulsar: () => _abrir(SeccionPublica.contactos),
            ),
            const SizedBox(height: Espaciado.s4),
            // Salida del origen (OutlinedButton.icon), con estado de carga y una sola solicitud.
            OutlinedButton.icon(
              onPressed: _cerrando ? null : _cerrar,
              icon: _cerrando
                  ? SizedBox.square(
                      dimension: MediaQuery.textScalerOf(context).scale(18),
                      child: const CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.logout),
              label: Text(_cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'),
            ),
            const SizedBox(height: Espaciado.s2),
          ],
        );
      },
    );
  }
}

class _Datos extends StatelessWidget {
  const _Datos({required this.perfil, required this.alEditar});

  final PerfilCiudadano perfil;
  final VoidCallback alEditar;

  @override
  Widget build(BuildContext context) {
    Widget fila(String etiqueta, String valor, {String? nota}) => Padding(
      padding: const EdgeInsets.only(bottom: Espaciado.s2),
      child: Semantics(
        container: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              etiqueta,
              style: const TextStyle(
                fontSize: 14,
                color: Colores.textoSecundario,
              ),
            ),
            Text(valor),
            if (nota != null)
              Text(
                nota,
                style: const TextStyle(
                  fontSize: 14,
                  color: Colores.textoSecundario,
                ),
              ),
          ],
        ),
      ),
    );

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            fila('Nombre', perfil.nombre),
            fila(
              'Correo',
              perfil.correo,
              nota: 'Solo lectura: no se puede cambiar desde tu perfil.',
            ),
            fila('Teléfono', perfil.telefono ?? 'No registrado'),
            fila(
              'Compartir teléfono',
              perfil.compartirTelefono ? 'Autorizado' : 'No autorizado',
              nota: 'Por ahora no se comparte con ninguna institución.',
            ),
            OutlinedButton(
              onPressed: alEditar,
              child: const Text('Editar datos'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tarjeta con ListTile del perfil del origen (icono, título y chevron).
class _Enlace extends StatelessWidget {
  const _Enlace({
    required this.texto,
    required this.icono,
    required this.alPulsar,
  });

  final String texto;
  final IconData icono;
  final VoidCallback alPulsar;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        minTileHeight: alturaMinimaControl,
        leading: Icon(icono),
        title: Text(texto),
        trailing: const Icon(Icons.chevron_right),
        onTap: alPulsar,
      ),
    );
  }
}
