import 'dart:convert';
import 'dart:io';

import 'package:ayni_safe/aplicacion/validacion.dart';
import 'package:flutter_test/flutter_test.dart';

/// Usa los mismos vectores que la API (apps/shared/vectores-validacion.json).
String expandir(Object? v) {
  if (v is String) return v;
  if (v is List) return v.map(expandir).join();
  final m = v as Map<String, dynamic>;
  return (m['repetir'] as String) * (m['veces'] as int);
}

void main() {
  final archivo = File('../shared/vectores-validacion.json');
  final vectores =
      jsonDecode(archivo.readAsStringSync()) as Map<String, dynamic>;

  List<Map<String, dynamic>> de(String clave) =>
      (vectores[clave] as List).cast<Map<String, dynamic>>();

  group('vectores compartidos con la API', () {
    for (final v in de('nombre')) {
      test('nombre: ${v['caso']}', () {
        final valor = expandir(v['valor']);
        expect(errorDeNombre(valor) == null, v['valido']);
        if (v['normalizado'] != null) {
          expect(nombreNormalizado(valor), v['normalizado']);
        }
      });
    }
    for (final v in de('correo')) {
      test('correo: ${v['caso']}', () {
        final valor = expandir(v['valor']);
        expect(errorDeCorreo(valor) == null, v['valido']);
        if (v['normalizado'] != null) {
          // La app solo recorta; la API pasa a minúsculas.
          expect(correoNormalizado(valor).toLowerCase(), v['normalizado']);
        }
      });
    }
    for (final v in de('contrasena')) {
      test('contraseña: ${v['caso']}', () {
        expect(errorDeContrasena(expandir(v['valor'])) == null, v['valido']);
      });
    }
  });

  group('puntos de código', () {
    test('un carácter fuera del plano básico cuenta como uno (no como dos unidades UTF-16)', () {
      const emoji = '\u{1F600}';
      expect(emoji.length, 2);
      expect(longitudEnPuntosDeCodigo(emoji), 1);
    });

    test('la contraseña no se recorta ni se normaliza', () {
      // 11 letras + 4 espacios: solo alcanza el mínimo si los espacios cuentan.
      expect(errorDeContrasena('  abcdefghijk  '), isNull);
      expect(errorDeContrasena('  abcdefghijk  '.trim()), isNotNull);
    });

    test('límites 14, 15, 128 y 129', () {
      expect(errorDeContrasena('a' * 14), isNotNull);
      expect(errorDeContrasena('a' * 15), isNull);
      expect(errorDeContrasena('a' * 128), isNull);
      expect(errorDeContrasena('a' * 129), isNotNull);
    });
  });

  test('los mensajes no contienen el valor ingresado', () {
    const secreto = 'secreto-corto';
    expect(errorDeContrasena(secreto), isNot(contains(secreto)));
  });
}
