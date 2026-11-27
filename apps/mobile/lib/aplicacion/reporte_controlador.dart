import 'package:flutter/foundation.dart';

import '../datos/consultas_guardadas.dart';
import '../datos/incidentes_repositorio.dart';
import '../datos/ubicacion.dart';
import 'aviso.dart';
import '../datos/evaluacion.dart';

export '../datos/evaluacion.dart' show CantidadHeridos, Respuesta, SignosVida;

/// Categorías que preguntan por heridos y por atención médica (RF57, documento 09 §5). Deben
/// coincidir con el contrato de la API. Emergencia médica pregunta heridos desde P5.1.
const Set<String> categoriasConHeridos = categoriasConEvaluacion;
const Set<String> categoriasConAtencionMedica = {'accidente-transito'};

const int descripcionMinima = 5;
const int descripcionMaxima = 1000;
final RegExp _telefonoValido = RegExp(r'^\+?[0-9]{7,15}$');

enum ModoOcurrencia { ahora, antes }

/// Punto del incidente. `manual` si se eligió en el mapa; `precisionM` solo con GPS.
class PuntoReporte {
  const PuntoReporte({
    required this.latitud,
    required this.longitud,
    required this.manual,
    this.precisionM,
  });
  final double latitud;
  final double longitud;
  final bool manual;
  final double? precisionM;
}

/// Estado del envío.
sealed class EstadoEnvio {
  const EstadoEnvio();
}

final class EnvioEditando extends EstadoEnvio {
  const EnvioEditando();
}

final class EnvioEnCurso extends EstadoEnvio {
  const EnvioEnCurso();
}

final class EnvioListo extends EstadoEnvio {
  const EnvioListo(this.comprobante, {required this.codigoGuardado});
  final ComprobanteIncidente comprobante;

  /// Para el invitado: si el código quedó en el almacenamiento seguro del dispositivo.
  final bool codigoGuardado;
}

/// Formulario de reporte (P4.1). Conserva todo lo escrito ante cualquier error. Cada intento usa una
/// clave de idempotencia que se crea al enviar y se reutiliza en los reintentos del mismo contenido;
/// editar cualquier dato descarta la clave y el contenido congelado.
class ReporteControlador extends ChangeNotifier {
  ReporteControlador({
    required this._repositorio,
    required this._ubicacion,
    required this._guardadas,
    required this._obtenerToken,
    required this._nuevaClave,
    this.cuandoSesionInvalida,
    DateTime Function()? ahora,
  }) : _ahora = ahora ?? DateTime.now;

  final IncidentesRepositorio _repositorio;
  final UbicacionPuerto _ubicacion;
  final ConsultasGuardadas _guardadas;
  final String? Function() _obtenerToken;
  final String Function() _nuevaClave;
  final DateTime Function() _ahora;
  final VoidCallback? cuandoSesionInvalida;

  bool get esInvitado => _obtenerToken() == null;

  // --- Catálogo
  Consulta<List<CategoriaIncidente>>? categorias;

  Future<void> cargarCategorias() async {
    categorias = null;
    notifyListeners();
    categorias = await _repositorio.categorias();
    notifyListeners();
  }

  // --- Datos del formulario
  String? categoriaId;
  String descripcion = '';
  ModoOcurrencia modo = ModoOcurrencia.ahora;
  DateTime? instanteAntes;
  PuntoReporte? punto;

  /// Punto marcado en el mapa pendiente de confirmar.
  ({double latitud, double longitud})? candidato;
  Respuesta? heridos;
  Respuesta? atencionMedica;

  // Evaluación rápida para SAMU (P5.1). Se conserva al ocultar el bloque; solo se envía si aplica.
  CantidadHeridos? cantidad;
  SignosVida? signosVida;
  Respuesta? consciente;
  Respuesta? sangrado;
  String telefono = '';

  bool get preguntaHeridos =>
      categoriaId != null && categoriasConHeridos.contains(categoriaId);
  bool get preguntaAtencion =>
      categoriaId != null && categoriasConAtencionMedica.contains(categoriaId);
  bool get esOtraEmergencia => categoriaId == 'otra-emergencia';

  /// El bloque «Evaluación rápida para SAMU» aparece si SAMU interviene con las respuestas actuales.
  bool get muestraEvaluacion =>
      preguntaHeridos && samuInterviene(categoriaId, heridos, atencionMedica);
  bool get muestraCantidad => muestraEvaluacion && heridos == Respuesta.si;

  // --- Mensajes
  Map<String, String> errores = const {};
  Aviso? aviso;

  /// Mensaje del bloque de ubicación (permiso denegado, GPS apagado, punto requerido).
  String? avisoUbicacion;
  bool buscandoUbicacion = false;

  EstadoEnvio estado = const EnvioEditando();

  /// true tras un resultado incierto: el siguiente envío reutiliza la misma clave y contenido.
  bool get pendienteDeConfirmar => _clave != null;

  String? _clave;
  Map<String, Object?>? _cuerpoEnCurso;

  void _editar(void Function() cambio) {
    cambio();
    // Cualquier edición crea un contenido nuevo: el siguiente envío usará otra clave.
    _clave = null;
    _cuerpoEnCurso = null;
    notifyListeners();
  }

  void elegirCategoria(String? id) => _editar(() {
    if (id == categoriaId) return;
    categoriaId = id;
    errores = {...errores}..remove('categoriaId');
    // Las preguntas de otra categoría no se envían ni se conservan.
    if (!preguntaHeridos) {
      heridos = null;
      _limpiarEvaluacion();
    }
    if (!preguntaAtencion) atencionMedica = null;
  });

  void _limpiarEvaluacion() {
    cantidad = null;
    signosVida = null;
    consciente = null;
    sangrado = null;
  }

  void cambiarDescripcion(String texto) => _editar(() => descripcion = texto);
  void cambiarTelefono(String texto) => _editar(() => telefono = texto);
  void cambiarModo(ModoOcurrencia nuevo) => _editar(() => modo = nuevo);
  void cambiarInstanteAntes(DateTime instante) =>
      _editar(() => instanteAntes = instante);
  void responderHeridos(Respuesta? r) => _editar(() => heridos = r);
  void responderAtencion(Respuesta? r) => _editar(() => atencionMedica = r);
  void responderCantidad(CantidadHeridos? c) => _editar(() => cantidad = c);
  void responderSignosVida(SignosVida? s) => _editar(() => signosVida = s);
  void responderConsciente(Respuesta? r) => _editar(() => consciente = r);
  void responderSangrado(Respuesta? r) => _editar(() => sangrado = r);

  RespuestasEvaluacion get respuestasEvaluacion => RespuestasEvaluacion(
    heridos: heridos,
    atencionMedica: atencionMedica,
    cantidad: cantidad,
    signosVida: signosVida,
    consciente: consciente,
    sangrado: sangrado,
  );

  /// Pide el permiso solo ahora (al pulsar «Usar mi ubicación»).
  Future<void> usarMiUbicacion() async {
    if (buscandoUbicacion) return;
    buscandoUbicacion = true;
    avisoUbicacion = null;
    notifyListeners();
    final r = await _ubicacion.obtener();
    buscandoUbicacion = false;
    switch (r) {
      case UbicacionObtenida(:final punto):
        _editar(() {
          this.punto = PuntoReporte(
            latitud: punto.latitud,
            longitud: punto.longitud,
            manual: false,
            precisionM: punto.precisionM,
          );
          candidato = null;
          errores = {...errores}..remove('punto');
        });
        return;
      case UbicacionDenegada(:final permanente):
        avisoUbicacion = permanente
            ? 'El permiso de ubicación está bloqueado. Puedes activarlo en Ajustes o elegir el punto en el mapa.'
            : 'No diste permiso de ubicación. Elige el punto en el mapa: toca el lugar del incidente y confírmalo.';
      case UbicacionServicioApagado():
        avisoUbicacion = 'La ubicación del teléfono está apagada. Actívala o elige el punto en el mapa.';
      case UbicacionNoDisponible():
        avisoUbicacion = 'No pudimos obtener tu ubicación. Inténtalo de nuevo o elige el punto en el mapa.';
    }
    notifyListeners();
  }

  /// Marca un punto en el mapa; queda pendiente hasta confirmarlo.
  void marcarEnMapa(double latitud, double longitud) {
    candidato = (latitud: latitud, longitud: longitud);
    notifyListeners();
  }

  void confirmarPunto() {
    final c = candidato;
    if (c == null) return;
    _editar(() {
      punto = PuntoReporte(
        latitud: c.latitud,
        longitud: c.longitud,
        manual: true,
      );
      candidato = null;
      avisoUbicacion = null;
      errores = {...errores}..remove('punto');
    });
  }

  Map<String, String> _validar() {
    final e = <String, String>{};
    if (categoriaId == null) e['categoriaId'] = 'Elige una categoría.';
    final largo = descripcion.trim().runes.length;
    if (largo < descripcionMinima || largo > descripcionMaxima) {
      e['descripcion'] = esOtraEmergencia
          ? 'Explica qué otra emergencia está ocurriendo ($descripcionMinima a $descripcionMaxima caracteres).'
          : 'Describe el hecho en $descripcionMinima a $descripcionMaxima caracteres.';
    }
    if (punto == null) {
      e['punto'] = 'Falta el punto del incidente: usa tu ubicación o elígelo en el mapa y confírmalo.';
    }
    if (modo == ModoOcurrencia.antes) {
      final i = instanteAntes;
      final ahora = _ahora();
      if (i == null ||
          i.isAfter(ahora) ||
          i.isBefore(ahora.subtract(const Duration(days: 30)))) {
        e['ocurrencia'] = 'Indica una fecha y hora de los últimos 30 días.';
      }
    }
    if (esInvitado) {
      final limpio = telefono.trim().replaceAll(RegExp(r'[\s\-.()]'), '');
      if (!_telefonoValido.hasMatch(limpio)) {
        e['telefonoContacto'] =
            'Ingresa un teléfono de contacto de 7 a 15 dígitos.';
      }
    }
    return e;
  }

  Map<String, Object?> _cuerpo() {
    final p = punto!;
    final instante = modo == ModoOcurrencia.ahora ? _ahora() : instanteAntes!;
    final evaluacion = muestraEvaluacion
        ? respuestasEvaluacion.cuerpoEnvio()
        : null;
    return {
      'categoriaId': categoriaId,
      'descripcion': descripcion.trim(),
      'ocurrencia': {'modo': modo.name, 'instante': instanteIso(instante)},
      'punto': {
        'latitud': p.latitud,
        'longitud': p.longitud,
        'origen': p.manual ? 'manual' : 'gps',
        if (p.precisionM != null) 'precisionM': p.precisionM,
      },
      if (preguntaHeridos && heridos != null) 'heridos': heridos!.valor,
      if (preguntaAtencion && atencionMedica != null)
        'atencionMedica': atencionMedica!.valor,
      'evaluacion': ?evaluacion,
      if (esInvitado) 'telefonoContacto': telefono.trim(),
    };
  }

  Future<void> enviar() async {
    if (estado is EnvioEnCurso) return;
    final locales = _validar();
    if (locales.isNotEmpty) {
      errores = locales;
      aviso = const Aviso(
        TipoAviso.error,
        'Revisa los campos marcados. Lo que escribiste se conserva.',
      );
      notifyListeners();
      return;
    }
    // La clave y el contenido se congelan en el primer intento y se reutilizan al reintentar.
    _clave ??= _nuevaClave();
    _cuerpoEnCurso ??= _cuerpo();
    errores = const {};
    aviso = null;
    estado = const EnvioEnCurso();
    notifyListeners();

    final r = await _repositorio.registrar(
      cuerpo: _cuerpoEnCurso!,
      claveIdempotencia: _clave!,
      token: _obtenerToken(),
    );
    switch (r) {
      case EnvioConfirmado(:final comprobante):
        var guardado = false;
        final codigo = comprobante.codigoSeguimiento;
        if (codigo != null) {
          try {
            await _guardadas.guardar(
              ConsultaGuardada(
                referencia: comprobante.referencia,
                codigo: codigo,
                guardadaEn: _ahora(),
              ),
            );
            guardado = true;
          } on ConsultasGuardadasFallo {
            guardado = false;
          }
        }
        _clave = null;
        _cuerpoEnCurso = null;
        estado = EnvioListo(comprobante, codigoGuardado: guardado);
      case EnvioIncierto():
        estado = const EnvioEditando();
        aviso = const Aviso(
          TipoAviso.error,
          'No sabemos si tu reporte se registró porque falló la conexión. Pulsa «Reintentar envío»: no se duplicará.',
        );
      case EnvioCamposInvalidos(:final campos):
        estado = const EnvioEditando();
        errores = campos;
        aviso = const Aviso(
          TipoAviso.error,
          'Revisa los campos marcados. Lo que escribiste se conserva.',
        );
        _clave = null;
        _cuerpoEnCurso = null;
      case EnvioLimite(:final segundos):
        estado = const EnvioEditando();
        aviso = Aviso(TipoAviso.error, textoDeEspera(segundos, _ahora()));
      case EnvioSesionInvalida():
        estado = const EnvioEditando();
        aviso = const Aviso(
          TipoAviso.error,
          'Tu sesión ya no es válida. Inicia sesión de nuevo; lo que escribiste se conserva mientras la app siga abierta.',
        );
        cuandoSesionInvalida?.call();
      case EnvioConflicto():
        estado = const EnvioEditando();
        _clave = null;
        _cuerpoEnCurso = null;
        aviso = const Aviso(
          TipoAviso.error,
          'No se pudo enviar este contenido. Inténtalo de nuevo.',
        );
      case EnvioErrorInesperado(:final requestId):
        estado = const EnvioEditando();
        aviso = Aviso(TipoAviso.error, textoErrorInesperado(requestId));
    }
    notifyListeners();
  }

  /// Nuevo reporte tras ver el comprobante.
  void reiniciar() {
    categoriaId = null;
    descripcion = '';
    modo = ModoOcurrencia.ahora;
    instanteAntes = null;
    punto = null;
    candidato = null;
    heridos = null;
    atencionMedica = null;
    _limpiarEvaluacion();
    telefono = '';
    errores = const {};
    aviso = null;
    avisoUbicacion = null;
    estado = const EnvioEditando();
    _clave = null;
    _cuerpoEnCurso = null;
    notifyListeners();
  }
}

/// Instante en UTC con milisegundos (ISO 8601). `toIso8601String` de Dart agrega microsegundos, que la
/// API acepta, pero se truncan para que el contenido sea estable entre plataformas.
String instanteIso(DateTime instante) {
  final ms = DateTime.fromMillisecondsSinceEpoch(
    instante.millisecondsSinceEpoch,
    isUtc: true,
  );
  return ms.toIso8601String();
}
