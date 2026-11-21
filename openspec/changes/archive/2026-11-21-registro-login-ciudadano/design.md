# Design

## Context

Ver `proposal.md` para la motivación y `specs/identidad/acceso-ciudadano/spec.md` para los criterios de aceptación. Los documentos funcionales vigentes son `docs/01-analisis-del-sistema/{03-requisitos-funcionales,05-restricciones,09-alcance-territorial-e-institucional,11-operacion-publicacion-y-conservacion}.md`; la referencia visual es `docs/05-diseno-ui/guia-ui.md`.

El repositorio contiene documentación y diagramas, sin `pubspec.yaml`, `package.json`, código de API, esquema Prisma ni pruebas ejecutables. Las ubicaciones siguientes son propuestas para implementación futura. El backend previsto es un monolito modular Node.js/Express/TypeScript con Clean Architecture y PostgreSQL/Prisma. Identidad posee cuentas y permisos; no se crea un servicio de autenticación independiente.

Se incluye diseño porque hay nuevas dependencias, modelo de datos y decisiones de seguridad. El usuario confirmó contraseña de 15–128 caracteres sin composición, espacios y pegado admitidos, y acceso sin verificar el correo. Esos puntos refinan los pendientes de la guía sin editarla en esta propuesta.

## Goals / Non-Goals

**Goals:** definir contratos implementables entre Flutter y la API; asegurar unicidad y atomicidad de cuentas; conservar sesiones ante reinicios; permitir pruebas de fallos y controles de acceso sin proveedores externos.

**Non-Goals:** implementar ahora; definir autenticación del panel React; construir el dominio de reportes; añadir refresh tokens, OAuth, biometría, MFA, correo transaccional o recuperación. El acceso correcto termina en una pantalla mínima de sesión iniciada con salida, no en pantallas de negocio ficticiamente completas.

## Decisions

### 1. Estructura y límites de dependencias

- Proponer `apps/mobile/` para Flutter y `apps/api/` para la API. Dentro de la API, `src/modules/identidad/{dominio,aplicacion,infraestructura,presentacion}` sigue el diseño de módulos existente.
- Los casos de uso registrar ciudadano, iniciar sesión, consultar sesión y cerrar sesión dependen de puertos de cuentas, sesiones, hash, tokens, reloj y limitador. Los adaptadores Express, Prisma y criptografía quedan fuera del dominio.
- Flutter separa formularios/estado de presentación, repositorio de autenticación y cliente HTTP/almacenamiento seguro. No comparte código con React en este cambio.

Alternativa: introducir un proveedor de identidad externo. Se descarta para mantener el contrato y el presupuesto inicial sin dependencia de cuentas o cuotas nuevas. No se introducen Redis ni una cola para autenticación.

### 2. Flujo y UI

```text
Acceso publico --> Registro --> Confirmacion de alta --> Iniciar sesion
                       |                                   |
                       v                                   v
                  Error/reintento                    Validar y guardar
                                                           |
                                                           v
                                                 Sesion iniciada minima
                                                           |
                                                           v
                                                     Cerrar sesion
```

El registro no inicia sesión automáticamente: 201 confirma la cuenta y abre acceso con correo precargado y contraseña vacía. Esto separa el commit del alta de la creación de sesión y simplifica la recuperación de una respuesta perdida. No se exige confirmar el correo. No se declara comprobada la propiedad de esa dirección.

Registro en una pantalla: nombre, correo, contraseña, Mostrar/Ocultar, ayuda «Entre 15 y 128 caracteres. Puedes usar espacios», Crear cuenta, Inicia sesión, privacidad y contactos. Acceso: correo, contraseña, Ingresar, Crear cuenta y texto no interactivo «Recuperación de contraseña: próximamente». Esta es una excepción temporal explícita al enlace activo de recuperación descrito por la guía, motivada por la exclusión de RF03.

Estados de presentación: edición, validación, enviando, error de campo, credenciales inválidas, espera por 429, error transitorio, resultado incierto y éxito. Se evita doble envío; no se reintentan POST automáticamente. Los errores conservan campos mientras exista el formulario. La contraseña no pasa a navegación, almacenamiento persistente, analítica ni reportes de fallos.

Se conserva estilo cívico cercano, tipografía del sistema, base 16, controles de al menos 48 y espaciado de 8. Los hexadecimales de la guía son candidatos: elegir combinaciones con contraste comprobado al implementar, sin convertirlas en decisiones ya validadas. Probar lectura, foco, teclado y escala 200 %. El diseño público no incluye números telefónicos inventados ni afirma que un reporte despacha una emergencia. Los enlaces públicos apuntarán a contenido existente/aprobado; contenido ausente se identifica como no disponible, sin inventarlo ni bloquear la autenticación.

### 3. Contrato HTTP propuesto

Base `/api/v1`, JSON, HTTPS; credenciales únicamente en cuerpo y sesión exclusivamente en `Authorization: Bearer <token>`. Respuestas de autenticación con `Cache-Control: no-store`. No aceptar token en URL ni identificador del propietario como parámetro.

| Método y ruta | Entrada | Resultado |
|---|---|---|
| POST `/auth/ciudadanos/registro` | `{nombre, correo, contrasena}` | 201 `{usuario:{id,nombre,correo,rol:"ciudadano"}}`; sin sesión. |
| POST `/auth/ciudadanos/sesiones` | `{correo, contrasena}` | 200 `{token, expiresAt, usuario:{id,nombre,correo,rol:"ciudadano"}}`. |
| GET `/auth/sesion` | Bearer | 200 `{usuario:{id,nombre,correo,rol:"ciudadano"}, expiresAt}` de la sesión actual; nunca otro usuario. |
| DELETE `/auth/sesion` | Bearer | 204 al revocar; token ausente, desconocido o ya revocado también produce 204 sin efectos sobre otras sesiones. Error de BD: 503. |

Los endpoints de consulta/acceso definidos aquí son ciudadanos; no cambian los futuros permisos institucionales. Un token no ciudadano no habilita este flujo. La excepción idempotente 204 de DELETE no modifica el 401 de GET para sesiones inválidas.

Formato de error: `{error:{code,message,fields?,requestId}}`, donde `fields` contiene claves y mensajes, nunca el valor enviado. `requestId` es aleatorio, no contiene datos de cuenta. Las trazas internas no aparecen en la respuesta.

| Estado/código | Condición | UI |
|---|---|---|
| 400 VALIDATION_ERROR | Campos ausentes, tipos incorrectos, nombre/correo/contraseña inválidos, campos extra | Error junto al campo o mensaje general para contrato inválido. |
| 409 EMAIL_IN_USE | Correo ya registrado | «Este correo ya está registrado. Inicia sesión». No incluir nombre, rol ni estado de la cuenta existente. |
| 401 INVALID_CREDENTIALS | Correo desconocido, contraseña incorrecta, usuario suspendido o no ciudadano | «Correo o contraseña incorrectos». |
| 401 UNAUTHENTICATED | Token inválido, vencido, revocado o cuenta no habilitada | Borrar sesión local y volver al acceso. |
| 429 RATE_LIMITED | Límite superado | Mostrar espera de `Retry-After`; no iniciar bucle de reintentos. |
| 503 SERVICE_UNAVAILABLE | BD, hash o dependencia interna no disponible | Mensaje temporal y reintento manual. |
| 500 INTERNAL_ERROR | Error inesperado | Mensaje genérico y referencia de solicitud, sin detalles internos. |

Límite de cuerpo JSON: 8 KiB; cuerpos mayores reciben 413, tipo de contenido ajeno a JSON recibe 415. La UI comunica error general sin éxito. No se registran cuerpos de autenticación ni cabeceras Authorization.

### 4. Validación y normalización

Nombre: recortar extremos, 1–100 puntos de código; correo: recortar extremos, validar sintaxis, máximo 254 y guardar versión en minúsculas como clave de identidad. No eliminar puntos, sufijos `+` ni aplicar normalizaciones por proveedor. Validación sintáctica no verifica existencia ni propiedad del buzón.

La contraseña se cuenta por puntos de código Unicode (no longitud UTF-16 ni bytes), 15–128 inclusive. No se recorta, normaliza ni trunca. Flutter y TypeScript comparten vectores de prueba de límites, espacios y caracteres no BMP. Login aplica límites y formato, pero no modifica el secreto. Cuerpos con campos inesperados se rechazan: el cliente nunca decide rol, estado ni identificador.

### 5. Modelo persistente y concurrencia

| Registro propuesto | Campos e invariantes |
|---|---|
| Usuario | `id` UUID, `nombre`, `correoNormalizado` UNIQUE NOT NULL, `passwordHash`, `rol` enum ciudadano/operador/administrador, `estado` activo/suspendido, `createdAt`, `updatedAt`. El alta pública fija ciudadano y activo. No contiene DNI ni exige teléfono. |
| Sesion | `id` UUID, `usuarioId` FK, `tokenHash` UNIQUE, `createdAt`, `expiresAt`, `revokedAt` nullable. Índices en hash y vencimiento. |
| VentanaIntentos | `tipo`, `claveHash`, `ventanaInicio`, `contador`; UNIQUE compuesto, incremento atómico e índice para purga. Solo identificadores derivados, sin correo/IP en claro. |

La comprobación previa del correo mejora el mensaje, pero la restricción UNIQUE es la autoridad ante carreras. Calcular hash fuera de la transacción y hacer el alta completa en una transacción corta; traducir colisión única a 409. No hay perfil, correo ni evento externo que requiera outbox para este flujo.

Iniciar sesión verifica contraseña/estado, genera token y persiste sesión antes de responder. Para evitar emisión sobre una suspensión concurrente, bloquear/revalidar la fila de usuario durante el commit de sesión. Cada petición autenticada comprueba también el estado actual del usuario. Un fallo de transacción no entrega sesión utilizable. Las sesiones persisten tras reiniciar el proceso y el reloj autoritativo es el servidor UTC.

### 6. Hash, sesión y almacenamiento del dispositivo

Usar Argon2id con sal individual aleatoria y configuración inicial `m=19456 KiB, t=2, p=1`, guardando formato codificado con parámetros. Medir consumo bajo carga en Render antes de entregar; no rebajar el mínimo por una cuota gratuita. Se prefiere frente a bcrypt por el límite de bytes de este último y la política Unicode. La selección sigue [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), consultado el 20/11/2026.

Token opaco generado con 32 bytes CSPRNG y base64url, almacenando solo SHA-256 del token en servidor. No usar SHA-256 para contraseñas. Sesión absoluta de 24 horas, sin refresh; múltiples sesiones independientes admitidas y salida revoca solo la actual. Se elige frente a JWT sin estado para poder revocar y aplicar suspensiones en el MVP con la BD existente. La entropía y almacenamiento unidireccional se fundamentan en [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); el plazo de 24 horas es una decisión técnica de esta propuesta, no una duración prescrita por esa fuente.

Flutter guarda token y vencimiento en un adaptador de almacenamiento seguro respaldado por Android Keystore/iOS Keychain. No usar preferencias simples ni guardar contraseña. Al reabrir valida GET antes de mostrar pantalla privada. Un 401 elimina la sesión local; error de red/503 permite reintentar conservando token sin habilitar acceso offline. Si falla la escritura segura, descartar token en memoria e intentar DELETE antes de volver al acceso; una sesión no revocada vence en su plazo.

Al salir se intenta DELETE con timeout y luego se limpia almacenamiento y memoria incluso si no hay red, comunicando revocación remota no confirmada. Si falla el borrado seguro, no afirmar cierre local completo: bloquear acceso privado e informar/reintentar la limpieza antes de cualquier restauración. Se purgan sesiones revocadas/vencidas después de siete días y ventanas de intentos vencidas después de 24 horas, con limpieza por lotes recuperable; son parámetros técnicos propuestos para datos de autenticación.

### 7. Abuso y observabilidad

Valores iniciales técnicos, configurables: registro 5 solicitudes por IP/15 minutos; login 30 por IP/15 minutos y 5 por combinación correo normalizado+IP/15 minutos. Contar solicitudes válidas sintácticamente antes del hash, no solo fallos; ninguna ventana bloquea permanentemente un correo desde otra IP. `Retry-After` es el mayor plazo restante aplicable. Persistir e incrementar contadores atómicamente en PostgreSQL; el reinicio no elimina ventanas. Derivar claves con HMAC y secreto de entorno, sin registrar correo ni IP en claro. Configurar confianza del proxy según despliegue, sin aceptar X-Forwarded-For arbitrario. Además limitar concurrencia de hashes para evitar agotar memoria; saturación temporal responde 503.

Para correo inexistente ejecutar verificación contra hash ficticio con igual costo; aplicar ruta comparable a estados no admitidos y no distinguir causa en cuerpo. Esto reduce diferencias de tiempo, sin prometer indistinguibilidad perfecta. Excluir cuerpos, tokens y contraseñas de logs, herramientas de errores y analítica. Registrar requestId, resultado genérico, duración y fallo de dependencia; no crear un sistema de auditoría amplio en este cambio.

### 8. Matriz de verificación

La especificación contiene los criterios de aceptación normativos. Las comprobaciones mínimas son:

| Nivel | Cobertura |
|---|---|
| Dominio/casos de uso | Límites Unicode, normalización, privilegios, hash/contraseña exacta, cuenta suspendida, fallo de cada puerto. |
| API con PostgreSQL real aislado | Contratos y códigos; carrera de registro con una sola cuenta; rollback; login y consulta propia; revocación/vencimiento con reloj controlado; reinicio; limitador concurrente y persistente. |
| Flutter | Formularios y mensajes, Mostrar/Ocultar, pegado/autofill, navegación pública/privada, doble toque, almacenamiento seguro fallido y salida offline. |
| Integración Android | Registro y posterior login contra API/BD; restauración tras reinicios; red cortada después del commit; captura de logs sin secretos; teclado, lector y texto al 200 %. |

El contrato 413/415/500 y el fallo de borrado seguro también se comprueban, aunque sean casos técnicos adicionales a los escenarios principales. iOS mantiene compatibilidad de diseño; no se declara validado sin pruebas y presupuesto propios según RC10.

## Risks / Trade-offs

- Correo sin verificar → no atribuir propiedad comprobada ni usarlo como prueba institucional; verificación futura independiente.
- Recuperación excluida → pérdida de contraseña no tiene solución autoservicio en esta entrega; avisarlo en acceso y no simular envíos.
- Respuesta de registro perdida → mostrar incertidumbre, ofrecer login y confiar en UNIQUE para evitar doble cuenta; no añadir reintento automático ni una capa de idempotencia de tokens para alta.
- 409 revela que un correo está ocupado → limitar solicitudes y no revelar más datos; es un compromiso explícito del registro, distinto al mensaje uniforme de login.
- Token perdido o salida offline → la revocación puede no confirmarse; almacenamiento seguro, expiración absoluta y mensaje honesto limitan exposición.
- Sesión de 24 horas exige volver a ingresar → reduce complejidad del primer incremento; refresh queda fuera de alcance.
- Suspensión de Render y cuotas de Neon → ofrecer reintento y no prometer disponibilidad continua ni éxito sin confirmación.
- Conteo Unicode entre lenguajes y carga de Argon2id → vectores comunes y medición específica en el entorno objetivo.
- Contadores en BD y límites por IP → usar índices/purga; pueden afectar usuarios detrás de NAT y no eliminan ataques distribuidos. Revisar métricas del piloto sin añadir bloqueos globales de cuenta.

## Migration Plan

1. En implementación, crear bases mínimas de Flutter y API con versiones compatibles fijadas en archivos de bloqueo, entorno local PostgreSQL y configuración de secretos fuera de Git. No desplegar todavía.
2. Aplicar migración inicial de Usuario, Sesion y VentanaIntentos a una BD aislada y comprobar unicidad, índices y rollback de transacciones.
3. Ejecutar la matriz de verificación y comprobar logs, TLS, proxy, almacenamiento y medición de hash antes de habilitar registro en un entorno compartido.
4. Desplegar API antes del cliente en una entrega posterior autorizada. No sembrar operadores, administradores ni contraseñas compartidas mediante el alta pública.
5. Ante regresión, deshabilitar endpoints/nueva versión y volver al cliente/API anterior conservando tablas y cuentas confirmadas. No borrar datos de cuentas como rollback; restaurar backup solo mediante un procedimiento que preserve coherencia. La eliminación del esquema se limita a entornos efímeros sin datos reales.

## Open Questions

- Los valores finales de radios, iconos y colores se afinan durante implementación sin cambiar la dirección visual ni los criterios de accesibilidad.
- El nombre del paquete móvil, identificador de aplicación y URLs por entorno se definen al crear las bases técnicas; no alteran contratos ni tareas.

No quedan abiertas las decisiones de contraseña, correo, sesión o alcance necesarias para aplicar este plan.
