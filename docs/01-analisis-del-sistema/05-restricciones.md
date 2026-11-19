
# 05. Restricciones

| ID | Restricción | Descripción |
|---|---|---|
| RC01 | Aplicación móvil | El sistema debe contar con una aplicación móvil como interfaz principal para los ciudadanos, desarrollada con Flutter y Dart, con entrega inicial Android y compatibilidad prevista con iPhone (iOS). |
| RC02 | Panel web de operadores | El sistema debe contar con una portada pública informativa y un panel web protegido, desarrollados con React y TypeScript, para administradores y operadores. |
| RC03 | API REST | La aplicación móvil y el panel web deben comunicarse con el backend mediante una API REST sobre HTTPS, utilizando JSON para el intercambio de información. |
| RC04 | Infraestructura en la nube | El MVP debe priorizar infraestructura de USD 0 dentro de cuotas gratuitas: panel estático en Vercel, API en Render y PostgreSQL en Neon; almacenamiento privado por validar. Debe admitir suspensión y recuperación, sin prometer alta disponibilidad. AWS queda como alternativa futura. |
| RC05 | Validación humana | La categoría y prioridad se revisan por un operador. Las reglas automáticas no validan definitivamente incidentes ni ordenan actuaciones institucionales; toda corrección conserva trazabilidad. |
| RC06 | Integración institucional | Las instituciones participan mediante sus operadores en AyniSafe. No se depende de conexiones con sus centrales o plataformas oficiales sin convenios e interfaces autorizadas; una notificación interna no equivale a despacho institucional. |
| RC07 | Control de versiones | El código fuente, los archivos de configuración no sensibles y la documentación técnica del proyecto deben mantenerse bajo control de versiones mediante Git y un repositorio remoto en GitHub. |
| RC08 | Roles e instituciones | Solo existen ciudadano, administrador y operador. Las instituciones y sedes delimitan acceso y competencias sin introducir roles adicionales. |
| RC09 | Territorio | El piloto incluye Ayacucho, San Juan Bautista, Carmen Alto, Jesús Nazareno y Andrés Avelino Cáceres Dorregaray; UBIGEO, polígonos y cobertura de sedes requieren verificación/versionado. |
| RC10 | iPhone | Flutter debe permitir una versión iOS; su compilación, pruebas y publicación se validan y presupuestan por separado del hosting gratuito. |

Detalle: [alcance territorial e institucional](09-alcance-territorial-e-institucional.md).
