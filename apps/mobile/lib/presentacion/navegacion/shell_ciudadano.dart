import 'package:flutter/material.dart';

import '../../aplicacion/perfil_controlador.dart';
import '../../aplicacion/sesion_controlador.dart';
import '../componentes/destino_pendiente.dart';
import '../pantallas/inicio_pantalla.dart';
import '../pantallas/perfil_pantalla.dart';
import '../servicios.dart';
import '../tema.dart';

/// Estructura de la app con sesión verificada: Inicio, Mapa, Mis reportes y Alertas en la barra
/// inferior, y el perfil desde la cabecera. Solo existe bajo `SesionAutenticada`: al cerrar sesión
/// la raíz cambia y no queda historial que vuelva a mostrar datos privados.
///
/// El estado de cada pestaña se conserva al cambiar entre ellas. El retroceso del sistema en una
/// pestaña distinta de Inicio vuelve a Inicio.
class ShellCiudadano extends StatefulWidget {
  const ShellCiudadano({super.key, required this.sesion, required this.estado});

  final SesionControlador sesion;
  final SesionAutenticada estado;

  @override
  State<ShellCiudadano> createState() => _ShellCiudadanoState();
}

class _ShellCiudadanoState extends State<ShellCiudadano> {
  int _indice = 0;
  PerfilControlador? _perfil;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // El perfil vive en memoria mientras exista el shell: se descarta al salir de la sesión.
    _perfil ??= PerfilControlador(
      repositorio: Servicios.of(context).perfil,
      obtenerToken: () => widget.sesion.token,
      cuandoSesionInvalida: widget.sesion.alSesionInvalida,
      cuandoCambiaUsuario: widget.sesion.actualizarUsuario,
    );
  }

  @override
  void dispose() {
    _perfil?.dispose();
    super.dispose();
  }

  void _abrirPerfil() {
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) =>
            PerfilPantalla(controlador: _perfil!, sesion: widget.sesion),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _indice == 0,
      onPopInvokedWithResult: (volvio, _) {
        if (!volvio) setState(() => _indice = 0);
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('AyniSafe'),
          actions: [
            IconButton(
              tooltip: 'Perfil',
              // Objetivo táctil explícito de al menos 48×48 (guía de UI).
              style: IconButton.styleFrom(
                minimumSize: const Size.square(alturaMinimaControl),
              ),
              icon: const Icon(Icons.account_circle_outlined),
              onPressed: _abrirPerfil,
            ),
          ],
        ),
        body: IndexedStack(
          index: _indice,
          children: [
            InicioPantalla(estado: widget.estado),
            const DestinoPendiente(
              titulo: 'Mapa',
              icono: Icons.map_outlined,
              explicacion:
                  'Aquí verás los incidentes publicados, con filtros por distrito, categoría y período.',
            ),
            const DestinoPendiente(
              titulo: 'Mis reportes',
              icono: Icons.assignment_outlined,
              explicacion:
                  'Aquí verás tus reportes y el seguimiento privado de cada envío.',
            ),
            const DestinoPendiente(
              titulo: 'Alertas',
              icono: Icons.notifications_none,
              explicacion:
                  'Aquí verás tus avisos y podrás elegir cuáles recibir.',
            ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _indice,
          onDestinationSelected: (i) => setState(() => _indice = i),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'Inicio',
            ),
            NavigationDestination(
              icon: Icon(Icons.map_outlined),
              selectedIcon: Icon(Icons.map),
              label: 'Mapa',
            ),
            NavigationDestination(
              icon: Icon(Icons.assignment_outlined),
              selectedIcon: Icon(Icons.assignment),
              label: 'Mis reportes',
            ),
            NavigationDestination(
              icon: Icon(Icons.notifications_none),
              selectedIcon: Icon(Icons.notifications),
              label: 'Alertas',
            ),
          ],
        ),
      ),
    );
  }
}
