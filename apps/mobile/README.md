# AyniSafe – app ciudadana (Flutter)

App móvil del ciudadano. Esta entrega incluye **solo el acceso a la cuenta**: registro, inicio de sesión,
restauración de la sesión y cierre de sesión. No hay Inicio, Reportes, Mapa ni Alertas.

> Estado: probada en un emulador Android (API 37) contra la API y PostgreSQL locales. iOS conserva compatibilidad
> de diseño (Flutter), pero **no está compilado ni probado**: su validación y presupuesto son aparte (RC10).

## Requisitos

- Flutter estable (probado con 3.47.7 / Dart 3.13) y Android SDK.
- La API de `apps/api` en ejecución. Ver su [README](../api/README.md).

## Ejecutar la app

Desde `apps/mobile/`:

```bash
flutter pub get
flutter analyze
flutter test                       # pruebas de unidad y de widgets (122)
flutter run                        # emulador Android; la API se espera en http://10.0.2.2:3000
```

Con la API en otra dirección, se indica al compilar:

```bash
flutter run --dart-define=API_BASE_URL=https://api.ejemplo.pe
```

- `10.0.2.2` es el equipo anfitrión visto desde el emulador de Android.
- El tráfico HTTP sin cifrar solo se permite en compilaciones **debug** (`android/app/src/debug`). Una compilación
  release exige HTTPS. No se despliega nada desde aquí.
- Las dependencias quedan fijadas en `pubspec.lock`.

### Integración continua

En GitHub Actions (`.github/workflows/ci.yml`) corren `flutter analyze` y `flutter test` (unidad y widgets) con la
versión de Flutter fijada. **Las pruebas de `integration_test/` no se ejecutan en CI**: necesitan un dispositivo o
emulador Android y la API con su base de datos; se corren a mano como se explica a continuación.

### Prueba de integración en Android

Con el emulador encendido y la API (y su base de datos) en marcha:

```bash
flutter test integration_test/acceso_test.dart -d emulator-5554
```

Registra una cuenta por la interfaz, inicia sesión, simula un reinicio de la app, cierra sesión y comprueba que el
token revocado recibe 401, usando el almacén seguro real del dispositivo. Crea una cuenta de prueba en la base de
desarrollo.

## Qué hace la app

| Pantalla | Contenido |
|---|---|
| Inicia sesión | Correo, contraseña con Mostrar/Ocultar, «Ingresar», «Crear cuenta», privacidad y contactos. |
| Crea tu cuenta | Nombre, correo y contraseña en una sola pantalla; ayuda «Entre 15 y 128 caracteres. Puedes usar espacios». |
| Sesión iniciada | Nombre y correo del propietario, vencimiento y «Cerrar sesión». Destino mínimo, sin más funciones. |

No se piden DNI, teléfono, rol, ubicación ni notificaciones. El manifiesto de Android declara únicamente `INTERNET`.

### Contraseña y correo

- 15 a 128 **puntos de código** Unicode, con espacios, sin reglas de composición. Se permite pegar y usar gestores de
  contraseñas. La contraseña no se recorta, normaliza ni trunca. Nombre y correo se envían sin espacios en los extremos.
- La validación local es equivalente a la de la API y usa los mismos vectores de prueba
  (`apps/shared/vectores-validacion.json`). La API vuelve a validar siempre.
- El correo no se verifica: se puede entrar de inmediato tras registrarse.

### Enlaces públicos: estado real

Privacidad y contactos de emergencia son accesibles sin sesión, pero **todavía no hay contenido aprobado para
publicar**. Las pantallas lo declaran como «aún no disponible»; no se muestra un catálogo ni números inventados.
La pantalla de contactos aclara que AyniSafe no despacha emergencias.

### Recuperación de contraseña

No existe en esta entrega (RF03). El acceso muestra «Recuperación de contraseña: próximamente» como **texto no
interactivo**: sin enlace, ruta ni envío de correo. Quien olvide su contraseña no tiene salida autoservicio.

## Sesión: restauración, vencimiento y salida

- La API emite un token opaco con **vencimiento absoluto a las 24 horas**, sin renovación. La app lo guarda con su
  vencimiento en el almacén seguro del sistema (`flutter_secure_storage`: Android Keystore / iOS Keychain). Nunca se
  guarda la contraseña ni se usan preferencias simples. En un emulador se comprobó que las preferencias solo contienen
  valores cifrados.
- **Al abrir la app** con un token guardado se verifica con el servidor antes de mostrar nada privado:
  - Sesión válida: se abre «Sesión iniciada».
  - 401 (revocada, vencida o cuenta no habilitada): se borra el token y se vuelve al acceso.
  - Sin red o 503: se muestra «No pudimos verificar tu sesión» con **Reintentar**. El token se conserva y **no** hay
    acceso privado; no se trata como credencial inválida.
  - Un token ya vencido según su fecha se descarta sin consultar.
- **Si falla el guardado seguro** tras iniciar sesión: no se habilita el acceso, se descarta el token y se intenta
  revocarlo; la app pide reintentar.
- **Cerrar sesión** intenta revocar la sesión en el servidor y borra siempre los datos locales:
  - Con conexión: «Cerraste sesión.»
  - Sin conexión: se borra lo local y se avisa de que la sesión remota no pudo cerrarse y **vencerá a las 24 horas**.
  - Si falla el borrado seguro: se bloquea el acceso y se pide **reintentar la limpieza**; mientras tanto no se
    restaura ninguna sesión ni se afirma el cierre completo.
- El destino privado es la raíz de navegación: tras salir, «atrás» no vuelve a mostrar la identidad.

## Límites de esta entrega

- Solo Android probado; iOS no declarado como validado.
- Sin recuperación de contraseña, verificación de correo, edición de perfil ni funciones de reportes.
- El diseño usa los colores candidatos de la guía con un ajuste medido: el verde azulado `#007F78` no alcanza 4,5:1
  sobre los fondos de mensaje, por eso los enlaces usan `#006B65` (`test/contraste_test.dart`).
- Pruebas con lector de pantalla (TalkBack) y teclado físico pendientes de ejecución manual (ver informe de aceptación).

## Estructura

```text
lib/
  main.dart, app.dart       arranque y raíz según el estado de la sesión
  config/entorno.dart       URL de la API por entorno (--dart-define)
  datos/                    cliente HTTP, repositorio de autenticación, almacenamiento seguro
  aplicacion/               validación, controladores de registro, acceso y sesión
  presentacion/             tema, componentes y pantallas
test/                       unidad y widgets (dobles de API y de almacenamiento)
integration_test/           pruebas en dispositivo
```
