import 'package:flutter/material.dart';

import '../../aplicacion/aviso.dart';
import '../../datos/evaluacion.dart';
import '../../datos/incidentes_repositorio.dart';
import '../componentes/bloque_evaluacion.dart';
import '../componentes/boton_principal.dart';
import '../componentes/mensaje_accesible.dart';
import '../componentes/pregunta_seleccion.dart';
import '../tema.dart';

/// Completar o aclarar la evaluación propia desde Mis reportes (P5.1). Reutiliza los controles del
/// formulario, precargados con las respuestas propias, y envía solo lo que cambia. Una respuesta no
/// se puede «desresponder»: al quitar una opción marcada se conserva la anterior.
class AclararEvaluacionPantalla extends StatefulWidget {
  const AclararEvaluacionPantalla({
    super.key,
    required this.repositorio,
    required this.obtenerToken,
    required this.referencia,
    required this.categoriaId,
    required this.evaluacion,
    required this.cuandoSesionInvalida,
  });

  final IncidentesRepositorio repositorio;
  final String? Function() obtenerToken;
  final String referencia;
  final String? categoriaId;
  final EvaluacionPropia evaluacion;
  final VoidCallback cuandoSesionInvalida;

  @override
  State<AclararEvaluacionPantalla> createState() =>
      _AclararEvaluacionPantallaState();
}

class _AclararEvaluacionPantallaState extends State<AclararEvaluacionPantalla> {
  late RespuestasEvaluacion _r = widget.evaluacion.respuestas;
  bool _enviando = false;
  Aviso? _aviso;
  Map<String, String> _errores = const {};

  RespuestasEvaluacion get _inicial => widget.evaluacion.respuestas;
  bool get _preguntaAtencion => widget.categoriaId == 'accidente-transito';

  /// El bloque aparece si SAMU interviene con las respuestas actuales o ya intervenía.
  bool get _muestraBloque =>
      samuInterviene(widget.categoriaId, _r.heridos, _r.atencionMedica) ||
      widget.evaluacion.solicitudCompletar ||
      _inicial.tieneObservaciones;

  void _cambiar(RespuestasEvaluacion nuevo) => setState(() {
    _r = nuevo;
    _aviso = null;
  });

  Future<void> _enviar() async {
    final cambios = _r.cambiosDesde(_inicial);
    if (cambios.isEmpty) {
      setState(
        () => _aviso = const Aviso(
          TipoAviso.info,
          'No cambiaste ninguna respuesta.',
        ),
      );
      return;
    }
    final token = widget.obtenerToken();
    if (token == null) {
      widget.cuandoSesionInvalida();
      return;
    }
    setState(() {
      _enviando = true;
      _aviso = null;
      _errores = const {};
    });
    final r = await widget.repositorio.aclararEvaluacion(
      token,
      widget.referencia,
      cambios,
    );
    if (!mounted) return;
    setState(() => _enviando = false);
    switch (r) {
      case AclaracionAplicada():
        Navigator.of(context).pop(true);
      case AclaracionSesionInvalida():
        Navigator.of(context).pop(false);
        widget.cuandoSesionInvalida();
      case AclaracionCamposInvalidos(:final campos):
        setState(() {
          _errores = campos;
          _aviso = const Aviso(
            TipoAviso.error,
            'Revisa las respuestas marcadas. Lo que elegiste se conserva.',
          );
        });
      case AclaracionSinConexion():
        setState(
          () => _aviso = const Aviso(
            TipoAviso.error,
            'No pudimos enviar por un problema de conexión. Lo que elegiste se conserva: vuelve a intentarlo; no se duplicará.',
          ),
        );
      case AclaracionNoEncontrada():
        setState(
          () => _aviso = const Aviso(
            TipoAviso.error,
            'No encontramos este reporte en tu cuenta.',
          ),
        );
      case AclaracionCerrada():
        setState(
          () => _aviso = const Aviso(
            TipoAviso.error,
            'El incidente ya está cerrado: la evaluación no puede aclararse.',
          ),
        );
      case AclaracionNoDisponible():
        setState(
          () => _aviso = const Aviso(
            TipoAviso.error,
            'No pudimos guardar la aclaración. Inténtalo de nuevo; no se duplicará.',
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context).textTheme;
    final habilitado = !_enviando;
    return Scaffold(
      appBar: AppBar(title: const Text('Aclarar evaluación')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Espaciado.s2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(
                header: true,
                child: Text(widget.referencia, style: tema.headlineSmall),
              ),
              const SizedBox(height: Espaciado.s1),
              const Text(
                'Cambia solo lo que sepas. Lo que ya respondiste se conserva; «No sé» es distinto de «No».',
              ),
              const SizedBox(height: Espaciado.s2),
              Card(
                key: const Key('aclararPreguntas'),
                semanticContainer: false,
                child: Padding(
                  padding: const EdgeInsets.all(Espaciado.s2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      PreguntaSeleccion<Respuesta>(
                        key: const Key('aclararHeridos'),
                        titulo: '¿Hay heridos?',
                        opciones: opcionesRespuesta,
                        valor: _r.heridos,
                        habilitada: habilitado,
                        alResponder: (v) => _cambiar(
                          v == null
                              ? _r
                              : _r.copiar(
                                  heridos: v,
                                  limpiarCantidad: v != Respuesta.si,
                                ),
                        ),
                      ),
                      if (_preguntaAtencion) ...[
                        const SizedBox(height: Espaciado.s2),
                        PreguntaSeleccion<Respuesta>(
                          key: const Key('aclararAtencion'),
                          titulo: '¿Se necesita atención médica?',
                          opciones: opcionesRespuesta,
                          valor: _r.atencionMedica,
                          habilitada: habilitado,
                          alResponder: (v) =>
                              _cambiar(_r.copiar(atencionMedica: v)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              if (_muestraBloque) ...[
                const SizedBox(height: Espaciado.s2),
                BloqueEvaluacion(
                  respuestas: _r,
                  mostrarCantidad: _r.heridos == Respuesta.si,
                  habilitado: habilitado,
                  alCambiarCantidad: (c) =>
                      _cambiar(c == null ? _r : _r.copiar(cantidad: c)),
                  alCambiarSignosVida: (s) =>
                      _cambiar(_r.copiar(signosVida: s)),
                  alCambiarConsciente: (v) =>
                      _cambiar(_r.copiar(consciente: v)),
                  alCambiarSangrado: (v) => _cambiar(_r.copiar(sangrado: v)),
                ),
              ],
              for (final e in _errores.values) ...[
                const SizedBox(height: Espaciado.s1),
                MensajeAccesible(aviso: Aviso(TipoAviso.error, e)),
              ],
              if (_aviso != null) ...[
                const SizedBox(height: Espaciado.s2),
                MensajeAccesible(aviso: _aviso!),
              ],
              const SizedBox(height: Espaciado.s2),
              BotonPrincipal(
                texto: 'Enviar aclaración',
                textoCargando: 'Enviando…',
                cargando: _enviando,
                alPulsar: _enviando ? null : _enviar,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
