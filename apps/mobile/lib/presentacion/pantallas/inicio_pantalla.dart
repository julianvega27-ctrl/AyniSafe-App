import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/auth_repositorio.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/tarjeta_mensaje.dart';
import '../navegacion/destinos.dart';
import '../tema.dart';

/// Inicio con la composición de `screens/home.dart` del origen: lema, título, bloque destacado para
/// reportar y accesos rápidos. Contenido AyniSafe: sin datos DEMO, cifras ni capacidades simuladas.
/// El reporte aún no existe: el bloque lleva al destino Reportar, que explica que está pendiente.
class InicioPantalla extends StatelessWidget {
  const InicioPantalla({
    super.key,
    required this.usuario,
    required this.alNavegar,
    this.aviso,
  });

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
                ? 'Consulta los contactos de emergencia y la información pública sin crear una cuenta.'
                : 'Tu cuenta está lista. Los reportes llegarán en una próxima entrega.',
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
            const MensajeAccesible(
              aviso: Aviso(
                TipoAviso.info,
                'Aún no disponible: tus reportes aparecerán aquí cuando puedas enviarlos.',
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
            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Icon(Icons.schedule, color: Colors.white, size: 20),
                ),
                SizedBox(width: Espaciado.s1),
                Expanded(
                  child: Text(
                    'Disponible próximamente',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
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
