# Tasks

Todas las tareas están pendientes. Este archivo planifica implementación futura; no autoriza despliegue ni acredita pruebas ejecutadas. Referencias: `design.md` y `specs/identidad/acceso-ciudadano/spec.md`.

## 1. Bases técnicas y contratos

- [x] 1.1 Crear la base mínima Node.js/Express/TypeScript en `apps/api/`, con composición del módulo Identidad por capas, configuración por entorno y secretos fuera de Git; verificar instalación, compilación y arranque local sin credenciales en salida.
- [x] 1.2 Crear la base Flutter en `apps/mobile/`, con carpetas de presentación, aplicación/datos y adaptador HTTP, URL por entorno y dependencias bloqueadas; verificar `flutter analyze` y arranque en emulador Android.
- [x] 1.3 Preparar PostgreSQL local aislado y Prisma con conexión por variable de entorno; verificar conexión y documentar en un README técnico los comandos reproducibles de arranque sin incluir secretos.
- [x] 1.4 Documentar los cuatro endpoints y respuestas 201/200/204/400/401/409/429/503/500/413/415 en un contrato OpenAPI, incluyendo Bearer, no-store, errores por campo y Retry-After; verificar sintaxis y correspondencia con la tabla de diseño, sin endpoints de recuperación o verificación de correo.

## 2. Validación e identidad persistente

- [x] 2.1 Implementar reglas de nombre/correo/contraseña y rechazo de campos extra; verificar pruebas unitarias de límites, tipos, correo normalizado, puntos/sufijos conservados, espacios y puntos de código Unicode no BMP.
- [x] 2.2 Crear modelos y migración Usuario/Sesion/VentanaIntentos con restricciones, FK e índices del diseño; verificar migración desde BD vacía y que PostgreSQL rechaza correos normalizados duplicados y sesiones huérfanas.
- [x] 2.3 Implementar puertos y adaptadores Prisma de alta de ciudadano con rol/estado fijados por servidor, escritura atómica y traducción de conflicto a EMAIL_IN_USE; verificar carrera de dos registros, una única cuenta y rollback ante fallo antes del commit.
- [x] 2.4 Añadir adaptador Argon2id con sal individual y parámetros mínimos del diseño; verificar contraseñas exactas, hashes diferentes para el mismo secreto y ausencia de texto plano; medir memoria/latencia bajo carga representativa y registrar el resultado, sin rebajar el mínimo para ocultar saturación.
- [x] 2.5 Documentar en el README de API las migraciones, normalización de correo y configuración del hash; verificar que las instrucciones permiten recrear el esquema de pruebas y no ofrecen alta pública de cuentas privilegiadas.

## 3. API de registro y acceso

- [x] 3.1 Conectar caso de uso de registro con POST `/auth/ciudadanos/registro`, validación, DTO sin secretos y respuesta solo después del commit; verificar pruebas HTTP de alta 201 sin sesión, errores 400, conflicto 409 y fallo 503.
- [x] 3.2 Implementar login ciudadano, verificación de hash y ruta de costo comparable para cuentas inexistentes/no admitidas, con error uniforme; verificar acceso inmediato sin correo confirmado y respuesta idéntica 401 para contraseña incorrecta, correo desconocido, suspensión y rol no ciudadano.
- [x] 3.3 Generar token opaco CSPRNG, persistir solo hash y vencimiento de 24 horas y revalidar estado del usuario al confirmar sesión; verificar token no entregado si falla persistencia y que la carrera de suspensión no habilita nuevas consultas privadas.
- [x] 3.4 Implementar GET y DELETE de sesión con autorización del propietario, vencimiento, revocación idempotente y comprobación de estado actual; verificar 200 solo para identidad propia, 401 para token no válido, 204 en salida repetida y otras sesiones independientes conservadas.
- [x] 3.5 Implementar limitador persistente y atómico, HMAC de claves, Retry-After y configuración de confianza de proxy; verificar umbrales iniciales, solicitudes concurrentes, reinicio durante ventana y que una IP no causa bloqueo global de un correo desde otra IP.
- [x] 3.6 Añadir límite de JSON, validación de Content-Type, no-store, manejo de errores y redacción de secretos en logs; verificar 413/415/500, exclusión de contraseñas/tokens/cuerpos, falta de detalles internos y rechazo de tokens por URL.
- [x] 3.7 Implementar purga por lotes de sesiones y ventanas según los plazos del diseño y límite de concurrencia de hash; verificar limpieza con reloj controlado sin borrar sesiones vigentes y respuesta 503 al saturarse sin crear cuentas o sesiones parciales.
- [x] 3.8 Actualizar contrato y README de API con pruebas, configuración del limitador, proxy, expiración y limitaciones de recuperación; verificar ejemplos contra el entorno local y que se corresponden con las respuestas reales.

## 4. Formularios Flutter

- [x] 4.1 Construir componentes mínimos de campos, contraseña, botón y mensaje según la guía, con texto 16, altura 48 y espaciado 8; verificar tests de widgets, etiquetas accesibles, pegado, autofill y Mostrar/Ocultar sin pérdida del valor.
- [x] 4.2 Implementar registro en una pantalla con validación equivalente a la API y ayuda de contraseña; verificar vectores comunes de Unicode y que no aparecen DNI, teléfono, rol ni solicitudes de permisos.
- [x] 4.3 Conectar registro y estados enviando/error/resultado incierto/éxito; verificar un solo envío durante doble toque, ninguna repetición automática, preservación temporal de campos, descarte de contraseña al abandonar y acceso con correo precargado tras 201.
- [x] 4.4 Implementar inicio de sesión con errores uniformes y tratamiento 429/503, enlaces Crear cuenta, privacidad y contactos y texto no interactivo de recuperación futura; verificar navegación y mensajes sin activar rutas ni proveedores de correo, usando solo contenido público aprobado o estado explícito de no disponible.
- [x] 4.5 Documentar en README móvil la ejecución, URL del backend y estado real de los enlaces públicos; verificar que otra persona pueda ejecutar la app con los comandos indicados y que no se presente un catálogo ficticio de contactos.

## 5. Sesión y navegación Flutter

- [x] 5.1 Integrar almacenamiento seguro y guardado de token/vencimiento sin contraseña; verificar con dobles de fallo que una escritura fallida bloquea destino privado, descarta token e intenta revocación, y con Android que no se usa almacenamiento de preferencias en claro.
- [x] 5.2 Implementar restauración mediante GET antes del destino autenticado mínimo; verificar sesión válida tras reinicios, 401 con limpieza y retorno al acceso, y error de red/503 con reintento sin acceso privado ni eliminación del token.
- [x] 5.3 Añadir cierre de sesión y pantalla mínima de sesión iniciada, sin implementar módulos de negocio; verificar salida online, offline, revocación repetida y fallo de borrado seguro con bloqueo/reintento y mensaje sin falsa confirmación.
- [x] 5.4 Mantener rutas públicas disponibles sin sesión y proteger navegación privada; verificar que volver atrás no revela identidad tras salir y que ningún parámetro permite elegir identidad ajena.
- [x] 5.5 Documentar restauración, vencimiento, salida local y límites de la entrega en README móvil; verificar correspondencia entre mensajes, comportamiento y documentación, sin declarar soporte iOS probado.

## 6. Aceptación integrada

- [x] 6.1 Ejecutar registro e inicio de sesión completos en Android contra API y PostgreSQL real aislado; registrar evidencia para cada escenario de la especificación y confirmar nombre/correo/rol correctos sin acceso privilegiado.
- [x] 6.2 Simular corte de red después del commit de alta, reinicio de API, BD no disponible y token vencido/revocado; verificar resultado incierto, una sola cuenta, acceso posterior correcto, persistencia de sesión y ausencia de éxito falso.
- [ ] 6.3 Revisar formularios en Android con lector de pantalla, teclado y texto al 200 %, comprobar contraste de las combinaciones finales y ausencia de recortes; guardar evidencia y corregir impedimentos antes de declarar aceptado el flujo.
- [x] 6.4 Revisar conjuntamente contrato, migraciones, logs y almacenamiento del dispositivo con credenciales de prueba identificables; comprobar que solo persisten hash de contraseña y hash de token en servidor, token seguro en dispositivo y ningún secreto en logs/telemetría/URL.
- [x] 6.5 Ejecutar las verificaciones de API y Flutter ya añadidas, contrastar el alcance con RF01/RF02/RF05 y la guía, y entregar informe de aceptación con comandos y resultados; no marcar recuperación RF03, panel React, iOS ni funciones de reportes como implementados.
- [x] 6.6 Conciliar `docs/05-diseno-ui/guia-ui.md` con las decisiones de este change: marcar «Olvidé mi contraseña» y las vistas de recuperación como diferidas a RF03 (excepción temporal de esta entrega), mover la política de contraseña (15–128 puntos de código, espacios, pegado) y la decisión de no verificar el correo de los pendientes a decisiones confirmadas, y citar este change; verificar releyendo la guía que no contradice el spec ni el diseño y que no se modifica otra documentación funcional.
