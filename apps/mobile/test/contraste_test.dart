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
  final esquema = crearEsquema();

  // Pares realmente usados por el tema de referencia y sus componentes.
  final combinaciones = <String, (Color, Color, double)>{
    'texto Material sobre fondo': (esquema.onSurface, Colores.fondo, texto),
    'texto Material sobre superficie': (
      esquema.onSurface,
      Colores.superficie,
      texto,
    ),
    'cabecera (AppBar) sobre fondo': (Colores.cabecera, Colores.fondo, texto),
    'texto secundario sobre superficie': (
      Colores.textoSecundario,
      Colores.superficie,
      texto,
    ),
    'texto secundario sobre fondo': (
      Colores.textoSecundario,
      Colores.fondo,
      texto,
    ),
    'botón principal (blanco sobre principal)': (
      Colors.white,
      Colores.principal,
      texto,
    ),
    'enlace/acción de texto sobre fondo': (
      Colores.principal,
      Colores.fondo,
      texto,
    ),
    'enlace/acción de texto sobre superficie': (
      Colores.principal,
      Colores.superficie,
      texto,
    ),
    'seleccionado en barra (sobre indicador)': (
      Colores.cabecera,
      Colores.indicador,
      texto,
    ),
    'fila seleccionada del Drawer': (
      Colores.principal,
      Colores.seleccion,
      texto,
    ),
    'texto blanco sobre inicio del degradado': (
      Colors.white,
      Colores.cabecera,
      texto,
    ),
    'texto blanco sobre semilla del degradado': (
      Colors.white,
      Colores.semilla,
      texto,
    ),
    'acento de mapa sobre superficie': (
      Colores.acentoMapa,
      Colores.superficie,
      texto,
    ),
    'acento de ayuda sobre superficie': (
      Colores.acentoAyuda,
      Colores.superficie,
      texto,
    ),
    'acento de alertas sobre superficie': (
      Colores.acentoAlertas,
      Colores.superficie,
      texto,
    ),
    'enlaces sobre mensaje informativo': (
      Colores.principal,
      Colores.fondoInfo,
      texto,
    ),
    'enlaces sobre mensaje de error': (
      Colores.principal,
      Colores.fondoError,
      texto,
    ),
    'enlaces sobre mensaje de éxito': (
      Colores.principal,
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
      Colores.bordeCampo,
      Colores.superficie,
      noTexto,
    ),
    'borde de campo sobre fondo (no texto)': (
      Colores.bordeCampo,
      Colores.fondo,
      noTexto,
    ),
    'foco principal sobre superficie (no texto)': (
      Colores.principal,
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

  test('el borde de campo del origen (#C8DCE1) no alcanza 3:1: por eso existe bordeCampo', () {
    // Documenta la adaptación con la medición, no con una suposición.
    expect(
      contraste(const Color(0xFFC8DCE1), Colores.superficie),
      lessThan(noTexto),
    );
  });

  test('texto blanco de 16 sobre el final del degradado (#209B86) no alcanza 4,5:1', () {
    // El bloque destacado de Inicio no coloca texto normal sobre ese extremo (ver inicio_pantalla).
    expect(contraste(Colors.white, Colores.degradadoFinal), lessThan(texto));
  });

  test('el tema conserva las medidas del origen y los mínimos AyniSafe', () {
    final tema = crearTema();
    expect(tema.scaffoldBackgroundColor, Colores.fondo);
    expect(tema.appBarTheme.foregroundColor, Colores.cabecera);
    expect(tema.colorScheme.primary, Colores.principal);
    expect(tema.navigationBarTheme.indicatorColor, Colores.indicador);
    expect(tema.listTileTheme.selectedTileColor, Colores.seleccion);
    final minimo = tema.filledButtonTheme.style!.minimumSize!.resolve({})!;
    expect(minimo.height, alturaBotonPrincipal);
    expect(tema.textTheme.bodyMedium!.fontSize, tamanoTextoBase);
    // Tipografía Material de la plataforma, sin las familias web de la portada.
    expect(
      tema.textTheme.titleLarge?.fontFamily,
      isNot(anyOf('DM Sans', 'Manrope')),
    );
  });
}
