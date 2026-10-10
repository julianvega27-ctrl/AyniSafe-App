
# 06. Drivers arquitectónicos

| ID | Driver arquitectónico | Origen | ¿Por qué influye en la arquitectura? |
|---|---|---|---|
| DA01 | El sistema debe soportar un incremento importante de usuarios, consultas de incidentes y reportes simultáneos. | AC03 – Escalabilidad | Puede influir en la estrategia de escalamiento horizontal, el despliegue de servicios y el uso de mecanismos de caché. |
| DA02 | El sistema debe mantener tiempos de respuesta adecuados durante el registro de incidentes y la consulta de alertas, incluso en condiciones de alta concurrencia. | AC01 – Rendimiento; AC02 – Procesamiento asíncrono | Puede influir en la separación de operaciones críticas, el procesamiento asíncrono y la comunicación entre componentes. |
| DA03 | El sistema debe proteger los datos personales, las ubicaciones y las evidencias proporcionadas por los ciudadanos. | AC04 – Seguridad | Condiciona los mecanismos de autenticación, autorización, almacenamiento seguro y control de acceso a la información. |
| DA04 | El sistema debe utilizar una API REST para la comunicación entre la aplicación móvil, el panel web y el backend. | RC03 – API REST | Condiciona la separación entre las interfaces de presentación y la lógica de negocio, así como la definición de los servicios y contratos de comunicación. |
| DA05 | El sistema debe mantener la continuidad de sus funciones principales y permitir la recuperación de operaciones pendientes ante fallos. | AC05 – Disponibilidad; AC07 – Recuperación y observabilidad | Puede influir en el balanceo de carga, el monitoreo, la gestión de errores y los mecanismos de reintento y recuperación. |
| DA06 | El sistema debe permitir modificar y ampliar sus funcionalidades sin afectar innecesariamente otros módulos. | AC06 – Mantenibilidad | Influye en la separación de responsabilidades, la modularidad y la dirección de las dependencias internas. |
