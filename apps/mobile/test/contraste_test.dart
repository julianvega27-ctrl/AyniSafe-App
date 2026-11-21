import 'dart:math' as math;

import 'package:ayni_safe/presentacion/tema.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Contraste WCAG 2.x entre dos colores opacos.
double luminancia(Color c) {
  double canal(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

double contraste(Color a, Color b) {
  final l1 = luminancia(a);
  final l2 = luminancia(b);
  final claro = math.max(l1, l2);
  final oscuro = math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}

void main() {
  const texto = 4.5; // WCAG AA, texto normal
  const noTexto = 3.0; // WCAG AA, componentes de interfaz

  final combinaciones = <String, (Color, Color, double)>{
    'texto principal sobre fondo': (Colores.texto, Colores.fondo, texto),
    'texto principal sobre superficie de campo': (
      Colores.texto,
      Colores.superficie,
      texto,
    ),
    'texto secundario sobre fondo': (
      Colores.textoSecundario,
      Colores.fondo,
      texto,
    ),
    'texto secundario sobre superficie': (
      Colores.textoSecundario,
      Colores.superficie,
      texto,
    ),
    'texto del botón (blanco) sobre azul': (Colors.white, Colores.azul, texto),
    'enlaces (verde azulado oscuro) sobre fondo': (
      Colores.verdeAzuladoTexto,
      Colores.fondo,
      texto,
    ),
    'enlaces sobre fondo de mensaje informativo': (
      Colores.verdeAzuladoTexto,
      Colores.fondoInfo,
      texto,
    ),
    'enlaces sobre fondo de mensaje de error': (
      Colores.verdeAzuladoTexto,
      Colores.fondoError,
      texto,
    ),
    'enlaces sobre fondo de mensaje de éxito': (
      Colores.verdeAzuladoTexto,
      Colores.fondoExito,
      texto,
    ),
    'error sobre fondo': (Colores.error, Colores.fondo, texto),
    'error sobre superficie de campo': (
      Colores.error,
      Colores.superficie,
      texto,
    ),
    'error sobre su mensaje': (Colores.error, Colores.fondoError, texto),
    'éxito sobre su mensaje': (Colores.exito, Colores.fondoExito, texto),
    'información sobre su mensaje': (Colores.info, Colores.fondoInfo, texto),
    'borde de campo sobre superficie (no texto)': (
      Colores.borde,
      Colores.superficie,
      noTexto,
    ),
    'borde de campo sobre fondo (no texto)': (
      Colores.borde,
      Colores.fondo,
      noTexto,
    ),
    'foco azul sobre superficie (no texto)': (
      Colores.azul,
      Colores.superficie,
      noTexto,
    ),
  };

  for (final e in combinaciones.entries) {
    test('contraste suficiente: ${e.key}', () {
      final (primero, segundo, minimo) = e.value;
      final ratio = contraste(primero, segundo);
      expect(
        ratio,
        greaterThanOrEqualTo(minimo),
        reason: '${e.key}: ${ratio.toStringAsFixed(2)}:1 < $minimo:1',
      );
    });
  }

  test('el verde azulado candidato de la guía (#007F78) no alcanza 4,5:1 sobre los fondos de mensaje', () {
    // Documenta por qué existe verdeAzuladoTexto: la medición, no una suposición.
    // Sobre el fondo claro sí alcanza (4,54:1); sobre los fondos tintados de mensaje, no.
    expect(
      contraste(Colores.verdeAzulado, Colores.fondo),
      greaterThanOrEqualTo(texto),
    );
    expect(contraste(Colores.verdeAzulado, Colores.fondoInfo), lessThan(texto));
    expect(
      contraste(Colores.verdeAzulado, Colores.fondoError),
      lessThan(texto),
    );
    // Con texto blanco encima (botón relleno) sí es suficiente.
    expect(
      contraste(Colors.white, Colores.verdeAzulado),
      greaterThanOrEqualTo(texto),
    );
  });
}
