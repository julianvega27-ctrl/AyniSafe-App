/// Mapa público (P7, `GET /publico/mapa`): publicaciones vigentes con su ubicación exacta y conteos de
/// casos reservados. Sin referencia, punto exacto, descripción, fotos ni datos personales.
library;

/// Distrito del catálogo del piloto para los filtros.
class DistritoCatalogo {
  const DistritoCatalogo({required this.id, required this.nombre});
  final String id;
  final String nombre;
}

/// Período de consulta del mapa público.
enum PeriodoMapa {
  dia('24h', 'Últimas 24 horas'),
  tresDias('3d', 'Últimos 3 días'),
  semana('7d', 'Últimos 7 días');

  const PeriodoMapa(this.valor, this.texto);
  final String valor;
  final String texto;
}

/// Incidente publicado con el punto informado en el reporte (decisión del 27/11/2026).
class PuntoMapa {
  const PuntoMapa({
    required this.id,
    required this.categoriaId,
    required this.categoria,
    required this.distritoId,
    required this.distrito,
    required this.latitud,
    required this.longitud,
    required this.estado,
    required this.ocurridoEn,
    required this.antiguedadHoras,
  });

  final String id;
  final String categoriaId;
  final String categoria;
  final String distritoId;
  final String distrito;
  final double latitud;
  final double longitud;
  final String estado;
  final DateTime ocurridoEn;
  final int antiguedadHoras;

  String get estadoTexto =>
      estado == 'EN_ATENCION' ? 'En atención' : 'En revisión';

  String get antiguedadTexto {
    if (antiguedadHoras < 1) return 'hace menos de 1 hora';
    if (antiguedadHoras < 24) {
      return antiguedadHoras == 1
          ? 'hace 1 hora'
          : 'hace $antiguedadHoras horas';
    }
    final dias = antiguedadHoras ~/ 24;
    return dias == 1 ? 'hace 1 día' : 'hace $dias días';
  }

  static PuntoMapa? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final categoria = json['categoria'];
    final distrito = json['distrito'];
    final ubicacion = json['ubicacion'];
    final id = json['id'];
    final estado = json['estado'];
    final horas = json['antiguedadHoras'];
    final ocurrido = DateTime.tryParse('${json['ocurridoEn']}');
    if (id is! String ||
        ocurrido == null ||
        estado is! String ||
        horas is! int ||
        categoria is! Map<String, dynamic> ||
        distrito is! Map<String, dynamic> ||
        ubicacion is! Map<String, dynamic> ||
        ubicacion['lat'] is! num ||
        ubicacion['lon'] is! num ||
        categoria['id'] is! String ||
        distrito['id'] is! String) {
      return null;
    }
    return PuntoMapa(
      id: id,
      categoriaId: categoria['id'] as String,
      categoria: (categoria['nombre'] as String?) ?? 'Incidente',
      distritoId: distrito['id'] as String,
      distrito: (distrito['nombre'] as String?) ?? (distrito['id'] as String),
      latitud: (ubicacion['lat'] as num).toDouble(),
      longitud: (ubicacion['lon'] as num).toDouble(),
      estado: estado,
      ocurridoEn: ocurrido,
      antiguedadHoras: horas,
    );
  }
}

/// Casos reservados contados por distrito y mes (solo grupos de al menos cinco).
class ConteoReservado {
  const ConteoReservado({
    required this.distrito,
    required this.mes,
    required this.total,
  });
  final String distrito;
  final String mes;
  final int total;

  static ConteoReservado? desdeJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final distrito = json['distrito'];
    final mes = json['mes'];
    final total = json['total'];
    if (distrito is! Map<String, dynamic> || mes is! String || total is! int) {
      return null;
    }
    return ConteoReservado(
      distrito: (distrito['nombre'] as String?) ?? '${distrito['id']}',
      mes: mes,
      total: total,
    );
  }
}

class MapaPublico {
  const MapaPublico({required this.puntos, required this.reservados});
  final List<PuntoMapa> puntos;
  final List<ConteoReservado> reservados;

  static MapaPublico? desdeJson(Map<String, dynamic> json) {
    final elementos = json['elementos'];
    final reservados = json['reservados'];
    if (elementos is! List || reservados is! List) return null;
    final puntos = <PuntoMapa>[];
    for (final e in elementos) {
      final p = PuntoMapa.desdeJson(e);
      if (p == null) return null;
      puntos.add(p);
    }
    return MapaPublico(
      puntos: puntos,
      reservados: [
        for (final r in reservados)
          if (ConteoReservado.desdeJson(r) case final ConteoReservado c) c,
      ],
    );
  }
}
