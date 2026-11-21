/// Validación de entradas equivalente a la de la API (apps/api, dominio/validacion.ts).
/// Las longitudes se cuentan en puntos de código Unicode (`runes`), no en unidades UTF-16.
/// Se comparten vectores de prueba en apps/shared/vectores-validacion.json.
library;

const int nombreMax = 100;
const int correoMax = 254;
const int correoLocalMax = 64;
const int contrasenaMin = 15;
const int contrasenaMax = 128;

int longitudEnPuntosDeCodigo(String texto) => texto.runes.length;

final RegExp _local = RegExp(
  r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$",
);
final RegExp _etiqueta = RegExp(
  r'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$',
);

/// Sintaxis de correo (solo ASCII). No verifica existencia ni propiedad del buzón.
bool tieneSintaxisDeCorreo(String correo) {
  if (longitudEnPuntosDeCodigo(correo) > correoMax) return false;
  final arroba = correo.indexOf('@');
  if (arroba <= 0 || arroba != correo.lastIndexOf('@')) return false;
  final local = correo.substring(0, arroba);
  final dominio = correo.substring(arroba + 1);
  if (local.length > correoLocalMax || !_local.hasMatch(local)) return false;
  final etiquetas = dominio.split('.');
  return etiquetas.length >= 2 && etiquetas.every(_etiqueta.hasMatch);
}

/// Nombre normalizado para enviar: sin espacios en los extremos.
String nombreNormalizado(String valor) => valor.trim();

/// Correo normalizado para enviar: sin espacios en los extremos. La API lo guarda en minúsculas.
String correoNormalizado(String valor) => valor.trim();

String? errorDeNombre(String valor) {
  final n = longitudEnPuntosDeCodigo(nombreNormalizado(valor));
  if (n < 1) return 'Ingresa tu nombre.';
  if (n > nombreMax) return 'El nombre admite hasta $nombreMax caracteres.';
  return null;
}

String? errorDeCorreo(String valor) {
  final correo = correoNormalizado(valor);
  if (correo.isEmpty || !tieneSintaxisDeCorreo(correo)) {
    return 'Ingresa un correo válido.';
  }
  return null;
}

/// La contraseña no se recorta, normaliza ni trunca: se valida exactamente como se escribió.
String? errorDeContrasena(String valor) {
  if (valor.isEmpty) return 'Ingresa tu contraseña.';
  final n = longitudEnPuntosDeCodigo(valor);
  if (n < contrasenaMin || n > contrasenaMax) {
    return 'La contraseña debe tener entre $contrasenaMin y $contrasenaMax caracteres.';
  }
  return null;
}

/// Texto de ayuda visible bajo el campo de contraseña del registro.
const String ayudaContrasena =
    'Entre 15 y 128 caracteres. Puedes usar espacios.';
