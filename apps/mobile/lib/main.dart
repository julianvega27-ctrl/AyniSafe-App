import 'package:flutter/material.dart';

import 'app.dart';
import 'aplicacion/sesion_controlador.dart';
import 'datos/almacenamiento_sesion.dart';
import 'datos/auth_repositorio.dart';
import 'datos/cliente_http.dart';
import 'datos/consultas_guardadas.dart';
import 'datos/contenido_repositorio.dart';
import 'datos/incidentes_repositorio.dart';
import 'datos/perfil_repositorio.dart';
import 'datos/enlaces_cuenta.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final http = ClienteHttp();
  final repositorio = AuthRepositorio(http);
  final sesion = SesionControlador(
    repositorio: repositorio,
    almacenamiento: AlmacenamientoSeguro(),
  );
  // Verifica con el servidor la sesión guardada antes de habilitar el acceso privado.
  sesion.restaurar();
  runApp(
    AyniSafeApp(
      repositorio: repositorio,
      sesion: sesion,
      contenido: ContenidoRepositorio(http),
      perfil: PerfilRepositorio(http),
      incidentes: IncidentesRepositorio(http),
      consultasGuardadas: ConsultasGuardadasSeguras(),
      enlaces: FuenteDeEnlacesAppLinks(),
    ),
  );
}
