import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../aplicacion/perfil_controlador.dart';
import '../../aplicacion/reporte_controlador.dart';
import '../../aplicacion/sesion_controlador.dart';
import '../../datos/auth_repositorio.dart';
import '../componentes/bloque_contactos.dart';
import '../componentes/contenido_cargado.dart';
import '../componentes/destino_pendiente.dart';
import '../pantallas/acceso_pantalla.dart';
import '../pantallas/contenido_publico_pantalla.dart';
import '../pantallas/inicio_pantalla.dart';
import '../pantallas/perfil_pantalla.dart';
import '../pantallas/reporte_pantalla.dart';
import '../pantallas/seguimiento_pantallas.dart';
import '../servicios.dart';
import '../tema.dart';
import 'destinos.dart';

/// Navegación ciudadana del origen (`CitizenShell`): AppBar con acceso a la cuenta, Drawer y barra
/// inferior Inicio/Reportar/Mapa/Contactos. Tiene dos variantes:
///
/// * pública (`SesionAnonima`): sin perfil ni historial; la cuenta abre el acceso y registro vigentes;
/// * autenticada (`SesionAutenticada`): agrega perfil y Mis reportes.
///
/// La app crea una instancia distinta por variante y persona, de modo que al cerrar sesión, vencer o
/// cambiar de persona se descarta la pila y el estado privado. El estado de cada destino se conserva
/// mientras dura la instancia; el retroceso desde otro destino vuelve a Inicio.
class ShellCiudadano extends StatefulWidget {
  const ShellCiudadano({
    super.key,
    required this.sesion,
    required this.estado,
    required this.repositorio,
    this.ahora,
  });

  final SesionControlador sesion;

  /// `SesionAnonima` o `SesionAutenticada`.
  final EstadoSesion estado;
  final AuthRepositorio repositorio;
  final DateTime Function()? ahora;

  @override
  State<ShellCiudadano> createState() => _ShellCiudadanoState();
}

class _ShellCiudadanoState extends State<ShellCiudadano> {
  late Destino _actual;

  /// Destinos ya abiertos: se construyen al visitarlos (sin consultas anticipadas) y luego conservan
  /// su estado.
  final Set<Destino> _visitados = {};
  PerfilControlador? _perfil;

  /// Formulario de reporte: vive con el shell, de modo que cambiar de destino no pierde lo escrito.
  /// Con sesión envía con la cuenta; sin sesión, como invitado.
  ReporteControlador? _reporte;

  /// Cambia al volver a Inicio: los últimos reportes se vuelven a leer sin perder el estado de Inicio.
  int _visitasInicio = 0;

  UsuarioSesion? get _usuario => switch (widget.estado) {
    SesionAutenticada(:final usuario) => usuario,
    _ => null,
  };

  @override
  void initState() {
    super.initState();
    final estado = widget.estado;
    // Sin sesión y con un aviso que pide ingresar (vencida, contraseña nueva) se abre la cuenta, como
    // el origen; tras un cierre voluntario se vuelve a Inicio con el aviso.
    _actual =
        estado is SesionAnonima && estado.aviso != null && !estado.porCierre
        ? Destino.cuenta
        : Destino.inicio;
    _visitados.add(_actual);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // El perfil vive en memoria mientras exista el shell autenticado: se descarta al salir.
    if (_usuario != null) {
      _perfil ??= PerfilControlador(
        repositorio: Servicios.of(context).perfil,
        obtenerToken: () => widget.sesion.token,
        cuandoSesionInvalida: widget.sesion.alSesionInvalida,
        cuandoCambiaUsuario: widget.sesion.actualizarUsuario,
      );
    }
  }

  ReporteControlador _controladorReporte() => _reporte ??= ReporteControlador(
    repositorio: Servicios.of(context).incidentes,
    ubicacion: Servicios.of(context).ubicacion,
    guardadas: Servicios.of(context).consultasGuardadas,
    obtenerToken: () => _usuario == null ? null : widget.sesion.token,
    nuevaClave: () => const Uuid().v4(),
    cuandoSesionInvalida: widget.sesion.alSesionInvalida,
    ahora: widget.ahora,
  );

  @override
  void dispose() {
    _perfil?.dispose();
    _reporte?.dispose();
    super.dispose();
  }

  void _navegar(Destino destino) {
    // Mis reportes requiere sesión: sin ella se ofrece la cuenta (sin consultar historial).
    if (destino == Destino.misReportes && _usuario == null) {
      destino = Destino.cuenta;
    }
    if (destino == Destino.cuenta && _usuario != null) {
      _abrirPerfil();
      return;
    }
    setState(() {
      // Volver a Inicio vuelve a leer los últimos reportes (p. ej., tras enviar uno).
      if (destino == Destino.inicio && _actual != Destino.inicio) _visitasInicio += 1;
      _actual = destino;
      _visitados.add(destino);
    });
  }

  void _abrirPerfil() {
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) =>
            PerfilPantalla(controlador: _perfil!, sesion: widget.sesion),
      ),
    );
  }

  /// Destinos visibles en el Drawer según la variante.
  List<Destino> get _destinosMenu => [
    Destino.inicio,
    Destino.reportar,
    Destino.mapa,
    Destino.contactos,
    Destino.alertas,
    Destino.informacion,
    Destino.cuenta,
    if (_usuario != null) Destino.misReportes,
    Destino.consultarCodigo,
  ];

  String _tituloMenu(Destino d) => d == Destino.cuenta
      ? (_usuario == null ? 'Iniciar sesión o crear cuenta' : 'Perfil')
      : d.titulo;

  Widget _pagina(Destino destino) => switch (destino) {
    Destino.inicio => InicioPantalla(
      visitas: _visitasInicio,
      usuario: _usuario,
      alNavegar: _navegar,
      obtenerToken: () => _usuario == null ? null : widget.sesion.token,
      cuandoSesionInvalida: widget.sesion.alSesionInvalida,
      aviso: switch (widget.estado) {
        SesionAnonima(:final aviso, porCierre: true) => aviso,
        _ => null,
      },
    ),
    Destino.reportar => ReportePantalla(
      controlador: _controladorReporte(),
      cargarContornos: Servicios.of(context).incidentes.contornos,
      mostrarTeselas: Servicios.of(context).mostrarTeselas,
      alVerMisReportes: () => _navegar(Destino.misReportes),
      alConsultarCodigo: () => _navegar(Destino.consultarCodigo),
    ),
    Destino.mapa => const DestinoPendiente(
      titulo: 'Mapa',
      icono: Icons.map_outlined,
      explicacion: 'Aquí verás los incidentes publicados, con filtros por distrito, categoría y período.',
    ),
    Destino.contactos => const _Contactos(),
    Destino.alertas => const DestinoPendiente(
      titulo: 'Alertas',
      icono: Icons.warning_amber_outlined,
      explicacion: 'Aquí verás tus avisos y podrás elegir cuáles recibir.',
    ),
    Destino.informacion => const _Informacion(),
    Destino.cuenta => AccesoPantalla(
      key: const ValueKey('acceso'),
      repositorio: widget.repositorio,
      sesion: widget.sesion,
      avisoDeSesion: switch (widget.estado) {
        SesionAnonima(:final aviso, porCierre: false) => aviso,
        _ => null,
      },
      ahora: widget.ahora,
    ),
    Destino.misReportes => MisReportesPantalla(
      repositorio: Servicios.of(context).incidentes,
      obtenerToken: () => widget.sesion.token,
      cuandoSesionInvalida: widget.sesion.alSesionInvalida,
      alReportar: () => _navegar(Destino.reportar),
    ),
    Destino.consultarCodigo => ConsultarCodigoPantalla(
      repositorio: Servicios.of(context).incidentes,
      guardadas: Servicios.of(context).consultasGuardadas,
      ahora: widget.ahora,
    ),
  };

  @override
  Widget build(BuildContext context) {
    final usuario = _usuario;
    return PopScope(
      canPop: _actual == Destino.inicio,
      onPopInvokedWithResult: (volvio, _) {
        if (!volvio) _navegar(Destino.inicio);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_actual.titulo),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(
                // Con texto ampliado el nombre se recorta: la cabecera no desborda en pantallas estrechas.
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.sizeOf(context).width * 0.5,
                  ),
                  // Aspecto del ActionChip del origen (borde, radio 8, punto de color) con un alto de
                  // 48: el chip de Material mide 32-36 y no alcanza el objetivo táctil de AyniSafe.
                  child: Tooltip(
                    message: usuario == null
                        ? 'Iniciar sesión o crear cuenta'
                        : 'Abrir perfil',
                    child: OutlinedButton.icon(
                      onPressed: () => _navegar(Destino.cuenta),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(
                          alturaMinimaControl,
                          alturaMinimaControl,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        side: BorderSide(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                        foregroundColor: Theme.of(context)
                            .colorScheme
                            .onSurface,
                        textStyle: Theme.of(context).textTheme.labelLarge,
                      ),
                      icon: const Icon(
                        Icons.circle,
                        size: 10,
                        color: Colores.semilla,
                      ),
                      label: Text(
                        usuario?.nombre ?? 'Sin cuenta',
                        overflow: TextOverflow.ellipsis,
                        // Anuncia la acción además del nombre visible.
                        semanticsLabel: usuario == null
                            ? 'Sin cuenta. Iniciar sesión o crear cuenta'
                            : 'Abrir perfil de ${usuario.nombre}',
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        drawer: Drawer(
          child: SafeArea(
            child: Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(Espaciado.s3),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colores.cabecera, Colores.semilla],
                    ),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ExcludeSemantics(
                        child: Icon(
                          Icons.health_and_safety_rounded,
                          size: 42,
                          color: Color(0xFF9FF0D5),
                        ),
                      ),
                      SizedBox(height: 12),
                      Text(
                        'AyniSafe',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 24,
                        ),
                      ),
                      Text(
                        'Cuidarnos es tarea de todos',
                        style: TextStyle(color: Colors.white),
                      ),
                    ],
                  ),
                ),
                const Divider(),
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final d in _destinosMenu)
                          ListTile(
                            leading: Icon(d.icono),
                            title: Text(_tituloMenu(d)),
                            selected: _actual == d,
                            onTap: () {
                              Navigator.pop(context);
                              _navegar(d);
                            },
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        body: SafeArea(
          child: IndexedStack(
            index: Destino.values.indexOf(_actual),
            children: [
              for (final d in Destino.values)
                // La cuenta solo se construye mientras está abierta: la contraseña no queda en memoria
                // al salir de ella. Mis reportes no existe sin sesión.
                if (!_visitados.contains(d) ||
                    (d == Destino.cuenta &&
                        (_actual != d || usuario != null)) ||
                    (d == Destino.misReportes && usuario == null))
                  const SizedBox.shrink()
                else
                  _pagina(d),
            ],
          ),
        ),
        bottomNavigationBar: _actual.enBarra
            ? NavigationBar(
                selectedIndex: _actual.index,
                onDestinationSelected: (i) => _navegar(Destino.barra[i]),
                destinations: [
                  for (final d in Destino.barra)
                    NavigationDestination(icon: Icon(d.icono), label: d.titulo),
                ],
              )
            : null,
      ),
    );
  }
}

/// Contactos públicos aprobados (sin sesión). No se inventan números.
class _Contactos extends StatelessWidget {
  const _Contactos();

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(Espaciado.s2),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        Semantics(
          header: true,
          child: Text(
            'Contactos de emergencia',
            style: Theme.of(context).textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: Espaciado.s2),
        ContenidoCargado(
          constructor: (_, contenido) => BloqueContactos(contenido: contenido),
        ),
      ],
    ),
  );
}

/// Información pública versionada («Conoce la app» del origen).
class _Informacion extends StatelessWidget {
  const _Informacion();

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(Espaciado.s2),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        Semantics(
          header: true,
          child: Text(
            'Conoce AyniSafe',
            style: Theme.of(context).textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: Espaciado.s2),
        for (final (seccion, icono) in const [
          (SeccionPublica.app, Icons.info_outline),
          (SeccionPublica.desarrolladores, Icons.groups_outlined),
          (SeccionPublica.privacidad, Icons.lock_outline),
        ])
          Card(
            child: ListTile(
              leading: Icon(icono),
              title: Text(seccion.titulo),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) => ContenidoPublicoPantalla(seccion: seccion),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}
