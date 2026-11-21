import 'package:flutter/material.dart';

/// Espaciado basado en múltiplos de 8 (guía de UI, §2.1).
abstract final class Espaciado {
  static const double unidad = 8;
  static const double s1 = unidad;
  static const double s2 = unidad * 2;
  static const double s3 = unidad * 3;
  static const double s4 = unidad * 4;
}

/// Altura mínima de controles interactivos y texto base (guía de UI, §2.1).
const double alturaMinimaControl = 48;
const double tamanoTextoBase = 16;

/// Colores candidatos de la guía, ajustados donde el contraste medido no alcanzaba.
/// `test/contraste_test.dart` comprueba cada combinación contra WCAG AA.
abstract final class Colores {
  static const Color azul = Color(0xFF17324D);
  static const Color verdeAzulado = Color(0xFF007F78);

  /// Verde azulado oscurecido para texto de enlaces sobre el fondo claro.
  static const Color verdeAzuladoTexto = Color(0xFF006B65);
  static const Color fondo = Color(0xFFF5F7FA);
  static const Color superficie = Color(0xFFFFFFFF);
  static const Color texto = Color(0xFF172B3A);
  static const Color textoSecundario = Color(0xFF4A5B68);
  static const Color borde = Color(0xFF6B7A86);
  static const Color error = Color(0xFFA8231A);
  static const Color fondoError = Color(0xFFFCEDEB);
  static const Color exito = Color(0xFF14663A);
  static const Color fondoExito = Color(0xFFE8F5EC);
  static const Color info = Color(0xFF17324D);
  static const Color fondoInfo = Color(0xFFE6EEF6);
}

ThemeData crearTema() {
  const radio = BorderRadius.all(Radius.circular(12));
  final esquema = ColorScheme.fromSeed(seedColor: Colores.azul).copyWith(
    primary: Colores.azul,
    onPrimary: Colors.white,
    secondary: Colores.verdeAzuladoTexto,
    error: Colores.error,
    surface: Colores.superficie,
    onSurface: Colores.texto,
  );
  OutlineInputBorder borde(Color color, double ancho) => OutlineInputBorder(
    borderRadius: radio,
    borderSide: BorderSide(color: color, width: ancho),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: esquema,
    scaffoldBackgroundColor: Colores.fondo,
    fontFamily: null, // tipografía del sistema
    textTheme: const TextTheme(
      bodyLarge: TextStyle(fontSize: tamanoTextoBase, color: Colores.texto),
      bodyMedium: TextStyle(fontSize: tamanoTextoBase, color: Colores.texto),
      labelLarge: TextStyle(
        fontSize: tamanoTextoBase,
        fontWeight: FontWeight.w600,
      ),
      titleLarge: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: Colores.texto,
      ),
      titleMedium: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: Colores.texto,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colores.superficie,
      floatingLabelBehavior:
          FloatingLabelBehavior.always, // etiqueta persistente
      labelStyle: const TextStyle(
        fontSize: tamanoTextoBase,
        color: Colores.textoSecundario,
      ),
      helperStyle: const TextStyle(
        fontSize: 14,
        color: Colores.textoSecundario,
      ),
      helperMaxLines: 3,
      errorMaxLines: 4,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: Espaciado.s2,
        vertical: Espaciado.s2,
      ),
      enabledBorder: borde(Colores.borde, 1),
      focusedBorder: borde(Colores.azul, 3),
      errorBorder: borde(Colores.error, 2),
      focusedErrorBorder: borde(Colores.error, 3),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, alturaMinimaControl),
        backgroundColor: Colores.azul,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(
          fontSize: tamanoTextoBase,
          fontWeight: FontWeight.w600,
        ),
        shape: const RoundedRectangleBorder(borderRadius: radio),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(64, alturaMinimaControl),
        foregroundColor: Colores.verdeAzuladoTexto,
        textStyle: const TextStyle(
          fontSize: tamanoTextoBase,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    // Foco visible para teclado y lectores de pantalla.
    focusColor: Colores.azul,
  );
}
