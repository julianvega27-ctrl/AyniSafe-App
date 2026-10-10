
# 05. Restricciones

| ID | Restricción | Descripción |
|---|---|---|
| RC01 | Aplicación móvil | El sistema debe contar con una aplicación móvil como interfaz principal para los ciudadanos, desarrollada con React Native, Expo y TypeScript, con prioridad inicial para dispositivos Android. |
| RC02 | Panel web de operadores | El sistema debe contar con un panel web complementario, desarrollado con React y TypeScript, para la gestión de incidentes por parte de operadores y administradores autorizados. |
| RC03 | API REST | La aplicación móvil y el panel web deben comunicarse con el backend mediante una API REST sobre HTTPS, utilizando JSON para el intercambio de información. |
| RC04 | Infraestructura en la nube | El sistema debe contemplar su despliegue en Amazon Web Services (AWS), utilizando servicios de infraestructura que permitan alojar el backend, almacenar los datos y supervisar su funcionamiento. |
| RC05 | Validación humana | Las sugerencias generadas por inteligencia artificial deben estar sujetas a revisión humana. El sistema no debe validar definitivamente los incidentes ni ordenar actuaciones institucionales de forma autónoma. |
| RC06 | Integración institucional | El sistema no debe depender de conexiones directas con plataformas de la Policía Nacional del Perú o Serenazgo mientras no existan convenios, autorizaciones e interfaces de integración disponibles. |
| RC07 | Control de versiones | El código fuente, los archivos de configuración no sensibles y la documentación técnica del proyecto deben mantenerse bajo control de versiones mediante Git y un repositorio remoto en GitHub. |


