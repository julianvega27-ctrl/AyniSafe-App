/// URL base de la API por entorno. Se fija al compilar:
///   flutter run --dart-define=API_BASE_URL=https://api.ejemplo.pe
/// Por defecto apunta al host local visto desde el emulador Android.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

/// Prefijo de version de la API REST.
const String apiPrefijo = '/api/v1';

/// Plantilla de teselas ráster del mapa base del selector de punto (P4.1). Por defecto, la del
/// origen (OpenStreetMap estándar), con atribución visible. Configurable al compilar:
///   flutter run --dart-define=TILE_URL=https://teselas.ejemplo.pe/{z}/{x}/{y}.png
/// La validación del proveedor (política de uso, cuotas y privacidad) sigue pendiente para P7.
const String urlTeselas = String.fromEnvironment(
  'TILE_URL',
  defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
);

/// Atribución obligatoria del mapa base por defecto.
const String atribucionTeselas = String.fromEnvironment(
  'TILE_ATTRIBUTION',
  defaultValue: '© OpenStreetMap contributors',
);
