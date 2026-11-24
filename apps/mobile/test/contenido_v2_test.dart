import 'package:ayni_safe/datos/contenido_repositorio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dobles.dart';

void main() {
  test('el contenido v2 con la sección «piloto» se interpreta sin errores y la app no la usa', () {
    final json = contenidoJson();
    expect(json['version'], 2);
    expect(json['piloto'], {'estado': 'pendiente'});

    final contenido = ContenidoPublico.desdeJson(json);
    expect(contenido, isNotNull);
    expect(contenido!.appAprobada, isTrue);
    expect(contenido.desarrolladoresAprobados, isTrue);
    expect(contenido.privacidadAprobada, isTrue);
    expect(contenido.contactosAprobados, isFalse);
    expect(contenido.contactos, isEmpty);
  });

  test('una clave desconocida de primer nivel no invalida el contenido', () {
    final json = {...contenidoJson(), 'seccionFutura': {'estado': 'pendiente'}};
    expect(ContenidoPublico.desdeJson(json), isNotNull);
  });
}
