import 'cliente_http.dart';

/// Contenido público de AyniSafe (`GET /publico/contenido`). Cada sección declara si está
/// aprobada; una sección pendiente no lleva texto y la app dice que aún no está disponible.
class ContenidoPublico {
  const ContenidoPublico({
    required this.version,
    required this.appAprobada,
    required this.finalidad,
    required this.funcionamiento,
    required this.desarrolladoresAprobados,
    required this.desarrolladores,
    required this.privacidadAprobada,
    required this.privacidad,
    required this.contactosAprobados,
    required this.contactos,
  });

  final int version;
  final bool appAprobada;
  final String? finalidad;
  final String? funcionamiento;
  final bool desarrolladoresAprobados;
  final List<PersonaDesarrolladora> desarrolladores;
  final bool privacidadAprobada;
  final List<SeccionPrivacidad> privacidad;
  final bool contactosAprobados;
  final List<ContactoEmergencia> contactos;

  static ContenidoPublico? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final version = json['version'];
    final app = json['app'];
    final dev = json['desarrolladores'];
    final priv = json['privacidad'];
    final con = json['contactos'];
    if (version is! int ||
        app is! Map<String, dynamic> ||
        dev is! Map<String, dynamic> ||
        priv is! Map<String, dynamic> ||
        con is! Map<String, dynamic>) {
      return null;
    }
    List<T> lista<T>(Object? origen, T? Function(Object?) convertir) {
      if (origen is! List) return const [];
      return [
        for (final e in origen)
          if (convertir(e) case final T v) v,
      ];
    }

    final finalidad = app['finalidad'];
    final funcionamiento = app['funcionamiento'];
    return ContenidoPublico(
      version: version,
      appAprobada: app['estado'] == 'aprobado',
      finalidad: finalidad is String ? finalidad : null,
      funcionamiento: funcionamiento is String ? funcionamiento : null,
      desarrolladoresAprobados: dev['estado'] == 'aprobado',
      desarrolladores: lista(dev['personas'], PersonaDesarrolladora.desdeJson),
      privacidadAprobada: priv['estado'] == 'aprobado',
      privacidad: lista(priv['secciones'], SeccionPrivacidad.desdeJson),
      contactosAprobados: con['estado'] == 'aprobado',
      contactos: lista(con['items'], ContactoEmergencia.desdeJson),
    );
  }
}

class PersonaDesarrolladora {
  const PersonaDesarrolladora({required this.nombre, required this.rol});
  final String nombre;
  final String rol;

  static PersonaDesarrolladora? desdeJson(Object? json) {
    if (json is Map<String, dynamic> &&
        json['nombre'] is String &&
        json['rol'] is String) {
      return PersonaDesarrolladora(
        nombre: json['nombre'] as String,
        rol: json['rol'] as String,
      );
    }
    return null;
  }
}

class SeccionPrivacidad {
  const SeccionPrivacidad({required this.titulo, required this.texto});
  final String titulo;
  final String texto;

  static SeccionPrivacidad? desdeJson(Object? json) {
    if (json is Map<String, dynamic> &&
        json['titulo'] is String &&
        json['texto'] is String) {
      return SeccionPrivacidad(
        titulo: json['titulo'] as String,
        texto: json['texto'] as String,
      );
    }
    return null;
  }
}

/// Contacto aprobado: se publica solo con institución, número, cobertura, fuente y fecha de
/// verificación.
class ContactoEmergencia {
  const ContactoEmergencia({
    required this.institucion,
    required this.numero,
    required this.cobertura,
    required this.fuente,
    required this.verificadoAt,
  });

  final String institucion;
  final String numero;
  final String cobertura;
  final String fuente;
  final String verificadoAt;

  static ContactoEmergencia? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final campos = [
      json['institucion'],
      json['numero'],
      json['cobertura'],
      json['fuente'],
      json['verificadoAt'],
    ];
    if (campos.any((c) => c is! String)) return null;
    return ContactoEmergencia(
      institucion: campos[0]! as String,
      numero: campos[1]! as String,
      cobertura: campos[2]! as String,
      fuente: campos[3]! as String,
      verificadoAt: campos[4]! as String,
    );
  }
}

/// Resultado de pedir el contenido público.
sealed class ResultadoContenido {
  const ResultadoContenido();
}

final class ContenidoDisponible extends ResultadoContenido {
  const ContenidoDisponible(this.contenido, {this.desactualizado = false});
  final ContenidoPublico contenido;

  /// `true` si no se pudo actualizar y se muestra la última versión recibida en esta ejecución.
  final bool desactualizado;
}

final class ContenidoSinConexion extends ResultadoContenido {
  const ContenidoSinConexion();
}

final class ContenidoNoDisponible extends ResultadoContenido {
  const ContenidoNoDisponible();
}

/// Repositorio del contenido público. Sin sesión, sin reintentos automáticos. Conserva solo en
/// memoria la última respuesta recibida (no hay caché en disco en esta entrega).
class ContenidoRepositorio {
  ContenidoRepositorio(this._http);

  final ClienteHttp _http;
  ContenidoPublico? _ultimo;
  Future<ResultadoContenido>? _enCurso;

  /// Llamadas simultáneas comparten una sola solicitud.
  Future<ResultadoContenido> obtener() =>
      _enCurso ??= _obtener().whenComplete(() => _enCurso = null);

  Future<ResultadoContenido> _obtener() async {
    final RespuestaApi r;
    try {
      r = await _http.enviar('GET', '/publico/contenido');
    } on Exception {
      return _respaldo(const ContenidoSinConexion());
    }
    if (r.estado == 200) {
      final contenido = ContenidoPublico.desdeJson(r.cuerpo);
      if (contenido != null) {
        _ultimo = contenido;
        return ContenidoDisponible(contenido);
      }
    }
    return _respaldo(const ContenidoNoDisponible());
  }

  ResultadoContenido _respaldo(ResultadoContenido fallo) {
    final ultimo = _ultimo;
    return ultimo == null
        ? fallo
        : ContenidoDisponible(ultimo, desactualizado: true);
  }
}
