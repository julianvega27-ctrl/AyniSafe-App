/// URL base de la API por entorno. Se fija al compilar:
///   flutter run --dart-define=API_BASE_URL=https://api.ejemplo.pe
/// Por defecto apunta al host local visto desde el emulador Android.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

/// Prefijo de version de la API REST.
const String apiPrefijo = '/api/v1';
