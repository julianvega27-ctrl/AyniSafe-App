import 'package:flutter/material.dart';

/// Icono de cada categoría del catálogo (`categoryIcon` de `map_view.dart` del origen, con los
/// identificadores de AyniSafe). Acompaña siempre al nombre: el icono no transmite información solo.
IconData iconoCategoria(String? id) => switch (id) {
  'incendio' => Icons.local_fire_department,
  'accidente-transito' => Icons.car_crash,
  'emergencia-medica' => Icons.emergency,
  'inundacion' => Icons.flood,
  'deslizamiento' => Icons.landslide,
  'danos-sismo' => Icons.broken_image,
  'otra-emergencia' => Icons.sos,
  'robo' => Icons.local_police,
  'asalto' => Icons.shield,
  'pelea' => Icons.sports_mma,
  'vandalismo' => Icons.format_paint,
  'agresion' => Icons.personal_injury,
  'acoso' => Icons.report,
  'violencia' => Icons.front_hand,
  'actividad-sospechosa' => Icons.visibility,
  'otro-incidente-seguridad' => Icons.security,
  _ => Icons.warning_amber,
};
