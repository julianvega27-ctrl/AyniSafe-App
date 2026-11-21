import 'package:flutter/material.dart';

import 'app.dart';
import 'aplicacion/sesion_controlador.dart';
import 'datos/almacenamiento_sesion.dart';
import 'datos/auth_repositorio.dart';
import 'datos/cliente_http.dart';
import 'datos/enlaces_cuenta.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final repositorio = AuthRepositorio(ClienteHttp());
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
      enlaces: FuenteDeEnlacesAppLinks(),
    ),
  );
}
