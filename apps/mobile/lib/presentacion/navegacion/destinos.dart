import 'package:flutter/material.dart';

/// Destinos de la navegación ciudadana del origen (`CitizenShell`). Los cuatro primeros van en la barra
/// inferior; el resto, en el Drawer. La ubicación de un destino no implica que su capacidad exista.
enum Destino {
  inicio('Inicio', Icons.home_outlined),
  reportar('Reportar', Icons.add_location_alt_outlined),
  mapa('Mapa', Icons.map_outlined),
  contactos('Contactos', Icons.call_outlined),
  alertas('Alertas', Icons.warning_amber_outlined),
  informacion('Conoce AyniSafe', Icons.info_outline),

  /// Sin sesión: acceso y registro vigentes. Con sesión el perfil se abre como pantalla propia.
  cuenta('Mi cuenta', Icons.person_outline),

  /// Requiere sesión verificada.
  misReportes('Mis reportes', Icons.history);

  /// El origen usa el mismo icono contorneado seleccionado o no; la selección la marca el indicador.
  const Destino(this.titulo, this.icono);
  final String titulo;
  final IconData icono;

  bool get enBarra => index < 4;
  static const List<Destino> barra = [inicio, reportar, mapa, contactos];
}
