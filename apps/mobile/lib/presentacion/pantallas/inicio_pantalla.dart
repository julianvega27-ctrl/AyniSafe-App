import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/auth_repositorio.dart';
import '../../datos/incidentes_repositorio.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/tarjeta_mensaje.dart';
import '../navegacion/destinos.dart';
import '../servicios.dart';
import 'seguimiento_pantallas.dart';
import '../tema.dart';

/// Inicio con la composición de `screens/home.dart` del origen: lema, título, bloque destacado para
/// reportar y accesos rápidos. Contenido AyniSafe: sin datos DEMO, cifras ni capacidades simuladas.
/// Con cuenta muestra hasta tres de los últimos reportes propios obtenidos del servidor.
class InicioPantalla extends StatelessWidget {
  const InicioPantalla({
    super.key,
    required this.usuario,
    required this.alNavegar,
    this.aviso,
    this.obtenerToken,
    this.cuandoSesionInvalida,
    this.visitas = 0,
  });

  /// Aumenta cada vez que se vuelve a Inicio: los últimos reportes se releen del servidor.
  final int visitas;

  /// Token de la cuenta para los últimos reportes; null sin sesión.
  final String? Function()? obtenerToken;
  final VoidCallback? cuandoSesionInvalida;

  /// Persona con sesión verificada, o null en la navegación pública.
  final UsuarioSesion? usuario;
  final void Function(Destino) alNavegar;

  /// Aviso de cierre de sesión mostrado al volver a Inicio público.
  final Aviso? aviso;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final escala = MediaQuery.textScalerOf(context);
    final usuario = this.usuario;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (aviso != null) ...[
            MensajeAccesible(aviso: aviso!),
            const SizedBox(height: Espaciado.s1),
          ],
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            // AyniSafe: aspecto del Chip del origen, pero el texto se ajusta en varias líneas. El Chip
            // de Material recorta la etiqueta con texto al 200 % (también en el origen).
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ExcludeSemantics(
                    child: Icon(
                      Icons.favorite_rounded,
                      size: escala.scale(18),
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: Espaciado.s1),
                  Flexible(
                    child: Text(
                      'Cuidarnos es tarea de todos',
                      style: tema.labelLarge?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Semantics(
            header: true,
            child: Text(
              usuario == null ? 'AyniSafe' : 'Hola, ${usuario.nombre}',
              style: tema.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: Espaciado.s1),
          Text(
            usuario == null
                ? 'Reporta un incidente sin crear una cuenta y consulta los contactos de emergencia.'
                : 'Reporta un incidente y sigue el estado de tus reportes.',
          ),
          const SizedBox(height: 22),
          _BloqueReportar(alPulsar: () => alNavegar(Destino.reportar)),
          const SizedBox(height: 26),
          Semantics(
            header: true,
            child: Text(
              '¿Qué necesitas hacer?',
              style: tema.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, limites) {
              final ancho = limites.maxWidth < 280 || escala.scale(1) > 1.3
                  ? limites.maxWidth
                  : (limites.maxWidth - 12) / 2;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final acceso in _accesos)
                    SizedBox(
                      width: ancho,
                      child: _AccesoRapido(
                        acceso: acceso,
                        alPulsar: () => alNavegar(acceso.destino),
                      ),
                    ),
                ],
              );
            },
          ),
          if (usuario != null) ...[
            const SizedBox(height: 20),
            Semantics(
              header: true,
              child: Text('Mis últimos reportes', style: tema.titleMedium),
            ),
            const SizedBox(height: Espaciado.s1),
            _UltimosReportes(
              visitas: visitas,
              obtenerToken: obtenerToken ?? () => null,
              cuandoSesionInvalida: cuandoSesionInvalida ?? () {},
              alVerTodos: () => alNavegar(Destino.misReportes),
            ),
          ] else ...[
            const SizedBox(height: 20),
            Card(
              child: ListTile(
                leading: const Icon(Icons.manage_search),
                title: const Text('Consultar con código'),
                subtitle: const Text(
                  'Si reportaste sin cuenta, revisa el estado con tu referencia y código.',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => alNavegar(Destino.consultarCodigo),
              ),
            ),
          ],
          const SizedBox(height: 14),
          const TarjetaMensaje(
            icono: Icons.shield_outlined,
            child: Text(
              'Para una emergencia, abre Contactos y llama al servicio correspondiente.',
            ),
          ),
          const SizedBox(height: Espaciado.s2),
        ],
      ),
    );
  }
}

typedef _Acceso = ({
  IconData icono,
  String titulo,
  String detalle,
  Color color,
  Destino destino,
});

/// Accesos rápidos del origen con su estado real en AyniSafe.
const List<_Acceso> _accesos = [
  (
    icono: Icons.map_rounded,
    titulo: 'Ver el mapa',
    detalle: 'Aún no disponible',
    color: Colores.acentoMapa,
    destino: Destino.mapa,
  ),
  (
    icono: Icons.call_rounded,
    titulo: 'Buscar ayuda',
    detalle: 'Contactos de emergencia',
    color: Colores.acentoAyuda,
    destino: Destino.contactos,
  ),
  (
    icono: Icons.notifications_active_rounded,
    titulo: 'Ver alertas',
    detalle: 'Aún no disponible',
    color: Colores.acentoAlertas,
    destino: Destino.alertas,
  ),
  (
    icono: Icons.info_rounded,
    titulo: 'Conoce AyniSafe',
    detalle: 'Finalidad y privacidad',
    color: Colores.principal,
    destino: Destino.informacion,
  ),
];

class _BloqueReportar extends StatelessWidget {
  const _BloqueReportar({required this.alPulsar});
  final VoidCallback alPulsar;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        // AyniSafe: el tercer tono del origen (#209B86) no alcanza 4,5:1 con texto blanco de 16.
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colores.cabecera, Colores.semilla],
        ),
        borderRadius: BorderRadius.circular(Radios.destacado),
        boxShadow: const [
          BoxShadow(
            color: Color(0x26087C72),
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ExcludeSemantics(
              child: Icon(
                Icons.health_and_safety_rounded,
                color: Colores.iconoSobreOscuro,
                size: 54,
              ),
            ),
            const SizedBox(height: 14),
            Semantics(
              header: true,
              child: const Text(
                '¿Necesitas reportar?',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Elige la categoría, describe lo que pasa y marca el punto. Reportar no reemplaza una llamada de emergencia.',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: alPulsar,
              icon: const Icon(Icons.arrow_forward),
              label: const Text('Reportar un incidente'),
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF0D796F),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccesoRapido extends StatelessWidget {
  const _AccesoRapido({required this.acceso, required this.alPulsar});
  final _Acceso acceso;
  final VoidCallback alPulsar;

  @override
  Widget build(BuildContext context) {
    final radio = BorderRadius.circular(Radios.tarjeta);
    return Material(
      color: Colores.superficie,
      borderRadius: radio,
      child: InkWell(
        borderRadius: radio,
        onTap: alPulsar,
        child: Padding(
          padding: const EdgeInsets.all(Espaciado.s2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: acceso.color.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(Radios.control),
                ),
                child: Icon(acceso.icono, color: acceso.color, size: 28),
              ),
              const SizedBox(height: 12),
              Text(
                acceso.titulo,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                acceso.detalle,
                style: const TextStyle(color: Colores.textoSecundario),
              ),
              const SizedBox(height: Espaciado.s1),
              ExcludeSemantics(
                child: Icon(
                  Icons.arrow_forward_rounded,
                  color: acceso.color,
                  size: 20,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hasta tres reportes propios del servidor, o su estado vacío o de error. Sin datos de ejemplo.
class _UltimosReportes extends StatefulWidget {
  const _UltimosReportes({
    required this.obtenerToken,
    required this.cuandoSesionInvalida,
    required this.alVerTodos,
    required this.visitas,
  });
  final int visitas;
  final String? Function() obtenerToken;
  final VoidCallback cuandoSesionInvalida;
  final VoidCallback alVerTodos;

  @override
  State<_UltimosReportes> createState() => _UltimosReportesState();
}

class _UltimosReportesState extends State<_UltimosReportes> {
  Consulta<PaginaHistorial>? _r;
  bool _iniciado = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_iniciado) {
      _iniciado = true;
      _cargar();
    }
  }

  @override
  void didUpdateWidget(_UltimosReportes anterior) {
    super.didUpdateWidget(anterior);
    if (anterior.visitas != widget.visitas) _cargar();
  }

  Future<void> _cargar() async {
    final token = widget.obtenerToken();
    if (token == null) return;
    setState(() => _r = null);
    final r = await Servicios.of(context).incidentes.misIncidentes(token);
    if (!mounted) return;
    if (r is ConsultaSesionInvalida<PaginaHistorial>) {
      widget.cuandoSesionInvalida();
      return;
    }
    setState(() => _r = r);
  }

  @override
  Widget build(BuildContext context) {
    return switch (_r) {
      null => const Center(
        child: CircularProgressIndicator(
          semanticsLabel: 'Cargando tus últimos reportes',
        ),
      ),
      ConsultaObtenida(:final valor) when valor.elementos.isEmpty =>
        const MensajeAccesible(
          aviso: Aviso(
            TipoAviso.info,
            'Aún no tienes reportes. Cuando envíes uno, aparecerá aquí.',
          ),
        ),
      ConsultaObtenida(:final valor) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final e in valor.elementos.take(3))
            Card(
              child: ListTile(
                title: Text(e.referencia),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [Text(e.categoria), EtiquetaEstado(e.estado)],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: widget.alVerTodos,
              ),
            ),
          TextButton(
            onPressed: widget.alVerTodos,
            child: const Text('Ver todos mis reportes'),
          ),
        ],
      ),
      _ => MensajeAccesible(
        aviso: const Aviso(
          TipoAviso.error,
          'No se pudieron cargar tus últimos reportes.',
        ),
        etiquetaAccion: 'Reintentar',
        alAccionar: _cargar,
      ),
    };
  }
}
