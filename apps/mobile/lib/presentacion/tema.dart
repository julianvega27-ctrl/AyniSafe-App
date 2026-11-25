import 'package:flutter/material.dart';

/// Espaciado basado en múltiplos de 8.
abstract final class Espaciado {
  static const double unidad = 8;
  static const double s1 = unidad;
  static const double s2 = unidad * 2;
  static const double s3 = unidad * 3;
  static const double s4 = unidad * 4;
}

/// Altura mínima de controles interactivos y texto base (requisitos AyniSafe).
const double alturaMinimaControl = 48;
const double tamanoTextoBase = 16;

/// Alto del botón principal del origen (FilledButton 48×52).
const double alturaBotonPrincipal = 52;

/// Radios del origen: tarjetas 22, campos y botones 16, bloques destacados 26.
abstract final class Radios {
  static const double tarjeta = 22;
  static const double control = 16;
  static const double destacado = 26;
}

/// Tema Material de la app de referencia (`Proyecto_incidencias_400par`, `apps/mobile/lib/app.dart`,
/// efc1bce8), autoridad DESIGN.md. Se conservan sus colores por componente. Adaptaciones AyniSafe
/// medidas en `test/contraste_test.dart`: borde de campo y roles de mensaje.
abstract final class Colores {
  /// Semilla y acción principal del origen.
  static const Color semilla = Color(0xFF087C72);
  static const Color principal = Color(0xFF086C63);
  static const Color secundario = Color(0xFF365CC9);

  /// Cabecera/AppBar e inicio del degradado del Drawer y bloques destacados.
  static const Color cabecera = Color(0xFF123B46);

  /// Final del degradado del bloque «Reportar» del Inicio de referencia.
  static const Color degradadoFinal = Color(0xFF209B86);
  static const Color iconoSobreOscuro = Color(0xFFAFF4DA);

  static const Color fondo = Color(0xFFEFF6F7);
  static const Color superficie = Color(0xFFFFFFFF);
  static const Color bordeContenedor = Color(0xFFDCE9ED);

  /// AyniSafe: el borde de campo del origen (#C8DCE1, 1,42:1) no alcanza 3:1; mismo tono, más oscuro.
  static const Color bordeCampo = Color(0xFF6B8A92);
  static const Color indicador = Color(0xFFC5EFE4);
  static const Color seleccion = Color(0xFFD8F3EB);

  /// Texto secundario de las tarjetas de Inicio del origen.
  static const Color textoSecundario = Color(0xFF526B76);

  /// Acentos de los accesos de Inicio del origen (sobre blanco, ≥4,5:1).
  static const Color acentoMapa = Color(0xFF365CC9);
  static const Color acentoAyuda = Color(0xFFB64930);
  static const Color acentoAlertas = Color(0xFF9255AD);

  /// Roles de mensaje de AyniSafe (el origen solo tiene MessageCard blanca con icono principal).
  static const Color error = Color(0xFFA8231A);
  static const Color fondoError = Color(0xFFFCEDEB);
  static const Color exito = Color(0xFF14663A);
  static const Color fondoExito = Color(0xFFE8F5EC);
  static const Color info = Color(0xFF123B46);
  static const Color fondoInfo = Color(0xFFE1F2EE);
}

/// Esquema del origen: semilla #087C72 con principal/secundario fijados.
ColorScheme crearEsquema() => ColorScheme.fromSeed(seedColor: Colores.semilla)
    .copyWith(
      primary: Colores.principal,
      secondary: Colores.secundario,
      error: Colores.error,
    );

ThemeData crearTema() {
  final esquema = crearEsquema();
  const radioControl = BorderRadius.all(Radius.circular(Radios.control));
  OutlineInputBorder borde(Color color, double ancho) => OutlineInputBorder(
    borderRadius: radioControl,
    borderSide: BorderSide(color: color, width: ancho),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: esquema,
    scaffoldBackgroundColor: Colores.fondo,
    // Tipografía Material de la plataforma (sin familias web). AyniSafe: cuerpo de 16.
    textTheme: const TextTheme(
      bodyLarge: TextStyle(fontSize: tamanoTextoBase),
      bodyMedium: TextStyle(fontSize: tamanoTextoBase),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colores.fondo,
      foregroundColor: Colores.cabecera,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colores.superficie,
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radios.tarjeta),
        side: const BorderSide(color: Colores.bordeContenedor),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colores.superficie,
      // AyniSafe: etiqueta persistente sobre el campo.
      floatingLabelBehavior: FloatingLabelBehavior.always,
      helperMaxLines: 3,
      errorMaxLines: 4,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      border: borde(Colores.bordeCampo, 1),
      enabledBorder: borde(Colores.bordeCampo, 1),
      focusedBorder: borde(Colores.principal, 2),
      errorBorder: borde(Colores.error, 2),
      focusedErrorBorder: borde(Colores.error, 2),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(alturaMinimaControl, alturaBotonPrincipal),
        textStyle: const TextStyle(
          fontSize: tamanoTextoBase,
          fontWeight: FontWeight.w700,
        ),
        shape: const RoundedRectangleBorder(borderRadius: radioControl),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(alturaMinimaControl, alturaMinimaControl),
        shape: const RoundedRectangleBorder(borderRadius: radioControl),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(alturaMinimaControl, alturaMinimaControl),
        foregroundColor: Colores.principal,
        textStyle: const TextStyle(
          fontSize: tamanoTextoBase,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colores.superficie,
      indicatorColor: Colores.indicador,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (estados) => TextStyle(
          fontSize: 12,
          fontWeight: estados.contains(WidgetState.selected)
              ? FontWeight.w800
              : FontWeight.w500,
        ),
      ),
    ),
    listTileTheme: const ListTileThemeData(
      selectedTileColor: Colores.seleccion,
      selectedColor: Colores.principal,
      contentPadding: EdgeInsets.symmetric(horizontal: 20, vertical: 6),
    ),
  );
}
