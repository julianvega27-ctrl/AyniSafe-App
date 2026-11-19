# 01. Actores del sistema

## Personas y roles

Existen exactamente tres roles. «Personal autorizado» designa al operador. Las instituciones y sedes delimitan competencias y acceso; no son roles adicionales.

| Rol | Necesidad y responsabilidades | Alta |
|---|---|---|
| Ciudadano | Reportar desde Flutter, seguir sus reportes, consultar mapa por distrito/categoría, alertas, contactos de emergencia, perfil e información de la app y desarrolladores. | Autorregistro ciudadano. |
| Administrador | Crear instituciones y sedes; al crear una sede crear su operador inicial; gestionar operadores, cobertura distrital, competencias, reglas, contactos y contenido; recibir avisos de su ámbito de supervisión. | Aprovisionamiento inicial controlado, sin registro público. |
| Operador | Personal autorizado de una sede: revisar y atender reportes según categoría, institución y ámbito territorial; registrar decisiones y actuaciones; recibir avisos en el panel. | Creación por administrador, asociada a institución y sede. |

La portada informativa web es accesible sin sesión. Su visitante no constituye un cuarto rol. El inicio de sesión del panel se ofrece a administradores y operadores; la autenticación no modifica los permisos definidos para cada rol.

## Dependencias y capacidades

| Elemento | Responsabilidad |
|---|---|
| Ubicación del dispositivo | Proporcionar coordenadas con permiso; no requiere contratar cartografía. |
| Proveedor cartográfico | Suministrar mapa base; los polígonos distritales del piloto pertenecen al catálogo de AyniSafe. |
| Servicio push (FCM; APNs para iOS) | Entregar avisos móviles; la bandeja del panel se consulta desde la API. |
| Almacenamiento de evidencias | Conservar archivos restringidos según la política de acceso. |

El catálogo institucional del alcance actual incluye exclusivamente **PNP, Bomberos, SAMU y Serenazgo**. El administrador crea y mantiene sus registros y sedes, sin habilitar otros tipos de institución. Sus operadores utilizan AyniSafe; no se presupone integración con las centrales institucionales ni participación real por crear un registro.

Detalle normativo del producto: [alcance territorial e institucional](09-alcance-territorial-e-institucional.md).
