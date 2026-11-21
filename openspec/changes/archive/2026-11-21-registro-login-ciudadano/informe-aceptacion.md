# Informe de aceptación: registro-login-ciudadano

Fecha: 21 de noviembre de 2026. Entorno: Windows 11, Node 24, Flutter 3.47.7 / Dart 3.13, PostgreSQL 18 local
(clúster aislado, puerto 5433), emulador Android API 37 (`Medium_Phone_API_37.0`).

## 1. Resumen

El acceso ciudadano (registro, inicio de sesión, consulta/restauración y cierre de sesión) está **implementado y
verificado en local**: API Node/Express/TypeScript, PostgreSQL con Prisma y app Flutter para Android.

| Tarea | Estado |
|---|---|
| 1.x a 5.x (bases, validación, API, formularios, sesión) | Hechas y verificadas |
| 6.1, 6.2, 6.4, 6.5, 6.6 | Hechas |
| **6.3 accesibilidad en Android** | **Parcial: falta la sesión con lector de pantalla (ver sección 6)** |

**El flujo no debe declararse aceptado por completo hasta cerrar 6.3**, tal como lo exige la propia tarea.

No se desplegó nada. No se implementaron: recuperación de contraseña (RF03), verificación de correo, panel React, iOS
(no compilado ni probado) ni funciones de reportes.

## 2. Comandos ejecutados y resultados

| Verificación | Comando | Resultado |
|---|---|---|
| Tipos de la API | `npm run typecheck` (en `apps/api`) | Sin errores |
| Compilación de la API | `npm run build` | Correcta |
| Contrato OpenAPI | `npm run contrato:validar` | Válido (3.1.0), 4 operaciones |
| Pruebas de la API | `npm test` | **137 de 137** en 11 archivos |
| Análisis de la app | `flutter analyze` (en `apps/mobile`) | Sin incidencias |
| Pruebas de la app | `flutter test` | **122 de 122** |
| Integración Android (flujo completo) | `flutter test integration_test/acceso_test.dart -d emulator-5554` | Pasa |
| Integración Android (respuesta perdida) | `flutter test integration_test/perdida_respuesta_test.dart -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3001` | Pasa |
| Almacén seguro real | `flutter test integration_test/almacen_test.dart -d emulator-5554 --no-uninstall` + inspección con `adb run-as` | Sin texto plano |
| Validación del change | `openspec validate registro-login-ciudadano --strict` | Válido |

Las pruebas de la API usan una base PostgreSQL **real y aislada** (`ayni_safe_test`), recreada vacía en cada
ejecución. Las de integración usan la base de desarrollo.

## 3. Escenarios de la especificación y su evidencia

`API` = `apps/api/test/integracion/`, `APP` = `apps/mobile/test/`, `AND` = prueba en Android real.

| Requisito y escenario | Evidencia |
|---|---|
| Registro: cuenta creada (201 sin sesión, correo precargado) | API `registro`; APP `registro_pantalla`; AND `acceso_test` |
| Registro: intento de alta privilegiada (400) | API `registro` (rol, institución, estado); APP (cuerpo solo con 3 campos) |
| Validación: campos inválidos y validación directa a la API | API `registro`; `unidad/validacion` con vectores compartidos; APP `validacion_test` |
| Validación: identidad del correo (mayúsculas, puntos, sufijos) | API `login`, `unidad/validacion`; APP `validacion_test` |
| Contraseña: límites 14/15/128/129 en puntos de código | Vectores compartidos en API y APP |
| Contraseña: espacios y Unicode no BMP, exactitud | API `login`, `argon2id`; AND (espacios en extremos y emoji) |
| Alta única: duplicado y concurrencia | API `cuentas` (2 y 12 solicitudes), `registro` (carrera HTTP) |
| Alta única: error antes del commit | API `cuentas` (rollback), `registro` (503) |
| Login: primer acceso sin verificar correo | API `login`; AND |
| Login: 401 uniforme (4 causas) y costo comparable | API `login` (cuerpos idénticos, hash ficticio) |
| Login: fallo al persistir la sesión (503, sin token) | API `login` |
| Protección: nada en persistencia, logs ni URL | API `http`, `login`; sección 5 de este informe |
| Protección: fallo del almacenamiento seguro | APP `sesion_test` (descarta token e intenta revocar) |
| Restauración: reapertura y reinicio de API | API `sesion`; AND; **reinicio real del proceso** (sección 4) |
| Restauración: sesión vencida o revocada | API `sesion` (reloj controlado); AND (token revocado, 401) |
| Restauración sin conexión (conserva token) | APP `sesion_test` (red y 503) |
| Cierre: con conexión (204 idempotente) | API `sesion`; APP; AND |
| Cierre: sin conexión (revocación no confirmada) | APP `sesion_test` |
| Limitación: 429, `Retry-After`, reinicio | API `limitador` (umbrales, concurrencia, reinicio, proxy) |
| Formulario: envío en curso (doble toque) | APP `registro_pantalla`, `acceso_pantalla` |
| Formulario: interacción accesible | **Parcial**: texto al 200 %, teclado y contraste verificados; lector de pantalla **no** (sección 6) |
| Fallos: respuesta perdida tras el commit | AND `perdida_respuesta_test` (sección 4) |
| Fallos: salida del formulario descarta la contraseña | APP `registro_pantalla` |
| Límite: acceso público y privacidad | API `sesion`; APP `acceso_pantalla`, `sesion_test` |
| Límite: recuperación diferida (texto no interactivo) | APP `acceso_pantalla`; sin endpoints de recuperación en `openapi.yaml` |

Además, el contrato se comprueba contra la implementación: `contrato.test.ts` valida cada respuesta real con los
esquemas de `openapi.yaml` y falla si un estado documentado no se ejercita o si hay uno sin documentar.

## 4. Escenarios de resiliencia (tarea 6.2), ejecutados de verdad

| Escenario | Cómo se provocó | Resultado |
|---|---|---|
| Corte de red **después del commit** del alta | Proxy que reenvía la solicitud, deja que la API confirme (201) y corta la conexión sin devolver la respuesta | La app muestra «No pudimos confirmar si tu cuenta se creó», **sin reintentar sola** ni afirmar éxito; el reintento manual recibe 409; **1 sola cuenta** en la base; el acceso posterior funciona |
| Reinicio de la API | Se mata el proceso y se vuelve a levantar | El mismo token sigue válido (200): la sesión vive en PostgreSQL |
| Base de datos no disponible | Se detiene el clúster PostgreSQL | Registro, login y consulta responden **503** con mensaje genérico, sin detalles internos ni cuentas parciales; al volver la base, todo se recupera solo |
| Token vencido | Se adelanta `expires_at` en la base | 401 `UNAUTHENTICATED` |
| Token revocado | Cierre de sesión desde la app | Una app nueva con ese token recibe 401 y limpia el almacén |

## 5. Revisión conjunta de secretos (tarea 6.4)

Con credenciales identificables, tras todas las ejecuciones:

- **Base de datos:** ninguna contraseña en claro en `usuarios`, `sesiones` ni `ventanas_intentos`. Todas las cuentas
  usan `argon2id` (`m=19456,t=2,p=1`); `token_hash` es SHA-256 hex de 64 caracteres; las claves del limitador son HMAC
  hex de 64 caracteres (sin correo ni IP en claro). Las 4 cuentas de prueba son `ciudadano` y `activo`: ninguna con
  privilegios.
- **Logs de la API (3 archivos, 39 líneas):** 0 coincidencias de contraseñas, tokens, correos, `Bearer` o
  `authorization`. Solo registran identificador de solicitud, método, ruta, estado, duración y nombre de error.
- **Dispositivo:** las preferencias de la app (`shared_prefs`) contienen solo valores cifrados por Keystore; el token
  identificable no aparece en texto plano (la única coincidencia fue el binario `kernel_blob.bin` de la propia prueba).
  No se usa `shared_preferences`. El manifiesto declara solo `INTERNET`.
- **URL:** el token solo se acepta por `Authorization`; en la URL o el cuerpo se ignora (probado).
- **Hallazgo corregido:** el log del servidor PostgreSQL escribía el **correo** en cada violación de unicidad (42
  líneas en las pruebas). El alta usa ahora `INSERT ... ON CONFLICT DO NOTHING`: tras el cambio, las carreras de
  registro generan 0 líneas nuevas.

## 6. Lo que NO quedó verificado

1. **Lector de pantalla (TalkBack) — bloquea la aceptación de 6.3.** TalkBack se activó en el emulador, pero no registra
   en logcat lo que pronuncia, así que no pude comprobar la lectura. Lo que sí se verificó: el árbol de accesibilidad
   real (etiquetas «Mostrar contraseña», «Crear cuenta», mensajes de error como región en vivo, campos de texto),
   texto al **200 %** en el dispositivo (sin recortes; se corrigió un desborde y el icono de error ahora escala con el
   texto), orden de **foco con teclado** (Tab: correo, contraseña, Ingresar, Crear cuenta, Privacidad, Contactos) y
   **contraste** de las combinaciones finales (17 comprobaciones WCAG AA en `contraste_test.dart`).
   *Pendiente manual:* recorrer registro y acceso con TalkBack en un teléfono o emulador con voz.
2. **Argon2id en Render.** La medición (14 ms por hash, 211 MB de RSS pico con 4 hashes simultáneos) es de un equipo
   de 24 CPU; la CPU compartida de Render será mucho más lenta. Repetir `npx tsx scripts/medir-hash.ts` allí antes de
   habilitar el registro en un entorno compartido.
3. **iOS:** no compilado ni probado (RC10).
4. **Teclado físico real:** el recorrido con Tab se hizo por `adb`, no con un teclado conectado.
5. **Neon/Render, HTTPS y proxy reales:** no se probaron; no se desplegó nada.

## 7. Hallazgos corregidos durante la verificación

- `ListView` no construía el botón fuera de pantalla y los campos perdían el foco: se cambió a desplazamiento simple.
- Con texto al 200 % se desbordaba la fila «¿No tienes cuenta? / Crear cuenta»: ahora baja de línea.
- Un `Content-Type` con `charset=utf-16` daba 400 en lugar de 415.
- El registro no tenía botón de retorno visible.
- Los iconos de error no escalaban con el texto.
- El log de PostgreSQL registraba correos (arriba).

## 8. Alcance frente a los requisitos

| Requisito | Estado en esta entrega |
|---|---|
| RF01 autorregistro ciudadano (nombre, correo, contraseña; sin DNI ni teléfono) | Cumplido para ciudadanos. El alta de administradores y operadores no existe por la vía pública |
| RF02 inicio de sesión | Cumplido |
| RF03 recuperación de contraseña | **No implementado** (texto «próximamente»); sin salida autoservicio |
| RF05 permisos por rol | Solo lo necesario: el acceso ciudadano rechaza operadores, administradores y cuentas suspendidas con el mismo 401 |
| HU01 | Parcial (falta RF03) |
| Guía de UI | Conciliada en la tarea 6.6 (excepción de recuperación, política de contraseña, sin verificar correo) |

## 9. Riesgos residuales

- El correo no se verifica: no prueba identidad ni propiedad del buzón; cualquiera puede registrar el de otra persona.
- `409 EMAIL_IN_USE` revela que un correo está registrado (compromiso aceptado; mitigado por el límite de solicitudes).
- Los límites por IP pueden afectar a usuarios tras un mismo NAT y no frenan ataques distribuidos.
- La sesión de 24 horas obliga a iniciar sesión a diario (sin refresh en esta entrega).
