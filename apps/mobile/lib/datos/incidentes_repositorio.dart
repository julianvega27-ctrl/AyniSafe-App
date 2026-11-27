import 'cliente_http.dart';
import 'evaluacion.dart';

/// Categoría del catálogo público (`/publico/categorias`).
class CategoriaIncidente {
  const CategoriaIncidente({required this.id, required this.nombre});
  final String id;
  final String nombre;
}

/// Distrito resuelto por el backend o pendiente con su motivo. La app nunca lo calcula.
sealed class TerritorioIncidente {
  const TerritorioIncidente();

  static TerritorioIncidente? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    if (json['estado'] == 'resuelto') {
      final d = json['distrito'];
      if (d is Map<String, dynamic> && d['id'] is String) {
        return TerritorioResuelto(
          distritoId: d['id'] as String,
          nombre: d['nombre'] is String ? d['nombre'] as String : null,
        );
      }
      return null;
    }
    if (json['estado'] == 'pendiente' && json['motivo'] is String) {
      return TerritorioPendiente(json['motivo'] as String);
    }
    return null;
  }

  /// Texto para la persona (sin códigos internos).
  String get texto;
}

final class TerritorioResuelto extends TerritorioIncidente {
  const TerritorioResuelto({required this.distritoId, this.nombre});
  final String distritoId;
  final String? nombre;

  @override
  String get texto => 'Distrito: ${nombre ?? distritoId}';
}

final class TerritorioPendiente extends TerritorioIncidente {
  const TerritorioPendiente(this.motivo);
  final String motivo;

  @override
  String get texto => switch (motivo) {
    'frontera' =>
      'Distrito pendiente: el punto está en el límite entre distritos.',
    'solapamiento' => 'Distrito pendiente: el punto cae en más de un distrito.',
    'fuera_area' =>
      'Distrito pendiente: el punto está fuera de los distritos del piloto.',
    _ => 'Distrito pendiente de revisión.',
  };
}

/// Comprobante del registro. `codigoSeguimiento` solo existe en envíos de invitado.
class ComprobanteIncidente {
  const ComprobanteIncidente({
    required this.referencia,
    required this.estado,
    required this.recibidoEn,
    required this.modalidad,
    required this.territorio,
    this.codigoSeguimiento,
  });

  final String referencia;
  final String estado;
  final DateTime recibidoEn;
  final String modalidad;
  final TerritorioIncidente territorio;
  final String? codigoSeguimiento;

  static ComprobanteIncidente? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final referencia = json['referencia'];
    final estado = json['estado'];
    final recibido = json['recibidoEn'] is String
        ? DateTime.tryParse(json['recibidoEn'] as String)
        : null;
    final modalidad = json['modalidad'];
    final territorio = TerritorioIncidente.desdeJson(json['territorio']);
    final codigo = json['codigoSeguimiento'];
    if (referencia is! String ||
        estado is! String ||
        recibido == null ||
        modalidad is! String ||
        territorio == null) {
      return null;
    }
    return ComprobanteIncidente(
      referencia: referencia,
      estado: estado,
      recibidoEn: recibido,
      modalidad: modalidad,
      territorio: territorio,
      codigoSeguimiento: codigo is String ? codigo : null,
    );
  }
}

/// Resultado del envío. `EnvioIncierto` significa que no se sabe si el servidor lo registró: se
/// reintenta con la misma clave sin duplicar.
sealed class ResultadoEnvio {
  const ResultadoEnvio();
}

final class EnvioConfirmado extends ResultadoEnvio {
  const EnvioConfirmado(this.comprobante, {required this.repetido});
  final ComprobanteIncidente comprobante;

  /// true si el servidor respondió 200: el mismo incidente ya estaba registrado.
  final bool repetido;
}

final class EnvioCamposInvalidos extends ResultadoEnvio {
  const EnvioCamposInvalidos(this.campos);
  final Map<String, String> campos;
}

final class EnvioIncierto extends ResultadoEnvio {
  const EnvioIncierto();
}

final class EnvioLimite extends ResultadoEnvio {
  const EnvioLimite(this.segundos);
  final int segundos;
}

/// 409: la clave se usó con otro contenido (no debería ocurrir: la app genera una clave por contenido).
final class EnvioConflicto extends ResultadoEnvio {
  const EnvioConflicto();
}

/// 401: la sesión de la cuenta ya no es válida; el envío no se degrada a invitado.
final class EnvioSesionInvalida extends ResultadoEnvio {
  const EnvioSesionInvalida();
}

final class EnvioErrorInesperado extends ResultadoEnvio {
  const EnvioErrorInesperado(this.requestId);
  final String? requestId;
}

/// Elemento del historial propio.
class ResumenIncidente {
  const ResumenIncidente({
    required this.referencia,
    required this.categoria,
    required this.estado,
    required this.recibidoEn,
    required this.territorio,
    this.categoriaId,
  });
  final String referencia;
  final String categoria;

  /// Identificador estable de la categoría (decide qué preguntas de la evaluación aplican).
  final String? categoriaId;
  final String estado;
  final DateTime recibidoEn;
  final TerritorioIncidente territorio;

  static ResumenIncidente? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final categoria = json['categoria'];
    final nombre = categoria is Map<String, dynamic>
        ? (categoria['nombre'] ?? categoria['id'])
        : null;
    final recibido = json['recibidoEn'] is String
        ? DateTime.tryParse(json['recibidoEn'] as String)
        : null;
    final territorio = TerritorioIncidente.desdeJson(json['territorio']);
    if (json['referencia'] is! String ||
        nombre is! String ||
        json['estado'] is! String ||
        recibido == null ||
        territorio == null) {
      return null;
    }
    return ResumenIncidente(
      referencia: json['referencia'] as String,
      categoria: nombre,
      categoriaId:
          categoria is Map<String, dynamic> && categoria['id'] is String
          ? categoria['id'] as String
          : null,
      estado: json['estado'] as String,
      recibidoEn: recibido,
      territorio: territorio,
    );
  }
}

/// Solo una asignación reconocida con nombre permite mostrar una responsable.
class InstitucionResponsable {
  const InstitucionResponsable({this.nombre});
  final String? nombre;
  bool get pendiente => nombre == null;

  static InstitucionResponsable desdeJson(Object? json) {
    if (json is Map<String, dynamic> && json['estado'] == 'asignada') {
      final institucion = json['institucion'];
      if (institucion is Map<String, dynamic> &&
          const {
            'pnp',
            'bomberos',
            'samu',
            'serenazgo',
          }.contains(institucion['id'])) {
        final nombre = institucion['nombre'];
        if (nombre is String && nombre.trim().isNotEmpty) {
          return InstitucionResponsable(nombre: nombre.trim());
        }
      }
    }
    return const InstitucionResponsable();
  }
}

/// Detalle privado del autor; las actuaciones llegan con P6.
class DetalleIncidente {
  const DetalleIncidente({
    required this.resumen,
    required this.descripcion,
    required this.ocurridoEn,
    required this.institucionResponsable,
    this.evaluacion,
  });
  final ResumenIncidente resumen;
  final String descripcion;
  final DateTime ocurridoEn;
  final InstitucionResponsable institucionResponsable;

  /// Evaluación propia (P5.1); null si el incidente no tiene evaluación.
  final EvaluacionPropia? evaluacion;
  bool get institucionPendiente => institucionResponsable.pendiente;

  static DetalleIncidente? desdeJson(Object? json) {
    final resumen = ResumenIncidente.desdeJson(json);
    if (resumen == null || json is! Map<String, dynamic>) return null;
    final ocurrencia = json['ocurrencia'];
    final instante =
        ocurrencia is Map<String, dynamic> && ocurrencia['instante'] is String
        ? DateTime.tryParse(ocurrencia['instante'] as String)
        : null;
    final institucion = json['institucionResponsable'];
    if (json['descripcion'] is! String ||
        instante == null ||
        institucion is! Map<String, dynamic>) {
      return null;
    }
    return DetalleIncidente(
      resumen: resumen,
      descripcion: json['descripcion'] as String,
      ocurridoEn: instante,
      institucionResponsable: InstitucionResponsable.desdeJson(institucion),
      evaluacion: EvaluacionPropia.desdeJson(json['evaluacion']),
    );
  }
}

/// Resultado de aclarar la evaluación propia (P5.1).
sealed class ResultadoAclaracion {
  const ResultadoAclaracion();
}

final class AclaracionAplicada extends ResultadoAclaracion {
  const AclaracionAplicada(this.evaluacion);
  final EvaluacionPropia evaluacion;
}

final class AclaracionCamposInvalidos extends ResultadoAclaracion {
  const AclaracionCamposInvalidos(this.campos);
  final Map<String, String> campos;
}

final class AclaracionCerrada extends ResultadoAclaracion {
  const AclaracionCerrada();
}

final class AclaracionNoEncontrada extends ResultadoAclaracion {
  const AclaracionNoEncontrada();
}

final class AclaracionSesionInvalida extends ResultadoAclaracion {
  const AclaracionSesionInvalida();
}

final class AclaracionSinConexion extends ResultadoAclaracion {
  const AclaracionSinConexion();
}

final class AclaracionNoDisponible extends ResultadoAclaracion {
  const AclaracionNoDisponible();
}

/// Vista limitada del invitado: solo estado y resumen ciudadano.
class VistaInvitado {
  const VistaInvitado({
    required this.referencia,
    required this.categoria,
    required this.estado,
    required this.recibidoEn,
    required this.institucionResponsable,
  });
  final String referencia;
  final String categoria;
  final String estado;
  final DateTime recibidoEn;
  final InstitucionResponsable institucionResponsable;
  bool get institucionPendiente => institucionResponsable.pendiente;

  static VistaInvitado? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final categoria = json['categoria'];
    final nombre = categoria is Map<String, dynamic>
        ? (categoria['nombre'] ?? categoria['id'])
        : null;
    final recibido = json['recibidoEn'] is String
        ? DateTime.tryParse(json['recibidoEn'] as String)
        : null;
    final institucion = json['institucionResponsable'];
    if (json['referencia'] is! String ||
        nombre is! String ||
        json['estado'] is! String ||
        recibido == null ||
        institucion is! Map<String, dynamic>) {
      return null;
    }
    return VistaInvitado(
      referencia: json['referencia'] as String,
      categoria: nombre,
      estado: json['estado'] as String,
      recibidoEn: recibido,
      institucionResponsable: InstitucionResponsable.desdeJson(institucion),
    );
  }
}

/// Resultado genérico de las consultas de seguimiento y catálogos.
sealed class Consulta<T> {
  const Consulta();
}

final class ConsultaObtenida<T> extends Consulta<T> {
  const ConsultaObtenida(this.valor);
  final T valor;
}

/// 404 uniforme: referencia o código incorrectos, o incidente ajeno.
final class ConsultaNoEncontrada<T> extends Consulta<T> {
  const ConsultaNoEncontrada();
}

final class ConsultaSesionInvalida<T> extends Consulta<T> {
  const ConsultaSesionInvalida();
}

final class ConsultaLimite<T> extends Consulta<T> {
  const ConsultaLimite(this.segundos);
  final int segundos;
}

final class ConsultaSinConexion<T> extends Consulta<T> {
  const ConsultaSinConexion();
}

/// 503 u otra respuesta no esperada.
final class ConsultaNoDisponible<T> extends Consulta<T> {
  const ConsultaNoDisponible();
}

/// Página del historial propio.
class PaginaHistorial {
  const PaginaHistorial(this.elementos, this.siguiente);
  final List<ResumenIncidente> elementos;
  final String? siguiente;
}

/// Contorno distrital del catálogo para dibujar los límites cuando el mapa base no carga. Anillos
/// exteriores en (latitud, longitud).
class ContornoDistrito {
  const ContornoDistrito({
    required this.id,
    required this.nombre,
    required this.anillos,
  });
  final String id;
  final String nombre;
  final List<List<(double, double)>> anillos;
}

/// Registro y seguimiento de incidentes sobre la API REST. Sin reintentos automáticos: el reintento
/// lo decide la persona y reutiliza la misma clave de idempotencia. No registra cuerpos ni códigos.
class IncidentesRepositorio {
  IncidentesRepositorio(this._http);

  final ClienteHttp _http;

  Future<Consulta<List<CategoriaIncidente>>> categorias() async {
    final RespuestaApi r;
    try {
      r = await _http.enviar('GET', '/publico/categorias');
    } on Exception {
      return const ConsultaSinConexion();
    }
    final lista = r.cuerpo?['categorias'];
    if (r.estado != 200 || lista is! List) return const ConsultaNoDisponible();
    return ConsultaObtenida([
      for (final c in lista)
        if (c is Map<String, dynamic> &&
            c['id'] is String &&
            c['nombre'] is String &&
            c['activa'] == true)
          CategoriaIncidente(
            id: c['id'] as String,
            nombre: c['nombre'] as String,
          ),
    ]);
  }

  /// Envía el reporte. Con [token] es un envío con cuenta; sin él, de invitado.
  Future<ResultadoEnvio> registrar({
    required Map<String, Object?> cuerpo,
    required String claveIdempotencia,
    String? token,
  }) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        '/incidentes',
        cuerpo: cuerpo,
        token: token,
        cabeceras: {'Idempotency-Key': claveIdempotencia},
      );
    } on Exception {
      // Sin respuesta (red, tiempo agotado): no se sabe si se registró.
      return const EnvioIncierto();
    }
    switch (r.estado) {
      case 200 || 201:
        final c = ComprobanteIncidente.desdeJson(r.cuerpo);
        return c == null
            ? EnvioErrorInesperado(_requestId(r))
            : EnvioConfirmado(c, repetido: r.estado == 200);
      case 400:
        final campos = _campos(r);
        return campos.isEmpty
            ? EnvioErrorInesperado(_requestId(r))
            : EnvioCamposInvalidos(campos);
      case 401:
        return const EnvioSesionInvalida();
      case 409:
        return const EnvioConflicto();
      case 429:
        return EnvioLimite(
          int.tryParse(r.cabeceras['retry-after'] ?? '') ?? 60,
        );
      default:
        // 5xx: el servidor no confirmó; reintentar con la misma clave no duplica.
        if (r.estado >= 500) return const EnvioIncierto();
        return EnvioErrorInesperado(_requestId(r));
    }
  }

  Future<Consulta<PaginaHistorial>> misIncidentes(
    String token, {
    String? cursor,
  }) async {
    final r = await _leer(
      'GET',
      cursor == null
          ? '/ciudadano/incidentes'
          : '/ciudadano/incidentes?cursor=${Uri.encodeQueryComponent(cursor)}',
      token: token,
    );
    if (r is! ConsultaObtenida<Map<String, dynamic>>) return _sinValor(r);
    final elementos = r.valor['elementos'];
    final siguiente = r.valor['siguiente'];
    if (elementos is! List) return const ConsultaNoDisponible();
    final lista = <ResumenIncidente>[];
    for (final e in elementos) {
      final resumen = ResumenIncidente.desdeJson(e);
      if (resumen == null) return const ConsultaNoDisponible();
      lista.add(resumen);
    }
    return ConsultaObtenida(
      PaginaHistorial(lista, siguiente is String ? siguiente : null),
    );
  }

  Future<Consulta<DetalleIncidente>> detalle(
    String token,
    String referencia,
  ) async {
    final r = await _leer(
      'GET',
      '/ciudadano/incidentes/${Uri.encodeComponent(referencia)}',
      token: token,
    );
    if (r is! ConsultaObtenida<Map<String, dynamic>>) return _sinValor(r);
    final d = DetalleIncidente.desdeJson(r.valor);
    return d == null ? const ConsultaNoDisponible() : ConsultaObtenida(d);
  }

  /// Aclara la evaluación propia con solo los campos que cambian. Reintentar la misma aclaración no
  /// crea otra versión en el servidor.
  Future<ResultadoAclaracion> aclararEvaluacion(
    String token,
    String referencia,
    Map<String, Object?> cambios,
  ) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(
        'POST',
        '/ciudadano/incidentes/${Uri.encodeComponent(referencia)}/evaluacion',
        token: token,
        cuerpo: cambios,
      );
    } on Exception {
      return const AclaracionSinConexion();
    }
    switch (r.estado) {
      case 200:
        final e = EvaluacionPropia.desdeJson(r.cuerpo?['evaluacion']);
        return e == null
            ? const AclaracionNoDisponible()
            : AclaracionAplicada(e);
      case 400:
        return AclaracionCamposInvalidos(_campos(r));
      case 401:
        return const AclaracionSesionInvalida();
      case 404:
        return const AclaracionNoEncontrada();
      case 409:
        return const AclaracionCerrada();
      default:
        return const AclaracionNoDisponible();
    }
  }

  /// Consulta del invitado: referencia y código siempre en el cuerpo, nunca en la URL.
  Future<Consulta<VistaInvitado>> consultarInvitado(
    String referencia,
    String codigo,
  ) async {
    final r = await _leer(
      'POST',
      '/publico/seguimiento',
      cuerpo: {'referencia': referencia, 'codigo': codigo},
    );
    if (r is! ConsultaObtenida<Map<String, dynamic>>) return _sinValor(r);
    final v = VistaInvitado.desdeJson(r.valor);
    return v == null ? const ConsultaNoDisponible() : ConsultaObtenida(v);
  }

  /// Límites distritales activos para dibujarlos si falla el mapa base. Sin cartografía: lista vacía.
  Future<List<ContornoDistrito>> contornos() async {
    try {
      final r = await _http.enviar('GET', '/publico/territorio/limites');
      final features = r.cuerpo?['features'];
      if (r.estado != 200 || features is! List) return const [];
      final contornos = <ContornoDistrito>[];
      for (final f in features) {
        if (f is! Map<String, dynamic>) continue;
        final props = f['properties'];
        final geo = f['geometry'];
        if (props is! Map<String, dynamic> || geo is! Map<String, dynamic>) {
          continue;
        }
        final poligonos = geo['type'] == 'Polygon'
            ? [geo['coordinates']]
            : geo['type'] == 'MultiPolygon'
            ? geo['coordinates'] as List
            : const [];
        final anillos = <List<(double, double)>>[];
        for (final p in poligonos) {
          if (p is! List || p.isEmpty || p.first is! List) continue;
          anillos.add([
            for (final c in p.first as List)
              if (c is List && c.length >= 2 && c[0] is num && c[1] is num)
                ((c[1] as num).toDouble(), (c[0] as num).toDouble()),
          ]);
        }
        contornos.add(
          ContornoDistrito(
            id: '${props['id']}',
            nombre: '${props['nombre']}',
            anillos: anillos,
          ),
        );
      }
      return contornos;
    } on Exception {
      return const [];
    }
  }

  Future<Consulta<Map<String, dynamic>>> _leer(
    String metodo,
    String ruta, {
    String? token,
    Map<String, Object?>? cuerpo,
  }) async {
    final RespuestaApi r;
    try {
      r = await _http.enviar(metodo, ruta, token: token, cuerpo: cuerpo);
    } on Exception {
      return const ConsultaSinConexion();
    }
    return switch (r.estado) {
      200 when r.cuerpo != null => ConsultaObtenida(r.cuerpo!),
      401 => const ConsultaSesionInvalida(),
      404 => const ConsultaNoEncontrada(),
      429 => ConsultaLimite(
        int.tryParse(r.cabeceras['retry-after'] ?? '') ?? 60,
      ),
      _ => const ConsultaNoDisponible(),
    };
  }

  Consulta<T> _sinValor<T>(Consulta<Map<String, dynamic>> r) => switch (r) {
    ConsultaNoEncontrada() => const ConsultaNoEncontrada(),
    ConsultaSesionInvalida() => const ConsultaSesionInvalida(),
    ConsultaLimite(:final segundos) => ConsultaLimite(segundos),
    ConsultaSinConexion() => const ConsultaSinConexion(),
    _ => const ConsultaNoDisponible(),
  };

  Map<String, String> _campos(RespuestaApi r) {
    final error = r.cuerpo?['error'];
    final campos = error is Map<String, dynamic> ? error['fields'] : null;
    if (campos is! Map<String, dynamic>) {
      // IDEMPOTENCY_KEY_REQUIRED u otros 400 sin campos: se presentan como error general.
      return const {};
    }
    return {
      for (final e in campos.entries)
        if (e.value is String) e.key: e.value as String,
    };
  }

  String? _requestId(RespuestaApi r) {
    final error = r.cuerpo?['error'];
    final id = error is Map<String, dynamic> ? error['requestId'] : null;
    return id is String ? id : null;
  }
}
