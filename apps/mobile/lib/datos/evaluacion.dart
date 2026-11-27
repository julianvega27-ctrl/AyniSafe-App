// Evaluación rápida para SAMU (P5.1, RF41–RF44, documento 09). Réplica de la regla del contrato:
// el servidor sigue siendo la autoridad y responde 400 si la app se desvía.

/// Categorías con «¿Hay heridos?» (incluye Emergencia médica desde P5.1, decisión del 26/11/2026).
const Set<String> categoriasConEvaluacion = {
  'accidente-transito',
  'agresion',
  'pelea',
  'violencia',
  'emergencia-medica',
};
const Set<String> _samuSiHeridos = {'agresion', 'pelea', 'violencia'};

/// Respuesta de una pregunta de selección única. `null` = sin respuesta (distinto de «No»).
enum Respuesta {
  si('si', 'Sí'),
  no('no', 'No'),
  noSe('no_se', 'No sé');

  const Respuesta(this.valor, this.texto);
  final String valor;
  final String texto;
}

const int cantidadMinimaOtra = 6;
const int cantidadMaxima = 999;

/// SAMU interviene: emergencia médica siempre; accidente con heridos o atención médica «Sí»; agresión,
/// pelea o violencia con heridos «Sí». Coincide con `samuRequerido` de la API.
bool samuInterviene(
  String? categoria,
  Respuesta? heridos,
  Respuesta? atencion,
) {
  if (categoria == 'emergencia-medica') return true;
  if (categoria == 'accidente-transito') {
    return heridos == Respuesta.si || atencion == Respuesta.si;
  }
  return _samuSiHeridos.contains(categoria) && heridos == Respuesta.si;
}

/// Signos de vida observados en la persona principal. La opción negativa describe una observación,
/// no una constatación clínica.
enum SignosVida {
  observados('observados', 'Se observan'),
  noObservados('no_observados', 'No se han observado'),
  noSe('no_se', 'No sé');

  const SignosVida(this.valor, this.texto);
  final String valor;
  final String texto;

  static SignosVida? desde(Object? v) =>
      SignosVida.values.where((s) => s.valor == v).firstOrNull;
}

Respuesta? respuestaDesde(Object? v) =>
    Respuesta.values.where((r) => r.valor == v).firstOrNull;

/// Cantidad total de heridos: un entero conocido o «No sé». Sin respuesta es `null` en el modelo.
final class CantidadHeridos {
  const CantidadHeridos.conocida(int this.valor);
  const CantidadHeridos.noSe() : valor = null;

  final int? valor;
  bool get esNoSe => valor == null;

  /// Valor JSON del contrato: entero o `no_se`.
  Object get json => valor ?? 'no_se';

  static CantidadHeridos? desde(Object? v) => switch (v) {
    'no_se' => const CantidadHeridos.noSe(),
    final int n => CantidadHeridos.conocida(n),
    _ => null,
  };

  @override
  bool operator ==(Object other) =>
      other is CantidadHeridos && other.valor == valor;

  @override
  int get hashCode => valor.hashCode;
}

/// Respuestas de la evaluación. `null` en cada campo es «sin respuesta», nunca un valor normal.
final class RespuestasEvaluacion {
  const RespuestasEvaluacion({
    this.heridos,
    this.atencionMedica,
    this.cantidad,
    this.signosVida,
    this.consciente,
    this.sangrado,
  });

  final Respuesta? heridos;
  final Respuesta? atencionMedica;
  final CantidadHeridos? cantidad;
  final SignosVida? signosVida;
  final Respuesta? consciente;
  final Respuesta? sangrado;

  factory RespuestasEvaluacion.desdeJson(Map<String, Object?> j) {
    final p = j['personaPrincipal'];
    final persona = p is Map<String, Object?> ? p : const <String, Object?>{};
    return RespuestasEvaluacion(
      heridos: respuestaDesde(j['heridos']),
      atencionMedica: respuestaDesde(j['atencionMedica']),
      cantidad: CantidadHeridos.desde(j['cantidadHeridos']),
      signosVida: SignosVida.desde(persona['signosVida']),
      consciente: respuestaDesde(persona['consciente']),
      sangrado: respuestaDesde(persona['sangrado']),
    );
  }

  bool get tieneObservaciones =>
      signosVida != null || consciente != null || sangrado != null;

  /// Objeto `evaluacion` del envío: solo lo respondido; la cantidad solo con heridos «Sí».
  /// Null si no hay nada que enviar.
  Map<String, Object?>? cuerpoEnvio() {
    final persona = <String, Object?>{
      if (signosVida != null) 'signosVida': signosVida!.valor,
      if (consciente != null) 'consciente': consciente!.valor,
      if (sangrado != null) 'sangrado': sangrado!.valor,
    };
    final cuerpo = <String, Object?>{
      if (heridos == Respuesta.si && cantidad != null)
        'cantidadHeridos': cantidad!.json,
      if (persona.isNotEmpty) 'personaPrincipal': persona,
    };
    return cuerpo.isEmpty ? null : cuerpo;
  }

  /// Aclaración: solo los campos que cambian respecto de `antes` (null no se envía: una respuesta no
  /// se puede «desresponder»). La cantidad solo con heridos «Sí».
  Map<String, Object?> cambiosDesde(RespuestasEvaluacion antes) {
    final persona = <String, Object?>{
      if (signosVida != null && signosVida != antes.signosVida)
        'signosVida': signosVida!.valor,
      if (consciente != null && consciente != antes.consciente)
        'consciente': consciente!.valor,
      if (sangrado != null && sangrado != antes.sangrado)
        'sangrado': sangrado!.valor,
    };
    return {
      if (heridos != null && heridos != antes.heridos)
        'heridos': heridos!.valor,
      if (atencionMedica != null && atencionMedica != antes.atencionMedica)
        'atencionMedica': atencionMedica!.valor,
      if (heridos == Respuesta.si &&
          cantidad != null &&
          cantidad != antes.cantidad)
        'cantidadHeridos': cantidad!.json,
      if (persona.isNotEmpty) 'personaPrincipal': persona,
    };
  }

  RespuestasEvaluacion copiar({
    Respuesta? heridos,
    Respuesta? atencionMedica,
    CantidadHeridos? cantidad,
    SignosVida? signosVida,
    Respuesta? consciente,
    Respuesta? sangrado,
    bool limpiarCantidad = false,
  }) => RespuestasEvaluacion(
    heridos: heridos ?? this.heridos,
    atencionMedica: atencionMedica ?? this.atencionMedica,
    cantidad: limpiarCantidad ? null : (cantidad ?? this.cantidad),
    signosVida: signosVida ?? this.signosVida,
    consciente: consciente ?? this.consciente,
    sangrado: sangrado ?? this.sangrado,
  );
}

/// Evaluación propia recibida en el detalle de Mis reportes.
final class EvaluacionPropia {
  const EvaluacionPropia({
    required this.version,
    required this.respuestas,
    required this.informadaEn,
    required this.puedeAclarar,
    required this.solicitudCompletar,
  });

  final int version;
  final RespuestasEvaluacion respuestas;
  final DateTime informadaEn;
  final bool puedeAclarar;
  final bool solicitudCompletar;

  static EvaluacionPropia? desdeJson(Object? j) {
    if (j is! Map<String, Object?>) return null;
    final r = j['respuestas'];
    final instante = DateTime.tryParse(j['informadaEn']?.toString() ?? '');
    if (r is! Map<String, Object?> ||
        instante == null ||
        j['version'] is! int) {
      return null;
    }
    return EvaluacionPropia(
      version: j['version']! as int,
      respuestas: RespuestasEvaluacion.desdeJson(r),
      informadaEn: instante,
      puedeAclarar: j['puedeAclarar'] == true,
      solicitudCompletar: j['solicitudCompletar'] == true,
    );
  }
}
