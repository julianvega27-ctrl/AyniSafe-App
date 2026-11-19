
# 06. Drivers arquitectónicos

| ID | Driver arquitectónico | Origen | ¿Por qué influye en la arquitectura? |
|---|---|---|---|
| DA01 | El sistema debe soportar un incremento importante de usuarios, consultas de incidentes y reportes simultáneos. | AC01 – Escalabilidad | Puede influir en la estrategia de escalamiento horizontal, el despliegue de servicios y el uso de mecanismos de caché. |
| DA02 | El sistema debe mantener tiempos de respuesta adecuados durante el registro de incidentes y la consulta de alertas, incluso en condiciones de alta concurrencia. | AC02 – Rendimiento | Puede influir en la separación de operaciones críticas, el procesamiento asíncrono y la comunicación entre componentes. |
| DA03 | El sistema debe proteger los datos personales, las ubicaciones y las evidencias proporcionadas por los ciudadanos. | AC04 – Seguridad | Condiciona los mecanismos de autenticación, autorización, almacenamiento seguro y control de acceso a la información. |
| DA04 | El sistema debe utilizar una API REST para la comunicación entre la aplicación móvil, el panel web y el backend. | RC03 – API REST | Condiciona la separación entre las interfaces de presentación y la lógica de negocio, así como la definición de los servicios y contratos de comunicación. |
| DA05 | El MVP debe conservar datos confirmados y recuperar operaciones pendientes al reiniciar; la continuidad mediante réplicas corresponde a evolución. | AC03 – Disponibilidad; AC07 – Recuperación y observabilidad | Exige monitoreo, reintentos y recuperación; balanceo y réplicas quedan fuera del MVP. |
| DA06 | El sistema debe permitir modificar y ampliar sus funcionalidades sin afectar innecesariamente otros módulos. | AC06 – Mantenibilidad | Influye en la separación de responsabilidades, la modularidad y la dirección de las dependencias internas. |
| DA07 | Enrutar por categoría, condiciones y distrito a una institución principal y entidades de apoyo, conservando permisos por sede y avisos por usuario. | RF28–RF35, RF39–RF40; AC04–AC05; RF41–RF44 | Exige catálogo territorial, reglas versionadas, participación multiinstitucional, autorización por ámbito y outbox recuperable. |
| DA08 | Ofrecer app Flutter Android/iOS y web pública/protegida sobre una API compartida, con presupuesto gratuito para el MVP. | RC01–RC04, RC10; RF36–RF38 | Mantiene contratos independientes del cliente y separa compatibilidad móvil de costes de distribución. |
