# 04. Atributos de calidad

| ID | Atributo | Escenario de calidad |
|---|---|---|
| AC01 | Escalabilidad | Ante un aumento considerable de ciudadanos que consultan el mapa o reportan simultáneamente, la aplicación debe admitir crecimiento de la capacidad de atención. |
| AC02 | Rendimiento | Durante un pico de reportes, el registro inicial debe responder sin esperar a que terminen la clasificación con IA y las notificaciones. |
| AC03 | Disponibilidad | Si falla una instancia de la aplicación del servidor, las instancias saludables deben poder seguir atendiendo solicitudes. |
| AC04 | Seguridad y privacidad | Los reportes, ubicaciones y evidencias sensibles deben protegerse frente a accesos no autorizados y exposición pública. |
| AC05 | Trazabilidad | Cada revisión y cambio de estado debe permitir identificar al actor autorizado, la acción y su momento. |
| AC06 | Mantenibilidad | Los cambios en reglas de alerta o proveedor de IA no deben exigir modificar indiscriminadamente otros módulos. |
| AC07 | Recuperación y observabilidad | Ante errores de servicios o procesamiento asíncrono, deben existir registros, métricas y mecanismos para identificar y recuperar operaciones pendientes. |
| AC08 | Usabilidad móvil | Un ciudadano debe poder registrar un incidente mediante un flujo comprensible en un teléfono, incluyendo permisos y errores de conexión. |