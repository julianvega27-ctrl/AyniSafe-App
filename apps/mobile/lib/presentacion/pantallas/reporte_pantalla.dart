import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../aplicacion/reporte_controlador.dart';
import '../../datos/incidentes_repositorio.dart';
import '../componentes/boton_principal.dart';
import '../componentes/campo_formulario.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/selector_punto.dart';
import '../componentes/tarjeta_mensaje.dart';
import '../tema.dart';

/// Formulario de reporte (composición de `screens/report.dart` del origen): título, categoría,
/// descripción, cuándo, ubicación con mapa, preguntas para SAMU cuando aplican y teléfono solo del
/// invitado. Sin fotos ni evaluación SAMU completa (P5). Todo lo escrito se conserva ante errores.
class ReportePantalla extends StatefulWidget {
  const ReportePantalla({
    super.key,
    required this.controlador,
    required this.cargarContornos,
    this.alVerMisReportes,
    this.alConsultarCodigo,
    this.mostrarTeselas = true,
  });

  final ReporteControlador controlador;
  final Future<List<ContornoDistrito>> Function() cargarContornos;
  final VoidCallback? alVerMisReportes;
  final VoidCallback? alConsultarCodigo;
  final bool mostrarTeselas;

  @override
  State<ReportePantalla> createState() => _ReportePantallaState();
}

class _ReportePantallaState extends State<ReportePantalla> {
  late final TextEditingController _descripcion = TextEditingController(
    text: widget.controlador.descripcion,
  );
  late final TextEditingController _telefono = TextEditingController(
    text: widget.controlador.telefono,
  );

  ReporteControlador get _c => widget.controlador;

  @override
  void initState() {
    super.initState();
    if (_c.categorias == null) _c.cargarCategorias();
  }

  @override
  void dispose() {
    _descripcion.dispose();
    _telefono.dispose();
    super.dispose();
  }

  Future<void> _elegirFechaHora() async {
    final ahora = DateTime.now();
    final fecha = await showDatePicker(
      context: context,
      firstDate: ahora.subtract(const Duration(days: 30)),
      lastDate: ahora,
      initialDate: _c.instanteAntes ?? ahora,
      helpText: '¿Qué día ocurrió?',
    );
    if (fecha == null || !mounted) return;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_c.instanteAntes ?? ahora),
      helpText: '¿A qué hora ocurrió?',
    );
    if (hora == null) return;
    _c.cambiarInstanteAntes(
      DateTime(fecha.year, fecha.month, fecha.day, hora.hour, hora.minute),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final estado = _c.estado;
        if (estado is EnvioListo) {
          return ComprobanteVista(
            estado: estado,
            esInvitado: estado.comprobante.codigoSeguimiento != null,
            alNuevoReporte: () {
              _descripcion.clear();
              _telefono.clear();
              _c.reiniciar();
            },
            alVerMisReportes: widget.alVerMisReportes,
            alConsultarCodigo: widget.alConsultarCodigo,
          );
        }
        return _formulario(context);
      },
    );
  }

  Widget _formulario(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final enviando = _c.estado is EnvioEnCurso;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              'Nuevo reporte',
              style: tema.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: Espaciado.s1),
          Text(
            _c.esInvitado
                ? 'Cuéntanos qué ocurre y confirma el punto antes de enviar. Puedes reportar sin cuenta.'
                : 'Cuéntanos qué ocurre y confirma el punto antes de enviar.',
          ),
          const SizedBox(height: Espaciado.s1),
          const TarjetaMensaje(
            icono: Icons.shield_outlined,
            child: Text(
              'Reportar no reemplaza una llamada de emergencia. Si hay peligro inmediato, abre Contactos.',
            ),
          ),
          const SizedBox(height: 18),
          _categoria(),
          const SizedBox(height: Espaciado.s2),
          CampoFormulario(
            etiqueta: _c.esOtraEmergencia
                ? '¿Qué otra emergencia está ocurriendo?'
                : 'Describe lo sucedido',
            controlador: _descripcion,
            lineas: 3,
            largoMaximo: descripcionMaxima,
            capitalizacion: TextCapitalization.sentences,
            error: _c.errores['descripcion'],
            habilitado: !enviando,
            alCambiar: _c.cambiarDescripcion,
          ),
          const SizedBox(height: Espaciado.s1),
          _cuando(tema),
          const SizedBox(height: Espaciado.s2),
          _ubicacion(tema, enviando),
          if (_c.preguntaHeridos) ...[
            const SizedBox(height: Espaciado.s2),
            _preguntas(tema, enviando),
          ],
          if (_c.esInvitado) ...[
            const SizedBox(height: Espaciado.s2),
            CampoFormulario(
              etiqueta: 'Teléfono de contacto',
              controlador: _telefono,
              tipoTeclado: TextInputType.phone,
              pistasAutocompletar: const [AutofillHints.telephoneNumber],
              ayuda: 'Obligatorio sin cuenta. Solo lo verá el personal competente de tu caso; no es público ni sirve para consultar el seguimiento.',
              error: _c.errores['telefonoContacto'],
              habilitado: !enviando,
              alCambiar: _c.cambiarTelefono,
            ),
          ],
          if (_c.errores['cuerpo'] != null) ...[
            const SizedBox(height: Espaciado.s1),
            MensajeAccesible(
              aviso: Aviso(TipoAviso.error, _c.errores['cuerpo']!),
            ),
          ],
          // El resultado del envío (incierto, límite, error) se muestra junto al botón, donde está la
          // persona al pulsarlo; arriba del formulario quedaba fuera de la vista.
          if (_c.aviso != null) ...[
            const SizedBox(height: Espaciado.s2),
            MensajeAccesible(aviso: _c.aviso!),
          ],
          const SizedBox(height: 18),
          BotonPrincipal(
            texto: _c.pendienteDeConfirmar
                ? 'Reintentar envío'
                : 'Enviar reporte',
            cargando: enviando,
            alPulsar: _c.enviar,
          ),
          const SizedBox(height: Espaciado.s2),
        ],
      ),
    );
  }

  Widget _categoria() {
    final categorias = _c.categorias;
    return switch (categorias) {
      null => const LinearProgressIndicator(
        semanticsLabel: 'Cargando categorías',
      ),
      ConsultaObtenida(:final valor) => DropdownButtonFormField<String>(
        key: const Key('reporteCategoria'),
        initialValue: _c.categoriaId,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: 'Categoría',
          error: _c.errores['categoriaId'] == null
              ? null
              : _ErrorCampo(_c.errores['categoriaId']!),
        ),
        items: [
          for (final c in valor)
            DropdownMenuItem(value: c.id, child: Text(c.nombre)),
        ],
        onChanged: _c.estado is EnvioEnCurso ? null : _c.elegirCategoria,
      ),
      _ => MensajeAccesible(
        aviso: const Aviso(TipoAviso.error, 'No se cargaron las categorías.'),
        etiquetaAccion: 'Reintentar',
        alAccionar: _c.cargarCategorias,
      ),
    };
  }

  Widget _cuando(TextTheme tema) {
    final antes = _c.instanteAntes;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('¿Cuándo ocurrió?', style: tema.titleSmall),
        const SizedBox(height: Espaciado.s1),
        SegmentedButton<ModoOcurrencia>(
          segments: const [
            ButtonSegment(value: ModoOcurrencia.ahora, label: Text('Ahora')),
            ButtonSegment(value: ModoOcurrencia.antes, label: Text('Antes')),
          ],
          selected: {_c.modo},
          onSelectionChanged: (s) => _c.cambiarModo(s.first),
        ),
        if (_c.modo == ModoOcurrencia.antes) ...[
          const SizedBox(height: Espaciado.s1),
          OutlinedButton.icon(
            onPressed: _elegirFechaHora,
            icon: const Icon(Icons.event_outlined),
            label: Text(
              antes == null
                  ? 'Elegir fecha y hora'
                  : 'Ocurrió el ${_fecha(antes)}',
            ),
          ),
        ],
        if (_c.errores['ocurrencia'] != null)
          _ErrorCampo(_c.errores['ocurrencia']!),
      ],
    );
  }

  Widget _ubicacion(TextTheme tema, bool enviando) {
    final punto = _c.punto;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('¿Dónde ocurrió?', style: tema.titleSmall),
        const SizedBox(height: 4),
        const Text(
          'Tu ubicación no siempre es el lugar del hecho: puedes marcar otro punto en el mapa.',
        ),
        const SizedBox(height: Espaciado.s1),
        OutlinedButton.icon(
          onPressed: enviando || _c.buscandoUbicacion
              ? null
              : _c.usarMiUbicacion,
          icon: _c.buscandoUbicacion
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.my_location),
          label: Text(
            _c.buscandoUbicacion
                ? 'Buscando tu ubicación…'
                : 'Usar mi ubicación',
          ),
        ),
        if (_c.avisoUbicacion != null) ...[
          const SizedBox(height: Espaciado.s1),
          MensajeAccesible(aviso: Aviso(TipoAviso.info, _c.avisoUbicacion!)),
        ],
        if (punto != null)
          Card(
            margin: const EdgeInsets.only(top: Espaciado.s1),
            color: Colores.fondoExito,
            child: ListTile(
              leading: const Icon(Icons.location_on, color: Colores.exito),
              title: Text(
                punto.manual
                    ? 'Punto elegido en el mapa'
                    : 'Punto de tu ubicación',
              ),
              subtitle: Text(
                punto.precisionM == null
                    ? 'Listo para enviar. El distrito lo calcula el servidor.'
                    : 'Precisión estimada: ${punto.precisionM!.toStringAsFixed(0)} m. El distrito lo calcula el servidor.',
              ),
            ),
          )
        else
          const Padding(
            padding: EdgeInsets.only(top: Espaciado.s1),
            child: Text(
              'Toca el mapa para marcar dónde ocurrió el hecho y confirma el punto.',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: Colores.principal,
              ),
            ),
          ),
        const SizedBox(height: Espaciado.s1),
        SelectorPunto(
          punto: punto,
          candidato: _c.candidato,
          alMarcar: enviando ? (_, _) {} : _c.marcarEnMapa,
          cargarContornos: widget.cargarContornos,
          mostrarTeselas: widget.mostrarTeselas,
        ),
        if (_c.candidato != null) ...[
          const SizedBox(height: Espaciado.s1),
          FilledButton.tonalIcon(
            onPressed: enviando ? null : _c.confirmarPunto,
            icon: const Icon(Icons.check),
            label: const Text('Confirmar este punto'),
          ),
        ],
        if (_c.errores['punto'] != null) _ErrorCampo(_c.errores['punto']!),
      ],
    );
  }

  Widget _preguntas(TextTheme tema, bool enviando) {
    return Card(
      key: const Key('preguntasSamu'),
      child: Padding(
        padding: const EdgeInsets.all(Espaciado.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                'Preguntas para la atención médica',
                style: tema.titleMedium,
              ),
            ),
            const Text('Responde lo que sepas. «No sé» no impide enviar.'),
            const SizedBox(height: Espaciado.s2),
            _Pregunta(
              titulo: '¿Hay heridos?',
              valor: _c.heridos,
              habilitada: !enviando,
              alResponder: _c.responderHeridos,
            ),
            if (_c.preguntaAtencion) ...[
              const SizedBox(height: Espaciado.s2),
              _Pregunta(
                titulo: '¿Se necesita atención médica?',
                valor: _c.atencionMedica,
                habilitada: !enviando,
                alResponder: _c.responderAtencion,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _fecha(DateTime d) {
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(d.day)}/${dos(d.month)}/${d.year} a las ${dos(d.hour)}:${dos(d.minute)}';
}

/// Pregunta de selección única Sí / No / No sé, sin opción preseleccionada (RF44).
class _Pregunta extends StatelessWidget {
  const _Pregunta({
    required this.titulo,
    required this.valor,
    required this.habilitada,
    required this.alResponder,
  });
  final String titulo;
  final Respuesta? valor;
  final bool habilitada;
  final ValueChanged<Respuesta?> alResponder;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 4),
      SegmentedButton<Respuesta>(
        emptySelectionAllowed: true,
        segments: [
          for (final r in Respuesta.values)
            ButtonSegment(value: r, label: Text(r.texto)),
        ],
        selected: {?valor},
        onSelectionChanged: habilitada
            ? (s) => alResponder(s.isEmpty ? null : s.first)
            : null,
      ),
    ],
  );
}

class _ErrorCampo extends StatelessWidget {
  const _ErrorCampo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Icon(
              Icons.error_outline,
              size: MediaQuery.textScalerOf(context).scale(20),
              color: Colores.error,
            ),
          ),
          const SizedBox(width: Espaciado.s1),
          Expanded(
            child: Text(
              texto,
              style: const TextStyle(
                fontSize: 14,
                color: Colores.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Comprobante tras la confirmación del servidor. El código del invitado se muestra una sola vez.
class ComprobanteVista extends StatelessWidget {
  const ComprobanteVista({
    super.key,
    required this.estado,
    required this.esInvitado,
    required this.alNuevoReporte,
    this.alVerMisReportes,
    this.alConsultarCodigo,
  });

  final EnvioListo estado;
  final bool esInvitado;
  final VoidCallback alNuevoReporte;
  final VoidCallback? alVerMisReportes;
  final VoidCallback? alConsultarCodigo;

  @override
  Widget build(BuildContext context) {
    final c = estado.comprobante;
    final tema = Theme.of(context).textTheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Espaciado.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            liveRegion: true,
            child: Text(
              'Reporte registrado',
              style: tema.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: Espaciado.s1),
          Card(
            color: Colores.fondoExito,
            child: Padding(
              padding: const EdgeInsets.all(Espaciado.s2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.check_circle_outline, color: Colores.exito),
                      SizedBox(width: Espaciado.s1),
                      Expanded(
                        child: Text(
                          'El servidor confirmó tu reporte.',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Espaciado.s1),
                  SelectableText('Referencia: ${c.referencia}'),
                  Text('Estado: ${_estado(c.estado)}'),
                  Text('Recibido: ${_fecha(c.recibidoEn.toLocal())}'),
                  Text(c.territorio.texto),
                ],
              ),
            ),
          ),
          if (c.codigoSeguimiento != null) ...[
            const SizedBox(height: Espaciado.s2),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Espaciado.s2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        'Tu código de seguimiento',
                        style: tema.titleMedium,
                      ),
                    ),
                    const SizedBox(height: Espaciado.s1),
                    SelectableText(
                      c.codigoSeguimiento!,
                      style: tema.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: Espaciado.s1),
                    const Text(
                      'Es la única forma de consultar el seguimiento sin cuenta. No se volverá a mostrar ni puede recuperarse con tu teléfono.',
                    ),
                    const SizedBox(height: Espaciado.s1),
                    MensajeAccesible(
                      aviso: estado.codigoGuardado
                          ? const Aviso(
                              TipoAviso.exito,
                              'Lo guardamos de forma segura en este teléfono, en «Consultar con código».',
                            )
                          : const Aviso(
                              TipoAviso.error,
                              'No pudimos guardarlo en este teléfono. Anótalo antes de salir.',
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: Espaciado.s2),
          if (esInvitado && alConsultarCodigo != null)
            OutlinedButton.icon(
              onPressed: alConsultarCodigo,
              icon: const Icon(Icons.manage_search),
              label: const Text('Consultar seguimiento'),
            ),
          if (!esInvitado && alVerMisReportes != null)
            OutlinedButton.icon(
              onPressed: alVerMisReportes,
              icon: const Icon(Icons.history),
              label: const Text('Ver Mis reportes'),
            ),
          const SizedBox(height: Espaciado.s1),
          FilledButton.icon(
            onPressed: alNuevoReporte,
            icon: const Icon(Icons.add_location_alt_outlined),
            label: const Text('Hacer otro reporte'),
          ),
        ],
      ),
    );
  }
}

String _estado(String estado) => switch (estado) {
  'REGISTRADO' => 'Registrado',
  'EN_REVISION' => 'En revisión',
  'EN_ATENCION' => 'En atención',
  'CERRADO' => 'Cerrado',
  _ => estado,
};

/// Texto visible de un estado del incidente (compartido con el seguimiento).
String textoEstadoIncidente(String estado) => _estado(estado);
