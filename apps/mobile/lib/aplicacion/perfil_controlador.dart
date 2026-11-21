import 'package:flutter/foundation.dart';

import '../datos/auth_repositorio.dart';
import '../datos/perfil_repositorio.dart';
import 'aviso.dart';
import 'validacion.dart';

/// Estado de carga del perfil. Vive solo en memoria y se descarta con la sesión.
enum CargaPerfil { cargando, listo, error }

/// Presentación del perfil propio: consulta, edición con una sola solicitud en curso y errores
/// por campo. No guarda nada en disco. Un 401 delega en [alSesionInvalida].
class PerfilControlador extends ChangeNotifier {
  PerfilControlador({
    required PerfilRepositorio repositorio,
    required String? Function() obtenerToken,
    required Future<void> Function() cuandoSesionInvalida,
    required void Function(UsuarioSesion) cuandoCambiaUsuario,
  }) : _repo = repositorio,
       _token = obtenerToken,
       _alSesionInvalida = cuandoSesionInvalida,
       _alActualizarUsuario = cuandoCambiaUsuario;

  final PerfilRepositorio _repo;
  final String? Function() _token;
  final Future<void> Function() _alSesionInvalida;
  final void Function(UsuarioSesion) _alActualizarUsuario;

  CargaPerfil _carga = CargaPerfil.cargando;
  PerfilCiudadano? _perfil;
  Aviso? _avisoCarga;
  bool _guardando = false;
  bool _cerrado = false;
  Map<String, String> _errores = const {};
  Aviso? _avisoEdicion;
  Future<void>? _cargaEnCurso;

  CargaPerfil get carga => _carga;
  PerfilCiudadano? get perfil => _perfil;
  Aviso? get avisoCarga => _avisoCarga;
  bool get guardando => _guardando;
  Map<String, String> get errores => _errores;
  Aviso? get avisoEdicion => _avisoEdicion;

  void _notificar() {
    if (!_cerrado) notifyListeners();
  }

  /// Consulta el perfil. Llamadas simultáneas comparten una sola solicitud. Si ya hay un perfil
  /// y falla la actualización, se conserva el anterior y se informa del fallo.
  Future<void> cargar() =>
      _cargaEnCurso ??= _cargar().whenComplete(() => _cargaEnCurso = null);

  Future<void> _cargar() async {
    final token = _token();
    if (token == null) return;
    if (_perfil == null) {
      _carga = CargaPerfil.cargando;
      _notificar();
    }
    final resultado = await _repo.obtener(token);
    switch (resultado) {
      case PerfilObtenido(:final perfil):
        _perfil = perfil;
        _carga = CargaPerfil.listo;
        _avisoCarga = null;
        _sincronizarNombre(perfil);
      case PerfilSesionInvalida():
        await _alSesionInvalida();
        return;
      case _:
        _avisoCarga = _avisoDe(resultado);
        _carga = _perfil == null ? CargaPerfil.error : CargaPerfil.listo;
    }
    _notificar();
  }

  /// Quita el error de un campo cuando la persona lo edita.
  void limpiarError(String campo) {
    if (!_errores.containsKey(campo)) return;
    _errores = {..._errores}..remove(campo);
    _notificar();
  }

  /// Descarta errores y avisos de una edición anterior al abrir el formulario.
  void reiniciarEdicion() {
    _errores = const {};
    _avisoEdicion = null;
  }

  /// Guarda nombre, teléfono y autorización. Devuelve `true` solo si el servidor confirmó el
  /// guardado. Una sola solicitud en curso: pulsaciones repetidas se ignoran. Sin reintentos
  /// automáticos; ante cualquier fallo no se afirma que se guardó y el formulario conserva todo.
  Future<bool> guardar({
    required String nombre,
    required String telefono,
    required bool compartirTelefono,
  }) async {
    if (_guardando) return false;
    final token = _token();
    if (token == null) return false;

    final telefonoNormal = telefonoNormalizado(telefono);
    final locales = <String, String>{
      'nombre': ?errorDeNombre(nombre),
      'telefono': ?errorDeTelefono(telefono),
      if (compartirTelefono && telefonoNormal == '')
        'compartirTelefono': 'Registra un teléfono antes de autorizar compartirlo.',
    };
    if (locales.isNotEmpty) {
      _errores = locales;
      _avisoEdicion = null;
      _notificar();
      return false;
    }

    _guardando = true;
    _errores = const {};
    _avisoEdicion = null;
    _notificar();

    final resultado = await _repo.actualizar(token, {
      'nombre': nombreNormalizado(nombre),
      'telefono': telefonoNormal == '' ? null : telefonoNormal,
      'compartirTelefono': compartirTelefono,
    });

    _guardando = false;
    switch (resultado) {
      case PerfilObtenido(:final perfil):
        _perfil = perfil;
        _carga = CargaPerfil.listo;
        _sincronizarNombre(perfil);
        _notificar();
        return true;
      case PerfilSesionInvalida():
        _notificar();
        await _alSesionInvalida();
        return false;
      case PerfilCamposInvalidos(:final campos):
        _errores = {
          for (final e in campos.entries)
            if (e.key != 'cuerpo') e.key: e.value,
        };
        if (_errores.isEmpty) {
          _avisoEdicion = const Aviso(
            TipoAviso.error,
            'Revisa los datos ingresados.',
          );
        }
      case _:
        _avisoEdicion = _avisoDe(resultado);
    }
    _notificar();
    return false;
  }

  void _sincronizarNombre(PerfilCiudadano perfil) {
    _alActualizarUsuario(
      UsuarioSesion(id: perfil.id, nombre: perfil.nombre, correo: perfil.correo),
    );
  }

  Aviso _avisoDe(ResultadoPerfil r) => switch (r) {
    PerfilSinConexion() => const Aviso(
      TipoAviso.error,
      'No hay conexión con el servidor. No se guardó ningún cambio; revisa tu conexión e inténtalo de nuevo.',
    ),
    PerfilNoDisponible() => const Aviso(
      TipoAviso.error,
      textoServicioNoDisponible,
    ),
    PerfilErrorInesperado(:final requestId) => Aviso(
      TipoAviso.error,
      textoErrorInesperado(requestId),
    ),
    _ => const Aviso(TipoAviso.error, 'Revisa los datos ingresados.'),
  };

  @override
  void dispose() {
    _cerrado = true;
    super.dispose();
  }
}
