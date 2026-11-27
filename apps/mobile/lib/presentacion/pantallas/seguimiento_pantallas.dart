import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/consultas_guardadas.dart';
import '../../datos/evaluacion.dart';
import '../../datos/incidentes_repositorio.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/tarjeta_mensaje.dart';
import '../tema.dart';
import '../componentes/fotos_propias.dart';
import 'aclarar_evaluacion_pantalla.dart';
import 'reporte_pantalla.dart' show textoEstadoIncidente;

String _fecha(DateTime d) {
  final l = d.toLocal();
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(l.day)}/${dos(l.month)}/${l.year} ${dos(l.hour)}:${dos(l.minute)}';
}

/// Estado del incidente con texto e icono (nunca solo color).
class EtiquetaEstado extends StatelessWidget {
  const EtiquetaEstado(this.estado, {super.key});
  final String estado;

  @override
  Widget build(BuildContext context) {
    final icono = switch (estado) {
      'REGISTRADO' => Icons.inbox_outlined,
      'EN_REVISION' => Icons.manage_search,
      'EN_ATENCION' => Icons.support_agent,
      'CERRADO' => Icons.task_alt,
      _ => Icons.help_outline,
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(
          child: Icon(
            icono,
            size: MediaQuery.textScalerOf(context).scale(18),
            color: Colores.principal,
          ),
        ),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            'Estado: ${textoEstadoIncidente(estado)}',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

/// La asignación no confirma recepción institucional ni atención (P6).
class BloquePendienteAtencion extends StatelessWidget {
  const BloquePendienteAtencion({super.key, required this.institucion});
  final InstitucionResponsable institucion;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Card(
        child: ListTile(
          leading: const Icon(Icons.account_balance_outlined),
          title: const Text('Institución responsable'),
          subtitle: Text(institucion.nombre ?? 'Pendiente de asignación.'),
        ),
      ),
      const Card(
        child: ListTile(
          leading: Icon(Icons.timeline),
          title: Text('Actuaciones'),
          subtitle: Text('Aún no hay actuaciones registradas.'),
        ),
      ),
    ],
  );
}

/// Evaluación propia del autor (P5.1): sus respuestas con el instante en que las informó, sin
/// presentarlas como estado clínico actual, y la acción para completarlas o aclararlas.
class SeccionEvaluacionPropia extends StatelessWidget {
  const SeccionEvaluacionPropia({
    super.key,
    required this.evaluacion,
    required this.preguntaAtencion,
    required this.alAclarar,
  });

  final EvaluacionPropia evaluacion;
  final bool preguntaAtencion;
  final VoidCallback alAclarar;

  static String _texto(Object? v) => switch (v) {
    null => 'Sin respuesta',
    final Respuesta r => r.texto,
    final SignosVida s => s.texto,
    final CantidadHeridos c => c.esNoSe ? 'No sé' : '${c.valor}',
    _ => '$v',
  };

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final r = evaluacion.respuestas;
    final filas = <(String, Object?)>[
      ('¿Hay heridos?', r.heridos),
      if (preguntaAtencion) ('¿Se necesita atención médica?', r.atencionMedica),
      if (r.heridos == Respuesta.si) ('Personas heridas', r.cantidad),
      ('Signos de vida', r.signosVida),
      ('¿Está consciente?', r.consciente),
      ('¿Hay sangrado visible?', r.sangrado),
    ];
    return Card(
      key: const Key('evaluacionPropia'),
      semanticContainer: false,
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text('Tu evaluación para SAMU', style: tema.titleMedium),
            ),
            Text(
              'Informado el ${_fecha(evaluacion.informadaEn)}. Describe lo que observaste entonces, no el estado actual.',
              style: tema.bodyMedium?.copyWith(color: Colores.textoSecundario),
            ),
            const SizedBox(height: Espaciado.s1),
            for (final (pregunta, valor) in filas)
              MergeSemantics(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: Text(pregunta)),
                      const SizedBox(width: Espaciado.s1),
                      Text(
                        _texto(valor),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            if (evaluacion.solicitudCompletar) ...[
              const SizedBox(height: Espaciado.s1),
              const TarjetaMensaje(
                icono: Icons.medical_services_outlined,
                child: Text(
                  'SAMU interviene en este caso. Si puedes, completa lo que sepas sobre la persona más afectada.',
                ),
              ),
              const SizedBox(height: Espaciado.s1),
              BotonPrincipal(
                texto: 'Completar evaluación',
                alPulsar: alAclarar,
              ),
            ] else if (evaluacion.puedeAclarar) ...[
              const SizedBox(height: Espaciado.s1),
              OutlinedButton.icon(
                onPressed: alAclarar,
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Aclarar evaluación'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// «Mis reportes» con cuenta (composición de `mine.dart` del origen): historial propio del servidor,
/// del más reciente al más antiguo, con carga por páginas y detalle.
class MisReportesPantalla extends StatefulWidget {
  const MisReportesPantalla({
    super.key,
    required this.repositorio,
    required this.obtenerToken,
    required this.cuandoSesionInvalida,
    this.alReportar,
  });

  final IncidentesRepositorio repositorio;
  final String? Function() obtenerToken;
  final VoidCallback cuandoSesionInvalida;
  final VoidCallback? alReportar;

  @override
  State<MisReportesPantalla> createState() => _MisReportesPantallaState();
}

class _MisReportesPantallaState extends State<MisReportesPantalla> {
  final List<ResumenIncidente> _elementos = [];
  String? _siguiente;
  bool _cargando = false;
  bool _cargado = false;
  Aviso? _error;

  @override
  void initState() {
    super.initState();
    _cargar(reiniciar: true);
  }

  Future<void> _cargar({bool reiniciar = false}) async {
    final token = widget.obtenerToken();
    if (token == null || _cargando) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    final r = await widget.repositorio.misIncidentes(
      token,
      cursor: reiniciar ? null : _siguiente,
    );
    if (!mounted) return;
    setState(() {
      _cargando = false;
      switch (r) {
        case ConsultaObtenida(:final valor):
          if (reiniciar) _elementos.clear();
          _elementos.addAll(valor.elementos);
          _siguiente = valor.siguiente;
          _cargado = true;
        case ConsultaSesionInvalida():
          widget.cuandoSesionInvalida();
        case ConsultaSinConexion():
          _error = const Aviso(
            TipoAviso.error,
            'Sin conexión. No se pudieron cargar tus reportes.',
          );
        default:
          _error = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: () => _cargar(reiniciar: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Espaciado.s2),
        children: [
          Semantics(
            header: true,
            child: Text('Mis reportes', style: tema.headlineSmall),
          ),
          const SizedBox(height: Espaciado.s1),
          const Text('Solo ves los incidentes que registraste con tu cuenta.'),
          const SizedBox(height: Espaciado.s2),
          if (_error != null)
            MensajeAccesible(
              aviso: _error!,
              etiquetaAccion: 'Reintentar',
              alAccionar: () => _cargar(reiniciar: !_cargado),
            ),
          if (!_cargado && _cargando)
            const Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Cargando tus reportes',
              ),
            ),
          if (_cargado && _elementos.isEmpty)
            TarjetaMensaje(
              icono: Icons.inbox_outlined,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Aún no tienes reportes registrados con tu cuenta.',
                  ),
                  if (widget.alReportar != null)
                    TextButton(
                      onPressed: widget.alReportar,
                      child: const Text('Reportar un incidente'),
                    ),
                ],
              ),
            ),
          for (final e in _elementos)
            Card(
              child: ListTile(
                title: Text(e.referencia),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${e.categoria} · ${_fecha(e.recibidoEn)}'),
                    EtiquetaEstado(e.estado),
                  ],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    builder: (_) => DetalleIncidentePantalla(
                      repositorio: widget.repositorio,
                      obtenerToken: widget.obtenerToken,
                      referencia: e.referencia,
                      cuandoSesionInvalida: widget.cuandoSesionInvalida,
                    ),
                  ),
                ),
              ),
            ),
          if (_siguiente != null)
            OutlinedButton(
              onPressed: _cargando ? null : _cargar,
              child: Text(_cargando ? 'Cargando…' : 'Cargar más'),
            ),
        ],
      ),
    );
  }
}

/// Detalle privado del autor (`ReportDetail` del origen) sin datos internos ni de otros informantes.
class DetalleIncidentePantalla extends StatefulWidget {
  const DetalleIncidentePantalla({
    super.key,
    required this.repositorio,
    required this.obtenerToken,
    required this.referencia,
    required this.cuandoSesionInvalida,
  });

  final IncidentesRepositorio repositorio;
  final String? Function() obtenerToken;
  final String referencia;
  final VoidCallback cuandoSesionInvalida;

  @override
  State<DetalleIncidentePantalla> createState() =>
      _DetalleIncidentePantallaState();
}

class _DetalleIncidentePantallaState extends State<DetalleIncidentePantalla> {
  Consulta<DetalleIncidente>? _r;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final token = widget.obtenerToken();
    if (token == null) return;
    setState(() => _r = null);
    final r = await widget.repositorio.detalle(token, widget.referencia);
    if (!mounted) return;
    if (r is ConsultaSesionInvalida<DetalleIncidente>) {
      Navigator.of(context).pop();
      widget.cuandoSesionInvalida();
      return;
    }
    setState(() => _r = r);
  }

  /// Abre la aclaración y recarga el detalle si se guardó.
  Future<void> _aclarar(DetalleIncidente d, EvaluacionPropia ev) async {
    final guardada = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AclararEvaluacionPantalla(
          repositorio: widget.repositorio,
          obtenerToken: widget.obtenerToken,
          referencia: d.resumen.referencia,
          categoriaId: d.resumen.categoriaId,
          evaluacion: ev,
          cuandoSesionInvalida: widget.cuandoSesionInvalida,
        ),
      ),
    );
    if (guardada == true && mounted) await _cargar();
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final r = _r;
    return Scaffold(
      appBar: AppBar(title: const Text('Seguimiento')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Espaciado.s2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: switch (r) {
              null => [
                const Center(
                  child: CircularProgressIndicator(
                    semanticsLabel: 'Cargando el detalle',
                  ),
                ),
              ],
              ConsultaObtenida(valor: final d) => [
                Semantics(
                  header: true,
                  child: Text(d.resumen.referencia, style: tema.headlineSmall),
                ),
                const SizedBox(height: 12),
                TarjetaMensaje(child: EtiquetaEstado(d.resumen.estado)),
                Card(
                  child: ListTile(
                    title: const Text('Categoría'),
                    subtitle: Text(d.resumen.categoria),
                  ),
                ),
                Card(
                  child: ListTile(
                    title: const Text('Descripción'),
                    subtitle: Text(d.descripcion),
                  ),
                ),
                Card(
                  child: ListTile(
                    title: const Text('Ocurrió'),
                    subtitle: Text(_fecha(d.ocurridoEn)),
                  ),
                ),
                Card(
                  child: ListTile(
                    title: const Text('Recibido'),
                    subtitle: Text(_fecha(d.resumen.recibidoEn)),
                  ),
                ),
                Card(
                  child: ListTile(
                    title: const Text('Distrito'),
                    subtitle: Text(d.resumen.territorio.texto),
                  ),
                ),
                BloquePendienteAtencion(institucion: d.institucionResponsable),
                if (d.evaluacion case final ev?)
                  SeccionEvaluacionPropia(
                    evaluacion: ev,
                    preguntaAtencion:
                        d.resumen.categoriaId == 'accidente-transito',
                    alAclarar: () => _aclarar(d, ev),
                  ),
                FotosPropias(
                  evidencias: d.evidencias,
                  cargar: (id) async {
                    final token = widget.obtenerToken();
                    if (token == null) return const ConsultaSesionInvalida();
                    return widget.repositorio.fotoPropia(token, d.resumen.referencia, id);
                  },
                ),
              ],
              ConsultaNoEncontrada() => [
                const MensajeAccesible(
                  aviso: Aviso(
                    TipoAviso.error,
                    'No encontramos este reporte en tu cuenta.',
                  ),
                ),
              ],
              _ => [
                MensajeAccesible(
                  aviso: const Aviso(
                    TipoAviso.error,
                    'No se pudo cargar el detalle.',
                  ),
                  etiquetaAccion: 'Reintentar',
                  alAccionar: _cargar,
                ),
              ],
            },
          ),
        ),
      ),
    );
  }
}

/// Consulta del invitado con referencia y código. Muestra solo estado y resumen ciudadano y permite
/// abrir u olvidar las consultas guardadas en este teléfono.
class ConsultarCodigoPantalla extends StatefulWidget {
  const ConsultarCodigoPantalla({
    super.key,
    required this.repositorio,
    required this.guardadas,
    DateTime Function()? ahora,
  }) : ahora = ahora ?? DateTime.now;

  final IncidentesRepositorio repositorio;
  final ConsultasGuardadas guardadas;
  final DateTime Function() ahora;

  @override
  State<ConsultarCodigoPantalla> createState() =>
      _ConsultarCodigoPantallaState();
}

class _ConsultarCodigoPantallaState extends State<ConsultarCodigoPantalla> {
  final TextEditingController _referencia = TextEditingController();
  final TextEditingController _codigo = TextEditingController();
  List<ConsultaGuardada> _guardadas = const [];
  bool _consultando = false;
  VistaInvitado? _vista;
  Aviso? _aviso;

  @override
  void initState() {
    super.initState();
    _leerGuardadas();
  }

  @override
  void dispose() {
    _referencia.dispose();
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _leerGuardadas() async {
    try {
      final g = await widget.guardadas.listar();
      if (mounted) setState(() => _guardadas = g);
    } on ConsultasGuardadasFallo {
      if (mounted) {
        setState(
          () => _aviso = const Aviso(
            TipoAviso.error,
            'No se pudieron leer las consultas guardadas en este teléfono.',
          ),
        );
      }
    }
  }

  Future<void> _consultar(String referencia, String codigo) async {
    if (referencia.trim().isEmpty || codigo.trim().isEmpty) {
      setState(
        () => _aviso = const Aviso(
          TipoAviso.error,
          'Escribe la referencia y el código.',
        ),
      );
      return;
    }
    setState(() {
      _consultando = true;
      _aviso = null;
      _vista = null;
    });
    final r = await widget.repositorio.consultarInvitado(
      referencia.trim(),
      codigo.trim(),
    );
    if (!mounted) return;
    setState(() {
      _consultando = false;
      switch (r) {
        case ConsultaObtenida(:final valor):
          _vista = valor;
        case ConsultaNoEncontrada():
          _aviso = const Aviso(
            TipoAviso.error,
            'Referencia o código incorrectos.',
          );
        case ConsultaLimite(:final segundos):
          _aviso = Aviso(
            TipoAviso.error,
            textoDeEspera(segundos, widget.ahora()),
          );
        case ConsultaSinConexion():
          _aviso = const Aviso(
            TipoAviso.error,
            'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
          );
        default:
          _aviso = const Aviso(TipoAviso.error, textoServicioNoDisponible);
      }
    });
  }

  Future<void> _olvidar(ConsultaGuardada c) async {
    try {
      await widget.guardadas.olvidar(c.referencia);
    } on ConsultasGuardadasFallo {
      setState(
        () => _aviso = const Aviso(
          TipoAviso.error,
          'No se pudo borrar la consulta guardada.',
        ),
      );
      return;
    }
    if (_vista?.referencia == c.referencia) _vista = null;
    await _leerGuardadas();
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final vista = _vista;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text('Consultar con código', style: tema.headlineSmall),
          ),
          const SizedBox(height: Espaciado.s1),
          const Text(
            'Si reportaste sin cuenta, consulta el estado con la referencia y el código que recibiste.',
          ),
          const SizedBox(height: Espaciado.s2),
          if (_guardadas.isNotEmpty) ...[
            Semantics(
              header: true,
              child: Text(
                'Guardadas en este teléfono',
                style: tema.titleMedium,
              ),
            ),
            for (final c in _guardadas)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(Espaciado.s1),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ListTile(
                        title: Text(c.referencia),
                        subtitle: Text('Guardada el ${_fecha(c.guardadaEn)}'),
                      ),
                      Wrap(
                        alignment: WrapAlignment.end,
                        spacing: Espaciado.s1,
                        children: [
                          TextButton(
                            onPressed: () => _olvidar(c),
                            child: Text(
                              'Olvidar',
                              semanticsLabel: 'Olvidar ${c.referencia}',
                            ),
                          ),
                          FilledButton.tonal(
                            onPressed: _consultando
                                ? null
                                : () => _consultar(c.referencia, c.codigo),
                            child: Text(
                              'Ver seguimiento',
                              semanticsLabel:
                                  'Ver seguimiento de ${c.referencia}',
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: Espaciado.s2),
          ],
          CampoFormulario(
            etiqueta: 'Referencia',
            controlador: _referencia,
            capitalizacion: TextCapitalization.characters,
          ),
          const SizedBox(height: Espaciado.s2),
          CampoFormulario(
            etiqueta: 'Código de seguimiento',
            controlador: _codigo,
            capitalizacion: TextCapitalization.characters,
            ayuda:
                'Es el código de 16 caracteres que viste al enviar el reporte.',
          ),
          const SizedBox(height: Espaciado.s2),
          BotonPrincipal(
            texto: 'Consultar',
            cargando: _consultando,
            textoCargando: 'Consultando…',
            alPulsar: () => _consultar(_referencia.text, _codigo.text),
          ),
          if (_aviso != null) ...[
            const SizedBox(height: Espaciado.s2),
            MensajeAccesible(aviso: _aviso!),
          ],
          if (vista != null) ...[
            const SizedBox(height: Espaciado.s2),
            Semantics(
              header: true,
              liveRegion: true,
              child: Text(vista.referencia, style: tema.titleLarge),
            ),
            TarjetaMensaje(child: EtiquetaEstado(vista.estado)),
            Card(
              child: ListTile(
                title: const Text('Categoría'),
                subtitle: Text(vista.categoria),
              ),
            ),
            Card(
              child: ListTile(
                title: const Text('Recibido'),
                subtitle: Text(_fecha(vista.recibidoEn)),
              ),
            ),
            BloquePendienteAtencion(institucion: vista.institucionResponsable),
          ],
        ],
      ),
    );
  }
}
