import 'package:geolocator/geolocator.dart';

/// Punto obtenido por GPS con permiso.
class PuntoUbicado {
  const PuntoUbicado({
    required this.latitud,
    required this.longitud,
    required this.precisionM,
  });
  final double latitud;
  final double longitud;
  final double precisionM;
}

sealed class ResultadoUbicacion {
  const ResultadoUbicacion();
}

final class UbicacionObtenida extends ResultadoUbicacion {
  const UbicacionObtenida(this.punto);
  final PuntoUbicado punto;
}

/// La persona rechazó el permiso. Si es permanente, solo puede cambiarse en Ajustes.
final class UbicacionDenegada extends ResultadoUbicacion {
  const UbicacionDenegada({required this.permanente});
  final bool permanente;
}

final class UbicacionServicioApagado extends ResultadoUbicacion {
  const UbicacionServicioApagado();
}

/// Tiempo agotado u otro fallo del sensor.
final class UbicacionNoDisponible extends ResultadoUbicacion {
  const UbicacionNoDisponible();
}

/// Ubicación del dispositivo. Solo se llama al pulsar «Usar mi ubicación»: nunca al abrir pantallas
/// ni en segundo plano.
abstract interface class UbicacionPuerto {
  Future<ResultadoUbicacion> obtener();
}

/// Implementación con `geolocator` (adaptada de `readDeviceLocation` del origen): pide el permiso
/// solo si aún no se concedió y obtiene una única posición con tiempo límite.
class UbicacionGeolocator implements UbicacionPuerto {
  const UbicacionGeolocator({this.limite = const Duration(seconds: 20)});
  final Duration limite;

  @override
  Future<ResultadoUbicacion> obtener() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return const UbicacionServicioApagado();
      }
      var permiso = await Geolocator.checkPermission();
      if (permiso == LocationPermission.denied) {
        permiso = await Geolocator.requestPermission();
      }
      if (permiso == LocationPermission.deniedForever) {
        return const UbicacionDenegada(permanente: true);
      }
      if (permiso == LocationPermission.denied ||
          permiso == LocationPermission.unableToDetermine) {
        return const UbicacionDenegada(permanente: false);
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: limite,
        ),
      );
      return UbicacionObtenida(
        PuntoUbicado(
          latitud: p.latitude,
          longitud: p.longitude,
          precisionM: p.accuracy,
        ),
      );
    } on Exception {
      return const UbicacionNoDisponible();
    }
  }
}
