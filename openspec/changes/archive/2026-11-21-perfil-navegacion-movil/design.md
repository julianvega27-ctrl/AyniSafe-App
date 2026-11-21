# Design

## Context

Motivación en `proposal.md`; criterios en `specs/{identidad/perfil-ciudadano,consultas/contenido-publico,movil/navegacion-ciudadana}/spec.md`. Specs 01 y 02 están archivadas.

Observado en el código:
- API (`apps/api`): módulo Identidad por capas; `ConsultarSesionUseCase` valida el Bearer y comprueba cada vez que la cuenta sea ciudadana activa; `tokenBearer` vive en `auth.routes.ts`; `CuentasPort` solo tiene alta y búsquedas; `usuarios` no tiene teléfono; `app.ts` monta `identidad.router` en `/api/v1` y `routerPublico` fuera de él; `alcance.test.ts` fija las rutas exactas del contrato; no existe módulo `consultas`.
- App (`apps/mobile`): la raíz (`app.dart`) elige la pantalla por `EstadoSesion` y hace `popUntil` al cambiar de tipo de sesión; `SesionIniciadaPantalla` es el destino mínimo; `ContenidoPublicoPantalla` muestra textos fijos «aún no disponible»; `UsuarioSesion` (`id`, `nombre`, `correo`) vive en `SesionAutenticada`; permisos Android: solo `INTERNET`.
- Docs: el 105 está «por verificar» y no se completan otros números; compartir el teléfono exige autorización explícita (doc 11) y no pedirlo de nuevo al reportar (RF51).

Decisiones tomadas en explore y confirmadas: correo de solo lectura (opción A), nombres de desarrolladores publicables, contenido servido por la API.

## Goals / Non-Goals

**Goals:** shell de navegación sin funciones simuladas; perfil editable sin ampliar el alcance de Identidad sobre el correo; consentimiento de teléfono revocable y auditable; fuente de contenido público única, versionada y reutilizable por la web.

**Non-Goals:** cambio o verificación de correo; compartir el teléfono; preferencias de alertas; mapas, reportes y avisos; administración de contenido (Spec 20); caché del contenido en disco; web pública (Spec 04).

## Decisions

### 1. Correo inmutable por perfil
`PATCH /perfil` valida con lista cerrada de campos (`nombre`, `telefono`, `compartirTelefono`); cualquier otro, incluido `correo`, devuelve 400 «campos no admitidos» con el mismo patrón de Spec 01 (`hayCamposExtra`). Así la unicidad, la recuperación y la regla «el correo no acredita propiedad» no cambian y no hay delta sobre `acceso-ciudadano`. Un cambio de correo futuro exigirá: correo pendiente, token al **nuevo** buzón, aviso al anterior, reautenticación y revocación de sesiones.

### 2. Recurso propio `/perfil`
`GET` y `PATCH` bajo `/api/v1/perfil`, con Bearer. La identidad sale de la sesión (como `/auth/sesion`); no hay ruta con ID. Se extrae `tokenBearer` y la comprobación de sesión a un middleware `autenticarCiudadano` en `presentacion/middlewares.ts` que deja el usuario en `res.locals`; `auth.routes.ts` lo reutiliza. El contrato de `/auth/sesion` no cambia y no incluye teléfono.

Respuesta: `{ id, nombre, correo, telefono: string|null, compartirTelefono: boolean }`. Se mantienen `no-store`, `requestId` y el formato de error de Spec 01.

### 3. Modelo y reglas del teléfono
Migración aditiva en `usuarios`: `telefono text null`, `telefono_compartir_consentido_at timestamptz null`, con `CHECK (telefono_compartir_consentido_at IS NULL OR telefono IS NOT NULL)` y `CHECK` de formato (`^\+?[0-9]{7,15}$`) sobre el valor normalizado. `compartirTelefono` = consentimiento no nulo. Reversible mientras no se necesite conservar los datos.

Normalización en dominio (`validacion.ts`): quitar espacios, guiones, puntos y paréntesis; aceptar `+` inicial opcional y 7 a 15 dígitos (cubre móviles peruanos de 9 dígitos y formato internacional sin imponer solo Perú; supuesto registrado). Vacío o `null` borra.

Reglas aplicadas en una transacción con `SELECT … FOR UPDATE` de la fila del usuario, en este orden: aplicar nombre; calcular teléfono resultante; consentimiento resultante = (si `compartirTelefono` viene: ese valor; si no: el actual) **y** teléfono no nulo **y** (teléfono sin cambio o `compartirTelefono` otorgado en la misma solicitud). Otorgar sin teléfono resultante → 400 en el campo `compartirTelefono`. La fecha se fija al pasar de falso a verdadero y se borra al revocar. Dos ediciones simultáneas se serializan por el bloqueo (última escritura), sin estados inválidos. El CHECK es la última defensa.

Alternativa descartada: dejar el consentimiento intacto al cambiar el número; el consentimiento se dio para otro número. Se revoca para que el ciudadano vuelva a decidir.

El puerto: `CuentasPort` gana `obtenerPerfil(id)` y `actualizarPerfil(id, cambios)` (adaptador Prisma, SQL crudo para el bloqueo, igual que el alta). `Usuario` (con hash) no cambia; el perfil es otra proyección sin hash. Los errores de almacenamiento se traducen a `ServicioNoDisponibleError` (503) sin cambios parciales.

Privacidad: el logger de solicitudes ya registra solo el patrón de ruta; se añade una prueba que verifica que teléfono y nombre no aparecen en logs.

### 4. Contenido público en módulo `consultas`
Nuevo módulo `src/modules/consultas/` con ruta `GET /api/v1/publico/contenido` y sin dependencia de Identidad. La fuente es `contenido/contenido-publico.json` dentro de `apps/api` (la compilación y el despliegue de Render usan ese directorio; `apps/shared` no se asume disponible). Se valida con un esquema (Zod no está en el proyecto: validador propio en dominio, sin dependencias nuevas) al arrancar; si no valida, el arranque falla.

Forma de la respuesta:

```
{
  "version": 1,
  "actualizadoAt": "2026-11-21",
  "app":            { "estado": "aprobado", "finalidad": "...", "funcionamiento": "..." },
  "desarrolladores":{ "estado": "aprobado", "personas": [ { "nombre": "...", "rol": "Desarrollador" } ] },
  "privacidad":     { "estado": "aprobado|pendiente", "secciones": [ { "titulo": "...", "texto": "..." } ] },
  "contactos":      { "estado": "pendiente", "items": [] }
}
```

Un contacto publicable exige `institucion`, `numero`, `cobertura`, `fuente` y `verificadoAt`; un ítem incompleto invalida la fuente. Las secciones `pendiente` no llevan texto. Contenido inicial (supuestos a revisar por el equipo antes de archivar):
- `app`: finalidad y funcionamiento tomados del README y del alcance (plataforma móvil de reporte y prevención colaborativa de incidentes de seguridad en Ayacucho; el piloto aún está en construcción).
- `desarrolladores`: Julián Anthony Vega Salvatierra, Desarrollador (README; autorizado).
- `privacidad`: texto redactado **solo** con lo que la app hoy trata (nombre, correo, contraseña como hash, teléfono opcional con autorización, sesión) y lo ya fijado en doc 11 (el teléfono no se publica ni va en notificaciones; solo se comparte con autorización expresa); no promete conservación ni eliminación aún no implementadas ni menciona ubicación o fotografías. Se marca `aprobado` por la autorización del usuario y queda registrado para revisión del equipo.
- `contactos`: `pendiente`, sin ítems.

Caché: `Cache-Control: public, max-age=300` (no es dato personal), distinta del `no-store` de autenticación. Alternativa descartada: incluir el contenido dentro de la app; la web (Spec 04) y la futura administración (Spec 20) necesitan una sola fuente.

Límite conocido: sin caché en disco, un contacto de emergencia no se ve sin red. Con la lista vacía el riesgo es nulo hoy; **Spec 20 debe decidir caché persistente** antes de publicar contactos reales. La app conserva la última respuesta en memoria durante la ejecución.

### 5. Shell de navegación Flutter
Nuevo `ShellCiudadano` (reemplaza `SesionIniciadaPantalla` en `app.dart` bajo `SesionAutenticada`). `Scaffold` con `AppBar` (título AyniSafe y `IconButton` de perfil de 48×48 con `tooltip`/semántica «Perfil»), `IndexedStack` (conserva estado por pestaña) y `NavigationBar` con cuatro destinos. `PopScope` hace que el retroceso en pestañas ≠ Inicio vuelva a Inicio. El perfil y las páginas informativas se apilan con `Navigator.push`; al cambiar el tipo de sesión, la lógica existente de `app.dart` hace `popUntil` y, como el shell solo existe bajo `SesionAutenticada`, tras cerrar sesión no queda historial.

Destinos sin construir: un componente reutilizable `DestinoPendiente` (icono, título, explicación) sin datos de ejemplo. Inicio: tarjeta «Reportar un incidente» con botón deshabilitado y texto «Disponible próximamente» visible (no solo semántica), bloque de últimos reportes pendiente y bloque de contactos (contenido público o aviso de que no hay aprobados).

Estado del perfil: `PerfilControlador` (ChangeNotifier, como el resto de controladores) creado por el shell, con `PerfilRepositorio` (`http`, Bearer del `SesionControlador`) y resultados tipados al estilo de `auth_repositorio.dart`. Se destruye con el shell, no persiste en disco. Tras un `PATCH` correcto llama a `SesionControlador.actualizarUsuario(...)` para refrescar `UsuarioSesion` sin tocar el token. Un 401 en el perfil delega en el manejo de sesión existente (borrar token y volver al acceso). Un solo envío en curso y formulario conservado ante errores, como en Spec 01.

Contenido público: `ContenidoRepositorio` con `GET /publico/contenido`, memoria de la última respuesta y resultados `Cargando|Disponible|Error`. `ContenidoPublicoPantalla` se generaliza (privacidad, contactos, acerca de, desarrolladores) y se reutiliza desde el acceso (`EnlacesPublicos`) y desde el perfil. El componente `ContactoEmergencia` abre `tel:` con `url_launcher` (`launchUrl` con `LaunchMode.externalApplication`); `tel:` abre el marcador sin llamar y no requiere `CALL_PHONE`. Se añade `<queries><intent><action android:name="android.intent.action.DIAL"/><data android:scheme="tel"/></intent></queries>` al manifiesto para Android 11 o superior. Se prueba con un contacto de prueba inyectado en tests; no se incluye en la fuente real.

Accesibilidad: reutiliza `EstructuraPantalla`, `CampoFormulario`, `BotonPrincipal`, `MensajeAccesible` y el tema (texto 16, 48 mínimo, etiquetas persistentes, texto + icono).

### 6. Contrato y verificación
`openapi.yaml` 0.3.0: etiquetas `Perfil` y `Contenido publico`, operaciones `obtenerPerfil`, `actualizarPerfil`, `obtenerContenidoPublico`; `contrato:validar` y el contrato de pruebas se actualizan (de 8 a 11 operaciones) y `alcance.test.ts` pasa a fijar las rutas nuevas y a seguir comprobando que no hay rutas de operadores/sedes ni de cambio de correo. Se registra que ningún endpoint admite `correo`.

## Risks / Trade-offs

- **Texto de privacidad sin revisión del equipo:** se publica como aprobado por autorización del usuario; riesgo de prometer de más. Mitigación: redactarlo solo con hechos implementados y documentados y señalarlo en el informe para revisión; Spec 20 lo administrará.
- **Contactos sin caché offline:** ver Decisión 4; la lista vacía lo hace inocuo ahora.
- **Reutilizar el nombre de la sesión:** un nombre desactualizado en memoria si otro dispositivo lo edita; se refresca en cada apertura del perfil y al restaurar la sesión.
- **Teléfono en texto plano en BD:** igual que el resto de datos de cuenta; el cifrado en reposo es de la plataforma. Se acota con exposición solo en `/perfil` y exclusión de logs.
- **Formato de teléfono permisivo:** acepta números extranjeros; aceptable para el piloto, ajustable sin migración de datos incompatibles porque el CHECK solo exige 7–15 dígitos.
- **Cambio de correo ausente:** el ciudadano que pierde su buzón no puede cambiarlo; se documenta como pendiente.
- **Migración:** aditiva; el rollback elimina las dos columnas y pierde teléfonos y consentimientos guardados (se advierte en las tareas).

## Migration Plan

1. Aplicar la migración (columnas nulas, sin impacto en cuentas existentes: todas quedan sin teléfono y sin autorización).
2. Desplegar la API con las rutas nuevas (aditivas; clientes anteriores no se ven afectados).
3. Publicar la app con el shell. Rollback: revertir app y API; las columnas pueden permanecer sin uso.

## Open Questions

- Texto definitivo de privacidad y de finalidad/funcionamiento: revisión del equipo (no bloquea la implementación).
- Caché persistente de contactos reales y mecanismo de administración: Spec 20.
- Cambio de correo con verificación: entrega futura sin fecha.
